import Schema from '@deepseek-ai/schemastery';
import type { PluginConfig } from './types.js';
export declare const name = "dsh-github-flow";
/**
 * 仅将核心基础服务作为硬性依赖，解绑 webServer 与 commands。
 * 在无 Web 界面环境（如 Headless、纯终端、CI 自动化模式）下也能即刻激活，杜绝 PENDING 卡死。
 */
export declare const inject: readonly ['tools'];
/**
 * 遵循官方 Cordis 规范导出的强类型配置接口与运行时校验器
 */
export interface Config extends PluginConfig {
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: any, config?: Config): void;
export { GitHubService } from './service.js';
export * from './types.js';
