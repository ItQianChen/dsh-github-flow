declare const React: any;
declare function renderGitIcon(size?: number, color?: string): any;
declare function parseGitStatText(statText: string): any;

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

  var parsedStat = React.useMemo(() => {
    return effectiveStat && typeof parseGitStatText === "function" ? parseGitStatText(effectiveStat) : null;
  }, [effectiveStat]);

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
        style: { width: "94%", maxWidth: "520px", maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" },
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
              { style: { display: "flex", flexDirection: "column", gap: "6px" } },
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    fontWeight: 600,
                  },
                },
                h(
                  "div",
                  { style: { opacity: 0.85, display: "flex", alignItems: "center", gap: "6px" } },
                  "📁 文件变更统计",
                  parsedStat?.summary
                    ? h("span", { style: { opacity: 0.65, fontWeight: 400 } }, `(${parsedStat.summary.filesChanged} 个文件)`)
                    : parsedStat?.files
                    ? h("span", { style: { opacity: 0.65, fontWeight: 400 } }, `(${parsedStat.files.length} 个文件)`)
                    : null
                ),
                parsedStat?.summary
                  ? h(
                      "div",
                      { style: { display: "flex", gap: "6px", fontFamily: "monospace", fontWeight: 600 } },
                      parsedStat.summary.insertions > 0
                        ? h(
                            "span",
                            {
                              style: {
                                color: "var(--dsw-alias-state-success-primary, #1a7f37)",
                                backgroundColor: "var(--dsw-alias-state-success-subtle, rgba(46,160,67,0.12))",
                                padding: "1px 6px",
                                borderRadius: "10px",
                              },
                            },
                            `+${parsedStat.summary.insertions}`
                          )
                        : null,
                      parsedStat.summary.deletions > 0
                        ? h(
                            "span",
                            {
                              style: {
                                color: "var(--dsw-alias-state-error-primary, #cf222e)",
                                backgroundColor: "var(--dsw-alias-state-error-subtle, rgba(248,81,73,0.12))",
                                padding: "1px 6px",
                                borderRadius: "10px",
                              },
                            },
                            `-${parsedStat.summary.deletions}`
                          )
                        : null
                    )
                  : null
              ),
              parsedStat && parsedStat.files && parsedStat.files.length > 0
                ? h(
                    "div",
                    {
                      className: "dsh-github-stat-list",
                      style: {
                        borderRadius: "6px",
                        border: "1px solid var(--dsw-alias-border-l2, #e1e4e8)",
                        background: "var(--dsw-alias-bg-module-platform, #f6f8fa)",
                        maxHeight: "36vh",
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                      },
                    },
                    parsedStat.files.map(function (f: any, idx: number) {
                      var diffBlocks: any[] = [];
                      if (!f.isBinary && f.total > 0) {
                        var totalRatio = f.additions + f.deletions;
                        var addBlocks = totalRatio > 0 ? Math.round((f.additions / totalRatio) * 5) : 0;
                        var delBlocks = totalRatio > 0 ? Math.round((f.deletions / totalRatio) * 5) : 0;
                        if (f.additions > 0 && addBlocks === 0) addBlocks = 1;
                        if (f.deletions > 0 && delBlocks === 0) delBlocks = 1;
                        while (addBlocks + delBlocks > 5) {
                          if (addBlocks > delBlocks) addBlocks--;
                          else delBlocks--;
                        }
                        var neutralBlocks = Math.max(0, 5 - addBlocks - delBlocks);

                        for (var bi = 0; bi < addBlocks; bi++) {
                          diffBlocks.push(h("span", { key: "a" + bi, style: { width: "3px", height: "8px", borderRadius: "1px", backgroundColor: "var(--dsw-alias-state-success-primary, #1a7f37)" } }));
                        }
                        for (var bj = 0; bj < delBlocks; bj++) {
                          diffBlocks.push(h("span", { key: "d" + bj, style: { width: "3px", height: "8px", borderRadius: "1px", backgroundColor: "var(--dsw-alias-state-error-primary, #cf222e)" } }));
                        }
                        for (var bk = 0; bk < neutralBlocks; bk++) {
                          diffBlocks.push(h("span", { key: "n" + bk, style: { width: "3px", height: "8px", borderRadius: "1px", backgroundColor: "var(--dsw-alias-border-subtle, rgba(0,0,0,0.15))" } }));
                        }
                      }

                      return h(
                        "div",
                        {
                          key: idx,
                          className: "dsh-github-stat-row",
                          style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 10px",
                            fontSize: "11px",
                            lineHeight: "1.4",
                            borderBottom: idx < parsedStat.files.length - 1 ? "1px solid var(--dsw-alias-border-subtle, rgba(0,0,0,0.06))" : "none",
                            gap: "8px",
                          },
                          title: f.path + (f.isBinary ? " (二进制文件)" : ` (+${f.additions}, -${f.deletions})`),
                        },
                        h(
                          "div",
                          {
                            style: {
                              fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              flex: 1,
                              minWidth: 0,
                              color: "var(--dsw-alias-label-primary, #1f2328)",
                            },
                          },
                          f.path
                        ),
                        h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              flexShrink: 0,
                              fontFamily: "monospace",
                              fontWeight: 600,
                            },
                          },
                          f.isBinary
                            ? h("span", { style: { opacity: 0.6, fontSize: "10px" } }, "二进制")
                            : [
                                f.additions > 0
                                  ? h(
                                      "span",
                                      {
                                        key: "add",
                                        style: { color: "var(--dsw-alias-state-success-primary, #1a7f37)" },
                                      },
                                      `+${f.additions}`
                                    )
                                  : null,
                                f.deletions > 0
                                  ? h(
                                      "span",
                                      {
                                        key: "del",
                                        style: { color: "var(--dsw-alias-state-error-primary, #cf222e)" },
                                      },
                                      `-${f.deletions}`
                                    )
                                  : null,
                                diffBlocks.length > 0
                                  ? h(
                                      "div",
                                      {
                                        key: "bar",
                                        style: { display: "flex", gap: "1px", marginLeft: "2px", alignItems: "center" },
                                      },
                                      ...diffBlocks
                                    )
                                  : null,
                              ]
                        )
                      );
                    })
                  )
                : h(
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
