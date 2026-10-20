/**
 * PR 在线完整审阅与代码比对工作台模态弹窗组件。
 *
 * 架构设计：
 * 1. 单次网络往返拉取元数据与 Diff 切片，按文件切换比对 0ms 瞬间响应；
 * 2. 覆盖作者卡片、状态徽章、分支流向、正文描述、CI 与审查决定；
 * 3. 评论回复流 Timeline（Issue Comments + Review 评注）；
 * 4. 变动文件清单与行级高保真 Unified Diff 比对（绿色新增、红色删除、灰底 Hunk）。
 */
export function PrDetailModal(props) {
    var prNumber = props.prNumber;
    var repoNameWithOwner = props.repoNameWithOwner || "";
    var cwd = props.cwd;
    var onClose = props.onClose;
    var showToast = props.showToast || (() => { });
    // 严格遵守 React Hooks 铁律：所有 Hooks 必须无条件在顶层执行，
    // 严禁在 early return 之后调用。否则「prNumber 由空变有值」时
    // 两次渲染的 Hook 数量不一致，会触发
    // "Rendered fewer hooks than expected" 的致命运行时崩溃。
    var [data, setData] = React.useState(null);
    var [loading, setLoading] = React.useState(true);
    var [error, setError] = React.useState(null);
    var [activeTab, setActiveTab] = React.useState("conversation");
    var [selectedFilePath, setSelectedFilePath] = React.useState(null);
    var [copied, setCopied] = React.useState(false);
    // Hooks 执行完毕后再做空值短路
    if (!prNumber)
        return null;
    // Esc 键监听关闭
    React.useEffect(() => {
        var onKeyDown = (e) => {
            if (e.key === "Escape" || e.keyCode === 27)
                onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);
    // 拉取 PR 详情与差异数据
    React.useEffect(() => {
        // 无有效编号时不发请求（Hooks 已无条件执行，这里只做副作用守卫）
        if (!prNumber) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        var url = "/api/github/pr-detail?number=" +
            encodeURIComponent(String(prNumber)) +
            (repoNameWithOwner ? "&repo=" + encodeURIComponent(repoNameWithOwner) : "") +
            (cwd ? "&cwd=" + encodeURIComponent(cwd) : "");
        fetch(url)
            .then(async (res) => {
            if (!res.ok) {
                var errText = await res.text().catch(() => "");
                var j = null;
                try {
                    j = JSON.parse(errText);
                }
                catch (e) { }
                throw new Error(j?.error || j?.message || errText || `服务响应异常 (${res.status})`);
            }
            return res.json();
        })
            .then((json) => {
            setLoading(false);
            if (json && json.ok && json.data) {
                setData(json.data);
                // 默认选中第一个修改的文件
                if (Array.isArray(json.data.files) && json.data.files.length > 0) {
                    setSelectedFilePath(json.data.files[0].path);
                }
            }
            else {
                setError(json?.error || "获取 PR 详情失败");
            }
        })
            .catch((err) => {
            setLoading(false);
            setError(err?.message || "网络请求异常");
        });
    }, [prNumber, repoNameWithOwner, cwd]);
    var h = React.createElement;
    var copyText = (text, label) => {
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(() => {
                setCopied(true);
                showToast(`✅ ${label} 已复制到剪贴板`);
                setTimeout(() => setCopied(false), 2000);
            })
                .catch(() => { });
        }
    };
    // 渲染单行 Diff 高亮
    var renderDiffContent = (diffText) => {
        if (!diffText) {
            return h("div", { style: { padding: "32px 0", textAlign: "center", opacity: 0.65, fontSize: "12px" } }, "该文件未产生可识别的文本差异，或已被清空。");
        }
        return h("div", {
            className: "dsh-github-inline-diff-content",
            style: {
                margin: 0,
                padding: "4px 0",
                fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
                fontSize: "11px",
                lineHeight: "1.5",
                overflowX: "auto",
                borderRadius: "6px",
                border: "1px solid var(--dsw-alias-border-subtle, rgba(0,0,0,0.08))",
                backgroundColor: "var(--dsw-alias-bg-canvas, #ffffff)",
            },
        }, diffText.split("\n").map(function (line, idx) {
            var isAdd = line.startsWith("+") && !line.startsWith("+++");
            var isDel = line.startsWith("-") && !line.startsWith("---");
            var isHunk = line.startsWith("@@");
            var isHeader = line.startsWith("diff --git") ||
                line.startsWith("index ") ||
                line.startsWith("---") ||
                line.startsWith("+++");
            var lineStyle = {
                display: "flex",
                padding: "0 8px",
                whiteSpace: "pre",
                minWidth: "100%",
                boxSizing: "border-box",
            };
            if (isAdd) {
                lineStyle.backgroundColor = "var(--dsw-alias-state-success-subtle, rgba(46,160,67,0.15))";
                lineStyle.color = "var(--dsw-alias-state-success-primary, #1a7f37)";
            }
            else if (isDel) {
                lineStyle.backgroundColor = "var(--dsw-alias-state-error-subtle, rgba(248,81,73,0.15))";
                lineStyle.color = "var(--dsw-alias-state-error-primary, #cf222e)";
            }
            else if (isHunk) {
                lineStyle.backgroundColor = "var(--dsw-alias-bg-subtle, rgba(0,0,0,0.04))";
                lineStyle.color = "var(--dsw-alias-label-secondary, #656d76)";
                lineStyle.fontWeight = 600;
                lineStyle.margin = "2px 0";
            }
            else if (isHeader) {
                lineStyle.color = "var(--dsw-alias-label-muted, #8c959f)";
                lineStyle.fontSize = "10px";
            }
            else {
                lineStyle.color = "var(--dsw-alias-label-primary, #1f2328)";
            }
            return h("div", { key: idx, style: lineStyle }, line || " ");
        }));
    };
    return h("div", {
        className: "dsh-github-modal-overlay",
        onClick: onClose,
        style: { zIndex: 100000 },
    }, h("div", {
        className: "dsh-github-modal-dialog dsh-github-pr-modal-dialog",
        onClick: (e) => e.stopPropagation(),
    }, 
    // 头部 Header
    h("div", { className: "dsh-github-modal-header dsh-github-pr-modal-header" }, h("div", { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 } }, renderOctocat(18, "#8250df"), h("div", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 } }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } }, h("h3", {
        style: {
            margin: 0,
            fontSize: "14px",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
        },
    }, data ? `#${data.number} ${data.title}` : `PR #${prNumber}`), data
        ? h("span", {
            className: "dsh-github-badge " +
                (data.isDraft
                    ? "dsh-badge-yellow"
                    : data.state === "MERGED"
                        ? "dsh-badge-purple"
                        : data.state === "CLOSED"
                            ? "dsh-badge-red"
                            : "dsh-badge-green"),
            style: { fontSize: "10px", padding: "1px 6px" },
        }, data.isDraft ? "Draft" : data.state)
        : null), data
        ? h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } }, h("span", null, `👤 @${data.author.login}`), data.createdAt ? h("span", null, `· 提单于 ${formatRelativeTime(data.createdAt)}`) : null, h("span", { style: { fontFamily: "monospace", opacity: 0.85 } }, `(${data.headRefName} → ${data.baseRefName})`))
        : null)), h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } }, data?.url
        ? h("button", {
            className: "dsh-github-btn-sm",
            style: { padding: "4px 8px", fontSize: "11px" },
            onClick: () => copyText(data.url, "PR 链接"),
            title: "复制该 Pull Request 网页链接",
        }, copied ? "✓ 已复制" : "📋 复制链接")
        : null, data?.url
        ? h("a", {
            href: data.url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "dsh-github-btn-sm",
            style: { padding: "4px 8px", fontSize: "11px", textDecoration: "none", color: "inherit" },
            title: "在系统默认浏览器中打开该 PR 官方页面",
        }, "↗ 浏览器打开")
        : null, h("button", {
        style: {
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            color: "var(--dsw-alias-label-secondary, #656d76)",
            padding: "0 6px",
        },
        onClick: onClose,
        title: "关闭 (Esc)",
    }, "✕"))), 
    // 状态加载或异常
    loading
        ? h("div", { style: { padding: "64px 0", textAlign: "center", fontSize: "13px", opacity: 0.7 } }, "⏳ 正在加载 PR 详情与变更代码比对…")
        : error
            ? h("div", { style: { padding: "24px", margin: "16px", borderRadius: "8px", background: "rgba(248,81,73,0.08)", border: "1px solid rgba(248,81,73,0.3)" } }, h("div", { style: { fontWeight: 600, color: "#f85149", marginBottom: "6px" } }, "⚠️ 读取 PR 详情失败"), h("div", { style: { fontSize: "12px", opacity: 0.85 } }, error))
            : data
                ? h("div", { style: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" } }, 
                // Tab 切换导航
                h("div", { className: "dsh-github-pr-modal-tabs" }, h("button", {
                    className: `dsh-github-pr-tab-btn ${activeTab === "conversation" ? "active" : ""}`,
                    onClick: () => setActiveTab("conversation"),
                }, `💬 描述与讨论 (${data.comments ? data.comments.length : 0})`), h("button", {
                    className: `dsh-github-pr-tab-btn ${activeTab === "files" ? "active" : ""}`,
                    onClick: () => setActiveTab("files"),
                }, `📁 变动文件 (${data.files ? data.files.length : 0} 文件 · +${data.additions || 0} / -${data.deletions || 0})`)), 
                // Tab 1: 描述与讨论
                activeTab === "conversation"
                    ? h("div", { className: "dsh-github-modal-body dsh-github-pr-conversation-pane" }, 
                    // 审查与 CI 门禁卡片
                    h("div", { className: "dsh-github-pr-checks-bar" }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, h("span", { style: { fontWeight: 600 } }, "审查状态:"), h("span", {
                        className: "dsh-github-badge " +
                            (data.reviewDecision === "APPROVED"
                                ? "dsh-badge-green"
                                : data.reviewDecision === "CHANGES_REQUESTED"
                                    ? "dsh-badge-red"
                                    : "dsh-badge-yellow"),
                    }, data.reviewDecision || "REVIEW_REQUIRED")), h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontFamily: "monospace" } }, h("span", { style: { color: "var(--dsw-alias-state-success-primary, #1a7f37)", fontWeight: 600 } }, `+${data.additions}`), h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)", fontWeight: 600 } }, `-${data.deletions}`))), 
                    // PR 正文描述
                    h("div", { className: "dsh-github-pr-body-card" }, h("div", { className: "dsh-github-pr-comment-header" }, h("strong", null, `@${data.author.login}`), h("span", { style: { fontSize: "11px", opacity: 0.6 } }, "提单说明 (PR Body)")), h("div", {
                        style: {
                            padding: "12px",
                            fontSize: "12px",
                            lineHeight: "1.65",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                        },
                    }, data.body ? data.body : h("span", { style: { opacity: 0.5, fontStyle: "italic" } }, "（该 PR 未填写描述正文）"))), 
                    // 讨论与评审评论流
                    h("h4", { style: { margin: "14px 0 8px 0", fontSize: "13px", fontWeight: 600 } }, `讨论与评论时间线 (${(data.comments?.length || 0) + (data.reviews?.filter((r) => r.body)?.length || 0)})`), data.comments && data.comments.length > 0
                        ? data.comments.map(function (c) {
                            return h("div", { key: c.id, className: "dsh-github-pr-comment-card" }, h("div", { className: "dsh-github-pr-comment-header" }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, h("strong", null, `@${c.author.login}`), c.authorAssociation && c.authorAssociation !== "NONE"
                                ? h("span", { className: "dsh-github-badge dsh-badge-blue", style: { fontSize: "9px" } }, c.authorAssociation)
                                : null), h("span", { style: { fontSize: "11px", opacity: 0.6 } }, formatRelativeTime(c.createdAt))), h("div", { style: { padding: "10px 12px", fontSize: "12px", lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-word" } }, c.body));
                        })
                        : h("div", { style: { textAlign: "center", padding: "16px 0", fontSize: "12px", opacity: 0.6 } }, "💬 暂无讨论与评论"))
                    : null, 
                // Tab 2: 变动文件与 Diff 比对
                activeTab === "files"
                    ? h("div", { className: "dsh-github-pr-files-pane" }, 
                    // 左/上侧：变动文件列表
                    h("div", { className: "dsh-github-pr-file-list" }, data.files && data.files.length > 0
                        ? data.files.map(function (f) {
                            var isSelected = f.path === selectedFilePath;
                            return h("div", {
                                key: f.path,
                                className: "dsh-github-pr-file-item" + (isSelected ? " selected" : ""),
                                onClick: () => setSelectedFilePath(f.path),
                                title: `${f.path} (+${f.additions}, -${f.deletions})`,
                            }, h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 } }, f.path), h("div", { style: { display: "flex", gap: "4px", fontFamily: "monospace", fontSize: "10px", flexShrink: 0 } }, f.additions > 0 ? h("span", { style: { color: "var(--dsw-alias-state-success-primary, #1a7f37)" } }, `+${f.additions}`) : null, f.deletions > 0 ? h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)" } }, `-${f.deletions}`) : null));
                        })
                        : h("div", { style: { padding: "16px", opacity: 0.6 } }, "暂无变动文件记录")), 
                    // 右/下侧：当前选中文件的代码 Diff 视图
                    h("div", { className: "dsh-github-pr-diff-viewer" }, selectedFilePath
                        ? h("div", { style: { display: "flex", flexDirection: "column", height: "100%" } }, h("div", { className: "dsh-github-pr-diff-toolbar" }, h("span", { style: { fontFamily: "monospace", fontWeight: 600, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, selectedFilePath), data.fileDiffs && data.fileDiffs[selectedFilePath]
                            ? h("button", {
                                className: "dsh-github-btn-sm",
                                onClick: () => copyText(data.fileDiffs[selectedFilePath], "文件 Diff"),
                                style: { padding: "2px 8px", fontSize: "10px" },
                            }, copied ? "✓ 已复制" : "📋 复制文件 Diff")
                            : null), h("div", { style: { flex: 1, overflowY: "auto", minHeight: 0 } }, 
                        // 截断警告必须显式呈现：否则用户会把「拿不到 diff」误读成「代码没改动」
                        data.diffTruncated
                            ? h("div", {
                                style: {
                                    margin: "8px",
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    lineHeight: 1.5,
                                    background: "rgba(210, 153, 34, 0.12)",
                                    border: "1px solid rgba(210, 153, 34, 0.35)",
                                    color: "var(--dsw-alias-state-attention-primary, #9a6700)",
                                },
                            }, "⚠️ 该 PR 的 diff 体量过大已触达输出上限，部分文件可能无法展示差异。可点击右上角「↗ 浏览器打开」查看完整内容。")
                            : null, data.fileDiffs && data.fileDiffs[selectedFilePath]
                            ? renderDiffContent(data.fileDiffs[selectedFilePath])
                            : renderDiffContent(""), 
                        // 行级审查评论：挂在具体代码行上的 review comment。
                        // comments 字段只含对话区，这些必须来自独立通道；
                        // 放在文件 diff 下方并按行号标注——不嵌进 hunk 中间，
                        // 避免多行/折叠上下文下错位到错误的代码行。
                        (() => {
                            var fileComments = (Array.isArray(data.lineComments) ? data.lineComments : []).filter((c) => c.path === selectedFilePath);
                            if (fileComments.length === 0)
                                return null;
                            return h("div", { className: "dsh-github-pr-line-comments" }, h("div", { className: "dsh-github-pr-line-comments-title" }, `💬 该文件的行级审查评论 (${fileComments.length})`), fileComments.map(function (c) {
                                return h("div", { key: c.id, className: "dsh-github-pr-line-comment-item" }, h("div", { className: "dsh-github-pr-line-comment-head" }, h("strong", null, `@${c.author?.login || "unknown"}`), c.line
                                    ? h("span", {
                                        style: {
                                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                            fontSize: "10px",
                                            padding: "0 5px",
                                            borderRadius: "8px",
                                            background: "rgba(130, 80, 223, 0.12)",
                                            color: "#8250df",
                                        },
                                        title: `评论锚定在${c.side === "LEFT" ? "旧" : "新"}文件第 ${c.line} 行`,
                                    }, `L${c.line}${c.side === "LEFT" ? " (旧)" : ""}`)
                                    : null, h("span", { style: { fontSize: "10px", opacity: 0.6 } }, formatRelativeTime(c.createdAt))), h("div", { className: "dsh-github-pr-line-comment-body" }, c.body));
                            }));
                        })()))
                        : h("div", { style: { padding: "32px 0", textAlign: "center", opacity: 0.6 } }, "请从左侧选择需要审阅的文件")))
                    : null)
                : null));
}
