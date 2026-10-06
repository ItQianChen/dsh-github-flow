import type { GhExecutionOptions, GhResult, AuthStatus, RepoMetadata, PluginConfig } from './types.js';
/**
 * 按「字符数 + UTF-8 字节数」双口径截断输出。
 * 抽成纯函数是刻意的：截断逻辑是崩溃高发区（切碎多字节字符、误伤 JSON、把二进制流截成垃圾），
 * 但通过真实 gh 命令很难稳定复现超限输出，抽出来才能用单元测试覆盖边界。
 */
export declare function truncateOutput(input: string, maxChars: number, maxBytes: number): {
    text: string;
    truncated: boolean;
};
export declare class GhExecutor {
    ghPath: string;
    defaultTimeoutMs: number;
    maxOutputChars: number;
    /** UTF-8 字节口径的硬上限；未配置时按 maxOutputChars × 4 推导（覆盖 CJK 3 字节与 emoji 4 字节） */
    maxOutputBytes: number;
    constructor(config?: PluginConfig);
    updateConfig(config?: PluginConfig): void;
    /**
     * 智能解析最可靠的工作区物理路径：
     * 1. 优先使用显式指定的有效 cwd（若包含 .git 目录）
     * 2. 读取当前进程/会话的 DSH_SESSION_ID 并匹配 ~/.dsh/storages/workspace.json
     * 3. 匹配 ~/.dsh/storages/workspace.json 中最近活跃的工作区
     * 4. 回退到 process.cwd()
     */
    resolveWorkspaceCwd(explicitCwd?: string): string;
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
