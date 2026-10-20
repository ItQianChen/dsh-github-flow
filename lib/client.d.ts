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
import { formatRelativeTime, rollupCiStatus, reviewDecisionBadge, eventLabel, parseGitStatText } from './ui/utils.js';
import { GITHUB_PANEL_CSS, injectStyles } from './ui/styles.js';
import { renderOctocat, renderGitIcon, renderOctocatBadge, renderPluginBadge } from './ui/icons.js';
import { getLocalSyncSettings, saveLocalSyncSettings, getStoredGlobalOverview, saveStoredGlobalOverview, clearStoredGlobalOverview, getCacheStorageMeta, getRightbarStorageKey, getStoredRightbarSnapshot, saveStoredRightbarData, getStoredHeaderCardsVisible, saveStoredHeaderCardsVisible, HEADER_CARDS_STORAGE_KEY } from './ui/storage.js';
import { BranchSelectorDropdown } from './ui/branch-selector.js';
import { RepoSelectorDropdown } from './ui/repo-selector.js';
import { AuthGuideCard } from './ui/auth-guide-card.js';
import { UpgradeNotificationCard } from './ui/upgrade-card.js';
import { NetworkAlertBanner, RepoNoticeBar } from './ui/network-banner.js';
import { resolveRepoBadges } from './ui/repo-badges.js';
import { SyncStatusBadge } from './ui/sync-status-badge.js';
import { CommitDetailModal } from './ui/commit-modal.js';
import { PrDetailModal } from './ui/pr-modal.js';
import { IssueDetailModal } from './ui/issue-modal.js';
import { GlobalSyncSettingsModal } from './ui/sync-settings-modal.js';
import { GithubHelpModal } from './ui/help-modal.js';
import { GithubWorkspacePanel } from './ui/workspace-panel.js';
export { formatRelativeTime, rollupCiStatus, reviewDecisionBadge, eventLabel, parseGitStatText, GITHUB_PANEL_CSS, injectStyles, renderOctocat, renderGitIcon, renderOctocatBadge, renderPluginBadge, getLocalSyncSettings, saveLocalSyncSettings, getStoredGlobalOverview, saveStoredGlobalOverview, clearStoredGlobalOverview, getCacheStorageMeta, getRightbarStorageKey, getStoredRightbarSnapshot, saveStoredRightbarData, getStoredHeaderCardsVisible, saveStoredHeaderCardsVisible, HEADER_CARDS_STORAGE_KEY, BranchSelectorDropdown, RepoSelectorDropdown, AuthGuideCard, UpgradeNotificationCard, NetworkAlertBanner, RepoNoticeBar, resolveRepoBadges, SyncStatusBadge, CommitDetailModal, PrDetailModal, IssueDetailModal, GlobalSyncSettingsModal, GithubHelpModal, GithubWorkspacePanel, };
