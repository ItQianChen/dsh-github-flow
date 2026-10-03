import type { GhExecutionOptions, GhResult, AuthStatus, RepoMetadata, PluginConfig } from './types.js';
export declare class GhExecutor {
    ghPath: string;
    defaultTimeoutMs: number;
    maxOutputChars: number;
    constructor(config?: PluginConfig);
    updateConfig(config?: PluginConfig): void;
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
     * 采用 gh repo view + 本地 git remote 双保险机制，彻底杜绝已配置远程却误判未关联的问题
     */
    getRepoMetadata(cwd?: string): Promise<RepoMetadata | null>;
}
