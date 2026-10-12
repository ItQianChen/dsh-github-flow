import { GhExecutor } from './executor.js';
import './github-service.js';
import type { PluginConfig } from './types.js';
export declare const name = "dsh-github-flow";
/**
 * 核心服务依赖声明
 *
 * 必须显式声明 webServer 与 workspaceRegistry：
 * 在 Cordis 依赖隔离机制下，只有在 inject 显式声明的服务，当前插件作用域 ctx 才能持有
 * ctx.webServer 与 ctx.workspaceRegistry 引用，进而注册 Web UI 所需的后端 API 路由。
 */
export declare const inject: readonly ['tools', 'commands', 'webServer', 'workspaceRegistry'];
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
export * from './executor.js';
export * from './proxy.js';
export * from './github-service.js';
