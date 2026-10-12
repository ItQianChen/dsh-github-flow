import type { UpdateInfo } from './types.js';
/**
 * 检测当前 DSH 运行 profile 名（升级命令的 --profile 必填项，官方 CLI 语义：
 * `dsh plugin --profile <name> add <pkg>` 在 profile 目录内转发给 pnpm）。
 * 探测优先级（从权威到兜底，不瞎猜）：
 * 1. DSH_PROFILE 环境变量——launcher 启动时固定注入（桌面版=desktop，
 *    `dsh --profile web` 启动的 Web 版=web），是运行进程对自身 profile 的事实源；
 * 2. DSH_PROFILE_DIR 路径含 desktop 时判定 desktop；
 * 3. 兜底探测 ~/.dsh/profiles 下实际存在的 profile 目录（web > default 顺序），
 *    两者皆无才回落 'default'（dsh CLI 的默认 profile 名）。
 */
export declare function detectProfileName(): string;
/**
 * 极简语义化版本大小比较函数 (latest > current 时返回 true)
 *
 * 为什么自研而不引入 semver npm 依赖：
 * 避免为了简单的 x.y.z 比对而引入数十个传递子依赖，保持 DSH 插件轻量纯净与零运行期依赖负担。
 * 约束条件：标准处理 x.y.z 形式，自动过滤前导 'v' 或 '^' 等非数字字符，忽略 pre-release 标签后续对比。
 */
export declare function isNewerVersion(current: string, latest: string): boolean;
/**
 * 插件版本检测引擎
 *
 * 架构约束与为什么这样设计：
 * 1. 业务解耦：getQuickStatus 同步读取内存缓存，耗时 0ms，供主业务路由无感调用；
 * 2. 闲时触发：check() 异步外网探测，首选淘宝镜像加速 (npmmirror.com)，官方 npmjs 兜底；
 * 3. 避免击穿：通过 inFlightPromise 合并并发调用，防止多处同时触发重复请求；
 * 4. 彻底容灾：任何网络或解析异常 100% 内部吸收，返回 hasUpdate: false，绝不影响主流程。
 */
export declare class UpdateChecker {
    private cachedInfo;
    private inFlightPromise;
    private readonly intervalMs;
    private readonly customRegistry?;
    constructor(options?: {
        intervalMs?: number;
        customRegistry?: string;
    });
    /**
     * 应用代理到 npm 探测的 fetch 链路。
     * 由 main.ts 在 ProxyManager 初始化/变更后调用：undici dispatcher 是进程级全局，
     * 这里只做一次转发，真正的缓存/重建逻辑在 ProxyManager.applyFetchDispatcher 内。
     */
    applyProxy(manager: {
        applyFetchDispatcher(): boolean;
    } | null): void;
    /**
     * 同步获取当前已知的版本状态（0ms 纯内存读取，绝不发外网请求）。
     * 兜底命令同样按当前 profile 生成：网络探测失败时复制命令也必须开箱可用。
     */
    getQuickStatus(): UpdateInfo;
    /**
     * 异步触发版本检测
     * @param force 是否忽略 24h 缓存强制穿透探测
     */
    check(force?: boolean): Promise<UpdateInfo>;
    /**
     * 内部双 Registry 竞速/降级探测
     */
    private performCheck;
}
