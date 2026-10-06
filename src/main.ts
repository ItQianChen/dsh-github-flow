import { GhExecutor } from './executor.js';
import { createPrTool } from './tools/pr.js';
import { createIssueTool } from './tools/issue.js';
import { createRunTool } from './tools/run.js';
import { createRepoTool } from './tools/repo.js';
import { createApiTool } from './tools/api.js';
import { registerGhCommand } from './commands/gh.js';
import { registerApiRoutes } from './api/routes.js';
// 引用即生效：加载本模块以挂上 declare module '@deepseek-ai/cordis' 的 ctx.github 类型声明，
// 并随下面 `export * from './github-service.js'` 一起传给消费方。
import './github-service.js';
import type { PluginConfig } from './types.js';

export const name = 'dsh-github-flow';

export const inject = ['tools', 'commands', 'webServer', 'workspaceRegistry'] as const;

export type Config = PluginConfig;

/**
 * 符合 Standard Schema / Cordis Loader 契约的 Config 运行时校验规范
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh',
    validate(value: unknown) {
      const cfg = (typeof value === 'object' && value !== null) ? value as Record<string, any> : {};
      return {
        value: {
          ghPath: typeof cfg.ghPath === 'string' ? cfg.ghPath : 'gh',
          defaultTimeoutMs: typeof cfg.defaultTimeoutMs === 'number' ? cfg.defaultTimeoutMs : 30_000,
          maxOutputChars: typeof cfg.maxOutputChars === 'number' ? cfg.maxOutputChars : 24_000,
          maxOutputBytes: typeof cfg.maxOutputBytes === 'number' ? cfg.maxOutputBytes : undefined,
          cacheTtlMs: typeof cfg.cacheTtlMs === 'number' ? cfg.cacheTtlMs : 15_000,
          defaultListLimit: typeof cfg.defaultListLimit === 'number' ? cfg.defaultListLimit : 20,
        } as PluginConfig
      };
    }
  }
};

export function apply(ctx: any, config: PluginConfig = {}) {
  const executor = new GhExecutor(config);

  // 1. 兑现生态服务契约：将 GitHub 执行引擎作为服务暴露给其他 DSH 插件 (ctx.github)
  if (ctx.provide && typeof ctx.provide === 'function') {
    ctx.provide('github', executor);
  } else {
    ctx.github = executor;
  }

  // 2. 注册人类 Slash 命令 (/gh status, /gh help)
  if (ctx.commands) {
    registerGhCommand(ctx.commands, executor);
  }

  // 3. 注册 Agent 模型工具集（5 大核心领域工具）
  if (ctx.tools) {
    ctx.tools.register(createPrTool(executor));
    ctx.tools.register(createIssueTool(executor));
    ctx.tools.register(createRunTool(executor));
    ctx.tools.register(createRepoTool(executor));
    ctx.tools.register(createApiTool(executor));
  }

  // 4. 注册面向 Client 端的 WebServer HTTP 路由（如果当前环境启用了 Web UI 服务）
  if (ctx.webServer) {
    // 传入 ctx 作用域对象，使 routes 能够通过 ctx.effect 绑定生命周期并在插件卸载/重载时自动注销；
    // cacheTtlMs 传给路由层以尊重用户的缓存 TTL 配置。
    registerApiRoutes(ctx, executor, ctx.workspaceRegistry, config.cacheTtlMs || 15_000);
  }
}

export type GitHubService = GhExecutor;

export * from './types.js';
// 让 `ctx.github` 的类型声明随包一起被消费方加载（声明合并在 './github-service.js' 内）
export * from './github-service.js';

