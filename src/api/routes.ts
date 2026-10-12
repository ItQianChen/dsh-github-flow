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
import { TtlCache } from '../cache.js';
import { UpdateChecker } from '../updater.js';
import { UpgradeManager } from '../upgrade-manager.js';
import type { GitHubOverviewData, GlobalOverviewData } from '../types.js';
import { globalCacheTtlMs, sendJson, readJsonBody, type RouteDeps } from './route-helpers.js';
import { registerOverviewRoutes } from './routes-overview.js';
import { registerActionRoutes } from './routes-actions.js';
import { registerLifecycleRoutes } from './routes-lifecycle.js';
import { registerProxyRoutes, type ProxyRouteManager } from './routes-proxy.js';

// 再导出历史公共接口：globalCacheTtlMs 曾被测试直接 import，保持路径稳定避免破坏消费方
export { globalCacheTtlMs };

export function registerApiRoutes(
  ctxOrWebServer: any,
  executor: GhExecutor,
  workspaceRegistry?: any,
  cacheTtlMs = 15_000,
  updateChecker?: UpdateChecker,
  upgradeManager?: UpgradeManager,
  proxyManager?: ProxyRouteManager
) {
  const ctx = ctxOrWebServer;
  const webServer = ctx?.webServer || ctx;
  if (!webServer || typeof webServer.register !== 'function') return;

  const checker = updateChecker || new UpdateChecker();
  const upgrader = upgradeManager || new UpgradeManager();

  const cacheMap = new TtlCache<GitHubOverviewData>(cacheTtlMs);
  const globalCache = new TtlCache<GlobalOverviewData>(globalCacheTtlMs(cacheTtlMs));

  /**
   * 注册单个路由并返回注销器。
   * 为什么需要前置探测与清理：Cordis 插件在经历热重载、异常崩溃或重新启用时，若先前的 disposer
   * 未能顺利执行，宿主全局长生命周期的 WebServer 内部 exact/prefixes 映射表中会残留历史路由；
   * 而 WebServer.register 会在键冲突时直接抛出 duplicate route 异常阻断激活。
   * 前置探测并清理残留条目可实现自愈防护与安全幂等注册。
   */
  const registerOneRoute = (route: any) => {
    const table = route.kind === 'exact' ? webServer.exact : webServer.prefixes;
    if (table && typeof table.delete === 'function' && table.has(route.path)) {
      table.delete(route.path);
    }
    return webServer.register(route);
  };

  /**
   * 将路由生命周期绑定到 Cordis 上下文作用域。
   * 为什么必须包裹在 ctx.effect 中：Cordis 框架要求外部服务的绑定通过 effect 纳管，
   * 当插件被禁用、配置更新热重载或 scope 销毁时，Cordis 会自动执行返回的 disposer，
   * 干净地从 WebServer 中注销路由，彻底杜绝孤儿路由残留与重复注册报错。
   * 当在缺乏 ctx.effect 的简易单元测试环境下运行时，优雅退化为直接注册。
   */
  const bindRoute = (route: any) => {
    if (ctx && typeof ctx.effect === 'function') {
      ctx.effect(() => registerOneRoute(route), `github-flow: ${route.kind} ${route.path}`);
    } else {
      registerOneRoute(route);
    }
  };

  // 各分组共享的依赖包：分组内部不再触碰 ctx/webServer 全局
  const deps: RouteDeps = { bindRoute, sendJson, readJsonBody };

  registerOverviewRoutes(deps, executor, cacheMap, globalCache, checker);
  registerActionRoutes(deps, executor, cacheMap, globalCache);
  registerLifecycleRoutes(deps, executor, checker, upgrader);
  registerProxyRoutes(deps, checker, proxyManager);
}
