/**
 * 网络连接异常与离线状态醒目横幅组件
 */
export function NetworkAlertBanner(props) {
    var isRightbar = Boolean(props.isRightbar);
    var reason = props.networkErrorReason || "无法连接至 GitHub API 服务器（网络超时或被防火墙/代理阻断），本次未能获取最新数据。";
    var lastSyncedAt = props.lastSyncedAt || 0;
    var onRefresh = props.onRefresh || (() => { });
    var onOpenProxy = props.onOpenProxy || (() => {
        try {
            window.dispatchEvent(new CustomEvent("dsh-github-open-proxy"));
        }
        catch (e) { }
    });
    var formatTime = function (ts) {
        if (!ts)
            return "未知时间";
        var diff = Date.now() - ts;
        var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
        if (diff < MIN)
            return "刚刚";
        if (diff < HOUR)
            return Math.floor(diff / MIN) + " 分钟前";
        if (diff < DAY)
            return Math.floor(diff / HOUR) + " 小时前";
        return new Date(ts).toLocaleDateString();
    };
    var h = React.createElement;
    return h("div", {
        className: "dsh-github-network-alert",
        style: {
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: isRightbar ? "10px 12px" : "12px 16px",
            marginBottom: "12px",
            borderRadius: "8px",
            background: "rgba(240, 136, 62, 0.12)",
            border: "1px solid rgba(240, 136, 62, 0.4)",
            fontSize: "12px",
            color: "var(--dsw-alias-label-primary, #1f2328)",
        },
    }, h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" } }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, color: "var(--dsw-alias-state-attention-primary, #9a6700)" } }, h("span", null, "⚠️"), h("span", null, "网络连接失败，当前展示离线历史数据")), h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } }, h("button", {
        className: "dsh-github-btn-sm",
        onClick: onRefresh,
        title: "重新发起网络连接刷新",
        style: { padding: "3px 8px", fontSize: "11px", cursor: "pointer" },
    }, "🔄 重试刷新"), h("button", {
        className: "dsh-github-btn-sm",
        onClick: onOpenProxy,
        title: "打开网络代理设置配置 HTTP/SOCKS5 代理",
        style: { padding: "3px 8px", fontSize: "11px", cursor: "pointer" },
    }, "⚙️ 配置代理"))), h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", lineHeight: 1.4 } }, reason + (lastSyncedAt ? `（当前数据快照同步于 ${formatTime(lastSyncedAt)}）` : "")));
}
