/**
 * 本地持久化缓存状态机与偏好配置存储管理
 */
export const GLOBAL_OVERVIEW_CACHE_KEY = "dsh_github_global_overview_snapshot_v1";
export const SYNC_SETTINGS_STORAGE_KEY = "dsh_github_sync_settings_v1";
/** PR 审阅弹窗文件区布局偏好（宽度 + 折叠态） */
export const PR_FILE_PANE_STORAGE_KEY = "dsh_github_pr_file_pane_v1";
/** 文件区默认宽度与边界（px）。下限保证路径可读，上限由容器宽度动态收敛 */
export const PR_FILE_PANE_DEFAULT_WIDTH = 280;
export const PR_FILE_PANE_MIN_WIDTH = 160;
/** 文件区最多占容器宽度的比例——再宽就没地方看 diff 了 */
export const PR_FILE_PANE_MAX_RATIO = 0.6;
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
/** 右侧栏 PR / Issue 状态筛选偏好（按 cwd 隔离，不同仓库各自记住选择） */
export const RIGHTBAR_STATE_FILTER_KEY = "dsh_github_rightbar_state_filter_v1";
/** 合法筛选值；任何非法输入一律回落 all，绝不让脏数据把列表筛成空白 */
export const PR_STATE_FILTERS = ["all", "open", "merged", "closed"];
export const ISSUE_STATE_FILTERS = ["all", "open", "closed"];
function sanitizeFilter(value, allowed) {
    var v = typeof value === "string" ? value.trim().toLowerCase() : "";
    return allowed.indexOf(v) >= 0 ? v : "all";
}
/**
 * 把 cwd 映射为存储作用域键。
 *
 * 为什么不能只用 `replace(/[^a-zA-Z0-9_-]/g, "_")`：那是把不同路径**压成同一个键**
 * （实测 `/a/b` 与 `/a_b` 都会变成 `_a_b`），两个仓库的筛选会互相覆盖。
 * 这里改为「可读前缀 + 全路径哈希后缀」：既保留排查时可辨认的目录名，
 * 又让任意两条路径都落在不同键上。
 *
 * 散列只用于去重，不需要密码学强度；FNV-1a 足够且零依赖。
 */
function scopeKeyForCwd(cwd) {
    var raw = typeof cwd === "string" && cwd ? cwd : "default";
    var hash = 0x811c9dc5;
    for (var i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        // FNV-1a 32 位：Math.imul 保证不丢精度
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    var readable = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(-24);
    return readable + "~" + hash.toString(36);
}
/**
 * 读取右侧栏 PR / Issue 的状态筛选偏好。
 *
 * 为什么按 cwd 分开存：同一个浏览器可能同时开着多个工作区，
 * PR 集中在 A 仓库、Issue 集中在 B 仓库时，用户对两者的关注档位不同，
 * 共用一个 key 会导致切仓库后筛选被另一个仓库的选择覆盖。
 */
export function getStoredRightbarStateFilter(cwd) {
    var fallback = { pr: "all", issue: "all" };
    try {
        var raw = localStorage.getItem(RIGHTBAR_STATE_FILTER_KEY);
        if (!raw)
            return fallback;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object")
            return fallback;
        var entry = parsed[scopeKeyForCwd(cwd)];
        if (!entry || typeof entry !== "object")
            return fallback;
        return {
            pr: sanitizeFilter(entry.pr, PR_STATE_FILTERS),
            issue: sanitizeFilter(entry.issue, ISSUE_STATE_FILTERS),
        };
    }
    catch (e) {
        return fallback;
    }
}
/** 保存右侧栏状态筛选偏好（写入失败静默——纯 UI 偏好不值得弹错） */
export function saveStoredRightbarStateFilter(cwd, next) {
    try {
        var raw = localStorage.getItem(RIGHTBAR_STATE_FILTER_KEY);
        var parsed = {};
        if (raw) {
            try {
                var p = JSON.parse(raw);
                if (p && typeof p === "object")
                    parsed = p;
            }
            catch (e) {
                // 历史脏数据：整体重置，避免一条坏记录永久污染全部仓库的筛选
                parsed = {};
            }
        }
        var scope = scopeKeyForCwd(cwd);
        var prev = parsed[scope] && typeof parsed[scope] === "object" ? parsed[scope] : {};
        parsed[scope] = {
            pr: sanitizeFilter(next.pr !== undefined ? next.pr : prev.pr, PR_STATE_FILTERS),
            issue: sanitizeFilter(next.issue !== undefined ? next.issue : prev.issue, ISSUE_STATE_FILTERS),
        };
        localStorage.setItem(RIGHTBAR_STATE_FILTER_KEY, JSON.stringify(parsed));
    }
    catch (e) { }
}
/**
 * 把期望宽度收敛到合法区间。
 *
 * 抽成纯函数的原因：边界逻辑（未超限/低于下限/超过上限）是被单测断言的规则，
 * 埋在事件回调里就只能靠人工点点看。dnd 拖拽最容易出的 bug 就是能拖成负数
 * 或把 diff 区域挤成 0 宽度——这里一次性挡住。
 *
 * @param next 拖拽得到的候选宽度
 * @param containerWidth 容器实际宽度（未知时传 0，此时只做下限保护）
 */
export function clampFilePaneWidth(next, containerWidth) {
    const min = PR_FILE_PANE_MIN_WIDTH;
    const max = containerWidth > 0
        ? Math.max(min, Math.floor(containerWidth * PR_FILE_PANE_MAX_RATIO))
        : Number.MAX_SAFE_INTEGER;
    const value = Number.isFinite(next) ? Math.round(next) : PR_FILE_PANE_DEFAULT_WIDTH;
    return Math.min(Math.max(value, min), max);
}
/** 读取文件区偏好；任何异常或脏数据都退回默认值，绝不因偏好损坏打挂弹窗 */
export function getPrFilePanePrefs() {
    const fallback = { width: PR_FILE_PANE_DEFAULT_WIDTH, hidden: false };
    try {
        var raw = localStorage.getItem(PR_FILE_PANE_STORAGE_KEY);
        if (!raw)
            return fallback;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object")
            return fallback;
        var w = Number(parsed.width);
        return {
            width: Number.isFinite(w) ? clampFilePaneWidth(w, 0) : fallback.width,
            hidden: parsed.hidden === true,
        };
    }
    catch (e) {
        return fallback;
    }
}
/** 持久化文件区偏好（写入失败静默——布局偏好不值得弹错） */
export function savePrFilePanePrefs(prefs) {
    try {
        localStorage.setItem(PR_FILE_PANE_STORAGE_KEY, JSON.stringify({
            width: clampFilePaneWidth(prefs.width, 0),
            hidden: prefs.hidden === true,
        }));
    }
    catch (e) { }
}
