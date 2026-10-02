import { GhExecutor } from './executor.js';
import { createPrTool } from './tools/pr.js';
import { createIssueTool } from './tools/issue.js';
import { createRunTool } from './tools/run.js';
import { createRepoTool } from './tools/repo.js';
import { createApiTool } from './tools/api.js';
import { registerGhCommand } from './commands/gh.js';
import { registerApiRoutes } from './api/routes.js';

export const name = 'dsh-github-flow';
export const inject = ['tools', 'commands', 'webServer', 'workspaceRegistry'] as const;

export function apply(ctx: any) {
  const executor = new GhExecutor();

  // 1. 注册人类 Slash 命令
  if (ctx.commands) {
    registerGhCommand(ctx.commands, executor);
  }

  // 2. 注册 Agent 模型工具集（5 大领域聚合工具）
  if (ctx.tools) {
    ctx.tools.register(createPrTool(executor));
    ctx.tools.register(createIssueTool(executor));
    ctx.tools.register(createRunTool(executor));
    ctx.tools.register(createRepoTool(executor));
    ctx.tools.register(createApiTool(executor));
  }

  // 3. 注册面向 Client 端的 WebServer HTTP 路由
  if (ctx.webServer) {
    registerApiRoutes(ctx.webServer, executor, ctx.workspaceRegistry);
  }
}
