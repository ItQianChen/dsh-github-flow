import type { GhExecutor } from './executor.js';
import type { GhExecutionOptions, GhResult, AuthStatus, RepoMetadata } from './types.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        github: GitHubService;
    }
}
/**
 * DSH GitHub 原生微内核服务
 * 允许生态内其他插件通过 ctx.github 或 inject: ['github'] 消费 GitHub CLI 能力
 */
export declare class GitHubService {
    private ctx;
    executor: GhExecutor;
    constructor(ctx: any, executor: GhExecutor);
    /**
     * 执行原生 gh 命令
     */
    run<T = unknown>(args: string[], options?: GhExecutionOptions): Promise<GhResult<T>>;
    /**
     * 检查宿主机 GitHub CLI 认证状态
     */
    checkAuth(cwd?: string): Promise<AuthStatus>;
    /**
     * 获取指定工作区路径下的 Git 关联元数据
     */
    getRepoMetadata(cwd?: string): Promise<RepoMetadata | null>;
}
