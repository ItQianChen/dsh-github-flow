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
import { classifyWrite, summarizeOperation, resolveScopeFromExec, isAuditedTool } from './audit.js';
import type { ApprovalQueue } from './approval.js';
import { hashArgs } from './approval.js';
import { describeDestructive } from './destructive.js';

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
export function shouldAskApproval(exec: any, store: Pick<AuditStore, 'usage'>, mode: string): boolean {
  if (mode === 'off') return false;
  const name = typeof exec?.name === 'string' ? exec.name : '';
  if (!name.startsWith('github_')) return false;
  if (!isAuditedTool(name)) return false;
  const usage = store.usage();
  if (!usage.active) return false;
  const args = exec?.arguments || {};
  const action = typeof args.action === 'string' ? args.action : '';
  /*
   * 是否"高危"必须问**闸门表本身**（`describeDestructive` 会执行 `when`），
   * 而不是只按 action 名分类（`classifyRisk`）。两者的差别是真实存在的：
   *   - `pr checkout` 只有带 `force: true` 才是破坏性的 → 不带 force 不该弹窗；
   *   - `issue delete` 缺 `issue_number` 时应该报"缺参数"，而不是先要求确认。
   * 按名字分类会把这两种情况都当成高危，等于用一次多余的弹窗盖住一个本该报错的问题。
   */
  if (mode === 'all-writes') {
    return classifyWrite(name, action) === true;
  }
  return describeDestructive(name, args) !== undefined;
}

/** 把宿主的一次调用翻成"人能读的待审请求"（复用审计层的摘要与作用域解析） */
export function buildPendingApproval(exec: any, executor: GhExecutor | undefined): any {
  const name = String(exec?.name || '');
  const args = exec?.arguments || {};
  const action = typeof args.action === 'string' ? args.action : '';
  const gate = describeDestructive(name, args);
  // executor 可能缺省（测试 / 非宿主环境）：解析器内部已对 undefined 做兜底
  const scope = executor ? resolveScopeFromExec(executor, exec, args) : {};
  const sessionId = typeof exec?.agent?.id === 'string' ? exec.agent.id : '';
  return {
    id: String(exec?.callId || ''),
    at: Date.now(),
    tool: name,
    action,
    summary: summarizeOperation(name, action, args),
    argsHash: hashArgs(args),
    ...(gate?.warning ? { warning: gate.warning } : {}),
    ...(gate?.impact ? { impact: gate.impact } : {}),
    ...((scope as any).repo ? { repo: (scope as any).repo } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

/**
 * 拒绝结果：必须是 `isError: true`。
 * 载荷里的 `status: 'REJECTED_BY_USER'` 与既有 `AWAITING_CONFIRMATION` 刻意不同——
 * 前者是"问了，被拒了"，后者是"还没问"，模型对此的反应必须不同。
 */
export function rejectionResult(exec: any, feedback?: string): any {
  const name = String(exec?.name || '工具');
  const payload = {
    status: 'REJECTED_BY_USER',
    warning: `⚠️ 用户拒绝了本次 ${name}`,
    reason: feedback ? `用户留言：${feedback}` : '用户未填写留言。',
    requiredAction: '不要重试同一动作；按用户留言调整参数后重新调用。',
    ...(feedback ? { feedback } : {}),
  };
  return {
    isError: true,
    error: { message: `用户拒绝了 ${name}`, info: { name: 'ApprovalError', code: 'APPROVAL_REJECTED' } },
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

/** 调用方取消（宿主 abort）：工具体没跑过，用既有的 ABORTED_BEFORE_DISPATCH 语义 */
export function cancelledResult(): any {
  return {
    isError: true,
    error: { message: '审批被取消', info: { name: 'ApprovalError', code: 'APPROVAL_CANCELLED' } },
    content: [{ type: 'text', text: 'Error: 审批被取消（调用方中止），工具未执行。' }],
  };
}

/**
 * 超时未决 → 退回**今天的行为**：把旧的 `AWAITING_CONFIRMATION` 载荷交给模型。
 *
 * 为什么这一条不能也返回 `next()`：超时意味着"有人在看但没点"，Agent 此刻应该去问人；
 * 而重试时若客户端仍不在线，`ask()` 会立刻返回 `no-client` → 直接 `next()`，
 * 由旧的 confirm 闸门接管——**不会形成"每次重试都再等 180s"的死循环**。
 */
export function awaitingResult(exec: any): any {
  const name = String(exec?.name || '');
  const args = exec?.arguments || {};
  const gate = describeDestructive(name, args);
  const payload = gate || {
    status: 'AWAITING_CONFIRMATION',
    warning: `⚠️ ${name} 需要确认`,
    impact: '该操作会改变远端或本地状态。',
    requiredAction: '如确认继续，请向用户核实并在参数中附加 `confirm: true` 重新调用。',
  };
  // 成功形状：payload 必须满足工具声明的 `output.schema = { type: 'object' }`
  return {
    isError: false,
    value: payload,
    content: [{ type: 'text', text: String((payload as any).warning || '需要确认') }],
  };
}

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
export function createApprovalGate(deps: ApprovalGateDeps) {
  const { queue, store, executor, modeOf } = deps;
  return async function approvalGate(exec: any, next: () => Promise<any>): Promise<any> {
    try {
      if (!shouldAskApproval(exec, store, modeOf())) return next();
      const item = buildPendingApproval(exec, executor);
      const outcome = await queue.ask(item, exec?.signal);
      if (outcome.decision === 'approved') {
        store.recordDecision(item.id, 'approved');
        return next();                                   // 只调一次 next()
      }
      if (outcome.decision === 'rejected') {
        store.recordDecision(item.id, 'rejected', outcome.feedback);
        return rejectionResult(exec, outcome.feedback);
      }
      store.recordDecision(item.id, outcome.decision);
      if (outcome.decision === 'cancelled') return cancelledResult();
      // 无客户端在线：fail-open 到旧行为，由工具体内的 confirm 闸门接管
      if (outcome.decision === 'no-client') return next();
      return awaitingResult(exec);                        // expired：退回旧 confirm 流程
    } catch {
      // 审核自身异常绝不阻断工具：按"没审核"处理，工具仍受 confirm 闸门约束
      return next();
    }
  };
}
