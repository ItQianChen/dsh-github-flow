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
    /**
     * 代理总开关（独立于 url）。
     *
     * 为什么必须是独立字段：2026-11-23 的层级开关上线后发现，用「url 是否非空」
     * 反推总开关状态会出错——跟随系统代理时 url 本来就是空的，于是重新打开设置页
     * 时总开关被读成 false，用户明明保存过的配置整个子区域都不渲染。
     * 总开关与代理来源（手动 url / 系统代理）是两件事，必须分别持久化。
     */
    enabled: boolean;
    /** 手动模式的代理地址，如 "http://127.0.0.1:7890"。跟随系统时可为空 */
    url: string;
    /** NO_PROXY 排除列表（逗号分隔）。localhost,127.0.0.1 恒被强制前置，防止本机 Web API 回环请求被代理劫持 */
    noProxy: string;
    /** 是否同步应用于 npm registry 探测与一键升级链路（包管理器走环境变量，天然支持） */
    applyToPackageManager: boolean;
    /**
     * 自动跟随 Windows 系统代理（注册表 Internet Settings）。
     * 优先级：手动配置的 url 永远优先——本开关只在 url 为空时生效；
     * 系统代理关闭时自动回落直连，不做任何残留。
     */
    autoFollowSystem: boolean;
}
/**
 * 一次系统代理检测的结果。
 *
 * enabled=false 既可能是「用户关了系统代理」，也可能是「开着但用 PAC / 地址解析不出来」——
 * 两者对用户的含义完全不同，所以用 reason 区分，UI 才能如实提示而不是笼统说「未检测到」。
 */
export interface SystemProxyInfo {
    /** 当前平台是否支持自动检测（目前仅 Windows）。false 时其余字段恒为关闭态 */
    supported: boolean;
    /** 系统代理是否被判定为可用且已启用 */
    enabled: boolean;
    /** 规范化后的代理地址（enabled 时非空），如 "http://127.0.0.1:7890" */
    url: string;
    /** 检测完成时间戳 */
    at: number;
    /**
     * 未跟随时的人话原因：
     * - unsupported-platform：非 Windows
     * - disabled：ProxyEnable=0，用户确实关了
     * - pac：启用了 PAC 自动配置脚本（AutoConfigURL 非空），插件不支持
     * - unparsable：ProxyEnable=1 但 ProxyServer 解析不出可用地址
     */
    reason?: 'unsupported-platform' | 'disabled' | 'pac' | 'unparsable';
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
    /** 最近一次系统代理检测（null = 未检测到 / 平台不支持）。UI 据此展示跟随状态 */
    systemProxy?: SystemProxyInfo | null;
    /** 实际生效的代理地址（手动配置优先，其次自动跟随的系统代理，空串 = 直连） */
    effectiveUrl: string;
}
/**
 * 解析 Windows 注册表 ProxyServer 值为规范化代理地址（纯函数，供单测直接覆盖）。
 *
 * 注册表里这个值的写法五花八门，实测至少四种形态：
 * - "127.0.0.1:7890"                  —— 单一地址，适用于所有协议（clash 系工具最常见）
 * - "http=127.0.0.1:7890;https=..."   —— 按协议分写，取 https 优先、http 兜底（ftp 无用丢弃）
 * - "=127.0.0.1:7890"                 —— 某些工具的等号开头写法，语义同单一地址
 * - "socks=127.0.0.1:7891"            —— 仅 socks；gh 原生支持 socks5，直接采用
 *
 * 返回已带 scheme 的完整地址；无法解析出 host:port 时返回空串（调用方按「未检测到」处理）。
 */
export declare function parseProxyServer(raw: unknown): string;
/**
 * 解析 reg query 单值查询的 stdout（纯函数，供单测覆盖）。
 * 典型输出两行：首行是键路径，第二行形如 "    ProxyEnable    REG_DWORD    0x1"。
 * 查询不存在的值时 reg 以非零码退出，stdout 为空——这里只管解析文本，错误由调用方处理。
 */
export declare function parseRegQueryValue(stdout: unknown): string;
/**
 * 检测 Windows 系统代理（读注册表 Internet Settings）。
 * reg 不存在、注册表查询失败一律返回 null——「检测不到」不是错误，
 * 绝不向上抛异常打断主流程；非 Windows 返回 supported=false 的信息对象。
 * reader 参数供测试注入 mock；生产路径走 reg query 子进程（3s 超时防挂起）。
 */
export declare function detectSystemProxy(reader?: (key: string, value: string) => Promise<string>): Promise<SystemProxyInfo | null>;
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
/**
 * 是否为 RFC 2606 / RFC 6761 保留域名（保证不可解析）。
 * 纯函数，供 validateProxyUrl 调用与单测直接覆盖。
 */
