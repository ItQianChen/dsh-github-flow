import { prStateBadge, issueStateBadge } from '../shared/state-badges.js';
declare const React: any;
declare function renderOctocat(size?: number, color?: string): any;
declare function formatRelativeTime(iso: any): string;
// storage / markdown-lite / pr-modal 均在 leadingModules 中先于本模块内联，
// 因此这里可直接把它们的顶层函数当作闭包内全局使用。
// 实际只依赖 CollapsibleBody：它内部已经串好 markdown-lite 的解析 + 渲染管线，
// 重复声明解析函数只会在本模块留下永不使用的影子符号。
declare function CollapsibleBody(props: { text: string; defaultExpanded: boolean; idPrefix: string }): any;

/**
 * GitHub 关闭原因的状态语义映射。
 * 实测 `stateReason` 取值域：COMPLETED / NOT_PLANNED / REOPENED / ''（空串）。
 * 空串在关闭态下表示「未给出原因」，不渲染徽章即可。
 */
var ISSUE_STATE_REASON_LABEL: Record<string, string> = {
  COMPLETED: '已完成',
  NOT_PLANNED: '不计划处理',
  REOPENED: '已重开',
};

/** `#d73a4a` 形态的标签色转 rgba；非法色值退回中性灰，绝不让颜色拼错导致整块渲染失败 */
function labelRgba(hex: any, alpha: number): string {
  var raw = typeof hex === 'string' ? hex.replace('#', '').trim() : '';
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return 'rgba(140, 149, 159, ' + alpha + ')';
  var r = parseInt(raw.slice(0, 2), 16);
  var g = parseInt(raw.slice(2, 4), 16);
  var b = parseInt(raw.slice(4, 6), 16);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

/**
 * 格式化里程碑截止日（未来 / 过去双向）。
 *
 * 为什么不能直接用 formatRelativeTime：它把**所有未来时间**都归一成「刚刚」
 * （见 utils.ts 的 `if (diff < 0) return "刚刚"`，那是为更新时间/创建时间这类
 * 永不为未来的字段设计的）。而里程碑 dueOn 绝大多数都在未来，
 * 直接套用会把「30 天后到期」渲染成「刚刚截止」——语义完全反过来。
 */
function formatDueDate(iso: any): string {
  var t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (isNaN(t)) return '';
  var diff = t - Date.now();
  var DAY = 86400000;
  var days = Math.ceil(Math.abs(diff) / DAY);
  if (diff >= 0) {
    if (days <= 0) return '今天到期';
    if (days === 1) return '明天到期';
    if (days < 30) return days + ' 天后到期';
    if (days < 365) return Math.round(days / 30) + ' 个月后到期';
    return Math.round(days / 365) + ' 年后到期';
  }
  if (days <= 0) return '今天已到期';
  if (days === 1) return '昨天已到期';
  if (days < 30) return '已逾期 ' + days + ' 天';
  if (days < 365) return '已逾期 ' + Math.round(days / 30) + ' 个月';
  return '已逾期 ' + Math.round(days / 365) + ' 年';
}

/**
 * 图片附件清单。
 *
 * 为什么不在弹窗里直接 <img src>：图片可能来自任意 https 外域，直连会把
 * 宿主页面的 Referer 与来源暴露给第三方，也绕过插件的域名白名单防线。
 * 这里只给可点外链，由用户显式决定是否打开。
 */
function IssueImageList(props: { urls: string[] }) {
  var h = React.createElement;
  var urls = Array.isArray(props.urls) ? props.urls : [];
  var st = React.useState(false);
  var open = st[0];
  var setOpen = st[1];
  if (urls.length === 0) return null;

  return h(
    "span",
    { className: "dsh-github-issue-image-badge" },
    h(
      "button",
      {
        type: "button",
        className: "dsh-github-issue-chip dsh-github-issue-chip-btn",
        onClick: function () { setOpen(!open); },
        title: open ? "收起图片清单" : "展开图片链接清单（不在面板内直连渲染）",
        "aria-expanded": open ? "true" : "false",
      },
      "📎 " + urls.length + " 张图片"
    ),
    open
      ? h(
          // 用 span 而非 div：整个元数据条本身是 span 级 content 容器，
          // div 嵌在 span 里虽然浏览器会容错，但属于非法嵌套。
          "span",
          { className: "dsh-github-issue-image-links" },
          urls.map(function (u: string) {
            var name = u.split("?")[0].split("/").pop() || u;
            return h(
              "a",
              {
                key: u,
                href: u,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "dsh-github-issue-image-link",
                title: u,
              },
              "🖼 " + (name.length > 42 ? name.slice(0, 42) + "…" : name)
            );
          })
        )
      : null
  );
}

/**
 * 单条评论卡片。
 *
 * 为什么提到模块顶层：函数体内定义的组件每次父级渲染都会产生新引用，
 * React 按引用比较类型会卸载重建，CollapsibleBody 的展开状态随之重置。
 * 这是 pr-modal 上已经踩过的坑，Issue 侧不走第二遍。
 */
function IssueCommentCard(props: { comment: any }) {
  var h = React.createElement;
  var c = props.comment;
  var author = c && c.author ? c.author.login : "ghost";
  var hidden = Boolean(c && c.isMinimized);

  return h(
    "div",
    { className: "dsh-github-issue-comment-card" },
    h(
      "div",
      { className: "dsh-github-issue-comment-header" },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 } },
        h("strong", null, "@" + author),
        c && c.authorAssociation && c.authorAssociation !== "NONE"
          ? h("span", { className: "dsh-github-badge dsh-badge-blue", style: { fontSize: "9px" } }, c.authorAssociation)
          : null,
        c && c.includesCreatedEdit ? h("span", { style: { fontSize: "10px", opacity: 0.6 } }, "· 已编辑") : null,
        hidden
          ? h(
              "span",
              {
                className: "dsh-github-badge dsh-badge-red",
                style: { fontSize: "9px" },
                title: "GitHub 判定该评论被折叠（常见原因：垃圾信息 / 攻击性内容）",
              },
              "已隐藏" + (c.minimizedReason ? "(" + c.minimizedReason + ")" : "")
            )
          : null
      ),
      h("span", { style: { fontSize: "11px", opacity: 0.6, flexShrink: 0 } }, formatRelativeTime(c.createdAt))
    ),
    h(
      "div",
      { style: { padding: "10px 12px" } },
      h(CollapsibleBody, { text: c.body, defaultExpanded: false, idPrefix: "ic-" + c.id })
    )
  );
}

