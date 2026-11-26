/** 风险分级：读 / 写 / 高危（= 命中 `DESTRUCTIVE_ACTIONS` 闸门表） */
export type AuditRisk = 'read' | 'write' | 'destructive';
/**
 * 决策来源。
 * `auto`：没有人工介入（s1 全部是它）；其余由 s2 的人工审核写入，词汇与宿主
 * `ApprovalOutcome` 一一对应（allowed-once→approved / rejected→rejected /
 * cancelled→cancelled / unavailable→no-client），不发明第三套。
 */
export type AuditDecision = 'auto' | 'confirmed' | 'approved' | 'rejected' | 'expired' | 'no-client' | 'cancelled';
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
type IntentRow = {
    v: 1;
    kind: 'intent';
    id: string;
    at: number;
} & OperationMeta;
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
type DeleteRow = {
    v: 1;
    kind: 'delete';
    at: number;
    ids: string[];
};
export type AuditRow = IntentRow | DecisionRow | ResultRow | DeleteRow;
export interface SnapshotResult {
    text: string;
    truncated: boolean;
    /** 被裁过的字段名（UI 显式提示"哪个字段不全"，不含糊成一个"已截断"） */
    fields: string[];
}
/** 由字节预算派生行数上限：只兜"极短行"病态，正常永不触发 */
export declare function deriveMaxRows(maxBytes: number): number;
/** 预算 clamp：下限 256 KB、上限 64 MB。越界钳住而不是报错——配置值不值得让功能失效。 */
export declare function clampBudget(bytes: number): number;
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
export declare const AUDITED_TOOLS: readonly string[];
/** 该工具是否在记录/审核作用域内 */
export declare function isAuditedTool(tool: unknown): boolean;
/** ---------------- 分类 ---------------- */
/**
 * 是否写操作：真源是 `WRITE_ACTIONS`（`src/tool-tiers.ts`），只读档位用的也是它。
 * `'*'`（`github_api`）视为写：端点与 method 都能任意，无法降级。
 */
export declare function classifyWrite(tool: string, action: string): boolean;
/** 风险分级：命中闸门表即 destructive，否则按写/读 */
export declare function classifyRisk(tool: string, action: string): AuditRisk;
export declare function pickTarget(args: any): string | undefined;
/** 人话摘要：PR / Issue 走细表，其余工具给机器可读兜底（永不抛错） */
export declare function summarizeOperation(tool: string, action: string, args: any): string;
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
export declare function extractOutcome(result: any): OutcomeShape;
/**
 * 解析该次调用对应的仓库与工作区（同步、不 spawn `gh`）。
 *
 * 为什么不能用 `getRepoMetadata()`：它会在必要时 spawn `gh repo view`，而本函数位于
 * `tools/result` 的**热路径**上——每次工具调用都多 300ms 是不可接受的。
 * 为什么必须先 `resolveExecScope`：宿主的 `exec.agent` 只有 `{ id }`，既没有 cwd 也没有
 * sessionId（`src/executor.ts:329-334` 记录了这次踩坑），自己拼 sessionId 在桌面端永远落空。
 */
