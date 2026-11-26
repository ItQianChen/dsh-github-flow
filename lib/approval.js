/**
 * 执行前人工审核队列（进程内）。
 *
 * 职责单一：把"这次调用需要人拍板"变成一个**可结算的 Promise**，由 HTTP 路由把
 * 人的决定送进来。它不理解工具、不理解审计、不理解宿主——那些在 `main.ts` 的接线里。
 *
 * 三条硬约束（改本文件前先读）：
 * 1. **永不挂死调用方**：四个出口——批准 / 拒绝 / 超时 / 取消——任何一条都必须能在
 *    有界时间内结算。少一个出口，Agent 就会停在一次工具调用上等一个人永远不会点的按钮。
 * 2. **fail-open 到旧行为**：没有客户端在线时**立刻**返回 `no-client`，不阻塞。
 *    调用方据此退回既有的 `confirm: true` 闸门（那是本来就在工作的路径）。
 * 3. **一次消费**：同一 id 只能被决策一次；重复提交返回 `already-decided`，
 *    防止双击 / 重放把一条审批变成两条。
 *
 * 词汇与宿主 `ApprovalOutcome` 一一对应（`dsh-user-approval/src/types.ts:32`）：
 * allowed-once→approved、rejected→rejected、cancelled→cancelled、unavailable→no-client。
 * **不发明第三套词汇**——将来若要接宿主接缝，映射是零成本的。
 */
