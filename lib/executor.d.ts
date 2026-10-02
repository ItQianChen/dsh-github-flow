import type { GhExecutionOptions, GhResult, AuthStatus } from './types.js';
export declare class GhExecutor {
    private defaultTimeoutMs;
    constructor(defaultTimeoutMs?: number);
    /**
     * 安全执行 gh 命令
     * 采用 execFile 参数数组隔离，彻底杜绝 Shell 字符串拼接注入漏洞
     */
    run<T = unknown>(args: string[], options?: GhExecutionOptions): Promise<GhResult<T>>;
    /**
     * 检查宿主机当前 GitHub CLI 的认证状态与账号信息
     */
    checkAuth(cwd?: string): Promise<AuthStatus>;
    /**
     * 获取当前目录（工作区）关联的远程仓库元数据
     */
    getRepoMetadata(cwd?: string): Promise<{
        nameWithOwner: any;
        name: any;
        owner: any;
        defaultBranch: any;
        description: any;
        isPrivate: boolean;
        url: any;
    } | null>;
}
