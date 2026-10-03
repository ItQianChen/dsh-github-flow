import Schema from '@deepseek-ai/schemastery';
import { GhExecutor } from './executor.js';
import { GitHubService } from './service.js';
import { createPrTool } from './tools/pr.js';
import { createIssueTool } from './tools/issue.js';
import { createRunTool } from './tools/run.js';
import { createRepoTool } from './tools/repo.js';
import { createApiTool } from './tools/api.js';
import { registerGhCommand } from './commands/gh.js';
import { registerApiRoutes } from './api/routes.js';
import type { PluginConfig } from './types.js';

export const name = 'dsh-github-flow';

/**
 * 完整注入 DSH 宿主环境的核心服务，确保命令、工具与 WebServer 即刻挂载激活
 */
export const inject = ['tools', 'commands', 'webServer', 'workspaceRegistry'] as const;

/**
 * 强类型配置接口与运行时校验器
 */
export interface Config extends PluginConfig {}

export const Config: Schema<Config> = Schema.object({
  ghPath: Schema.string().default('gh').description('GitHub CLI (gh) 二进制可执行文件路径'),
  defaultTimeoutMs: Schema.number().default(30000).description('CLI 命令执行超时毫秒数'),
  maxOutputChars: Schema.number().default(24000).description('防止 Token 溢出的单次截断安全阈值字符数'),
  cacheTtlMs: Schema.number().default(15000).description('Web API 概览数据缓存有效时长 (ms)'),
  defaultListLimit: Schema.number().default(20).description('默认查询列表返回条数'),
});

export function apply(ctx: any, config: Config = {}) {
  // 1. 初始化具备动态配置能力的执行引擎
  const executor = new GhExecutor(config);

  // 2. 将核心能力提升挂载为 Cordis 原生微内核服务 (ctx.github)
  new GitHubService(ctx, executor);

  // 3. 注册 Agent 模型工具集（5 大核心领域工具）
  if (ctx.tools && typeof ctx.tools.register === 'function') {
    ctx.tools.register(createPrTool(executor));
    ctx.tools.register(createIssueTool(executor));
    ctx.tools.register(createRunTool(executor));
    ctx.tools.register(createRepoTool(executor));
    ctx.tools.register(createApiTool(executor));
  }

  // 4. 注册 /gh 斜杠命令（直接同步挂载）
  if (ctx.commands) {
    registerGhCommand(ctx, executor);
  }

  // 5. 注册面向 Client 端的 WebServer HTTP 路由（直接同步挂载）
  if (ctx.webServer) {
    registerApiRoutes(ctx, executor, config);
  }
}

export { GitHubService } from './service.js';
export * from './types.js';
