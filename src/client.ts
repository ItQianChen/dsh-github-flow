declare global {
  interface Window {
    __ModuleLoader__: {
      load(options: { id: string; factory: (require: any) => any }): void;
    };
  }
}

window.__ModuleLoader__.load({
  id: "dsh-github-flow",
  factory: (require: any) => {
    var module = { exports: {} as any };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    var GITHUB_PANEL_CSS = `
.dsh-github-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary, #8c8c8c);
  transition: color 0.15s ease;
}
.dsh-github-icon:hover {
  color: var(--dsw-alias-label-primary, #ffffff);
}
.dsh-github-icon svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

/* 右侧栏专属容器 (Right Sidebar Container) */
.dsh-github-rightbar-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 16px 18px;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-primary, #1e1e20);
  color: var(--dsw-alias-label-primary, #ececec);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* 顶部与通用面板 */
.dsh-github-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 24px 32px;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-primary, #1e1e20);
  color: var(--dsw-alias-label-primary, #ececec);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.dsh-github-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #333336);
}
.dsh-github-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dsh-github-title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.dsh-github-refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1, #444);
  background: var(--dsw-alias-bg-secondary, #2a2a2e);
  color: var(--dsw-alias-label-primary, #fff);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-refresh-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, #333);
}

/* 概览卡片区 */
.dsh-github-card {
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #38383c);
  background: var(--dsw-alias-bg-secondary, #252528);
  margin-bottom: 14px;
}
.dsh-github-card-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dsw-alias-label-tertiary, #888);
  margin-bottom: 6px;
}
.dsh-github-card-value {
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.dsh-github-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}
.dsh-badge-green { background: rgba(46, 160, 67, 0.2); color: #3fb950; }
.dsh-badge-red { background: rgba(248, 81, 73, 0.2); color: #f85149; }
.dsh-badge-yellow { background: rgba(210, 153, 34, 0.2); color: #d29922; }

/* 快捷操作网格按钮 */
.dsh-github-quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}
.dsh-github-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1, #444);
  background: var(--dsw-alias-bg-secondary, #28282b);
  color: var(--dsw-alias-label-primary, #fff);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-action-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, #343438);
  border-color: #58a6ff;
}

/* 列表条目 */
.dsh-github-section {
  margin-bottom: 18px;
}
.dsh-github-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.dsh-github-section-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #ccc);
}
.dsh-github-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-github-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1, #333336);
  background: var(--dsw-alias-bg-secondary, #252528);
}
.dsh-github-item:hover {
  border-color: var(--dsw-alias-border-l2, #555);
}
.dsh-github-item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #fff);
  text-decoration: none;
}
.dsh-github-item-title:hover {
  text-decoration: underline;
}
.dsh-github-item-meta {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #8c8c8c);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dsh-github-empty {
  padding: 18px;
  text-align: center;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #666);
  border: 1px dashed var(--dsw-alias-border-l1, #333);
  border-radius: 6px;
}
`;

    function injectStyles() {
      var styleId = "dsh-plugin-github-styles";
      if (document.getElementById(styleId)) return () => {};
      var style = document.createElement("style");
      style.id = styleId;
      style.textContent = GITHUB_PANEL_CSS;
      document.head.appendChild(style);
      return () => style.remove();
    }

    // 渲染 GitHub 仓库信息与操作视图的核心函数
    function renderGithubRepoView(h: any, data: any, loading: boolean, error: string | null, onRefresh: () => void, isRightbar: boolean = false) {
      var auth = data ? data.auth : null;
      var repo = data ? data.repo : null;
      var prs = (data && data.pullRequests) || [];
      var runs = (data && data.runs) || [];

      var headerEl = h(
        "div",
        { className: "dsh-github-header" },
        h(
          "div",
          { className: "dsh-github-title" },
          h("span", { style: { fontSize: isRightbar ? "18px" : "22px" } }, "🐙"),
          h("h2", null, isRightbar ? "GitHub 仓库" : "GitHub 工作台")
        ),
        h(
          "button",
          {
            className: "dsh-github-refresh-btn",
            onClick: onRefresh,
            disabled: loading,
          },
          loading ? "刷新中..." : "🔄 刷新"
        )
      );

      // 操作执行函数
      const runAction = async (action: string, extra: any = {}) => {
        try {
          const res = await fetch("/api/github/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, ...extra }),
          });
          const json = await res.json();
          alert(json.ok ? `✅ ${json.message || "操作已完成"}` : `❌ ${json.error || "操作失败"}`);
          if (json.ok) onRefresh();
        } catch (err: any) {
          alert(`网络异常: ${err.message}`);
        }
      };

      // 仓库基础卡片
      var repoCardEl = h(
        "div",
        { className: "dsh-github-card" },
        h("div", { className: "dsh-github-card-title" }, "当前工作区 GitHub 仓库"),
        h(
          "div",
          { className: "dsh-github-card-value" },
          repo
            ? h("a", { href: repo.url, target: "_blank", style: { color: "#58a6ff", textDecoration: "none" } }, repo.nameWithOwner)
            : h("span", { style: { color: "#f85149" } }, "未检测到关联的 GitHub 仓库"),
          repo ? h("span", { className: "dsh-github-badge dsh-badge-green" }, repo.defaultBranch) : null
        ),
        repo && repo.description
          ? h("div", { style: { fontSize: "12px", color: "#bbb", marginTop: "4px" } }, repo.description)
          : null,
        auth && auth.loggedIn
          ? h("div", { style: { fontSize: "11px", color: "#888", marginTop: "6px" } }, `CLI 认证账号: ${auth.user} (${auth.scopes?.join(", ") || "已登录"})`)
          : null,
        !repo
          ? h("div", { style: { fontSize: "11px", color: "#888", marginTop: "6px" } }, "若本地已有 git 仓库，请运行 `git remote add github <url>` 或 `git remote add origin <url>` 关联远程仓库。")
          : null
      );

      // 快捷操作栏
      var actionsBarEl = h(
        "div",
        { className: "dsh-github-quick-actions" },
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            onClick: () => {
              if (repo?.url) runAction("open_browser", { url: repo.url });
              else alert("当前工作区尚未关联 GitHub 仓库");
            },
          },
          "🌐 浏览器打开"
        ),
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            onClick: () => {
              if (repo?.url) runAction("open_browser", { url: `${repo.url}/pulls` });
              else alert("当前工作区尚未关联 GitHub 仓库");
            },
          },
          "🔀 查看所有 PRs"
        ),
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            onClick: () => {
              var title = prompt("请输入要创建的 PR 标题:");
              if (title) runAction("create_pr", { title });
            },
          },
          "🚀 快速创建 PR"
        ),
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            onClick: () => {
              var title = prompt("请输入 Issue 标题:");
              if (title) runAction("create_issue", { title });
            },
          },
          "📝 新建 Issue"
        )
      );

      // PR 列表
      var prSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h("div", { className: "dsh-github-section-header" }, h("h3", null, `🔀 Pull Requests (${prs.length})`)),
        prs.length === 0
          ? h("div", { className: "dsh-github-empty" }, "当前无开放中的 PR")
          : h(
              "div",
              { className: "dsh-github-list" },
              prs.map((pr: any) =>
                h(
                  "div",
                  { key: pr.number, className: "dsh-github-item" },
                  h("a", { className: "dsh-github-item-title", href: pr.url, target: "_blank" }, `#${pr.number} ${pr.title}`),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `${pr.headRefName} → ${pr.baseRefName}`),
                    pr.mergeable === "CONFLICTING"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "代码冲突")
                      : h("span", { className: "dsh-github-badge dsh-badge-green" }, "可合并")
                  )
                )
              )
            )
      );

      // Actions 流水线
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
                  h("a", { className: "dsh-github-item-title", href: r.url, target: "_blank" }, r.name),
                  h(
                    "div",
                    { className: "dsh-github-item-meta" },
                    h("span", null, `分支: ${r.headBranch}`),
                    r.conclusion === "success"
                      ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "✓ 成功")
                      : r.conclusion === "failure"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "✕ 失败")
                      : h("span", { className: "dsh-github-badge dsh-badge-yellow" }, r.status)
                  )
                )
              )
            )
      );

      return [headerEl, repoCardEl, actionsBarEl, prSectionEl, runSectionEl];
    }

    // 1. 右侧栏专属视图 (Right Sidebar Tab Body)
    function GithubRightbarBody(props: any) {
      var [loading, setLoading] = React.useState(true);
      var [data, setData] = React.useState(null as any);
      var [error, setError] = React.useState(null as string | null);

      // 核心：直接从会话 Props 拿到真实物理工作区路径！
      var cwd: string | null = null;
      if (props && props.useSessions && props.sessionId) {
        try {
          cwd = props.useSessions((sessions: any) => sessions?.byId?.[props.sessionId]?.cwd);
        } catch (e) {}
      }

      var loadData = React.useCallback(async (forceRefresh = false) => {
        setLoading(true);
        setError(null);
        try {
          if (forceRefresh) {
            await fetch("/api/github/refresh", { method: "POST" }).catch(() => {});
          }
          var url = "/api/github/overview";
          if (cwd) {
            url += "?cwd=" + encodeURIComponent(cwd);
          }
          var res = await fetch(url);
          var json = await res.json();
          if (json.ok && json.data) {
            setData(json.data);
          } else {
            setError(json.error || "获取状态失败");
          }
        } catch (err: any) {
          setError(err.message || "网络异常");
        } finally {
          setLoading(false);
        }
      }, [cwd]);

      React.useEffect(() => {
        loadData(false);
      }, [loadData]);

      var h = React.createElement;
      return h(
        "div",
        { className: "dsh-github-rightbar-container" },
        ...renderGithubRepoView(h, data, loading, error, () => loadData(true), true)
      );
    }

    // 2. 右侧栏 Tab 标题组件
    function GithubRightbarTitle() {
      var h = React.createElement;
      return h("span", { style: { display: "flex", alignItems: "center", gap: "6px" } }, "🐙 GitHub");
    }

    // 3. 右侧栏“开始”引导页的大图标 (Artwork)
    function GithubArtwork() {
      var h = React.createElement;
      return h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            background: "rgba(88, 166, 255, 0.15)",
            color: "#58a6ff",
            fontSize: "18px",
          },
        },
        "🐙"
      );
    }

    // 4. 左侧栏全局入口与中央大面板
    function GithubSidebarIcon(props: any) {
      return React.createElement(
        "div",
        {
          className: "dsh-github-icon",
          title: "GitHub 工作台",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            cursor: "pointer",
            color: props && props.active ? "var(--dsw-alias-label-primary, #ffffff)" : "var(--dsw-alias-label-secondary, #8c8c8c)"
          }
        },
        React.createElement(
          "svg",
          { viewBox: "0 0 16 16", width: 18, height: 18, fill: "currentColor" },
          React.createElement("path", {
            d: "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
          })
        )
      );
    }

    function GithubWorkspacePanel() {
      var [loading, setLoading] = React.useState(true);
      var [data, setData] = React.useState(null as any);
      var [error, setError] = React.useState(null as string | null);

      var loadData = React.useCallback(async (forceRefresh = false) => {
        setLoading(true);
        setError(null);
        try {
          if (forceRefresh) await fetch("/api/github/refresh", { method: "POST" }).catch(() => {});
          var res = await fetch("/api/github/overview");
          var json = await res.json();
          if (json.ok && json.data) setData(json.data);
          else setError(json.error || "获取失败");
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }, []);

      React.useEffect(() => { loadData(false); }, [loadData]);
      var h = React.createElement;
      return h("div", { className: "dsh-github-panel" }, ...renderGithubRepoView(h, data, loading, error, () => loadData(true), false));
    }

    var inject = ["slots", "sidebarRightTabs", "sessions", "layout"];

    function apply(ctx: any) {
      if (ctx.effect) {
        ctx.effect(() => injectStyles(), "github: styles");
      } else {
        injectStyles();
      }

      // A. 原生接入 DSH 右侧栏 Tab 体系 (sidebarRightTabs)
      // 这会让 GitHub 仓库自动、原生出现在“开始”引导页上（排在浏览器下方，无任何错位代码！）
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
                description: () => "查看与操作当前工作区目录下的 GitHub 仓库",
                icon: GithubArtwork,
              },
            ],
          });
        }, "github: sidebar right tab definition");
      }

      // B. 注册右侧栏的真实 Tab 内容与标题 (sidebar.right.pane.tab)
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

        // C. 保留左侧栏导航与中央大面板（双向可达）
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

export {};
