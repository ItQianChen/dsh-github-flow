import { TtlCache } from '../cache.js';
import { UpdateChecker } from '../updater.js';
import { UpgradeManager } from '../upgrade-manager.js';
import { globalCacheTtlMs, sendJson, readJsonBody } from './route-helpers.js';
import { registerOverviewRoutes } from './routes-overview.js';
import { registerActionRoutes } from './routes-actions.js';
import { registerLifecycleRoutes } from './routes-lifecycle.js';
import { registerProxyRoutes } from './routes-proxy.js';
// 再导出历史公共接口：globalCacheTtlMs 曾被测试直接 import，保持路径稳定避免破坏消费方
export { globalCacheTtlMs };
export function registerApiRoutes(ctxOrWebServer, executor, cacheTtlMs = 15_000, updateChecker, upgradeManager, proxyManager, 
/**
 * 显式 webServer 覆盖。
 *
 * 为什么必须显式传：cordis 的服务只有 `inject` 过才会挂在 `ctx` 上，而未 inject 时
 * 读 `ctx.webServer` **不是返回 undefined，而是直接抛错**——
 * `cannot get property "webServer" without inject`（cordis `src/reflect.ts:144-169`
 * 的 Proxy get 陷阱）。所以 `ctx?.webServer` 这种"安全回退"根本不安全：它在
 * CLI/TUI profile 里会把插件从「PENDING」变成「加载失败」。
 */
webServerOverride) {
    const ctx = ctxOrWebServer;
    // 只对「真 Context」走 ctx.get()：ctx.get 是 Context 原型方法，读它永远安全；
    // 而 `ctx.webServer` 只有确定 ctx 不是 cordis Proxy（即测试用的普通对象）时才能读。
    const isCordisContext = typeof ctx?.get === 'function';
    const webServer = webServerOverride ?? (isCordisContext ? ctx.get('webServer') : (ctx?.webServer ?? ctx));
    if (!webServer || typeof webServer.register !== 'function')
        return;
    const checker = updateChecker || new UpdateChecker();
    const upgrader = upgradeManager || new UpgradeManager();
    const cacheMap = new TtlCache(cacheTtlMs);
    const globalCache = new TtlCache(globalCacheTtlMs(cacheTtlMs));
    /**
     * 注册单个路由并返回注销器。
     * 为什么需要前置探测与清理：Cordis 插件在经历热重载、异常崩溃或重新启用时，若先前的 disposer
     * 未能顺利执行，宿主全局长生命周期的 WebServer 内部 exact/prefixes 映射表中会残留历史路由；
     * 而 WebServer.register 会在键冲突时直接抛出 duplicate route 异常阻断激活。
     * 前置探测并清理残留条目可实现自愈防护与安全幂等注册。
     */
    const registerOneRoute = (route) => {
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
    const bindRoute = (route) => {
        if (ctx && typeof ctx.effect === 'function') {
            ctx.effect(() => registerOneRoute(route), `github-flow: ${route.kind} ${route.path}`);
        }
        else {
            registerOneRoute(route);
        }
    };
    // 各分组共享的依赖包：分组内部不再触碰 ctx/webServer 全局
    const deps = { bindRoute, sendJson, readJsonBody };
    registerOverviewRoutes(deps, executor, cacheMap, globalCache, checker);
    registerActionRoutes(deps, executor, cacheMap, globalCache);
    registerLifecycleRoutes(deps, executor, checker, upgrader);
    registerProxyRoutes(deps, checker, proxyManager);
}
