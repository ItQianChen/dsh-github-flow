/** 与宿主 `ApprovalOutcome` 对齐的四态 + 本实现特有的 `expired`（超时未决） */
export type ApprovalDecision = 'approved' | 'rejected' | 'cancelled' | 'no-client' | 'expired';
/** 一条待审请求（会原样发给 UI，因此只放展示所需的字段） */
export interface PendingApproval {
    /** 等于宿主 `exec.callId`：审批通过与闸门旁路都靠它关联 */
    id: string;
    at: number;
    tool: string;
    action: string;
    summary: string;
    /** 命中破坏性闸门表时原样带出的影响评估（没有则省略） */
    warning?: string;
    impact?: string;
    /** 参数指纹：批准的是**这一份参数**，不是"这个工具" */
    argsHash: string;
    sessionId?: string;
    repo?: string;
}
export interface AskResult {
    decision: ApprovalDecision;
    feedback?: string;
}
export declare class ApprovalQueue {
    private timeoutMs;
    private readonly heartbeatTtlMs;
    private readonly maxPending;
    private readonly now;
    private readonly tokenValue;
    private pending;
    /** 最近批准过的 callId（FIFO 淘汰）：`wrapWithGate` 靠它跳过 confirm 闸门 */
    private granted;
    private lastSeenAt;
    private disposed;
    private disabledReason;
    constructor(options?: {
        timeoutMs?: number;
        heartbeatTtlMs?: number;
        maxPending?: number;
        now?: () => number;
        token?: string;
    });
    /** 决策令牌（下发给 UI；不下发给模型可见的任何输出） */
    get token(): string;
    /** 客户端心跳：面板每次轮询 `GET /pending` 或 `POST /heartbeat` 时刷新 */
    heartbeat(): void;
    isClientOnline(): boolean;
    /** 待审列表（UI 轮询） */
    list(): PendingApproval[];
    size(): number;
    isDisabled(): boolean;
    disabledBecause(): string | null;
    /**
     * 请求一次决定。**必定在有限时间内结算**（批准/拒绝/超时/取消/无客户端/队列满）。
     *
     * @param item   待审请求（id 必须是 exec.callId）
     * @param signal 宿主的呼叫取消信号；abort 即以 `cancelled` 结算
     */
    ask(item: PendingApproval, signal?: AbortSignal): Promise<AskResult>;
    /**
     * 人对一条请求拍板（供路由调用）。
     *
     * @returns `{ ok: true }` 或带原因的拒绝（`forbidden` / `not-found` / `already-decided`）
     */
    decide(id: string, kind: 'approved' | 'rejected', options?: {
        feedback?: string;
        token?: string;
    }): {
        ok: true;
    } | {
        ok: false;
        reason: 'forbidden' | 'not-found' | 'already-decided' | 'invalid';
    };
    /** 该 callId 是否已被人工批准（`wrapWithGate` 的唯一依据） */
    isGrantedCall(callId: unknown): boolean;
    private grant;
    /** 运行期关闭审核（记录被关掉 / 存储降级）：全部 pending 以 `expired` 结算 */
    onDisabled(reason: string): void;
    /** 重新启用（记录开关再次打开时） */
    onEnabled(): void;
    /** 超时热更新（`loader/volatile-update` 消费点） */
    updateTimeout(ms: number): void;
    currentTimeoutMs(): number;
    /** 卸载：全部 pending 以 `cancelled` 结算（进程要走了，别让调用方等） */
    dispose(): Promise<void>;
}
/** 参数指纹：批准的是这一份参数，不是"这个工具"（16 位足够防换参，不用于密码学） */
export declare function hashArgs(args: unknown): string;
