import type { UpdateInfo } from './types.js';
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
     * 同步获取当前已知的版本状态（0ms 纯内存读取，绝不发外网请求）
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
