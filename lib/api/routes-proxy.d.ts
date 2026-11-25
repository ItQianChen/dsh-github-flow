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
    /** 当前生效地址；用于判定是否需要改走 gh 链路（socks5 无法用 Node fetch 探测） */
    getEffectiveUrl?: () => string;
    /** 回填外部探测结果，保证 lastProbe 与持久化口径一致 */
    recordProbe?: (result: any) => void;
}
export declare function registerProxyRoutes(deps: RouteDeps, checker: UpdateChecker, proxyManager?: ProxyRouteManager, executor?: {
    run: (args: string[], opts?: any) => Promise<any>;
}): void;
