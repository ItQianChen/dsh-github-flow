declare global {
    interface Window {
        __ModuleLoader__: {
            load(options: {
                id: string;
                factory: (require: any) => any;
            }): void;
        };
    }
}
import { formatRelativeTime, rollupCiStatus, reviewDecisionBadge, eventLabel } from './ui/utils.js';
import { GITHUB_PANEL_CSS, injectStyles } from './ui/styles.js';
import { renderOctocat, renderGitIcon, renderOctocatBadge, renderPluginBadge } from './ui/icons.js';
import { getLocalSyncSettings, saveLocalSyncSettings, getStoredGlobalOverview, saveStoredGlobalOverview, clearStoredGlobalOverview, getCacheStorageMeta, getRightbarStorageKey, getStoredRightbarSnapshot, saveStoredRightbarData } from './ui/storage.js';
import { BranchSelectorDropdown } from './ui/branch-selector.js';
import { AuthGuideCard } from './ui/auth-guide-card.js';
import { UpgradeNotificationCard } from './ui/upgrade-card.js';
import { NetworkAlertBanner } from './ui/network-banner.js';
import { SyncStatusBadge } from './ui/sync-status-badge.js';
import { CommitDetailModal } from './ui/commit-modal.js';
import { GlobalSyncSettingsModal } from './ui/sync-settings-modal.js';
import { GithubWorkspacePanel } from './ui/workspace-panel.js';
export { formatRelativeTime, rollupCiStatus, reviewDecisionBadge, eventLabel, GITHUB_PANEL_CSS, injectStyles, renderOctocat, renderGitIcon, renderOctocatBadge, renderPluginBadge, getLocalSyncSettings, saveLocalSyncSettings, getStoredGlobalOverview, saveStoredGlobalOverview, clearStoredGlobalOverview, getCacheStorageMeta, getRightbarStorageKey, getStoredRightbarSnapshot, saveStoredRightbarData, BranchSelectorDropdown, AuthGuideCard, UpgradeNotificationCard, NetworkAlertBanner, SyncStatusBadge, CommitDetailModal, GlobalSyncSettingsModal, GithubWorkspacePanel, };
