/**
 * 人工审核路由（轮询待审 / 提交决定 / 心跳）。
 *
 * 三条都**不做**写业务：它们只把人的动作送进 `ApprovalQueue`，
 * 由 `main.ts` 的 `tools/execute` 接线决定工具能不能跑。
 *
 * CSRF：decision / heartbeat 都会改变进程状态（放行一次高危操作），
 * 必须过 `guardLocalWrite({ requireJson: true })`——与删除/清空同一套门。
 */
import type { RouteDeps } from './route-helpers.js';
import type { ApprovalQueue } from '../approval.js';
export declare function registerApprovalRoutes(deps: RouteDeps, queue: ApprovalQueue): void;
