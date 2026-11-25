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
/** ---------------- 存储 ---------------- */
export interface AuditStoreOptions {
    /** 数据目录（测试注入临时目录） */
    dir?: string;
    now?: () => number;
    maxRows?: number;
    maxBytes?: number;
    /** 攒批刷盘间隔（不阻塞工具返回的关键） */
    flushDelayMs?: number;
    /** 仓库 / 工作区解析器（main.ts 注入 executor 后实现） */
    scopeResolver?: (exec: any, args: any) => {
        repo?: string;
        cwd?: string;
    };
}
/**
 * 事件流存储。
 *
 * 写入路径：`recordCall()` → 内存（查询立即可见）→ 攒批 → 200ms 后一次刷盘。
 * 读路径：`list()` 全量折叠（行数上限 2000，折叠是 O(n) 的内存操作，不值得做增量索引）。
 */
export declare class AuditStore {
    private readonly dir;
    private readonly file;
    private readonly now;
    private readonly maxRows;
    private readonly maxBytes;
    private readonly flushDelayMs;
    private readonly repoResolver?;
    private rows;
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
    private append;
    /**
     * 把墓碑真正"兑现"成删除：既有 compaction 只重写字节，但若仍把被删行写回去，
     * `needsRewrite` 就变成了自欺——用户点删除、文件里却还有那条记录。
     * 重写前必须先折叠，重写后内存 rows 也换成折叠结果（否则下一次重写会把它复活）。
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
    /** 清空全部记录（同步压实为空文件） */
    clear(): Promise<void>;
    /** 当前内存行数（诊断用） */
    rowCount(): number;
    /** 卸载：清定时器 + 末次刷盘。幂等。 */
    dispose(): Promise<void>;
}
export {};
