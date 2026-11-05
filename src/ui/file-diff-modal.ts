declare const React: any;

/**
 * 文件 Diff 预览弹窗（未提交清单 / 提交详情共用）。
 *
 * 为什么合成一个组件：
 * 1. 未提交清单原本把整个 section 换成「二级视图」（`activeDiffFile ? 二级视图 : 列表`），
 *    观感像另开一页；改成弹窗后列表留在原位，返回成本从一次重渲染变成一次 Esc；
 * 2. 提交详情也要「点文件看 diff」，两处只是**数据来源**不同（一个是 `/api/github/file-diff`，
 *    一个是整包 patch 切出来的一段），外壳/配色/错误态/复制逻辑完全同构，分两份必然漂移。
 *
 * 404 降级保留：桌面端未重启时新路由不存在，先回退到常驻的 `/api/github/action`，
 * 再不行才显式提示「重启桌面端」——这是 file-diff 链路既有的自愈策略。
 */
export function FileDiffModal(props: {
  file: { path: string; status?: string; additions?: number; deletions?: number; isBinary?: boolean };
  cwd?: string | null;
  /** 已有补丁正文（提交详情场景：由整包 patch 切出）；缺省时按未提交路由自行拉取 */
  diffText?: string | null;
  /** 顶部副标题（如提交短 SHA） */
  subtitle?: string | null;
  /** 附加提示（如补丁被截断） */
  note?: string | null;
  loading?: boolean;
  error?: string | null;
  zIndex?: number;
  onClose: () => void;
  onOpenInDsh?: ((filePath: string) => void) | null;
}) {
  var h = React.createElement;
  var f = props.file;
  var selfFetch = props.diffText === undefined || props.diffText === null;
  var [fetched, setFetched] = React.useState(null as any);
  var [fetching, setFetching] = React.useState(selfFetch);
  var [fetchError, setFetchError] = React.useState(null as string | null);
  var [copied, setCopied] = React.useState(false);

  React.useEffect(function () {
    var onKeyDown = function (e: any) {
      if (e.key === "Escape" || e.keyCode === 27) props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return function () { window.removeEventListener("keydown", onKeyDown); };
  }, [props.onClose]);

  React.useEffect(function () {
    if (!selfFetch) return;
    setFetching(true);
    setFetchError(null);
    setFetched(null);

    var run = async function () {
      var primaryUrl = "/api/github/file-diff?file=" + encodeURIComponent(f.path) + (props.cwd ? "&cwd=" + encodeURIComponent(props.cwd) : "");
      var readJson = async function (res: any) {
        var text = await res.text().catch(function () { return ""; });
        var json: any = null;
        if (text && (text.trim().charAt(0) === "{" || text.trim().charAt(0) === "[")) {
          try { json = JSON.parse(text); } catch (e) {}
        }
        return { ok: res.ok, status: res.status, text: text, json: json };
      };

      try {
        var p1 = await readJson(await fetch(primaryUrl));
        if (p1.ok && p1.json && p1.json.ok && p1.json.data) {
          setFetched(p1.json.data);
          setFetching(false);
          return;
        }
        // 主路由 404：后端常驻进程还没载入新路由 → 先退到既有 action 通道
        if (p1.status === 404) {
          var r2 = await fetch("/api/github/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get_file_diff", file: f.path, cwd: props.cwd || undefined }),
          }).catch(function () { return null; });
          if (r2) {
            var p2 = await readJson(r2);
            if (p2.ok && p2.json && p2.json.data) {
              setFetched(p2.json.data);
              setFetching(false);
              return;
            }
          }
          setFetching(false);
          setFetchError("后端对比接口未激活 (404)。请重启 DSH 桌面主程序以载入最新对比引擎；您也可点击上方「在 DSH 中打开」直接预览文件源码。");
          return;
        }
        setFetching(false);
        setFetchError(p1.json && p1.json.error ? p1.json.error : (p1.text || ("查询差异失败 (HTTP " + p1.status + ")")));
      } catch (err: any) {
        setFetching(false);
        setFetchError((err && err.message) || "网络请求异常");
      }
    };
    run();
  }, [f.path, props.cwd, selfFetch]);

  var diffText = selfFetch ? (fetched && fetched.diff) || "" : String(props.diffText || "");
  var isBinary = Boolean(props.file.isBinary || (fetched && fetched.isBinary));
  var additions = props.file.additions !== undefined ? props.file.additions : (fetched ? fetched.additions : undefined);
  var deletions = props.file.deletions !== undefined ? props.file.deletions : (fetched ? fetched.deletions : undefined);
  var loading = props.loading === true || (selfFetch && fetching);
  var error = props.error || (selfFetch ? fetchError : null);

  var status = String(props.file.status || "");
  var statusColor = status === "??" ? "var(--dsw-alias-state-success-primary, #1a7f37)"
    : status.indexOf("D") >= 0 ? "var(--dsw-alias-state-error-primary, #cf222e)"
    : "var(--dsw-alias-state-attention-primary, #9a6700)";
  var statusText = status === "??" ? "未跟踪新增"
    : status.indexOf("D") >= 0 ? "已删除"
    : status.indexOf("R") >= 0 ? "已重命名"
    : status ? "已修改" : "";

  var copyDiff = function () {
    if (!diffText) return;
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(diffText).then(function () {
        setCopied(true);
        setTimeout(function () { setCopied(false); }, 2000);
      }).catch(function () {});
    }
  };

  var renderLines = function () {
    var lines = diffText.split("\n");
    return lines.map(function (line: string, idx: number) {
      var isAdd = line.charAt(0) === "+" && line.indexOf("+++") !== 0;
      var isDel = line.charAt(0) === "-" && line.indexOf("---") !== 0;
      var isHunk = line.indexOf("@@") === 0;
      var isHeader = line.indexOf("diff --git") === 0 || line.indexOf("index ") === 0
        || line.indexOf("---") === 0 || line.indexOf("+++") === 0
        || line.indexOf("new file mode") === 0 || line.indexOf("deleted file mode") === 0
        || line.indexOf("similarity index") === 0 || line.indexOf("rename from") === 0
        || line.indexOf("rename to") === 0 || line.indexOf("Binary files") === 0;

      var lineStyle: any = { display: "flex", padding: "0 8px", whiteSpace: "pre", minWidth: "100%", boxSizing: "border-box" };
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
    });
  };

  return h(
    "div",
    {
      className: "dsh-github-modal-overlay",
      onClick: function (e: any) {
        // 叠在提交详情弹窗之上时，遮罩点击必须止住冒泡：
        // 外层 overlay 的 onClick 是「关闭提交详情」，不拦就会一次点击关掉两层
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        props.onClose();
      },
      style: { zIndex: props.zIndex === undefined ? 100001 : props.zIndex },
    },
    h(
      "div",
      {
        className: "dsh-github-modal-dialog",
        role: "dialog",
        "aria-label": "文件差异预览",
        style: { width: "94%", maxWidth: "920px", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" },
        onClick: function (e: any) { e.stopPropagation(); },
      },
      // 头部：状态 + 路径 + 增删统计 + 操作按钮
      h(
        "div",
        { className: "dsh-github-modal-header", style: { flexShrink: 0, gap: "8px" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 } },
          h("h3", { style: { margin: 0, fontSize: "14px", fontWeight: 600, flexShrink: 0 } }, "文件差异"),
          status
            ? h(
                "span",
                {
                  className: "dsh-github-badge",
                  style: { backgroundColor: statusColor + "22", color: statusColor, fontWeight: 600, fontSize: "11px", flexShrink: 0 },
                },
                status + " " + statusText
              )
            : null,
          additions !== undefined && deletions !== undefined
            ? h(
                "div",
                { style: { display: "flex", gap: "4px", fontSize: "11px", fontFamily: "monospace", flexShrink: 0 } },
                h("span", { style: { color: "var(--dsw-alias-state-success-primary, #1a7f37)", fontWeight: 600 } }, "+" + additions),
                h("span", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)", fontWeight: 600 } }, "-" + deletions)
              )
            : null,
          props.subtitle
            ? h("span", { style: { fontSize: "11px", opacity: 0.7, flexShrink: 0, fontFamily: "monospace" } }, props.subtitle)
            : null
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } },
          diffText
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
                  onClick: function () { if (props.onOpenInDsh) props.onOpenInDsh(f.path); },
                  title: "在 DSH 侧边栏打开该文件完整源码",
                },
                "📄 在 DSH 中打开"
              )
            : null,
          h(
            "button",
            {
              style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #656d76)", padding: "0 4px" },
              onClick: props.onClose,
              title: "关闭 (Esc)",
            },
            "✕"
          )
        )
      ),
      // 正文
      h(
        "div",
        {
          className: "dsh-github-modal-body",
          style: { padding: "12px 16px 16px", overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "8px", boxSizing: "border-box" },
        },
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
              flexShrink: 0,
            },
            title: f.path,
          },
          f.path
        ),
        loading
          ? h("div", { style: { padding: "32px 0", textAlign: "center", opacity: 0.65, fontSize: "12px" } }, "⏳ 正在计算 Git 代码比对差异...")
          : error
          ? h(
              "div",
              {
                style: {
                  padding: "12px 14px",
                  color: "var(--dsw-alias-label-primary, #1f2328)",
                  fontSize: "12px",
                  lineHeight: "1.6",
                  backgroundColor: "var(--dsw-alias-bg-subtle, rgba(0,0,0,0.03))",
                  borderRadius: "6px",
                },
              },
              h("div", { style: { color: "var(--dsw-alias-state-error-primary, #cf222e)", fontWeight: 600, marginBottom: "6px" } }, "⚠️ " + error)
            )
          : isBinary
          ? h("div", { style: { padding: "32px 0", textAlign: "center", opacity: 0.8, fontSize: "12px" } }, "📦 该文件为二进制格式（图片或编译产物），无法直接展示文本差异。")
          : !diffText
          ? h("div", { style: { padding: "32px 0", textAlign: "center", opacity: 0.7, fontSize: "12px" } }, "该文件在本次变更中没有可展示的文本差异。")
          : h(
              "div",
              {
                className: "dsh-github-inline-diff-view",
                style: { display: "flex", flexDirection: "column", gap: "8px", minHeight: "120px" },
              },
              h(
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
                    maxHeight: "62vh",
                    borderRadius: "6px",
                    border: "1px solid var(--dsw-alias-border-subtle, rgba(0,0,0,0.08))",
                    backgroundColor: "var(--dsw-alias-bg-canvas, #ffffff)",
                  },
                },
                renderLines()
              )
            ),
        props.note
          ? h(
              "div",
              { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", lineHeight: "1.6" } },
              "⚠️ " + props.note
            )
          : null
      )
    )
  );
}
