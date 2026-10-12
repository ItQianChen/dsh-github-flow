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
import { UpdateChecker } from '../updater.js';
import { UpgradeManager } from '../upgrade-manager.js';
import { globalCacheTtlMs } from './route-helpers.js';
import { type ProxyRouteManager } from './routes-proxy.js';
export { globalCacheTtlMs };
export declare function registerApiRoutes(ctxOrWebServer: any, executor: GhExecutor, workspaceRegistry?: any, cacheTtlMs?: number, updateChecker?: UpdateChecker, upgradeManager?: UpgradeManager, proxyManager?: ProxyRouteManager): void;
