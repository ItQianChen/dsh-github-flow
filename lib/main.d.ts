import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { GhExecutor } from './executor.js';
import './github-service.js';
export declare const name = "dsh-github-flow";
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
export declare const inject: readonly ['tools'];
/**
 * 本插件向宿主提供的服务名。
 * cordis loader 读取该元数据（registry.d.ts），与 `ctx.provide('github', …)` 必须同名。
 */
export declare const provide = "github";
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
declare const ConfigSchema: Schema<Schemastery.ObjectS<NoInfer<{
    ghPath: Schema<string, string, "defined">;
    defaultTimeoutMs: Schema<number, number, "volatile-defined">;
    maxOutputChars: Schema<number, number, "volatile-defined">;
    maxOutputBytes: Schema<number, number, "plain">;
    cacheTtlMs: Schema<number, number, "defined">;
    defaultListLimit: Schema<number, number, "volatile-defined">;
    checkUpdate: Schema<boolean, boolean, "defined">;
    updateCheckIntervalMs: Schema<number, number, "defined">;
    registryUrl: Schema<string, string, "plain">;
    agentEnvInjection: Schema<boolean, boolean, "defined">;
    proxyUrl: Schema<string, string, "plain">;
}>>, Schemastery.ObjectT<NoInfer<{
    ghPath: Schema<string, string, "defined">;
    defaultTimeoutMs: Schema<number, number, "volatile-defined">;
    maxOutputChars: Schema<number, number, "volatile-defined">;
    maxOutputBytes: Schema<number, number, "plain">;
    cacheTtlMs: Schema<number, number, "defined">;
    defaultListLimit: Schema<number, number, "volatile-defined">;
    checkUpdate: Schema<boolean, boolean, "defined">;
    updateCheckIntervalMs: Schema<number, number, "defined">;
    registryUrl: Schema<string, string, "plain">;
    agentEnvInjection: Schema<boolean, boolean, "defined">;
    proxyUrl: Schema<string, string, "plain">;
}>>, "plain">;
/** 校验并补齐默认值后的运行期配置（volatile 字段为稳定引用，非普通值）。 */
export type Config = ReturnType<typeof ConfigSchema>;
/** Cordis loader 消费的配置 Schema。 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    ghPath: Schema<string, string, "defined">;
    defaultTimeoutMs: Schema<number, number, "volatile-defined">;
    maxOutputChars: Schema<number, number, "volatile-defined">;
    maxOutputBytes: Schema<number, number, "plain">;
    cacheTtlMs: Schema<number, number, "defined">;
    defaultListLimit: Schema<number, number, "volatile-defined">;
    checkUpdate: Schema<boolean, boolean, "defined">;
    updateCheckIntervalMs: Schema<number, number, "defined">;
    registryUrl: Schema<string, string, "plain">;
    agentEnvInjection: Schema<boolean, boolean, "defined">;
    proxyUrl: Schema<string, string, "plain">;
}>>, Schemastery.ObjectT<NoInfer<{
    ghPath: Schema<string, string, "defined">;
    defaultTimeoutMs: Schema<number, number, "volatile-defined">;
    maxOutputChars: Schema<number, number, "volatile-defined">;
    maxOutputBytes: Schema<number, number, "plain">;
    cacheTtlMs: Schema<number, number, "defined">;
    defaultListLimit: Schema<number, number, "volatile-defined">;
    checkUpdate: Schema<boolean, boolean, "defined">;
    updateCheckIntervalMs: Schema<number, number, "defined">;
    registryUrl: Schema<string, string, "plain">;
    agentEnvInjection: Schema<boolean, boolean, "defined">;
    proxyUrl: Schema<string, string, "plain">;
}>>, "plain">;
export declare function apply(ctx: Context, config?: Config): void;
export type GitHubService = GhExecutor;
export * from './types.js';
export * from './version.js';
export * from './updater.js';
export * from './upgrade-manager.js';
export * from './executor.js';
export * from './proxy.js';
export * from './github-service.js';
