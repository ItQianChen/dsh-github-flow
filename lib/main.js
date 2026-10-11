import { GhExecutor } from './executor.js';
import { createPrTool } from './tools/pr.js';
import { createIssueTool } from './tools/issue.js';
import { createRunTool } from './tools/run.js';
import { createRepoTool } from './tools/repo.js';
import { createApiTool } from './tools/api.js';
import { registerGhCommand } from './commands/gh.js';
import { registerApiRoutes } from './api/routes.js';
import { UpdateChecker } from './updater.js';
import { UpgradeManager } from './upgrade-manager.js';
import { NPM_PACKAGE_URL } from './version.js';
// 引用即生效：加载本模块以挂上 declare module '@deepseek-ai/cordis' 的 ctx.github 类型声明，
// 并随下面 `export * from './github-service.js'` 一起传给消费方。
import './github-service.js';
export const name = 'dsh-github-flow';
/**
 * 核心强依赖服务声明
 *
 * 为什么仅声明 tools 与 commands，而不声明 webServer 与 workspaceRegistry：
 * 1. Cordis 契约规范：inject 中声明的所有服务均为硬性阻塞条件，缺少任意一项会导致插件永久处于 PENDING 挂起状态；
 * 2. 插件需原生支持 Web UI 与纯 CLI / Headless Agent 两种运行场景；
 * 3. webServer 存在时自动激活 HTTP 路由与面板代理（通过 if (ctx.webServer) 动态探测），无 Web 服务时优雅降级；
 * 4. workspaceRegistry 在路由层内部未被实质消费（直接由 tryReadWorkspaces 从物理文件自愈解析），移除彻底避免孤儿依赖阻塞。
 */
export const inject = ['tools', 'commands'];
/**
 * 符合 Standard Schema / Cordis Loader 契约的 Config 运行时校验规范
 */
export const Config = {
    '~standard': {
        version: 1,
        vendor: 'dsh',
        validate(value) {
            const cfg = (typeof value === 'object' && value !== null) ? value : {};
            return {
                value: {
                    ghPath: typeof cfg.ghPath === 'string' ? cfg.ghPath : 'gh',
                    defaultTimeoutMs: typeof cfg.defaultTimeoutMs === 'number' ? cfg.defaultTimeoutMs : 30_000,
                    maxOutputChars: typeof cfg.maxOutputChars === 'number' ? cfg.maxOutputChars : 24_000,
                    maxOutputBytes: typeof cfg.maxOutputBytes === 'number' ? cfg.maxOutputBytes : undefined,
                    cacheTtlMs: typeof cfg.cacheTtlMs === 'number' ? cfg.cacheTtlMs : 15_000,
                    defaultListLimit: typeof cfg.defaultListLimit === 'number' ? cfg.defaultListLimit : 20,
                    checkUpdate: typeof cfg.checkUpdate === 'boolean' ? cfg.checkUpdate : true,
                    updateCheckIntervalMs: typeof cfg.updateCheckIntervalMs === 'number' ? cfg.updateCheckIntervalMs : 86_400_000,
                    registryUrl: typeof cfg.registryUrl === 'string' ? cfg.registryUrl : undefined,
                }
            };
        }
    }
};
export function apply(ctx, config = {}) {
    const executor = new GhExecutor(config);
    const updateChecker = new UpdateChecker({
        intervalMs: config.updateCheckIntervalMs,
        customRegistry: config.registryUrl,
    });
    const upgradeManager = new UpgradeManager();
    // 1. 兑现生态服务契约：将 GitHub 执行引擎作为服务暴露给其他 DSH 插件 (ctx.github)
    if (ctx.provide && typeof ctx.provide === 'function') {
        ctx.provide('github', executor);
    }
    else {
        ctx.github = executor;
    }
    // 2. 注册人类 Slash 命令 (/gh status, /gh upgrade, /gh help)
    if (ctx.commands) {
        registerGhCommand(ctx.commands, executor, updateChecker);
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
        registerApiRoutes(ctx, executor, ctx.workspaceRegistry, config.cacheTtlMs || 15_000, updateChecker, upgradeManager);
    }
    // 5. 启动后低优先级后台闲时静默探测：若有新版本，仅输出一次友好的控制台提示
    if (config.checkUpdate !== false) {
        setTimeout(() => {
            updateChecker.check(false).then((info) => {
                if (info.hasUpdate) {
                    console.log(`
┌────────────────────────────────────────────────────────────────────────┐
│  🚀 dsh-github-flow 插件有新版本可用: ${info.currentVersion} -> ${info.latestVersion}              │
│  升级命令: ${info.upgradeCommand.padEnd(58, ' ')}│
│  更新主页: ${NPM_PACKAGE_URL.padEnd(58, ' ')}│
└────────────────────────────────────────────────────────────────────────┘
`);
                }
            }).catch(() => { });
        }, 3_000);
    }
}
export * from './types.js';
export * from './version.js';
export * from './updater.js';
export * from './upgrade-manager.js';
// 让 `ctx.github` 的类型声明随包一起被消费方加载（声明合并在 './github-service.js' 内）
export * from './github-service.js';
