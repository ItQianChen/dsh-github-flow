/**
 * 本地持久化缓存状态机与偏好配置存储管理
 */
export declare const GLOBAL_OVERVIEW_CACHE_KEY = "dsh_github_global_overview_snapshot_v1";
export declare const SYNC_SETTINGS_STORAGE_KEY = "dsh_github_sync_settings_v1";
/** PR 审阅弹窗文件区布局偏好（宽度 + 折叠态） */
export declare const PR_FILE_PANE_STORAGE_KEY = "dsh_github_pr_file_pane_v1";
/** 文件区默认宽度与边界（px）。下限保证路径可读，上限由容器宽度动态收敛 */
export declare const PR_FILE_PANE_DEFAULT_WIDTH = 280;
export declare const PR_FILE_PANE_MIN_WIDTH = 160;
/** 文件区最多占容器宽度的比例——再宽就没地方看 diff 了 */
export declare const PR_FILE_PANE_MAX_RATIO = 0.6;
export declare const DEFAULT_SYNC_SETTINGS: {
    strategy: string;
    cloudSyncIntervalMs: number;
    localGitWatch: boolean;
};
export declare function getLocalSyncSettings(): any;
export declare function saveLocalSyncSettings(settings: any): void;
export declare function getStoredGlobalOverview(): any;
export declare function saveStoredGlobalOverview(data: any): void;
export declare function clearStoredGlobalOverview(): void;
export declare function getCacheStorageMeta(): {
    exists: boolean;
    sizeKb: number;
    savedAt: any;
};
export declare function getRightbarStorageKey(cwd: string | null): string;
export declare function getStoredRightbarSnapshot(cwd: string | null): {
    data: any;
    savedAt: any;
} | null;
export declare function saveStoredRightbarData(cwd: string | null, data: any): void;
export declare const HEADER_CARDS_STORAGE_KEY = "dsh_github_header_cards_visible_v1";
/**
 * 读取右侧栏上方仓库卡片与快捷操作栏的折叠/展开偏好（默认为 true 展开）
 */
export declare function getStoredHeaderCardsVisible(): boolean;
/**
 * 持久化保存右侧栏上方仓库卡片与快捷操作栏的展开/折叠偏好
 */
export declare function saveStoredHeaderCardsVisible(visible: boolean): void;
/** 右侧栏 PR / Issue 状态筛选偏好（按 cwd 隔离，不同仓库各自记住选择） */
export declare const RIGHTBAR_STATE_FILTER_KEY = "dsh_github_rightbar_state_filter_v1";
/** 合法筛选值；任何非法输入一律回落 all，绝不让脏数据把列表筛成空白 */
export declare const PR_STATE_FILTERS: string[];
export declare const ISSUE_STATE_FILTERS: string[];
/**
 * 读取右侧栏 PR / Issue 的状态筛选偏好。
 *
 * 为什么按 cwd 分开存：同一个浏览器可能同时开着多个工作区，
 * PR 集中在 A 仓库、Issue 集中在 B 仓库时，用户对两者的关注档位不同，
 * 共用一个 key 会导致切仓库后筛选被另一个仓库的选择覆盖。
 */
export declare function getStoredRightbarStateFilter(cwd: string | null): {
    pr: string;
    issue: string;
};
/** 保存右侧栏状态筛选偏好（写入失败静默——纯 UI 偏好不值得弹错） */
export declare function saveStoredRightbarStateFilter(cwd: string | null, next: {
    pr?: string;
    issue?: string;
}): void;
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
export declare function clampFilePaneWidth(next: number, containerWidth: number): number;
export interface PrFilePanePrefs {
    width: number;
    hidden: boolean;
}
/** 读取文件区偏好；任何异常或脏数据都退回默认值，绝不因偏好损坏打挂弹窗 */
export declare function getPrFilePanePrefs(): PrFilePanePrefs;
/** 持久化文件区偏好（写入失败静默——布局偏好不值得弹错） */
export declare function savePrFilePanePrefs(prefs: PrFilePanePrefs): void;
