import Schema from '@deepseek-ai/schemastery';
import type { PluginConfig } from './types.js';
export declare const name = "dsh-github-flow";
/**
 * 完整注入 DSH 宿主环境的核心服务，确保命令、工具与 WebServer 即刻挂载激活
 */
export declare const inject: readonly ['tools', 'commands', 'webServer', 'workspaceRegistry'];
/**
 * 强类型配置接口与运行时校验器
 */
export interface Config extends PluginConfig {
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: any, config?: Config): void;
export { GitHubService } from './service.js';
export * from './types.js';
