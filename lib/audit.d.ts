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
}
/** 折叠后交给 UI / 路由的一条记录 */
export interface AuditEntry extends OperationMeta {
    id: string;
    at: number;
    decision: AuditDecision;
    feedback?: string;
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
type DecisionRow = {
    v: 1;
    kind: 'decision';
    id: string;
    at: number;
    decision: AuditDecision;
    feedback?: string;
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
    /** `file` = 用户曾在 UI 里改过；`default` = 文件不存在或损坏。决定它与静态配置的优先级 */
    source: 'file' | 'default';
}
/** 审核档位合法值（存档前校验；非法值一律回落默认） */
export declare const APPROVAL_MODES: readonly ['off', 'destructive', 'all-writes'];
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
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
/** 存储用量快照（`usage()` 的返回类型；字段语义见 `AuditStore.usage`） */
export interface AuditUsage {
    enabled: boolean;
    active: boolean;
    rows: number;
    bytes: number;
    maxRows: number;
    maxBytes: number;
    degraded: string | null;
}
/**
 * 事件流存储。
 *
 * 写入路径：`recordCall()` → 内存（查询立即可见）→ 攒批 → 200ms 后一次刷盘。
 * 读路径：`list()` 全量折叠（预算内最多几万行，折叠是 O(n) 的内存操作，不值得做增量索引）。
 *
 * 保留策略：**字节预算为主闸门、行数为其派生上限**（见文件头常量注释）。
 */
export declare class AuditStore {
    private readonly dir;
    private readonly file;
    private readonly now;
    private readonly settingsDir;
    /** 随 `setBudget()` 变化，故非 readonly */
    private maxRows;
    private maxBytes;
    private enabled;
    /** 审核档位：与开关/预算同文件，设置页同屏；`main.ts` 的闸门每次调用现读 */
    private mode;
    private readonly flushDelayMs;
    private readonly repoResolver?;
    private readonly onEnabledChange?;
    private rows;
    /** 与 `rows` 等长的字节数（含行尾换行）——淘汰时从头部整批减，避免 O(n²) 重算 */
    private rowBytes;
    private totalBytes;
    private pending;
    private needsRewrite;
    private flushTimer;
    private flushing;
    private disposed;
    /** 构造期降级原因（非 null 表示记录功能已关闭，其余功能照常） */
    readonly degradedReason: string | null;
    constructor(options?: AuditStoreOptions);
    /** 数据文件路径（测试与诊断用） */
    filePath(): string;
    private load;
    /**
     * 按预算淘汰最早的若干行（字节与行数先到者生效）。
     *
     * **至少保留最新一行**（`drop < n - 1`）：单行就超过预算的极端情况（比如预算调到
     * 下限而一条记录带了长留言）下，若把刚写的那行也淘汰掉，"刚发生的事"会立刻查不到——
     * 超出预算一行是可以接受的诚实，丢掉正在记录的操作不是。
     *
     * @returns 是否发生了淘汰（调用方据此决定要不要压实文件）
     */
    private evict;
    private append;
    /**
     * 把墓碑真正"兑现"成删除，并同步重算字节记账。
     *
     * 剔除行时必须同时重建 `rowBytes`：只删 `rows` 会让记账与行错位，
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
     * 把内存快照整体落盘（先折叠墓碑，再 tmp+rename 原子替换）。**同步**。
     *
     * 为什么用户显式动作（删除 / 清空）必须走同步写而不是"排进攒批队列"：
     * 攒批靠定时器，而删除是「我点了，它就该没了」的语义。若只把墓碑塞进队列，
     * 一旦进程在定时器触发前退出，重启后记录会**复活**——用户会认为删除是假的。
     * 这里宁可在一次点击上多花几毫秒（≤5MB 的顺序写），也不留这种不可解释的行为。
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
    recordDecision(id: string, decision: AuditDecision, feedback?: string): void;
    /**
     * 折叠成记录列表（按时间倒序）。
     *
     * 两遍扫：先收集墓碑集合，再折叠。一遍扫会漏掉「墓碑写在 intent 之前」的极端顺序，
     * 而那种顺序在压实失败重放时是可能出现的。
     */
    list(filter?: {
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
    }): {
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
    /** 清空全部记录（同步压实为空文件）。**关闭态也可用**：直接写空，不需要加载。 */
    clear(): Promise<void>;
    /** 当前内存行数（诊断用） */
    rowCount(): number;
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
    /** 改审核档位并落盘。运行期立即生效。 */
    setApprovalMode(mode: string): AuditUsage;
    /** 三个设置项共用一次落盘（失败只 warn：设置写不进去不该让功能失效） */
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
