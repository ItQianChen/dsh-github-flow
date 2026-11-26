/**
 * 操作记录（审计）层。
 *
 * 为什么需要：`confirm: true` 是**模型自己填的参数**，`AWAITING_CONFIRMATION` 只被遥测
 * 记成一个内存布尔（`src/telemetry.ts`，环形队列 200 条，进程一退就没了）。于是
 * 「Agent 到底对我的 PR 做了什么」在本机没有任何可查的事实源。本模块补上这一层：
 * 每次 `github_*` 工具调用结束，落一条可筛、可删、可折叠的事件流。
 *
 * 三条设计约束（改本文件前先读）：
 * 1. **Fail-Open 是硬要求**：记录失败绝不允许影响工具结果。构造失败（目录不可写、
 *    JSONL 损坏）一律降级为 no-op 而不是抛错——Cordis 里 `apply()` 抛错会让 Fiber
 *    进 FAILED，代价是 19 个工具全部消失，一个观测功能没资格带走主功能。
 * 2. **append-only + 墓碑**：追加写保证并发不丢记录；用户点「删除」时先追加墓碑
 *    （崩溃也能正确读回），再整体压实（真删磁盘字节）。只追加不压实 = 用户以为删了
 *    其实还在，那是隐私问题不是性能问题。
 * 3. **分类真源分别是 tool-tiers 与 destructive，不在这里另造第二张表**。
 *    历史上「两张表说两件事」是本仓库最贵的漂移源（见 `src/tool-tiers.ts` 头注释）。
 *
 * 事件流形态（一行一个事件，读取时按 id 折叠）：
 *   intent   决定动手（写操作）
 *   decision 人工审核结论（s2 引入；s1 不产生）
 *   result   工具实际结果（ok / fail）
 *   delete   墓碑（被删 id 列表）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WRITE_ACTIONS } from './tool-tiers.js';
import { DESTRUCTIVE_ACTIONS } from './destructive.js';
import { takeTargetTitle } from './target-title.js';

/** 风险分级：读 / 写 / 高危（= 命中 `DESTRUCTIVE_ACTIONS` 闸门表） */
export type AuditRisk = 'read' | 'write' | 'destructive';

/**
 * 决策来源。
 * `auto`：没有人工介入（s1 全部是它）；其余由 s2 的人工审核写入，词汇与宿主
 * `ApprovalOutcome` 一一对应（allowed-once→approved / rejected→rejected /
 * cancelled→cancelled / unavailable→no-client），不发明第三套。
 */
export type AuditDecision =
  | 'auto'
  | 'confirmed'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'no-client'
  | 'cancelled';

/** 一次操作的身份与摘要（落在 `intent` 行上） */
export interface OperationMeta {
  tool: string;
  action: string;
  write: boolean;
  risk: AuditRisk;
  summary: string;
  repo?: string;
  target?: string;
  sessionId?: string;
  callId?: string;
  /**
   * 触发该操作的工作区绝对路径。
   *
   * 为什么记它而不是只记 repo：`repo` 只能回答"哪个仓库"，回答不了"哪个工作区"——
   * 同一仓库的多个 worktree / 多份 clone 会被混成一片。右栏要显示"**该工作区**的记录"
   * 就必须有路径这一维（且路径是本地事实，不含任何仓库内容）。
   */
  cwd?: string;
  /**
   * 本次调用的参数快照（JSON 字符串，超长已截断）。
   *
   * 为什么必须落地存：详情页不能只靠"去 GitHub 拉"。**被拒绝的操作在远端根本不存在**
   * （`pr create` 被拒时连 PR 都没有），而失败/待审的操作也不该去远端找内容；
   * 何况远端会腐烂——PR 删除、仓库改名转移、账号换过权限。
   * 记录必须自包含：哪怕断网、哪怕仓库没了，也要能回答"当时到底提交了什么"。
   */
  args?: string;
  /** 参数快照超过上限被截断（UI 要明确提示，不能让人以为原文就这么短） */
  argsTruncated?: boolean;
  /** 具体哪些字段被裁过（如 `['body']`）；空/缺省表示没裁 */
  fieldsTruncated?: string[];
  /**
   * 被**操作**的那个 PR / Issue 的标题（按编号操作既有实体时才有；`create` 没有它）。
   *
   * 为什么单独存一列而不是拼进 `summary`：记录的 `summary` 是"动作"的人话
   * （`合并 PR #19`），标题是"对象"。分开存才能：① 列表保持简短、详情里展示完整对象；
   * ② 目标将来被删/改名后，这条记录仍能说出"当时合的是哪一个"。
   * 来源是审核阶段那一次 gh 读取（`target-title.ts` 的暂存表），不在记录阶段再打一次 gh。
   */
  targetTitle?: string;
}

/** 折叠后交给 UI / 路由的一条记录 */
export interface AuditEntry extends OperationMeta {
  id: string;
  at: number;
  decision: AuditDecision;
  feedback?: string;
  /** 结论落盘时刻（decision 行的 `at`）。没有人工介入时缺省 */
  decisionAt?: number;
  /** 发起审核请求的时刻（decision 行的 `askedAt`）。用于算"等了多久" */
  askedAt?: number;
  /** `unknown` = 只有 intent 没有 result（进程崩溃 / 宿主杀轮次），如实呈现而不是假装成功 */
  result: 'ok' | 'fail' | 'unknown';
  errorType?: string;
  degraded?: boolean;
}

type IntentRow = { v: 1; kind: 'intent'; id: string; at: number } & OperationMeta;
/**
 * 决策行。
 *
 * `askedAt` = **发起审核请求的时刻**（`tools/pre-execute` 里取），`at` = 结论落盘时刻。
 * 为什么必须单独记：intent 行要等 `tools/result`（工具执行完）才写，而决策在
 * `pre-execute` 就产生了——拿两者相减得到的是负数，"等待多久"根本没数据源。
 */
type DecisionRow = {
  v: 1;
  kind: 'decision';
  id: string;
  at: number;
  decision: AuditDecision;
  feedback?: string;
  askedAt?: number;
};
type ResultRow = {
  v: 1;
  kind: 'result';
  id: string;
  at: number;
  ok: boolean;
  errorType?: string;
  degraded?: boolean;
};
type DeleteRow = { v: 1; kind: 'delete'; at: number; ids: string[] };
export type AuditRow = IntentRow | DecisionRow | ResultRow | DeleteRow;

/**
 * 保留预算：**字节为主闸门、行数作派生上限**，两者先到者触发淘汰（都是丢最早的）。
 *
 * 为什么以字节为主：装载与内存都随**字节**线性（实测 `apply()` 内装载 ≈ 4 ms/MB、
 * 常驻 heap ≈ 1.2 × 字节），行数只影响 `list()` 折叠（≈ 0.3 µs/行，2 万行 <5 ms）。
 * 于是字节既是用户能理解的单位（"给它 8 MB"），也恰好是真实成本单位。
 *
 * 为什么行数不能省：字节管得住磁盘，管不住"全是极短行"的病态（读记录 ≈150 B，
 * 64 MB 预算能攒到 45 万行 → 折叠退化到 130 ms）。因此按预算派生一个上限：
 * `clamp(预算/120B, 1 000, 200 000)`，8 MB 下算出 7 万行，而 8 MB 实际只装得下
 * 3.2 万行 —— 正常永不触发，它只是安全网。
 */
/**
 * 参数快照的字符预算。
 *
 * 定 4000 字符（≈12 KB 中文）：一段 PR / Issue 正文经常 1–3 KB，2000 就装不下；
 * 而 8 MB 预算下 4000 字符仍能存约 670 条满额记录，够用。
 * 超出就**按字段裁**并打 `argsTruncated` + `fieldsTruncated`——截断是显式的，不做静默省略。
 */
const MAX_SNAPSHOT_CHARS = 4000;

/** 单个长文本字段（正文 / 提示词 / notes）的上限：其余短字段几乎不占预算 */
const MAX_TEXT_FIELD_CHARS = 3000;

export interface SnapshotResult {
  text: string;
  truncated: boolean;
  /** 被裁过的字段名（UI 显式提示"哪个字段不全"，不含糊成一个"已截断"） */
  fields: string[];
}

/**
 * 把工具参数压成可落盘的一行快照。
 *
 * ⚠️ **必须产出合法 JSON**。第一版是 `JSON.stringify(args).slice(0, 2000)`：切在字符串
 * 中间 → `JSON.parse` 必然失败 → 详情页只能退化成一段被切碎的原文，标题/正文都读不出来。
 * 等于"存了但没用"。（2026-11-26 用户实证：「记录详情没把拒绝的内容保存下来」。）
 * 所以现在按**字段**裁：短字段原样，长文本字段先裁到 MAX_TEXT_FIELD_CHARS，
 * 整体仍超预算就从最长的字符串字段逐步回退，直到装下；输出始终走 `JSON.stringify`。
 */
function snapshotArgs(args: any): SnapshotResult {
  const empty: SnapshotResult = { text: '', truncated: false, fields: [] };
  if (args === undefined || args === null) return empty;
  if (typeof args !== 'object') return empty;

  const out: Record<string, unknown> = {};
  const cut: string[] = [];
  try {
    for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
      if (v === undefined || typeof v === 'function') continue; // JSON 本来也会丢
      if (typeof v === 'string' && v.length > MAX_TEXT_FIELD_CHARS) {
        out[k] = v.slice(0, MAX_TEXT_FIELD_CHARS);
        cut.push(k);
      } else {
        out[k] = v;
      }
    }
  } catch {
    return empty;
  }

  let text: string;
  try {
    text = JSON.stringify(out);
  } catch {
    return empty;
  }
  if (typeof text !== 'string' || text.length === 0) return empty;

  // 整体仍超预算：从最长的字符串字段开始回退（最多 8 轮，避免病态输入空转）
  for (let guard = 0; guard < 8 && text.length > MAX_SNAPSHOT_CHARS; guard++) {
    const key = longestStringKey(out);
    if (key === null) break;
    const overflow = text.length - MAX_SNAPSHOT_CHARS;
    const current = out[key] as string;
    const keep = Math.max(0, current.length - overflow - 16);
    out[key] = keep > 0 ? current.slice(0, keep) : '';
    if (!cut.includes(key)) cut.push(key);
    text = JSON.stringify(out);
  }

  // 极端兜底：仍然装不下（超多字段）时只保留短字段，输出依旧是合法 JSON
  if (text.length > MAX_SNAPSHOT_CHARS) {
    const minimal: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out)) {
      if (typeof v !== 'string' || v.length <= 64) minimal[k] = v;
    }
    try {
      text = JSON.stringify(minimal);
    } catch {
      return empty;
    }
  }

  return { text, truncated: cut.length > 0, fields: cut };
}

/** 值最长的字符串字段名（没有字符串字段时返回 null） */
function longestStringKey(obj: Record<string, unknown>): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string') continue;
    if (v.length > bestLen) {
      best = k;
      bestLen = v.length;
    }
  }
  return bestLen > 0 ? best : null;
}

/** body_file 通道的读取上限：超过这个大小就不读，只留路径（不让记录线程被大文件拖住） */
const MAX_FILE_BODY_BYTES = 1024 * 1024;

/**
 * 把 `body_file` 指向的正文读进快照。
 *
 * 为什么必须做：`body_file` 是"正文放在本地文件里"的通道，参数里只有路径。
 * 而**被拒绝的操作远端根本不存在**，工具也没读过那个文件——不补读的话，
 * 这条记录就永远说不出"用户当时到底要提交什么"，正是这个功能存在的理由。
 *
 * 约束（都是为了让记录绝不拖累主流程）：
 * - 只读本地路径：UNC（`\\\\server\\share`）直接跳过，避免网络挂住 `tools/result`
 * - 先 `statSync` 看大小，超过 1 MB 不读
 * - 任何异常都退回原参数（只留路径），不抛
 */
function withFileBody(args: any, cwd?: string): any {
  try {
    if (!args || typeof args !== 'object') return args;
    const raw = args.body_file;
    if (typeof raw !== 'string' || raw.trim() === '') return args;
    const shown = raw.trim();
    if (shown.startsWith('\\\\') || shown.startsWith('//')) return args;
    const abs = path.isAbsolute(shown) ? shown : path.resolve(cwd || process.cwd(), shown);
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > MAX_FILE_BODY_BYTES) return args;
    let body = fs.readFileSync(abs, 'utf8');
    if (body.charCodeAt(0) === 0xfeff) body = body.slice(1); // UTF-8 BOM
    if (body.length === 0) return args;
    // 保留 body_file 原值：详情页同时显示"来自哪个文件"与正文，自解释
    return { ...args, body, body_file: shown };
  } catch {
    return args;
  }
}

/** 默认保留预算：8 MB（s1b 定的产品口径；用户可在设置里改 1–64 MB） */
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

/** 极短行的下界（读操作一行 ≈150 B，取更保守的 120 B 作分母） */
const MIN_ROW_BYTES_ESTIMATE = 120;
const MIN_MAX_BYTES = 256 * 1024;
const MAX_MAX_BYTES = 64 * 1024 * 1024;
const MIN_MAX_ROWS = 1_000;
const MAX_MAX_ROWS = 200_000;

/** 由字节预算派生行数上限：只兜"极短行"病态，正常永不触发 */
export function deriveMaxRows(maxBytes: number): number {
  const raw = Math.floor(maxBytes / MIN_ROW_BYTES_ESTIMATE);
  return Math.min(MAX_MAX_ROWS, Math.max(MIN_MAX_ROWS, raw));
}

/** 预算 clamp：下限 256 KB、上限 64 MB。越界钳住而不是报错——配置值不值得让功能失效。 */
export function clampBudget(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return DEFAULT_MAX_BYTES;
  return Math.min(MAX_MAX_BYTES, Math.max(MIN_MAX_BYTES, Math.floor(bytes)));
}

/**
 * 记录与审核的**作用域**：只有 PR 与 Issue。
 *
 * 这是本功能的产品定义（总纲 §一：「Agent 每次写 PR / Issue，本地留一条」），
 * 不是实现取舍——`github_release delete`、`github_secret delete` 之类**不进操作记录、
 * 也不进审核弹窗**，它们本来就有自己的 `confirm: true` 闸门。
 *
 * 为什么用白名单常量而不是"排除法"：新增工具时默认**不进**记录，而不是默认进。
 * 记录面变宽是很容易无声发生的，而它一旦变宽，用户的"操作记录"里就会混进
 * 一堆他没预期的条目。
 */
