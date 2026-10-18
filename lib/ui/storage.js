/**
 * 本地持久化缓存状态机与偏好配置存储管理
 */
export const GLOBAL_OVERVIEW_CACHE_KEY = "dsh_github_global_overview_snapshot_v1";
export const SYNC_SETTINGS_STORAGE_KEY = "dsh_github_sync_settings_v1";
export const DEFAULT_SYNC_SETTINGS = {
    strategy: "swr", // 'swr' | 'auto' | 'manual'
    cloudSyncIntervalMs: 600000, // 云端定时周期：默认 10 分钟 (600,000ms，下限 5分钟)
    localGitWatch: true, // 本地 .git 改动实时感知 (仅右侧栏当前工作区生效，默认开启)
};
export function getLocalSyncSettings() {
    try {
        var raw = localStorage.getItem(SYNC_SETTINGS_STORAGE_KEY);
        if (!raw)
            return DEFAULT_SYNC_SETTINGS;
        var parsed = JSON.parse(raw);
        var merged = Object.assign({}, DEFAULT_SYNC_SETTINGS, parsed);
        if (merged.strategy === "interval" || parsed.cloudAutoSync === true) {
            merged.strategy = "auto";
            saveLocalSyncSettings(merged);
        }
        if (typeof merged.cloudSyncIntervalMs !== "number" || merged.cloudSyncIntervalMs < 300000) {
            merged.cloudSyncIntervalMs = 600000;
        }
        if (typeof parsed.localGitWatch !== "boolean") {
            merged.localGitWatch = true;
        }
        return merged;
    }
    catch (e) {
        return DEFAULT_SYNC_SETTINGS;
    }
}
export function saveLocalSyncSettings(settings) {
    try {
        localStorage.setItem(SYNC_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("dsh-github-sync-settings-change", { detail: settings }));
        }
    }
    catch (e) { }
}
export function getStoredGlobalOverview() {
    try {
        var raw = localStorage.getItem(GLOBAL_OVERVIEW_CACHE_KEY);
        if (!raw)
            return null;
        var parsed = JSON.parse(raw);
        if (!parsed || !parsed.data) {
            return null;
        }
        if (typeof parsed.savedAt === "number") {
            return parsed;
        }
        return null;
    }
    catch (e) {
        return null;
    }
}
export function saveStoredGlobalOverview(data) {
    if (!data || !data.auth || data.auth.networkError) {
        return;
    }
    try {
        localStorage.setItem(GLOBAL_OVERVIEW_CACHE_KEY, JSON.stringify({
            data: data,
            savedAt: Date.now(),
        }));
    }
    catch (e) { }
}
export function clearStoredGlobalOverview() {
    try {
        localStorage.removeItem(GLOBAL_OVERVIEW_CACHE_KEY);
        if (typeof localStorage !== "undefined") {
            for (var i = localStorage.length - 1; i >= 0; i--) {
                var k = localStorage.key(i);
                if (k && k.indexOf("dsh_github_rightbar_snapshot_") === 0) {
                    localStorage.removeItem(k);
                }
            }
        }
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("dsh-github-cache-cleared"));
        }
    }
    catch (e) { }
}
export function getCacheStorageMeta() {
    try {
        var raw = localStorage.getItem(GLOBAL_OVERVIEW_CACHE_KEY);
        if (!raw)
            return { exists: false, sizeKb: 0, savedAt: 0 };
        var parsed = JSON.parse(raw);
        var sizeKb = Math.round((raw.length * 2) / 1024 * 10) / 10;
        return { exists: true, sizeKb: sizeKb, savedAt: parsed?.savedAt || 0 };
    }
    catch (e) {
        return { exists: false, sizeKb: 0, savedAt: 0 };
    }
}
export function getRightbarStorageKey(cwd) {
    var safe = (cwd || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    return "dsh_github_rightbar_snapshot_" + safe;
}
export function getStoredRightbarSnapshot(cwd) {
    try {
        var key = getRightbarStorageKey(cwd);
        var raw = localStorage.getItem(key);
        if (!raw)
            return null;
        var parsed = JSON.parse(raw);
        if (!parsed || !parsed.data) {
            return null;
        }
        return { data: parsed.data, savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0 };
    }
    catch (e) {
        return null;
    }
}
export function saveStoredRightbarData(cwd, data) {
    if (!data || !data.auth || data.auth.networkError)
        return;
    try {
        var key = getRightbarStorageKey(cwd);
        localStorage.setItem(key, JSON.stringify({
            data: data,
            savedAt: Date.now(),
        }));
    }
    catch (e) { }
}
export const HEADER_CARDS_STORAGE_KEY = "dsh_github_header_cards_visible_v1";
/**
 * 读取右侧栏上方仓库卡片与快捷操作栏的折叠/展开偏好（默认为 true 展开）
 */
export function getStoredHeaderCardsVisible() {
    try {
        var raw = localStorage.getItem(HEADER_CARDS_STORAGE_KEY);
        if (raw === null || raw === undefined)
            return true;
        return raw !== "false";
    }
    catch (e) {
        return true;
    }
}
/**
 * 持久化保存右侧栏上方仓库卡片与快捷操作栏的展开/折叠偏好
 */
export function saveStoredHeaderCardsVisible(visible) {
    try {
        localStorage.setItem(HEADER_CARDS_STORAGE_KEY, visible ? "true" : "false");
    }
    catch (e) { }
}
