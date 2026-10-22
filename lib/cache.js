/**
 * 有上限的 TTL 缓存。
 *
 * 为什么独立成模块：缓存语义（过期、LRU 腾退、容量上限、身份失效）是缺陷高发区，
 * 但嵌在路由文件里就无法单测——import 一个已执行过的路由模块拿不到干净实例。
 * 独立出来才能覆盖边界。
 */
export class TtlCache {
    ttlMs;
    maxEntries;
    store = new Map();
    /** 容灾备份底座：记录最后一次成功的有效快照，不受 TTL 过期或主动 refresh 清空的影响 */
    fallbackStore = new Map();
    /**
     * 每个 key 对应的 remote 配置指纹。
     *
     * 为什么独立于 store 而不是塞进 value：store 的 value 是业务数据 T，
     * 混入簿记字段会污染 T 的类型、序列化与消费方断言。指纹是缓存层自己的
     * 记账信息，不参与业务读取。
     *
     * 缺失（Map 中无该 key）= 调用方未提供指纹，此时永不作废（保守）。
     */
    fingerprintStore = new Map();
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
    /**
     * @param fingerprint 该 key 对应的 remote 配置指纹（可选）。
     *
     * 只在传入**非空字符串**时更新指纹；传入 undefined / null 一律保留旧值。
     *
     * 为什么 null 不能清除旧指纹：null 的真实含义是「这一次没读到」（config 被
     * 占用、瞬时 IO 失败、路径暂不可达），不是「这个仓库没有 remote」。若把 null
     * 当作清除，一次瞬时读取失败就会永久抹掉失效检测能力——之后 remote 真的变了
     * 也永远发现不了，缓存里冻结的身份再也出不来。保留旧值时的行为是
     * matchesFingerprint 返回 true（保守不作废），等下一次读到时再正确判定，
     * 严格优于「永久失明」。
     */
    set(key, data, now, fingerprint) {
        this.store.set(key, { data, time: now });
        this.fallbackStore.set(key, data);
        if (typeof fingerprint === 'string' && fingerprint) {
            this.fingerprintStore.set(key, fingerprint);
        }
        while (this.store.size > this.maxEntries) {
            const oldest = this.store.keys().next();
            if (oldest.done)
                break;
            this.evict(oldest.value);
        }
        while (this.fallbackStore.size > this.maxEntries) {
            const oldest = this.fallbackStore.keys().next();
            if (oldest.done)
                break;
            this.evict(oldest.value);
        }
    }
    /** 三张表必须同步腾退，否则指纹会随 key 数量慢性增长 */
    evict(key) {
        this.store.delete(key);
        this.fallbackStore.delete(key);
        this.fingerprintStore.delete(key);
    }
    /** 获取最后一次有效成功的容灾底座数据（专供网络故障、超时时的 Fail-Safe 保全） */
    getFallback(key) {
        return this.fallbackStore.get(key);
    }
    get size() {
        return this.store.size;
    }
    /**
     * 清空缓存。
     *
     * @param options.keepFallback 是否保留 fallbackStore 容灾底座，默认 true。
     *   默认保留是为了「网络抖动时宁可给旧数据也别白屏」；但用户显式点击
     *   「重试刷新」时要的语义恰恰相反——宁可空白也要重来，此时必须传 false，
     *   否则刷新动作会被容灾底座架空（这是真实踩到过的死循环：配置文件已变、
     *   旧快照永久冻结，刷新按钮点了等于没点）。
     */
    clear(options = {}) {
        this.store.clear();
        if (options.keepFallback === false) {
            this.fallbackStore.clear();
            this.fingerprintStore.clear();
        }
    }
    /**
     * remote 配置指纹是否仍与当前事实一致。
     *
     * 为什么用指纹取代「身份字符串比对」：身份比对把解析器的正确性变成了缓存
     * 有效性的前置条件——解析一偏（如双 remote 时取错 remote 段），比对永远
     * 失配，缓存永久不命中，每次请求都重拉全部 gh 子进程。
     * 指纹只回答「配置变了没有」，不依赖任何语义理解，因此对该类偏差免疫。
     *
     * 判定口径刻意保守：任一侧取不到指纹（离线、非 Git、无 remote）即视为一致。
     */
    matchesFingerprint(key, currentFingerprint) {
        const stored = this.fingerprintStore.get(key);
        if (!stored || !currentFingerprint)
            return true;
        return stored === currentFingerprint;
    }
    /**
     * 仅在指纹失配时作废该 key（含容灾底座）。返回是否真的作废。
     * 与 matchesFingerprint 分开：判定与处置是两件事，调用点语义更清晰。
     */
    invalidateIfFingerprintChanged(key, currentFingerprint) {
        if (this.matchesFingerprint(key, currentFingerprint))
            return false;
        this.evict(key);
        return true;
    }
}