export declare function isReservedHostname(hostname: unknown): boolean;
export declare class ProxyManager {
    private config;
    private lastProbe;
    private fetchProxyAvailable;
    private activeDispatcherUrl;
    /** 局部 ProxyAgent 实例（**不**装到全局 dispatcher，只供本插件自己的 fetch 显式使用） */
    private activeDispatcher;
    /**
     * 持久化文件路径覆盖（测试注入用）。
     * 为什么必须有这个入口：单元测试需要 save/persist 的真实语义，但绝不能写
     * 用户真实的 ~/.dsh/data/dsh-github-flow/proxy.json——2026-11-23 的事故就是
     * 测试把占位代理写进真实配置，导致宿主进程全局 dispatcher 指向死地址。
     */
    private storePathOverride;
    /** 最近一次系统代理检测结果（缓存 + 定时刷新；getEnv 是同步热路径，绝不能在这里起子进程） */
    private systemProxy;
    private systemProxyTimer;
    /**
     * 系统代理读取器（测试注入用）。
     * 必须保持「未注入时就是 undefined」，**不能**兜底成 defaultRegReader：
     * detectSystemProxy 用 `!reader` 判定是否走真实注册表路径，若这里预先塞了
     * 默认读取器，Linux/macOS 上就会绕过平台门禁去 spawn `reg.exe`。
     */
    private systemProxyReader?;
    constructor(presetUrl?: string, systemProxyReader?: (key: string, value: string) => Promise<string>, storePath?: string);
    /** 读取持久化文件；不存在时回落 cordis.patch.yml 预置值；再无则保持默认直连 */
    private load;
    /**
     * 系统代理轮询：启动即检测一次，此后每 30s 刷新。
     * 为什么轮询而不是注册表监听：RegNotifyChangeKeyValue 需要常驻句柄与原生绑定，
     * 收益（毫秒级跟随）撑不起复杂度；30s 对「开关代理」这个动作的感知延迟完全够用。
     * unref 让定时器不阻止进程退出——DSH 宿主关闭时插件不该成为悬挂理由。
     */
    private startSystemProxyWatch;
    /**
     * 依据当前配置启停系统代理轮询。
     * 只在 autoFollowSystem=true 时运行定时器——否则纯手动模式白白每 30 秒 spawn 两次 reg.exe。
     */
    private syncSystemProxyWatch;
    /** 停止轮询并释放句柄。插件卸载/热重载时必须调用，否则旧定时器会持续 spawn reg.exe */
    stopSystemProxyWatch(): void;
    /**
     * 插件卸载钩子：释放轮询与代理连接池。
     * Cordis 热重载后若不调用，旧实例的 setInterval 会继续跑，
     * N 次重载就叠 N 个定时器，每个每 30s spawn 两次 reg.exe。
     */
    dispose(): void;
    /** 关闭当前 ProxyAgent（undici 的 agent 持有连接池，丢弃前必须 close，否则连接泄漏） */
    private closeActiveDispatcher;
    /**
     * 刷新系统代理缓存。检测失败静默保持旧值（下次轮询再试）；
     * 自动跟随模式下 effectiveUrl 可能因此变化，dispatcher 需要跟着重应用。
     */
    refreshSystemProxy(): Promise<SystemProxyInfo | null>;
    /**
     * 实际生效的代理地址（唯一裁决点，两种模式互斥）：
     * - 自动跟随开：只看系统代理——系统开就用系统地址，系统关就直连，手动填写的 url 被完全无视；
     *   这样不会出现「我填了地址怎么不生效」的双源歧义，开关即模式。
     * - 自动跟随关：纯手动模式，有 url 用 url，没有就零干预（gh 继承宿主环境变量 / 直连）。
     */
    getEffectiveUrl(): string;
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
     * 构建本插件自己的 ProxyAgent（**不**写入进程全局 dispatcher）。
     *
     * 2026-11-23 事故复盘后的架构修正：
     * 旧实现在这里把 ProxyAgent 装成了进程的全局 dispatcher。那个 API 的
     * 作用域是整个 DSH 宿主进程——插件本来只需要让自己的 npm 版本探测走代理，
     * 结果连模型推理、账号资料、CodeArts token 续期全部被改道。一旦代理地址写错
     * （例如测试占位符 http://manual2.example:8888 落进配置），整个应用会哑掉，
     * 表现为「UI 能开、所有网络全挂」的割裂故障，且排查时最容易被误判成网络问题。
     *
     * 现在只创建并在实例内缓存 ProxyAgent，由 updater 在自己的 fetch 上显式传
     * dispatcher。全局 dispatcher 一行都不碰：插件配置再错，坏掉的也只是插件的
     * 版本探测，宿主进程与其他插件完全不受影响。
     *
     * socks5 仍显式不可用（undici 的 ProxyAgent 只认 http/https）：该场景 npm 探测
     * 保持直连，GitHub 链路照常走 socks5，UI 如实提示差异，不做静默降级。
     */
    applyFetchDispatcher(): boolean;
    /**
     * 当前生效的代理 dispatcher（null = 直连）。
     * 供本插件自己的 fetch 显式使用——这是唯一正确的代理作用域。
     */
    getDispatcher(): unknown | null;
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
