import Schema from '@deepseek-ai/schemastery';
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
import { createCacheTool } from './tools/cache.js';
import { createGistTool } from './tools/gist.js';
import { createStatusTool } from './tools/status.js';
import { createAgentTaskTool } from './tools/agent-task.js';
import { createDiscussionTool } from './tools/discussion.js';
import { createProjectTool } from './tools/project.js';
import { createCodespaceTool } from './tools/codespace.js';
import { createHelpTool } from './tools/help.js';
import { defaultTelemetryCollector } from './telemetry.js';
import { registerGhCommand } from './commands/gh.js';
import { registerApiRoutes } from './api/routes.js';
import { UpdateChecker } from './updater.js';
import { UpgradeManager } from './upgrade-manager.js';
import { ProxyManager } from './proxy.js';
import { NPM_PACKAGE_URL } from './version.js';
import { loadUpdateSettings } from './update-settings.js';
import { applyTier } from './tool-tiers.js';
// 引用即生效：加载本模块以挂上 declare module '@deepseek-ai/cordis' 的 ctx.github 类型声明，
// 并随下面 `export * from './github-service.js'` 一起传给消费方。
import './github-service.js';
export const name = 'dsh-github-flow';
/**
 * 服务依赖声明：只声明唯一的硬依赖 `tools`。
 *
 * 为什么其余三个服务降级为可选（`ctx.inject` 等待）：
 * - `webServer` 由 `@deepseek-ai/dsh-web-app` 组合提供。`dsh-tui` 与纯 CLI profile 只装
 *   `dsh-base`，没有这个服务——写成硬依赖会让插件在这些 profile 里**永久 PENDING**，
 *   用户一个工具都拿不到（README 明确支持 CLI 安装）。
 * - `commands` 由 `dsh-commands` 提供，同样不保证所有组合都有。
 *
 * cordis 的语义是：`inject` 里的服务缺席 ⇒ 插件不激活。因此"声明了就必须真存在"，
 * 声明硬依赖却按可选写 `if (ctx.X)` 是最坏组合：既让可选服务变成了硬门槛，
 * 又让降级分支永远走不到。
 */
export const inject = ['tools'];
/**
 * 本插件向宿主提供的服务名。
 * cordis loader 读取该元数据（registry.d.ts），与 `ctx.provide('github', …)` 必须同名。
 */
export const provide = 'github';
/**
 * 插件配置 Schema（Schemastery）。
 *
 * 与旧的手写 `'~standard'.validate()` 相比，这里拿到的是**真校验**：类型不符直接抛
 * `ValidationError`（旧实现对脏配置静默回落到默认值，配错了永远不报错）。
 * 未知键仍原样透传，与旧行为一致。
 *
 * `.volatile()` 的三个字段是「运行期可热改、不触发插件 reload」的稳定引用：
 * 读取点必须走 `.get()`，否则拿到的是引用对象本身（详见 `resolvePluginConfig`）。
 *
 * 为什么 `checkUpdate` 刻意**不** volatile：`UpdateChecker.enabled` 是构造期只读字段，
 * 它同时决定轮询定时器与启动横幅是否建立。标成 volatile 只会得到「配置改了、行为没变」
 * 的假热更新；让它保持普通字段，改动时插件整体重载，语义才是对的。
 */
const ConfigSchema = Schema.object({
    ghPath: Schema.string().default('gh'),
    defaultTimeoutMs: Schema.number().default(30_000).volatile(),
    maxOutputChars: Schema.number().default(24_000).volatile(),
    // 不设默认值：缺省时由 maxOutputChars × 4 推导（executor 构造期），
    // 显式给默认值会让「随 maxOutputChars 联动」这条语义失效。
    maxOutputBytes: Schema.number(),
    cacheTtlMs: Schema.number().default(15_000),
    defaultListLimit: Schema.number().default(20).volatile(),
    checkUpdate: Schema.boolean().default(true),
    updateCheckIntervalMs: Schema.number().default(86_400_000),
    registryUrl: Schema.string(),
    agentEnvInjection: Schema.boolean().default(true),
    proxyUrl: Schema.string(),
    // 档位：缺省键直接缺席 → 下游按 full / 非只读处理，默认零破坏。
    // 不设 default，是为了让「用户没配」与「用户显式配了 full」在诊断时仍可区分。
    toolsets: Schema.array(Schema.string()),
    read_only: Schema.boolean(),
});
/** Cordis loader 消费的配置 Schema。 */
export const Config = ConfigSchema;
/**
 * 把 Schema 输出摊平为执行引擎消费的普通配置对象。
 *
 * 为什么必须显式摊平而不是 `{...config}`：volatile 字段是 `{ get(), [write]() }` 引用对象，
 * 展开后仍是引用。`GhExecutor` 把它当数字用（`length > maxOutputChars`）不会报错，
 * 只会让截断阈值变成 NaN 比较——静默失效，属于最难排查的一类回归。
 * 逐字段列举而非遍历：新增配置项时这里会漏，但漏了 `tsc` 立刻报错，不会静默。
 */
