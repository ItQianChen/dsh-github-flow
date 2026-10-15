/**
 * 有上限的 TTL 缓存。
 *
 * 为什么独立成模块：缓存语义（过期、LRU 腾退、容量上限）是缺陷高发区，但嵌在路由文件里
 * 就无法单测——import 一个已执行过的路由模块拿不到干净实例。独立出来才能覆盖边界。
 */
export class TtlCache {
    ttlMs;
    maxEntries;
    store = new Map();
    /** 容灾备份底座：记录最后一次成功的有效快照，不受 TTL 过期或主动 refresh 清空的影响 */
    fallbackStore = new Map();
    /**
     * @param ttlMs 命中有效期；由面向用户的 cacheTtlMs 配置驱动
     * @param maxEntries 容量上限。键通常是工作区路径，一次会话就可能引入若干键，
     *   没有上限时长期运行的 Web 服务会慢性增长（旧实现只有 /refresh 会清空）
     */
    constructor(ttlMs, maxEntries = 64) {
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
    }
    get(key, now) {
        const hit = this.store.get(key);
        if (!hit)
            return undefined;
        if (now - hit.time >= this.ttlMs) {
            this.store.delete(key);
            return undefined;
        }
        // 命中后重新插入：Map 的迭代顺序即插入顺序，重插让顺序逼近 LRU，腾退时淘汰最久未用者
        this.store.delete(key);
        this.store.set(key, hit);
        return hit.data;
    }
    set(key, data, now) {
        this.store.set(key, { data, time: now });
        this.fallbackStore.set(key, data);
        while (this.store.size > this.maxEntries) {
            const oldest = this.store.keys().next();
            if (oldest.done)
                break;
            this.store.delete(oldest.value);
        }
        while (this.fallbackStore.size > this.maxEntries) {
            const oldest = this.fallbackStore.keys().next();
            if (oldest.done)
                break;
            this.fallbackStore.delete(oldest.value);
        }
    }
    /** 获取最后一次有效成功的容灾底座数据（专供网络故障、超时时的 Fail-Safe 保全） */
    getFallback(key) {
        return this.fallbackStore.get(key);
    }
    get size() {
        return this.store.size;
    }
    clear() {
        // 清空活动缓存以迫使后续请求重新发起网络拉取，但保留 fallbackStore 用于网络故障容灾
        this.store.clear();
    }
}
