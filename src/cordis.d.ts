/**
 * Cordis 核心微内核类型环境声明
 * 供开发阶段类型推导与模块声明合并（Module Augmentation）使用
 */
declare module '@deepseek-ai/cordis' {
  export interface Context {
    tools?: any;
    commands?: any;
    webServer?: any;
    workspaceRegistry?: any;
    effect?(fn: () => (() => void) | void, name?: string): () => void;
    inject?(deps: readonly string[] | string[], callback: (ctx: Context) => void): void;
    get?(name: string): any;
    emit?(name: string, ...args: any[]): void;
    on?(name: string, listener: (...args: any[]) => void): () => void;
    plugin?(target: any, ...args: any[]): any;
    [key: string]: any;
  }

  export interface Events {
    [key: string]: any;
  }

  export class Service {
    constructor(ctx: Context, name: string);
  }
}