export declare function resolveScopeFromExec(executor: any, exec: any, args: any): {
    repo?: string;
    cwd?: string;
};
/** 只取仓库名（保留本入口：多处调用方只关心 repo，不想解构） */
export declare function resolveRepoFromExec(executor: any, exec: any, args: any): string | undefined;
/** `~/.dsh/data/dsh-github-flow`（与 proxy.json / update-settings.json 同目录树） */
export declare function auditDataDir(): string;
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
export declare const APPROVAL_MODES: readonly ['off', 'destructive', 'all-writes'];
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
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
/** 规则解析结果：`ignored` 里带原文与原因，设置页据此回显（不静默） */
export interface ParsedRules {
    rules: ApprovalRule[];
    ignored: Array<{
        raw: string;
        reason: string;
    }>;
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
export declare function parseApprovalRules(input: unknown): ParsedRules;
/** 一条规则是否命中这次调用（维度之间是 AND） */
export declare function ruleMatches(rule: ApprovalRule, ctx: {
    tool: string;
    action: string;
    repo?: string;
}): boolean;
/**
 * 在一组已解析规则上求值：**首条匹配即返回**，都不匹配则回落到 `base`。
 *
 * 抽成纯函数的理由：`resolveApprovalMode`（吃原始字符串，给测试与外部用）与
 * `AuditStore.resolveModeFor`（吃缓存的解析结果，给热路径用）必须走**同一段匹配逻辑**，
 * 两处各写一遍必然漂移——漂移的后果是"设置页说命中、闸门说不命中"。
 */
export declare function evaluateRules(parsed: ParsedRules, base: ApprovalMode, ctx: {
    tool: string;
    action: string;
    repo?: string;
}): ApprovalMode;
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
export declare function resolveApprovalMode(cfg: {
    approvalMode: ApprovalMode;
    approvalRules?: string[];
}, ctx: {
    tool: string;
    action: string;
    repo?: string;
}): ApprovalMode;
export declare function auditSettingsPath(dir?: string): string;
/**
 * 读设置。任何异常都回落到默认值——设置文件坏掉不该让记录功能消失，更不该让 `apply()` 抛错。
 * `enabled` 缺省 true（产品口径：默认全开）。
 */
export declare function loadAuditSettings(dir?: string): AuditSettings;
/** 写设置。返回是否成功（调用方据此决定要不要在 UI 上报错，但不抛）。 */
export declare function saveAuditSettings(dir: string, settings: {
    enabled: boolean;
    budgetBytes: number;
    approvalMode?: string;
    approvalRules?: string[];
}): boolean;
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
    scopeResolver?: (exec: any, args: any) => {
        repo?: string;
        cwd?: string;
    };
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
export declare class AuditStore {
    private readonly dir;
    /** 段目录（`<dir>/audit/`）。旧单文件 `<dir>/audit.jsonl` 只读、一次性迁移 */
    private readonly segDir;
    /** 本进程独占的段文件：只追加 + 只压实自己这份 */
    private readonly file;
    /** 跨段清空锁的归属令牌（`pid:序号`），见 `releaseLock` 的注释 */
    private readonly lockToken;
    /** 旧布局（s1/s1b/s2）的单文件。存在即迁移，绝不静默丢用户历史 */
    private readonly legacyFile;
    private readonly now;
    private readonly settingsDir;
    /** 随 `setBudget()` 变化，故非 readonly */
    private maxRows;
    private maxBytes;
    private enabled;
    /** 审核档位：与开关/预算同文件，设置页同屏；`main.ts` 的闸门每次调用现读 */
    private mode;
    /** 审核规则原始字符串（s3）。解析结果见 `parsedRules`，闸门走它避免热路径重复解析 */
    private ruleList;
    private parsedRules;
    private readonly flushDelayMs;
    private readonly repoResolver?;
    private readonly onEnabledChange?;
    private rows;
    /** 与 `rows` 等长的字节数（含行尾换行）——淘汰时从头部整批减，避免 O(n²) 重算 */
    private rowBytes;
    /**
     * 与 `rows` 等长的**归属段路径**。
     *
     * 为什么必须有它：`writeSnapshotSync()` 只能重写自己的段。没有归属信息就只能
     * "把内存里的全部行写进本段"，那会把别的进程的行复制一份进来 —— 于是每重启一次
     * 记录就翻一倍，而界面上看起来一切正常。
     */
    private rowSeg;
    private totalBytes;
    /** 段顺序（最旧在前）。只有头部整段可丢，因此顺序必须显式维护 */
    private segOrder;
    private readonly segRows;
    private readonly segBytes;
    private pending;
    private needsRewrite;
    private flushTimer;
    private flushing;
    private disposed;
    /** 构造期降级原因（非 null 表示记录功能已关闭，其余功能照常） */
    readonly degradedReason: string | null;
    constructor(options?: AuditStoreOptions);
    /**
     * 本进程段文件路径（测试与诊断用）。
     *
     * ⚠️ 语义在 s3 变了：从前是"那个唯一的记录文件"，现在是"**本进程**这一段的路径"。
     * 想拿到全部段用 `segmentPaths()`；旧单文件用 `legacyPath()`。
     */
    filePath(): string;
    /** 当前存在的全部段（最旧在前；含本进程段） */
    segmentPaths(): string[];
    /** 旧布局单文件路径（迁移后不再存在） */
    legacyPath(): string;
    /** 段目录（UI 与诊断要能说清"记录存在哪"） */
    segmentDir(): string;
    /** 按 mtime 升序列出段文件（最旧在前） */
    private listSegments;
    /**
     * 读一个文件里的全部可解析行。
     *
     * 坏行**不抛错**、只计数：断电留下半行是常态。计数是给自愈用的——
     * 没有计数就无法区分"这个文件很干净"与"这个文件已经烂了一半"。
     *
     * **作用域外的历史行在这里就被丢掉**（`outOfScope`），原因见下面注释。
     */
    private readSegment;
    /** 往内存尾部追加一行并维护全部记账（装载与运行期共用，避免两处记账口径漂移） */
    private pushRow;
    private load;
    /**
     * 把一个段重写成"只有可解析行"的版本（tmp + rename 原子替换）。
     *
     * 只删坏行、不动好行：自愈的承诺是"坏行代价为零"，不是"顺手清理一下"。
     * 返回是否成功——失败时调用方只需如实告警，下一条记录照常写（绝不因此让记录功能停摆）。
     */
    private healSegment;
    /**
     * 丢掉头部 k 行，并同步维护每段的行数 / 字节数与段顺序。
     *
     * ⚠️ 只用于**按行淘汰**（`evictRows`：按时间丢最早的）。**整段淘汰必须走
     * `dropSegmentRows`**——段的行未必从头部开始（legacy 迁移行会插在最前）。
     *
     * 为什么必须逐行维护而不是最后重算：`enforceBudget()` 在超预算后**每次 append**
     * 都会走一小步，O(n) 重算会让稳态写入退化成 O(n²)（3 万行时肉眼可见）。
     */
    private dropHead;
    /**
     * 丢掉某个段的**全部行**——按 `rowSeg` 过滤，**不假设它们在 `rows` 头部**。
     *
     * ⚠️ 为什么不复用 `dropHead`：装载时 legacy（旧单文件）的行归属**本进程段**且排在最前，
     * 别人的段的行排在它之后。若按"该段行数"从头部切 k 行，删掉的是**本段的行**、
     * 而别人的行仍留在内存里——随后 `writeSnapshotSync()` 只写本段的行，
     * 本段历史就被截断了（实测 1600 条记录可全丢）。这类错位不报错，只会让记录莫名消失。
     */
    private dropSegmentRows;
    /**
     * 段文件的 mtime（ms）。读不到时返回 0（= 视作已沉寂）：
     * 文件不存在本来就可以删，把它当成"正在被写"只会让预算永远收不回来。
     */
    private segMtime;
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
    private isSegmentLive;
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
    private enforceBudget;
    /**
     * 按预算淘汰最早的若干行（字节与行数先到者生效）。
     *
     * **至少保留最新一行**（`drop < n - 1`）：单行就超过预算的极端情况（比如预算调到
     * 下限而一条记录带了长留言）下，若把刚写的那行也淘汰掉，"刚发生的事"会立刻查不到——
     * 超出预算一行是可以接受的诚实，丢掉正在记录的操作不是。
     */
    private evictRows;
    private append;
    /**
     * 把墓碑真正"兑现"成删除，并同步重算字节记账。
     *
     * 剔除行时必须同时重建 `rowBytes` / `rowSeg`：只删 `rows` 会让记账与行错位，
     * 之后的淘汰会**删掉不该删的行**——这类错位不会报错，只会让记录莫名消失。
     */
    private compactRows;
    private scheduleFlush;
    /**
     * 刷盘：有墓碑/超限时整体重写（真删字节），否则增量追加。
     *
     * 在途时返回同一个 promise（并发调用方共用一趟）——因此**不保证**本次调用
     * 覆盖调用前刚 add 的数据。用户显式动作（删除/清空）不依赖它：那些走
     * `writeSnapshotSync()` 同步落盘；`dispose()` 会在末次刷盘后复查残余。
     */
    flush(): Promise<void>;
    private doFlush;
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
    private writeSnapshotSync;
    /**
     * 等当前在途刷盘收尾。
     *
     * 为什么必须先等：在途的 append 用的是它自己算好的字符串，若我们的
     * tmp+rename 抢在它前面落盘，随后那次 append 会把刚删掉的行**追加回来**。
     * 顺序错了就复活数据，这种事只在空闲/繁忙切换的瞬间发生，最难复现。
     */
    private quiesce;
    /**
     * 记录一次工具调用。**永不抛错**。
     *
     * @param tool   工具名（`github_pr`）
     * @param args   工具原始参数
     * @param result `tools/result` 的第二参（归一化或原始载荷，两种都认）
     * @param exec   `tools/result` 的第一参（冻结快照，含 agent / callId）
     */
    recordCall(tool: string, args: any, result: any, exec?: any): void;
    /** s2 用：写入人工决策（s1 不调用，但存储形态先留好，避免 s2 改数据模型） */
    /**
     * 写入一条人工决策。
     *
     * @param askedAt 发起审核请求的时刻（epoch ms）。**必须由调用方在发起请求前取**——
     *   本方法只能给出"结论落盘时刻"，没有它就永远算不出"用户思考了多久"。
     *   缺省表示调用方没提供（旧调用点），此时看板不显示平均等待而不是显示 0。
     */
    recordDecision(id: string, decision: AuditDecision, feedback?: string, askedAt?: number): void;
    /**
     * 折叠成记录列表（按时间倒序）。
     *
     * 两遍扫：先收集墓碑集合，再折叠。一遍扫会漏掉「墓碑写在 intent 之前」的极端顺序，
     * 而那种顺序在压实失败重放时是可能出现的。
     */
    list(filter?: AuditFilter): {
        items: AuditEntry[];
        total: number;
    };
    /**
     * 删除指定记录：先追加墓碑（崩溃也能读回"已删除"），**然后同步压实**。
     *
     * 压实后文件里不再有这些 id 的字节——用户点删除要的就是真删除。
     * 返回真实删除的条数（不存在的 id 不计）。
     */
    delete(ids: string[]): Promise<number>;
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
    clear(): Promise<{
        cleared: number;
        partial: boolean;
        remaining: number;
    }>;
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
    private acquireLock;
    /**
     * 释放锁。**只在锁仍属于本实例时**才删。
     *
     * 为什么不能无条件 unlink：锁可能因超时被别的进程按"过期锁"抢走并重写，
     * 此时无条件删掉等于把**别人的**临界区打开，第三方可以同时进来清空。
     * 令牌用 `pid:序号` 而不是裸 pid——同一进程里的多个 store 实例（测试、热重载）
     * pid 相同，裸 pid 会让实例 A 误删实例 B 的锁。
     */
    private releaseLock;
    /** 当前内存行数（诊断用） */
    rowCount(): number;
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
    approvalStats(days?: number): {
        pending: number;
        approved: number;
        rejected: number;
        noClient: number;
        cancelled: number;
        avgWaitMs: number | null;
        total: number;
    };
    /**
     * 导出为 JSON 字符串（s3）。
     *
     * 只导出**当前内存里保留的全部记录**（= s1b 预算下的实际条数），不写死数字：
     * 写死 2000 会在预算调大后少导、调小后导出根本不存在的东西。
     *
     * 为什么 `JSON.stringify(…, null, 2)` 而不是紧凑格式：导出件的用途是"留档 / 贴进
     * issue / 交给同事"，可读性是第一位的；体积在几条到几万条量级，压不压缩差别不大。
     */
    exportJson(filter?: AuditFilter): string;
    /**
     * 导出为 Markdown 表格（s3）。
     *
     * 决策列**必须显式区分** `approved` / `rejected` / `no-client`：导出件最常见的用途
     * 就是事后对账，模糊这几者等于让导出件撒谎——"用户点了拒绝"和"根本没有客户端可问"
     * 是性质完全不同的两件事，前者是人的意志，后者是部署缺陷。
     *
     * 被拒绝条目的留言原文用引用块附在表格后：表格单元格里塞多行留言会把整张表撑烂。
     */
    exportMarkdown(filter?: AuditFilter): string;
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
    usage(): AuditUsage;
    /**
     * 当前审核档位。`main.ts` 的闸门**每次调用现读**，因此设置页改完立刻生效（无需重启）。
     */
    approvalMode(): ApprovalMode;
    /** 审核规则原文（设置页回显用） */
    approvalRules(): string[];
    /**
     * 是否配置了**能生效**的审核规则。
     *
     * 为什么单独暴露：默认配置下规则为空，此时"按调用解析仓库"（读 `.git/config` +
     * 会话反查）完全是浪费——`main.ts` 的 `getMode` 靠它短路，把这份同步 I/O 从
     * 每次工具调用降为"用户真的写了规则时才有"。
     * 只看**解析成功**的条数：写了一堆错规则等于没规则，同样不必解析仓库。
     */
    hasApprovalRules(): boolean;
    /**
     * 解析后的规则与忽略项。
     *
     * 闸门走 `resolveModeFor()` 而不是每次自己解析：规则解析是热路径上的一次字符串
     * 遍历，每次工具调用都重做一遍毫无必要，且解析结果与设置页回显必须是**同一份**。
     */
    parsedApprovalRules(): ParsedRules;
    /**
     * 这一次调用该用哪个档位（含规则覆盖）。
     *
     * `read_only` 在注册期就剪掉了写 action，策略根本没机会跑——这条边界必须写进文档，
     * 否则用户配了 `all-writes` 又抱怨不弹窗。
     *
     * 走 `evaluateRules`（与 `resolveApprovalMode` 同一段匹配逻辑）而不是自己再写一遍：
     * 两处各写一遍必然漂移，而漂移的后果是"设置页说命中、闸门说不命中"。
     */
    resolveModeFor(ctx: {
        tool: string;
        action: string;
        repo?: string;
    }): ApprovalMode;
    /** 改审核档位并落盘。运行期立即生效。 */
    setApprovalMode(mode: string): AuditUsage;
    /**
     * 改审核规则并落盘。运行期立即生效。
     *
     * 非法规则**不阻止保存**（用户可能正写一半），但解析结果会被设置页回显，
     * 且闸门只用能解析的那些——静默忽略一条策略比多问一次危险得多。
     */
    setApprovalRules(rules: string[]): AuditUsage;
    /** 设置项共用一次落盘（失败只 warn：设置写不进去不该让功能失效） */
    private saveSettings;
    /**
     * 改预算并**立刻生效**（无需重启）。异步：必须先等在途刷盘收尾再压实。
     *
     * 改小必须当场淘汰 + 同步压实：用户把 8 MB 降到 1 MB 时，"下次写入才缩"等于没缩，
     * 而这一步的代价只是一次顺序写，与 `delete()` 同一条路径。
     */
    setBudget(bytes: number): Promise<AuditUsage>;
    /**
     * 开/关记录，运行时生效。
     *
     * 关闭时：先等在途刷盘收尾（否则它会再写一批），再清攒批队列、丢弃已加载的行
     * （释放内存）。历史文件**不删**——那是用户的文件，要删走 `clear()`。
     * 打开时：重新 `load()` 并按当前预算淘汰，随后照常记录。
     */
    setEnabled(flag: boolean): Promise<AuditUsage>;
    /** 卸载：清定时器 + 末次刷盘。幂等。 */
    dispose(): Promise<void>;
}
export {};
