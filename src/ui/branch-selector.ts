declare const React: any;
declare function renderGitIcon(size?: number, color?: string): any;

/**
 * 分支查看与快速切换下拉选择器组件
 */
export function BranchSelectorDropdown(props: {
  currentBranch: string;
  cwd: string | null;
  branchesData?: any;
  onBranchSwitched?: (branch: string) => void;
  showToast?: (msg: string) => void;
}) {
  var currentBranch = props.currentBranch || "main";
  var cwd = props.cwd;
  var branchesData = props.branchesData;
  var onBranchSwitched = props.onBranchSwitched || (() => {});
  var showToast = props.showToast || (() => {});

  var [isOpen, setIsOpen] = React.useState(false);
  var [loading, setLoading] = React.useState(false);
  var [switching, setSwitching] = React.useState(false);
  var [branches, setBranches] = React.useState([] as any[]);
  var [search, setSearch] = React.useState("");
  var [fetchError, setFetchError] = React.useState(null as string | null);

  var containerRef = React.useRef(null as any);

  React.useEffect(() => {
    if (!isOpen) return;
    var handleClickOutside = (e: any) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  var toggleOpen = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    setSearch("");
    setFetchError(null);

    if (branchesData && Array.isArray(branchesData.branches) && branchesData.branches.length > 0) {
      setBranches(branchesData.branches);
      setLoading(false);
      return;
    }

    setLoading(true);
    var url = "/api/github/branches" + (cwd ? "?cwd=" + encodeURIComponent(cwd) : "");
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          var errText = await res.text().catch(() => "");
          if (res.status === 404 || errText.includes("not found")) {
            throw new Error("后端分支接口未注册 (404)。请重启 DSH 桌面端以加载新后端服务。");
          }
          throw new Error(`服务响应异常 (${res.status}): ${errText || res.statusText}`);
        }
        return res.json();
      })
      .then((json) => {
        setLoading(false);
        if (json && json.ok && json.data && Array.isArray(json.data.branches)) {
          setBranches(json.data.branches);
        } else {
          setFetchError(json.error || "获取分支列表失败");
        }
      })
      .catch((err) => {
        setLoading(false);
        setFetchError(err.message || "读取分支失败");
      });
  };

  var handleSwitch = async (targetBranch: string) => {
    if (targetBranch === currentBranch || switching) return;
    setSwitching(true);
    try {
      var res = await fetch("/api/github/branch-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, branch: targetBranch }),
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch("/api/github/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "switch_branch", cwd, branch: targetBranch }),
        });
      }

      if (!res.ok) {
        var errText = await res.text().catch(() => "");
        showToast(`❌ 切换失败：${errText || res.statusText}`);
        return;
      }

      var json = await res.json();
      if (json && json.ok) {
        setIsOpen(false);
        showToast(`✅ 已切换到分支 ${json.currentBranch || targetBranch}`);
        onBranchSwitched(json.currentBranch || targetBranch);
      } else {
        showToast(`❌ 切换失败：${json.error || json.message || "未知错误"}`);
      }
    } catch (e: any) {
      showToast(`❌ 切换分支网络请求失败：${e.message || e}`);
    } finally {
      setSwitching(false);
    }
  };

  var filtered = branches.filter((b: any) => !search || b.name.toLowerCase().includes(search.toLowerCase()));
  var localBranches = filtered.filter((b: any) => !b.isRemote);
  var remoteBranches = filtered.filter((b: any) => b.isRemote);

  var h = React.createElement;

  return h(
    "div",
    {
      ref: containerRef,
      style: { position: "relative", display: "inline-block" },
    },
    h(
      "button",
      {
        type: "button",
        className: "dsh-github-branch-btn",
        onClick: toggleOpen,
        title: `当前分支: ${currentBranch}（点击可切换分支）`,
      },
      renderGitIcon(12, "currentColor"),
      h("span", { style: { maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, currentBranch),
      h("span", { style: { fontSize: "9px", opacity: 0.7, marginLeft: "1px" } }, "▾")
    ),
    isOpen
      ? h(
          "div",
          { className: "dsh-github-branch-dropdown" },
          h(
            "div",
            { className: "dsh-github-branch-search" },
            h("input", {
              className: "dsh-github-branch-input",
              type: "text",
              placeholder: "搜索分支 (输入关键词)...",
              value: search,
              autoFocus: true,
              onChange: (e: any) => setSearch(e.target.value),
            })
          ),
          h(
            "div",
            { className: "dsh-github-branch-list" },
            loading
              ? h("div", { style: { padding: "12px", textAlign: "center", fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "⏳ 读取分支中...")
              : fetchError
              ? h("div", { style: { padding: "12px", textAlign: "center", fontSize: "11px", color: "var(--dsw-alias-state-error-primary, #cf222e)" } }, `⚠️ ${fetchError}`)
              : [
                  localBranches.length > 0
                    ? h("div", { key: "hdr-local", style: { padding: "4px 12px", fontSize: "10px", fontWeight: 600, color: "var(--dsw-alias-label-tertiary, #8c8c8c)", textTransform: "uppercase" } }, "本地分支")
                    : null,
                  ...localBranches.map((b: any) =>
                    h(
                      "div",
                      {
                        key: b.name,
                        className: "dsh-github-branch-item" + (b.isCurrent ? " active" : ""),
                        onClick: () => handleSwitch(b.name),
                        title: b.subject ? `${b.name}\n${b.subject} (${b.relativeTime})` : b.name,
                      },
                      h("div", { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } },
                        b.isCurrent
                          ? h("span", { style: { color: "var(--dsw-alias-state-success, #2ea043)", fontWeight: 700 } }, "✓")
                          : h("span", { style: { width: "10px" } }),
                        h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, b.name)
                      ),
                      b.relativeTime
                        ? h("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary, #8c8c8c)", flexShrink: 0, marginLeft: "6px" } }, b.relativeTime)
                        : null
                    )
                  ),
                  remoteBranches.length > 0
                    ? h("div", { key: "hdr-remote", style: { padding: "6px 12px 4px", fontSize: "10px", fontWeight: 600, color: "var(--dsw-alias-label-tertiary, #8c8c8c)", textTransform: "uppercase", borderTop: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.06))", marginTop: "4px" } }, "远程分支 (点击检出)")
                    : null,
                  ...remoteBranches.map((b: any) =>
                    h(
                      "div",
                      {
                        key: b.name,
                        className: "dsh-github-branch-item",
                        onClick: () => handleSwitch(b.name),
                        title: b.subject ? `${b.name}\n${b.subject} (${b.relativeTime})` : b.name,
                      },
                      h("div", { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } },
                        h("span", { style: { width: "10px" } }),
                        h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.85 } }, b.name)
                      ),
                      b.relativeTime
                        ? h("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary, #8c8c8c)", flexShrink: 0, marginLeft: "6px" } }, b.relativeTime)
                        : null
                    )
                  ),
                  filtered.length === 0 && !loading
                    ? h("div", { style: { padding: "12px", textAlign: "center", fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "未匹配到任何分支")
                    : null,
                ].filter(Boolean)
          ),
          switching
            ? h("div", { style: { padding: "6px", textAlign: "center", fontSize: "11px", background: "rgba(9, 105, 218, 0.1)", color: "var(--dsw-alias-link, #0969da)", fontWeight: 500 } }, "正在切换分支...")
            : null
        )
      : null
  );
}
