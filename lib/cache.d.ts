/**
 * 有上限的 TTL 缓存。
 *
 * 为什么独立成模块：缓存语义（过期、LRU 腾退、容量上限）是缺陷高发区，但嵌在路由文件里
 * 就无法单测——import 一个已执行过的路由模块拿不到干净实例。独立出来才能覆盖边界。
 */
export declare class TtlCache<T> {
    private ttlMs;
    private maxEntries;
    private store;
    /**
     * @param ttlMs 命中有效期；由面向用户的 cacheTtlMs 配置驱动
     * @param maxEntries 容量上限。键通常是工作区路径，一次会话就可能引入若干键，
     *   没有上限时长期运行的 Web 服务会慢性增长（旧实现只有 /refresh 会清空）
     */
    constructor(ttlMs: number, maxEntries?: number);
    get(key: string, now: number): T | undefined;
    set(key: string, data: T, now: number): void;
    get size(): number;
    clear(): void;
}
