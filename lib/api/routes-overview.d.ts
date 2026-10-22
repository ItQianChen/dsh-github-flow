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
/**
 * 右侧栏单仓库 PR / Issue 的展示条数上限。
 *
 * 为什么从 10 提到 20：加上 `--state all` 后列表里混入了 closed/merged，
 * 而 `gh pr list` 的排序依据是 **number 降序**（实测 30 条验证：14763、14752、
 * 14751 …… 严格递减），不是 updatedAt。取 10 条时实测 cli/cli 只剩 5 条非 OPEN，
 * 用户切到「Merged」可能只有 2-3 条，筛选体验形同虚设。
 * 多拉 10 条的代价可忽略（同一个 gh 进程，仅 JSON 体积略增），
 * 但绝不能改成「每个状态各查一次」——那会把 3 个 gh 子进程变成 6~9 个，
 * 右侧栏首屏本就受 Promise.all 8 秒超时约束。
 */
/**
 * 列表默认每页条数。
 *
 * 为什么是 15 而不是 20：与右侧栏「Git 提交」「未提交变更」两个已有分页的默认页大小对齐，
 * 用户下滑即可继续加载（`prLimit/issueLimit/runLimit` 查询参数），所以首屏不必再靠
 * 「多拉一点」来换取筛选体验。20 条时代首屏 JSON 实测可达 28,608 字符，直接撞上
 * executor 的 24,000 字符输出上限 → 被截断 → JSON 解析被跳过 → 面板空列表且无报错。
 */
export declare const RIGHTBAR_LIST_LIMIT = 15;
/**
 * 缓存键：必须把三个分页参数算进去。
 * 只用 cwd 当键的话，「先加载 15 条」的缓存会喂给「请求 30 条」的那次刷新，
 * 表现是点了「加载更多」列表不变——而且因为命中的是缓存，连请求日志都没有。
 */
export declare function overviewCacheKey(cwd: string, prLimit: number, issueLimit: number, runLimit: number): string;
export declare function registerOverviewRoutes(deps: RouteDeps, executor: GhExecutor, cacheMap: TtlCache<GitHubOverviewData>, globalCache: TtlCache<GlobalOverviewData>, checker: UpdateChecker): void;
