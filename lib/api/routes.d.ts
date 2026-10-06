import type { GhExecutor } from '../executor.js';
/**
 * 由用户配置推导全局驾驶舱的缓存时长。
 * 抽成导出的纯函数：TTL 的推导规则是测试断言的对象，埋在闭包里就只能靠猜。
 */
export declare function globalCacheTtlMs(cacheTtlMs: number): number;
export declare function registerApiRoutes(webServerService: any, executor: GhExecutor, workspaceRegistry?: any, cacheTtlMs?: number): void;