export interface IssueDetailModalProps {
  issueNumber: number;
  repoNameWithOwner?: string;
  cwd?: string | null;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

/**
 * Issue 在线查看弹窗（详情 + 元数据 + 评论时间线）。
 *
 * 与 PrDetailModal 的差异：Issue 没有 diff 载荷，因此不做双栏文件区，
 * 单列纵向滚动即可——多出来的宽度全部让给 Markdown 正文，可读性更好。
 */
export function IssueDetailModal(props: IssueDetailModalProps) {
  var issueNumber = props.issueNumber;
  var repoNameWithOwner = props.repoNameWithOwner || "";
  var cwd = props.cwd;
  var onClose = props.onClose;
  var showToast = props.showToast || (function () {});

  // Hooks 必须先于任何 early return 无条件执行（见 pr-modal 的同类注释）：
  // 否则「issueNumber 由空变有值」时两次渲染的 Hook 数量不一致，直接崩。
  // 注意 useState 与 useEffect 都必须在这个位置之前——early return 卡在两者
  // 中间时，首帧（无编号）会跳过全部 effect，有编号的首帧却多出两个 effect，
  // 同样违反「每次渲染 Hook 序列一致」。
  var [data, setData] = React.useState(null as any);
  var [loading, setLoading] = React.useState(true);
  var [error, setError] = React.useState(null as string | null);
  var [copied, setCopied] = React.useState(false);

  React.useEffect(function () {
    var onKeyDown = function (e: any) {
      if (e.key === "Escape" || e.keyCode === 27) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return function () { window.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  React.useEffect(function () {
    if (!issueNumber) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    var url =
      "/api/github/issue-detail?number=" +
      encodeURIComponent(String(issueNumber)) +
      (repoNameWithOwner ? "&repo=" + encodeURIComponent(repoNameWithOwner) : "") +
      (cwd ? "&cwd=" + encodeURIComponent(cwd) : "");

    fetch(url)
      .then(async function (res) {
        if (!res.ok) {
          var errText = await res.text().catch(function () { return ""; });
          var j: any = null;
          try { j = JSON.parse(errText); } catch (e) {}
          throw new Error((j && j.error) || errText || ("服务响应异常 (" + res.status + ")"));
        }
        return res.json();
      })
      .then(function (json) {
        setLoading(false);
        if (json && json.ok && json.data) {
          setData(json.data);
        } else {
          setError((json && json.error) || "获取 Issue 详情失败");
        }
      })
      .catch(function (err) {
        setLoading(false);
        setError((err && err.message) || "网络请求异常");
      });
  }, [issueNumber, repoNameWithOwner, cwd]);

  if (!issueNumber) return null;

  var h = React.createElement;

  var copyLink = function (text: string) {
    if (!text) return;
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          setCopied(true);
          showToast("✅ Issue 链接已复制到剪贴板");
          setTimeout(function () { setCopied(false); }, 2000);
        })
        .catch(function () {});
    }
  };

  var stateBadge = function (d: any) {
    if (!d) return null;
    // 状态→色调来自 shared/state-badges（与右侧栏 / CLI 输出同一份映射）
    var b = issueStateBadge(d.state);
    if (!b) return null;
    return h(
      "span",
      {
        className: "dsh-github-badge dsh-badge-" + b.tone,
        style: { fontSize: "10px", padding: "1px 6px", flexShrink: 0 },
      },
      b.label
    );
  };

  /**
   * 元数据条：只渲染真实存在的字段。
   * 空的「无标签 / 无指派 / 无里程碑」占位没有信息量，只会把正文推得更远。
   */
  var metaChips = function (d: any) {
    var chips: any[] = [];

    var reason = d.stateReason ? ISSUE_STATE_REASON_LABEL[String(d.stateReason).toUpperCase()] : "";
    if (reason) {
      chips.push(
        h(
          "span",
          {
            key: "reason",
            className: "dsh-github-issue-chip",
            title: "关闭原因 (stateReason): " + d.stateReason,
          },
          "✓ " + reason
        )
      );
    }

    if (d.isPinned) {
      chips.push(h("span", { key: "pin", className: "dsh-github-issue-chip" }, "📌 置顶"));
    }

    if (d.issueType) {
      chips.push(h("span", { key: "type", className: "dsh-github-issue-chip" }, "🏷️ " + d.issueType));
    }

    (Array.isArray(d.labels) ? d.labels : []).forEach(function (l: any, i: number) {
      chips.push(
        h(
          "span",
          {
            key: "label-" + i + "-" + l.name,
            className: "dsh-github-issue-chip dsh-github-issue-label-chip",
            style: {
              background: labelRgba(l.color, 0.14),
              borderColor: labelRgba(l.color, 0.45),
            },
            title: l.description || l.name,
          },
          h("span", {
            className: "dsh-github-issue-label-dot",
            style: { background: labelRgba(l.color, 0.9) },
          }),
          l.name
        )
      );
    });

    (Array.isArray(d.assignees) ? d.assignees : []).forEach(function (a: any, i: number) {
      chips.push(h("span", { key: "asg-" + i, className: "dsh-github-issue-chip" }, "👤 " + a.login));
    });

    if (d.milestone && d.milestone.title) {
      var dueText = d.milestone.dueOn ? formatDueDate(d.milestone.dueOn) : '';
      chips.push(
        h(
          "span",
          {
            key: "milestone",
            className: "dsh-github-issue-chip" + (dueText.indexOf('已逾期') >= 0 ? " dsh-github-issue-chip-overdue" : ""),
            title: d.milestone.dueOn ? "截止 " + d.milestone.dueOn : "未设置截止日期",
          },
          "🏁 " + d.milestone.title + (dueText ? " · " + dueText : "")
        )
      );
    }

    if (d.subIssues && Number(d.subIssues.total) > 0) {
      chips.push(
        h(
          "span",
          { key: "sub", className: "dsh-github-issue-chip" },
          "🧩 子议题 " + d.subIssues.completed + "/" + d.subIssues.total
        )
      );
    }

    (Array.isArray(d.linkedPrs) ? d.linkedPrs : []).forEach(function (p: any, i: number) {
      chips.push(
        h(
          "a",
          {
            key: "pr-" + i,
            className: "dsh-github-issue-chip dsh-github-issue-chip-link",
            href: p.url,
            target: "_blank",
            rel: "noopener noreferrer",
            title: "该 Issue 被此 Pull Request 关联/关闭",
          },
          "🔗 PR #" + p.number
        )
      );
    });

    chips.push(h(IssueImageList, { key: "images", urls: d.images || [] }));

    return chips.length > 0 ? h("div", { className: "dsh-github-issue-meta" }, ...chips) : null;
  };

  var bodyCard = function (d: any) {
    return h(
      "div",
      { className: "dsh-github-issue-body-card" },
      h(
        "div",
        { className: "dsh-github-issue-comment-header" },
        h("strong", null, "@" + d.author.login),
        h("span", { style: { fontSize: "11px", opacity: 0.6 } }, "提单说明 (Issue Body)")
      ),
      h(
        "div",
        { className: "dsh-github-issue-body-content" },
        d.body
          ? h(CollapsibleBody, { text: d.body, defaultExpanded: true, idPrefix: "issue-body" })
          : h("span", { style: { opacity: 0.5, fontStyle: "italic" } }, "（该 Issue 未填写正文）")
      )
    );
  };

  return h(
    "div",
    { className: "dsh-github-modal-overlay", onClick: onClose, style: { zIndex: 100000 } },
    h(
      "div",
      {
        className: "dsh-github-modal-dialog dsh-github-issue-modal-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Issue #" + issueNumber + " 详情",
        onClick: function (e: any) { e.stopPropagation(); },
      },
      // 头部
      h(
        "div",
        { className: "dsh-github-modal-header dsh-github-issue-modal-header" },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 } },
          renderOctocat(18, "#1f883d"),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 } },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
              h(
                "h3",
                {
                  style: {
                    margin: 0,
                    fontSize: "14px",
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                  title: data ? "#" + data.number + " " + data.title : "Issue #" + issueNumber,
                },
                data ? "#" + data.number + " " + data.title : "Issue #" + issueNumber
              ),
              stateBadge(data)
            ),
            data
              ? h(
                  "div",
                  {
                    style: {
                      fontSize: "11px",
                      color: "var(--dsw-alias-label-secondary, #656d76)",
                      display: "flex",
                      gap: "6px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    },
                  },
                  h("span", null, "👤 @" + data.author.login),
                  data.createdAt ? h("span", null, "· 提单于 " + formatRelativeTime(data.createdAt)) : null,
                  data.closedAt ? h("span", null, "· 关闭于 " + formatRelativeTime(data.closedAt)) : null,
                  repoNameWithOwner
                    ? h("span", { style: { fontFamily: "monospace", opacity: 0.85 } }, repoNameWithOwner)
                    : null
                )
              : null
          )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } },
          data && data.url
            ? h(
                "button",
                {
                  type: "button",
                  className: "dsh-github-btn-sm",
                  style: { padding: "4px 8px", fontSize: "11px" },
                  onClick: function () { copyLink(data.url); },
                  title: "复制该 Issue 网页链接",
                },
                copied ? "✓ 已复制" : "📋 复制链接"
              )
            : null,
          data && data.url
            ? h(
                "a",
                {
                  href: data.url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  className: "dsh-github-btn-sm",
                  style: { padding: "4px 8px", fontSize: "11px", textDecoration: "none", color: "inherit" },
                  title: "在系统默认浏览器中打开该 Issue",
                },
                "↗ 浏览器打开"
              )
            : null,
          h(
            "button",
            {
              type: "button",
              "aria-label": "关闭 (Esc)",
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
            },
            "✕"
          )
        )
      ),

      // 主体
      loading
        ? h("div", { style: { padding: "64px 0", textAlign: "center", fontSize: "13px", opacity: 0.7 } }, "⏳ 正在加载 Issue 详情与讨论…")
        : error
        ? h(
            "div",
            {
              style: {
                padding: "24px",
                margin: "16px",
                borderRadius: "8px",
                background: "rgba(248,81,73,0.08)",
                border: "1px solid rgba(248,81,73,0.3)",
              },
            },
            h("div", { style: { fontWeight: 600, color: "#f85149", marginBottom: "6px" } }, "⚠️ 读取 Issue 详情失败"),
            h("div", { style: { fontSize: "12px", opacity: 0.85, lineHeight: 1.6 } }, error),
            repoNameWithOwner
              ? h(
                  "a",
                  {
                    href: "https://github.com/" + repoNameWithOwner + "/issues/" + issueNumber,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    className: "dsh-github-btn-sm",
                    style: { display: "inline-block", marginTop: "12px", padding: "4px 10px", fontSize: "11px", textDecoration: "none" },
                  },
                  "↗ 在浏览器中查看"
                )
              : null
          )
        : data
        ? h(
            "div",
            { className: "dsh-github-issue-conversation-pane" },
            metaChips(data),
            bodyCard(data),
            h(
              "div",
              { className: "dsh-github-issue-timeline-title" },
              "💬 讨论与评论时间线 (" + (data.comments ? data.comments.length : 0) + ")"
            ),
            data.comments && data.comments.length > 0
              ? data.comments.map(function (c: any) {
                  return h(IssueCommentCard, { key: c.id || c.createdAt, comment: c });
                })
              : h(
                  "div",
                  { className: "dsh-github-issue-empty-timeline" },
                  "💬 暂无讨论与评论——这是一个还没有人回复的议题。"
                )
          )
        : null
    )
  );
}
