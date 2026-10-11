import { GhExecutor } from './executor.js';
import './github-service.js';
import type { PluginConfig } from './types.js';
export declare const name = "dsh-github-flow";
/**
 * 核心强依赖服务声明
 *
 * 为什么仅声明 tools 与 commands，而不声明 webServer 与 workspaceRegistry：
 * 1. Cordis 契约规范：inject 中声明的所有服务均为硬性阻塞条件，缺少任意一项会导致插件永久处于 PENDING 挂起状态；
 * 2. 插件需原生支持 Web UI 与纯 CLI / Headless Agent 两种运行场景；
 * 3. webServer 存在时自动激活 HTTP 路由与面板代理（通过 if (ctx.webServer) 动态探测），无 Web 服务时优雅降级；
 * 4. workspaceRegistry 在路由层内部未被实质消费（直接由 tryReadWorkspaces 从物理文件自愈解析），移除彻底避免孤儿依赖阻塞。
 */
export declare const inject: readonly ['tools', 'commands'];
export type Config = PluginConfig;
/**
 * 符合 Standard Schema / Cordis Loader 契约的 Config 运行时校验规范
 */
export declare const Config: {
    '~standard': {
        version: number;
        vendor: string;
        validate(value: unknown): {
            value: PluginConfig;
        };
    };
};
export declare function apply(ctx: any, config?: PluginConfig): void;
export type GitHubService = GhExecutor;
export * from './types.js';
export * from './version.js';
export * from './updater.js';
export * from './upgrade-manager.js';
export * from './github-service.js';
