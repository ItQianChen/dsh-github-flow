declare global {
  interface Window {
    __ModuleLoader__: {
      load(options: { id: string; factory: (require: any) => any }): void;
    };
  }
}

import { formatRelativeTime, rollupCiStatus, reviewDecisionBadge, eventLabel, fetchWithRetry, parseGitStatText } from './ui/utils.js';
// 状态→徽章映射与服务端 CLI 输出共用同一份实现（构建期被内联进本 bundle 的作用域）
import { prStateBadge, ciBadge, issueStateBadge } from './shared/state-badges.js';
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
  getStoredHeaderCardsVisible,
  saveStoredHeaderCardsVisible,
  HEADER_CARDS_STORAGE_KEY,
  getStoredRightbarStateFilter,
  saveStoredRightbarStateFilter,
  PR_STATE_FILTERS,
  ISSUE_STATE_FILTERS,
} from './ui/storage.js';
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

export {
  formatRelativeTime,
  rollupCiStatus,
  reviewDecisionBadge,
  eventLabel,
  parseGitStatText,
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
  getStoredHeaderCardsVisible,
  saveStoredHeaderCardsVisible,
  HEADER_CARDS_STORAGE_KEY,
  getStoredRightbarStateFilter,
  saveStoredRightbarStateFilter,
  PR_STATE_FILTERS,
  ISSUE_STATE_FILTERS,
  BranchSelectorDropdown,
  RepoSelectorDropdown,
  AuthGuideCard,
  UpgradeNotificationCard,
  NetworkAlertBanner,
  RepoNoticeBar,
  resolveRepoBadges,
  SyncStatusBadge,
  CommitDetailModal,
  PrDetailModal,
  IssueDetailModal,
  GlobalSyncSettingsModal,
  GithubHelpModal,
  GithubWorkspacePanel,
};

