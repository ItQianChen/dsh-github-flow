/**
 * PR 行级评注写入：payload 构造、校验与 422 降级（纯函数）。
 *
 * 为什么单独一个模块：
 * 1. `gh pr review` 没有行级参数（`gh pr review --help` 里 line/side/path 零命中），
 *    只能走 `POST /repos/{owner}/{repo}/pulls/{n}/reviews` 的 `comments[]`；
 * 2. 「哪些错误可以在发请求前拦住」「422 怎么降级」是纯逻辑，必须能脱离网络单测；
 * 3. executor 只负责发请求，校验与降级策略放在这里，避免 executor 继续膨胀。
 *
 * 严格按 REST 文档字段构造请求体，未自造任何键。
 */

import { normalizeSeverity } from '../review-rules.js';

/** 单次 review 的行级评注上限。超过就拆多次，一次一个请求 = 通知只发一轮 */
export const MAX_REVIEW_COMMENTS = 50;

export type PrReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';

/** 调用方传入的单条行级评注（宽松类型，校验后才是 REST 形状） */
export interface PrReviewCommentInput {
  path?: unknown;
  line?: unknown;
  side?: unknown;
  start_line?: unknown;
  start_side?: unknown;
  body?: unknown;
}

/** REST 形状的单条评注（全部字段已归一化） */
export interface PrReviewCommentPayload {
  path: string;
  line?: number;
  side?: 'LEFT' | 'RIGHT';
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
  /**
   * `file` = 文件级评论（不挂行），`line` = 行级评论。
   *
   * 为什么需要它：REST 的 `comments[]` 里 `line` 是**实际必填**的（缺了就 422），
   * 想只评论某个文件必须显式声明 `subject_type: 'file'`。不写这个字段时，
   * 「只给 path 不给 line」会被 GitHub 判为非法行级评论——那正是「明明参数合法却 422」的成因。
   */
  subject_type?: 'file' | 'line';
  body: string;
}

/** REST 形状的 review 请求体 */
export interface PrReviewPayload {
  commit_id?: string;
  event: PrReviewEvent;
  body?: string;
  comments?: PrReviewCommentPayload[];
}

export interface BuildResult {
  ok: boolean;
  payload?: PrReviewPayload;
  /** 校验失败时的**全部**问题（一次说完，不要让调用方改一条试一次） */
  errors?: string[];
}

/** `createPrReview` 的返回形状 */
export interface PrReviewResult {
  ok: boolean;
  error?: string;
  /** 是否走了 422 降级（行级评注被折叠进正文） */
  degraded?: boolean;
  /** 降级原因，供渲染层用 appendDegradedNote 显式呈现 */
  degradedReason?: string;
  data?: any;
}

function toPositiveInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * 归一化单条评注。
 *
 * 归一化而非报错的项：`side` 非法 → 回落到 `RIGHT`（新代码侧是最常见意图，
 * 且报错会让一次批量 review 因为一个拼写错误整体失败）。
 * 必须报错的项：缺 `path` / 缺 `body` / `line` 给了但不是正整数——
 * 这三类在 REST 侧必然 422，提前拦住比事后降级更诚实。
 */
function normalizeComment(raw: PrReviewCommentInput, index: number): { ok: true; value: PrReviewCommentPayload } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const at = `comments[${index}]`;
  const p = typeof raw?.path === 'string' ? raw.path.trim() : '';
  if (!p) errors.push(`${at}.path 必填（文件相对路径）`);
  const body = typeof raw?.body === 'string' ? raw.body.trim() : '';
  if (!body) errors.push(`${at}.body 必填（评注正文不能为空）`);

  let line: number | undefined;
  if (raw?.line !== undefined && raw?.line !== null) {
    const n = toPositiveInt(raw.line);
    if (n === null) errors.push(`${at}.line 必须是正整数（当前 ${JSON.stringify(raw.line)}）`);
    else line = n;
  }

  let startLine: number | undefined;
  if (raw?.start_line !== undefined && raw?.start_line !== null) {
    const n = toPositiveInt(raw.start_line);
    if (n === null) errors.push(`${at}.start_line 必须是正整数（当前 ${JSON.stringify(raw.start_line)}）`);
    else startLine = n;
  }
  if (line !== undefined && startLine !== undefined && startLine > line) {
    errors.push(`${at}.start_line(${startLine}) 不能大于 line(${line})`);
  }

  const sideRaw = typeof raw?.side === 'string' ? raw.side.toUpperCase() : '';
  const side: 'LEFT' | 'RIGHT' = sideRaw === 'LEFT' ? 'LEFT' : 'RIGHT';
  const startSideRaw = typeof raw?.start_side === 'string' ? raw.start_side.toUpperCase() : '';
  const startSide: 'LEFT' | 'RIGHT' | undefined =
    startLine === undefined ? undefined : startSideRaw === 'LEFT' ? 'LEFT' : 'RIGHT';

  if (errors.length > 0) return { ok: false, errors };
  /*
   * 没有 line → 文件级评论（`subject_type: 'file'`）。
   *
   * 为什么必须显式声明而不是留空：REST 的 `comments[]` 里 `line` 实际是必填的，
   * 只给 `path` 会被判为「非法行级评论」直接 422。声明成 file 级之后，
   * 「只想对某个文件留一句」成了合法输入，也不必再走一次注定失败的请求。
   */
  if (line === undefined) {
    return { ok: true, value: { path: p, subject_type: 'file', body: normalizeSeverity(body) } };
  }
  return {
    ok: true,
    value: {
      path: p,
      line,
      side,
      ...(startLine !== undefined ? { start_line: startLine, start_side: startSide } : {}),
      // 严重度前缀在此统一补齐：只补不删，[P0]/[P1] 原样保留
      body: normalizeSeverity(body),
    },
  };
}

