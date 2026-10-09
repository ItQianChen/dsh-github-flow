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
    /** 认证状态缓存。`gh auth status` 实测 5.4 秒，而它位于全局驾驶舱关键路径的最前面 */
    private authCache;
    constructor(config?: PluginConfig);
    updateConfig(config?: PluginConfig): void;
    /**
     * 智能解析最可靠的工作区物理路径：
     * 1. 优先使用显式指定的有效 cwd（若包含 .git 目录）
     * 2. 使用显式传入的 sessionId 或环境变量 DSH_SESSION_ID 精确反查工作区
     * 3. 递归探测：若传入了 explicitCwd（如聚合父目录），自动检查其直系子目录中是否包含 Git 仓库
     * 4. 匹配 ~/.dsh/storages/workspace.json 中最近活跃且存在 .git 的仓库工作区
     * 5. 回退到 process.cwd()
     */
    resolveWorkspaceCwd(explicitCwd?: string, explicitSessionId?: string): string;
    /**
     * 安全执行 gh 命令
     * 采用 execFile 参数数组隔离，彻底杜绝 Shell 字符串拼接注入漏洞
     */
    run<T = unknown>(args: string[], options?: GhExecutionOptions): Promise<GhResult<T>>;
    /**
     * 检查宿主机当前 GitHub CLI 的认证状态与账号信息
     *
     * @param cwd 解析工作区用的路径
     * @param bypassCache 跳过进程内缓存。`/gh status` 这类人类显式发起的诊断必须看到实时结果，
     *   而 Web 面板每次挂载都会来问一次，重复执行实测要 5.4 秒，属于纯浪费。
     */
    checkAuth(cwd?: string, bypassCache?: boolean): Promise<AuthStatus>;
    /** 生成当前操作系统平台的推荐安装引导与命令 */
    private getPlatformInstallGuide;
    /** 实际执行 `gh auth status` 并解析结果，不含缓存逻辑 */
    private probeAuth;
    /**
     * 仅从本地 .git/config 解析仓库身份，绝不发起网络请求。
     *
     * 为什么需要它：全局驾驶舱要为每个工作区认识别仓库，而 getRepoMetadata 会调用
     * `gh repo view` 走网络。实测 5 个工作区时该端点冷启动 20.5 秒，其中绝大部分耗在这 5 次
     * 网络往返上——而有界并发根本救不了它，因为瓶颈是网络延迟而不是进程排队。
     * 工作区矩阵只需要「这个目录属于哪个仓库」这一身份信息，本地 .git/config 已经完整具备，
     * 描述/star 数等富字段是当前仓库详情才需要的。这一步把每个工作区从 1 次网络往返降为 0。
     */
    getRepoIdentityFromLocal(cwd?: string): RepoMetadata | null;
    /**
     * 获取当前目录（工作区）关联的远程仓库元数据
     * 采用 gh repo view + 本地 git remote 双保险机制，彻底杜绝已配置远程却误判未关联的问题
     */
    getRepoMetadata(cwd?: string, sessionId?: string): Promise<RepoMetadata | null>;
}
