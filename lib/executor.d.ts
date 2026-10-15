import type { GhExecutionOptions, GhResult, AuthStatus, RepoMetadata, PluginConfig, GitLocalStatus, GitCommitLog, GitCommitEntry } from './types.js';
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
 * 解析 `git status -sb --porcelain` 输出为结构化状态。
 * 抽导出纯函数（parseGhVersion 同理）：三形态解析是易错边界区，单测钉死。
 *
 * 输出形态（实测）：
 *   `## master...origin/master [ahead 2, behind 1]`  有 ahead/behind
 *   `## master...origin/master`                       与远程同步
 *   `## master` / `## HEAD (no branch)`               无 upstream（ahead/behind 未知=-1）
 * 后续每行 `<XY> <path>` 为 porcelain 变更项（XY 两字符状态码，?? = untracked）。
 */
export declare function parseGitStatusOutput(output: string): GitLocalStatus | null;
/**
 * 解析 `git log` 输出为提交条目数组。
 * 支持两种形态：
 * 1. 结构化带详情：%x1e 为 commit 间分隔符，%x1f 为字段间分隔符（含 fullSha/email/date/body/stat）；
 * 2. 简易管道符：%h|%an|%ar|%s 行格式（兼容旧单测输入）。
 * 空输出返回 []。
 */
export declare function parseGitLogLines(output: string): GitCommitEntry[];
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
     * 解析命令实际执行的工作区根目录
     * 严格遵循数据事实源与工作区物理所有权，消除越权篡改：
     * 1. 显式路径第一优先级：调用方只要显式指定了路径，该物理路径即为唯一事实源，原样返回自身；
     *    绝不递归扫描子目录、绝不越权篡改；无 Git 目录则让下游探测真实反映无 Git 状态；
     * 2. 仅在未显式指定 cwd 时，才尝试使用 sessionId 或环境变量 DSH_SESSION_ID 反查工作区；
     * 3. 仅在完全未指定 cwd 且无会话时（全局命令行调用），才兜底回退到最近活跃的 Git 工作区或 process.cwd()。
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
    /**
     * 本地 Git 状态只读探测（白名单通道）。
     *
     * 这是本插件首次执行 git（此前仅 gh）——git 存在大量写命令，风险等级高于 gh，
     * 因此白名单不落在「命令名过滤」而落在「命令形态常量」：spawn 参数是下方
     * 硬编码的数组字面量，无任何动态拼接路径，写操作物理不可达（cwd 之外零输入，
     * 而 cwd 本身也是插件解析的工作区路径）。
     *
     * 零网络：status 基于 remote-tracking ref（上次 fetch 的快照），毫秒级本地读取，
     * 符合 global-overview 端点「工作区探测不发网络」的性能红线。
     */
    getLocalGitStatus(cwd?: string): Promise<GitLocalStatus | null>;
    /**
     * 本地 Git 提交记录（三段一次返回：本地领先 / 远程领先 / 最近提交）。
     *
     * 白名单纪律与 getLocalGitStatus 同源：下方两个命令形态常量硬编码
     * （log + 修订范围语法，range 段由 hasUpstream 守卫后才拼接且仅两个
     * 固定形态 @{u}..HEAD / HEAD..@{u}——不含任何用户输入路径）。
     * 领先/落后列表基于 remote-tracking ref（上次 fetch 快照），与 status
     * 的 ahead/behind 计数同一数据口径；格式 %h|%an|%ar|%s 实测可结构化解析。
     */
    getGitCommitLog(cwd?: string, hasUpstream?: boolean, limit?: number): Promise<GitCommitLog | null>;
    /**
     * 分页获取最近提交记录（用于 Git 面板下滑触底继续加载）。
     */
    getGitRecentLog(cwd?: string, limit?: number, skip?: number): Promise<{
        commits: GitCommitEntry[];
        totalCount?: number;
    }>;
    /**
     * 单条提交详情（点击提交行弹窗的数据源）。
     * 白名单纪律延续：show 命令形态常量硬编码；sha 参数经 ^[0-9a-f]{4,40}$
     * 十六进制校验后才拼接——这是 git 白名单通道首次接受「外部传入的单值」，
     * 正则把值域锁死在纯十六进制（注入面为零：任何 shell 元字符/子命令
     * 语法都不可能通过校验）。输出为 git show --stat 原文（含文件变更统计）。
     */
    getGitCommitDetail(cwd: string | undefined, sha: string): Promise<string | null>;
    /** 生成当前操作系统平台的推荐安装引导与命令 */
    private getPlatformInstallGuide;
    /**
     * 纯本地检测宿主机 GitHub CLI 配置文件中是否存在已配置的账号凭据。
     * 零子进程、零网络往返，毫秒级读取，专供断网与网络卡顿时的 Fail-Safe 容灾降级。
     */
    checkLocalGhCredential(): {
        user?: string;
        hasToken: boolean;
    } | null;
    /**
     * 实际执行认证探测并解析结果，不含外部缓存逻辑。
     * 解耦本地安装态、本地凭据态与网络可达态：
     * 1. 安装态通过 getGhVersion 本地轻量确认，网络超时/断网绝不篡改 installed 结论；
     * 2. 本地凭据通过 checkLocalGhCredential 读取，断网时仍可识别人类账号；
     * 3. 精准分流网络超时/异常（networkError）与真正的未认证（explicitLoggedOut）。
     */
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