window.__ModuleLoader__.load({
  id: "dsh-github-flow",
  factory: (require: any) => {
    var module = { exports: {} as any };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var currentPluginCtx: any = null;

    /**
     * 按容器记录的 Tab 键应用互斥显示状态（hidden 页 + active 按钮）。
     * 模块级纯 DOM 操作：渲染函数（switchTab 点击路径）与宿主组件的 effect
     * （SWR 重渲染校正路径）共用——后者是必须的：React 重渲染会按 VDOM 初值
     * 重设 hidden/active，用户手动切的 Tab 会被一次后台数据同步拽回默认页。
     */
    function applyTabState(container: HTMLElement, tabKey: string) {
      container.setAttribute("data-active-tab", tabKey);
      var rightbar = container.closest(".dsh-github-rightbar-container");
      if (rightbar) {
        rightbar.setAttribute("data-active-tab", tabKey);
      }
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

    /**
     * 未提交文件原生二级 Git Diff 下钻视图组件（右侧栏内就地渲染，零模态遮罩）
     */
    function UncommittedDiffView(props: {
      file: { status: string; path: string };
      onBack: () => void;
      cwd?: string | null;
      onOpenInDsh?: (filePath: string) => void;
    }) {
      var f = props.file;
      var h = React.createElement;
      var [diffData, setDiffData] = React.useState(null as any);
      var [loading, setLoading] = React.useState(true);
      var [error, setError] = React.useState(null as string | null);
      var [copied, setCopied] = React.useState(false);

      React.useEffect(function () {
        var onKeyDown = function (e: any) {
          if (e.key === "Escape" || e.keyCode === 27) {
            props.onBack();
          }
        };
        window.addEventListener("keydown", onKeyDown);
        return function () { window.removeEventListener("keydown", onKeyDown); };
      }, [props.onBack]);

      React.useEffect(function () {
        setLoading(true);
        setError(null);
        setDiffData(null);

        var fetchDiff = async function () {
          var primaryUrl = "/api/github/file-diff?file=" + encodeURIComponent(f.path) + (props.cwd ? "&cwd=" + encodeURIComponent(props.cwd) : "");

          var tryParseResponse = async function (res: any) {
            var text = await res.text().catch(function () { return ""; });
            var json: any = null;
            if (text && (text.trim().startsWith("{") || text.trim().startsWith("["))) {
              try { json = JSON.parse(text); } catch (e) {}
            }
            return { ok: res.ok, status: res.status, text: text, json: json };
          };

          try {
            var r1 = await fetch(primaryUrl);
            var p1 = await tryParseResponse(r1);

            if (p1.ok && p1.json && p1.json.ok && p1.json.data) {
              setDiffData(p1.json.data);
              setLoading(false);
              return;
            }

            // 若主路由遇到 404 (后端常驻进程未重启)，自动降级请求常驻的 /api/github/action 端点
            if (p1.status === 404) {
              var r2 = await fetch("/api/github/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "get_file_diff",
                  file: f.path,
                  cwd: props.cwd || undefined,
                }),
              }).catch(function () { return null; });

              if (r2) {
                var p2 = await tryParseResponse(r2);
                if (p2.ok && p2.json && p2.json.data) {
                  setDiffData(p2.json.data);
                  setLoading(false);
                  return;
                }
              }

              setLoading(false);
              setError("后端对比接口未激活 (404)。请重启 DSH 桌面主程序以载入最新对比引擎；您也可点击上方「在 DSH 中打开」直接预览文件源码。");
              return;
            }

            setLoading(false);
            setError(p1.json?.error || p1.text || ("查询差异失败 (HTTP " + p1.status + ")"));
          } catch (err: any) {
            setLoading(false);
            setError(err?.message || "网络请求异常");
          }
        };

        fetchDiff();
      }, [f.path, props.cwd]);

      var copyDiff = function () {
        if (!diffData?.diff) return;
        if (navigator?.clipboard?.writeText) {
          navigator.clipboard.writeText(diffData.diff).then(function () {
            setCopied(true);
            setTimeout(function () { setCopied(false); }, 2000);
          }).catch(function () {});
        }
      };

      var statusColor = f.status === "??" ? "var(--dsw-alias-state-success-primary, #1a7f37)"
        : f.status.indexOf("D") >= 0 ? "var(--dsw-alias-state-error-primary, #cf222e)"
        : "var(--dsw-alias-state-attention-primary, #9a6700)";

      var statusText = f.status === "??" ? "未跟踪新增"
        : f.status.indexOf("D") >= 0 ? "已删除"
        : f.status.indexOf("R") >= 0 ? "已重命名"
        : "已修改";

      return h(
        "div",
        {
          className: "dsh-github-inline-diff-view",
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            minHeight: "260px",
            padding: "4px 0",
          },
        },
        // 顶部操作与状态栏
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "6px",
              paddingBottom: "8px",
              borderBottom: "1px solid var(--dsw-alias-border-subtle, rgba(0,0,0,0.1))",
            },
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            h(
              "button",
              {
                className: "dsh-github-btn-sm",
                style: { padding: "3px 8px", cursor: "pointer", fontWeight: 600, fontSize: "11px" },
                onClick: props.onBack,
                title: "返回未提交文件清单 (Esc)",
              },
              "← 返回列表"
            ),
            h(
              "span",
              {
                className: "dsh-github-badge",
                style: {
                  backgroundColor: statusColor + "22",
                  color: statusColor,
                  fontWeight: 600,
                  fontSize: "11px",
                },
              },
              `${f.status} ${statusText}`
            ),
            diffData && diffData.additions !== undefined
              ? h(
                  "div",
                  { style: { display: "flex", gap: "4px", fontSize: "11px", fontFamily: "monospace" } },
                  h("span", { style: { color: "var(--dsw-alias-state-success-primary, #1a7f37)", fontWeight: 600 } }, `+${diffData.additions}`),
                  h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)", fontWeight: 600 } }, `-${diffData.deletions}`)
                )
              : null
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            diffData?.diff
              ? h(
                  "button",
                  {
                    className: "dsh-github-btn-sm",
                    style: { padding: "3px 8px", fontSize: "11px", cursor: "pointer" },
                    onClick: copyDiff,
                    title: "复制 Unified Diff 原文",
                  },
                  copied ? "✓ 已复制" : "📋 复制 Diff"
                )
              : null,
            props.onOpenInDsh
              ? h(
                  "button",
                  {
                    className: "dsh-github-btn-sm",
                    style: { padding: "3px 8px", fontSize: "11px", cursor: "pointer" },
                    onClick: function () {
                      if (props.onOpenInDsh) props.onOpenInDsh(f.path);
                    },
                    title: "在 DSH 侧边栏打开查看该文件完整源码",
                  },
                  "📄 在 DSH 中打开"
                )
              : null
          )
        ),
        // 文件路径栏
        h(
          "div",
          {
            style: {
              fontSize: "11px",
              fontFamily: "monospace",
              color: "var(--dsw-alias-label-secondary, #656d76)",
              wordBreak: "break-all",
              padding: "3px 6px",
              backgroundColor: "var(--dsw-alias-bg-subtle, rgba(0,0,0,0.03))",
              borderRadius: "4px",
            },
            title: f.path,
          },
          f.path
        ),
        // Diff 主体内容
        loading
          ? h(
              "div",
              { style: { padding: "32px 0", textAlign: "center", opacity: 0.65, fontSize: "12px" } },
              "⏳ 正在计算 Git 代码比对差异..."
            )
          : error
          ? h(
              "div",
              {
                style: {
                  padding: "16px",
                  color: "var(--dsw-alias-label-primary, #1f2328)",
                  fontSize: "12px",
                  lineHeight: "1.6",
                  backgroundColor: "var(--dsw-alias-bg-subtle, rgba(0,0,0,0.03))",
                  borderRadius: "6px",
                },
              },
              h("div", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)", fontWeight: 600, marginBottom: "6px" } }, `⚠️ ${error}`),
              h("div", { style: { fontSize: "11px", opacity: 0.75 } }, "💡 提示：重启 DSH 桌面主程序即可激活本地比对路由；在此期间您也可点击上方「📄 在 DSH 中打开」直接预览文件源码。")
            )
          : diffData?.isBinary
          ? h(
              "div",
              { style: { padding: "32px 0", textAlign: "center", opacity: 0.8, fontSize: "12px" } },
              "📦 该文件为二进制格式（图片或编译产物），无法直接展示文本差异。"
            )
          : h(
              "div",
              {
                className: "dsh-github-inline-diff-content",
                style: {
                  margin: 0,
                  padding: "4px 0",
                  fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
                  fontSize: "11px",
                  lineHeight: "1.5",
                  overflowX: "auto",
                  maxHeight: "68vh",
                  borderRadius: "6px",
                  border: "1px solid var(--dsw-alias-border-subtle, rgba(0,0,0,0.08))",
                  backgroundColor: "var(--dsw-alias-bg-canvas, #ffffff)",
                },
              },
              (diffData?.diff || "").split("\n").map(function (line: string, idx: number) {
                var isAdd = line.startsWith("+") && !line.startsWith("+++");
                var isDel = line.startsWith("-") && !line.startsWith("---");
                var isHunk = line.startsWith("@@");
                var isHeader = line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++");

                var lineStyle: any = {
                  display: "flex",
                  padding: "0 8px",
                  whiteSpace: "pre",
                  minWidth: "100%",
                  boxSizing: "border-box",
                };

                if (isAdd) {
                  lineStyle.backgroundColor = "var(--dsw-alias-state-success-subtle, rgba(46,160,67,0.15))";
                  lineStyle.color = "var(--dsw-alias-state-success-primary, #1a7f37)";
                } else if (isDel) {
                  lineStyle.backgroundColor = "var(--dsw-alias-state-error-subtle, rgba(248,81,73,0.15))";
                  lineStyle.color = "var(--dsw-alias-state-error-primary, #cf222e)";
                } else if (isHunk) {
                  lineStyle.backgroundColor = "var(--dsw-alias-bg-subtle, rgba(0,0,0,0.04))";
                  lineStyle.color = "var(--dsw-alias-label-secondary, #656d76)";
                  lineStyle.fontWeight = 600;
                  lineStyle.margin = "2px 0";
                } else if (isHeader) {
                  lineStyle.color = "var(--dsw-alias-label-muted, #8c959f)";
                  lineStyle.fontSize = "10px";
                } else {
                  lineStyle.color = "var(--dsw-alias-label-primary, #1f2328)";
                }

                return h("div", { key: idx, style: lineStyle }, line || " ");
              })
            )
      );
    }
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
      onOpenSettings: ((section?: string) => void) | null = null,
      cwd: string | null = null,
      onSelectCommit: ((c: any) => void) | null = null,
      gitLogPagination: any = null,
      onShowToast: ((msg: string) => void) | null = null,
      onOpenHelp: (() => void) | null = null,
      onOpenFile: ((f: any) => void) | null = null,
      dirtyPagination: any = null,
      activeDiffFile: any = null,
      onSelectDiffFile: ((f: any) => void) | null = null,
      onCloseDiff: (() => void) | null = null,
      onOpenInDsh: ((filePath: string) => void) | null = null,
      headerCardsVisible: boolean = true,
      onToggleHeaderCards: (() => void) | null = null,
      onSelectPr: ((target: { number: number; repo: string }) => void) | null = null,
      // 必须追加在形参末尾：该函数有 17 个位置参数，插在中间会静默错位
      onSelectIssue: ((target: { number: number; repo: string }) => void) | null = null,
      /**
       * 状态筛选（默认 all）。
       * 为什么由组件传入而不是在本函数内 useState：本函数是每次渲染都重新执行的
       * 普通函数，内部调用 useState 会被 React 当成新的 Hook 序列直接抛错。
       * 状态必须住在 GithubRightbarBody 组件体内，这里只接收值与 setter。
       */
      prStateFilter: string = "all",
      issueStateFilter: string = "all",
      onChangePrFilter: ((v: string) => void) | null = null,
      onChangeIssueFilter: ((v: string) => void) | null = null
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

      // 仓库配置提示条：与网络告警互斥展示。
      // 仓库关了 Issues 时不该同时出现「网络连接失败」——那是两件性质相反的事
      // （一个是稳定配置事实，一个是瞬时传输故障）。有真网络错误时以错误优先。
      var repoNoticeBarEl = networkAlertBannerEl
        ? null
        : h(RepoNoticeBar, { isRightbar, notices: data?.notices });

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
          isRightbar && onToggleHeaderCards ? h(
            "button",
            {
              className: "dsh-github-btn-sm" + (!headerCardsVisible ? " active" : ""),
              onClick: onToggleHeaderCards,
              title: headerCardsVisible ? "收起上方仓库信息与快捷操作栏（增加下方工作区高度）" : "展开上方仓库信息与快捷操作栏",
              style: {
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                cursor: "pointer",
              },
              "aria-expanded": headerCardsVisible ? "true" : "false",
            },
            headerCardsVisible ? "🔼 收起" : "🔽 展开"
          ) : null,
          h(
            "button",
            {
              className: "dsh-github-refresh-btn",
              onClick: onRefresh,
              disabled: loading,
            },
            loading ? "刷新中..." : "🔄 刷新"
          ),
          (onOpenHelp || onOpenSettings) ? h(
            "button",
            {
              className: "dsh-github-btn-sm",
              onClick: () => (onOpenHelp ? onOpenHelp() : (onOpenSettings && onOpenSettings("help"))),
              title: "打开使用帮助与实战手册大窗口（Esc 可退出）",
              style: { padding: "4px 8px", fontSize: "12px" },
            },
            "❓"
          ) : null,
          onOpenSettings ? h(
            "button",
            {
              className: "dsh-github-btn-sm",
              onClick: () => onOpenSettings("sync"),
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

      // 徽章推导交给纯函数（src/ui/repo-badges.ts）：
      // 判定规则需要可断言，而写在 JSX 里只能靠「bundle 里有没有这个词」检查。
      var repoPresentation = resolveRepoBadges(repo);
      var forkLine = repoPresentation.forkLine;
      var toneClass = function (tone: string) {
        return tone === "yellow" ? "dsh-badge-readonly" : "dsh-badge-" + tone;
      };
      var repoBadgesEl = repoPresentation.badges.length > 0
        ? repoPresentation.badges.map(function (b: any, i: number) {
            return h(
              "span",
              {
                key: "repo-badge-" + i,
                className: "dsh-github-badge " + toneClass(b.tone),
                style: { fontSize: "10px", padding: "0 6px", lineHeight: "16px", flexShrink: 0 },
                title: b.title,
              },
              b.text
            );
          })
        : null;

      var associatedRepos = repo && Array.isArray(repo.associatedRepos) ? repo.associatedRepos : [];
      var myForkCandidate = associatedRepos.find(function (r: any) {
        return !r.isCurrent && r.role === 'fork';
      });
      var quickSwitchForkEl = myForkCandidate
        ? h(
            "div",
            { className: "dsh-github-fork-line", style: { color: "var(--dsw-alias-link, #0969da)" } },
            "⑂ 本地复刻仓库: ",
            h("strong", { style: { color: "inherit" } }, myForkCandidate.nameWithOwner),
            h(
              "a",
              {
                href: "#",
                className: "dsh-github-switch-quicklink",
                title: `切换默认基准仓库为 ${myForkCandidate.nameWithOwner}`,
                onClick: function (e: any) {
                  e.preventDefault();
                  fetch("/api/github/action", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "set_default_repo",
                      cwd,
                      repo: myForkCandidate.nameWithOwner,
                      remote: myForkCandidate.remoteName,
                    }),
                  })
                    .then(function (r) { return r.json(); })
                    .then(function (j) {
                      if (j && j.ok) {
                        if (typeof onShowToast === "function") onShowToast(`✅ 已切换为我的复刻: ${myForkCandidate.nameWithOwner}`);
                        onRefresh();
                      } else {
                        if (typeof onShowToast === "function") onShowToast(`❌ 切换失败: ${j.error || j.message || "未知错误"}`);
                      }
                    })
                    .catch(function (err) {
                      if (typeof onShowToast === "function") onShowToast(`❌ 切换请求异常: ${err?.message || err}`);
                    });
                },
              },
              "⇄ 设为当前基准仓库"
            )
          )
        : null;

      var repoCardEl = (function () {
        const activeForkLine = forkLine;
        return h(
        "div",
        { className: "dsh-github-card" },
        h(
          "div",
          { className: "dsh-github-card-title", style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          h("span", null, "当前工作区 GitHub 仓库"),
          repo && repo.stargazerCount !== undefined
            ? h(
                "a",
                {
                  href: `${repo.url}/stargazers`,
                  target: "_blank",
                  className: "dsh-github-badge",
                  style: {
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    fontWeight: 600,
                    fontSize: "11px",
                    cursor: "pointer",
                    padding: "1px 6px",
                  },
                  title: `当前仓库 Star 数量: ${repo.stargazerCount}（点击前往 GitHub 查看）`,
                },
                "⭐ ",
                String(repo.stargazerCount)
              )
            : null
        ),
        h(
          "div",
          { className: "dsh-github-card-value" },
          repo
            ? h("a", { href: repo.url, target: "_blank", className: "dsh-github-repo-link" }, repo.nameWithOwner)
            : h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)" } }, "未检测到关联的 GitHub 仓库"),
          repoBadgesEl,
          repo
            ? h(RepoSelectorDropdown, {
                associatedRepos: repo.associatedRepos,
                currentRepo: repo.nameWithOwner,
                cwd,
                onRepoSwitched: () => onRefresh(),
                showToast: onShowToast || (() => {}),
              })
            : null,
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
        // 快捷切换行：针对“当前展示源仓库但本地检测到个人复刻”的一键切换交互
        quickSwitchForkEl,
        // fork 血缘行：告诉用户「这个 fork 的上游是谁」，上游名可点击
        activeForkLine
          ? h(
              "div",
              { className: "dsh-github-fork-line" },
              "⑂ fork 自 ",
              h(
                "a",
                {
                  href: activeForkLine.parentUrl,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  title: `打开上游仓库 ${activeForkLine.parentNameWithOwner}`,
                },
                activeForkLine.parentNameWithOwner
              ),
              associatedRepos.some((r: any) => !r.isCurrent && r.nameWithOwner.toLowerCase() === activeForkLine.parentNameWithOwner.toLowerCase())
                ? h(
                    "a",
                    {
                      href: "#",
                      className: "dsh-github-switch-quicklink",
                      title: `切换为上游基准仓库 ${activeForkLine.parentNameWithOwner}`,
                      onClick: function (e: any) {
                        e.preventDefault();
                        fetch("/api/github/action", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "set_default_repo",
                            cwd,
                            repo: activeForkLine.parentNameWithOwner,
                            remote: "upstream",
                          }),
                        })
                          .then(function (r) { return r.json(); })
                          .then(function (j) {
                            if (j && j.ok) {
                              if (typeof onShowToast === "function") onShowToast(`✅ 已切为上游视角: ${activeForkLine.parentNameWithOwner}`);
                              onRefresh();
                            } else {
                              if (typeof onShowToast === "function") onShowToast(`❌ 切换失败: ${j.error || j.message || "未知错误"}`);
                            }
                          })
                          .catch(function (err) {
                            if (typeof onShowToast === "function") onShowToast(`❌ 切换请求异常: ${err?.message || err}`);
                          });
                      },
                    },
                    "⇄ 切为基准"
                  )
                : null
            )
          : null,
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
      })();

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

      var baseDirty = (gitSt && gitSt.dirtyFiles) || [];
      var extraDirty = (dirtyPagination && dirtyPagination.extraDirtyFiles) || [];
      var allDirtyFiles: any[] = [];
      var seenDirtyPaths = new Set();
      baseDirty.concat(extraDirty).forEach(function (f: any) {
        if (f && f.path && !seenDirtyPaths.has(f.path)) {
          seenDirtyPaths.add(f.path);
          allDirtyFiles.push(f);
        }
      });
      var visibleDirtyLimit = (dirtyPagination && dirtyPagination.visibleCount) || 15;
      var displayedDirty = allDirtyFiles.slice(0, visibleDirtyLimit);
      var totalDirtyCount = gitSt ? gitSt.dirtyCount : allDirtyFiles.length;
      var hasMoreDirtyToLoad = displayedDirty.length < totalDirtyCount;
      var dirtyHeaderTitle = gitSt && totalDirtyCount > displayedDirty.length
        ? `📁 未提交清单 (${displayedDirty.length} / ${totalDirtyCount})`
        : `📁 未提交清单 (${gitSt ? gitSt.dirtyCount : 0})`;

      var dirtySectionEl = activeDiffFile
        ? h(UncommittedDiffView, {
            file: activeDiffFile,
            onBack: onCloseDiff || (() => {}),
            cwd: cwd,
            onOpenInDsh: onOpenInDsh,
          })
        : h(
            "div",
            { className: "dsh-github-section" },
            h("div", { className: "dsh-github-section-header" }, h("h3", null, dirtyHeaderTitle)),
            !gitSt || gitSt.dirtyCount === 0
              ? h("div", { className: "dsh-github-empty" }, "工作区干净，没有未提交的变更 ✓")
              : h(
                  "div",
                  { style: { fontSize: "12px", lineHeight: "1.9" } },
                  displayedDirty.map(function (f: any, i: number) {
                    var statusColor = f.status === "??" ? "var(--dsw-alias-state-success-primary, #1a7f37)"
                      : f.status.indexOf("D") >= 0 ? "var(--dsw-alias-state-error-primary, #cf222e)"
                      : f.status.indexOf("M") >= 0 || f.status.indexOf("R") >= 0 ? "var(--dsw-alias-state-attention-primary, #9a6700)"
                      : "inherit";
                    var statusText = f.status === "??" ? "未跟踪新增"
                      : f.status.indexOf("D") >= 0 ? "已删除"
                      : f.status.indexOf("R") >= 0 ? "已重命名"
                      : "已修改";
                    return h(
                      "div",
                      {
                        key: f.path || i,
                        className: "dsh-github-dirty-item",
                        title: `${f.path} (${statusText} [${f.status}])\n点击查看代码改动对比 (Unified Diff)`,
                        onClick: function () {
                          if (typeof onSelectDiffFile === "function") {
                            onSelectDiffFile(f);
                          }
                        },
                      },
                      h("span", {
                        style: {
                          minWidth: "24px",
                          textAlign: "center",
                          opacity: 0.85,
                          fontSize: "11px",
                          fontFamily: "monospace",
                          color: statusColor,
                          fontWeight: 600,
                        },
                      }, f.status === "??" ? "??" : f.status),
                      h("span", { style: { wordBreak: "break-all", flex: 1, fontSize: "12px" } }, f.path)
                    );
                  }),
                  hasMoreDirtyToLoad
                    ? h(
                        "div",
                        { style: { marginTop: "10px", textAlign: "center" } },
                        dirtyPagination?.loadingMore
                          ? h("div", { style: { fontSize: "11px", opacity: 0.75, padding: "6px 0" } }, "⏳ 正在加载更多未提交变更…")
                          : h(
                              "div",
                              {
                                style: {
                                  fontSize: "11px",
                                  opacity: 0.7,
                                  padding: "6px 0",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px",
                                  cursor: "pointer",
                                  borderRadius: "4px",
                                },
                                title: "向下滑动滚轮或点击加载更多",
                                onClick: function () {
                                  if (dirtyPagination && typeof dirtyPagination.onLoadMore === "function") {
                                    dirtyPagination.onLoadMore();
                                  }
                                },
                              },
                              h("span", null, "⬇️ 向下滑动自动加载"),
                              h("span", { style: { fontFamily: "monospace" } }, `(${displayedDirty.length} / ${totalDirtyCount})`)
                            )
                      )
                    : totalDirtyCount > 15
                    ? h(
                        "div",
                        { style: { textAlign: "center", fontSize: "11px", opacity: 0.5, padding: "6px 0", marginTop: "8px" } },
                        `✓ 已加载全部 ${totalDirtyCount} 个未提交变更`
                      )
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

      /*
       * PR 状态分组统计与筛选。
       *
       * 为什么计数必须在过滤之前算：胶囊上的数字要让用户知道「切过去有几条」，
       * 用过滤后的列表长度会得到「点了 Merged 之后 Open 显示 0」这种废信息。
       */
      var prByState = { open: 0, merged: 0, closed: 0 } as Record<string, number>;
      prs.forEach(function (pr: any) {
        var s = String(pr.state || "").toLowerCase();
        if (s === "open" || s === "merged" || s === "closed") prByState[s]++;
      });
      var filteredPrs = prs.filter(function (pr: any) {
        if (prStateFilter === "all") return true;
        // 未知状态（旧快照缺 state）只出现在「全部」里，不会被误塞进具体档
        return String(pr.state || "").toLowerCase() === prStateFilter;
      });

      // 空态文案要给人看，不能把内部档位键（merged）直接抛给用户
      var PR_STATE_LABEL: Record<string, string> = { all: "全部", open: "Open", merged: "Merged", closed: "Closed" };
      var prFilterLabel = PR_STATE_LABEL[prStateFilter] || "全部";

      var prPillsEl = h(
        "div",
        { className: "dsh-github-pills" },
        h(
          "button",
          { className: `dsh-github-pill-btn ${prStateFilter === "all" ? "active" : ""}`, "aria-pressed": prStateFilter === "all" ? "true" : "false", onClick: () => onChangePrFilter && onChangePrFilter("all") },
          `全部 (${prs.length})`
        ),
        h(
          "button",
          { className: `dsh-github-pill-btn ${prStateFilter === "open" ? "active" : ""}`, "aria-pressed": prStateFilter === "open" ? "true" : "false", onClick: () => onChangePrFilter && onChangePrFilter("open") },
          `🟢 Open (${prByState.open})`
        ),
        h(
          "button",
          { className: `dsh-github-pill-btn ${prStateFilter === "merged" ? "active" : ""}`, "aria-pressed": prStateFilter === "merged" ? "true" : "false", onClick: () => onChangePrFilter && onChangePrFilter("merged") },
          `🟣 Merged (${prByState.merged})`
        ),
        h(
          "button",
          { className: `dsh-github-pill-btn ${prStateFilter === "closed" ? "active" : ""}`, "aria-pressed": prStateFilter === "closed" ? "true" : "false", onClick: () => onChangePrFilter && onChangePrFilter("closed") },
          `⚪ Closed (${prByState.closed})`
        )
      );

      // 空态必须区分「仓库确实没有」与「当前筛选下没有」——否则用户会把筛空当成数据丢失
      var prEmptyEl = prs.length === 0
        ? h("div", { className: "dsh-github-empty" }, "该仓库暂无 Pull Request 记录")
        : h("div", { className: "dsh-github-empty" }, `当前筛选「${prFilterLabel}」下无结果，共 ${prs.length} 条记录（切换到「全部」查看）`);

      var prSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h("div", { className: "dsh-github-section-header" }, h("h3", null, `🔀 Pull Requests (${filteredPrs.length}/${prs.length})`)),
        prPillsEl,
        // 触顶提示：让用户知道列表被截断了，而不是以为历史 PR 凭空消失
        data && data.prsTruncated
          ? h("div", {
              style: {
                margin: "0 0 10px 0",
                padding: "6px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                lineHeight: 1.5,
                background: "rgba(210, 153, 34, 0.12)",
                border: "1px solid rgba(210, 153, 34, 0.35)",
                color: "var(--dsw-alias-state-attention-primary, #9a6700)",
              },
            }, `⚠️ 仅显示最近 ${prs.length} 条 PR（已触及检索上限）。更早的记录请到 GitHub 查看。`)
          : null,
        filteredPrs.length === 0
          ? prEmptyEl
          : h(
              "div",
              { className: "dsh-github-list" },
              filteredPrs.map((pr: any) => {
                var ci = rollupCiStatus(pr.statusCheckRollup);
                var rv = reviewDecisionBadge(pr.reviewDecision);
                var relTime = formatRelativeTime(pr.updatedAt);
                // 点击卡片 → 在线审阅弹窗；标题旁 ↗ 保留浏览器直达（stopPropagation 防冒泡）
                return h(
                  "div",
                  {
                    key: pr.number,
                    className: "dsh-github-item",
                    style: onSelectPr ? { cursor: "pointer" } : undefined,
                    title: onSelectPr ? "点击在线审阅该 PR（描述 / 评论 / 文件 Diff）" : undefined,
                    onClick: onSelectPr
                      ? function () {
                          onSelectPr({ number: Number(pr.number), repo: repo?.nameWithOwner || "" });
                        }
                      : undefined,
                  },
                  // 标题与跳转按钮必须同行：.dsh-github-item 本身是竖排 flex，
                  // 直接放按钮会让它独占一行、只剩一个裸 ↗ 字符（曾经的丑样）。
                  h(
                    "div",
                    { className: "dsh-github-pr-title-row" },
                    h("span", {
                      className: "dsh-github-item-title",
                      title: relTime ? `更新于 ${pr.updatedAt}（点击在线审阅）` : "点击在线审阅该 PR",
                    }, `${pr.isDraft ? "⚪ " : ""}#${pr.number} ${pr.title}`),
                    // 独立的浏览器直达入口：文字标签 + 边框，明确表达「外部跳转」
                    h("a", {
                      className: "dsh-github-pr-gh-btn",
                      href: pr.url,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      onClick: (e: any) => e.stopPropagation(),
                      title: "在浏览器打开该 PR（不进入在线审阅）",
                    }, "GitHub ↗")
                  ),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `${pr.headRefName} → ${pr.baseRefName}`),
                    // 状态徽章：与主面板保持一致，否则同一 PR 在两处显示不同信息。
                    // 状态→色调的映射来自 src/shared/state-badges.ts（服务端 CLI 输出用同一份），
                    // tone 直接就是 CSS 后缀，这里不再自己判 state。
                    (() => {
                      var b = prStateBadge(pr.state);
                      // neutral = 未知状态：旧实现对这些值不渲染徽章，保持一致
                      if (!b || b.tone === "neutral") return null;
                      return h("span", { className: "dsh-github-badge dsh-badge-" + b.tone }, b.label);
                    })(),
                    pr.mergeable === "CONFLICTING"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "代码冲突")
                      : h("span", { className: "dsh-github-badge dsh-badge-green" }, "可合并"),
                    (() => {
                      // 命中判定保持旧白名单（只有 fail/pending/pass 渲染），
                      // 色调与文案则复用共享映射，避免同一状态两处颜色不一致
                      if (ci !== "fail" && ci !== "pending" && ci !== "pass") return null;
                      var cb = ciBadge(undefined, ci);
                      if (!cb) return null;
                      var text = ci === "fail" ? "❌ CI 失败" : ci === "pending" ? "⏳ CI 运行中" : "✅ CI 通过";
                      return h("span", { className: "dsh-github-badge dsh-badge-" + cb.tone }, text);
                    })(),
                    rv
                      ? h("span", { className: `dsh-github-badge dsh-badge-${rv.kind}` }, rv.text)
                      : null,
                    relTime ? h("span", null, relTime) : null
                  )
                );
              })
            )
      );

      // Issue 状态分组统计与筛选（与 PR 同一套口径：先统计全量再过滤）
      var issueByState = { open: 0, closed: 0 } as Record<string, number>;
      issues.forEach(function (issue: any) {
        var s = String(issue.state || "").toLowerCase();
        if (s === "open" || s === "closed") issueByState[s]++;
      });
      var filteredIssues = issues.filter(function (issue: any) {
        if (issueStateFilter === "all") return true;
        return String(issue.state || "").toLowerCase() === issueStateFilter;
      });

      var ISSUE_STATE_LABEL: Record<string, string> = { all: "全部", open: "Open", closed: "Closed" };
      var issueFilterLabel = ISSUE_STATE_LABEL[issueStateFilter] || "全部";

      var issuePillsEl = h(
        "div",
        { className: "dsh-github-pills" },
        h(
          "button",
          { className: `dsh-github-pill-btn ${issueStateFilter === "all" ? "active" : ""}`, "aria-pressed": issueStateFilter === "all" ? "true" : "false", onClick: () => onChangeIssueFilter && onChangeIssueFilter("all") },
          `全部 (${issues.length})`
        ),
        h(
          "button",
          { className: `dsh-github-pill-btn ${issueStateFilter === "open" ? "active" : ""}`, "aria-pressed": issueStateFilter === "open" ? "true" : "false", onClick: () => onChangeIssueFilter && onChangeIssueFilter("open") },
          `🟢 Open (${issueByState.open})`
        ),
        h(
          "button",
          { className: `dsh-github-pill-btn ${issueStateFilter === "closed" ? "active" : ""}`, "aria-pressed": issueStateFilter === "closed" ? "true" : "false", onClick: () => onChangeIssueFilter && onChangeIssueFilter("closed") },
          `⚪ Closed (${issueByState.closed})`
        )
      );

      var issueEmptyEl = issues.length === 0
        ? h("div", { className: "dsh-github-empty" }, "该仓库暂无 Issue 记录")
        : h("div", { className: "dsh-github-empty" }, `当前筛选「${issueFilterLabel}」下无结果，共 ${issues.length} 条记录（切换到「全部」查看）`);

      var issueSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h(
          "div",
          { className: "dsh-github-section-header" },
          h("h3", null, `📋 仓库 Issues (${filteredIssues.length}/${issues.length})`),
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
        issuePillsEl,
        data && data.issuesTruncated
          ? h("div", {
              style: {
                margin: "0 0 10px 0",
                padding: "6px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                lineHeight: 1.5,
                background: "rgba(210, 153, 34, 0.12)",
                border: "1px solid rgba(210, 153, 34, 0.35)",
                color: "var(--dsw-alias-state-attention-primary, #9a6700)",
              },
            }, `⚠️ 仅显示最近 ${issues.length} 条 Issue（已触及检索上限）。更早的记录请到 GitHub 查看。`)
          : null,
        filteredIssues.length === 0
          ? issueEmptyEl
          : h(
              "div",
              { className: "dsh-github-list" },
              filteredIssues.map((issue: any) => {
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
                  {
                    key: issue.number,
                    className: "dsh-github-item",
                    // 只加 cursor：内联 display:flex 会顶掉 .dsh-github-item 的 column 布局
                    style: onSelectIssue ? { cursor: "pointer" } : undefined,
                    title: onSelectIssue ? "点击在线查看该 Issue（正文 / 评论时间线 / 标签与里程碑）" : undefined,
                    onClick: onSelectIssue
                      ? function () {
                          onSelectIssue({ number: Number(issue.number), repo: repo?.nameWithOwner || "" });
                        }
                      : undefined,
                  },
                  // 标题行：标题 → 分类徽章 → 状态徽章 → GitHub 外跳，同一行
                  h(
                    "div",
                    { className: "dsh-github-pr-title-row" },
                    h("span", {
                      className: "dsh-github-item-title",
                      title: onSelectIssue ? "点击在线查看该 Issue" : undefined,
                    }, `#${issue.number} ${issue.title}`),
                    ...badges,
                    (() => {
                      var s = String(issue.state || "").toUpperCase();
                      if (s === "CLOSED") return h("span", { className: "dsh-github-badge dsh-badge-red" }, "CLOSED");
                      if (s === "OPEN") return h("span", { className: "dsh-github-badge dsh-badge-green" }, "OPEN");
                      return null;
                    })(),
                    h(
                      "a",
                      {
                        className: "dsh-github-pr-gh-btn",
                        href: issue.url,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        onClick: (e: any) => e.stopPropagation(),
                        title: "在浏览器打开该 Issue（不进入在线查看）",
                      },
                      "GitHub ↗"
                    )
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
        var rightbar = container.closest(".dsh-github-rightbar-container");
        if (rightbar) {
          rightbar.setAttribute("data-active-tab", tabKey);
        }
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

      return [
        headerEl,
        networkAlertBannerEl,
        repoNoticeBarEl,
        upgradeBannerEl,
        authGuideEl,
        headerCardsVisible ? repoCardEl : null,
        headerCardsVisible ? actionsBarEl : null,
        tabbedContentEl,
      ].filter(Boolean);
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
              // 失败响应也可能携带「本次新鲜解析」的仓库身份与认证态（后端在
              // 回退旧快照时已用新鲜 repo 覆盖旧值）。身份字段永远采纳，
              // 业务列表才走「非空才覆盖」的防冲刷策略。
              //
              // 为什么必须拆开：旧逻辑把「要不要整体替换」和「列表是否有内容」
              // 绑在一起，于是仓库身份修正会被空列表连坐否决——用户换了 remote
              // 之后面板永远显示旧仓库，刷新也救不回来。
              var curData = dataRef.current;
              if (curData) {
                var hasFreshList = (json.data.pullRequests?.length > 0 || json.data.issues?.length > 0);
                setData(function (prev: any) {
                  if (!prev) return json.data;
                  var merged = {
                    ...prev,
                    // 身份 / 认证 / 通知：始终采纳最新（这些字段不可能是「空数据假象」）
                    repo: json.data.repo || prev.repo,
                    auth: json.data.auth || prev.auth,
                    notices: json.data.notices,
                    updateInfo: json.data.updateInfo || prev.updateInfo,
                    lastUpdated: json.data.lastUpdated || prev.lastUpdated,
                  };
                  // 业务列表：仅有新内容时才替换，防止把「好数据」冲刷成空数组
                  if (hasFreshList) {
                    merged.pullRequests = json.data.pullRequests;
                    merged.issues = json.data.issues;
                    merged.issueStats = json.data.issueStats;
                  }
                  if (json.data.runs?.length > 0) {
                    merged.runs = json.data.runs;
                  }
                  return merged;
                });
              } else {
                setData(json.data);
              }
              if (forceRefresh) {
                showToast("❌ 刷新失败：" + failReason);
              }
            } else {
              setData(json.data);
              // 落快照前统一判定：带离线标记的数据不写（saveStoredRightbarData 内部还有一道），
              // 且身份变更后的快照会覆盖旧键——localStorage 的 key 是 cwd，天然随路径对齐。
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
      var [helpModalOpen, setHelpModalOpen] = React.useState(false);
      var [selectedCommit, setSelectedCommit] = React.useState(null as any);
      // PR 在线审阅弹窗状态：{ number, repo }；为 null 时不挂载弹窗（零常驻开销）
      var [activePr, setActivePr] = React.useState(null as { number: number; repo: string } | null);
      // Issue 在线查看弹窗状态：与 PR 同构
      var [activeIssue, setActiveIssue] = React.useState(null as { number: number; repo: string } | null);
      var [extraCommits, setExtraCommits] = React.useState([] as any[]);
      var [loadingMore, setLoadingMore] = React.useState(false);
      var [hasMoreCommits, setHasMoreCommits] = React.useState(true);

      var [visibleDirtyCount, setVisibleDirtyCount] = React.useState(15);
      var [extraDirtyFiles, setExtraDirtyFiles] = React.useState([] as any[]);
      var [loadingMoreDirty, setLoadingMoreDirty] = React.useState(false);
      var [hasMoreDirty, setHasMoreDirty] = React.useState(true);
      var [activeDiffFile, setActiveDiffFile] = React.useState(null as any);
      var [headerCardsVisible, setHeaderCardsVisible] = React.useState(() => getStoredHeaderCardsVisible());
      /*
       * 状态筛选：默认 all（= 能看见 closed/merged）。
       * 初值来自按 cwd 隔离的本地偏好，切仓库时在下面的 effect 里重新对齐。
       * 放在这里而不是 renderGithubRepoView 内部：那是普通函数，
       * 每次渲染都会重新执行，函数内 useState 会被当成新的 Hook 序列直接抛错。
       */
      var [prStateFilter, setPrStateFilter] = React.useState(() => getStoredRightbarStateFilter(cwd).pr);
      var [issueStateFilter, setIssueStateFilter] = React.useState(() => getStoredRightbarStateFilter(cwd).issue);

      var changePrFilter = React.useCallback(function (v: string) {
        if (PR_STATE_FILTERS.indexOf(v) < 0) return;
        setPrStateFilter(v);
        saveStoredRightbarStateFilter(cwd, { pr: v });
      }, [cwd]);

      var changeIssueFilter = React.useCallback(function (v: string) {
        if (ISSUE_STATE_FILTERS.indexOf(v) < 0) return;
        setIssueStateFilter(v);
        saveStoredRightbarStateFilter(cwd, { issue: v });
      }, [cwd]);

      var toggleHeaderCards = React.useCallback(() => {
        setHeaderCardsVisible(function (prev: boolean) {
          var next = !prev;
          saveStoredHeaderCardsVisible(next);
          return next;
        });
      }, []);

      React.useEffect(function () {
        setExtraCommits([]);
        setHasMoreCommits(true);
        setExtraDirtyFiles([]);
        setVisibleDirtyCount(15);
        setHasMoreDirty(true);
        setActiveDiffFile(null);
      }, [cwd, data]);

      /*
       * 切仓库时把筛选对齐到该仓库自己的偏好。
       *
       * 只依赖 cwd：若依赖 data 会在每次数据刷新时把用户刚点的筛选重置回上次
       * 落盘值——用户点「Merged」后恰逢后台 SWR 拉新，选择立刻跳回「全部」。
       */
      React.useEffect(function () {
        var stored = getStoredRightbarStateFilter(cwd);
        setPrStateFilter(stored.pr);
        setIssueStateFilter(stored.issue);
      }, [cwd]);

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

      var loadMoreDirtyFiles = function () {
        if (loadingMoreDirty) return;
        var total = data?.gitStatus?.dirtyCount || 0;
        var baseFiles = data?.gitStatus?.dirtyFiles || [];
        var loadedCount = baseFiles.length + extraDirtyFiles.length;

        // 若当前已持有的文件列表中还有未展示的内容，按 15 条步长递增展示窗口（0ms 纯前端瞬时响应）
        if (visibleDirtyCount < loadedCount) {
          setVisibleDirtyCount(function (prev: number) {
            return Math.min(prev + 15, loadedCount);
          });
          return;
        }

        // 若当前已展示数已经达到总数，说明全量全部展示完毕，无需发起请求
        if (visibleDirtyCount >= total && total > 0) {
          setHasMoreDirty(false);
          return;
        }

        // 仅在当前已知条数小于总数时向后端增量拉取后续条目
        setLoadingMoreDirty(true);
        var skip = loadedCount;
        var limit = 15;
        var url = "/api/github/uncommitted-files?limit=" + limit + "&skip=" + skip + (cwd ? "&cwd=" + encodeURIComponent(cwd) : "");

        var fetchWithFallback = async function () {
          try {
            var r = await fetch(url);
            if (r.status === 404) {
              // 自动无缝降级走常驻端点 /api/github/action
              r = await fetch("/api/github/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "get_uncommitted_files",
                  limit: limit,
                  skip: skip,
                  cwd: cwd || undefined,
                }),
              });
            }
            if (!r.ok) {
              setLoadingMoreDirty(false);
              return;
            }
            var j = await r.json().catch(function () { return null; });
            setLoadingMoreDirty(false);
            if (j && j.ok && j.data && Array.isArray(j.data.items)) {
              if (j.data.items.length === 0) {
                setHasMoreDirty(false);
              } else {
                setExtraDirtyFiles(function (prev: any[]) {
                  return prev.concat(j.data.items);
                });
                setVisibleDirtyCount(function (prev: number) {
                  return prev + j.data.items.length;
                });
                if (!j.data.hasMore || (loadedCount + j.data.items.length) >= total) {
                  setHasMoreDirty(false);
                }
              }
            } else {
              setHasMoreDirty(false);
            }
          } catch (e) {
            setLoadingMoreDirty(false);
          }
        };

        fetchWithFallback();
      };

      React.useEffect(function () {
        var el = containerRef && containerRef.current;
        if (!el) return;
        var onScroll = function () {
          var activeBtn = el.querySelector(".dsh-github-tab-btn.active");
          var activeTab = activeBtn ? activeBtn.getAttribute("data-tab-btn") : (el.getAttribute("data-active-tab") || "git");
          var threshold = 120;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
            if (activeTab === "git") {
              loadMoreCommits();
            } else if (activeTab === "dirty") {
              loadMoreDirtyFiles();
            }
          }
        };

        // 监听鼠标滚轮向下滚事件（即使用户收起卡片导致内容暂未撑出滚动条，只要向下滚轮也能瞬间响应！）
        var onWheel = function (e: any) {
          if (!e || e.deltaY <= 0) return;
          var activeBtn = el.querySelector(".dsh-github-tab-btn.active");
          var activeTab = activeBtn ? activeBtn.getAttribute("data-tab-btn") : (el.getAttribute("data-active-tab") || "git");
          var threshold = 120;
          var atBottom = (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) || (el.scrollHeight <= el.clientHeight + 40);
          if (atBottom) {
            if (activeTab === "git") {
              loadMoreCommits();
            } else if (activeTab === "dirty") {
              loadMoreDirtyFiles();
            }
          }
        };

        el.addEventListener("scroll", onScroll, { passive: true });
        el.addEventListener("wheel", onWheel, { passive: true });
        return function () {
          el.removeEventListener("scroll", onScroll);
          el.removeEventListener("wheel", onWheel);
        };
      }, [data, extraCommits, loadingMore, hasMoreCommits, cwd, extraDirtyFiles, loadingMoreDirty, hasMoreDirty, visibleDirtyCount, headerCardsVisible]);

      // 视口充盈智能自适应：当用户点击收起卡片导致页面变矮、未能产生滚动条时，自动将后续条目拉取补齐！
      React.useEffect(function () {
        var el = containerRef && containerRef.current;
        if (!el) return;
        var timer = setTimeout(function () {
          var activeBtn = el.querySelector(".dsh-github-tab-btn.active");
          var activeTab = activeBtn ? activeBtn.getAttribute("data-tab-btn") : (el.getAttribute("data-active-tab") || "git");
          if (activeTab === "dirty") {
            var total = data?.gitStatus?.dirtyCount || 0;
            var hasMore = total > 0 && visibleDirtyCount < total;
            if (hasMore && el.scrollHeight <= el.clientHeight + 60) {
              loadMoreDirtyFiles();
            }
          }
        }, 120);
        return function () { clearTimeout(timer); };
      }, [headerCardsVisible, visibleDirtyCount, data]);

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

      var openRightbarSettings = (section?: string) => {
        if (section) {
          setRightbarModalSection(section);
        } else {
          setRightbarModalSection("sync");
        }
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

      var openFileInDsh = function (f: any) {
        if (!f || !f.path) return;
        try {
          var rel = f.path.replace(/\\/g, "/");
          var address = "dsh-resource://file/session/" + encodeURIComponent(sessionId || "") + "/" + encodeURIComponent(rel);
          var activeCtx = props?.ctx || currentPluginCtx;
          if (activeCtx && activeCtx.sidebarRight && typeof activeCtx.sidebarRight.openResource === "function") {
            activeCtx.sidebarRight.openResource(address);
          } else {
            window.dispatchEvent(new CustomEvent("dsh-open-file", { detail: { path: f.path, cwd: cwd, sessionId: sessionId } }));
          }
        } catch (e) {}
      };

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
          showToast,
          () => setHelpModalOpen(true),
          openFileInDsh,
          {
            visibleCount: visibleDirtyCount,
            extraDirtyFiles: extraDirtyFiles,
            loadingMore: loadingMoreDirty,
            hasMore: hasMoreDirty,
            onLoadMore: loadMoreDirtyFiles,
          },
          activeDiffFile,
          (f: any) => setActiveDiffFile(f),
          () => setActiveDiffFile(null),
          openFileInDsh,
          headerCardsVisible,
          toggleHeaderCards,
          (target: { number: number; repo: string }) => setActivePr(target),
          (target: { number: number; repo: string }) => setActiveIssue(target),
          prStateFilter,
          issueStateFilter,
          changePrFilter,
          changeIssueFilter
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
        h(GithubHelpModal, {
          isOpen: helpModalOpen,
          onClose: () => setHelpModalOpen(false),
        }),
        selectedCommit
          ? h(CommitDetailModal, {
              commit: selectedCommit,
              onClose: function () { setSelectedCommit(null); },
              cwd: cwd,
            })
          : null,
        activePr
          ? h(PrDetailModal, {
              prNumber: activePr.number,
              repoNameWithOwner: activePr.repo,
              cwd: cwd,
              onClose: function () { setActivePr(null); },
              showToast: showToast,
            })
          : null,
        activeIssue
          ? h(IssueDetailModal, {
              issueNumber: activeIssue.number,
              repoNameWithOwner: activeIssue.repo,
              cwd: cwd,
              onClose: function () { setActiveIssue(null); },
              showToast: showToast,
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

    var inject = ["slots", "sidebarRightTabs", "sessions", "layout", "theme", "sidebarRight"];

    function apply(ctx: any) {
      currentPluginCtx = ctx;
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
