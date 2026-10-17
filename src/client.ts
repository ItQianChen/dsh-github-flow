declare global {
  interface Window {
    __ModuleLoader__: {
      load(options: { id: string; factory: (require: any) => any }): void;
    };
  }
}

import { formatRelativeTime, rollupCiStatus, reviewDecisionBadge, eventLabel, fetchWithRetry } from './ui/utils.js';
import { GITHUB_PANEL_CSS, injectStyles } from './ui/styles.js';
import { renderOctocat, renderGitIcon, renderOctocatBadge, renderPluginBadge } from './ui/icons.js';
import {
  GLOBAL_OVERVIEW_CACHE_KEY,
  SYNC_SETTINGS_STORAGE_KEY,
  DEFAULT_SYNC_SETTINGS,
  getLocalSyncSettings,
  saveLocalSyncSettings,
  getStoredGlobalOverview,
  saveStoredGlobalOverview,
  clearStoredGlobalOverview,
  getCacheStorageMeta,
  getRightbarStorageKey,
  getStoredRightbarSnapshot,
  saveStoredRightbarData,
} from './ui/storage.js';
import { BranchSelectorDropdown } from './ui/branch-selector.js';
import { AuthGuideCard } from './ui/auth-guide-card.js';
import { UpgradeNotificationCard } from './ui/upgrade-card.js';
import { NetworkAlertBanner } from './ui/network-banner.js';
import { SyncStatusBadge } from './ui/sync-status-badge.js';
import { CommitDetailModal } from './ui/commit-modal.js';
import { GlobalSyncSettingsModal } from './ui/sync-settings-modal.js';
import { GithubWorkspacePanel } from './ui/workspace-panel.js';

export {
  formatRelativeTime,
  rollupCiStatus,
  reviewDecisionBadge,
  eventLabel,
  GITHUB_PANEL_CSS,
  injectStyles,
  renderOctocat,
  renderGitIcon,
  renderOctocatBadge,
  renderPluginBadge,
  getLocalSyncSettings,
  saveLocalSyncSettings,
  getStoredGlobalOverview,
  saveStoredGlobalOverview,
  clearStoredGlobalOverview,
  getCacheStorageMeta,
  getRightbarStorageKey,
  getStoredRightbarSnapshot,
  saveStoredRightbarData,
  BranchSelectorDropdown,
  AuthGuideCard,
  UpgradeNotificationCard,
  NetworkAlertBanner,
  SyncStatusBadge,
  CommitDetailModal,
  GlobalSyncSettingsModal,
  GithubWorkspacePanel,
};