/**
 * 构造 REST review 请求体。
 *
 * @param input.event    review 判定，缺省 COMMENT
 * @param input.body     整体说明
 * @param input.comments 行级评注（空数组等价于不传 → 调用方应走原 gh pr review 路径）
 * @param input.commit_id 可选锚点 SHA
 */
export function buildPrReviewPayload(input: {
  event?: unknown;
  body?: unknown;
  comments?: unknown;
  commit_id?: unknown;
}): BuildResult {
  const errors: string[] = [];

  const rawEvent = typeof input?.event === 'string' ? input.event.toUpperCase() : '';
  const event: PrReviewEvent =
    rawEvent === 'APPROVE' || rawEvent === 'REQUEST_CHANGES' || rawEvent === 'COMMENT' ? (rawEvent as PrReviewEvent) : 'COMMENT';
  if (rawEvent && rawEvent !== event) {
    errors.push(`event 只能是 COMMENT / APPROVE / REQUEST_CHANGES（当前 ${JSON.stringify(input.event)}）`);
  }

  const list = Array.isArray(input?.comments) ? input.comments : [];
  if (list.length > MAX_REVIEW_COMMENTS) {
    errors.push(`单次最多 ${MAX_REVIEW_COMMENTS} 条行级评注（当前 ${list.length} 条），请拆分多次提交`);
  }

  const comments: PrReviewCommentPayload[] = [];
  for (let i = 0; i < list.length; i++) {
    const r = normalizeComment(list[i] as PrReviewCommentInput, i);
    if (r.ok) comments.push(r.value);
    else errors.push(...r.errors);
  }

  const summary = typeof input?.body === 'string' ? input.body.trim() : '';
  /*
   * 整体说明只在「提意见」时补严重度前缀，APPROVE 不补。
   *
   * 为什么：`[P2] LGTM` 是把优先级标签套在一句同意上，语义上说不通——严重度
   * 是给**问题**定级的，不是给结论定级的。行级评注则一律补（每条都是一条意见）。
   */
  const bodyText = summary
    ? event === 'APPROVE'
      ? summary
      : normalizeSeverity(summary)
    : comments.length > 0
      ? `[P2] 共 ${comments.length} 条行级评注`
      : '';
  if (!bodyText && event !== 'APPROVE') {
    errors.push('body 必填：REQUEST_CHANGES / COMMENT 需要一段整体说明');
  }

  const commitId = typeof input?.commit_id === 'string' ? input.commit_id.trim() : '';
  if (commitId && !/^[0-9a-f]{7,40}$/i.test(commitId)) {
    errors.push(`commit_id 必须是 7–40 位十六进制 SHA（当前 ${JSON.stringify(input.commit_id)}）`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const payload: PrReviewPayload = {
    event,
    ...(commitId ? { commit_id: commitId } : {}),
    ...(bodyText ? { body: bodyText } : {}),
    ...(comments.length > 0 ? { comments } : {}),
  };
  return { ok: true, payload };
}

/**
 * 422 降级：把行级评注折叠进 review 正文。
 *
 * 为什么必须降级而不是直接失败：422 的典型原因是「该行不在 diff 的 RIGHT 侧」
 * （纯删除行、未变更的上下文行）。内容本身是对的，只是挂不到那一行上——
 * 丢掉它等于让 Agent 白干一轮，而把内容塞进正文至少保证意见送达。
 *
 * 每条降级项都带 `path:line` 前缀，人能在正文里定位；调用方另需回传
 * `degraded: true` + `degradedReason`，让「这是降级结果」显式可见。
 */
export function foldCommentsIntoBody(comments: PrReviewCommentPayload[], baseBody?: string): string {
  const head = typeof baseBody === 'string' ? baseBody.trim() : '';
  const parts: string[] = [];
  if (head) parts.push(head);
  parts.push('---');
  parts.push('> ⚠️ 以下评注无法挂到具体代码行（该行不在 diff 的可评论侧），已内联到正文。');
  for (const c of comments) {
    const where = c.line ? `${c.path}:${c.line}` : c.path;
    parts.push(`#### \`${where}\`\n\n${c.body}`);
  }
  return parts.join('\n\n');
}

/**
 * 判定失败是否属于「行级评注被拒绝」这一类（值得降级重试）。
 *
 * 判据来自 gh 实测 stderr：REST 422 会以 `HTTP 422` 或 `Validation Failed` 出现；
 * 403/404/网络错误**不在**此列——那些降级也没用，必须原样抛给调用方。
 */
export function isLineCommentRejected(errorText: string): boolean {
  const t = typeof errorText === 'string' ? errorText : '';
  if (!t) return false;
  return /HTTP 422|Validation Failed|Unprocessable Entity/i.test(t);
}