export const AUDITED_TOOLS: readonly string[] = ['github_pr', 'github_issue'];

/** 该工具是否在记录/审核作用域内 */
export function isAuditedTool(tool: unknown): boolean {
  return typeof tool === 'string' && AUDITED_TOOLS.includes(tool);
}

/**
 * 该 (工具, action) 是否属于"会被审核的写 action"。
 *
 * 真源是 `WRITE_ACTIONS`（与只读档位、记录分类同一张表）。规则解析用它判断
 * "这条 action 规则写了会不会命中"——写在审核范围外或拼错的 action 永远不会触发，
 * 解析成功反而骗人。
 */
function isGatedWriteAction(tool: string, action: string): boolean {
  const spec = WRITE_ACTIONS[tool];
  return Array.isArray(spec) && spec.includes(action);
}

/**
 * 这一行是否已在**当前记录作用域之外**（早期版本遗留），装载时直接丢弃。
 *
 * 作用域有两条边，缺一不可：
 * 1. **工具边**：只有 `AUDITED_TOOLS`（PR / Issue）。首版记录过所有 `github_*` 调用。
 * 2. **读写边**：只有**写**操作。首版连读操作也落一行（自带身份），
 *    这类行工具名合法（`github_pr list`）却按产品定义不该存在。
 *
 * 判定刻意保守：**只有自带 `tool` 的行才可能被判越界**。`decision` / `delete` 行没有
 * 工具身份（靠 id 关联），写操作的 `result` 行也不带 `tool`——它们必须保留，否则
 * 折叠加墓碑会失效（尤其 decision 行丢了，就会出现"明明拒绝过、审核列却写着自动"）。
 */
function isOutOfScopeRow(row: any): boolean {
  if (!row || typeof row !== 'object') return false;
  const tool = (row as { tool?: unknown }).tool;
  if (tool === undefined) return false;
  if (!isAuditedTool(tool)) return true;
  // 工具在作用域内，但这一行是"读操作"（首版遗留）：`write` 明确不为 true 即判越界。
  // 现行写入路径只会写 `write: true` 的 intent，所以这条只对历史行生效。
  if ((row as { write?: unknown }).write !== true) return true;
  return false;
}

/** ---------------- 分类 ---------------- */

/**
 * 是否写操作：真源是 `WRITE_ACTIONS`（`src/tool-tiers.ts`），只读档位用的也是它。
 * `'*'`（`github_api`）视为写：端点与 method 都能任意，无法降级。
 */
export function classifyWrite(tool: string, action: string): boolean {
  const spec = WRITE_ACTIONS[tool];
  if (spec === undefined) return false;
  if (spec === '*') return true;
  return spec.includes(action);
}

/** 风险分级：命中闸门表即 destructive，否则按写/读 */
export function classifyRisk(tool: string, action: string): AuditRisk {
  const table = DESTRUCTIVE_ACTIONS[tool];
  if (table && Object.prototype.hasOwnProperty.call(table, action)) return 'destructive';
  return classifyWrite(tool, action) ? 'write' : 'read';
}

/** ---------------- 摘要 ---------------- */

const s = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());

/** 把编号渲染成 `#19`；缺失时给 `#?`——不猜，也不留空让人误以为是别的操作 */
function num(v: unknown): string {
  const t = s(v);
  return t ? `#${t}` : '#?';
}

const onOff = (v: unknown): string => (v === true ? '，删源分支' : '');

/**
 * PR / Issue 的人话摘要（本模块唯一手写文案的地方）。
 *
 * 为什么只给这两个工具手写：它们是「Agent 动了什么」的主战场（21 个写 action +
 * 最常用的读 action），其余 15 个工具走结构化兜底即可。兜底刻意保持机器可读
 * （`github_release.delete v0.7.1`），因为那些操作的语义差异不值得 40 行文案。
 */
const SUMMARY: Record<string, (a: any) => string> = {
  // ---- PR（15 action）----
  'github_pr:list': (a) => `列出 PR${a.state ? `（${s(a.state)}）` : ''}`,
  'github_pr:view': (a) => `查看 PR ${num(a.pr_number)}`,
  'github_pr:create': (a) => `创建 PR${a.title ? `「${clip(a.title, 40)}」` : ''}${a.base ? ` → ${s(a.base)}` : ''}`,
  'github_pr:diff': (a) => `读取 PR ${num(a.pr_number)} 的 Diff${a.stat_only ? '（仅统计）' : ''}`,
  'github_pr:checks': (a) => `查看 PR ${num(a.pr_number)} 的 CI Checks`,
  'github_pr:review': (a) => {
    const ws = s(a.review_decision);
    const writeMode = a.write === true || a.review_action === 'write';
    return writeMode ? `写回 PR ${num(a.pr_number)} 的评审${ws ? `（${ws}）` : ''}` : `生成 PR ${num(a.pr_number)} 的评审结论`;
  },
  'github_pr:merge': (a) => `合并 PR ${num(a.pr_number)}（${s(a.merge_method) || 'squash'}${onOff(a.delete_branch)}）`,
  'github_pr:checkout': (a) => `检出 PR ${num(a.pr_number)} 到本地${a.force === true ? '（force）' : ''}`,
  'github_pr:status': () => '查看当前分支的 PR 状态',
  'github_pr:view_images': (a) => `下载 PR ${num(a.pr_number)} 正文图片`,
  'github_pr:ready': (a) => `把 PR ${num(a.pr_number)} 标记为可评审${a.undo === true ? '（撤回草稿状态）' : ''}`,
  'github_pr:revert': (a) => `对 PR ${num(a.pr_number)} 创建反向提交`,
  'github_pr:update_branch': (a) => `用基准分支更新 PR ${num(a.pr_number)}`,
  'github_pr:comment': (a) => `在 PR ${num(a.pr_number)} 发表评论`,
  'github_pr:edit': (a) => `修改 PR ${num(a.pr_number)}`,

  // ---- Issue（16 action）----
  'github_issue:list': (a) => `列出 Issue${a.state ? `（${s(a.state)}）` : ''}`,
  'github_issue:view': (a) => `查看 Issue ${num(a.issue_number)}`,
  'github_issue:create': (a) => `创建 Issue${a.title ? `「${clip(a.title, 40)}」` : ''}`,
  'github_issue:comment': (a) => `在 Issue ${num(a.issue_number)} 发表评论`,
  'github_issue:close': (a) => `关闭 Issue ${num(a.issue_number)}${a.reason ? `（${s(a.reason)}）` : ''}`,
  'github_issue:reopen': (a) => `重开 Issue ${num(a.issue_number)}`,
  'github_issue:edit': (a) => `修改 Issue ${num(a.issue_number)}`,
  'github_issue:develop': (a) => `为 Issue ${num(a.issue_number)} 创建并检出开发分支`,
  'github_issue:view_images': (a) => `下载 Issue ${num(a.issue_number)} 正文图片`,
  'github_issue:delete': (a) => `**物理删除** Issue ${num(a.issue_number)}`,
  'github_issue:transfer': (a) => `迁移 Issue ${num(a.issue_number)} → ${s(a.target_repo) || '?'}`,
  'github_issue:pin': (a) => `置顶 Issue ${num(a.issue_number)}`,
  'github_issue:unpin': (a) => `取消置顶 Issue ${num(a.issue_number)}`,
  'github_issue:lock': (a) => `锁定 Issue ${num(a.issue_number)} 的讨论`,
  'github_issue:unlock': (a) => `解锁 Issue ${num(a.issue_number)} 的讨论`,
  'github_issue:status': () => '查看跨仓 Issue 待办',
};

