import type { GhExecutionOptions, GhResult, AuthStatus, RepoMetadata, PluginConfig } from './types.js';
import type { ProxyManager } from './proxy.js';
/**
 * 从 `gh --version` 输出中解析语义化版本号。
 * 抽成导出纯函数的原因与 truncateOutput 相同：解析逻辑是「看似简单实则易错」的边界区，
 * 必须能用单元测试钉死（不匹配输入返回 null 而非抛错，调用方据此走 fail-open）。
 */
export declare function parseGhVersion(output: string): string | null;
/**
 * 数值分段比较两个 gh 版本：a>b 返回 1、a<b 返回 -1、相等返回 0。
 * 为什么不能用字符串比较：`'2.96.0' < '2.100.0'` 在字典序下为 false（'1'<'9'），
 * 这会把 2.100 误判为低于 2.96，导致可用命令被错误降级。逐段 Number 比较是唯一正确姿势。
 */
export declare function compareGhVersions(a: string, b: string): number;
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
    /**
     * 列表类查询的默认条数上限。
     * 为什么挂在 executor 而不是给每个工具工厂加 config 参数：executor 是全部
     * 工具共享的依赖注入点，配置语义本就属于「执行层默认值」；工厂签名零改动，
     * 且热更新路径 updateConfig 能同步刷新。工具内以 `?? 20` 兜底保证旧配置兼容。
     */
    defaultListLimit: number;
    /**
     * 是否注入 AI_AGENT='dsh'（gh 官方 agent 识别信号，默认 true）。
     * 挂在 executor 而非工具参数：注入点是「每次 gh 子进程拉起」这一全局咽喉，
     * 与 GH_NO_UPDATE_NOTIFIER/NO_COLOR 同级，语义上属于执行层默认值。
     */
    agentEnvInjection: boolean;
    /**
     * 代理管理器引用（可选依赖）。
     * 注入后每次 gh 子进程拉起都会合并代理环境变量——这是「工具调用 + Web 页面数据
     * 全部走代理」的唯一咽喉（两条链路共用本 executor）。未注入时零干预，
     * gh 自然继承宿主系统环境变量（系统级代理或直连），即「默认走系统设置」语义。
     */
    private proxyManager?;
    /** 认证状态缓存。`gh auth status` 实测 5.4 秒，而它位于全局驾驶舱关键路径的最前面 */
    private authCache;
    /**
     * gh 版本号缓存。只缓存成功解析值（authCache 哲学：不确定结果不缓存）——
     * 探测失败/未安装时不落缓存，用户装好 gh 后下一次探测立即生效。
     */
    private ghVersionCache;
    constructor(config?: PluginConfig);
    updateConfig(config?: PluginConfig): void;
    /** 注入代理管理器（main.ts 装配时调用一次；测试可注入 mock） */
    attachProxyManager(manager: ProxyManager): void;
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
    /**
     * 获取当前 gh 版本号（带 30s TTL 缓存），失败返回 null。
     * 底层直连 execFileAsync 而不走 this.run()：run() 会先解析工作区（可能读
     * workspace.json 与目录扫描）再做截断/JSON 解析，对一次 10ms 的版本字符串
     * 查询是纯开销；直连也彻底规避 runGuarded → 探测 → run 的递归风险。
     */
    getGhVersion(): Promise<string | null>;
    /**
     * 底层版本探测（独立方法而非内联：测试需要在不触发真实子进程的前提下
     * 验证 getGhVersion 的缓存分支——覆写此方法即注入确定输出）。
     * 直连 execFileAsync 而不走 this.run()：run() 会先解析工作区（可能读
     * workspace.json 与目录扫描）再做截断/JSON 解析，对一次 10ms 的版本字符串
     * 查询是纯开销；直连也彻底规避 runGuarded → 探测 → run 的递归风险。
     */
    protected probeGhVersionRaw(): Promise<string>;
    /**
     * 守卫执行器：按 gh 版本门槛路由「主命令 → 降级链路 → 升级指引」三态。
     *
     * 为什么是「检查+执行」一体的方法而非纯探测接口：检查与执行分离会在两者之间
     * 留下竞隙（版本可能在间隙变化），且降级标注逻辑会被迫散落到每个工具的 if/else。
     *
     * fail-open 纪律：版本探测自身失败（null）时直接执行主命令——守卫是路由优化
     * 不是安全边界，探测故障不应拦截业务；gh 未安装场景由主命令产出既有 ENOENT
     * 安装引导，这里不重复造错误路径。
     */
    runGuarded<T = unknown>(args: string[], options?: GhExecutionOptions & {
        /** 该能力要求的最低 gh 版本，如 '2.95.0'；缺省时等价于直接 run（渐进采用） */
        minVersion?: string;
        /** 人类可读能力名，用于错误信息，如 'gh repo read-file' */
        capability?: string;
        /** 版本不足时的降级链路（如 github_api contents 端点封装）；无则报错带升级指引 */
        fallback?: () => Promise<GhResult<T>>;
    }): Promise<GhResult<T> & {
        degraded?: boolean;
        degradedReason?: string;
    }>;
    /** gh 升级命令按平台提示（复用三态状态机的平台判断口径） */
    private getGhUpgradeHint;
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
