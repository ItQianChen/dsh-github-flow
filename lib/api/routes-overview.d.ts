/**
 * 概览类路由：单仓库 overview + 全局驾驶舱 global-overview。
 * 这两个端点是面板首屏关键路径（也是项目里最重的两个 handler），单独成组
 * 便于按「读密集」特征统一演进（缓存策略、字段投影、并发控制）。
 */
import type { GhExecutor } from '../executor.js';
import { TtlCache } from '../cache.js';
import type { UpdateChecker } from '../updater.js';
import type { GitHubOverviewData, GlobalOverviewData } from '../types.js';
import { type RouteDeps } from './route-helpers.js';
export declare function registerOverviewRoutes(deps: RouteDeps, executor: GhExecutor, cacheMap: TtlCache<GitHubOverviewData>, globalCache: TtlCache<GlobalOverviewData>, checker: UpdateChecker): void;