window.__ModuleLoader__.load({
  id: "dsh-github-flow",
  factory: (require: any) => {
    var module = { exports: {} as any };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    /**
     * 按容器记录的 Tab 键应用互斥显示状态（hidden 页 + active 按钮）。
     * 模块级纯 DOM 操作：渲染函数（switchTab 点击路径）与宿主组件的 effect
     * （SWR 重渲染校正路径）共用——后者是必须的：React 重渲染会按 VDOM 初值
     * 重设 hidden/active，用户手动切的 Tab 会被一次后台数据同步拽回默认页。
     */
    function applyTabState(container: HTMLElement, tabKey: string) {
      var pages = container.querySelectorAll("[data-tab-page]");
      pages.forEach(function (page) {
        (page as HTMLElement).hidden = page.getAttribute("data-tab-page") !== tabKey;
      });
      var btns = container.querySelectorAll("[data-tab-btn]");
      btns.forEach(function (btn) {
        var active = btn.getAttribute("data-tab-btn") === tabKey;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
    }

    // 渲染 GitHub 仓库信息与操作视图的核心函数
    function renderGithubRepoView(
      h: any,
      data: any,
      loading: boolean,
      error: string | null,
      onRefresh: () => void,
      isRightbar: boolean = false,
      updateInfo: any = null,
      syncStatus: string = "",
      lastSyncedAt: number = 0,
      onOpenSettings: (() => void) | null = null,
      cwd: string | null = null,
      onSelectCommit: ((c: any) => void) | null = null,
      gitLogPagination: any = null,
      onShowToast: ((msg: string) => void) | null = null
    ) {
      var auth = data ? data.auth : null;
      var repo = data ? data.repo : null;
      var prs = (data && data.pullRequests) || [];
      var issues = (data && data.issues) || [];
      var runs = (data && data.runs) || [];

      var effectiveUpdateInfo = updateInfo || data?.updateInfo;
      var upgradeBannerEl = effectiveUpdateInfo && effectiveUpdateInfo.hasUpdate
        ? h(UpgradeNotificationCard, { updateInfo: effectiveUpdateInfo, isRightbar })
        : null;

      var networkAlertBannerEl = (syncStatus === "failed" || auth?.networkError || (error && data))
        ? h(NetworkAlertBanner, {
            isRightbar,
            networkErrorReason: auth?.networkErrorReason || error || "连接 GitHub API 超时或网络不可达，本次未能获取最新数据。",
            lastSyncedAt,
            onRefresh,
            onOpenProxy: function () {
              try { window.dispatchEvent(new CustomEvent("dsh-github-open-proxy")); } catch (e) {}
            },
          })
        : null;

      var headerEl = h(
        "div",
        { className: "dsh-github-header" },
        h(
          "div",
          { className: "dsh-github-title" },
          renderOctocatBadge(isRightbar ? 26 : 30),
          h("h2", null, isRightbar ? "GitHub 仓库" : "GitHub 工作台"),
          renderPluginBadge(h),
          syncStatus ? h(SyncStatusBadge, { syncStatus, lastSyncedAt, isRightbar }) : null
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          h(
            "button",
            {
              className: "dsh-github-refresh-btn",
              onClick: onRefresh,
              disabled: loading,
            },
            loading ? "刷新中..." : "🔄 刷新"
          ),
          onOpenSettings ? h(
            "button",
            {
              className: "dsh-github-btn-sm",
              onClick: onOpenSettings,
              title: "配置数据同步节奏、本地缓存、网络代理与插件信息",
              style: { padding: "4px 10px" },
            },
            "⚙️"
          ) : null
        )
      );

      var gitSt = data && data.gitStatus;
      var relInfo = data && data.releaseInfo;
      var branchPr = data && data.branchPr;
      var repoCardEl = h(
        "div",
        { className: "dsh-github-card" },
        h("div", { className: "dsh-github-card-title" }, "当前工作区 GitHub 仓库"),
        h(
          "div",
          { className: "dsh-github-card-value" },
          repo
            ? h("a", { href: repo.url, target: "_blank", className: "dsh-github-repo-link" }, repo.nameWithOwner)
            : h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)" } }, "未检测到关联的 GitHub 仓库"),
          repo
            ? h(BranchSelectorDropdown, {
                currentBranch: gitSt?.branch || repo.defaultBranch || "main",
                cwd,
                branchesData: data?.branches,
                onBranchSwitched: () => onRefresh(),
                showToast: onShowToast || (() => {}),
              })
            : null
        ),
        repo && repo.description
          ? h("div", { className: "dsh-github-card-desc" }, repo.description)
          : null,
        auth && auth.loggedIn
          ? h("div", { className: "dsh-github-card-subtext" }, `CLI 认证账号: ${auth.user} (${auth.scopes?.join(", ") || "已登录"})`)
          : null,
        !repo
          ? h("div", { className: "dsh-github-card-subtext" }, "若本地已有 git 仓库，请运行 `git remote add github <url>` 或 `git remote add origin <url>` 关联远程仓库。")
          : null
      );

      var commitLog = data && data.commitLog;
      var renderCommitRow = function (c: any, tone: string) {
        return h(
          "div",
          {
            style: { display: "flex", alignItems: "baseline", gap: "8px", padding: "3px 6px", fontSize: "12px", cursor: "pointer", borderRadius: "4px" },
            className: "dsh-github-commit-row",
            title: `${c.subject}\n— ${c.author} · ${c.relative} · ${c.sha}\n（点击查看提交详情）`,
            onClick: function () {
              if (typeof onSelectCommit === "function") {
                onSelectCommit(c);
              }
            },
          },
          h("span", {
            style: {
              fontFamily: "monospace",
              fontSize: "11px",
              color: tone === "ahead" ? "var(--dsw-alias-state-success-primary, #1a7f37)"
                : tone === "behind" ? "var(--dsw-alias-state-attention-primary, #9a6700)"
                : "var(--dsw-alias-label-secondary, #656d76)",
              flexShrink: 0,
            },
          }, c.sha),
          h("span", {
            style: {
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
          }, c.subject),
          h("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", whiteSpace: "nowrap", flexShrink: 0 } }, `${c.author} · ${c.relative}`)
        );
      };
      var gitSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
          h("h3", { style: { margin: 0, display: "flex", alignItems: "center", gap: "6px" } }, renderGitIcon(16, "#1296db"), "Git 记录"),
          relInfo
            ? h(
                relInfo.url ? "a" : "span",
                {
                  ...(relInfo.url ? { href: relInfo.url, target: "_blank" } : {}),
                  className: "dsh-github-badge" + (relInfo.isPrerelease ? " dsh-badge-purple" : " dsh-badge-green"),
                  style: { fontSize: "10px", textDecoration: "none", flexShrink: 0 },
                  title: `最新 Release: ${relInfo.tagName}${relInfo.isPrerelease ? "（预发布）" : ""}${formatRelativeTime(relInfo.publishedAt) ? ` · ${formatRelativeTime(relInfo.publishedAt)}发布` : ""}\n点击打开 Release 页`,
                },
                `🏷️ ${relInfo.tagName}`
              )
            : null
        ),
        gitSt
          ? h(
              "div",
              {
                style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", marginBottom: "8px" },
                title: "ahead/behind 相对上次 git fetch 的快照（非实时）",
              },
              h(BranchSelectorDropdown, {
                currentBranch: gitSt.branch,
                cwd,
                branchesData: data?.branches,
                onBranchSwitched: () => onRefresh(),
                showToast: onShowToast || (() => {}),
              }),
              gitSt.hasUpstream
                ? h("span", null, `${gitSt.ahead > 0 ? "↑" + gitSt.ahead + " " : ""}${gitSt.behind > 0 ? "↓" + gitSt.behind : ""}${gitSt.ahead === 0 && gitSt.behind === 0 ? "✓ 与远程同步" : ""}`)
                : h("span", { style: { opacity: 0.7 } }, "↑? ↓?（无 upstream）"),
              gitSt.dirtyCount > 0
                ? h("span", null, `· ${gitSt.dirtyCount} 文件未提交`)
                : h("span", null, "· 工作区干净")
            )
          : null,
        commitLog && commitLog.aheadCommits && commitLog.aheadCommits.length > 0
          ? h(
              "div",
              { style: { marginBottom: "10px" } },
              h("div", { style: { fontSize: "12px", fontWeight: 600, marginBottom: "4px", color: "var(--dsw-alias-state-success-primary, #1a7f37)" } }, `↑ 本地领先远程 ${commitLog.aheadCommits.length} 个提交（待 push）`),
              commitLog.aheadCommits.map(function (c: any, i: number) { return h("div", { key: "a" + i }, renderCommitRow(c, "ahead")); })
            )
          : null,
        commitLog && commitLog.behindCommits && commitLog.behindCommits.length > 0
          ? h(
              "div",
              { style: { marginBottom: "10px" } },
              h("div", { style: { fontSize: "12px", fontWeight: 600, marginBottom: "4px", color: "var(--dsw-alias-state-attention-primary, #9a6700)" } }, `↓ 远程领先本地 ${commitLog.behindCommits.length} 个提交（待 pull · 快照口径）`),
              commitLog.behindCommits.map(function (c: any, i: number) { return h("div", { key: "b" + i }, renderCommitRow(c, "behind")); })
            )
          : null,
        (() => {
          var baseRecent = (commitLog && commitLog.recent) || [];
          var extraRecent = (gitLogPagination && gitLogPagination.extraCommits) || [];
          var allRecentCommits = baseRecent.concat(extraRecent);
          var totalCommits = commitLog && commitLog.totalCount;
          var loadingMore = Boolean(gitLogPagination && gitLogPagination.loadingMore);
          var hasMore = Boolean(gitLogPagination && gitLogPagination.hasMore);
          var onLoadMore = gitLogPagination ? gitLogPagination.onLoadMore : null;

          if (allRecentCommits.length === 0) return null;
          return h(
            "div",
            null,
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
              h("div", { style: { fontSize: "12px", fontWeight: 600, opacity: 0.85 } }, "🕘 最近提交"),
              totalCommits
                ? h("div", { style: { fontSize: "11px", opacity: 0.6 } }, `${allRecentCommits.length} / ${totalCommits}`)
                : null
            ),
            allRecentCommits.map(function (c: any, i: number) { return h("div", { key: "r" + (c.sha || i) }, renderCommitRow(c, "recent")); }),
            h(
              "div",
              { style: { marginTop: "10px", textAlign: "center" } },
              loadingMore
                ? h("div", { style: { fontSize: "11px", opacity: 0.75, padding: "6px 0" } }, "⏳ 正在加载更多提交…")
                : (hasMore && onLoadMore)
                ? h(
                    "button",
                    {
                      className: "dsh-github-btn-sm",
                      style: {
                        cursor: "pointer",
                        padding: "4px 14px",
                        borderRadius: "14px",
                        border: "1px solid var(--dsw-alias-border-l2, #d0d7de)",
                        background: "var(--dsw-alias-bg-module-platform, #f6f8fa)",
                        color: "inherit",
                        fontSize: "11px",
                        lineHeight: "1.6",
                      },
                      onClick: onLoadMore,
                    },
                    `⬇️ 下滑或点击加载更多 (${allRecentCommits.length}${totalCommits ? " / " + totalCommits : ""})`
                  )
                : (allRecentCommits.length >= 15)
                ? h("div", { style: { fontSize: "11px", opacity: 0.5, padding: "4px 0" } }, `✓ 已加载全部 ${allRecentCommits.length} 条提交`)
                : null
            )
          );
        })(),
        !commitLog || ((commitLog.aheadCommits || []).length === 0 && (commitLog.behindCommits || []).length === 0 && (commitLog.recent || []).length === 0)
          ? h("div", { className: "dsh-github-empty" }, "无提交记录")
          : null,
        branchPr
          ? h(
              "div",
              { className: "dsh-github-item", style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" } },
              h("span", null, "🔀"),
              branchPr.url
                ? h("a", { className: "dsh-github-item-title", href: branchPr.url, target: "_blank" }, `PR #${branchPr.number} ${branchPr.title}`)
                : h("span", { className: "dsh-github-item-title" }, `PR #${branchPr.number} ${branchPr.title}`),
              branchPr.isDraft ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "DRAFT") : null
            )
          : null
      );

      var dirtySectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h("div", { className: "dsh-github-section-header" }, h("h3", null, `📁 未提交清单 (${gitSt ? gitSt.dirtyCount : 0})`)),
        !gitSt || gitSt.dirtyCount === 0
          ? h("div", { className: "dsh-github-empty" }, "工作区干净，没有未提交的变更 ✓")
          : h(
              "div",
              { style: { fontSize: "12px", lineHeight: "1.9" } },
              (gitSt.dirtyFiles || []).map(function (f: any, i: number) {
                return h(
                  "div",
                  { key: i, style: { display: "flex", gap: "8px", padding: "2px 4px", borderRadius: "4px" } },
                  h("span", {
                    style: {
                      minWidth: "24px",
                      textAlign: "center",
                      opacity: 0.75,
                      fontSize: "11px",
                      fontFamily: "monospace",
                      color: f.status === "??" ? "var(--dsw-alias-state-success-primary, #1a7f37)"
                        : f.status.indexOf("D") >= 0 ? "var(--dsw-alias-state-error-primary, #cf222e)"
                        : f.status.indexOf("M") >= 0 || f.status.indexOf("R") >= 0 ? "var(--dsw-alias-state-attention-primary, #9a6700)"
                        : "inherit",
                    },
                  }, f.status === "??" ? "??" : f.status),
                  h("span", { style: { wordBreak: "break-all" } }, f.path)
                );
              }),
              gitSt.dirtyCount > (gitSt.dirtyFiles || []).length
                ? h("div", { style: { opacity: 0.6, marginTop: "6px" } }, `…共 ${gitSt.dirtyCount} 个变更（仅列前 ${(gitSt.dirtyFiles || []).length}）`)
                : null
            )
      );

      // 快捷操作栏 (仅在检测到关联仓库时展示，未绑定仓库时不展示虚假按钮)
      var actionsBarEl = repo ? h(
        "div",
        { className: "dsh-github-quick-actions" },
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            title: "在系统默认浏览器中打开当前仓库主页",
            onClick: () => {
              if (repo?.url) {
                window.open(repo.url, "_blank", "noopener,noreferrer");
              }
            },
          },
          "🌐 浏览器打开"
        ),
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            title: "在系统默认浏览器中查看所有 Pull Requests",
            onClick: () => {
              if (repo?.url) {
                window.open(`${repo.url}/pulls`, "_blank", "noopener,noreferrer");
              }
            },
          },
          "🔀 查看所有 PRs"
        ),
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            title: "在系统默认浏览器中打开 GitHub 官方对比与创建 Pull Request 页面",
            onClick: () => {
              if (repo?.url) {
                window.open(`${repo.url}/compare`, "_blank", "noopener,noreferrer");
              }
            },
          },
          "🚀 快速创建 PR"
        ),
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            title: "在系统默认浏览器中查看当前仓库所有 Issues",
            onClick: () => {
              if (repo?.url) {
                window.open(`${repo.url}/issues`, "_blank", "noopener,noreferrer");
              }
            },
          },
          "📋 查看所有 Issues"
        ),
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            title: "在系统默认浏览器中打开 GitHub 官方新建 Issue 页面",
            onClick: () => {
              if (repo?.url) {
                window.open(`${repo.url}/issues/new`, "_blank", "noopener,noreferrer");
              }
            },
          },
          "📝 新建 Issue"
        )
      ) : null;

      var prSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h("div", { className: "dsh-github-section-header" }, h("h3", null, `🔀 Pull Requests (${prs.length})`)),
        prs.length === 0
          ? h("div", { className: "dsh-github-empty" }, "当前无开放中的 PR")
          : h(
              "div",
              { className: "dsh-github-list" },
              prs.map((pr: any) => {
                var ci = rollupCiStatus(pr.statusCheckRollup);
                var rv = reviewDecisionBadge(pr.reviewDecision);
                var relTime = formatRelativeTime(pr.updatedAt);
                return h(
                  "div",
                  { key: pr.number, className: "dsh-github-item" },
                  h("a", {
                    className: "dsh-github-item-title",
                    href: pr.url,
                    target: "_blank",
                    title: relTime ? `更新于 ${pr.updatedAt}` : undefined,
                  }, `${pr.isDraft ? "⚪ " : ""}#${pr.number} ${pr.title}`),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `${pr.headRefName} → ${pr.baseRefName}`),
                    pr.mergeable === "CONFLICTING"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "代码冲突")
                      : h("span", { className: "dsh-github-badge dsh-badge-green" }, "可合并"),
                    ci === "fail"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "❌ CI 失败")
                      : ci === "pending"
                      ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "⏳ CI 运行中")
                      : ci === "pass"
                      ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "✅ CI 通过")
                      : null,
                    rv
                      ? h("span", { className: `dsh-github-badge dsh-badge-${rv.kind}` }, rv.text)
                      : null,
                    relTime ? h("span", null, relTime) : null
                  )
                );
              })
            )
      );

      var issueSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h(
          "div",
          { className: "dsh-github-section-header" },
          h("h3", null, `📋 仓库 Issues (${issues.length})`),
          repo?.url
            ? h(
                "a",
                {
                  href: `${repo.url}/issues`,
                  target: "_blank",
                  style: { fontSize: "11px", color: "var(--dsw-alias-link, #0969da)", textDecoration: "none" },
                },
                "全部 ↗"
              )
            : null
        ),
        issues.length === 0
          ? h("div", { className: "dsh-github-empty" }, "当前无开放中的 Issue")
          : h(
              "div",
              { className: "dsh-github-list" },
              issues.map((issue: any) => {
                var cats = issue.categories || [];
                var badges: any[] = [];
                if (cats.includes("reported")) {
                  badges.push(h("span", { key: "rep", className: "dsh-github-badge dsh-badge-purple" }, "用户反馈"));
                }
                if (cats.includes("assigned")) {
                  badges.push(h("span", { key: "asn", className: "dsh-github-badge dsh-badge-blue" }, "已分配"));
                }
                if (cats.includes("created")) {
                  badges.push(h("span", { key: "crt", className: "dsh-github-badge dsh-badge-green" }, "我发起的"));
                }

                return h(
                  "div",
                  { key: issue.number, className: "dsh-github-item" },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
                    h(
                      "a",
                      { className: "dsh-github-item-title", href: issue.url, target: "_blank" },
                      `#${issue.number} ${issue.title}`
                    ),
                    ...badges
                  ),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `由 ${issue.author?.login || "未知"} 提出`),
                    issue.assignees && issue.assignees.length > 0
                      ? h("span", null, `指派: ${issue.assignees.map((a: any) => a.login).join(", ")}`)
                      : null,
                    issue.labels && issue.labels.length > 0
                      ? issue.labels.map((lbl: any) =>
                          h("span", { key: lbl.name, className: "dsh-github-badge dsh-badge-yellow" }, lbl.name)
                        )
                      : null
                  )
                );
              })
            )
      );

      var runSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h("div", { className: "dsh-github-section-header" }, h("h3", null, `⚡ 最近 Actions 流水线 (${runs.length})`)),
        runs.length === 0
          ? h("div", { className: "dsh-github-empty" }, "暂无工作流记录")
          : h(
              "div",
              { className: "dsh-github-list" },
              runs.map((r: any) =>
                h(
                  "div",
                  { key: r.databaseId, className: "dsh-github-item" },
                  h("a", {
                    className: "dsh-github-item-title",
                    href: r.url,
                    target: "_blank",
                    title: r.createdAt ? `始于 ${r.createdAt}` : undefined,
                  }, r.name),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `分支: ${r.headBranch}`),
                    r.event ? h("span", null, eventLabel(r.event)) : null,
                    formatRelativeTime(r.createdAt) ? h("span", null, formatRelativeTime(r.createdAt)) : null,
                    r.conclusion === "success"
                      ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "✓ 成功")
                      : r.conclusion === "failure"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "✕ 失败")
                      : h("span", { className: "dsh-github-badge dsh-badge-yellow" }, r.status)
                  ),
                  r.conclusion === "failure"
                    ? h("div", {
                        className: "dsh-github-card-subtext",
                        style: { fontSize: "11px", marginTop: "2px" },
                      }, `💡 让 Agent 调用 github_run(action:'log_failed', run_id:'${r.databaseId}') 提取失败日志定位原因`)
                    : null
                )
              )
            )
      );

      var authGuideEl = (!auth?.loggedIn && !auth?.networkError && syncStatus !== "failed")
        ? h(AuthGuideCard, { auth, onRefresh, isRightbar })
        : null;

      var TAB_DEFS: Array<{ key: string; label: string; count: number | null; icon?: any }> = [
        { key: "git", label: "Git", count: null, icon: renderGitIcon(13, "#1296db") },
        { key: "dirty", label: "📁 未提交", count: gitSt ? gitSt.dirtyCount : null },
        { key: "prs", label: "🔀 PR", count: prs.length },
        { key: "issues", label: "📋 Issues", count: issues.length },
        { key: "runs", label: "⚡ Actions", count: runs.length },
      ].filter(function (t) {
        if ((t.key === "git" || t.key === "dirty") && !gitSt) return false;
        return true;
      });
      var defaultTab = gitSt ? "git" : (prs.length === 0 && issues.length > 0 ? "issues" : "prs");

      var switchTab = function (container: HTMLElement, tabKey: string) {
        container.setAttribute("data-active-tab", tabKey);
        applyTabState(container, tabKey);
      };

      var tabsBarEl = h(
        "div",
        { className: "dsh-github-tabs", style: { marginBottom: "12px" } },
        ...TAB_DEFS.map(function (t) {
          var labelText = t.count !== null ? `${t.label} (${t.count})` : t.label;
          return h(
            "button",
            {
              key: t.key,
              className: "dsh-github-tab-btn" + (t.key === defaultTab ? " active" : ""),
              "data-tab-btn": t.key,
              style: t.icon ? { display: "inline-flex", alignItems: "center", gap: "5px" } : undefined,
              onClick: function (e: any) {
                var container = (e.target as HTMLElement).closest("[data-active-tab]");
                if (container) switchTab(container as HTMLElement, t.key);
              },
            },
            t.icon ? [t.icon, " ", labelText] : labelText
          );
        })
      );

      var tabbedContentEl = h(
        "div",
        { "data-active-tab": defaultTab },
        tabsBarEl,
        h("div", { "data-tab-page": "prs", hidden: defaultTab !== "prs" }, prSectionEl),
        h("div", { "data-tab-page": "issues", hidden: defaultTab !== "issues" }, issueSectionEl),
        h("div", { "data-tab-page": "runs", hidden: defaultTab !== "runs" }, runSectionEl),
        gitSt ? h("div", { "data-tab-page": "git", hidden: defaultTab !== "git" }, gitSectionEl) : null,
        gitSt ? h("div", { "data-tab-page": "dirty", hidden: defaultTab !== "dirty" }, dirtySectionEl) : null
      );

      return [headerEl, networkAlertBannerEl, upgradeBannerEl, authGuideEl, repoCardEl, actionsBarEl, tabbedContentEl].filter(Boolean);
    }

    // 1. 右侧栏专属视图 (Right Sidebar Tab Body)
    function GithubRightbarBody(props: any) {
      var sessionId = props ? props.sessionId : null;
      var cwd: string | null = null;
      if (props && typeof props.useSessions === "function" && sessionId) {
        try {
          cwd = props.useSessions((sessions: any) => sessions?.byId?.[sessionId]?.cwd) || null;
        } catch (e) {}
      }

      var initialSettings = React.useMemo(() => getLocalSyncSettings(), []);
      var [syncSettings, setSyncSettings] = React.useState(initialSettings);

      var initialSnapshot = React.useMemo(() => getStoredRightbarSnapshot(cwd), [cwd]);
      var [data, setData] = React.useState(initialSnapshot?.data || null);
      var [syncStatus, setSyncStatus] = React.useState(initialSnapshot ? "cached" : "loading");
      var [lastSyncedAt, setLastSyncedAt] = React.useState(initialSnapshot?.savedAt || 0);
      var [loading, setLoading] = React.useState(false);
      var [error, setError] = React.useState(null as string | null);
      var [updateInfo, setUpdateInfo] = React.useState(null as any);
      var [toastMsg, setToastMsg] = React.useState(null as string | null);
      var cloudTimerRef = React.useRef(null as any);
      var dataRef = React.useRef(data);
      dataRef.current = data;
      var lastCwdRef = React.useRef(cwd);
      var containerRef = React.useRef(null as any);

      var showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 5000);
      };

      React.useEffect(() => {
        if (lastCwdRef.current === cwd) return;
        lastCwdRef.current = cwd;
        var snap = getStoredRightbarSnapshot(cwd);
        setData(snap?.data || null);
        setSyncStatus(snap ? "cached" : "loading");
        setLastSyncedAt(snap?.savedAt || 0);
        setError(null);
      }, [cwd]);

      React.useEffect(function () {
        var onSettingsChange = function (e: any) {
          if (e && e.detail) {
            setSyncSettings(e.detail);
          }
        };
        var onCacheCleared = function () {
          setData(null);
          setLastSyncedAt(0);
          setSyncStatus("loading");
        };
        window.addEventListener("dsh-github-sync-settings-change", onSettingsChange);
        window.addEventListener("dsh-github-cache-cleared", onCacheCleared);
        return function () {
          window.removeEventListener("dsh-github-sync-settings-change", onSettingsChange);
          window.removeEventListener("dsh-github-cache-cleared", onCacheCleared);
        };
      }, []);

      React.useEffect(() => {
        var timer = setTimeout(function () {
          fetch("/api/github/check-update")
            .then(function (res) { return res.json(); })
            .then(function (json) {
              if (json && json.ok && json.data) {
                setUpdateInfo(json.data);
              }
            })
            .catch(function () {});
        }, 300);
        return function () { clearTimeout(timer); };
      }, []);

      var loadData = React.useCallback(async (forceRefresh = false) => {
        if (!forceRefresh && syncSettings.strategy === "manual" && dataRef.current) {
          return;
        }

        if (forceRefresh || !dataRef.current) {
          setLoading(true);
        }
        setSyncStatus(dataRef.current ? "syncing" : "loading");
        setError(null);

        var controller = new AbortController();
        var timedOut = false;
        var timer = setTimeout(function () { timedOut = true; controller.abort(); }, 45000);
        try {
          if (forceRefresh) {
            await fetch("/api/github/refresh", { method: "POST", signal: controller.signal }).catch(() => {});
          }
          var url = "/api/github/overview";
          var params: string[] = [];
          if (forceRefresh) {
            params.push("force=true");
          }
          if (sessionId) {
            params.push("sessionId=" + encodeURIComponent(sessionId));
          }
          if (cwd) {
            params.push("cwd=" + encodeURIComponent(cwd));
          }
          if (params.length > 0) {
            url += "?" + params.join("&");
          }

          // 接入 1s/2s/4s 阶梯退避重试，平滑吸收代理节点与网络的偶发抖动断流
          var { res, json } = await fetchWithRetry(url, {}, {
            signal: controller.signal,
            maxRetries: 3,
            baseDelayMs: 1000,
            onRetry: (attempt) => {
              setSyncStatus("syncing");
              setError(`网络抖动，正在自愈重试 (${attempt}/3)...`);
            },
          });

          if (!res.ok) {
            var errText = (typeof json === "string" ? json : JSON.stringify(json)) || res.statusText;
            var msg = `后端服务未就绪 (${res.status}): ${errText}`;
            setSyncStatus("failed");
            setError(msg);
            if (forceRefresh) {
              showToast("❌ 刷新失败：" + msg);
            }
            return;
          }

          if (json.ok && json.data) {
            var isFail = Boolean(
              json.partialFailure ||
              json.data.partialFailure ||
              json.data.networkError ||
              json.data.auth?.networkError ||
              json.error
            );
            var failReason = String(
              json.error ||
              json.fetchError ||
              json.data.networkErrorReason ||
              json.data.auth?.networkErrorReason ||
              "拉取云端数据失败"
            );

            if (isFail) {
              setSyncStatus("failed");
              setError(failReason);
              var curData = dataRef.current;
              if (curData && (curData.pullRequests?.length > 0 || curData.issues?.length > 0 || curData.runs?.length > 0)) {
                if (json.data.pullRequests?.length > 0 || json.data.issues?.length > 0) {
                  setData(json.data);
                }
              } else {
                setData(json.data);
              }
              if (forceRefresh) {
                showToast("❌ 刷新失败：" + failReason);
              }
            } else {
              setData(json.data);
              saveStoredRightbarData(cwd, json.data);
              var syncTs = json.fromCache && json.data.lastUpdated
                ? (Date.parse(json.data.lastUpdated) || Date.now())
                : Date.now();
              setLastSyncedAt(syncTs);
              setSyncStatus(json.fromCache ? "cached" : "fresh");
              setError(null);
              if (forceRefresh) {
                showToast("✅ 刷新成功，已同步最新数据");
              }
            }
            if (json.data.updateInfo) {
              setUpdateInfo(json.data.updateInfo);
            }
          } else if (dataRef.current) {
            setSyncStatus("failed");
            var failMsg = json.error || "获取状态失败";
            setError(failMsg);
            if (forceRefresh) {
              showToast("❌ 刷新失败：" + failMsg);
            }
          } else {
            setError(json.error || "获取状态失败");
          }
        } catch (err: any) {
          setSyncStatus("failed");
          var catchFailReason = (timedOut || err.name === "AbortError")
            ? "网络连接超时 (45 秒)：请检查网络或在代理设置中放行 127.0.0.1"
            : (err.message || "网络异常");
          setError(catchFailReason);
          if (forceRefresh) {
            showToast("❌ 刷新失败：" + catchFailReason);
          }
        } finally {
          clearTimeout(timer);
          setLoading(false);
          if (syncSettings.strategy === "auto") {
            scheduleNextCloudSync();
          }
        }
      }, [cwd, sessionId, syncSettings.strategy]);

      var scheduleNextCloudSync = React.useCallback(() => {
        if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
        if (syncSettings.strategy !== "auto") return;
        var interval = Math.max(300000, Number(syncSettings.cloudSyncIntervalMs) || 600000);
        cloudTimerRef.current = setTimeout(() => {
          if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            var onVisible = () => {
              if (document.visibilityState === "visible") {
                document.removeEventListener("visibilitychange", onVisible);
                loadData(false);
              }
            };
            document.addEventListener("visibilitychange", onVisible);
            return;
          }
          loadData(false);
        }, interval);
      }, [syncSettings.strategy, syncSettings.cloudSyncIntervalMs, loadData]);

      React.useEffect(() => {
        if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
        if (syncSettings.strategy === "swr" || syncSettings.strategy === "auto") {
          var timer = setTimeout(function () { loadData(false); }, 300);
          return function () {
            clearTimeout(timer);
            if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
          };
        } else if (!dataRef.current) {
          loadData(false);
        }
        return function () {
          if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
        };
      }, [cwd, sessionId, syncSettings.strategy, syncSettings.cloudSyncIntervalMs, loadData]);

      // 纯本地 Git 状态局部刷新：只更新未提交改动(Dirty)、分支与提交记录，彻底切断连带远端网络风暴
      var refreshLocalGit = React.useCallback(async () => {
        if (!cwd) return;
        try {
          var res = await fetch("/api/github/local-git-status?cwd=" + encodeURIComponent(String(cwd)));
          if (!res.ok) return;
          var json = await res.json().catch(() => null);
          if (json && json.ok && json.data) {
            setData((prev: any) => {
              if (!prev) return prev;
              var next = {
                ...prev,
                gitStatus: json.data.gitStatus !== undefined ? json.data.gitStatus : prev.gitStatus,
                commitLog: json.data.commitLog !== undefined ? json.data.commitLog : prev.commitLog,
                branches: json.data.branches !== undefined ? json.data.branches : prev.branches,
              };
              saveStoredRightbarData(cwd, next);
              return next;
            });
          }
        } catch {
          // 纯本地静默更新，网络异常或组件卸载不打扰用户
        }
      }, [cwd]);

      React.useEffect(() => {
        if (!syncSettings.localGitWatch || !cwd || !data?.repo) return;
        var aborted = false;
        var watchController = new AbortController();

        var pollWatch = async () => {
          while (!aborted) {
            try {
              var res = await fetch("/api/github/git-watch?cwd=" + encodeURIComponent(String(cwd)), {
                signal: watchController.signal,
              });
              if (!res.ok) {
                await new Promise((r) => setTimeout(r, 6000));
                continue;
              }
              var json = await res.json().catch(() => null);
              if (aborted) break;
              if (json && json.changed) {
                // 仅局部刷新本地未提交文件、分支与提交记录，零网络流量，彻底切断连带远端网络风暴！
                refreshLocalGit();
              }
            } catch (err: any) {
              if (aborted || err.name === "AbortError") break;
              await new Promise((r) => setTimeout(r, 6000));
            }
          }
        };

        pollWatch();

        return () => {
          aborted = true;
          watchController.abort();
        };
      }, [cwd, data?.repo, syncSettings.localGitWatch, refreshLocalGit]);

      React.useEffect(() => {
        var container = containerRef && containerRef.current;
        if (!container) return;
        var active = container.getAttribute("data-active-tab");
        if (active) applyTabState(container, active);
      }, [data]);

      React.useEffect(() => {
        var onFocus = () => {
          if (!data?.auth?.loggedIn) {
            fetch("/api/github/auth?force=true")
              .then(function (res) { return res.json(); })
              .then(function (json) {
                if (json && json.ok && json.auth && json.auth.loggedIn) {
                  loadData(true);
                }
              })
              .catch(function () {});
          } else if (syncSettings.localGitWatch && data?.repo) {
            // 聚焦时若开启了本地 Git 监听，仅局部刷新本地状态，杜绝多余远端请求
            refreshLocalGit();
          }
        };

        var onOnline = () => {
          // 监听网络由断网恢复连接瞬间，自动静默发起一次全量同步，消除离线警告横幅并拉新
          loadData(false);
        };

        window.addEventListener("focus", onFocus);
        window.addEventListener("online", onOnline);
        return () => {
          window.removeEventListener("focus", onFocus);
          window.removeEventListener("online", onOnline);
        };
      }, [data, loadData, refreshLocalGit, syncSettings.localGitWatch]);

      var [aboutModalOpen, setAboutModalOpen] = React.useState(false);
      var [rightbarModalOpen, setRightbarModalOpen] = React.useState(false);
      var [rightbarModalSection, setRightbarModalSection] = React.useState("sync");
      var [selectedCommit, setSelectedCommit] = React.useState(null as any);
      var [extraCommits, setExtraCommits] = React.useState([] as any[]);
      var [loadingMore, setLoadingMore] = React.useState(false);
      var [hasMoreCommits, setHasMoreCommits] = React.useState(true);

      React.useEffect(function () {
        setExtraCommits([]);
        setHasMoreCommits(true);
      }, [cwd, data]);

      var loadMoreCommits = function () {
        if (loadingMore || !hasMoreCommits) return;
        var baseCount = (data?.commitLog?.recent?.length || 0);
        var currentCount = baseCount + extraCommits.length;
        var total = data?.commitLog?.totalCount;
        if (total !== undefined && currentCount >= total) {
          setHasMoreCommits(false);
          return;
        }
        setLoadingMore(true);
        var url = "/api/github/git-log?limit=15&skip=" + currentCount + (cwd ? "&cwd=" + encodeURIComponent(cwd) : "");
        fetch(url)
          .then(function (r: any) { return r.json(); })
          .then(function (j: any) {
            setLoadingMore(false);
            if (j && j.ok && j.data && Array.isArray(j.data.commits)) {
              if (j.data.commits.length === 0) {
                setHasMoreCommits(false);
              } else {
                setExtraCommits(function (prev: any[]) { return prev.concat(j.data.commits); });
                if (j.data.totalCount !== undefined && (currentCount + j.data.commits.length) >= j.data.totalCount) {
                  setHasMoreCommits(false);
                }
              }
            } else {
              setHasMoreCommits(false);
            }
          })
          .catch(function () {
            setLoadingMore(false);
          });
      };

      React.useEffect(function () {
        var el = containerRef && containerRef.current;
        if (!el) return;
        var onScroll = function () {
          var activeTab = el.getAttribute("data-active-tab");
          if (activeTab && activeTab !== "git") return;
          var threshold = 80;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
            loadMoreCommits();
          }
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return function () { el.removeEventListener("scroll", onScroll); };
      }, [data, extraCommits, loadingMore, hasMoreCommits, cwd]);

      React.useEffect(() => {
        var onOpenAbout = () => {
          var el = containerRef && containerRef.current;
          if (!el) return;
          var rect = el.getBoundingClientRect();
          var visible = rect.width > 0 && rect.height > 0;
          if (visible) setAboutModalOpen(true);
        };
        var onOpenProxy = () => {
          var el = containerRef && containerRef.current;
          if (!el) return;
          var rect = el.getBoundingClientRect();
          var visible = rect.width > 0 && rect.height > 0;
          if (visible) {
            setRightbarModalSection("proxy");
            setRightbarModalOpen(true);
          }
        };
        window.addEventListener("dsh-github-open-about", onOpenAbout);
        window.addEventListener("dsh-github-open-proxy", onOpenProxy);
        return () => {
          window.removeEventListener("dsh-github-open-about", onOpenAbout);
          window.removeEventListener("dsh-github-open-proxy", onOpenProxy);
        };
      }, []);

      var openRightbarSettings = () => {
        setRightbarModalSection("sync");
        setRightbarModalOpen(true);
      };

      var h = React.createElement;
      var toastEl = toastMsg
        ? h(
            "div",
            {
              style: {
                padding: "8px 12px",
                marginBottom: "10px",
                borderRadius: "6px",
                fontSize: "12px",
                background: toastMsg.startsWith("✅") ? "rgba(46, 160, 67, 0.15)" : "rgba(207, 34, 46, 0.15)",
                color: toastMsg.startsWith("✅") ? "var(--dsw-alias-state-success, #2ea043)" : "var(--dsw-alias-state-error-primary, #cf222e)",
                border: "1px solid " + (toastMsg.startsWith("✅") ? "rgba(46, 160, 67, 0.35)" : "rgba(207, 34, 46, 0.35)"),
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              },
            },
            h("span", null, toastMsg),
            h("button", { onClick: () => setToastMsg(null), style: { background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "14px" } }, "✕")
          )
        : null;

      return h(
        "div",
        { className: "dsh-github-rightbar-container", ref: containerRef },
        toastEl,
        ...renderGithubRepoView(
          h,
          data,
          loading,
          error,
          () => loadData(true),
          true,
          updateInfo,
          syncStatus,
          lastSyncedAt,
          openRightbarSettings,
          cwd,
          (c: any) => setSelectedCommit(c),
          {
            extraCommits: extraCommits,
            loadingMore: loadingMore,
            hasMore: hasMoreCommits,
            onLoadMore: loadMoreCommits,
          },
          showToast
        ),
        h(GlobalSyncSettingsModal, {
          isOpen: aboutModalOpen,
          initialSection: "about",
          onClose: () => setAboutModalOpen(false),
          currentSettings: syncSettings,
          onSave: function () {},
          onClearCache: function () { setData(null); },
        }),
        h(GlobalSyncSettingsModal, {
          isOpen: rightbarModalOpen,
          initialSection: rightbarModalSection,
          onClose: () => setRightbarModalOpen(false),
          currentSettings: syncSettings,
          onSave: function (newSettings: any) { setSyncSettings(newSettings); },
          onClearCache: function () {
            setData(null);
            setLastSyncedAt(0);
            setSyncStatus("loading");
          },
        }),
        selectedCommit
          ? h(CommitDetailModal, {
              commit: selectedCommit,
              onClose: function () { setSelectedCommit(null); },
              cwd: cwd,
            })
          : null
      );
    }

    // 2. 右侧栏 Tab 标题组件
    function GithubRightbarTitle() {
      var h = React.createElement;
      return h(
        "span",
        { style: { display: "flex", alignItems: "center", gap: "6px" } },
        renderOctocat(15, "#58a6ff"),
        h("span", null, "GitHub")
      );
    }

    // 3. 右侧栏“开始”引导页的大图标 (Artwork)
    function GithubArtwork() {
      return renderOctocatBadge(32);
    }

    // 4. 左侧栏全局入口与中央大面板
    function GithubSidebarIcon(props: any) {
      const active = Boolean(props && props.active);
      return React.createElement(
        "div",
        {
          className: "dsh-github-icon" + (active ? " active" : ""),
          title: "GitHub 全景驾驶舱（dsh-github-flow 插件）",
        },
        React.createElement(
          "div",
          {
            className: "dsh-github-icon-inner" + (active ? " active" : "")
          },
          renderOctocat(18, "currentColor")
        )
      );
    }

    var inject = ["slots", "sidebarRightTabs", "sessions", "layout", "theme"];

    function apply(ctx: any) {
      if (typeof window !== "undefined" && window.document) {
        var sweep = () => {
          document.querySelectorAll(".dsh-github-right-card, .dsh-github-mounted-card, #dsh-github-floating-drawer").forEach((el) => el.remove());
        };
        sweep();
        setTimeout(sweep, 300);
        setTimeout(sweep, 1500);
      }

      if (ctx.effect) {
        ctx.effect(() => injectStyles(), "github: styles");
      } else {
        injectStyles();
      }

      if (ctx.on) {
        ctx.on("theme/change", () => {
          injectStyles();
        });
      }

      if (ctx.sidebarRightTabs && typeof ctx.sidebarRightTabs.register === "function") {
        ctx.effect(() => {
          return ctx.sidebarRightTabs.register({
            id: "dsh-github-flow",
            kind: "github",
            priority: "plugin",
            title: () => "GitHub 仓库",
            guide: [
              {
                id: "workspace.github",
                commandId: "workspace.github",
                order: 40,
                title: () => "GitHub 仓库",
                description: () => "查看与操作当前工作区目录下的 GitHub 仓库（由 dsh-github-flow 插件提供）",
                icon: GithubArtwork,
              },
            ],
          });
        }, "github: sidebar right tab definition");
      }

      if (ctx.slots) {
        ctx.slots.inject("sidebar.right.pane.tab", () => {
          return ctx.slots.register({
            name: "sidebar.right.pane.tab",
            key: "dsh-github-flow",
          }, GithubRightbarBody);
        });

        ctx.slots.inject("sidebar.right.pane.tab.title", () => {
          return ctx.slots.register({
            name: "sidebar.right.pane.tab.title",
            key: "dsh-github-flow",
          }, GithubRightbarTitle);
        });

        ctx.slots.inject("sidebar.panellist", () => {
          return ctx.slots.register({
            name: "sidebar.panellist",
            id: "github",
            order: 20,
            label: "GitHub",
          }, GithubSidebarIcon);
        });

        ctx.slots.inject("main", () => {
          return ctx.slots.register({
            name: "main",
            key: "github",
          }, GithubWorkspacePanel);
        });
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = "dsh-github-flow";

    return module.exports;
  }
});
