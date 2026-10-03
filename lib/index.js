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
export const name = 'dsh-github-flow';
/**
 * 仅将核心基础服务作为硬性依赖，解绑 webServer 与 commands。
 * 在无 Web 界面环境（如 Headless、纯终端、CI 自动化模式）下也能即刻激活，杜绝 PENDING 卡死。
 */
export const inject = ['tools'];
export const Config = Schema.object({
    ghPath: Schema.string().default('gh').description('GitHub CLI (gh) 二进制可执行文件路径'),
    defaultTimeoutMs: Schema.number().default(30000).description('CLI 命令执行超时毫秒数'),
    maxOutputChars: Schema.number().default(24000).description('防止 Token 溢出的单次截断安全阈值字符数'),
    cacheTtlMs: Schema.number().default(15000).description('Web API 概览数据缓存有效时长 (ms)'),
    defaultListLimit: Schema.number().default(20).description('默认查询列表返回条数'),
});
export function apply(ctx, config = {}) {
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
    // 4. 可选依赖：命令服务（存在时动态激活，不阻塞主流程）
    if (ctx.inject && typeof ctx.inject === 'function') {
        ctx.inject(['commands'], (innerCtx) => {
            registerGhCommand(innerCtx, executor);
        });
    }
    else if (ctx.commands) {
        registerGhCommand(ctx, executor);
    }
    // 5. 可选依赖：Web 界面服务（存在时动态注入路由并由 effect 管理生命周期）
    if (ctx.inject && typeof ctx.inject === 'function') {
        ctx.inject(['webServer'], (innerCtx) => {
            registerApiRoutes(innerCtx, executor, config);
        });
    }
    else if (ctx.webServer) {
        registerApiRoutes(ctx, executor, config);
    }
}
export { GitHubService } from './service.js';
export * from './types.js';
