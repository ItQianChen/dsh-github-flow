import type { ApprovalMode, AuditDecision } from './audit.js';
import type { TargetInfo } from './target-title.js';
/** 宿主审批策略。`never` = 派发前直接判 `rejected`，任何监听器都拦不住 */
type ApprovalPolicy = 'ask' | 'never';
/** `PreToolDecision` 里本模块会用到的三种形态（类型来自 `dsh-tools/src/contracts.ts:375-379`） */
interface PreDecision {
    kind: 'allow' | 'deny' | 'cancel' | 'ask';
    reason?: string;
    info?: {
        name: string;
        code: string;
    };
}
/** 被审核的调用里，本模块只读这几个字段（宿主 `ToolExecution` 的子集） */
interface GateExec {
    name?: unknown;
    arguments?: any;
    callId?: unknown;
    agent?: any;
    signal?: any;
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
export declare function shouldAsk(exec: GateExec | undefined, mode: ApprovalMode): boolean;
/**
 * 这次调用是不是"作用域内的写操作"——**不看档位**。
 *
 * 单独拆出来是为了给闸门做前置短路：算档位（s3 起要按调用解析仓库，含同步读
 * `.git/config`）比重判一次 `classifyWrite` 贵得多，而读调用在任何档位下都不会被问。
 * 语义上它与 `shouldAsk` 不冲突：`shouldAsk` 内部对读 action 恒为 false
 * （`destructive` 走闸门表、`all-writes` 走同一张 `WRITE_ACTIONS`）。
 */
export declare function isWriteCall(exec: GateExec | undefined): boolean;
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
export declare function resolveEffectivePolicy(approval: any, agent: any): ApprovalPolicy | undefined;
/**
 * 弹窗文案的硬上限（用户定：最高 1000 字）。
 *
 * 依据（2026-11-26 读官方 `dsh-client-ui-approval` 产物）：`reason` 被当作卡片标题渲染，
 * 卡片正文区自带 `max-height` + `overflow-y:auto`，按钮在滚动区**之外** —— 所以再长也
 * 顶不出去，只会在卡片内滚动。1000 字 ≈ 16 行，是"够判断"与"不用翻很久"的折中。
 * 超出就截掉尾部并加省略符，且**总长（含省略符）不超过这个数**。
 */
export declare const MAX_REASON_CHARS = 1000;
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
export declare function flattenBody(raw: unknown): string;
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
export declare function askReason(exec: GateExec | undefined, target?: TargetInfo | string): string;
/**
 * 拒绝后回给模型的话。
 *
 * 为什么不是 JSON 载荷：`pre-execute` 的 `deny` 只能给一段 `reason` 文本 + 结构化
 * `info`（`contracts.ts:377`），工具结果的 `content` 由宿主拼装，插件无法塞自定义 JSON。
 * 于是把 v1 里 `requiredAction` 想说的事直接写成句子——模型读的是这段话，不是字段。
 */
export declare function rejectionMessage(exec: GateExec | undefined): string;
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
export declare function createApprovalGate(deps: ApprovalGateDeps): (exec: GateExec | undefined, next: () => Promise<PreDecision>) => Promise<PreDecision>;
export {};
