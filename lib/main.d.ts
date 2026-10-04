import { GhExecutor } from './executor.js';
import type { PluginConfig } from './types.js';
export declare const name = "dsh-github-flow";
/**
 * 核心必需依赖：仅声明 Agent 工具与命令系统
 * webServer 与 workspaceRegistry 作为可选依赖在 apply 内部按需探测，确保在 Headless / 命令行模式下核心工具正常运行
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
