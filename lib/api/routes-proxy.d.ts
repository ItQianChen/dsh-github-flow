/**
 * 网络代理设置路由（驾驶舱「网络代理」设置分区的后端入口）。
 * 为什么独立于 Cordis Config：代理设置变更若走 Loader 会触发插件全量 reload
 * （工具注销重注册、面板断流），而代理是高频试错型设置，必须保存即生效。
 */
import type { UpdateChecker } from '../updater.js';
import { type RouteDeps } from './route-helpers.js';
/** ProxyManager 的路由侧最小接口：避免路由层直接依赖实现细节，测试可注入 mock */
export interface ProxyRouteManager {
    save: (input: any) => {
        ok: boolean;
        error?: string;
        state: any;
    };
    probe: () => Promise<any>;
    snapshot: () => any;
}
export declare function registerProxyRoutes(deps: RouteDeps, checker: UpdateChecker, proxyManager?: ProxyRouteManager): void;
