/**
 * 执行前人工审核闸门（s2）：**判定**放在 `tools/pre-execute`，**问答**交给 DSH 官方
 * `ctx.approval`（`@deepseek-ai/dsh-user-approval` + `dsh-client-ui-approval`）。
 *
 * 为什么不再自建弹窗与审批队列：s2 的 v1 把官方接缝与官方 UI 各重写了一遍（约 1,100 行），
 * 结果更弱、且引入一次客户端白屏。官方弹窗是**接管输入区**的 composer takeover，
 * 由宿主负责展示、超时、取消与"asked/decided"审计对；插件只该回答一个问题：
 * **这一次调用要不要问人。**
 *
 * 三条硬约束（每条都有对应断言，见 `test/phase53-approval.test.mjs`）：
 *
 * 1. **`policy === 'never'` 必须短路。** 宿主在派发前就把 ask 判成 `rejected`
 *    （`dsh-user-approval/src/index.ts:301` 的 `decide()`），不短路的话，`danger-full-access`
 *    预设（该预设把 approval 固定写成 `never`，见 `dsh-permission-presets/src/index.ts:182-191`）
 *    下**每一次**合并都会被确定性拒绝，插件从"多一次确认"变成"完全不能用"。
 * 2. **`unavailable` 与 `rejected` 不是一件事。** 前者是"根本没有 answerer"（headless、
 *    未装审核 UI），必须退回工具体既有的 `confirm` 闸门；后者才是"用户说不"。
 *    混为一谈会让无审核能力的部署把全部写操作判死。
 * 3. **不表态时必须调 `next()`。** `tools/pre-execute` 是 waterfall（`events.ts:18`），
 *    返回 `{kind:'allow'}` 会把排在后面的监听器（沙箱、计划模式等）的拒绝权一起吞掉——
 *    那是权限提权，不是"我没意见"。
 *
 * 还有一条与 v1 不同的取舍：**审核不再依附操作记录**。宿主自带 `approval/asked` +
 * `approval/decided` 的 durable 审计对，所以"记录关着就停用审核"这条旧约束作废；
 * 关掉记录只意味着这一次决策不进本插件的 JSONL（`recordDecision` 自带关闭判定）。
 */
import { classifyWrite, isAuditedTool, summarizeOperation } from './audit.js';
import type { ApprovalMode, AuditDecision } from './audit.js';
import { isDestructiveCall, markApproved } from './destructive.js';
import { stashTargetTitle } from './target-title.js';
import type { TargetInfo } from './target-title.js';

/** 宿主 `ApprovalOutcome` 是封闭枚举：只有 `allowed-once` 是放行（`dsh-user-approval/src/types.ts:32`） */
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable';

/** 宿主审批策略。`never` = 派发前直接判 `rejected`，任何监听器都拦不住 */
type ApprovalPolicy = 'ask' | 'never';

/** `PreToolDecision` 里本模块会用到的三种形态（类型来自 `dsh-tools/src/contracts.ts:375-379`） */
interface PreDecision {
  kind: 'allow' | 'deny' | 'cancel' | 'ask';
  reason?: string;
  info?: { name: string; code: string };
}

