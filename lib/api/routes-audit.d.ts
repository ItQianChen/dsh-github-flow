/**
 * 操作记录路由（列表 / 删除 / 清空）。
 *
 * 边界：
 * - 本分组**不产生**记录，只读取与删除 `AuditStore`；写入发生在 `tools/result` 切面。
 * - 删除用 `POST + JSON body` 而不是 `DELETE + body`：本项目所有写端点统一走
 *   「JSON body + application/json 媒体类型」这道 CSRF 门（`guardLocalWrite({requireJson})`
 *   依赖 body 的 Content-Type）。`DELETE` 带 body 在 Node/浏览器组合上行为不一致，
 *   为一个动词不一致去分裂两套校验不值。
 * - 不做分页游标：行数上限 2000，`offset` 足够。
 */
import type { RouteDeps } from './route-helpers.js';
import type { AuditStore } from '../audit.js';
export declare function registerAuditRoutes(deps: RouteDeps, store: AuditStore): void;
