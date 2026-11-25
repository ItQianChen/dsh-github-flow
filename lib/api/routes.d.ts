/**
 * API 路由注册器（纯装配骨架）。
 *
 * 架构说明：具体 handler 按领域拆分在 routes-overview / routes-actions /
 * routes-lifecycle / routes-proxy 四个分组文件中，本文件只负责：
 * 1. 解析 ctx/webServer 与可选依赖（缺省时给默认实现，保持向后兼容）；
 * 2. 构造共享闭包（缓存实例 + bindRoute 生命周期绑定）；
 * 3. 按固定顺序装配各分组。
 *
 * 为什么 bindRoute 必须在这里定义：它闭包引用 ctx（effect 纳管）与 webServer
 * （自愈清理），分组文件只消费注入的 RouteDeps，不感知 Cordis 上下文。
 */
import type { GhExecutor } from '../executor.js';
import type { AuditStore } from '../audit.js';
import { UpdateChecker } from '../updater.js';
import { UpgradeManager } from '../upgrade-manager.js';
import { globalCacheTtlMs } from './route-helpers.js';
import { type ProxyRouteManager } from './routes-proxy.js';
export { globalCacheTtlMs };
export declare function registerApiRoutes(ctxOrWebServer: any, executor: GhExecutor, cacheTtlMs?: number, updateChecker?: UpdateChecker, upgradeManager?: UpgradeManager, proxyManager?: ProxyRouteManager, 
/**
 * 显式 webServer 覆盖。
 *
 * 为什么必须显式传：cordis 的服务只有 `inject` 过才会挂在 `ctx` 上，而未 inject 时
 * 读 `ctx.webServer` **不是返回 undefined，而是直接抛错**——
 * `cannot get property "webServer" without inject`（cordis `src/reflect.ts:144-169`
 * 的 Proxy get 陷阱）。所以 `ctx?.webServer` 这种"安全回退"根本不安全：它在
 * CLI/TUI profile 里会把插件从「PENDING」变成「加载失败」。
 */
webServerOverride?: any, 
/**
 * 操作记录存储。
 *
 * 为什么由调用方注入而不是在这里 new：同一个实例必须**同时**喂给
 * `tools/result` 切面（写入）与本分组（读取），否则内存队列与查询视图是两份，
 * 表现为「刚做完的操作要等重启才出现」——与 `CacheRegistry` 那次的教训同源。
 *
 * 缺省不注册审计路由（测试里大量调用本函数，不该因为没传 store 就落盘到用户主目录）。
 */
auditStore?: AuditStore): void;
