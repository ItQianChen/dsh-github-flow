/**
 * 动作类路由：缓存强制刷新 + 右侧栏快捷操作（create_pr/create_issue/open_browser/open_terminal）。
 * 共同特征：POST 触发、读少写多、无缓存语义，与概览类路由的演进方向不同。
 */
import type { GhExecutor } from '../executor.js';
import { TtlCache } from '../cache.js';
import type { GitHubOverviewData, GlobalOverviewData } from '../types.js';
import { type RouteDeps } from './route-helpers.js';
export declare function registerActionRoutes(deps: RouteDeps, executor: GhExecutor, cacheMap: TtlCache<GitHubOverviewData>, globalCache: TtlCache<GlobalOverviewData>): void;
