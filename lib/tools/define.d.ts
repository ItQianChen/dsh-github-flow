/**
 * DSH Tool 定义规范包装器
 * 优先使用 @deepseek-ai/dsh-tools 的 defineTool DSL
 * 在独立环境无此包时提供标准的运行时安全包装
 */
export declare function defineSafeTool(spec: any): any;
