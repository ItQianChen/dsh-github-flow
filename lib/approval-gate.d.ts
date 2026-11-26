/**
 * `tools/execute` 环绕层的审核闸门：把"这次调用要不要人拍板"翻译成宿主能吃的形状。
 *
 * 为什么单独成文件而不是塞进 `main.ts`：这里的每一条分支（批准 / 拒绝 / 超时 / 取消 /
 * 无客户端 / 自身异常）都能用假 exec 直接断言，塞进 `apply()` 里就只能靠"跑起来看"。
 * 而这一层的错误代价极高——漏一个出口就是 Agent 停在一次工具调用上等一个永不到来的点击。
 *
 * 三条硬约束：
 * 1. **`next()` 至多调用一次**（waterfall 语义：它是"委托下游"，调两次会重复 dispatch）；
 * 2. **拒绝必须是 `isError: true`**：既是语义正确（工具确实没跑），也是唯一能绕开
 *    `createSuccessResult` 的 `output.schema` 校验的路（`dsh-tools/src/pipeline.ts:578-596`）；
 * 3. **本层任何异常都不许冒泡**：catch 之后 `next()`，让旧的 confirm 闸门继续兜底。
 */
import type { GhExecutor } from './executor.js';
import type { AuditStore } from './audit.js';
import type { ApprovalQueue } from './approval.js';
export type ApprovalMode = 'off' | 'destructive' | 'all-writes';
/**
 * 这次调用要不要走人工审核。
 *
 * 六条前置，缺一条就是事故：
 * ① **只审 PR / Issue**（总纲 §一/§二的产品定义；其它 17 个工具自带 `confirm` 闸门，
 *    不在这里重复问）；
 * ② 非 `github_*` 一律不拦（防御性：白名单之外本来就不可能命中）；
 * ③ **记录开关关着 → 审核停用**（总纲 §5.8.2：决策无处留痕的审核是表演）；
 * ④ **记录降级（磁盘坏）→ 同样停用**；
 * ⑤ 档位 `off` 直接放行；
 * ⑥ 档位决定覆盖面：`destructive` 只拦 PR/Issue 里命中闸门表的 6 条
 *    （pr: merge / revert / checkout-force；issue: close / delete / transfer），
 *    `all-writes` 拦 PR/Issue 的全部写 action。
 */
export declare function shouldAskApproval(exec: any, store: Pick<AuditStore, 'usage'>, mode: string): boolean;
/** 把宿主的一次调用翻成"人能读的待审请求"（复用审计层的摘要与作用域解析） */
export declare function buildPendingApproval(exec: any, executor: GhExecutor | undefined): any;
/**
 * 拒绝结果：必须是 `isError: true`。
 * 载荷里的 `status: 'REJECTED_BY_USER'` 与既有 `AWAITING_CONFIRMATION` 刻意不同——
 * 前者是"问了，被拒了"，后者是"还没问"，模型对此的反应必须不同。
 */
export declare function rejectionResult(exec: any, feedback?: string): any;
/** 调用方取消（宿主 abort）：工具体没跑过，用既有的 ABORTED_BEFORE_DISPATCH 语义 */
export declare function cancelledResult(): any;
/**
 * 超时未决 → 退回**今天的行为**：把旧的 `AWAITING_CONFIRMATION` 载荷交给模型。
 *
 * 为什么这一条不能也返回 `next()`：超时意味着"有人在看但没点"，Agent 此刻应该去问人；
 * 而重试时若客户端仍不在线，`ask()` 会立刻返回 `no-client` → 直接 `next()`，
 * 由旧的 confirm 闸门接管——**不会形成"每次重试都再等 180s"的死循环**。
 */
export declare function awaitingResult(exec: any): any;
export interface ApprovalGateDeps {
    queue: ApprovalQueue;
    store: Pick<AuditStore, 'usage' | 'recordDecision'>;
    executor?: GhExecutor;
    /** 档位是运行期可变的（设置里改），因此传取数函数而不是值 */
    modeOf: () => string;
}
/**
 * 构造 `tools/execute` 监听器。
 *
 * 返回值直接喂给 `onHostEvent(ctx, 'tools/execute', handler)`——本文件不碰 cordis，
 * 因此可以完全离线单测（这是它独立于 main.ts 的第二个理由）。
 */
export declare function createApprovalGate(deps: ApprovalGateDeps): (exec: any, next: () => Promise<any>) => Promise<any>;