function resolvePluginConfig(config) {
    return {
        ghPath: config.ghPath,
        defaultTimeoutMs: config.defaultTimeoutMs.get(),
        maxOutputChars: config.maxOutputChars.get(),
        maxOutputBytes: config.maxOutputBytes,
        cacheTtlMs: config.cacheTtlMs,
        defaultListLimit: config.defaultListLimit.get(),
        checkUpdate: config.checkUpdate,
        updateCheckIntervalMs: config.updateCheckIntervalMs,
        // 可选字符串字段在 Schema 里没有 default，缺省时键直接缺席，显式 null 也会被放行；
        // 统一归一成 undefined，下游 `if (x)` 语义才不会被 null 误伤。
        registryUrl: config.registryUrl ?? undefined,
        agentEnvInjection: config.agentEnvInjection,
        proxyUrl: config.proxyUrl ?? undefined,
        toolsets: config.toolsets,
        read_only: config.read_only,
    };
}
/**
 * 监听宿主事件。
 *
 * 为什么要这层收窄：`ctx.on` 的类型参数是 `keyof Events`，而本插件依赖的两个事件
 * 声明都在本仓之外——`tools/result` 来自 `@deepseek-ai/dsh-tools`，
 * `loader/volatile-update` 来自 `@deepseek-ai/cordis-plugin-loader`。
 * 本仓不能直接依赖前者：它的 peer 闭包引用了未发布的 `@deepseek-ai/dsh-type-meta`
 * （npm 404），`pnpm install` 直接失败。
 *
 * 为什么不用 `declare module '@deepseek-ai/cordis'` 自行合并 `Events`：消费方若同时加载
 * dsh-tools，两份方法签名会合成重载，而本仓这份 `any` 签名会把对方的精确类型盖掉。
 * 只在本文件内收窄，不污染全局契约。
 */