import { createHash, randomUUID } from 'node:crypto';
/** 客户端在线判定：心跳超过此时长即视为"没有客户端"，直接 fail-open */
const DEFAULT_HEARTBEAT_TTL_MS = 60_000;
/** 排队上限：超出直接按 expired 结算，防止弹窗风暴把人逼到关功能 */
const DEFAULT_MAX_PENDING = 5;
/** 已批准 callId 的保留条数：只用于闸门旁路，过期即可丢 */
const GRANT_MEMORY = 100;
export class ApprovalQueue {
    timeoutMs;
    heartbeatTtlMs;
    maxPending;
    now;
    tokenValue;
    pending = new Map();
    /** 最近批准过的 callId（FIFO 淘汰）：`wrapWithGate` 靠它跳过 confirm 闸门 */
    granted = [];
    lastSeenAt = 0;
    disposed = false;
    disabledReason = null;
    constructor(options = {}) {
        this.timeoutMs = Math.max(1_000, options.timeoutMs ?? 180_000);
        this.heartbeatTtlMs = Math.max(1_000, options.heartbeatTtlMs ?? DEFAULT_HEARTBEAT_TTL_MS);
        this.maxPending = Math.max(1, options.maxPending ?? DEFAULT_MAX_PENDING);
        this.now = options.now || Date.now;
        // 进程级随机令牌：只下发到浏览器（GET /pending），决策请求必须携带。
        // 它提高伪造门槛（随手 curl / 同机其它脚本），但**不是**安全边界——
        // Agent 手上有 pwsh，理论上能自己 curl。真正的边界写在总纲 §2.3，别在这里假装。
        this.tokenValue = options.token || randomUUID();
    }
    /** 决策令牌（下发给 UI；不下发给模型可见的任何输出） */
    get token() {
        return this.tokenValue;
    }
    /** 客户端心跳：面板每次轮询 `GET /pending` 或 `POST /heartbeat` 时刷新 */
    heartbeat() {
        this.lastSeenAt = this.now();
    }
    isClientOnline() {
        if (this.lastSeenAt === 0)
            return false;
        return this.now() - this.lastSeenAt < this.heartbeatTtlMs;
    }
    /** 待审列表（UI 轮询） */
    list() {
        return [...this.pending.values()].map((e) => e.item);
    }
    size() {
        return this.pending.size;
    }
    isDisabled() {
        return this.disposed || this.disabledReason !== null;
    }
    disabledBecause() {
        return this.disabledReason;
    }
    /**
     * 请求一次决定。**必定在有限时间内结算**（批准/拒绝/超时/取消/无客户端/队列满）。
     *
     * @param item   待审请求（id 必须是 exec.callId）
     * @param signal 宿主的呼叫取消信号；abort 即以 `cancelled` 结算
     */
    ask(item, signal) {
        if (this.isDisabled())
            return Promise.resolve({ decision: 'cancelled' });
        // fail-open：没有客户端就别装模作样地等——调用方会退回旧的 confirm 闸门
        if (!this.isClientOnline())
            return Promise.resolve({ decision: 'no-client' });
        // 队列满：按 expired 结算（不阻塞、不静默丢弃，调用方仍拿得到它去走旧闸门）
        if (this.pending.size >= this.maxPending)
            return Promise.resolve({ decision: 'expired' });
        return new Promise((resolve) => {
            const id = item.id;
            const settleOnce = (result) => {
                const entry = this.pending.get(id);
                if (!entry)
                    return; // 已结算（超时后迟到的决定走这里）
                this.pending.delete(id);
                try {
                    clearTimeout(entry.timer);
                }
                catch { /* 忽略 */ }
                entry.detach();
                resolve(result);
            };
            const timer = (() => {
                // **不能** unref：超时是这条路径唯一的兜底出口，不是"顺带的服务"。
                // unref 之后，若进程内没有其它活跃句柄，计时器永远不会触发，
                // 那次工具调用就永久悬挂——实测在纯脚本环境里 await 直接不结算。
                // 进程退出由 dispose() 负责清定时器，不靠 unref。
                return setTimeout(() => {
                    settleOnce({ decision: 'expired' });
                }, this.timeoutMs);
            })();
            const onAbort = () => settleOnce({ decision: 'cancelled' });
            if (signal) {
                if (signal.aborted) {
                    try {
                        clearTimeout(timer);
                    }
                    catch { /* 忽略 */ }
                    resolve({ decision: 'cancelled' });
                    return;
                }
                signal.addEventListener('abort', onAbort, { once: true });
            }
            this.pending.set(id, {
                item,
                settle: settleOnce,
                timer,
                detach: () => {
                    try {
                        signal?.removeEventListener('abort', onAbort);
                    }
                    catch { /* 忽略 */ }
                },
            });
        });
    }
    /**
     * 人对一条请求拍板（供路由调用）。
     *
     * @returns `{ ok: true }` 或带原因的拒绝（`forbidden` / `not-found` / `already-decided` / `mismatch` / `invalid`）
     */
    decide(id, kind, options = {}) {
        if (kind !== 'approved' && kind !== 'rejected')
            return { ok: false, reason: 'invalid' };
        // 令牌先于一切存在性判断：不然未持令牌者能靠 403/409 的差别探测哪些 id 在队列里
        if (!options.token || options.token !== this.tokenValue)
            return { ok: false, reason: 'forbidden' };
        const entry = this.pending.get(id);
        if (!entry)
            return { ok: false, reason: 'already-decided' };
        /*
         * 批准的是**这一份参数**，不是"这个工具"。
         *
         * 宿主在 prepare 阶段已经对 `exec.arguments` 做了 snapshot + deepFreeze，换参在进程内
         * 物理不可达，所以这条不是唯一防线；但只要弹窗上显示了「参数指纹」，它就必须真的被比对
         * ——显示一个从不校验的指纹，等于让人以为校验过了。
         * 缺参同样按不匹配处理：决策请求必须带上它当时看到的那一条。
         */
        if (options.argsHash !== entry.item.argsHash)
            return { ok: false, reason: 'mismatch' };
        const feedback = typeof options.feedback === 'string' ? options.feedback.slice(0, 2000) : undefined;
        // 批准要把 callId 记进旁路表：否则工具体内的 confirm 闸门会再拦一次（双重确认）
        if (kind === 'approved')
            this.grant(id);
        entry.settle(kind === 'rejected' ? { decision: 'rejected', feedback } : { decision: 'approved' });
        return { ok: true };
    }
    /** 该 callId 是否已被人工批准（`wrapWithGate` 的唯一依据） */
    isGrantedCall(callId) {
        return typeof callId === 'string' && callId.length > 0 && this.granted.includes(callId);
    }
    grant(callId) {
        this.granted.push(callId);
        while (this.granted.length > GRANT_MEMORY)
            this.granted.shift();
    }
    /** 运行期关闭审核（记录被关掉 / 存储降级）：全部 pending 以 `expired` 结算 */
    onDisabled(reason) {
        this.disabledReason = reason;
        const ids = [...this.pending.keys()];
        for (const id of ids) {
            const entry = this.pending.get(id);
            entry?.settle({ decision: 'expired' });
        }
    }
    /** 重新启用（记录开关再次打开时） */
    onEnabled() {
        this.disabledReason = null;
    }
    /** 超时热更新（`loader/volatile-update` 消费点） */
    updateTimeout(ms) {
        if (Number.isFinite(ms) && ms >= 1_000)
            this.timeoutMs = ms;
    }
    currentTimeoutMs() {
        return this.timeoutMs;
    }
    /** 卸载：全部 pending 以 `cancelled` 结算（进程要走了，别让调用方等） */
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        const ids = [...this.pending.keys()];
        for (const id of ids) {
            const entry = this.pending.get(id);
            try {
                clearTimeout(entry?.timer);
            }
            catch { /* 忽略 */ }
            entry?.settle({ decision: 'cancelled' });
        }
        this.pending.clear();
        this.granted = [];
    }
}
/** 参数指纹：批准的是这一份参数，不是"这个工具"（16 位足够防换参，不用于密码学） */
export function hashArgs(args) {
    try {
        return createHash('sha256').update(JSON.stringify(args ?? {})).digest('hex').slice(0, 16);
    }
    catch {
        return 'unhashable';
    }
}
