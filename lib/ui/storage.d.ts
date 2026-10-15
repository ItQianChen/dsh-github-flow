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
