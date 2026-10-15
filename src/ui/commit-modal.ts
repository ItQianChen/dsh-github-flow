declare const React: any;
declare function renderGitIcon(size?: number, color?: string): any;

/**
 * 提交详情模态弹窗组件（与设置弹窗同构）
 */
export function CommitDetailModal(props: {
  commit: any;
  onClose: () => void;
  cwd?: string | null;
}) {
  if (!props.commit) return null;
  var c = props.commit;
  var h = React.createElement;
  var [fetchedDetail, setFetchedDetail] = React.useState(null as string | null);
  var [fetchingDetail, setFetchingDetail] = React.useState(false);

  React.useEffect(function () {
    var onKeyDown = function (e: any) {
      if (e.key === "Escape" || e.keyCode === 27) props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return function () { window.removeEventListener("keydown", onKeyDown); };
  }, [props.onClose]);

  React.useEffect(function () {
    setFetchedDetail(null);
    if (c.body || c.stat) return;
    setFetchingDetail(true);
    var url = "/api/github/commit-detail?sha=" + encodeURIComponent(c.sha) + (props.cwd ? "&cwd=" + encodeURIComponent(props.cwd) : "");
    fetch(url)
      .then(function (r: any) { return r.json(); })
      .then(function (j: any) {
        setFetchingDetail(false);
        if (j && j.ok && j.detail) setFetchedDetail(j.detail);
      })
      .catch(function () { setFetchingDetail(false); });
  }, [c.sha, props.cwd]);

  var effectiveBody = c.body;
  var effectiveStat = c.stat;
  if (!effectiveBody && !effectiveStat && fetchedDetail) {
    effectiveStat = fetchedDetail;
  }

  return h(
    "div",
    {
      className: "dsh-github-modal-overlay",
      onClick: props.onClose,
      style: { zIndex: 100000 },
    },
    h(
      "div",
      {
        className: "dsh-github-modal-dialog",
        style: { width: "94%", maxWidth: "460px", maxHeight: "84vh", display: "flex", flexDirection: "column", overflow: "hidden" },
        onClick: function (e: any) { e.stopPropagation(); },
      },
      h(
        "div",
        { className: "dsh-github-modal-header", style: { flexShrink: 0 } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          renderGitIcon(15, "#1296db"),
          h("h3", { style: { margin: 0, fontSize: "14px", fontWeight: 600 } }, "提交详情")
        ),
        h(
          "button",
          {
            style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #656d76)", padding: "0 4px" },
            onClick: props.onClose,
            title: "关闭 (Esc)",
          },
          "✕"
        )
      ),
      h(
        "div",
        {
          className: "dsh-github-modal-body",
          style: { padding: "16px", overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "12px", boxSizing: "border-box" },
        },
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", opacity: 0.85 } },
          h("span", { style: { fontFamily: "monospace", fontWeight: 600, userSelect: "all" }, title: "完整 SHA: " + (c.fullSha || c.sha) }, c.fullSha || c.sha),
          h("span", null, c.relative)
        ),
        h(
          "div",
          { style: { fontSize: "13px", fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2328)", wordBreak: "break-word", lineHeight: "1.45" } },
          c.subject
        ),
        h(
          "div",
          { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)" } },
          `提交者: ${c.author}${c.email ? ` <${c.email}>` : ""}${c.date ? ` · ${c.date}` : ""}`
        ),
        effectiveBody
          ? h(
              "div",
              {
                style: {
                  fontSize: "12px",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "var(--dsw-alias-bg-module-platform, #f6f8fa)",
                  border: "1px solid var(--dsw-alias-border-l2, #e1e4e8)",
                },
              },
              effectiveBody
            )
          : null,
        effectiveStat
          ? h(
              "div",
              null,
              h("div", { style: { fontSize: "11px", fontWeight: 600, marginBottom: "4px", opacity: 0.8 } }, "📁 文件变更统计:"),
              h(
                "pre",
                {
                  className: "dsh-github-commit-pre",
                  style: {
                    fontSize: "11px",
                    lineHeight: "1.5",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                    maxHeight: "34vh",
                    overflowY: "auto",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    background: "var(--dsw-alias-bg-module-platform, #f6f8fa)",
                    border: "1px solid var(--dsw-alias-border-l2, #e1e4e8)",
                  },
                },
                effectiveStat
              )
            )
          : null,
        !effectiveBody && !effectiveStat
          ? (fetchingDetail
              ? h("div", { style: { fontSize: "12px", opacity: 0.7, padding: "8px 0" } }, "⏳ 正在获取详细变更说明…")
              : h("div", { style: { fontSize: "11px", opacity: 0.6, fontStyle: "italic", padding: "6px 0" } }, "（该提交未包含多行正文；重启 DSH 桌面端可同步最新格式并直接呈现变更统计）"))
          : null
      )
    )
  );
}