function onHostEvent(ctx, name, listener) {
    ctx.on(name, listener);
}
export function apply(ctx, config = Config({})) {
    const plain = resolvePluginConfig(config);
    const executor = new GhExecutor(plain);
    // 代理管理器：优先读取用户在驾驶舱保存的 proxy.json，回落 cordis.patch.yml 的
    // proxyUrl 预置值；两者皆无时保持直连（gh 自然继承宿主系统环境变量）。
    // 装配后 executor/upgradeManager/updater 三条外联链路全部经它路由。
    const proxyManager = new ProxyManager(plain.proxyUrl);
    executor.attachProxyManager(proxyManager);
    const updateChecker = new UpdateChecker({
        intervalMs: plain.updateCheckIntervalMs,
        customRegistry: plain.registryUrl,
        // checkUpdate: false 熔断全部探测入口（路由/命令/启动横幅共用此实例）
        enabled: plain.checkUpdate,
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
    // 服务注册由当前 fiber 拥有：返回的 disposer 或 fiber 卸载时自动注销（cordis reflect.d.ts:29-43），
    // 因此不需要 `ctx.github = executor` 这类裸赋值兜底——它绕过 inject 语义且永不清理。
    ctx.provide('github', executor);
    // 2. 注册 Cordis tools/result 事件切面（无侵入全量工具审计与降级率打点）
    onHostEvent(ctx, 'tools/result', (exec, result) => {
        try {
            const toolName = exec?.name || exec?.tool?.name || '';
            if (typeof toolName === 'string' && toolName.startsWith('github_')) {
                const args = exec?.arguments || exec?.args || {};
                defaultTelemetryCollector.recordCall(toolName, args, result);
            }
        }
        catch {
            // Fail-Open 非阻塞防线：严禁打点逻辑异常影响主工具调用
        }
    });
    // 3. 注册人类 Slash 命令 (/gh status, /gh upgrade, /gh help)
    // 用 ctx.inject 声明式等待，而不是一次性 ctx.get 探测：服务若晚于本插件就绪，
    // 一次性探测拿到的是 undefined，且**永远没有第二次机会**，/gh 就此消失。
    // ctx.inject 的嵌套 fiber 在服务出现时补触发；服务始终不出现则它自己保持 PENDING，
    // 外层插件照常 ACTIVE（18 个工具不受影响）。这就是「可选依赖」在 cordis 里的正确写法。
    ctx.inject(['commands'], (c) => {
        registerGhCommand(c.get('commands'), executor, updateChecker, defaultTelemetryCollector);
    });
    // 4. 注册 Agent 模型工具集（核心领域工具 + 元指南）
    // `tools` 在 inject 内，运行期必然存在；其权威类型声明在 @deepseek-ai/dsh-tools，
    // 本仓不重复 declare module（会与消费方的同一份声明冲突），故在此局部收窄。
    const tools = ctx.tools;
    // 先建全量数组再统一过档位与闸门：过滤点唯一，且 applyTier / wrapWithGate 都是纯函数，
    // 可以完全离线单测（见 test/phase37-toolset / phase38-gate）。
    const allTools = [
        createPrTool(executor),
        createIssueTool(executor),
        createRunTool(executor),
        createRepoTool(executor),
        createApiTool(executor),
        createReleaseTool(executor),
        createSecretTool(executor),
        createSkillTool(executor),
        createLabelTool(executor),
        createRulesetTool(executor),
        createCacheTool(executor),
        createGistTool(executor),
        createStatusTool(executor, defaultTelemetryCollector),
        createAgentTaskTool(executor),
        createDiscussionTool(executor),
        createProjectTool(executor),
        createCodespaceTool(executor),
        createHelpTool(executor),
    ];
    const tier = applyTier(allTools, { toolsets: plain.toolsets, read_only: plain.read_only });
    if (tier.dropped.length > 0) {
        // 不静默：档位/只读模式剪掉的工具要能从日志里看到，否则"模型看不见某工具"无法排查
        console.log(`[dsh-github-flow] 按档位配置未注册 ${tier.dropped.length} 个工具：${tier.dropped.join(', ')}`);
    }
    // 闸门已在各工具工厂内部经 wrapWithGate 生效，这里只做档位过滤后的注册。
    for (const tool of tier.kept)
        tools.register(tool);
    // 5. 注册面向 Client 端的 WebServer HTTP 路由
    // 同样用 ctx.inject 等待 webServer（理由同第 3 步）。
    // 关键：绝不能在外层 `ctx.get('webServer')` 之后又让 routes 内部去读 `ctx.webServer`——
    // 未 inject 时那个属性读会抛 `cannot get property "webServer" without inject`，
    // 让 CLI/TUI profile 从「PENDING」变成「加载失败」。
    // 这里把 webServer 显式作为末位参数传下去，routes 内部不再做属性读回退。
    ctx.inject(['webServer'], (c) => {
        registerApiRoutes(c, executor, plain.cacheTtlMs || 15_000, updateChecker, upgradeManager, proxyManager, c.get('webServer'));
    });
    // 6. volatile 字段热更新：loader 把新值提交进运行中的 fiber（不 reload），
    // 这里把它推给执行引擎。事件由 @deepseek-ai/cordis-plugin-loader 派发，
    // 只在「该字段确实声明了 .volatile()」时触发。
    // 只推 GhExecutor.updateConfig 真正认的字段：认了不改的字段等于假热更新。
    onHostEvent(ctx, 'loader/volatile-update', () => {
        executor.updateConfig({
            defaultTimeoutMs: config.defaultTimeoutMs.get(),
            maxOutputChars: config.maxOutputChars.get(),
            defaultListLimit: config.defaultListLimit.get(),
            // maxOutputBytes 不是 volatile（它不该被单独热改），但**必须一起推**：
            // updateConfig 收到 maxOutputChars 就会把 maxOutputBytes 重算成 ×4
            // （executor.ts:218-222）。不带上用户显式配置的硬上限，一次热更新就会把它冲掉
            // ——实测 {maxOutputChars:1000, maxOutputBytes:500} 会变成 4000。
            maxOutputBytes: config.maxOutputBytes,
        });
    });
    // 7. 启动后低优先级后台闲时静默探测：若有新版本，仅输出一次友好的控制台提示
    if (plain.checkUpdate) {
        // 包裹在 ctx.effect 中（Cordis 规范）：热重载/卸载发生在 3 秒延迟窗口内时，
        // 取消挂起的定时器，避免旧实例在新实例加载后仍向控制台打印升级横幅。
        ctx.effect(() => {
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
                }).catch(() => { });
            }, 3_000);
            return () => clearTimeout(timer);
        });
    }
}
export * from './types.js';
export * from './version.js';
export * from './updater.js';
export * from './upgrade-manager.js';
export * from './executor.js';
export * from './proxy.js';
// 让 `ctx.github` 的类型声明随包一起被消费方加载（声明合并在 './github-service.js' 内）
export * from './github-service.js';