function clip(v: unknown, max: number): string {
  const t = s(v).replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * 工作区路径归一：分隔符统一为 `/`、去掉尾斜杠；Windows 下再按大小写不敏感比较。
 *
 * 为什么要归一而不是直接字符串相等：同一个工作区可能以 `D:\repo`、`D:/repo`、
 * `D:/repo/` 三种形态出现（客户端来自 props、记录来自 gh 调用时的 cwd）；
 * 不归一就会出现「右栏明明是这个仓库，却一条记录都查不到」——最难解释的一类空列表。
 * 为什么不在 Linux 上也折大小写：那里两个只差大小写的目录是两个真实存在的工作区。
 */
function normalizeCwd(v: unknown): string {
  const raw = s(v);
  if (!raw) return '';
  const out = raw.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? out.toLowerCase() : out;
}

/** 定位标识：按工具语义挑第一个有值的字段，全部缺失时返回 undefined（不猜） */
const TARGET_KEYS = [
  'pr_number', 'issue_number', 'discussion_number', 'number', 'run_id', 'tag',
  'gist_id', 'cache_id', 'key', 'codespace', 'item_id', 'skill_name', 'workflow', 'name',
];

export function pickTarget(args: any): string | undefined {
  if (!args || typeof args !== 'object') return undefined;
  for (const k of TARGET_KEYS) {
    const t = s(args[k]);
    if (t) return k === 'pr_number' || k === 'issue_number' || k === 'discussion_number' ? `#${t}` : t;
  }
  return undefined;
}

/** 人话摘要：PR / Issue 走细表，其余工具给机器可读兜底（永不抛错） */
export function summarizeOperation(tool: string, action: string, args: any): string {
  try {
    const fn = SUMMARY[`${tool}:${action}`];
    if (fn) return fn(args || {});
    // `github_api` 没有 action 维度（端点与 method 都是自由参数），单独给一条可读形态，
    // 否则摘要会退化成 "github_api." ——末尾一个孤零零的点，什么都说明不了。
    if (tool === 'github_api') {
      const method = s(args?.method) || 'GET';
      const endpoint = clip(args?.endpoint, 60) || '?';
      return `github_api ${method} ${endpoint}`;
    }
    const target = pickTarget(args);
    if (!action) return target ? `${tool} ${target}` : tool;
    return `${tool}.${action}${target ? ' ' + target : ''}`;
  } catch {
    return `${tool}.${action || '?'}`;
  }
}

/** ---------------- 结果提取 ---------------- */

export interface OutcomeShape {
  ok: boolean;
  errorType?: string;
  /** 工具原始载荷里的 `status`（AWAITING_CONFIRMATION / SCOPE_REQUIRED / REJECTED_BY_USER …） */
  status?: string;
  degraded?: boolean;
}

/**
 * 从 `tools/result` 的第二参里取结果事实，**同时兼容两种形状**。
 *
 * 为什么必须双形状：
 * - 运行时（宿主 `pipeline.ts:381-425`）传的是**归一化后的** `ToolExecutionResult`
 *   `{ isError, content, value, meta }`——工具原始返回值在 `value` 里。直接读
 *   `result.status` 恒为 undefined，这是本仓库遥测长期读错层级的同款坑。
 * - 单元测试（`test/phase20`）直接拿**原始载荷**调 `recordCall`。写死一级会让既有
 *   断言静默失效，所以这里两种都认。
 */
export function extractOutcome(result: any): OutcomeShape {
  const isWrapped = Boolean(result) && typeof result === 'object' && 'isError' in (result as any);
  const payload = isWrapped ? (result as any).value : result;
  const isError = isWrapped ? (result as any).isError === true : false;
  const errInfo = isWrapped ? (result as any).error?.info : undefined;
  const errMsg = isWrapped ? (result as any).error?.message : undefined;

  const okFlag = payload && typeof payload === 'object' ? (payload as any).ok : undefined;
  const failed = isError || okFlag === false || (payload && typeof payload === 'object' && (payload as any).success === false);

  const status = payload && typeof payload === 'object' && typeof (payload as any).status === 'string'
    ? (payload as any).status
    : undefined;
  const degraded = payload && typeof payload === 'object' && (payload as any).degraded === true;

  let errorType: string | undefined;
  if (failed) {
    errorType =
      s(errInfo?.code) ||
      s((payload as any)?.error) ||
      s(errMsg) ||
      'UNKNOWN_ERROR';
    // 裁到 60 字符是为了不让一行记录被整段 gh 报错撑长；但**必须带省略号**，
    // 否则 `GraphQL: Could not resolve to an issue or pull request with` 看起来像
    // 一句完整的话（结尾那个 "with" 会误导）。
    errorType = errorType.length > 60 ? errorType.slice(0, 59) + '…' : errorType;
  }
  return { ok: !failed, errorType, status, degraded };
}

/**
 * 解析该次调用对应的仓库与工作区（同步、不 spawn `gh`）。
 *
 * 为什么不能用 `getRepoMetadata()`：它会在必要时 spawn `gh repo view`，而本函数位于
 * `tools/result` 的**热路径**上——每次工具调用都多 300ms 是不可接受的。
 * 为什么必须先 `resolveExecScope`：宿主的 `exec.agent` 只有 `{ id }`，既没有 cwd 也没有
 * sessionId（`src/executor.ts:329-334` 记录了这次踩坑），自己拼 sessionId 在桌面端永远落空。
 */
export function resolveScopeFromExec(executor: any, exec: any, args: any): { repo?: string; cwd?: string } {
  try {
    const explicit = s(args?.repo);
    const scope = executor?.resolveExecScope?.(exec);
    const cwd = s(scope?.cwd) || undefined;
    // 只有形如 owner/name 的显式值才算数：`repo: "foo"` 这种脏值不该被当成仓库全名写进记录
    if (explicit.includes('/')) return { repo: explicit, cwd };
    if (!cwd) return {};
    const meta = executor?.getRepoIdentityFromLocal?.(cwd);
    const repo = s(meta?.nameWithOwner) || undefined;
    return repo ? { repo, cwd } : { cwd };
  } catch {
    return {};
  }
}

/** 只取仓库名（保留本入口：多处调用方只关心 repo，不想解构） */
export function resolveRepoFromExec(executor: any, exec: any, args: any): string | undefined {
  return resolveScopeFromExec(executor, exec, args).repo;
}

/** `~/.dsh/data/dsh-github-flow`（与 proxy.json / update-settings.json 同目录树） */
export function auditDataDir(): string {
  const home = process.env.DSH_HOME ? process.env.DSH_HOME : path.join(os.homedir(), '.dsh');
  return path.join(home, 'data', 'dsh-github-flow');
}

/** ---------------- 设置（开关 + 预算）---------------- */

/**
 * 操作记录的运行期设置。落在 `audit-settings.json`，与 `proxy.json` / `update-settings.json`
 * 同范式：**文件（UI 改的）优先于 cordis 静态配置**，因为 UI 是用户最后表达意图的地方。
 */
export interface AuditSettings {
  enabled: boolean;
  budgetBytes: number;
  /**
   * 审核档位也在这个文件里：`audit-settings.json` 是**本插件的本地设置文件**，
   * 而"记录开关 / 保留预算 / 审核档位"在设置页是同一屏的三个控件。
   * 拆成两个文件只会让"改一处忘另一处"变成必然而不是意外。
   */
  approvalMode: 'off' | 'destructive' | 'all-writes';
  /**
   * 按仓库 / 按 action 覆盖档位的规则（s3）。**存原始字符串**而不是解析后的结构：
   * 用户写错的那一条必须能原样回显（"解析出 2 条，忽略 1 条：xxx"），
   * 解析结构存进文件就再也说不出"你写的那行到底哪错了"。
   */
  approvalRules: string[];
  /** `file` = 用户曾在 UI 里改过；`default` = 文件不存在或损坏。决定它与静态配置的优先级 */
  source: 'file' | 'default';
}

/** 审核档位合法值（存档前校验；非法值一律回落默认） */
export const APPROVAL_MODES = ['off', 'destructive', 'all-writes'] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

function normalizeApprovalMode(v: unknown): ApprovalMode {
  return v === 'off' || v === 'destructive' || v === 'all-writes' ? v : 'destructive';
}

/* ---------------- 审核策略规则（s3）---------------- */

/**
 * 一条解析成功的规则。
 *
 * 语义是「**这些维度全部相等** → 用这个档位」，即多条维度之间是 AND；
 * 规则与规则之间是**首条匹配即返回**（不是取最严格）。
 *
 * 选首条匹配而不是最严格的理由：用户写下两条相反规则时，最严格会让"我想放行"
 * 永远失效且无法解释；首条匹配至少可预测、可排序、可文档化。
 */
interface ApprovalRule {
  /** 原样保留，用于回显"第几条" */
  raw: string;
  tool?: string;
  /** action 名（不含工具前缀） */
  action?: string;
  /**
   * action 值里自带的工具前缀。
   *
   * 为什么需要单独一列：`action:github_issue:comment` 的值里既有工具又有 action，
   * 而规则里还有独立的 `tool:` 维度。两者必须能区分——否则 `action:comment`
   * 与 `action:github_issue:comment` 就变成同一个东西，前者的"跨工具"语义丢失。
   */
  actionTool?: string;
  repo?: string;
  mode: ApprovalMode;
}

/** 规则可用的维度。未知维度整条忽略（不猜它想干什么） */
const RULE_DIMENSIONS = new Set(['repo', 'action', 'tool']);

/** 规则解析结果：`ignored` 里带原文与原因，设置页据此回显（不静默） */
export interface ParsedRules {
  rules: ApprovalRule[];
  ignored: Array<{ raw: string; reason: string }>;
}

/**
 * 解析规则数组。
 *
 * 语法：`<维度>:<值>=<mode>`，多维用 `|` 连接（AND）。
 * 例：`repo:ItQianChen/dsh-github-flow=off`、`action:github_issue:comment=off`、
 * `repo:acme/prod|action:github_pr:merge=off`。
 *
 * `action` 的两种写法都认：
 * - `action:github_issue:comment` — 精确到"哪个工具的哪个 action"
 * - `action:comment` — 只写 action 名，作用于**所有**有该 action 的工具
 *
 * 为什么两种都认而不是只留精确形态：只留精确形态时，用户写 `action:comment`
 * 会**静默永不命中**——那是本功能最坏的失效形态（配了规则、以为生效、实际没生效）。
 * 而两种形态的语义都能一句话说清，不存在"猜用户想干什么"。
 */
export function parseApprovalRules(input: unknown): ParsedRules {
  const out: ParsedRules = { rules: [], ignored: [] };
  if (!Array.isArray(input)) return out;
  for (const raw of input) {
    if (typeof raw !== 'string') {
      out.ignored.push({ raw: String(raw), reason: '不是字符串' });
      continue;
    }
    const text = raw.trim();
    if (!text) continue; // 空行是排版，不是错误
    if (text.startsWith('#')) continue; // 允许注释行：用户会想给规则写说明

    const eq = text.lastIndexOf('=');
    if (eq <= 0 || eq === text.length - 1) {
      out.ignored.push({ raw: text, reason: '缺少 =<档位>' });
      continue;
    }
    const lhs = text.slice(0, eq).trim();
    const modeRaw = text.slice(eq + 1).trim();
    if (modeRaw !== 'off' && modeRaw !== 'destructive' && modeRaw !== 'all-writes') {
      out.ignored.push({ raw: text, reason: `档位只能是 off / destructive / all-writes（收到 ${modeRaw || '空'}）` });
      continue;
    }

    const rule: ApprovalRule = { raw: text, mode: modeRaw as ApprovalMode };
    let bad: string | null = null;
    for (const part of lhs.split('|')) {
      const seg = part.trim();
      if (!seg) continue;
      const colon = seg.indexOf(':');
      if (colon <= 0 || colon === seg.length - 1) {
        bad = `「${seg}」缺少 维度:值`;
        break;
      }
      const dim = seg.slice(0, colon).trim().toLowerCase();
      const value = seg.slice(colon + 1).trim();
      if (!RULE_DIMENSIONS.has(dim)) {
        bad = `未知维度「${dim}」（可用 repo / action / tool）`;
        break;
      }
      if (!value) {
        bad = `维度「${dim}」的值为空`;
        break;
      }
      // 同一维度写两次是明确的手误（后者静默覆盖前者 = 用户以为两条都生效）
      if ((dim === 'repo' && rule.repo) || (dim === 'action' && rule.action) || (dim === 'tool' && rule.tool)) {
        bad = `维度「${dim}」重复`;
        break;
      }
      if (dim === 'repo') {
        rule.repo = value;
      } else if (dim === 'action') {
        // 值里带冒号 = 精确到工具（`github_issue:comment`）；不带 = 只按 action 名匹配
        const c = value.indexOf(':');
        if (c > 0 && c < value.length - 1) {
          rule.actionTool = value.slice(0, c).trim();
          rule.action = value.slice(c + 1).trim();
        } else if (c !== -1) {
          bad = `action 值「${value}」格式应为 action 名或 工具:action`;
          break;
        } else {
          rule.action = value;
        }
        /*
         * 校验 action 值**真的会被拦**。
         *
         * 为什么必须校验：审核只作用于 PR / Issue 的写 action，而"写 action"的唯一真源是
         * `WRITE_ACTIONS`。写错一个字母（`merg`）、或指向一个 read action（`list`）、
         * 或指向作用域外的工具，规则都会**解析成功但永不命中**——设置页显示"解析出 1 条"，
         * 用户以为配好了。这正是本功能最坏的失效形态，所以宁愿在这里判为非法并叫出原因。
         */
        if (rule.actionTool !== undefined && !isAuditedTool(rule.actionTool)) {
          bad = `action 的工具「${rule.actionTool}」不参与审核（只有 github_pr / github_issue）`;
          break;
        }
        if (rule.actionTool !== undefined) {
          if (!isGatedWriteAction(rule.actionTool, rule.action!)) {
            bad = `「${rule.actionTool}」没有会触发审核的写 action「${rule.action}」（拼写错误？）`;
            break;
          }
        } else if (!AUDITED_TOOLS.some((t) => isGatedWriteAction(t, rule.action!))) {
          bad = `没有哪个会触发审核的工具存在写 action「${rule.action}」（拼写错误？）`;
          break;
        }
      } else {
        if (!isAuditedTool(value)) {
          bad = `tool 值「${value}」不参与审核（只有 PR / Issue 会经过这里）`;
          break;
        }
        rule.tool = value;
      }
    }
    if (bad) {
      out.ignored.push({ raw: text, reason: bad });
      continue;
    }
    if (!rule.repo && !rule.action && !rule.tool) {
      out.ignored.push({ raw: text, reason: '没有任何条件维度' });
      continue;
    }
    out.rules.push(rule);
  }
  return out;
}

/** 一条规则是否命中这次调用（维度之间是 AND） */
export function ruleMatches(rule: ApprovalRule, ctx: { tool: string; action: string; repo?: string }): boolean {
  if (rule.tool && rule.tool !== ctx.tool) return false;
  if (rule.actionTool && rule.actionTool !== ctx.tool) return false;
  if (rule.action && rule.action !== ctx.action) return false;
  if (rule.repo && rule.repo.toLowerCase() !== (ctx.repo || '').toLowerCase()) return false;
  return true;
}

/**
 * 在一组已解析规则上求值：**首条匹配即返回**，都不匹配则回落到 `base`。
 *
 * 抽成纯函数的理由：`resolveApprovalMode`（吃原始字符串，给测试与外部用）与
 * `AuditStore.resolveModeFor`（吃缓存的解析结果，给热路径用）必须走**同一段匹配逻辑**，
 * 两处各写一遍必然漂移——漂移的后果是"设置页说命中、闸门说不命中"。
 */
export function evaluateRules(
  parsed: ParsedRules,
  base: ApprovalMode,
  ctx: { tool: string; action: string; repo?: string }
): ApprovalMode {
  for (const rule of parsed.rules) {
    if (ruleMatches(rule, ctx)) return rule.mode;
  }
  return normalizeApprovalMode(base);
}

/**
 * 求这一次调用该用哪个档位。
 *
 * **首条匹配即返回**；一条都不匹配时回落到全局 `approvalMode`。
 *
 * 与 `read_only` 的关系（必须写进文档，否则用户会以为策略坏了）：`read_only` 在
 * **注册期**就把写 action 从 enum 里剪掉了，策略根本没机会跑。配了 `all-writes`
 * 又抱怨不弹窗，通常是只读档位在起作用。
 *
 * `repo` 比较不区分大小写：GitHub 的 owner/name 本身大小写不敏感，用户写
 * `ItQianChen/...` 而记录里是 `itqianchen/...` 时不命中，是最难解释的一类失效。
 */
export function resolveApprovalMode(
  cfg: { approvalMode: ApprovalMode; approvalRules?: string[] },
  ctx: { tool: string; action: string; repo?: string }
): ApprovalMode {
  return evaluateRules(parseApprovalRules(cfg?.approvalRules), normalizeApprovalMode(cfg?.approvalMode), ctx);
}

export function auditSettingsPath(dir: string = auditDataDir()): string {
  return path.join(dir, 'audit-settings.json');
}

/**
 * 读设置。任何异常都回落到默认值——设置文件坏掉不该让记录功能消失，更不该让 `apply()` 抛错。
 * `enabled` 缺省 true（产品口径：默认全开）。
 */
export function loadAuditSettings(dir: string = auditDataDir()): AuditSettings {
  const fallback: AuditSettings = {
    enabled: true,
    budgetBytes: DEFAULT_MAX_BYTES,
    approvalMode: 'destructive',
    approvalRules: [],
    source: 'default',
  };
  try {
    const file = auditSettingsPath(dir);
    if (!fs.existsSync(file)) return fallback;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const enabled = typeof raw?.enabled === 'boolean' ? raw.enabled : true;
    return {
      enabled,
      budgetBytes: clampBudget(Number(raw?.budgetBytes) || DEFAULT_MAX_BYTES),
      approvalMode: normalizeApprovalMode(raw?.approvalMode),
      // 只保留字符串项：文件可能被人手改过，混进数字/对象不该让整个设置读取失败
      approvalRules: Array.isArray(raw?.approvalRules)
        ? raw.approvalRules.filter((r: unknown): r is string => typeof r === 'string')
        : [],
      source: 'file',
    };
  } catch {
    return fallback;
  }
}

/** 写设置。返回是否成功（调用方据此决定要不要在 UI 上报错，但不抛）。 */
export function saveAuditSettings(
  dir: string,
  settings: { enabled: boolean; budgetBytes: number; approvalMode?: string; approvalRules?: string[] }
): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const rules = Array.isArray(settings.approvalRules)
      ? settings.approvalRules.filter((r): r is string => typeof r === 'string').map((r) => r.trim()).filter(Boolean)
      : [];
    const body = JSON.stringify(
      {
        enabled: settings.enabled === true,
        budgetBytes: clampBudget(settings.budgetBytes),
        approvalMode: normalizeApprovalMode(settings.approvalMode),
        approvalRules: rules,
      },
      null,
      2
    );
    fs.writeFileSync(auditSettingsPath(dir), body + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** ---------------- 存储 ---------------- */

export interface AuditStoreOptions {
  /** 数据目录（测试注入临时目录） */
  dir?: string;
  now?: () => number;
  /** 行数上限（测试用覆盖；正常由字节预算派生，见 `deriveMaxRows`） */
  maxRows?: number;
  /** 字节预算；缺省读设置文件，再缺省 8 MB */
  maxBytes?: number;
  /**
   * 是否启用记录。缺省读 `audit-settings.json`，再缺省 `true`（产品口径：默认全开）。
   * 关闭时不加载历史、不写盘；历史文件保留，可用 `clear()` 删除。
   */
  enabled?: boolean;
  /** 设置文件目录（测试注入；缺省与数据目录相同） */
  settingsDir?: string;
  /** 审核档位（种子值；设置文件存在时以文件为准） */
  approvalMode?: string;
  /** 攒批刷盘间隔（不阻塞工具返回的关键） */
  flushDelayMs?: number;
  /** 仓库 / 工作区解析器（main.ts 注入 executor 后实现） */
  scopeResolver?: (exec: any, args: any) => { repo?: string; cwd?: string };
  /**
   * 开关/降级状态变化回调（供审核队列同步启用状态）。
   *
   * 为什么由 store 主动通知而不是调用方轮询：运行中关掉记录时，正在等待的审批必须
   * **立刻**结算（`expired`），否则 Agent 会一直挂到 180s 超时。轮询做不到这件事。
   */
  onEnabledChange?: (usage: AuditUsage) => void;
}

/** `list()` 的筛选条件（导出复用同一份，保证"导出的就是看到的"） */
export interface AuditFilter {
  tool?: string;
  write?: boolean;
  risk?: AuditRisk;
  since?: number;
  /**
   * 只返回该工作区产生的记录（右栏「当前工作区」视图）。
   *
   * 语义是**精确路径相等**而不是前缀匹配：前缀匹配会把 `/repo` 与 `/repo-old`
   * 混在一起，而这两者是完全不同的两个工作区。
   */
  cwd?: string;
  limit?: number;
  offset?: number;
  /**
   * 要**全部**（不分页）。
   *
   * 为什么不靠 `limit: Number.MAX_SAFE_INTEGER` 表达"全部"：那是隐式契约——哪天有人给
   * `list()` 加个上限，导出就会**静默少导**，而导出件的 count 会跟着说谎。写成语义就好排查。
   */
  all?: boolean;
}

/** 存储用量快照（`usage()` 的返回类型；字段语义见 `AuditStore.usage`） */
export interface AuditUsage {
  enabled: boolean;
  active: boolean;
  rows: number;
  bytes: number;
  maxRows: number;
  maxBytes: number;
  degraded: string | null;
  /**
   * 当前参与合并的段数（s3）。
   *
   * 为什么要暴露：多进程同时写时用户应该能**看到**"有两段"，而不是只看到一个数字。
   * 排查"另一个 profile 的记录怎么不在"时，这个数字是第一现场。
   */
  segments: number;
}

/** 段文件名前缀 / 后缀。目录扫描按它匹配，绝不误读用户放在同目录的其它文件 */
const SEG_PREFIX = 'audit.';
const SEG_SUFFIX = '.jsonl';

/**
 * 段数上限。
 *
 * 这是"最多几个进程同时写过"的**护栏**，不承担保留策略职责——保留仍由字节预算管
 * （`Σ 各段字节 ≤ 预算`）。取 8 的依据：desktop + cli + 几次热重载实例是现实上限，
 * 再多也只是启动时多读几个文件（每个文件一次 `readFileSync`）。
 */
const MAX_SEGMENTS = 8;

/**
 * 坏行自愈阈值。
 *
 * 断电留下半行是**常态**，不是异常；整份丢掉的代价是用户全部历史归零。
 * 所以默认只跳过坏行；只有坏行比例明显异常（>5% 且总行数 >50）才重写本段，
 * 把坏字节真正清掉——否则文件会一直带着这些垃圾被反复读取。
 */
const BAD_ROW_RATIO = 0.05;
const BAD_ROW_MIN_ROWS = 50;

/** 跨段清空的互斥锁文件（`O_EXCL` 创建）。失败即降级为"只清本段"，绝不假装删干净 */
const LOCK_FILE = '.lock';

/** 锁的过期时间：崩溃留下的锁不能让"清空"永久退化成 partial（安全方向是清不掉，不是删错） */
const LOCK_STALE_MS = 30_000;

/**
 * "这个段已经没人写了"的判定窗口（按 mtime）。
 *
 * 为什么需要它：跨进程的两种动作——删段（段数超限 / 超预算）与自愈重写——都会
 * 覆盖别人的文件。若对方正在追加，覆盖 = 静默丢它的数据。活跃写入会持续刷新 mtime，
 * 所以"60 秒没动过"是一个便宜且足够可靠的"写它的进程已经不在了"判据。
 *
 * 为什么取 60s 而不是更短：用户可能几分钟才点一次操作，段文件的 mtime 在两次操作之间
 * 本来就长时间不变。60s 只是在避免"刚写完 10ms 就被删"，不需要判断进程死活。
 */
const HEAL_SETTLE_MS = 60_000;

/**
 * 段名里的 pid（`audit.<pid>-<ts>-<seq>.jsonl`）。解析不出返回 null（不猜）。
 */
function segmentPidOf(file: string): number | null {
  const m = /^audit\.(\d+)-/.exec(path.basename(file));
  if (!m) return null;
  const pid = Number(m[1]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * 进程是否还活着。
 *
 * `process.kill(pid, 0)` 是 Node 里最标准的"探测存在性"手法：不发信号、只做权限与
 * 存在性检查。EPERM 表示进程存在但不属于我们（也算活着），ESRCH 才是"没有这个进程"。
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === 'EPERM';
  }
}

/**
 * 同进程内的段序号。
 *
 * 为什么需要它：段名按 `<pid>-<startedAt>` 命名，而同一进程里热重载 / 测试会连续
 * 构造多个 `AuditStore`——同一毫秒内两次构造就会撞名，后一个把前一个的段覆盖掉，
 * 表现为"刚写的记录莫名消失"。序号让它天然唯一。
 */
let segmentSeq = 0;

/**
 * 事件流存储。
 *
 * 写入路径：`recordCall()` → 内存（查询立即可见）→ 攒批 → 200ms 后一次刷盘。
 * 读路径：`list()` 全量折叠（预算内最多几万行，折叠是 O(n) 的内存操作，不值得做增量索引）。
 *
 * 保留策略：**字节预算为主闸门、行数为其派生上限**（见文件头常量注释）。
 *
 * 分段（s3）：**每个进程写自己的段文件**，读取时按 mtime 合并。
 * 为什么必须分段：`desktop` 与 `cli` 两个 profile 会同时加载本插件，两个进程写同一个
 * `audit.jsonl` 时，POSIX 的 `O_APPEND` 对小行是原子的，但 Windows 上 Node 的
 * `appendFile` 不保证；更要命的是两边都会做"墓碑 + 压实"，压实期间的读改写会互相
 * 吃掉对方的行。分段后压实只碰自己的段 → **不存在跨进程读改写**。
 */
export class AuditStore {
  private readonly dir: string;
  /** 段目录（`<dir>/audit/`）。旧单文件 `<dir>/audit.jsonl` 只读、一次性迁移 */
  private readonly segDir: string;
  /** 本进程独占的段文件：只追加 + 只压实自己这份 */
  private readonly file: string;
  /** 跨段清空锁的归属令牌（`pid:序号`），见 `releaseLock` 的注释 */
  private readonly lockToken: string;
  /** 旧布局（s1/s1b/s2）的单文件。存在即迁移，绝不静默丢用户历史 */
  private readonly legacyFile: string;
  private readonly now: () => number;
  private readonly settingsDir: string;
  /** 随 `setBudget()` 变化，故非 readonly */
  private maxRows: number;
  private maxBytes: number;
  private enabled: boolean;
  /** 审核档位：与开关/预算同文件，设置页同屏；`main.ts` 的闸门每次调用现读 */
  private mode: ApprovalMode;
  /** 审核规则原始字符串（s3）。解析结果见 `parsedRules`，闸门走它避免热路径重复解析 */
  private ruleList: string[] = [];
  private parsedRules: ParsedRules = { rules: [], ignored: [] };
  private readonly flushDelayMs: number;
  private readonly repoResolver?: (exec: any, args: any) => { repo?: string; cwd?: string };
  private readonly onEnabledChange?: (usage: AuditUsage) => void;

  private rows: AuditRow[] = [];
  /** 与 `rows` 等长的字节数（含行尾换行）——淘汰时从头部整批减，避免 O(n²) 重算 */
  private rowBytes: number[] = [];
  /**
   * 与 `rows` 等长的**归属段路径**。
   *
   * 为什么必须有它：`writeSnapshotSync()` 只能重写自己的段。没有归属信息就只能
   * "把内存里的全部行写进本段"，那会把别的进程的行复制一份进来 —— 于是每重启一次
   * 记录就翻一倍，而界面上看起来一切正常。
   */
  private rowSeg: string[] = [];
  private totalBytes = 0;
  /** 段顺序（最旧在前）。只有头部整段可丢，因此顺序必须显式维护 */
  private segOrder: string[] = [];
  private readonly segRows = new Map<string, number>();
  private readonly segBytes = new Map<string, number>();
  private pending: string[] = [];
  private needsRewrite = false;
  private flushTimer: any = null;
  private flushing: Promise<void> | null = null;
  private disposed = false;
  /** 构造期降级原因（非 null 表示记录功能已关闭，其余功能照常） */
  readonly degradedReason: string | null = null;

  constructor(options: AuditStoreOptions = {}) {
    this.dir = options.dir || auditDataDir();
    this.segDir = path.join(this.dir, 'audit');
    this.legacyFile = path.join(this.dir, 'audit.jsonl');
    segmentSeq++;
    this.lockToken = `${process.pid}:${segmentSeq}`;
    this.file = path.join(this.segDir, `${SEG_PREFIX}${process.pid}-${Date.now()}-${segmentSeq}${SEG_SUFFIX}`);
    this.settingsDir = options.settingsDir || this.dir;
    this.now = options.now || Date.now;
    this.flushDelayMs = Math.max(0, options.flushDelayMs ?? 200);
    this.repoResolver = options.scopeResolver;
    this.onEnabledChange = options.onEnabledChange;

    // 优先级：设置文件（UI 改的） > 构造参数（cordis 静态配置） > 默认值。
    // 只有文件确实存在（source === 'file'）时它才压过静态配置——文件不存在时
    // 静态配置才是用户的表达，不能反被"默认值"盖掉。
    const settings = loadAuditSettings(this.settingsDir);
    const fromFile = settings.source === 'file';
    this.enabled = fromFile
      ? settings.enabled
      : (options.enabled === undefined ? settings.enabled : options.enabled === true);
    this.maxBytes = clampBudget(fromFile ? settings.budgetBytes : (options.maxBytes ?? settings.budgetBytes));
    this.mode = fromFile
      ? settings.approvalMode
      : normalizeApprovalMode(options.approvalMode ?? settings.approvalMode);
    this.ruleList = settings.approvalRules;
    this.parsedRules = parseApprovalRules(this.ruleList);
    this.maxRows = options.maxRows !== undefined
      ? Math.min(MAX_MAX_ROWS, Math.max(MIN_MAX_ROWS, options.maxRows))
      : deriveMaxRows(this.maxBytes);

    // 构造期绝不抛错：apply() 抛错会让整个插件 FAILED，19 个工具全丢。
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.mkdirSync(this.segDir, { recursive: true });
      // 关闭态不加载：零内存、零启动成本。历史文件仍在，可 clear() 删除。
      if (this.enabled) this.load();
    } catch (err: any) {
      this.degradedReason = err?.message || '审计存储不可用';
      this.rows = [];
      this.rowBytes = [];
      this.rowSeg = [];
      // eslint-disable-next-line no-console
      console.warn(
        `[dsh-github-flow] 操作记录已降级为只读禁用态（${this.degradedReason}）；` +
        `工具本身不受影响。目录: ${this.dir}`
      );
    }
  }

  /**
   * 本进程段文件路径（测试与诊断用）。
   *
   * ⚠️ 语义在 s3 变了：从前是"那个唯一的记录文件"，现在是"**本进程**这一段的路径"。
   * 想拿到全部段用 `segmentPaths()`；旧单文件用 `legacyPath()`。
   */
  filePath(): string {
    return this.file;
  }

  /** 当前存在的全部段（最旧在前；含本进程段） */
  segmentPaths(): string[] {
    return this.listSegments().map((s) => s.path);
  }

  /** 旧布局单文件路径（迁移后不再存在） */
  legacyPath(): string {
    return this.legacyFile;
  }

  /** 段目录（UI 与诊断要能说清"记录存在哪"） */
  segmentDir(): string {
    return this.segDir;
  }

  /** 按 mtime 升序列出段文件（最旧在前） */
  private listSegments(): Array<{ path: string; mtime: number }> {
    const out: Array<{ path: string; mtime: number }> = [];
    let names: string[] = [];
    try {
      names = fs.readdirSync(this.segDir);
    } catch {
      return out;
    }
    for (const name of names) {
      if (!name.startsWith(SEG_PREFIX) || !name.endsWith(SEG_SUFFIX)) continue;
      const p = path.join(this.segDir, name);
      try {
        out.push({ path: p, mtime: fs.statSync(p).mtimeMs });
      } catch {
        // 刚被别的进程删掉：跳过而不是让整次装载失败
      }
    }
    out.sort((a, b) => a.mtime - b.mtime);
    return out;
  }

  /**
   * 读一个文件里的全部可解析行。
   *
   * 坏行**不抛错**、只计数：断电留下半行是常态。计数是给自愈用的——
   * 没有计数就无法区分"这个文件很干净"与"这个文件已经烂了一半"。
   *
   * **作用域外的历史行在这里就被丢掉**（`outOfScope`），原因见下面注释。
   */
  private readSegment(file: string): {
    rows: Array<{ row: AuditRow; bytes: number }>;
    bad: number;
    total: number;
    outOfScope: number;
  } {
    const out: {
      rows: Array<{ row: AuditRow; bytes: number }>;
      bad: number;
      total: number;
      outOfScope: number;
    } = { rows: [], bad: 0, total: 0, outOfScope: 0 };
    let text = '';
    try {
      if (!fs.existsSync(file)) return out;
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return out;
    }
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      out.total++;
      try {
        const row = JSON.parse(t);
        if (row && typeof row === 'object' && typeof row.kind === 'string') {
          /*
           * 作用域过滤（读写同一真源 `AUDITED_TOOLS`）。
           *
           * s1 首版对**所有** github_* 工具都记录（读操作也落一行自带身份），
           * 直到 `bea6b3a` 才收窄成「只有 PR / Issue 的写操作」。但那次收窄只改了
           * **写入**路径（`recordCall` 早退），**读取**路径没跟——于是旧版留下的
           * `github_api` 等记录一直显示在列表和工具筛选下拉里，而它们按产品定义
           * 根本不该存在（用户明确："记录只有 Issue 和 PR"）。
           *
           * 为什么在装载期丢而不是在 `list()` 里过滤：
           * 丢在装载期，内存里就没有它们 → 任何一次压实（删除/清空/超预算重写）
           * 都会顺带把它们从磁盘抹掉，脏数据不会永久占着字节预算被反复读取。
           *
           * 为什么只对有 `tool` 字段的行判定：`decision` / `delete` 行没有工具身份
           * （它们靠 id 关联），丢掉它们会让折叠失效——尤其 decision 行，丢了就会
           * 出现"明明拒绝过、审核列却写着自动"。写操作的 `result` 行同样不带 `tool`，
           * 因此安全；旧版读操作的 result 行**自带** tool，正是要被筛掉的那类。
           */
          if (isOutOfScopeRow(row)) {
            out.outOfScope++;
            continue;
          }
          // 记账用**文件真实字节**（UTF-8），不是字符数：中文 3 字节/字，
          // 用 String.length 会把 8 MB 当成 2.7 MB，虚拟预算比没有预算更糟。
          out.rows.push({ row, bytes: Buffer.byteLength(t, 'utf8') + 1 }); // +1 = 行尾换行
        } else {
          out.bad++;
        }
      } catch {
        out.bad++;
      }
    }
    return out;
  }

  /** 往内存尾部追加一行并维护全部记账（装载与运行期共用，避免两处记账口径漂移） */
  private pushRow(row: AuditRow, bytes: number, seg: string): void {
    this.rows.push(row);
    this.rowBytes.push(bytes);
    this.rowSeg.push(seg);
    this.totalBytes += bytes;
    this.segRows.set(seg, (this.segRows.get(seg) || 0) + 1);
    this.segBytes.set(seg, (this.segBytes.get(seg) || 0) + bytes);
    if (!this.segOrder.includes(seg)) this.segOrder.push(seg);
  }

  private load(): void {
    this.rows = [];
    this.rowBytes = [];
    this.rowSeg = [];
    this.totalBytes = 0;
    this.segOrder = [];
    this.segRows.clear();
    this.segBytes.clear();

    // 1) 段数护栏：只读最新的若干段。超出的**整段**丢弃（一次 unlink，
    //    不必逐行读改写；而"从最旧段里挑最旧行"要读整个段，得不偿失）。
    //    但**正在被写的段不许删**：别的进程刚追加完又被我们 unlink，它后续的
    //    append 会写到孤儿 inode 上——那是静默的数据丢失，比段数超限严重得多。
    //    判据见 `isSegmentLive`（pid 存活 + mtime 沉寂两道）。
    const all = this.listSegments();
    const excess = all.length - (MAX_SEGMENTS - 1); // 留一格给本进程段
    const dropped = new Set<string>();
    for (let i = 0; i < excess; i++) {
      if (this.isSegmentLive(all[i].path)) break; // 还有人写：宁可暂时超限，也不删别人的活文件
      try {
        fs.unlinkSync(all[i].path);
        dropped.add(all[i].path);
      } catch { /* 别的进程可能刚删过 */ }
    }
    if (all.length - dropped.size > MAX_SEGMENTS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[dsh-github-flow] 操作记录有 ${all.length - dropped.size} 个段（上限 ${MAX_SEGMENTS}），` +
        `其中部分仍在被其他进程写入，本次不删除；下次启动会再尝试清理。`
      );
    }
    const keep = all.filter((s) => !dropped.has(s.path));

    /*
     * 2) 旧单文件（s1/s1b/s2 的布局）当作**最旧的一段**读进来，随后迁移进本进程段。
     *    升级绝不能把用户的历史弄丢——那是他所有已发生操作的唯一本地事实源。
     */
    const legacy = this.readSegment(this.legacyFile);
    for (const r of legacy.rows) this.pushRow(r.row, r.bytes, this.file);

    // 先把所有段读出来（含坏行计数），再决定是否自愈，最后才灌进内存。
    // 顺序不能反：自愈会重写文件，若已经记账再改盘，内存与磁盘的行数就对不上了。
    const reads: Array<{ path: string; mtime: number; read: ReturnType<AuditStore['readSegment']> }> = [];
    for (const seg of keep) reads.push({ path: seg.path, mtime: seg.mtime, read: this.readSegment(seg.path) });

    /*
     * 3) 自愈：坏行比例异常时重写该段，把坏字节真正清掉（只写回能解析的行）。
     *
     * 为什么默认只跳过、不重写：断电留下半行是**常态**，偶发一行不值得动盘。
     * 只有坏行比例明显异常（>5% 且总行数 >50）才说明这个文件真的坏了。
     *
     * 为什么"重写别人的段"是安全的、且必须做：本进程每次启动都新建一个段文件，
     * 所以**本段永远是刚建的空文件**——只重写本段的自愈在分段世界里等于死代码，
     * 坏行会一直留在旧段里被反复跳过读取。于是这里加两道护栏：
     *   a) **`isSegmentLive`**：写它的进程还活着（pid 存活）或刚写过（mtime 未沉寂）
     *      就不动；只有确实没人写了才重写。
     *   b) **`.lock` 互斥**：与跨段清空同一把锁。抢不到就如实告警并放弃——
     *      宁可不自愈，也不能在别人正在写的时候把它删掉。
     */
    for (const item of reads) {
      /*
       * 触发重写的两个理由，级别不同：
       * - **越界行（outOfScope）**：无条件清。它们是早期版本记录过的读操作/其它工具调用，
       *   按产品定义本就不该存在；界面上已过滤，但**字节仍在磁盘上**——那是隐私问题。
       *   早先这里只在 legacy 路径标了 needsRewrite，历史段里的越界行永远等不到压缩
       *   （本进程段永远是新建的空文件），注释写的"下次压缩会清除"实际不会发生。
       * - **坏行**：按比例阈值。断电半行是常态，偶发一行不值得动盘。
       */
      const total = item.read.total;
      const tooManyBad = total > BAD_ROW_MIN_ROWS && item.read.bad / total > BAD_ROW_RATIO;
      const hasOutOfScope = item.read.outOfScope > 0;
      if (!tooManyBad && !hasOutOfScope) continue;

      const where = path.basename(item.path);
      const pct = Math.round(BAD_ROW_RATIO * 100);
      const why = hasOutOfScope
        ? `${item.read.outOfScope} 条作用域外历史行`
        : `${item.read.bad}/${total} 行损坏（超过 ${pct}%）`;
      if (item.path === this.file) {
        if (this.healSegment(item.path, item.read.rows)) {
          // eslint-disable-next-line no-console
          console.warn(`[dsh-github-flow] 操作记录段 ${where} 有 ${why}，已重写并保留全部有效行。`);
        }
        continue;
      }
      if (this.isSegmentLive(item.path)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[dsh-github-flow] 操作记录段 ${where} 有 ${why}，但它最近仍在写入，本次只跳过不重写。`
        );
        continue;
      }
      const lockPath = path.join(this.dir, LOCK_FILE);
      if (!this.acquireLock(lockPath)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[dsh-github-flow] 操作记录段 ${where} 有 ${why}，但清空/自愈锁被占用，本次只跳过不重写。`
        );
        continue;
      }
      try {
        if (this.healSegment(item.path, item.read.rows)) {
          // eslint-disable-next-line no-console
          console.warn(`[dsh-github-flow] 操作记录段 ${where} 有 ${why}，已重写并保留全部有效行。`);
        }
      } finally {
        this.releaseLock(lockPath);
      }
    }

    for (const item of reads) {
      for (const r of item.read.rows) this.pushRow(r.row, r.bytes, item.path);
    }

    /*
     * 4) 迁移：先把旧文件里**能用**的行落进本进程段（先落盘再删，任一步失败都不丢数据）。
     *
     * 触发条件不能只看 `legacy.rows.length`：旧文件里可能**只剩**作用域外的行或坏行
     * （首版记录过读操作），此时 rows 为空但文件真实存在。若因此跳过，那个文件会
     * 永远留着：每次启动重复读取 + 重复告警，用户点「清空」也删不到它
     * （clear 只管段目录），字节一直躺在磁盘上 —— 与"删除是真删字节"的承诺冲突。
     */
    if (legacy.rows.length + legacy.outOfScope + legacy.bad > 0) {
      this.needsRewrite = true;
      this.writeSnapshotSync();
      try {
        const parked = this.legacyFile + '.migrated';
        fs.renameSync(this.legacyFile, parked);
        fs.unlinkSync(parked);
      } catch (err: any) {
        // 迁移没删干净：下一次启动会再导入一遍（宁可重复一次，也不静默丢历史）
        // eslint-disable-next-line no-console
        console.warn(`[dsh-github-flow] 旧记录文件迁移后未能删除（下次启动会再导入一次）: ${err?.message || err}`);
      }
    }

    /*
     * 5) 作用域外的历史行：装载期已经跳过（见 `readSegment`），这里只做两件事。
     *
     * a) 如实告警一次 —— 否则用户会发现"记录条数变少了"却找不到原因。
     * b) 界面上已过滤，**字节也已经在上面按段重写时清掉了**（见自愈循环：越界行无条件触发
     *    重写，活段除外）。这里不再重复标 needsRewrite —— 那只会多写一次本段。
     */
    const outOfScopeTotal = legacy.outOfScope + reads.reduce((n, i) => n + i.read.outOfScope, 0);
    if (outOfScopeTotal > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[dsh-github-flow] 操作记录里发现 ${outOfScopeTotal} 条作用域外的历史记录` +
        `（早期版本记录过 PR / Issue 之外的调用或读操作），已忽略不再显示；` +
        `无法立即重写的段（属于仍在运行的实例）会在下次启动时再尝试。`
      );
    }
    if (legacy.outOfScope > 0) this.needsRewrite = true;

    // 6) 装载期就要按预算淘汰：否则磁盘上堆着几万行、内存里却只剩一部分，两边记账必然错位
    if (this.enforceBudget()) this.needsRewrite = true;
  }

  /**
   * 把一个段重写成"只有可解析行"的版本（tmp + rename 原子替换）。
   *
   * 只删坏行、不动好行：自愈的承诺是"坏行代价为零"，不是"顺手清理一下"。
   * 返回是否成功——失败时调用方只需如实告警，下一条记录照常写（绝不因此让记录功能停摆）。
   */
  private healSegment(file: string, rows: Array<{ row: AuditRow; bytes: number }>): boolean {
    try {
      const body = rows.map((r) => JSON.stringify(r.row)).join('\n');
      const tmp = file + '.heal';
      fs.writeFileSync(tmp, body ? body + '\n' : '', 'utf8');
      fs.renameSync(tmp, file);
      return true;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn(`[dsh-github-flow] 操作记录段自愈失败（已忽略，坏行继续跳过）: ${err?.message || err}`);
      return false;
    }
  }

  /**
   * 丢掉头部 k 行，并同步维护每段的行数 / 字节数与段顺序。
   *
   * ⚠️ 只用于**按行淘汰**（`evictRows`：按时间丢最早的）。**整段淘汰必须走
   * `dropSegmentRows`**——段的行未必从头部开始（legacy 迁移行会插在最前）。
   *
   * 为什么必须逐行维护而不是最后重算：`enforceBudget()` 在超预算后**每次 append**
   * 都会走一小步，O(n) 重算会让稳态写入退化成 O(n²)（3 万行时肉眼可见）。
   */
  private dropHead(k: number): void {
    let bytes = 0;
    for (let i = 0; i < k; i++) {
      const seg = this.rowSeg[i];
      const size = this.rowBytes[i];
      bytes += size;
      this.segRows.set(seg, Math.max(0, (this.segRows.get(seg) || 0) - 1));
      this.segBytes.set(seg, Math.max(0, (this.segBytes.get(seg) || 0) - size));
      if ((this.segRows.get(seg) || 0) === 0 && seg !== this.file) {
        const idx = this.segOrder.indexOf(seg);
        if (idx >= 0) this.segOrder.splice(idx, 1);
      }
    }
    this.totalBytes -= bytes;
    this.rows = this.rows.slice(k);
    this.rowBytes = this.rowBytes.slice(k);
    this.rowSeg = this.rowSeg.slice(k);
  }

  /**
   * 丢掉某个段的**全部行**——按 `rowSeg` 过滤，**不假设它们在 `rows` 头部**。
   *
   * ⚠️ 为什么不复用 `dropHead`：装载时 legacy（旧单文件）的行归属**本进程段**且排在最前，
   * 别人的段的行排在它之后。若按"该段行数"从头部切 k 行，删掉的是**本段的行**、
   * 而别人的行仍留在内存里——随后 `writeSnapshotSync()` 只写本段的行，
   * 本段历史就被截断了（实测 1600 条记录可全丢）。这类错位不报错，只会让记录莫名消失。
   */
  private dropSegmentRows(seg: string): void {
    const keepRows: AuditRow[] = [];
    const keepBytes: number[] = [];
    const keepSeg: string[] = [];
    let total = 0;
    for (let i = 0; i < this.rows.length; i++) {
      if (this.rowSeg[i] === seg) continue;
      keepRows.push(this.rows[i]);
      keepBytes.push(this.rowBytes[i]);
      keepSeg.push(this.rowSeg[i]);
      total += this.rowBytes[i];
    }
    this.rows = keepRows;
    this.rowBytes = keepBytes;
    this.rowSeg = keepSeg;
    // 重算而不是减去 segBytes：后者一旦因为"删不掉也照丢"之类的路径失准，
    // 减出来就是负预算，会让后续淘汰永远停不下来。
    this.totalBytes = total;
    this.segRows.set(seg, 0);
    this.segBytes.set(seg, 0);
  }

  /**
   * 段文件的 mtime（ms）。读不到时返回 0（= 视作已沉寂）：
   * 文件不存在本来就可以删，把它当成"正在被写"只会让预算永远收不回来。
   */
  private segMtime(file: string): number {
    try {
      return fs.statSync(file).mtimeMs;
    } catch {
      return 0;
    }
  }

  /**
   * 这个段**是否还被它自己的进程写着**。
   *
   * 判据分两步，越准的先用：
   * 1. **pid 存活**（段名里就写着 `audit.<pid>-<ts>-<seq>.jsonl`）——最准。
   *    进程没了就一定没人再写它，立刻可以删/重写，不必等冷却。
   * 2. **mtime 沉寂**——pid 可能被系统回收给别的进程（复用），此时"活着"是假阳性，
   *    退回"最近有没有被写过"这个保守判据（`HEAL_SETTLE_MS`）。
   *
   * 为什么必须两步：只用 mtime 会让"用户刚关掉 desktop 就想清空"白等 60 秒；
   * 只用 pid 会因 pid 复用而误判活段。
   */
  private isSegmentLive(file: string): boolean {
    const pid = segmentPidOf(file);
    if (pid !== null && pid !== process.pid && !isProcessAlive(pid)) return false;
    return this.segMtime(file) > this.now() - HEAL_SETTLE_MS;
  }

  /**
   * 预算闸门：**先整段丢最旧，再在段内按行淘汰**。
   *
   * 为什么整段优先：段是按进程启动时间命名的，整段丢 = 一次 `unlink`，
   * 不需要逐行读改写；而"从最旧段里挑最旧行"要把整个段读一遍再重写，得不偿失。
   *
   * 自己的段留到最后按行淘汰：它正在被写入，unlink 之后还要立刻重建，
   * 不如直接在内存里淘汰 + 一次压实（与 `delete()` 同一条路径）。
   *
   * @returns 是否发生了淘汰（调用方据此决定要不要压实自己的段）
   */
  private enforceBudget(): boolean {
    let changed = false;
    let warnedLive = false;
    /*
     * 每次都挑**最旧的非本进程段**整段丢。用 `filter(p => p !== this.file)`
     * 而不是只看队头：本进程段在 `setEnabled(true)` 重载后可能排在中间，
     * 只看队头会 `break` 掉，导致别人的段永远删不掉、预算永远超。
     *
     * **优先删已经没人写的段**：见 `isSegmentLive`。只有同批候选全都还活着时，
     * 才退而删最旧的那个并告警——预算是硬要求，但不能一声不响地删别人的活文件。
     */
    while (this.totalBytes > this.maxBytes || this.rows.length > this.maxRows) {
      const others = this.segOrder.filter((p) => p !== this.file);
      if (others.length === 0) break; // 只剩自己的段：交给下面的按行淘汰
      const settled = others.find((p) => !this.isSegmentLive(p));
      const oldest = settled ?? others[0];
      if (settled === undefined && !warnedLive) {
        warnedLive = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[dsh-github-flow] 操作记录超预算，但没有已停写的段可丢（其他实例可能仍在运行）；` +
          `本次删除最旧段 ${path.basename(oldest)}，其中数据可能属于仍在运行的实例。`
        );
      }
      try {
        fs.unlinkSync(oldest);
      } catch {
        // 删不掉（被占用 / 已被别的进程删掉）也算"不再由我们负责"：把它从内存里丢掉，
        // 否则它会永远占着队头让循环空转
      }
      /*
       * 按 `rowSeg` 精确剔除该段的行，**不假设它们位于 `rows` 头部**。
       * legacy 迁移行归属本进程段却排在最前，按"段内行数"从头部切会删错行
       * （详见 `dropSegmentRows` 的注释）。
       */
      this.dropSegmentRows(oldest);
      this.segRows.delete(oldest);
      this.segBytes.delete(oldest);
      const at = this.segOrder.indexOf(oldest);
      if (at >= 0) this.segOrder.splice(at, 1);
      changed = true;
    }
    if (this.evictRows()) changed = true;
    return changed;
  }

  /**
   * 按预算淘汰最早的若干行（字节与行数先到者生效）。
   *
   * **至少保留最新一行**（`drop < n - 1`）：单行就超过预算的极端情况（比如预算调到
   * 下限而一条记录带了长留言）下，若把刚写的那行也淘汰掉，"刚发生的事"会立刻查不到——
   * 超出预算一行是可以接受的诚实，丢掉正在记录的操作不是。
   */
  private evictRows(): boolean {
    let drop = 0;
    let bytes = this.totalBytes;
    const n = this.rows.length;
    while (drop < n - 1 && (n - drop > this.maxRows || bytes > this.maxBytes)) {
      bytes -= this.rowBytes[drop];
      drop++;
    }
    if (drop === 0) return false;
    // 一次 slice 而不是反复 shift：逐条 shift 是 O(n²)，几万行时肉眼可见
    this.dropHead(drop);
    return true;
  }

  private append(row: AuditRow): void {
    const json = JSON.stringify(row);
    const size = Buffer.byteLength(json, 'utf8') + 1;
    this.pushRow(row, size, this.file);
    // 注意：这里**不能**在 needsRewrite 时提前 return——那会连带跳过下面的淘汰，
    // 结果是一旦触发过重写，rows 就会突破上限无界增长（实测 60 条上限 50 只剩 59）。
    if (!this.needsRewrite) this.pending.push(json);
    if (this.enforceBudget()) {
      this.needsRewrite = true;
      this.pending = [];
    }
    this.scheduleFlush();
  }

  /**
   * 把墓碑真正"兑现"成删除，并同步重算字节记账。
   *
   * 剔除行时必须同时重建 `rowBytes` / `rowSeg`：只删 `rows` 会让记账与行错位，
   * 之后的淘汰会**删掉不该删的行**——这类错位不会报错，只会让记录莫名消失。
   */
  private compactRows(): void {
    const deleted = new Set<string>();
    for (const row of this.rows) {
      if (row.kind === 'delete') for (const id of row.ids) deleted.add(id);
    }
    if (deleted.size === 0) return;
    const keepRows: AuditRow[] = [];
    const keepBytes: number[] = [];
    const keepSeg: string[] = [];
    let total = 0;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (row.kind === 'delete' || deleted.has(row.id)) continue;
      keepRows.push(row);
      keepBytes.push(this.rowBytes[i]);
      keepSeg.push(this.rowSeg[i]);
      total += this.rowBytes[i];
    }
    this.rows = keepRows;
    this.rowBytes = keepBytes;
    this.rowSeg = keepSeg;
    this.totalBytes = total;
    // 每段记账必须一起重建，否则 enforceBudget 会按错误的段字节数整段丢弃
    this.segRows.clear();
    this.segBytes.clear();
    this.segOrder = [];
    for (let i = 0; i < keepRows.length; i++) {
      const seg = keepSeg[i];
      this.segRows.set(seg, (this.segRows.get(seg) || 0) + 1);
      this.segBytes.set(seg, (this.segBytes.get(seg) || 0) + keepBytes[i]);
      if (!this.segOrder.includes(seg)) this.segOrder.push(seg);
    }
  }

  private scheduleFlush(): void {
    if (this.disposed || this.flushTimer) return;
    try {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, this.flushDelayMs);
      // 不让待刷盘的数据阻止进程退出（插件卸载路径会显式 dispose）
      this.flushTimer?.unref?.();
    } catch {
      /* 定时器不可用（极端受限环境）：退化为同步写，仍不抛错 */
      void this.flush();
    }
  }

  /**
   * 刷盘：有墓碑/超限时整体重写（真删字节），否则增量追加。
   *
   * 在途时返回同一个 promise（并发调用方共用一趟）——因此**不保证**本次调用
   * 覆盖调用前刚 add 的数据。用户显式动作（删除/清空）不依赖它：那些走
   * `writeSnapshotSync()` 同步落盘；`dispose()` 会在末次刷盘后复查残余。
   */
  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async doFlush(): Promise<void> {
    try {
      if (this.degradedReason) return;
      if (this.needsRewrite) {
        this.writeSnapshotSync();
        return;
      }
      if (this.pending.length === 0) return;
      const body = this.pending.join('\n') + '\n';
      this.pending = [];
      fs.appendFileSync(this.file, body, 'utf8');
    } catch (err: any) {
      // 写盘失败不抛：下一次 flush 会重试（数据仍在内存 rows 里）
      // eslint-disable-next-line no-console
      console.warn(`[dsh-github-flow] 操作记录写盘失败（已忽略）: ${err?.message || err}`);
    }
  }

  /**
   * 把**本进程段**整体落盘（先折叠墓碑，再 tmp+rename 原子替换）。**同步**。
   *
   * 为什么用户显式动作（删除 / 清空）必须走同步写而不是"排进攒批队列"：
   * 攒批靠定时器，而删除是「我点了，它就该没了」的语义。若只把墓碑塞进队列，
   * 一旦进程在定时器触发前退出，重启后记录会**复活**——用户会认为删除是假的。
   * 这里宁可在一次点击上多花几毫秒（≤5MB 的顺序写），也不留这种不可解释的行为。
   *
   * 只写自己的段：`this.rows` 里可能含着别的进程的行（读取时合并进来的）。
   * 把它们一起写进本段就是**跨进程复制**——每重启一次记录翻一倍，
   * 而界面上一切正常。所以这里必须按 `rowSeg` 过滤。
   */
  private writeSnapshotSync(): void {
    if (this.degradedReason) return;
    try {
      this.compactRows();          // 兑现墓碑，同时重算字节记账
      const mine: string[] = [];
      for (let i = 0; i < this.rows.length; i++) {
        if (this.rowSeg[i] !== this.file) continue;
        mine.push(JSON.stringify(this.rows[i]));
      }
      const body = mine.join('\n');
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, body ? body + '\n' : '', 'utf8');
      fs.renameSync(tmp, this.file);
      this.needsRewrite = false;
      this.pending = [];
    } catch (err: any) {
      // 失败时保留墓碑 + needsRewrite，让下一次 flush 再试，绝不假装成功
      this.needsRewrite = true;
      // eslint-disable-next-line no-console
      console.warn(`[dsh-github-flow] 操作记录压实失败（已忽略，稍后重试）: ${err?.message || err}`);
    }
  }

  /**
   * 等当前在途刷盘收尾。
   *
   * 为什么必须先等：在途的 append 用的是它自己算好的字符串，若我们的
   * tmp+rename 抢在它前面落盘，随后那次 append 会把刚删掉的行**追加回来**。
   * 顺序错了就复活数据，这种事只在空闲/繁忙切换的瞬间发生，最难复现。
   */
  private async quiesce(): Promise<void> {
    if (this.flushing) {
      try { await this.flushing; } catch { /* 在途失败由它自己告警 */ }
    }
  }

  /**
   * 记录一次工具调用。**永不抛错**。
   *
   * @param tool   工具名（`github_pr`）
   * @param args   工具原始参数
   * @param result `tools/result` 的第二参（归一化或原始载荷，两种都认）
   * @param exec   `tools/result` 的第一参（冻结快照，含 agent / callId）
   */
  recordCall(tool: string, args: any, result: any, exec?: any): void {
    try {
      if (this.degradedReason || this.disposed || !this.enabled) return;
      // 作用域：**只有 PR / Issue**（总纲 §一：每次写 PR / Issue 留一条）。
      // 其它 17 个工具不进记录——它们的审计由各自的 confirm 闸门与遥测负责。
      if (!isAuditedTool(tool)) return;
      const action = typeof args?.action === 'string' ? args.action : '';
      // 只记写操作：读（list / view / diff / checks）会把列表淹成噪音，
      // 而"Agent 改了什么"才是要追查的事。
      if (!classifyWrite(tool, action)) return;
      // id 复用宿主的 callId：同一次调用的 intent / result / decision 才能折成一条。
      // 若宿主对重试复用同一个 callId，两次尝试会并成一条（后写的 result 覆盖先写的）——
      // 那正是"同一次操作只该有一条记录"的语义，不是 bug。
      const callId = s(exec?.callId) || randomUUID();
      const at = this.now();
      const outcome = extractOutcome(result);
      const scope = this.repoResolver ? this.repoResolver(exec, args) : resolveScopeFromExec(undefined, exec, args);

      const meta: OperationMeta = {
        tool,
        action,
        write: classifyWrite(tool, action),
        risk: classifyRisk(tool, action),
        summary: summarizeOperation(tool, action, args),
      };
      if (scope.repo) meta.repo = scope.repo;
      if (scope.cwd) meta.cwd = scope.cwd;
      const target = pickTarget(args);
      if (target) meta.target = target;
      // 参数快照：详情页的唯一本地依据（被拒绝的操作在 GitHub 上不存在）
      // 先补 body_file 的正文（否则只留下一条路径，等于没存内容），再按字段裁剪
      const snapshot = snapshotArgs(withFileBody(args, scope.cwd));
      if (snapshot.text) {
        meta.args = snapshot.text;
        if (snapshot.truncated) {
          meta.argsTruncated = true;
          if (snapshot.fields.length > 0) meta.fieldsTruncated = snapshot.fields;
        }
      }
      const sessionId = s(exec?.agent?.id) || s(exec?.sessionId);
      if (sessionId) meta.sessionId = sessionId;
      meta.callId = callId;
      /*
       * 目标标题：审核阶段（`tools/pre-execute`）已经为弹窗查过一次，暂存在
       * `target-title.ts` 的一次性表里；这里取走即可，**不在记录阶段再打 gh**
       * （`tools/result` 是同步切面，也打不了）。
       * 没走审核的调用（档位 off / policy=never / 读操作）没有暂存，`targetTitle` 就缺省 ——
       * 记录照常成立，只是列表里少一个标题。取不到绝不影响记录本身。
       */
      const targetTitle = takeTargetTitle(callId);
      if (targetTitle) meta.targetTitle = targetTitle;

      // 作用域内只剩写操作，因此固定是 intent（发起了什么）+ result（实际结果）两行。
      // 为什么不留"读操作只落一行"的分支：作用域已经排除了读，留着就是死代码，
      // 而死代码的分支条件一旦被后人误读成"这里也支持读"，就会把作用域重新放宽。
      this.append({ v: 1, kind: 'intent', id: callId, at, ...meta });
      this.append({
        v: 1,
        kind: 'result',
        id: callId,
        at: at + 1,
        ok: outcome.ok,
        ...(outcome.errorType ? { errorType: outcome.errorType } : {}),
        ...(outcome.degraded ? { degraded: true } : {}),
      } as AuditRow);
    } catch {
      /* Fail-Open：记录失败绝不影响工具结果 */
    }
  }

  /** s2 用：写入人工决策（s1 不调用，但存储形态先留好，避免 s2 改数据模型） */
  /**
   * 写入一条人工决策。
   *
   * @param askedAt 发起审核请求的时刻（epoch ms）。**必须由调用方在发起请求前取**——
   *   本方法只能给出"结论落盘时刻"，没有它就永远算不出"用户思考了多久"。
   *   缺省表示调用方没提供（旧调用点），此时看板不显示平均等待而不是显示 0。
   */
  recordDecision(id: string, decision: AuditDecision, feedback?: string, askedAt?: number): void {
    try {
      // 与 recordCall 同一条前置：记录关闭时决策也不该落盘。
      // 少了这一条，s2 的 onDisabled() 结算 pending 时会往已关闭的库里写 decision 行。
      if (this.degradedReason || this.disposed || !this.enabled) return;
      const fb = s(feedback).slice(0, 2000);
      const asked = typeof askedAt === 'number' && Number.isFinite(askedAt) ? askedAt : undefined;
      this.append({
        v: 1,
        kind: 'decision',
        id,
        at: this.now(),
        decision,
        ...(fb ? { feedback: fb } : {}),
        ...(asked !== undefined ? { askedAt: asked } : {}),
      });
    } catch {
      /* Fail-Open */
    }
  }

  /**
   * 折叠成记录列表（按时间倒序）。
   *
   * 两遍扫：先收集墓碑集合，再折叠。一遍扫会漏掉「墓碑写在 intent 之前」的极端顺序，
   * 而那种顺序在压实失败重放时是可能出现的。
   */
  list(filter: AuditFilter = {}): { items: AuditEntry[]; total: number } {
    const deleted = new Set<string>();
    for (const row of this.rows) {
      if (row.kind === 'delete') for (const id of row.ids) deleted.add(id);
    }
    /*
     * 决策行单独收集、最后统一应用。
     *
     * 为什么不能像 result 行那样边走边贴：s2 的审核在 `tools/pre-execute` 就写决策，
     * 而 intent 行要等 `tools/result` 才写（`recordCall`）。于是同一条记录的落盘顺序是
     * **decision → intent → result**，逆序。边走边贴时 `byId.get(id)` 还没有那条 intent，
     * 决策被静默丢弃 —— 界面上就是"明明拒绝过，审核列却写着自动"。
     * 顺序无关是这里唯一正确的写法（后到的决策覆盖先到的，与 v1 的覆盖语义一致）。
     */
    const decisions = new Map<
      string,
      { decision: AuditDecision; feedback?: string; at?: number; askedAt?: number }
    >();
    for (const row of this.rows) {
      if (row.kind !== 'decision') continue;
      decisions.set(row.id, {
        decision: row.decision,
        ...(row.feedback ? { feedback: row.feedback } : {}),
        at: row.at,
        ...(typeof row.askedAt === 'number' ? { askedAt: row.askedAt } : {}),
      });
    }
    const byId = new Map<string, AuditEntry>();
    for (const row of this.rows) {
      if (row.kind === 'delete') continue;
      if (deleted.has(row.id)) continue;
      if (row.kind === 'intent') {
        byId.set(row.id, {
          id: row.id,
          at: row.at,
          tool: row.tool,
          action: row.action,
          write: row.write,
          risk: row.risk,
          summary: row.summary,
          repo: row.repo,
          cwd: row.cwd,
          target: row.target,
          sessionId: row.sessionId,
          callId: row.callId,
          args: row.args,
          argsTruncated: row.argsTruncated,
          fieldsTruncated: row.fieldsTruncated,
          targetTitle: row.targetTitle,
          decision: 'auto',
          result: 'unknown',
        });
        continue;
      }
      if (row.kind === 'decision') continue;
      // result 行：可能自带身份（读操作）也可能只是结果（写操作）
      const hit = byId.get(row.id);
      const r = row as ResultRow & Partial<OperationMeta>;
      if (hit) {
        hit.result = row.ok ? 'ok' : 'fail';
        if (row.errorType) hit.errorType = row.errorType;
        if (row.degraded) hit.degraded = true;
        continue;
      }
      if (typeof r.tool === 'string') {
        byId.set(row.id, {
          id: row.id,
          at: row.at,
          tool: r.tool,
          action: r.action || '',
          write: r.write === true,
          risk: (r.risk as AuditRisk) || 'read',
          summary: r.summary || `${r.tool}.${r.action || ''}`,
          repo: r.repo,
          cwd: r.cwd,
          target: r.target,
          sessionId: r.sessionId,
          callId: r.callId,
          args: r.args,
          argsTruncated: r.argsTruncated,
          fieldsTruncated: r.fieldsTruncated,
          targetTitle: r.targetTitle,
          decision: 'auto',
          result: row.ok ? 'ok' : 'fail',
          errorType: row.errorType,
          degraded: row.degraded,
        });
      }
    }

    // 决策回贴：只贴到真实存在的 intent/result 上。没有 intent 的决策是孤儿
    // （记录被预算淘汰、或写入方先于工具结果落盘），不为它造一条幽灵记录。
    for (const [id, d] of decisions) {
      const hit = byId.get(id);
      if (!hit) continue;
      hit.decision = d.decision;
      if (d.feedback) hit.feedback = d.feedback;
      if (typeof d.at === 'number') hit.decisionAt = d.at;
      if (typeof d.askedAt === 'number') hit.askedAt = d.askedAt;
    }

    let items = [...byId.values()];
    if (filter.tool) items = items.filter((e) => e.tool === filter.tool);
    if (filter.write !== undefined) items = items.filter((e) => e.write === filter.write);
    if (filter.risk) items = items.filter((e) => e.risk === filter.risk);
    if (filter.cwd) {
      const want = normalizeCwd(filter.cwd);
      items = items.filter((e) => normalizeCwd(e.cwd) === want);
    }
    if (typeof filter.since === 'number' && Number.isFinite(filter.since)) {
      items = items.filter((e) => e.at >= (filter.since as number));
    }
    items.sort((a, b) => b.at - a.at);
    const total = items.length;
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = filter.all ? Number.POSITIVE_INFINITY : Math.max(1, filter.limit ?? 50);
    return { items: items.slice(offset, offset + limit), total };
  }

  /**
   * 删除指定记录：先追加墓碑（崩溃也能读回"已删除"），**然后同步压实**。
   *
   * 压实后文件里不再有这些 id 的字节——用户点删除要的就是真删除。
   * 返回真实删除的条数（不存在的 id 不计）。
   */
  async delete(ids: string[]): Promise<number> {
    try {
      if (this.degradedReason || this.disposed) return 0;
      const wanted = new Set((Array.isArray(ids) ? ids : []).map((v) => s(v)).filter(Boolean));
      if (wanted.size === 0) return 0;
      const existing = new Set<string>();
      for (const row of this.rows) {
        if (row.kind !== 'delete' && wanted.has(row.id)) existing.add(row.id);
      }
      if (existing.size === 0) return 0;
      // 顺序不能反：先等在途 append 收尾，再一次性写快照（否则它会把删掉的行追回来）
      await this.quiesce();
      /*
       * 墓碑走 `pushRow`（而不是裸 `rows.push`）保持"rows 与 rowBytes/rowSeg 等长"这条
       * 不变式。它紧接着就会被 `writeSnapshotSync → compactRows` 兑现掉，但期间若任何一步
       * 提前 return，裸 push 会让记账永久错位——之后的淘汰会删掉不该删的行。
       */
      const tombstone: AuditRow = { v: 1, kind: 'delete', at: this.now(), ids: [...existing] };
      this.pushRow(tombstone, Buffer.byteLength(JSON.stringify(tombstone), 'utf8') + 1, this.file);
      this.writeSnapshotSync();
      return existing.size;
    } catch {
      return 0;
    }
  }

  /**
   * 清空全部记录。
   *
   * 语义在 s3 变复杂了：记录分在多段里，而**别的进程的段不归我们写**。
   * 所以这里做两件事：
   * 1. 清空自己的段（同步压实为空文件）；
   * 2. 尝试清空其他段——先抢 `<dir>/.lock`（`O_EXCL`），抢不到就**如实降级**为
   *    「只清本段」并返回 `partial: true`。
   *
   * 为什么宁可降级也不假装删干净：墓碑行写在当前进程的段里，读取合并时对全部段生效，
   * 所以"看起来删了"；但被删的原始行仍留在别人的旧段里，用户以为文件干净了，
   * 实际上字节还在磁盘上。**那是隐私问题，不是显示问题。**
   *
   * 关闭态下也可用（不需要加载）。
   */
  async clear(): Promise<{ cleared: number; partial: boolean; remaining: number }> {
    const result = { cleared: 0, partial: false, remaining: 0 };
    try {
      if (this.disposed) return result;
      await this.quiesce();
      const before = this.listSegments();
      const others = before.filter((s) => s.path !== this.file);

      // 本段：直接清空（后面 `cleared` 至少含它）
      this.rows = [];
      this.rowBytes = [];
      this.rowSeg = [];
      this.totalBytes = 0;
      this.segOrder = [];
      this.segRows.clear();
      this.segBytes.clear();
      this.pending = [];
      this.needsRewrite = true;
      this.writeSnapshotSync();
      result.cleared = 1;

      /*
       * 旧布局的单文件（`audit.jsonl`）也必须一起删。
       *
       * 不清它会出现两种"假装删干净"：① 文件字节仍在磁盘上（隐私问题）；
       * ② 下次启动若它里面还有可解析行，会被**重新迁移回段文件**——用户看到已清空的记录复活。
       */
      try {
        if (fs.existsSync(this.legacyFile)) fs.unlinkSync(this.legacyFile);
      } catch { /* 删不掉不影响本段已清空的结论，下一次启动会再试 */ }

      if (others.length === 0) return result;

      // 其他段：抢锁，抢不到就如实降级
      const lockPath = path.join(this.dir, LOCK_FILE);
      if (!this.acquireLock(lockPath)) {
        result.partial = true;
        result.remaining = others.length;
        /*
         * 重新装载一次：没删掉的记录**仍然存在**，列表必须能看见它们。
         * 清空本段后内存已清空，若不重载，界面会显示成"什么都没有"——
         * 那正是"假装删干净了"的另一种形态（用户看不见 ≠ 已被删除）。
         */
        try { this.load(); } catch { /* 重载失败：内存保持空，但 partial 已如实上报 */ }
        // eslint-disable-next-line no-console
        console.warn(
          `[dsh-github-flow] 清空操作记录：其他进程正持有锁，本次只清空了本进程的段；` +
          `另有 ${others.length} 个段的记录未被删除。`
        );
        return result;
      }
      let liveSkipped = 0;
      try {
        for (const seg of others) {
          /*
           * **正在被写的段不删**。删掉它以后，对方进程内存里仍有这些行，
           * 一次普通压实（例如删单条）就会整段重建——用户以为自己清空了，
           * 过一会儿记录又"复活"到磁盘上。此时如实报 partial，比删了又被写回来好。
           */
          if (this.isSegmentLive(seg.path)) { liveSkipped++; continue; }
          try { fs.unlinkSync(seg.path); } catch { liveSkipped++; }
        }
        const left = this.listSegments().filter((s) => s.path !== this.file).length;
        result.partial = left > 0;
        result.remaining = left;
        result.cleared = 1 + (others.length - left);
        if (left > 0) {
          // 没删掉的记录必须仍可见（同 partial 分支的理由）
          try { this.load(); } catch { /* 重载失败也不谎报成功 */ }
          // eslint-disable-next-line no-console
          console.warn(
            `[dsh-github-flow] 清空操作记录：${liveSkipped} 个段最近仍在被写入（或无法删除），本次未删除；` +
            `关闭其他 DSH 实例后再清空一次即可。`
          );
        }
        return result;
      } finally {
        this.releaseLock(lockPath);
      }
    } catch {
      return result; // Fail-Open
    }
  }

  /**
   * 抢跨段清空的互斥锁。
   *
   * 用 `O_EXCL` 而不是"先 existsSync 再 write"：后者是两次系统调用，
   * 两个进程同时清空时会**双双通过检查**——那正是我们要防的读改写。
   *
   * 过期锁（崩溃遗留）会被抢过来：锁的存在只表示"有人在清空"，
   * 一个 30 秒还没删的锁一定是死进程留下的。方向是安全的那一侧——
   * 抢过期锁最多让两次清空撞在一起（都是删操作，幂等），
   * 而不抢会让「清空」永久退化成 partial。
   */
  private acquireLock(lockPath: string): boolean {
    try {
      fs.writeFileSync(lockPath, this.lockToken, { encoding: 'utf8', flag: 'wx' });
      return true;
    } catch {
      // 抢不到：看是不是过期锁（用注入时钟，测试才能控制过期判定）
      try {
        const stat = fs.statSync(lockPath);
        if (this.now() - stat.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath);
          fs.writeFileSync(lockPath, this.lockToken, { encoding: 'utf8', flag: 'wx' });
          return true;
        }
      } catch {
        // 锁在两次调用之间消失了（对方刚释放）：重试一次抢占
        try {
          fs.writeFileSync(lockPath, this.lockToken, { encoding: 'utf8', flag: 'wx' });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  /**
   * 释放锁。**只在锁仍属于本实例时**才删。
   *
   * 为什么不能无条件 unlink：锁可能因超时被别的进程按"过期锁"抢走并重写，
   * 此时无条件删掉等于把**别人的**临界区打开，第三方可以同时进来清空。
   * 令牌用 `pid:序号` 而不是裸 pid——同一进程里的多个 store 实例（测试、热重载）
   * pid 相同，裸 pid 会让实例 A 误删实例 B 的锁。
   */
  private releaseLock(lockPath: string): void {
    try {
      const owner = fs.readFileSync(lockPath, 'utf8').trim();
      if (owner !== this.lockToken) return;
      fs.unlinkSync(lockPath);
    } catch { /* 已被别人清掉 / 读不到：无副作用 */ }
  }

  /** 当前内存行数（诊断用） */
  rowCount(): number {
    return this.rows.length;
  }

  /**
   * 近 N 天的人工审核汇总（s3，给 `/gh status` 的健康看板用）。
   *
   * 为什么从 `list()` 聚合而不进 `TelemetryCollector`：遥测是"工具链健康"，审核是
   * "人机协作"。混在一起会让健康分被"用户今天点了很多次拒绝"拉低——那是用户认真，
   * 不是系统有病。两者的数据源与解读方式都不同，只是恰好印在同一页上。
   *
   * 平均等待时间取 **decision.at - intent.at**：`recordDecision` 用 `this.now()`，
   * `recordCall` 的 intent 也用 `this.now()`，两者同一时钟，差值即真实等待。
   * 没有 intent 的决策是孤儿（记录被淘汰），不计入等待时间——凭空造一个 0 会让均值失真。
   */
  approvalStats(days = 7): {
    pending: number;
    approved: number;
    rejected: number;
    noClient: number;
    cancelled: number;
    avgWaitMs: number | null;
    total: number;
  } {
    const out = { pending: 0, approved: 0, rejected: 0, noClient: 0, cancelled: 0, avgWaitMs: null as number | null, total: 0 };
    try {
      const since = this.now() - Math.max(1, days) * 86_400_000;
      const waits: number[] = [];
      const { items } = this.list({ since, all: true });
      for (const it of items) {
        switch (it.decision) {
          case 'approved': out.approved++; break;
          case 'rejected': out.rejected++; break;
          case 'no-client': out.noClient++; break;
          case 'cancelled': out.cancelled++; break;
          case 'expired': out.pending++; break;
          default: continue; // auto / confirmed 不算"待决"，也不是人工结论
        }
        out.total++;
        /*
         * 等待时长 = 结论落盘 − **发起请求**。
         *
         * 不能拿 intent 行的 `at` 当起点：intent 要等 `tools/result`（工具执行完）才写，
         * 而决策在 `pre-execute` 就产生了 —— 两者相减恒为负，"等待"根本没有数据源
         * （早先的实现就是这样，看板永远显示 0 秒）。
         * 拿不到 `askedAt` 的旧记录**不计入**，而不是按 0 计入：那会把均值往下拉成假数据。
         */
        if (it.decision !== 'expired') {
          const asked = it.askedAt;
          const done = it.decisionAt;
          if (typeof asked === 'number' && typeof done === 'number' && done >= asked) {
            waits.push(done - asked);
          }
        }
      }
      if (waits.length > 0) {
        out.avgWaitMs = Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
      }
    } catch {
      /* Fail-Open：统计失败不该让 health 看板整体失败 */
    }
    return out;
  }

  /**
   * 导出为 JSON 字符串（s3）。
   *
   * 只导出**当前内存里保留的全部记录**（= s1b 预算下的实际条数），不写死数字：
   * 写死 2000 会在预算调大后少导、调小后导出根本不存在的东西。
   *
   * 为什么 `JSON.stringify(…, null, 2)` 而不是紧凑格式：导出件的用途是"留档 / 贴进
   * issue / 交给同事"，可读性是第一位的；体积在几条到几万条量级，压不压缩差别不大。
   */
  exportJson(filter: AuditFilter = {}): string {
    const { items, total } = this.list({ ...filter, all: true, offset: 0 });
    return JSON.stringify(
      {
        exportedAt: new Date(this.now()).toISOString(),
        count: items.length,
        // total 与 count 一起给：将来若有人给 list() 加上限，导出件能自己暴露"少导了"
        total,
        // 导出件必须自解释：拿到文件的人要能判断"这是哪台机器、什么口径、为什么缺了几条"
        scope: filter.cwd ? 'workspace' : 'global',
        cwd: filter.cwd || null,
        usage: this.usage(),
        items,
      },
      null,
      2
    );
  }

  /**
   * 导出为 Markdown 表格（s3）。
   *
   * 决策列**必须显式区分** `approved` / `rejected` / `no-client`：导出件最常见的用途
   * 就是事后对账，模糊这几者等于让导出件撒谎——"用户点了拒绝"和"根本没有客户端可问"
   * 是性质完全不同的两件事，前者是人的意志，后者是部署缺陷。
   *
   * 被拒绝条目的留言原文用引用块附在表格后：表格单元格里塞多行留言会把整张表撑烂。
   */
  exportMarkdown(filter: AuditFilter = {}): string {
    const { items, total } = this.list({ ...filter, all: true, offset: 0 });
    // usage() 只取一次：它每次都重算段数与总字节，在表头里调四次纯属白干
    const u = this.usage();
    const decisionText: Record<string, string> = {
      auto: '自动（无人工介入）',
      confirmed: '确认',
      approved: '已批准',
      rejected: '已拒绝',
      expired: '已超时',
      // 不用"未审核"：那是"没人看过"的意思，与"没有可用的审核端"是两件事。
      // 后者是部署缺陷（headless / 未装审核 UI），前者可能只是没走到。事后对账必须能分清。
      'no-client': '无客户端（没有可用的审核端）',
      cancelled: '已取消',
    };
    const resultText: Record<string, string> = { ok: '成功', fail: '失败', unknown: '未知（无结果）' };
    const esc = (v: unknown): string => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

    const lines: string[] = [
      '# GitHub 操作记录导出',
      '',
      `- 导出时间：${new Date(this.now()).toISOString()}`,
      `- 记录条数：${items.length}${total > items.length ? `（共 ${total} 条，本次仅导出前 ${items.length} 条）` : ''}`,
      `- 作用域：${filter.cwd ? `当前工作区（${filter.cwd}）` : '全局（本机所有工作区）'}`,
      `- 存储：${u.rows} 行 / ${(u.bytes / 1048576).toFixed(2)} MB（预算 ${(u.maxBytes / 1048576).toFixed(0)} MB，${u.segments} 个段）`,
      '',
      '| 时间 | 摘要 | 决策 | 结果 | 仓库 | 工作区 |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ];
    for (const it of items) {
      lines.push(
        `| ${new Date(it.at).toISOString()} | ${esc(it.summary)} | ${esc(decisionText[it.decision] || it.decision)} | ` +
        `${esc(resultText[it.result] || it.result)}${it.errorType ? `（${esc(it.errorType)}）` : ''} | ` +
        `${esc(it.repo || '-')} | ${esc(it.cwd || '-')} |`
      );
    }
    const rejected = items.filter((it) => it.decision === 'rejected' && it.feedback);
    if (rejected.length > 0) {
      lines.push('', '## 被拒绝条目的留言原文', '');
      for (const it of rejected) {
        lines.push(`- **${esc(it.summary)}**（${new Date(it.at).toISOString()}）`, '');
        for (const line of String(it.feedback).split(/\r?\n/)) lines.push(`  > ${line}`);
        lines.push('');
      }
    }
    return lines.join('\n') + '\n';
  }

  /**
   * 存储用量与当前口径。UI 与路由的唯一真相。
   *
   * 三个字段必须分开，别再合并：
   * - `enabled`：**用户的意图**（开关位置）。UI 的复选框读它。
   * - `degraded`：存储坏了的原因（目录不可写等）。
   * - `active`：**实际是否在工作** = `enabled && !degraded`。消费方（s2 的审核前置、
   *   弹窗的关闭态）只能读这个。
   *
   * 为什么不能把 `enabled` 直接算成"且未降级"（第一版就是这么写的）：磁盘坏掉时
   * 复选框会显示成"未勾选"，用户以为自己关过；他再点一下"开启"，`enabled` 已经
   * 是 true → `setEnabled` 判定无变化直接返回，界面纹丝不动。**一个怎么点都不动的开关，
   * 比明确的错误提示更糟。**
   */
  usage(): AuditUsage {
    return {
      enabled: this.enabled,
      active: this.enabled && !this.degradedReason,
      rows: this.rows.length,
      bytes: this.totalBytes,
      maxRows: this.maxRows,
      maxBytes: this.maxBytes,
      degraded: this.degradedReason,
      segments: this.segOrder.length || (this.enabled && !this.degradedReason ? 1 : 0),
    };
  }

  /**
   * 当前审核档位。`main.ts` 的闸门**每次调用现读**，因此设置页改完立刻生效（无需重启）。
   */
  approvalMode(): ApprovalMode {
    return this.mode;
  }

  /** 审核规则原文（设置页回显用） */
  approvalRules(): string[] {
    return this.ruleList.slice();
  }

  /**
   * 是否配置了**能生效**的审核规则。
   *
   * 为什么单独暴露：默认配置下规则为空，此时"按调用解析仓库"（读 `.git/config` +
   * 会话反查）完全是浪费——`main.ts` 的 `getMode` 靠它短路，把这份同步 I/O 从
   * 每次工具调用降为"用户真的写了规则时才有"。
   * 只看**解析成功**的条数：写了一堆错规则等于没规则，同样不必解析仓库。
   */
  hasApprovalRules(): boolean {
    return this.parsedRules.rules.length > 0;
  }

  /**
   * 解析后的规则与忽略项。
   *
   * 闸门走 `resolveModeFor()` 而不是每次自己解析：规则解析是热路径上的一次字符串
   * 遍历，每次工具调用都重做一遍毫无必要，且解析结果与设置页回显必须是**同一份**。
   */
  parsedApprovalRules(): ParsedRules {
    return this.parsedRules;
  }

  /**
   * 这一次调用该用哪个档位（含规则覆盖）。
   *
   * `read_only` 在注册期就剪掉了写 action，策略根本没机会跑——这条边界必须写进文档，
   * 否则用户配了 `all-writes` 又抱怨不弹窗。
   *
   * 走 `evaluateRules`（与 `resolveApprovalMode` 同一段匹配逻辑）而不是自己再写一遍：
   * 两处各写一遍必然漂移，而漂移的后果是"设置页说命中、闸门说不命中"。
   */
  resolveModeFor(ctx: { tool: string; action: string; repo?: string }): ApprovalMode {
    return evaluateRules(this.parsedRules, this.mode, ctx);
  }

  /** 改审核档位并落盘。运行期立即生效。 */
  setApprovalMode(mode: string): AuditUsage {
    if (this.disposed) return this.usage();
    this.mode = normalizeApprovalMode(mode);
    this.saveSettings();
    return this.usage();
  }

  /**
   * 改审核规则并落盘。运行期立即生效。
   *
   * 非法规则**不阻止保存**（用户可能正写一半），但解析结果会被设置页回显，
   * 且闸门只用能解析的那些——静默忽略一条策略比多问一次危险得多。
   */
  setApprovalRules(rules: string[]): AuditUsage {
    if (this.disposed) return this.usage();
    this.ruleList = Array.isArray(rules) ? rules.filter((r) => typeof r === 'string').map((r) => r.trim()).filter(Boolean) : [];
    this.parsedRules = parseApprovalRules(this.ruleList);
    if (this.parsedRules.ignored.length > 0) {
      // 不静默：策略失效是"看起来在工作"的最坏形态
      // eslint-disable-next-line no-console
      console.warn(
        `[dsh-github-flow] 审核规则有 ${this.parsedRules.ignored.length} 条无法解析，已忽略：` +
        this.parsedRules.ignored.map((x) => `${x.raw}（${x.reason}）`).join('；')
      );
    }
    this.saveSettings();
    return this.usage();
  }

  /** 设置项共用一次落盘（失败只 warn：设置写不进去不该让功能失效） */
  private saveSettings(): void {
    saveAuditSettings(this.settingsDir, {
      enabled: this.enabled,
      budgetBytes: this.maxBytes,
      approvalMode: this.mode,
      approvalRules: this.ruleList,
    });
  }

  /**
   * 改预算并**立刻生效**（无需重启）。异步：必须先等在途刷盘收尾再压实。
   *
   * 改小必须当场淘汰 + 同步压实：用户把 8 MB 降到 1 MB 时，"下次写入才缩"等于没缩，
   * 而这一步的代价只是一次顺序写，与 `delete()` 同一条路径。
   */
  async setBudget(bytes: number): Promise<AuditUsage> {
    if (this.disposed) return this.usage();
    this.maxBytes = clampBudget(bytes);
    this.maxRows = deriveMaxRows(this.maxBytes);
    if (this.enabled && !this.degradedReason) {
      if (this.enforceBudget()) {
        // 顺序不能反：在途 append 用的是它自己算好的字符串，抢在它前面落盘的话，
        // 那次 append 会把刚淘汰的行追加回来（与 delete() 同一条竞态）。
        await this.quiesce();
        this.pending = [];
        this.needsRewrite = true;
        this.writeSnapshotSync();
      }
    }
    // 持久化交给 store 自己做：路由只调一个方法，避免"改了运行时忘了写文件"
    this.saveSettings();
    return this.usage();
  }

  /**
   * 开/关记录，运行时生效。
   *
   * 关闭时：先等在途刷盘收尾（否则它会再写一批），再清攒批队列、丢弃已加载的行
   * （释放内存）。历史文件**不删**——那是用户的文件，要删走 `clear()`。
   * 打开时：重新 `load()` 并按当前预算淘汰，随后照常记录。
   */
  async setEnabled(flag: boolean): Promise<AuditUsage> {
    if (this.disposed) return this.usage();
    const next = flag === true;
    if (next === this.enabled) return this.usage();
    await this.quiesce();
    this.enabled = next;
    if (!next) {
      if (this.flushTimer) {
        try { clearTimeout(this.flushTimer); } catch { /* 忽略 */ }
        this.flushTimer = null;
      }
      this.pending = [];
      this.rows = [];
      this.rowBytes = [];
      this.rowSeg = [];
      this.totalBytes = 0;
      this.segOrder = [];
      this.segRows.clear();
      this.segBytes.clear();
    } else {
      try {
        this.load();
      } catch {
        /* 加载失败按空库继续：不因为读不出历史就不记录 */
      }
    }
    // 状态应用完再落盘：写文件失败时内存状态仍是对的，反之会留下"文件说开着、实际关着"
    this.saveSettings();
    const after = this.usage();
    try { this.onEnabledChange?.(after); } catch { /* 通知失败不影响开关本身 */ }
    return after;
  }

  /** 卸载：清定时器 + 末次刷盘。幂等。 */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    if (this.flushTimer) {
      try { clearTimeout(this.flushTimer); } catch { /* 忽略 */ }
      this.flushTimer = null;
    }
    try {
      // 复查残余：若末次 flush 恰好与在途那趟共用（返回值不代表本次已落盘），
      // 再补刷一次，避免卸载时丢掉最后几条记录。
      for (let i = 0; i < 3; i++) {
        await this.flush();
        if (!this.needsRewrite && this.pending.length === 0) break;
      }
    } catch {
      /* 卸载期失败不再重试 */
    }
    this.disposed = true;
  }
}
