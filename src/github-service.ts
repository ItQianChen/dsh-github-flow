/**
 * `ctx.github` 服务的 TypeScript 声明合并。
 *
 * 为什么需要这个文件：README 教生态插件这样复用本插件的能力——
 *   export const inject = ['github']
 *   export function apply(ctx) { await ctx.github.checkAuth() }
 * 但在此之前项目里没有任何 `declare module` 声明合并，消费方拿到的 `ctx.github`
 * 类型是 unknown，照文档写会直接编译不过，也没有任何自动补全。
 * 官方每个服务包（如 @deepseek-ai/dsh-workspace、dsh-commands）都做这件事，这里补齐。
 *
 * 消费方用法：import type {} from 'dsh-github-flow/host' —— 或直接 import 本插件导出的任一名，
 * 只要类型被加载，`ctx.github` 就有完整类型。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GhExecutor } from './executor.js';

// 这个 import 不是摆设：TypeScript 只有在「目标模块确实被本文件引用」时才承认声明合并，
// 否则报 TS2664 Invalid module name in augmentation。删掉它会直接编译失败。
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 由 dsh-github-flow 提供的 GitHub CLI 执行引擎 */
    github: GhExecutor;
  }
}

/**
 * 供消费方做类型引用的空导出。
 * 目的是让 `import type {} from 'dsh-github-flow'` 能顺带加载上面的声明合并。
 */
export type { Context };
