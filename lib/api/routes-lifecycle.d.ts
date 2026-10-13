/**
 * 生命周期类路由：版本检查 / 一键升级 / 升级状态轮询 / 认证轻量探针 / 更新源设置。
 * 共同特征：服务插件自身状态而非 GitHub 业务数据，故障语义独立于概览链路。
 */
import type { GhExecutor } from '../executor.js';
import type { UpdateChecker } from '../updater.js';
import type { UpgradeManager } from '../upgrade-manager.js';
import { type RouteDeps } from './route-helpers.js';
export declare function registerLifecycleRoutes(deps: RouteDeps, executor: GhExecutor, checker: UpdateChecker, upgrader: UpgradeManager): void;
