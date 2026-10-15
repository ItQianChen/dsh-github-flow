declare const React: any;

/**
 * 数据新鲜度与同步状态微标组件
 */
export function SyncStatusBadge(props: {
  syncStatus: string;
  lastSyncedAt: number;
  isRightbar?: boolean;
}) {
  var syncStatus = props.syncStatus;
  var lastSyncedAt = props.lastSyncedAt;
  var isRightbar = Boolean(props.isRightbar);
  var text = "";
  var bg = "rgba(101, 109, 118, 0.1)";
  var color = "var(--dsw-alias-label-secondary, #656d76)";

  var formatTimeAgo = function (ts: number) {
    if (!ts) return "刚刚";
    var diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return "刚刚";
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + "分钟前";
    var diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return diffHour + "小时前";
    var diffDay = Math.floor(diffHour / 24);
    return diffDay + "天前";
  };

  if (syncStatus === "syncing") {
    text = isRightbar ? "⏳ 同步中..." : "⏳ 后台同步中...";
    bg = "rgba(9, 105, 218, 0.12)";
    color = "var(--dsw-alias-link, #0969da)";
  } else if (syncStatus === "fresh") {
    var timeStr = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "";
    text = "✅ " + (isRightbar ? "最新" : "已是最新") + (timeStr ? " (" + timeStr + ")" : "");
    bg = "rgba(46, 160, 67, 0.12)";
    color = "var(--dsw-alias-state-success, #2ea043)";
  } else if (syncStatus === "cached") {
    text = "📦 本地快照 (" + formatTimeAgo(lastSyncedAt) + ")";
    bg = "rgba(101, 109, 118, 0.12)";
    color = "var(--dsw-alias-label-secondary, #656d76)";
  } else if (syncStatus === "failed") {
    text = isRightbar ? "❌ 刷新失败 (离线)" : "❌ 网络断开 (展示离线数据)";
    bg = "rgba(207, 34, 46, 0.12)";
    color = "var(--dsw-alias-state-error-primary, #cf222e)";
  }

  if (!text) return null;

  return React.createElement(
    "span",
    {
      className: "dsh-github-sync-badge",
      style: {
        fontSize: isRightbar ? "10px" : "11px",
        padding: isRightbar ? "2px 6px" : "3px 8px",
        borderRadius: "12px",
        background: bg,
        color: color,
        marginLeft: isRightbar ? "6px" : "10px",
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        whiteSpace: "nowrap",
      },
    },
    text
  );
}
