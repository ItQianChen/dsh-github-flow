import { GhExecutor } from './executor.js';
import type { PluginConfig } from './types.js';
export declare const name = "dsh-github-flow";
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
