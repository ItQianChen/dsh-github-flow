/**
 * 本地持久化缓存状态机与偏好配置存储管理
 */
export declare const GLOBAL_OVERVIEW_CACHE_KEY = "dsh_github_global_overview_snapshot_v1";
export declare const SYNC_SETTINGS_STORAGE_KEY = "dsh_github_sync_settings_v1";
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