/** 被审核的调用里，本模块只读这几个字段（宿主 `ToolExecution` 的子集） */
interface GateExec {
  name?: unknown;
  arguments?: any;
  callId?: unknown;
  agent?: any;
  signal?: any;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** 动作名。缺省空串——`github_pr` 之类没有 action 维度的调用自然落到"非写/非高危" */
function actionOf(exec: GateExec | undefined): string {
  const action = exec?.arguments?.action;
  return typeof action === 'string' ? action : '';
}

/**
 * 该不该问人（纯函数，离线可测）。
 *
 * 作用域与记录同源：只有 `AUDITED_TOOLS`（PR / Issue）。这条白名单本身就是"只碰
 * `github_*`"的保证——它只含本插件的工具名；其余 17 个工具各有自己的 `confirm` 闸门，
 * 这里再拦一次只会让一次操作问两遍。
 *
 * 档位口径：
 * - `destructive`：用 `isDestructiveCall`（闸门表 + `when` 条件），不是 `classifyRisk`。
 *   差别在 `github_pr checkout`——不带 `force` 时 `classifyRisk` 仍算 destructive
 *   （它只看键存在），而闸门表里 `when` 明确要求 `force === true`。审核要贴合"真的危险"，
 *   否则每次检出 PR 都要弹一次窗。
 * - `all-writes`：用 `classifyWrite`，与只读档位/记录同一个真源（`WRITE_ACTIONS`）。
 *   注意 `confirm: true` **不豁免**审核：否则模型只要每次都带上 `confirm` 就能绕过弹窗。
 *
 * `mode` 由调用方现算（s3 起它可能是**规则覆盖后**的结果，见 `resolveModeFor`），
 * 本函数只管"这个档位下要不要问"，不关心档位从哪来——两件事分开才测得住。
 */
export function shouldAsk(exec: GateExec | undefined, mode: ApprovalMode): boolean {
  const name = str(exec?.name);
  if (!isAuditedTool(name)) return false;
  if (mode === 'off') return false;
  const action = actionOf(exec);
  if (mode === 'all-writes') return classifyWrite(name, action);
  return isDestructiveCall(name, exec?.arguments);
}

/**
 * 这次调用是不是"作用域内的写操作"——**不看档位**。
 *
 * 单独拆出来是为了给闸门做前置短路：算档位（s3 起要按调用解析仓库，含同步读
 * `.git/config`）比重判一次 `classifyWrite` 贵得多，而读调用在任何档位下都不会被问。
 * 语义上它与 `shouldAsk` 不冲突：`shouldAsk` 内部对读 action 恒为 false
 * （`destructive` 走闸门表、`all-writes` 走同一张 `WRITE_ACTIONS`）。
 */
export function isWriteCall(exec: GateExec | undefined): boolean {
  const name = str(exec?.name);
  if (!isAuditedTool(name)) return false;
  return classifyWrite(name, actionOf(exec));
}

/**
 * 读会话的**有效**审批策略。
 *
 * 宿主没暴露 `effectivePolicy()`（它是 private），但两个公开口子够用：
 * `overrideOf(session)`（会话内是否切过，公开方法）→ `config.policy`（public 构造参数）。
 * 与宿主自己的 `derive()`（`dsh-permission-presets/src/index.ts:350`）同序，避免
 * "设置页显示一个档、实际按另一个档执行"。
 *
 * ⚠️ 两处**故意**与宿主不同：
 * 1. 宿主在两处都读不到时用 `'ask'` 兜底，这里返回 `undefined`（"读不出来"）——
 *    因为 `'ask'` 会让 `danger-full-access` 预设下每次合并都被确定性拒绝、且毫无痕迹。
 * 2. **读不到会话覆盖时不许退化成 `config.policy`**：`danger-full-access` 是把 `never`
 *    写成**会话覆盖**（`setApprovalPolicy` → `approval/policy`），而 `config.policy`
 *    恒为部署默认 `'ask'`。一旦 `agent.session` / `overrideOf` 在后续宿主版本变样，
 *    退化就会漏掉那个 `never`，正是本文件头约束 1 要防的死法。
 *
 * @returns `undefined` = 读不出来。调用方应**不判**、直接问，并留一条 warn。
 */
export function resolveEffectivePolicy(approval: any, agent: any): ApprovalPolicy | undefined {
  try {
    const session = agent?.session;
    if (!session || typeof approval?.overrideOf !== 'function') return undefined;
    const override = approval.overrideOf(session);
    if (override === 'ask' || override === 'never') return override;
    const configured = approval?.config?.policy;
    return configured === 'ask' || configured === 'never' ? configured : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 弹窗文案的硬上限（用户定：最高 1000 字）。
 *
 * 依据（2026-11-26 读官方 `dsh-client-ui-approval` 产物）：`reason` 被当作卡片标题渲染，
 * 卡片正文区自带 `max-height` + `overflow-y:auto`，按钮在滚动区**之外** —— 所以再长也
 * 顶不出去，只会在卡片内滚动。1000 字 ≈ 16 行，是"够判断"与"不用翻很久"的折中。
 * 超出就截掉尾部并加省略符，且**总长（含省略符）不超过这个数**。
 */
export const MAX_REASON_CHARS = 1000;

/** 截断标记。用中文省略号而不是单字符 `…`：在 15px 正文里更醒目，一眼看出"后面还有" */
const ELLIPSIS = '……';

/** 截到 `max` 字以内；超限时结尾补省略符，且省略符本身也计入上限 */
function clipWithEllipsis(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max <= ELLIPSIS.length) return ELLIPSIS.slice(0, max);
  return text.slice(0, max - ELLIPSIS.length) + ELLIPSIS;
}

const clip = (v: unknown, max: number): string => {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return t.length > max ? t.slice(0, max) + '…' : t;
};

/** 状态的人话。Issue 的"已关闭"必须带上关闭原因：completed 与 not planned 是相反的语义 */
function stateText(target: TargetInfo): string {
  if (target.state === 'OPEN') return target.isDraft ? '草稿' : '开放';
  if (target.state === 'MERGED') return '已合并';
  if (target.state === 'CLOSED') {
    if (target.stateReason === 'COMPLETED') return '已关闭（已完成）';
    if (target.stateReason === 'NOT_PLANNED') return '已关闭（未计划）';
    if (target.stateReason === 'REOPENED') return '已关闭（曾被重开）';
    return '已关闭';
  }
  return target.state ? String(target.state) : '';
}

/** CI 汇总的人话。null/缺失 = 这个提交没有配置检查，要说成"无检查"而不是"通过" */
function checkText(state: string | null | undefined): string {
  if (state === undefined) return '';
  if (state === null) return '无 CI 检查';
  switch (state) {
    case 'SUCCESS': return 'CI 通过';
    case 'FAILURE': return 'CI 失败';
    case 'PENDING': return 'CI 进行中';
    case 'ERROR': return 'CI 出错';
    case 'EXPECTED': return 'CI 等待中';
    default: return 'CI ' + state;
  }
}

function reviewText(decision: string | undefined): string {
  switch (decision) {
    case 'APPROVED': return '已批准';
    case 'CHANGES_REQUESTED': return '被要求修改';
    case 'REVIEW_REQUIRED': return '待评审';
    default: return '';
  }
}

/**
 * 元信息行。为什么它比正文首段更值钱：看一眼「CI 失败 · 改动 38 个文件 · 被要求修改」
 * 就知道不该合，不必读正文。全部按"有才显示"拼，缺任何一项都不留空位。
 */
function metaLine(target: TargetInfo, kind: 'pr' | 'issue'): string {
  const parts: string[] = [];
  const st = stateText(target);
  if (st) parts.push('状态：' + st);
  if (target.author) parts.push('作者：@' + target.author);
  if (kind === 'pr') {
    if (typeof target.additions === 'number' || typeof target.deletions === 'number') {
      parts.push(`+${target.additions ?? 0} −${target.deletions ?? 0}`);
    }
    if (typeof target.changedFiles === 'number') parts.push(`改动 ${target.changedFiles} 个文件`);
    const ci = checkText(target.checkState);
    if (ci) parts.push(ci);
    const rv = reviewText(target.reviewDecision);
    if (rv) parts.push(rv);
  }
  if (typeof target.commentsCount === 'number') parts.push(`${target.commentsCount} 条评论`);
  return parts.join(' · ');
}

/**
 * 把 Markdown 正文压成适合纯文本卡片的形态。
 *
 * 为什么必须压：卡片标题是纯文本节点，不渲染 Markdown —— `## 标题`、`**加粗**`、
 * `![图](url)` 原样露出来就是一堆符号噪音。只做"去掉标记、保留文字"的无损压缩：
 * 代码围栏 / HTML 注释整行丢弃，链接留文字，图片换成［图］。
 *
 * 换行策略（卡片已能保留换行，见 styles.ts 的 white-space 规则）：
 * **列表项各自独占一行**，其余段落用空格衔接。真机截图实证：4 个列表项挤在一行里
 * （"· 自动获取… · 支持查看… · 支持在…"）读起来像流水账，拆开后一眼能扫完要点。
 * 只拆列表项、不拆普通段落，是为了不让卡片被大量短行撑得太高。
 */
export function flattenBody(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;
  for (let line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) { out.push(line.trim()); continue; }
    line = line.replace(/<!--[\s\S]*?-->/g, ' ');
    line = line.replace(/!\[([^\]]*)\]\([^)]*\)/g, '［图］');
    line = line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    line = line.replace(/(\*\*|__|~~|`+)/g, '');
    line = line.replace(/^\s*#{1,6}\s+/, '');
    line = line.replace(/^\s*>\s?/, '');
    line = line.replace(/^\s*[-*+]\s+/, '· ');
    line = line.replace(/^\s*\d+\.\s+/, '· ');
    // 任务列表：- [ ] / - [x] → 复选框符号（方括号在纯文本里是噪音）
    line = line.replace(/^· \[ \]\s*/, '· ☐ ').replace(/^· \[[xX]\]\s*/, '· ☑ ');
    line = line.replace(/\s+/g, ' ').trim();
    if (line) out.push(line);
  }
  let text = '';
  let prevWasItem = false;
  for (const item of out) {
    const isItem = item.startsWith('· ');
    // 列表项独占一行；列表**之后**的第一段普通文字也另起一行（否则会接在最后一个列表项尾巴上）
    const sep = text === '' ? '' : (isItem || prevWasItem) ? '\n' : ' ';
    text += sep + item;
    prevWasItem = isItem;
  }
  return text.trim();
}

/** 本次调用**要提交**的内容（来自参数，不是远端）。按展示顺序返回若干 [标签, 正文] */
function submittedContent(action: string, args: any): { label: string; text: string }[] {
  const body = typeof args?.body === 'string' ? args.body : '';
  // body_file 是"正文来自本地文件"的通道：审核阶段不读文件（门禁里做 IO 是新的失败面），
  // 如实告诉他正文从哪来，比假装"无正文"有用。
  const bodyFile = typeof args?.body_file === 'string' ? args.body_file.trim() : '';
  const bodyEntry = (emptyLabel: string): { label: string; text: string } => {
    if (bodyFile) return { label: '正文', text: `来自本地文件 ${clip(bodyFile, 80)}（审核时不读取文件内容）` };
    const flat = flattenBody(body);
    return { label: '正文', text: flat || emptyLabel };
  };

  if (action === 'comment') return [{ label: '将发表的评论', text: bodyEntry('（空评论）').text }];
  if (action === 'create') return [{ label: '将提交的正文', text: bodyEntry('（无）').text }];
  if (action === 'edit') {
    const out: { label: string; text: string }[] = [];
    const title = typeof args?.title === 'string' ? args.title.trim() : '';
    if (title) out.push({ label: '新标题', text: clip(title, 200) });
    out.push({ label: '将提交的正文', text: bodyEntry(title ? '（不改正文）' : '（无改动）').text });
    return out;
  }
  return [];
}

/**
 * 拼出弹窗文案（可多行）：
 *
 *   即将执行：合并 PR #19（squash）｜「feat(proxy): 支持自动跟随系统代理」
 *   状态：已合并 · 作者：@mrgeda · +2255 −293 · 改动 20 个文件 · 无 CI 检查 · 3 条评论
 *   正文：> 本 PR 是 #19 的修订版……
 *
 * 排列顺序就是"拍板时先看什么"：做什么 → 它是什么状态 → 它说了什么。
 *
 * `create` 不查远端（实体还不存在，参数里自带的标题摘要里已有），只展示**将要提交**的内容；
 * `comment` 先展示将要发表的评论，再有余量才带目标的正文；`edit` 同时给出新标题与新正文。
 *
 * 第二个参数兼容只给标题的字符串（旧调用方 / 测试），等价于只有 `title` 的 `TargetInfo`。
 * 取不到任何远端信息时安静退回纯摘要，绝不拖慢或阻断审核。
 */
export function askReason(exec: GateExec | undefined, target?: TargetInfo | string): string {
  const name = str(exec?.name);
  const action = actionOf(exec);
  const summary = summarizeOperation(name, action, exec?.arguments);
  const args = exec?.arguments;
  const info: TargetInfo | undefined =
    typeof target === 'string' ? { title: target.trim() } : target;
  const kind = name === 'github_pr' ? 'pr' : name === 'github_issue' ? 'issue' : null;

  // 第 1 行：动作 + 对象**当前**标题（edit 也保留：拍板要知道"改的是哪一条"）
  let head = `即将执行：${summary}`;
  const title = (info?.title ?? '').trim();
  if (title && action !== 'create') head += `｜「${clip(title, 120)}」`;

  // 第 2 行：对象现状（只有按编号操作既有实体时才有）
  const lines: string[] = [head];
  if (info && kind && action !== 'create') {
    const meta = metaLine(info, kind);
    if (meta) lines.push(meta);
  }

  /*
   * 正文段：先放"这次要提交的"，再放"对象现在的"。
   * 预算是减去已有行与标签、以及省略符之后剩下的字数 —— 保证总长不超过上限。
   */
  const budgetFor = (label: string) => {
    const used = lines.join('\n').length + 1 + label.length;
    return MAX_REASON_CHARS - used;
  };
  const pushBody = (label: string, text: string) => {
    const flat = text.trim();
    if (!flat) return;
    const room = budgetFor(label);
    if (room <= ELLIPSIS.length + 8) return; // 连一句话都放不下就不占位
    lines.push(label + clipWithEllipsis(flat, room));
  };

  const isNew = action === 'create' || action === 'edit' || action === 'comment';
  if (isNew) {
    for (const part of submittedContent(action, args)) pushBody(part.label + '：', part.text);
  }
  if (info && kind && action !== 'create') {
    // comment / edit 已用额度给"要提交的内容"；对象正文排在后面，有余量才显示
    const label = isNew ? `${kind === 'pr' ? '该 PR' : '该 Issue'} 当前正文：` : '正文：';
    pushBody(label, flattenBody(info.body));
  }

  // 兜底：理论上到不了这里（每段都按预算裁），但"总长不超上限"必须是硬保证
  return clipWithEllipsis(lines.join('\n'), MAX_REASON_CHARS);
}

/**
 * 拒绝后回给模型的话。
 *
 * 为什么不是 JSON 载荷：`pre-execute` 的 `deny` 只能给一段 `reason` 文本 + 结构化
 * `info`（`contracts.ts:377`），工具结果的 `content` 由宿主拼装，插件无法塞自定义 JSON。
 * 于是把 v1 里 `requiredAction` 想说的事直接写成句子——模型读的是这段话，不是字段。
 */
export function rejectionMessage(exec: GateExec | undefined): string {
  const name = str(exec?.name);
  const summary = summarizeOperation(name, actionOf(exec), exec?.arguments);
  return `用户拒绝了「${summary}」。不要重试同一动作：先向用户确认意图；若只是想核对现状，改用只读接口（view / list / diff）。`;
}

export interface ApprovalGateDeps {
  /**
   * 当前审核档位。**每次调用现读**，设置页改完立刻生效。
   *
   * s3 起这里可能是**规则覆盖后**的档位：`main.ts` 用 `resolveModeFor()` 把
   * `repo:` / `action:` 规则算进去再交进来。闸门自身不解析规则——它只管
   * "这个档位下要不要问"，两件事分开才各自可测。
   */
  getMode: (exec: GateExec | undefined) => ApprovalMode;
  /** `ctx.get('approval')`。不用 inject：拿不到就退回 `next()`，而不是让插件永久 PENDING */
  getApproval: () => any;
  /**
   * 写一条人工决策（id 用宿主的 callId，与 intent/result 折成一条记录）。
   *
   * `askedAt` = 发起审核请求的时刻。必须由闸门提供，因为**只有它知道用户从哪一刻开始被问**：
   * intent 行要等 `tools/result`（工具执行完）才写，拿它当起点算出来的是负数。
   */
  recordDecision: (callId: string, decision: AuditDecision, askedAt?: number) => void;
  /**
   * 取"被操作的那个 PR/Issue 的现状"（标题 / 状态 / 作者 / 增删 / CI / 正文，可选）。
   *
   * 只在真的要弹窗时才调用（`shouldAsk` 通过之后），且结果同时给弹窗与记录 ——
   * 所以同一次操作最多一次 gh 往返。缺省时不查，弹窗退回纯摘要。
   */
  resolveTarget?: (exec: GateExec | undefined) => Promise<TargetInfo | undefined>;
  /** 把**标题**递给记录侧（`tools/result` 是同步切面，拿不到这里的异步结果） */
  stashTitle?: (callId: string, title: string) => void;
  warn: (message: string) => void;
}

/**
 * 造一个 `tools/pre-execute` 监听器。
 *
 * 返回值语义（对照 `PreToolDecision`）：
 * - 不需要问 / 没有审核能力 / 策略为 `never` → `next()`（交回后续监听器与工具体）
 * - 批准 → `markApproved(callId)` 后 `next()`（旁路工具体的 `confirm`，见 `destructive.ts`）
 * - 拒绝 → `{kind:'deny'}`，带 `ApprovalError`/`APPROVAL_REJECTED` 身份
 * - 取消 → `{kind:'cancel'}`（宿主给出规范的 `ABORTED_BEFORE_DISPATCH`）
 * - `unavailable` → `next()`（见文件头约束 2）
 */
export function createApprovalGate(deps: ApprovalGateDeps) {
  return async function approvalGate(exec: GateExec | undefined, next: () => Promise<PreDecision>): Promise<PreDecision> {
    /*
     * forwarded 标记：cordis 的 waterfall 把 `next` 实现成 `(cbs.shift() ?? inner)(...)`，
     * 其中 `cbs` 是**整条链共享的队列**（cordis lib/index.js:317-325）。于是"下游监听器抛错"
     * 会让我们 `await next()` 变成 rejection；此时若无脑再调一次 `next()`，它就从队列里取
     * **下一个**监听器继续，一路落到宿主内置的 `{kind:'allow'}`——把别人的 fail-closed
     * 拒绝降级成放行。这是权限提权，不是"我没意见"。
     *
     * 因此：**已经转发过就必须把错误原样抛回去**（宿主 `pipeline.ts:231-233` 的 try/catch
     * 会把它变成 `toolErrorResult`，即工具不执行，与没有本监听器时一致）；
     * 只有"从未转发"（异常发生在我们自己的判定里）才可以兜底放行。
     */
    let forwarded = false;
    const forward = () => {
      forwarded = true;
      return next();
    };
    try {
      /*
       * 先按"是不是写操作"短路，再求值策略——**顺序有性能含义**。
       *
       * s3 起 `getMode(exec)` 要按调用解析仓库（`resolveExecScope` + 读 `.git/config`），
       * 而 `github_pr list` / `view` 这类**读**调用在任何档位下都不会被问
       * （`destructive` 用闸门表、`all-writes` 用 `classifyWrite`，两者对读 action 都为假）。
       * 先判写再算策略，等于把这份同步 I/O 从"每次 audited 调用"缩小到"每次写调用"。
       */
      if (!isWriteCall(exec)) return forward();
      if (!shouldAsk(exec, deps.getMode(exec))) return forward();

      const approval = deps.getApproval();
      // 没有 approval 服务（纯 CLI / TUI profile）：让工具体的 confirm 闸门接管
      if (!approval || typeof approval.request !== 'function') return forward();

      const policy = resolveEffectivePolicy(approval, exec?.agent);
      if (policy === 'never') return forward();
      if (policy === undefined) {
        // 读不出有效策略时的降级：不判、照常问（绝不把"读不到"当 never，见 resolveEffectivePolicy）
        deps.warn('读不出 approval 策略（会话覆盖与 config.policy 都不可用），本次直接发起审核请求');
      }

      const callId = str(exec?.callId);

      /*
       * 目标现状：只在"确定要弹窗"之后才查（上面每条提前返回都不会白打一次 gh），
       * 且整体 try/catch 包住 —— 它只是锦上添花，失败绝不能让审核失败。
       * 查到的标题同时 stash 给记录侧（`tools/result` 是同步切面，只能从暂存表里取）。
       */
      let target: TargetInfo | undefined;
      if (deps.resolveTarget) {
        try {
          target = await deps.resolveTarget(exec);
        } catch {
          target = undefined;
        }
        if (target?.title && callId && deps.stashTitle) deps.stashTitle(callId, target.title);
      }

      /*
       * 记下"开始问人"的时刻，随决策行一起落盘。
       *
       * 为什么在这里取：这是唯一知道用户从哪一刻开始被问的地方。intent 行要等
       * `tools/result`（工具执行完）才写，拿它当起点算出来的等待时长恒为负——
       * health 看板上的"平均等待"因此长期显示 0。
       *
       * 放在 `request()` 之前、`resolveTarget` 之后：查目标信息是我们自己的准备动作，
       * 不该算进"用户思考时间"。
       */
      const askedAt = Date.now();
      let outcome: ApprovalOutcome;
      try {
        outcome = await approval.request({
          agent: exec?.agent,
          toolName: str(exec?.name),
          ...(callId ? { callId } : {}),
          reason: askReason(exec, target),
          // 必须透传：用户按停止 / 宿主中止轮次时，官方接缝自己结算成 cancelled，
          // 插件不必再写任何定时器（v1 的 180s 超时与 onDisabled 结算全部消失）
          signal: exec?.signal,
        });
      } catch (error) {
        // 典型原因：`request()` 要求轮次开启（`dsh-user-approval/src/index.ts:244`）。
        // 问不出去不等于用户拒绝——绝不因为审核不可用把工具判死。
        deps.warn(`审核请求失败，本次跳过审核：${error instanceof Error ? error.message : String(error)}`);
        return forward();
      }

      switch (outcome) {
        case 'allowed-once':
          // 批准事实必须传给工具体：否则它自己的 confirm 闸门会再问一遍（一次操作问两遍）
          markApproved(callId);
          if (callId) deps.recordDecision(callId, 'approved', askedAt);
          return forward();
        case 'rejected':
          if (callId) deps.recordDecision(callId, 'rejected', askedAt);
          return {
            kind: 'deny',
            reason: rejectionMessage(exec),
            info: { name: 'ApprovalError', code: 'APPROVAL_REJECTED' },
          };
        case 'cancelled':
          if (callId) deps.recordDecision(callId, 'cancelled', askedAt);
          return { kind: 'cancel' };
        case 'unavailable':
        default:
          // 无 answerer：记一条 no-client（词汇与宿主 Outcomes 一一对应），然后交回工具体
          if (callId) deps.recordDecision(callId, 'no-client', askedAt);
          return forward();
      }
    } catch (error) {
      // 已经转发出去了：错误来自下游监听器，原样上抛（fail-closed，见上面的长注释）
      if (forwarded) throw error;
      // 从未转发：异常来自本闸门自己的判定。让工具照常跑，总比"审核模块有 bug 就所有写操作不可用"好
      deps.warn(`审核闸门异常，本次跳过审核：${error instanceof Error ? error.message : String(error)}`);
      return next();
    }
  };
}
