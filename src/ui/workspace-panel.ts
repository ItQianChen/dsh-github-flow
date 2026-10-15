declare const React: any;
declare function getLocalSyncSettings(): any;
declare function getStoredGlobalOverview(): any;
declare function saveStoredGlobalOverview(data: any): void;
declare function clearStoredGlobalOverview(): void;
declare function formatRelativeTime(iso: any): string;
declare function renderOctocat(size?: number, color?: string): any;
declare function renderGitIcon(size?: number, color?: string): any;
declare function renderOctocatBadge(size?: number): any;
declare function renderPluginBadge(h: any): any;
declare function SyncStatusBadge(props: any): any;
declare function NetworkAlertBanner(props: any): any;
declare function UpgradeNotificationCard(props: any): any;
declare function AuthGuideCard(props: any): any;
declare function GlobalSyncSettingsModal(props: any): any;

/**
 * 全局工作区仪表盘主面板组件 (Dashboard View)
 */
export function GithubWorkspacePanel() {
  var initialSettings = React.useMemo(() => getLocalSyncSettings(), []);
  var initialSnapshot = React.useMemo(() => getStoredGlobalOverview(), []);

  var [syncSettings, setSyncSettings] = React.useState(initialSettings);
  var [data, setData] = React.useState(initialSnapshot?.data || null);
  var [loading, setLoading] = React.useState(!initialSnapshot);
  var [syncStatus, setSyncStatus] = React.useState(initialSnapshot ? "cached" : "loading");
  var [lastSyncedAt, setLastSyncedAt] = React.useState(initialSnapshot?.savedAt || 0);

  var [isSettingsModalOpen, setIsSettingsModalOpen] = React.useState(false);
  var [settingsInitialSection, setSettingsInitialSection] = React.useState("sync");
  var [error, setError] = React.useState(null as string | null);
  var [updateInfo, setUpdateInfo] = React.useState(null as any);
  var [activeTab, setActiveTab] = React.useState("workspaces");
  var [searchQuery, setSearchQuery] = React.useState("");
  var [issueFilter, setIssueFilter] = React.useState("all");
  var [toastMsg, setToastMsg] = React.useState(null as string | null);
  var cloudTimerRef = React.useRef(null as any);
  var dataRef = React.useRef(data);
  dataRef.current = data;

  var showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  };

  var [proxyActive, setProxyActive] = React.useState(null as { enabled: boolean; url: string } | null);

  var refreshProxyBadge = React.useCallback(function () {
    fetch("/api/github/proxy")
      .then(function (r: any) { return r.json(); })
      .then(function (j: any) {
        if (j && j.ok && j.state && j.state.config) {
          setProxyActive({ enabled: Boolean(j.state.config.url), url: j.state.config.url || "" });
        } else {
          setProxyActive({ enabled: false, url: "" });
        }
      })
      .catch(function () {});
  }, []);

  React.useEffect(function () { refreshProxyBadge(); }, [refreshProxyBadge]);

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

  var panelRef = React.useRef(null as any);
  React.useEffect(() => {
    var onOpenAbout = () => {
      var el = panelRef && panelRef.current;
      if (!el) return;
      var rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSettingsInitialSection("about");
        setIsSettingsModalOpen(true);
      }
    };
    var onOpenProxy = () => {
      var el = panelRef && panelRef.current;
      if (!el) return;
      var rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSettingsInitialSection("proxy");
        setIsSettingsModalOpen(true);
      }
    };
    window.addEventListener("dsh-github-open-about", onOpenAbout);
    window.addEventListener("dsh-github-open-proxy", onOpenProxy);
    return () => {
      window.removeEventListener("dsh-github-open-about", onOpenAbout);
      window.removeEventListener("dsh-github-open-proxy", onOpenProxy);
    };
  }, []);

  var openSettingsDefault = () => {
    setSettingsInitialSection("sync");
    setIsSettingsModalOpen(true);
  };

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
      if (forceRefresh) await fetch("/api/github/refresh", { method: "POST", signal: controller.signal }).catch(() => {});
      var url = "/api/github/global-overview";
      if (forceRefresh) {
        url += "?force=true";
      }
      var res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        var errText = await res.text().catch(() => "");
        var failMsg = `获取全局数据失败（HTTP ${res.status}）${errText ? ": " + errText : ""}`;
        setSyncStatus("failed");
        setError(failMsg);
        if (forceRefresh) showToast("❌ 刷新失败：" + failMsg);
        return;
      }
      var json = await res.json();
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
          "拉取全局数据失败"
        );

        if (isFail) {
          setSyncStatus("failed");
          setError(failReason);
          var curData = dataRef.current;
          if (curData && (curData.userRepos?.length > 0 || curData.myPrs?.length > 0 || curData.myIssues?.length > 0)) {
            if (json.data.userRepos?.length > 0 || json.data.myPrs?.length > 0) {
              setData(json.data);
            }
          } else {
            setData(json.data);
          }
          if (forceRefresh) showToast("❌ 刷新失败：" + failReason);
        } else {
          setData(json.data);
          saveStoredGlobalOverview(json.data);
          var syncTs = json.fromCache && json.data.lastUpdated
            ? (Date.parse(json.data.lastUpdated) || Date.now())
            : Date.now();
          setLastSyncedAt(syncTs);
          setSyncStatus(json.fromCache ? "cached" : "fresh");
          setError(null);
          if (forceRefresh) showToast("✅ 刷新成功，已同步最新数据");
        }

        if (json.data.updateInfo) {
          setUpdateInfo(json.data.updateInfo);
        }
        if (json.data.workspaceError) {
          setError("工作区列表读取失败：" + json.data.workspaceError);
        }
      } else {
        setSyncStatus("failed");
        var errPayload = String(json?.error || "获取全局数据失败");
        setError(errPayload);
        if (forceRefresh) showToast("❌ 刷新失败：" + errPayload);
      }
    } catch (err: any) {
      setSyncStatus("failed");
      var failReason = (timedOut || err.name === "AbortError")
        ? "获取超时（45 秒）：本机 gh 命令响应过慢或网络代理劫持了回环请求。可稍后重试，或在「⚙️ 设置 → 🌐 网络代理」确认代理已放行 127.0.0.1。"
        : ("无法连接后端服务：" + (err.message || err));
      setError(failReason);
      if (forceRefresh) showToast("❌ 刷新失败：" + failReason);
    } finally {
      clearTimeout(timer);
      setLoading(false);
      if (syncSettings.strategy === "auto") {
        scheduleNextCloudSync();
      }
    }
  }, [syncSettings.strategy]);

  // 云端定时自动同步：拉取结算后才启动计时器，倒计时到期后再执行下一次，并做息屏避让
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

  // 挂载加载调度：开启 SWR 或 开启云端定时时，首屏均立即静默拉新；
  // 云端定时在首屏拉取结算后自动启动下一次倒计时。首页坚决不挂载任何文件监控！
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
  }, [syncSettings.strategy, syncSettings.cloudSyncIntervalMs, loadData]);

  React.useEffect(() => {
    var onFocus = () => {
      if (!data?.auth?.loggedIn) {
        fetch("/api/github/auth?force=true")
          .then(function (res) { return res.json(); })
          .then(function (json) {
            if (json && json.ok && json.auth && json.auth.loggedIn) {
              clearStoredGlobalOverview();
              loadData(true);
            }
          })
          .catch(function () {});
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [data, loadData]);

  var h = React.createElement;

  var headerEl = h(
    "div",
    { className: "dsh-github-header" },
    h(
      "div",
      { className: "dsh-github-title" },
      renderOctocatBadge(32),
      h("h2", null, "GitHub 全景驾驶舱"),
      renderPluginBadge(h),
      h(SyncStatusBadge, { syncStatus, lastSyncedAt }),
      proxyActive && proxyActive.enabled
        ? h("span", {
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: "999px",
              background: "rgba(9, 105, 218, 0.1)",
              border: "1px solid rgba(9, 105, 218, 0.35)",
              color: "var(--dsw-alias-link, #0969da)",
              cursor: "default",
            },
            title: "插件网络代理已启用: " + proxyActive.url + "（GitHub 数据链路与工具调用经此代理；点击 ⚙️ 可修改）",
          }, "🌐 代理")
        : null
    ),
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "8px" } },
      h(
        "button",
        {
          className: "dsh-github-refresh-btn",
          onClick: () => loadData(true),
          disabled: loading,
        },
        loading ? "同步中..." : "🔄 刷新全局数据"
      ),
      h(
        "button",
        {
          className: "dsh-github-btn-sm",
          onClick: openSettingsDefault,
          title: "配置数据同步节奏、本地缓存、网络代理与插件信息",
          style: { padding: "6px 12px" },
        },
        "⚙️ 设置"
      )
    )
  );

  if (loading && !data) {
    return h("div", { className: "dsh-github-panel", ref: panelRef }, headerEl, h("div", { className: "dsh-github-empty" }, "正在加载全局 GitHub 账号与工作区数据..."));
  }

  var effectiveUpdateInfo = updateInfo || data?.updateInfo;
  var upgradeBannerEl = effectiveUpdateInfo && effectiveUpdateInfo.hasUpdate
    ? h(UpgradeNotificationCard, { updateInfo: effectiveUpdateInfo, isRightbar: false })
    : null;

  var settingsModalEl = h(GlobalSyncSettingsModal, {
    isOpen: isSettingsModalOpen,
    initialSection: settingsInitialSection,
    onClose: () => {
      setIsSettingsModalOpen(false);
      refreshProxyBadge();
    },
    currentSettings: syncSettings,
    onSave: (newSettings: any) => {
      setSyncSettings(newSettings);
    },
    onClearCache: () => {
      setSyncStatus("loading");
      setData(null);
      setLastSyncedAt(0);
    },
  });

  if (!data && error) {
    return h(
      "div",
      { className: "dsh-github-panel", ref: panelRef },
      headerEl,
      upgradeBannerEl,
      h(
        "div",
        {
          style: {
            padding: "24px",
            borderRadius: "8px",
            background: "rgba(248, 81, 73, 0.08)",
            border: "1px solid rgba(248, 81, 73, 0.3)",
            margin: "16px 0",
            textAlign: "center",
          },
        },
        h("div", { style: { fontSize: "16px", fontWeight: 600, color: "#f85149", marginBottom: "8px" } }, "⚠️ 后端服务加载异常"),
        h("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "16px" } }, error),
        h(
          "button",
          {
            className: "dsh-github-btn-sm",
            onClick: () => loadData(true),
            style: { padding: "6px 18px", background: "var(--dsw-alias-link, #0969da)", color: "#ffffff", borderColor: "var(--dsw-alias-link, #0969da)" },
          },
          "🔄 重新请求"
        )
      ),
      settingsModalEl
    );
  }

  var auth = data ? data.auth : null;
  var userRepos = (data && data.userRepos) || [];
  var workspaceMatrix = (data && data.workspaceMatrix) || [];
  var myPrs = (data && data.myPrs) || [];
  var myIssues = (data && data.myIssues) || [];

  var errorEl = error ? h("div", { style: { color: "#f85149", background: "rgba(248,81,73,0.1)", border: "1px solid rgba(248,81,73,0.3)", padding: "8px 12px", borderRadius: "6px", marginBottom: "16px", fontSize: "12px" } }, `⚠️ 加载失败: ${error}`) : null;

  var statsCardsEl = h(
    "div",
    { className: "dsh-github-overview-cards" },
    h(
      "div",
      { className: "dsh-github-card" },
      h("div", { className: "dsh-github-card-title" }, "CLI 认证账号"),
      h(
        "div",
        { className: "dsh-github-card-value" },
        auth?.networkError
          ? (auth.user ? `👤 ${auth.user} (离线)` : "🌐 网络连接受限")
          : auth?.loggedIn
            ? `👤 ${auth.user}`
            : !auth?.installed
              ? "❌ 未安装 CLI"
              : "⚠️ 未登录",
        auth?.networkError
          ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "Offline")
          : auth?.loggedIn
            ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "Active")
            : !auth?.installed
              ? h("span", { className: "dsh-github-badge dsh-badge-red" }, "Missing")
              : h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "Required")
      )
    ),
    h(
      "div",
      { className: "dsh-github-card" },
      h("div", { className: "dsh-github-card-title" }, "账号云端仓库"),
      h("div", { className: "dsh-github-card-value" }, `${userRepos.length} 个 Repositories`)
    ),
    h(
      "div",
      { className: "dsh-github-card" },
      h("div", { className: "dsh-github-card-title" }, "本地工作区联动"),
      h("div", { className: "dsh-github-card-value" }, `${workspaceMatrix.length} 个工作区 (${workspaceMatrix.filter((w: any) => w.repo).length} 个已关联)`)
    ),
    h(
      "div",
      { className: "dsh-github-card" },
      h("div", { className: "dsh-github-card-title" }, "📥 待处理 Issues"),
      (data && data.issueStats && (data.issueStats.reported || data.issueStats.assigned || data.issueStats.created))
        ? h("div", { className: "dsh-github-card-value", style: { fontSize: "14px" } },
            `📥 用户提单 ${data.issueStats.reported || 0} · 🎯 分配给我 ${data.issueStats.assigned || 0} · ✍️ 我创建 ${data.issueStats.created || 0}`)
        : h("div", { className: "dsh-github-card-value" }, "无待办 ✓")
    )
  );

  var authGuideEl = (!auth?.loggedIn && !auth?.networkError && syncStatus !== "failed")
    ? h(AuthGuideCard, { auth, onRefresh: () => loadData(true), isRightbar: false })
    : null;

  var tabsEl = h(
    "div",
    { className: "dsh-github-tabs" },
    h("button", { className: `dsh-github-tab-btn ${activeTab === 'workspaces' ? 'active' : ''}`, onClick: () => setActiveTab('workspaces') }, `📂 本地工作区矩阵 (${workspaceMatrix.length})`),
    h("button", { className: `dsh-github-tab-btn ${activeTab === 'repos' ? 'active' : ''}`, onClick: () => setActiveTab('repos') }, `☁️ 我的 GitHub 仓库 (${userRepos.length})`),
    h("button", { className: `dsh-github-tab-btn ${activeTab === 'mywork' ? 'active' : ''}`, onClick: () => setActiveTab('mywork') }, `📋 任务与待办 (PR: ${myPrs.length} · Issue: ${myIssues.length})`)
  );

  var contentEl = null;

  if (activeTab === 'workspaces') {
    contentEl = h(
      "div",
      { className: "dsh-github-list" },
      workspaceMatrix.map((ws: any) =>
        h(
          "div",
          { key: ws.id, className: "dsh-github-card dsh-github-workspace-card" },
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "4px" } },
            h("div", { className: "dsh-github-ws-title" }, ws.title),
            h("div", { className: "dsh-github-ws-path" }, ws.path),
            h(
              "div",
              { style: { fontSize: "12px", marginTop: "4px", display: "flex", gap: "8px", alignItems: "center" } },
              ws.repo
                ? h("span", { className: "dsh-github-ws-repo-link" }, renderOctocat(13, "currentColor"), `关联远程: ${ws.repo.nameWithOwner} (${ws.repo.defaultBranch})`)
                : h("span", { className: "dsh-github-ws-path" }, ws.hasGit ? "本地有 Git，未关联 GitHub 远程" : "本地无 Git 仓库"),
              ws.repo ? h("span", { className: "dsh-github-badge dsh-badge-green" }, "已关联") : null
            ),
            ws.gitStatus
              ? h(
                  "div",
                  {
                    style: { fontSize: "11px", display: "flex", gap: "8px", alignItems: "center", opacity: 0.85 },
                    title: "ahead/behind 相对上次 git fetch 的快照（非实时）",
                  },
                  h("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px" } }, renderGitIcon(12, "#1296db"), ws.gitStatus.branch),
                  ws.gitStatus.hasUpstream
                    ? h("span", null, `${ws.gitStatus.ahead > 0 ? "↑" + ws.gitStatus.ahead + " " : ""}${ws.gitStatus.behind > 0 ? "↓" + ws.gitStatus.behind : ""}${ws.gitStatus.ahead === 0 && ws.gitStatus.behind === 0 ? "✓ 同步" : ""}`)
                    : h("span", { style: { opacity: 0.7 } }, "↑? ↓?"),
                  ws.gitStatus.dirtyCount > 0
                    ? h("span", null, `${ws.gitStatus.dirtyCount} 文件未提交`)
                    : h("span", null, "干净")
                )
              : null,
            ws.gitStatus && ws.gitStatus.dirtyFiles && ws.gitStatus.dirtyFiles.length > 0
              ? h(
                  "details",
                  { style: { fontSize: "11px" } },
                  h("summary", { style: { cursor: "pointer", opacity: 0.8 } }, `未提交清单（${ws.gitStatus.dirtyFiles.length}）`),
                  h(
                    "div",
                    { style: { padding: "4px 8px", borderRadius: "6px", background: "var(--dsw-alias-bg-module-platform, #f6f8fa)", lineHeight: "1.6", marginTop: "4px" } },
                    ws.gitStatus.dirtyFiles.map(function (f: any, i: number) {
                      return h("div", { key: i }, h("span", { style: { opacity: 0.7, marginRight: "6px" } }, f.status === "??" ? "??" : f.status), f.path);
                    })
                  )
                )
              : null
          ),
          h(
            "div",
            { style: { display: "flex", gap: "8px" } },
            ws.repo
              ? h("a", { className: "dsh-github-btn-sm", href: ws.repo.url, target: "_blank" }, "在 GitHub 打开")
              : null
          )
        )
      )
    );
  } else if (activeTab === 'repos') {
    if (!auth?.loggedIn) {
      contentEl = h("div", { className: "dsh-github-empty" }, "当前尚未认证登录 GitHub 账号，无法读取云端仓库列表。请先完成上方的安装或登录指引。");
    } else {
      var filteredRepos = userRepos.filter((r: any) => !searchQuery || r.nameWithOwner.toLowerCase().includes(searchQuery.toLowerCase()) || r.description?.toLowerCase().includes(searchQuery.toLowerCase()));
      contentEl = h(
        "div",
        null,
        h("input", {
          className: "dsh-github-search-input",
          placeholder: "🔍 搜索我的 GitHub 仓库...",
          value: searchQuery,
          onChange: (e: any) => setSearchQuery(e.target.value)
        }),
        h(
          "div",
          { className: "dsh-github-list" },
          filteredRepos.map((r: any) =>
            h(
              "div",
              { key: r.nameWithOwner, className: "dsh-github-item" },
              h("a", { className: "dsh-github-item-title", href: r.url, target: "_blank" }, r.nameWithOwner),
              r.description ? h("div", { className: "dsh-github-item-desc" }, r.description) : null,
              h(
                "div",
                { className: "dsh-github-item-meta" },
                h("span", null, `默认分支: ${r.defaultBranch}`),
                r.isPrivate ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "Private") : h("span", { className: "dsh-github-badge dsh-badge-green" }, "Public"),
                h("span", null, `⭐ ${r.stargazerCount}`),
                formatRelativeTime(r.updatedAt)
                  ? h("span", { title: `更新于 ${r.updatedAt}` }, `活跃于 ${formatRelativeTime(r.updatedAt)}`)
                  : null
              )
            )
          )
        )
      );
    }
  } else {
    if (!auth?.loggedIn) {
      contentEl = h("div", { className: "dsh-github-empty" }, "当前尚未认证登录 GitHub 账号，无法读取个人待办 PR 与 Issues。请先完成上方的安装或登录指引。");
    } else {
      var issueStats = (data && data.issueStats) || {
        total: myIssues.length,
        reported: myIssues.filter((i: any) => (i.categories || []).includes('reported')).length,
        assigned: myIssues.filter((i: any) => (i.categories || []).includes('assigned')).length,
        created: myIssues.filter((i: any) => (i.categories || []).includes('created')).length,
      };

      var filteredIssues = myIssues.filter((is: any) => {
        if (issueFilter === 'all') return true;
        var cats = is.categories || [];
        return cats.includes(issueFilter);
      });

      var issuePillsEl = h(
        "div",
        { className: "dsh-github-pills" },
        h(
          "button",
          {
            className: `dsh-github-pill-btn ${issueFilter === 'all' ? 'active' : ''}`,
            onClick: () => setIssueFilter('all'),
          },
          `全部 (${issueStats.total || myIssues.length})`
        ),
        h(
          "button",
          {
            className: `dsh-github-pill-btn ${issueFilter === 'reported' ? 'active' : ''}`,
            onClick: () => setIssueFilter('reported'),
          },
          `📥 用户提起的 (${issueStats.reported || 0})`
        ),
        h(
          "button",
          {
            className: `dsh-github-pill-btn ${issueFilter === 'assigned' ? 'active' : ''}`,
            onClick: () => setIssueFilter('assigned'),
          },
          `🎯 分配给我的 (${issueStats.assigned || 0})`
        ),
        h(
          "button",
          {
            className: `dsh-github-pill-btn ${issueFilter === 'created' ? 'active' : ''}`,
            onClick: () => setIssueFilter('created'),
          },
          `✍️ 我创建的 (${issueStats.created || 0})`
        )
      );

      contentEl = h(
        "div",
        null,
        h("h3", { className: "dsh-github-subheading" }, `🔀 我发起的 PR (${myPrs.length})`),
        myPrs.length === 0 ? h("div", { className: "dsh-github-empty", style: { marginBottom: "16px" } }, "暂无开放中的 PR") : h(
          "div",
          { className: "dsh-github-list", style: { marginBottom: "16px" } },
          myPrs.map((pr: any) => h(
            "div",
            { key: pr.number, className: "dsh-github-item", style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
            h("a", {
              className: "dsh-github-item-title",
              href: pr.url,
              target: "_blank",
              title: pr.updatedAt ? `更新于 ${pr.updatedAt}` : undefined,
            }, `${pr.isDraft ? "⚪ " : ""}[${pr.repository?.nameWithOwner || 'Repo'}] #${pr.number} ${pr.title}`),
            pr.isDraft ? h("span", { className: "dsh-github-badge dsh-badge-yellow" }, "DRAFT") : null,
            formatRelativeTime(pr.updatedAt)
              ? h("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", whiteSpace: "nowrap" } }, formatRelativeTime(pr.updatedAt))
              : null
          ))
        ),
        h("h3", { className: "dsh-github-subheading" }, `📝 任务与待办 Issues (${filteredIssues.length})`),
        issuePillsEl,
        filteredIssues.length === 0 ? h("div", { className: "dsh-github-empty" }, "当前分类下暂无开放中的 Issue") : h(
          "div",
          { className: "dsh-github-list" },
          filteredIssues.map((is: any) => {
            var cats = is.categories || [];
            var badges: any[] = [];
            if (cats.includes("reported")) {
              badges.push(h("span", { key: "rep", className: "dsh-github-badge dsh-badge-purple" }, "用户提单"));
            }
            if (cats.includes("assigned")) {
              badges.push(h("span", { key: "asn", className: "dsh-github-badge dsh-badge-blue" }, "分配待办"));
            }
            if (cats.includes("created")) {
              badges.push(h("span", { key: "crt", className: "dsh-github-badge dsh-badge-green" }, "我发起的"));
            }

            return h(
              "div",
              { key: is.url || is.number, className: "dsh-github-item" },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
                h(
                  "a",
                  { className: "dsh-github-item-title", href: is.url, target: "_blank" },
                  `[${is.repository?.nameWithOwner || 'Repo'}] #${is.number} ${is.title}`
                ),
                ...badges
              ),
              h(
                "div",
                { className: "dsh-github-item-meta" },
                is.author ? h("span", null, `由 @${is.author.login} 提出`) : null,
                is.assignees && is.assignees.length > 0
                  ? h("span", null, `指派: ${is.assignees.map((a: any) => '@' + a.login).join(', ')}`)
                  : null,
                is.labels && is.labels.length > 0
                  ? is.labels.map((lbl: any) => h("span", { key: lbl.name, className: "dsh-github-badge dsh-badge-yellow" }, lbl.name))
                  : null,
                is.updatedAt ? h("span", null, `更新于: ${new Date(is.updatedAt).toLocaleDateString()}`) : null
              )
            );
          })
        )
      );
    }
  }

  var toastEl = toastMsg
    ? h(
        "div",
        {
          style: {
            padding: "8px 12px",
            marginBottom: "12px",
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

  var networkAlertBannerEl = (syncStatus === "failed" || auth?.networkError || (error && data))
    ? h(NetworkAlertBanner, {
        isRightbar: false,
        networkErrorReason: auth?.networkErrorReason || error || "连接 GitHub API 超时或网络不可达，本次未能获取最新数据。",
        lastSyncedAt,
        onRefresh: () => loadData(true),
        onOpenProxy: function () {
          setSettingsInitialSection("proxy");
          setIsSettingsModalOpen(true);
        },
      })
    : null;

  return h(
    "div",
    { className: "dsh-github-panel", ref: panelRef },
    toastEl,
    headerEl,
    networkAlertBannerEl,
    upgradeBannerEl,
    errorEl,
    statsCardsEl,
    authGuideEl,
    tabsEl,
    contentEl,
    settingsModalEl
  );
}
