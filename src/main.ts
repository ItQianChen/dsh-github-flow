import { GhExecutor } from './executor.js';
import { createPrTool } from './tools/pr.js';
import { createIssueTool } from './tools/issue.js';
import { createRunTool } from './tools/run.js';
import { createRepoTool } from './tools/repo.js';
import { createApiTool } from './tools/api.js';
import { createReleaseTool } from './tools/release.js';
import { createSecretTool } from './tools/secret.js';
import { createSkillTool } from './tools/skill.js';
import { createLabelTool } from './tools/label.js';
import { createRulesetTool } from './tools/ruleset.js';
import { createHelpTool } from './tools/help.js';
import { registerGhCommand } from './commands/gh.js';
import { registerApiRoutes } from './api/routes.js';
import { UpdateChecker } from './updater.js';
import { UpgradeManager } from './upgrade-manager.js';
import { ProxyManager } from './proxy.js';
import { NPM_PACKAGE_URL } from './version.js';
import { loadUpdateSettings } from './update-settings.js';
// 引用即生效：加载本模块以挂上 declare module '@deepseek-ai/cordis' 的 ctx.github 类型声明，
// 并随下面 `export * from './github-service.js'` 一起传给消费方。
import './github-service.js';
import type { PluginConfig } from './types.js';

export const name = 'dsh-github-flow';

/**
 * 核心服务依赖声明
 *
 * 必须显式声明 webServer 与 workspaceRegistry：
 * 在 Cordis 依赖隔离机制下，只有在 inject 显式声明的服务，当前插件作用域 ctx 才能持有
 * ctx.webServer 与 ctx.workspaceRegistry 引用，进而注册 Web UI 所需的后端 API 路由。
 */
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
          checkUpdate: typeof cfg.checkUpdate === 'boolean' ? cfg.checkUpdate : true,
          agentEnvInjection: cfg.agentEnvInjection !== false,
          updateCheckIntervalMs: typeof cfg.updateCheckIntervalMs === 'number' ? cfg.updateCheckIntervalMs : 86_400_000,
          registryUrl: typeof cfg.registryUrl === 'string' ? cfg.registryUrl : undefined,
          proxyUrl: typeof cfg.proxyUrl === 'string' ? cfg.proxyUrl : undefined,
        } as PluginConfig
      };
    }
  }
};

export function apply(ctx: any, config: PluginConfig = {}) {
  const executor = new GhExecutor(config);
  // 代理管理器：优先读取用户在驾驶舱保存的 proxy.json，回落 cordis.patch.yml 的
  // proxyUrl 预置值；两者皆无时保持直连（gh 自然继承宿主系统环境变量）。
  // 装配后 executor/upgradeManager/updater 三条外联链路全部经它路由。
  const proxyManager = new ProxyManager(config.proxyUrl);
  executor.attachProxyManager(proxyManager);
  const updateChecker = new UpdateChecker({
    intervalMs: config.updateCheckIntervalMs,
    customRegistry: config.registryUrl,
    // checkUpdate: false 熔断全部探测入口（路由/命令/启动横幅共用此实例）
    enabled: config.checkUpdate !== false,
  });
  // 更新源设置（UI 持久化 store 优先于 Cordis 静态配置）：
  // 启动时读取并应用到 checker；UI 保存时经路由直接调 applySettings 热切换。
  const updateMode = loadUpdateSettings();
  updateChecker.applySettings(updateMode);
  updateChecker.applyProxy(proxyManager);
  const upgradeManager = new UpgradeManager();
  upgradeManager.attachProxyManager(proxyManager);
  // 注入查询函数而非静态值：用户切源后，下一次一键升级的 registry 实时跟随
  upgradeManager.attachUpdateModeQuery(() => updateChecker.getSourceMode());

  // 1. 兑现生态服务契约：将 GitHub 执行引擎作为服务暴露给其他 DSH 插件 (ctx.github)
  if (ctx.provide && typeof ctx.provide === 'function') {
    ctx.provide('github', executor);
  } else {
    ctx.github = executor;
  }

  // 2. 注册人类 Slash 命令 (/gh status, /gh upgrade, /gh help)
  if (ctx.commands) {
    registerGhCommand(ctx.commands, executor, updateChecker);
  }

  // 3. 注册 Agent 模型工具集（核心领域工具 + 元指南）
  if (ctx.tools) {
    ctx.tools.register(createPrTool(executor));
    ctx.tools.register(createIssueTool(executor));
    ctx.tools.register(createRunTool(executor));
    ctx.tools.register(createRepoTool(executor));
    ctx.tools.register(createApiTool(executor));
    ctx.tools.register(createReleaseTool(executor));
    ctx.tools.register(createSecretTool(executor));
    ctx.tools.register(createSkillTool(executor));
    ctx.tools.register(createLabelTool(executor));
    ctx.tools.register(createRulesetTool(executor));
    ctx.tools.register(createHelpTool(executor));
  }

  // 4. 注册面向 Client 端的 WebServer HTTP 路由（如果当前环境启用了 Web UI 服务）
  if (ctx.webServer) {
    // 传入 ctx 作用域对象，使 routes 能够通过 ctx.effect 绑定生命周期并在插件卸载/重载时自动注销；
    // cacheTtlMs 传给路由层以尊重用户的缓存 TTL 配置。
    // proxyManager 传入以挂载 /api/github/proxy* 设置路由（驾驶舱代理设置入口）。
    registerApiRoutes(
      ctx,
      executor,
      ctx.workspaceRegistry,
      config.cacheTtlMs || 15_000,
      updateChecker,
      upgradeManager,
      proxyManager
    );
  }

  // 5. 启动后低优先级后台闲时静默探测：若有新版本，仅输出一次友好的控制台提示
  if (config.checkUpdate !== false) {
    // 包裹在 ctx.effect 中（Cordis 规范）：热重载/卸载发生在 3 秒延迟窗口内时，
    // 取消挂起的定时器，避免旧实例在新实例加载后仍向控制台打印升级横幅。
    // 无头/测试环境缺 ctx.effect 时优雅退化为裸定时器（一次性触发，无泄漏）。
    const scheduleProbe = () => {
      const timer = setTimeout(() => {
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
        }).catch(() => {});
      }, 3_000);
      return () => clearTimeout(timer);
    };
    if (typeof ctx.effect === 'function') {
      ctx.effect(scheduleProbe);
    } else {
      scheduleProbe();
    }
  }
}

export type GitHubService = GhExecutor;

export * from './types.js';
export * from './version.js';
export * from './updater.js';
export * from './upgrade-manager.js';
export * from './executor.js';
export * from './proxy.js';
// 让 `ctx.github` 的类型声明随包一起被消费方加载（声明合并在 './github-service.js' 内）
export * from './github-service.js';


