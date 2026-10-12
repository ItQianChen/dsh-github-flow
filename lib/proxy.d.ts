/**
 * 网络代理管理器：插件全部外联流量的唯一代理状态权威源。
 *
 * 设计依据（docs/plans/proxy-support-plan.md）：
 * - gh 子进程链路（9 工具 + Web API 数据）经标准环境变量 HTTPS_PROXY/HTTP_PROXY/NO_PROXY 驱动，
 *   实测 gh CLI 完整遵循 Go net/http 约定；
 * - Node fetch 链路（updater 的 npm registry 探测）无视环境变量，需 undici ProxyAgent
 *   dispatcher 驱动——插件自身不依赖 undici，运行时从 DSH 宿主 require 链动态解析；
 * - 不走 Cordis Config 承载：配置变更会触发插件全量 reload（工具注销重注册），
 *   而代理是高频试错型设置。持久化用独立文件，保存即生效、零重载。
 * - 未设置时零干预：不注入任何环境变量、不动 fetch dispatcher，
 *   gh 与 fetch 自然回落到系统环境变量（若宿主本身配置了 HTTPS_PROXY）或直连。
 */
export interface ProxyConfig {
    /** 代理地址，如 "http://127.0.0.1:7890"。空串 = 未启用（回落系统环境/直连） */
    url: string;
    /** NO_PROXY 排除列表（逗号分隔）。localhost,127.0.0.1 恒被强制前置，防止本机 Web API 回环请求被代理劫持 */
    noProxy: string;
    /** 是否同步应用于 npm registry 探测与一键升级链路（包管理器走环境变量，天然支持） */
    applyToPackageManager: boolean;
}
export interface ProxyProbeResult {
    ok: boolean;
    at: number;
    latencyMs?: number;
    error?: string;
}
export interface ProxyStateSnapshot {
    config: ProxyConfig;
    /** fetch 链路（undici dispatcher）是否可用。不可用时 npm 探测保持直连，GitHub 链路不受影响 */
    fetchProxyAvailable: boolean;
    lastProbe?: ProxyProbeResult;
}
/**
 * 校验用户输入的代理地址。
 * 为什么白名单 scheme：地址将注入到全部 gh/npm 子进程环境变量并可能驱动 fetch dispatcher，
 * 放行 file://、gopher:// 等怪异 scheme 属于扩大攻击面；内嵌凭据会随进程 env 暴露，禁止保存。
 */
export declare function validateProxyUrl(input: unknown): {
    ok: boolean;
    url?: string;
    error?: string;
};
export declare class ProxyManager {
    private config;
    private lastProbe;
    private fetchProxyAvailable;
    private activeDispatcherUrl;
    /** 安装代理 dispatcher 前的进程默认 dispatcher 快照（关闭代理时恢复，防残留） */
    private defaultDispatcher;
    constructor(presetUrl?: string);
    /** 读取持久化文件；不存在时回落 cordis.patch.yml 预置值；再无则保持默认直连 */
    private load;
    /**
     * 原子写持久化文件：先写临时文件再 rename，杜绝并发/崩溃产生半截 JSON。
     * 写盘失败（目录权限/沙箱）不抛出：代理是「尽力持久化」语义——内存态已生效，
     * 仅丢失重启恢复能力；用一次 console.warn 提示用户，UI 仍能正常工作。
     */
    private persist;
    /**
     * 生成注入子进程的代理环境变量。
     * 未启用时返回 {}——绝不覆盖 process.env 中既有的系统级代理设置（用户不设插件代理
     * 时 gh 自然继承宿主环境变量，即「默认走系统设置」语义）。
     * socks5 对 gh（Go runtime）原生有效；对 npm 同样有效（pacote/agent-base 支持）。
     */
    getEnv(scope?: 'gh' | 'package-manager'): Record<string, string>;
    /**
     * 应用 fetch dispatcher（npm registry 探测链路）。
     * undici 的 ProxyAgent 不支持 socks5：该场景显式标记不可用并保持直连，
     * UI 需如实提示差异（GitHub 链路正常走 socks5），不做静默降级。
     * dispatcher 按 url 缓存重建，url 未变化时零开销。
     *
     * 关闭代理时必须恢复默认全局 dispatcher：setGlobalDispatcher 是进程级副作用，
     * 若只清空本实例状态而不回滚 dispatcher，此前安装的 ProxyAgent 会永久残留，
     * 「启用→关闭」后 npm 探测仍走死代理直到进程重启。首次安装前先快照原 dispatcher。
     */
    applyFetchDispatcher(): boolean;
    /** 保存新配置并立即生效（写文件 + 重应用 dispatcher），返回完整状态快照 */
    save(input: Partial<ProxyConfig>): {
        ok: boolean;
        error?: string;
        state: ProxyStateSnapshot;
    };
    /** 经当前代理配置探测 GitHub API 连通性（2.5s 超时）。失败不回滚保存——离线预配置是合法场景 */
    probe(): Promise<ProxyProbeResult>;
    snapshot(): ProxyStateSnapshot;
}
