/**
 * Organizations 只读浏览路由（组织列表 / 组织聚合 / 单仓库下钻）。
 *
 * 设计边界（对应 issue #17 的「查看」诉求）：
 * - 只读：本文件不注册任何写操作，不碰 gh 的 create/edit/merge/delete；
 *   组织仓库的写操作仍走既有的 19 大工具（它们本来就带 repo 参数）。
 * - 按需拉取：组织视图与全局概览分开缓存，切组织不会让全局缓存失效。
 * - 组织级与仓库级共用 gh search：`--owner=<org>` 与 `--repo=<owner/name>` 是
 *   同一个命令的两个作用域参数，返回结构一致，前端不需要两套解析。
 */
import type { GhExecutor } from '../executor.js';
import type { OrgOverviewData } from '../types.js';
import type { TtlCache } from '../cache.js';
import type { RouteDeps } from './route-helpers.js';
export declare function registerOrgRoutes(deps: RouteDeps, executor: GhExecutor, orgCache?: TtlCache<OrgOverviewData>): void;
