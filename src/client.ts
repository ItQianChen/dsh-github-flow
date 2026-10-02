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
  background: var(--dsw-alias-interactive-bg-hover, #333);
}

/* 概览卡片区 */
.dsh-github-overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}
.dsh-github-card {
  padding: 14px 18px;
  border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1, #333336);
  background: var(--dsw-alias-bg-secondary, #252528);
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

/* 右侧栏专属样式 (Right Sidebar) */
.dsh-github-right-card {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
  padding: 16px 20px;
  margin-top: 14px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l1, #38383c);
  background: var(--dsw-alias-bg-secondary, #242427);
  color: var(--dsw-alias-label-primary, #fff);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.dsh-github-right-card:hover {
  background: var(--dsw-alias-interactive-bg-hover, #2f2f34);
  border-color: #58a6ff;
  transform: translateY(-1px);
}
.dsh-github-right-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(88, 166, 255, 0.12);
  color: #58a6ff;
  flex-shrink: 0;
}
.dsh-github-right-card-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.dsh-github-right-card-title {
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-github-right-card-desc {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #999);
}

/* 右侧栏抽屉/弹窗视图 */
.dsh-github-drawer-shell {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100;
  background: var(--dsw-alias-bg-primary, #1e1e20);
  display: flex;
  flex-direction: column;
  padding: 16px 18px;
  box-sizing: border-box;
  overflow-y: auto;
}
.dsh-github-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #333);
}
.dsh-github-back-btn {
  background: transparent;
  border: 0;
  color: var(--dsw-alias-label-secondary, #aaa);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 4px;
}
.dsh-github-back-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

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
  margin-bottom: 20px;
}
.dsh-github-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.dsh-github-section-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.dsh-github-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-github-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
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
  padding: 20px;
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

    // 侧边栏/右侧栏通用的 GitHub 仓库详情与操作视图
    function renderGithubRepoView(h: any, data: any, loading: boolean, error: string | null, onRefresh: () => void, onCloseDrawer?: () => void) {
      var auth = data ? data.auth : null;
      var repo = data ? data.repo : null;
      var prs = (data && data.pullRequests) || [];
      var issues = (data && data.issues) || [];
      var runs = (data && data.runs) || [];

      // 顶部 Header
      var headerEl = h(
        "div",
        { className: onCloseDrawer ? "dsh-github-drawer-header" : "dsh-github-header" },
        onCloseDrawer
          ? h(
              "button",
              { className: "dsh-github-back-btn", onClick: onCloseDrawer },
              "← 返回"
            )
          : h(
              "div",
              { className: "dsh-github-title" },
              h("span", { style: { fontSize: "20px" } }, "🐙"),
              h("h2", null, "GitHub 仓库工作台")
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
          alert(json.ok ? `✅ ${json.message || "操作已成功发起"}` : `❌ ${json.error || "操作失败"}`);
          if (json.ok) onRefresh();
        } catch (err: any) {
          alert(`网络异常: ${err.message}`);
        }
      };

      // 仓库基础卡片
      var repoCardEl = h(
        "div",
        { className: "dsh-github-card", style: { marginBottom: "14px" } },
        h("div", { className: "dsh-github-card-title" }, "当前文件夹 GitHub 仓库"),
        h(
          "div",
          { className: "dsh-github-card-value" },
          repo
            ? h("a", { href: repo.url, target: "_blank", style: { color: "#58a6ff", textDecoration: "none" } }, repo.nameWithOwner)
            : "未关联 GitHub 远程仓库",
          repo ? h("span", { className: "dsh-github-badge dsh-badge-green" }, repo.defaultBranch) : null
        ),
        auth && auth.loggedIn
          ? h("div", { style: { fontSize: "12px", color: "#aaa", marginTop: "6px" } }, `当前 CLI 账号: ${auth.user}`)
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
              else alert("当前文件夹尚未关联 GitHub 仓库");
            },
          },
          "🌐 打开 GitHub 仓库"
        ),
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            onClick: () => {
              if (repo?.url) runAction("open_browser", { url: `${repo.url}/pulls` });
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
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "冲突")
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
        h("div", { className: "dsh-github-section-header" }, h("h3", null, `⚡ Actions 流水线 (${runs.length})`)),
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
                      ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "通过")
                      : r.conclusion === "failure"
                      ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "失败")
                      : h("span", { className: "dsh-github-badge dsh-badge-yellow" }, r.status)
                  )
                )
              )
            )
      );

      return [headerEl, repoCardEl, actionsBarEl, prSectionEl, runSectionEl];
    }

    // 1. 左侧栏图标组件
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

    // 2. 中央大视口主面板 (Main Slot)
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
      return h(
        "div",
        { className: "dsh-github-panel" },
        ...renderGithubRepoView(h, data, loading, error, () => loadData(true))
      );
    }

    // 3. 对话右上角快捷按钮 (Conversation Session Utilities)
    function GithubHeaderAction() {
      var [showDrawer, setShowDrawer] = React.useState(false);
      var [loading, setLoading] = React.useState(false);
      var [data, setData] = React.useState(null as any);
      var [error, setError] = React.useState(null as string | null);

      var loadData = async (forceRefresh = false) => {
        setLoading(true);
        try {
          if (forceRefresh) await fetch("/api/github/refresh", { method: "POST" }).catch(() => {});
          var res = await fetch("/api/github/overview");
          var json = await res.json();
          if (json.ok && json.data) setData(json.data);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };

      var toggle = () => {
        var next = !showDrawer;
        setShowDrawer(next);
        if (next && !data) loadData(false);
      };

      var h = React.createElement;

      return h(
        "div",
        { style: { position: "relative", display: "inline-flex" } },
        h(
          "button",
          {
            className: "dsh-github-action-btn",
            style: { padding: "4px 8px", background: "transparent", border: "0" },
            title: "当前文件夹 GitHub 仓库与操作",
            onClick: toggle,
          },
          h("span", { style: { fontSize: "16px" } }, "🐙"),
          h("span", { style: { fontSize: "12px", marginLeft: "4px" } }, "GitHub")
        ),
        showDrawer
          ? h(
              "div",
              {
                className: "dsh-github-drawer-shell",
                style: {
                  position: "fixed",
                  top: "40px",
                  right: "0",
                  width: "420px",
                  height: "calc(100vh - 40px)",
                  boxShadow: "-4px 0 20px rgba(0,0,0,0.5)",
                },
              },
              ...renderGithubRepoView(h, data, loading, error, () => loadData(true), () => setShowDrawer(false))
            )
          : null
      );
    }

    // 4. 右侧栏开始页面中的卡片自动挂载器 (Observer for Guide Page in Right Sidebar)
    function setupRightbarGuideObserver() {
      if (typeof window === "undefined" || !window.document) return;

      var checkAndMount = () => {
        // 查找截图中的三个卡片容器：包含“工作区文件”或“新建终端”的父容器
        var cards = document.querySelectorAll("div, button, a");
        for (var i = 0; i < cards.length; i++) {
          var el = cards[i] as HTMLElement;
          if (el.textContent && el.textContent.includes("工作区文件") && el.textContent.includes("Ctrl + P")) {
            var parent = el.parentElement;
            if (parent && parent.parentElement && !parent.querySelector(".dsh-github-mounted-card")) {
              var btn = document.createElement("div");
              btn.className = "dsh-github-right-card dsh-github-mounted-card";
              btn.innerHTML = `
                <div class="dsh-github-right-card-icon">🐙</div>
                <div class="dsh-github-right-card-text">
                  <div class="dsh-github-right-card-title">GitHub 仓库</div>
                  <div class="dsh-github-right-card-desc">查看与操作当前文件夹的 GitHub 仓库 (PR / Issue / CI)</div>
                </div>
              `;
              btn.onclick = () => {
                var existingDrawer = document.getElementById("dsh-github-floating-drawer");
                if (existingDrawer) existingDrawer.remove();

                var drawer = document.createElement("div");
                drawer.id = "dsh-github-floating-drawer";
                drawer.className = "dsh-github-drawer-shell";
                drawer.style.position = "absolute";
                drawer.style.top = "0";
                drawer.style.left = "0";
                drawer.style.width = "100%";
                drawer.style.height = "100%";
                drawer.style.zIndex = "999";
                drawer.innerHTML = `<div style="padding: 20px; text-align: center; color: #888;">正在加载当前文件夹 GitHub 状态...</div>`;

                parent!.parentElement!.appendChild(drawer);

                // 加载数据并渲染
                fetch("/api/github/overview")
                  .then((r) => r.json())
                  .then((res) => {
                    var data = res.data;
                    var repo = data?.repo;
                    var auth = data?.auth;
                    var prs = data?.pullRequests || [];
                    var runs = data?.runs || [];

                    drawer.innerHTML = `
                      <div class="dsh-github-drawer-header">
                        <button id="dsh-drawer-close-btn" class="dsh-github-back-btn">← 返回开始</button>
                        <button id="dsh-drawer-refresh-btn" class="dsh-github-refresh-btn">🔄 刷新</button>
                      </div>
                      <div class="dsh-github-card" style="margin-bottom: 12px;">
                        <div class="dsh-github-card-title">当前文件夹 GitHub 仓库</div>
                        <div class="dsh-github-card-value">
                          ${repo ? `<a href="${repo.url}" target="_blank" style="color: #58a6ff; text-decoration: none;">${repo.nameWithOwner}</a>` : '未关联 GitHub 仓库'}
                          ${repo ? `<span class="dsh-github-badge dsh-badge-green">${repo.defaultBranch}</span>` : ''}
                        </div>
                        ${auth?.loggedIn ? `<div style="font-size: 12px; color: #888; margin-top: 4px;">登录账号: ${auth.user}</div>` : ''}
                      </div>

                      <div class="dsh-github-quick-actions">
                        <button id="dsh-act-open" class="dsh-github-action-btn">🌐 浏览器打开</button>
                        <button id="dsh-act-prs" class="dsh-github-action-btn">🔀 打开 PR 列表</button>
                        <button id="dsh-act-new-pr" class="dsh-github-action-btn">🚀 快速新建 PR</button>
                        <button id="dsh-act-new-issue" class="dsh-github-action-btn">📝 新建 Issue</button>
                      </div>

                      <div class="dsh-github-section">
                        <div class="dsh-github-section-header"><h3>🔀 Pull Requests (${prs.length})</h3></div>
                        <div class="dsh-github-list">
                          ${prs.length === 0 ? '<div class="dsh-github-empty">暂无开放 PR</div>' : prs.map((p: any) => `
                            <div class="dsh-github-item">
                              <a class="dsh-github-item-title" href="${p.url}" target="_blank">#${p.number} ${p.title}</a>
                              <div class="dsh-github-item-meta">
                                <span>${p.headRefName} → ${p.baseRefName}</span>
                                <span class="dsh-github-badge ${p.mergeable === 'CONFLICTING' ? 'dsh-badge-red' : 'dsh-badge-green'}">${p.mergeable === 'CONFLICTING' ? '冲突' : '可合并'}</span>
                              </div>
                            </div>
                          `).join('')}
                        </div>
                      </div>

                      <div class="dsh-github-section">
                        <div class="dsh-github-section-header"><h3>⚡ 最近 Actions 流水线 (${runs.length})</h3></div>
                        <div class="dsh-github-list">
                          ${runs.length === 0 ? '<div class="dsh-github-empty">暂无运行记录</div>' : runs.map((r: any) => `
                            <div class="dsh-github-item">
                              <a class="dsh-github-item-title" href="${r.url}" target="_blank">${r.name}</a>
                              <div class="dsh-github-item-meta">
                                <span>分支: ${r.headBranch}</span>
                                <span class="dsh-github-badge ${r.conclusion === 'success' ? 'dsh-badge-green' : (r.conclusion === 'failure' ? 'dsh-badge-red' : 'dsh-badge-yellow')}">${r.conclusion || r.status}</span>
                              </div>
                            </div>
                          `).join('')}
                        </div>
                      </div>
                    `;

                    document.getElementById("dsh-drawer-close-btn")!.onclick = () => drawer.remove();
                    document.getElementById("dsh-drawer-refresh-btn")!.onclick = () => btn.click();
                    document.getElementById("dsh-act-open")!.onclick = () => { if (repo?.url) window.open(repo.url, '_blank'); };
                    document.getElementById("dsh-act-prs")!.onclick = () => { if (repo?.url) window.open(`${repo.url}/pulls`, '_blank'); };
                    document.getElementById("dsh-act-new-pr")!.onclick = async () => {
                      var title = prompt("请输入要创建的 PR 标题:");
                      if (title) {
                        await fetch("/api/github/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_pr", title }) });
                        alert("PR 已提交创建");
                        btn.click();
                      }
                    };
                    document.getElementById("dsh-act-new-issue")!.onclick = async () => {
                      var title = prompt("请输入 Issue 标题:");
                      if (title) {
                        await fetch("/api/github/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_issue", title }) });
                        alert("Issue 已提交创建");
                        btn.click();
                      }
                    };
                  });
              };

              parent.appendChild(btn);
            }
            break;
          }
        }
      };

      // 持续监听右侧栏的动态打开
      setInterval(checkAndMount, 1000);
    }

    var inject = ["slots"];

    function apply(ctx: any) {
      if (ctx.effect) {
        ctx.effect(() => injectStyles(), "github: styles");
      } else {
        injectStyles();
      }

      // 启动右侧栏引导卡片监听注入器
      setupRightbarGuideObserver();

      if (ctx.slots) {
        // 1. 左侧栏图标（全局工作台入口）
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

          // 2. 对话右上角工具栏（会话常驻右侧入口）
          ctx.slots.inject("conversation.session.header.utilities", () => {
            return ctx.slots.register({
              name: "conversation.session.header.utilities",
              id: "github-header-utility",
              order: 10,
              label: "GitHub"
            }, GithubHeaderAction);
          });
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
