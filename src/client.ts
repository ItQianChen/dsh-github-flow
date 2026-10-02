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
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #333336);
}
.dsh-github-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dsh-github-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.dsh-github-refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1, #444);
  background: var(--dsw-alias-bg-secondary, #2a2a2e);
  color: var(--dsw-alias-label-primary, #fff);
  cursor: pointer;
  transition: all 0.15s ease;
}
.dsh-github-refresh-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, #3a3a3e);
}

.dsh-github-overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.dsh-github-card {
  padding: 16px 20px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #333336);
  background: var(--dsw-alias-bg-secondary, #252528);
}
.dsh-github-card-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dsw-alias-label-tertiary, #888);
  margin-bottom: 8px;
}
.dsh-github-card-value {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
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

.dsh-github-section {
  margin-bottom: 28px;
}
.dsh-github-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.dsh-github-section-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.dsh-github-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-github-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l1, #333336);
  background: var(--dsw-alias-bg-secondary, #252528);
  transition: border-color 0.15s ease;
}
.dsh-github-item:hover {
  border-color: var(--dsw-alias-border-l2, #555);
}
.dsh-github-item-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-github-item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary, #fff);
  text-decoration: none;
}
.dsh-github-item-title:hover {
  text-decoration: underline;
}
.dsh-github-item-meta {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #8c8c8c);
  display: flex;
  gap: 12px;
}
.dsh-github-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-github-btn-sm {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l1, #444);
  background: transparent;
  color: var(--dsw-alias-label-primary, #fff);
  cursor: pointer;
}
.dsh-github-btn-sm:hover {
  background: var(--dsw-alias-interactive-bg-hover, #333);
}
.dsh-github-empty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary, #666);
  border: 1px dashed var(--dsw-alias-border-l1, #333);
  border-radius: 6px;
}
.dsh-github-guide-card {
  padding: 20px 24px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #444);
  background: var(--dsw-alias-bg-secondary, #252528);
  margin-bottom: 24px;
}
.dsh-github-guide-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #f0883e;
}
.dsh-github-guide-desc {
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #aaa);
  margin-bottom: 12px;
  line-height: 1.5;
}
.dsh-github-cmd-box {
  background: rgba(0, 0, 0, 0.45);
  padding: 10px 14px;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  color: #58a6ff;
  border: 1px solid #383838;
  margin: 6px 0 12px;
  user-select: all;
}
.dsh-github-step-item {
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #ddd);
  margin: 6px 0;
  line-height: 1.6;
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
          if (forceRefresh) {
            await fetch("/api/github/refresh", { method: "POST" }).catch(() => {});
          }
          var res = await fetch("/api/github/overview");
          var json = await res.json();
          if (json.ok && json.data) {
            setData(json.data);
          } else {
            setError(json.error || json.message || "获取 GitHub 概览失败");
          }
        } catch (err: any) {
          setError(err.message || "网络连接异常");
        } finally {
          setLoading(false);
        }
      }, []);

      React.useEffect(() => {
        loadData(false);
        var timer = setInterval(() => loadData(false), 60000);
        return () => clearInterval(timer);
      }, [loadData]);

      var h = React.createElement;

      var headerEl = h(
        "div",
        { className: "dsh-github-header" },
        h(
          "div",
          { className: "dsh-github-title" },
          h(
            "svg",
            { viewBox: "0 0 16 16", width: 22, height: 22, fill: "currentColor" },
            h("path", {
              d: "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
            })
          ),
          h("h2", null, "GitHub 工作台")
        ),
        h(
          "button",
          {
            className: "dsh-github-refresh-btn",
            onClick: () => loadData(true),
            disabled: loading
          },
          loading ? "刷新中..." : "🔄 刷新状态"
        )
      );

      if (loading && !data) {
        return h(
          "div",
          { className: "dsh-github-panel" },
          headerEl,
          h("div", { className: "dsh-github-empty" }, "正在通过本地 GitHub CLI (gh) 探测工作区状态...")
        );
      }

      if (error && !data) {
        return h(
          "div",
          { className: "dsh-github-panel" },
          headerEl,
          h("div", { className: "dsh-github-empty", style: { borderColor: "#f85149", color: "#f85149" } }, `⚠️ ${error}`)
        );
      }

      var auth = data ? data.auth : null;
      var repo = data ? data.repo : null;
      var prs = (data && data.pullRequests) || [];
      var issues = (data && data.issues) || [];
      var runs = (data && data.runs) || [];

      var guideEl = null;

      // 仅当明确未登录且无用户信息时，才渲染引导向导
      if (auth && !auth.loggedIn && !auth.user) {
        if (auth.installed === false) {
          guideEl = h(
            "div",
            { className: "dsh-github-guide-card" },
            h("div", { className: "dsh-github-guide-title" }, "⚠️ 未检测到 GitHub CLI (gh)"),
            h("div", { className: "dsh-github-guide-desc" }, "本插件基于官方 GitHub CLI 运行，实现免 PAT 安全登录与工作区环境自动感知。请先在系统终端中安装 gh："),
            h("div", { style: { fontWeight: "600", fontSize: "13px", marginTop: "8px" } }, "各系统推荐安装命令:"),
            h("div", { className: "dsh-github-cmd-box" }, "winget install --id GitHub.cli  # Windows (PowerShell/CMD)"),
            h("div", { className: "dsh-github-cmd-box" }, "brew install gh                # macOS (Homebrew)"),
            h("div", { className: "dsh-github-cmd-box" }, "sudo apt install gh            # Linux (Debian/Ubuntu)"),
            h("div", { style: { fontWeight: "600", fontSize: "13px", marginTop: "16px", marginBottom: "8px" } }, "安装后的登录步骤:"),
            h("div", { className: "dsh-github-step-item" }, "1. 打开系统终端，运行登录命令:"),
            h("div", { className: "dsh-github-cmd-box" }, "gh auth login"),
            h("div", { className: "dsh-github-step-item" }, "2. 选项指引：选择 GitHub.com → 协议选择 HTTPS → 确认使用 Web 浏览器验证；"),
            h("div", { className: "dsh-github-step-item" }, "3. 浏览器授权成功后，回到本工作台点击右上角【🔄 刷新状态】即可立即激活！")
          );
        } else {
          guideEl = h(
            "div",
            { className: "dsh-github-guide-card" },
            h("div", { className: "dsh-github-guide-title" }, "🔑 GitHub CLI 尚未登录认证"),
            h("div", { className: "dsh-github-guide-desc" }, "已检测到系统的 GitHub CLI，但当前尚未登录账号。请在终端执行以下命令进行快速登录："),
            h("div", { className: "dsh-github-cmd-box" }, "gh auth login"),
            h("div", { className: "dsh-github-step-item" }, "按提示在浏览器中完成授权后，回到本界面点击右上角的【🔄 刷新状态】按钮即可开启全部能力。")
          );
        }
      }

      var cardsEl = h(
        "div",
        { className: "dsh-github-overview-cards" },
        h(
          "div",
          { className: "dsh-github-card" },
          h("div", { className: "dsh-github-card-title" }, "CLI 认证账号"),
          h(
            "div",
            { className: "dsh-github-card-value" },
            auth && auth.loggedIn ? `👤 ${auth.user || "已登录"}` : "❌ 未登录",
            auth && auth.loggedIn ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "Active") : null
          )
        ),
        h(
          "div",
          { className: "dsh-github-card" },
          h("div", { className: "dsh-github-card-title" }, "当前工作区仓库"),
          h(
            "div",
            { className: "dsh-github-card-value" },
            repo
              ? h("a", { href: repo.url, target: "_blank", style: { color: "inherit", textDecoration: "none" } }, repo.nameWithOwner)
              : "未关联 GitHub 仓库"
          )
        ),
        h(
          "div",
          { className: "dsh-github-card" },
          h("div", { className: "dsh-github-card-title" }, "任务总览"),
          h(
            "div",
            { className: "dsh-github-card-value" },
            `${prs.length} PRs · ${issues.length} Issues`
          )
        )
      );

      var prsSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h(
          "div",
          { className: "dsh-github-section-header" },
          h("h3", null, `🔀 Pull Requests (${prs.length})`)
        ),
        prs.length === 0
          ? h("div", { className: "dsh-github-empty" }, "当前工作区无开放中的 Pull Request")
          : h(
              "div",
              { className: "dsh-github-list" },
              prs.map((pr: any) =>
                h(
                  "div",
                  { key: pr.number, className: "dsh-github-item" },
                  h(
                    "div",
                    { className: "dsh-github-item-main" },
                    h(
                      "a",
                      { className: "dsh-github-item-title", href: pr.url, target: "_blank" },
                      `#${pr.number} ${pr.title}`
                    ),
                    h(
                      "div",
                      { className: "dsh-github-item-meta" },
                      h("span", null, `由 ${pr.author?.login || "未知"} 提交`),
                      h("span", null, `${pr.headRefName} → ${pr.baseRefName}`),
                      pr.mergeable === "CONFLICTING"
                        ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "代码冲突")
                        : h("span", { className: "dsh-github-badge dsh-badge-green" }, "可合并")
                    )
                  ),
                  h(
                    "div",
                    { className: "dsh-github-item-actions" },
                    h(
                      "a",
                      { className: "dsh-github-btn-sm", href: pr.url, target: "_blank", style: { textDecoration: "none" } },
                      "在 GitHub 查看"
                    )
                  )
                )
              )
            )
      );

      var runsSectionEl = h(
        "div",
        { className: "dsh-github-section" },
        h(
          "div",
          { className: "dsh-github-section-header" },
          h("h3", null, `⚡ GitHub Actions 最近流水线 (${runs.length})`)
        ),
        runs.length === 0
          ? h("div", { className: "dsh-github-empty" }, "暂无工作流运行记录")
          : h(
              "div",
              { className: "dsh-github-list" },
              runs.map((r: any) =>
                h(
                  "div",
                  { key: r.databaseId, className: "dsh-github-item" },
                  h(
                    "div",
                    { className: "dsh-github-item-main" },
                    h(
                      "a",
                      { className: "dsh-github-item-title", href: r.url, target: "_blank" },
                      r.name
                    ),
                    h(
                      "div",
                      { className: "dsh-github-item-meta" },
                      h("span", null, `分支: ${r.headBranch}`),
                      h("span", null, `事件: ${r.event}`),
                      r.conclusion === "success"
                        ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "成功")
                        : r.conclusion === "failure"
                        ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "失败")
                        : h("span", { className: "dsh-github-badge dsh-badge-yellow" }, r.status || "进行中")
                    )
                  ),
                  h(
                    "div",
                    { className: "dsh-github-item-actions" },
                    h(
                      "a",
                      { className: "dsh-github-btn-sm", href: r.url, target: "_blank", style: { textDecoration: "none" } },
                      "流水线详情"
                    )
                  )
                )
              )
            )
      );

      return h("div", { className: "dsh-github-panel" }, headerEl, guideEl, cardsEl, prsSectionEl, runsSectionEl);
    }

    var inject = ["slots"];

    function apply(ctx: any) {
      if (ctx.effect) {
        ctx.effect(() => injectStyles(), "github: styles");
      } else {
        injectStyles();
      }

      if (ctx.slots) {
        if (typeof ctx.slots.inject === "function") {
          ctx.slots.inject("sidebar.panellist", () => {
            return ctx.slots.register({
              name: "sidebar.panellist",
              id: "github",
              order: 20,
              label: "GitHub"
            }, GithubSidebarIcon);
          });

          ctx.slots.inject("main", () => {
            return ctx.slots.register({
              name: "main",
              key: "github"
            }, GithubWorkspacePanel);
          });
        } else if (typeof ctx.slots.register === "function") {
          ctx.slots.register({
            name: "sidebar.panellist",
            id: "github",
            order: 20,
            label: "GitHub"
          }, GithubSidebarIcon);

          ctx.slots.register({
            name: "main",
            key: "github"
          }, GithubWorkspacePanel);
        }
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = "dsh-github-flow";

    return module.exports;
  }
});

export {};
