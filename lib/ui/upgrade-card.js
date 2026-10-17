/**
 * 通用升级通知与一键升级卡片组件（自适应右侧栏紧凑模式与全景大面板模式）
 */
export function UpgradeNotificationCard(props) {
    var updateInfo = props.updateInfo;
    var isRightbar = Boolean(props.isRightbar);
    if (!updateInfo || !updateInfo.hasUpdate)
        return null;
    var storageKey = "dsh_dismissed_update_" + (updateInfo.latestVersion || "latest");
    var [dismissed, setDismissed] = React.useState(function () {
        try {
            return localStorage.getItem(storageKey) === "true";
        }
        catch (e) {
            return false;
        }
    });
    var [status, setStatus] = React.useState("idle");
    var [msg, setMsg] = React.useState("");
    React.useEffect(function () {
        fetch("/api/github/upgrade-status")
            .then(function (res) { return res.json(); })
            .then(function (json) {
            if (json && json.ok && json.data) {
                if (json.data.state === "upgrading") {
                    setStatus("upgrading");
                    setMsg("正在拉取最新版本（约需 5~15 秒）...");
                }
                else if (json.data.state === "success") {
                    setStatus("success");
                    setMsg(json.data.message || "升级成功！已安装最新依赖。");
                }
            }
        })
            .catch(function () { });
    }, []);
    if (dismissed)
        return null;
    var handleUpgrade = async function () {
        if (status === "upgrading")
            return;
        setStatus("upgrading");
        setMsg("正在拉取最新版本（约需 5~15 秒）...");
        try {
            var res = await fetch("/api/github/upgrade", { method: "POST" });
            var json = await res.json().catch(function () { return {}; });
            if (res.ok && json.ok) {
                setStatus("success");
                setMsg(json.message || "升级成功！已安装最新依赖。");
            }
            else {
                setStatus("failed");
                var logText = String(json.log || "");
                var isAgeViolation = json.errorType === "MINIMUM_RELEASE_AGE_VIOLATION" ||
                    logText.includes("ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION") ||
                    logText.includes("minimumReleaseAge") ||
                    (typeof json.message === "string" && (json.message.includes("24 小时安全保护期") || json.message.includes("防投毒")));
                if (isAgeViolation) {
                    // 命中 DSH 内置包管理器 24 小时防投毒策略：收起英文报错堆栈，呈现全中文专业自愈指引
                    setMsg("🛡️ 触发 DSH 新版本 24 小时安全保护期（npm 供应链防投毒策略）。检测到目标版本刚刚发布未满 24 小时，DSH 内置包管理器暂缓了自动升级以保障系统安全。\n\n" +
                        "【推荐操作】：\n" +
                        "1. 立即尝鲜：请先【完全退出关闭 DSH 应用程序】，然后在系统终端执行手动安装命令（点击右侧「📋 复制命令」获取）；\n" +
                        "2. 稍后升级：无需任何操作，发版满 24 小时后直接在此点击「⚡ 一键自动升级」即可平滑完成。");
                }
                else {
                    var logTail = "";
                    if (json.log && typeof json.log === "string") {
                        var lines = json.log.trim().split("\n").filter(function (l) { return l.trim(); });
                        if (lines.length > 0) {
                            logTail = "\n\n📝 日志末尾: " + lines.slice(-4).join(" ⏎ ").slice(0, 400);
                        }
                    }
                    setMsg((json.message || "升级命令执行失败，请在宿主终端手动执行。") + logTail);
                }
            }
        }
        catch (err) {
            setStatus("failed");
            setMsg("无法连接后端执行升级: " + (err.message || err));
        }
    };
    var handleDismiss = function () {
        try {
            localStorage.setItem(storageKey, "true");
        }
        catch (e) { }
        setDismissed(true);
    };
    var handleCopy = function () {
        var cmd = updateInfo.upgradeCommand || "dsh plugin --profile desktop add dsh-github-flow@latest";
        if (navigator.clipboard) {
            navigator.clipboard.writeText(cmd);
            alert("已复制升级命令到剪贴板：\n" + cmd);
        }
        else {
            prompt("请复制升级命令：", cmd);
        }
    };
    var handleReload = function () {
        window.location.reload();
    };
    var h = React.createElement;
    var isAgeViolation = msg.includes("24 小时安全保护期") || msg.includes("防投毒");
    if (isRightbar) {
        return h("div", {
            className: "dsh-github-upgrade-strip",
            style: {
                padding: "10px 12px",
                marginBottom: "12px",
                borderRadius: "8px",
                background: status === "success"
                    ? "var(--dsw-alias-state-success-subtle, rgba(46, 160, 67, 0.12))"
                    : (isAgeViolation
                        ? "rgba(217, 119, 6, 0.12)"
                        : "var(--dsw-alias-bg-module-platform, rgba(9, 105, 218, 0.08))"),
                border: "1px solid " + (status === "success"
                    ? "var(--dsw-alias-state-success-border, rgba(46, 160, 67, 0.35))"
                    : (isAgeViolation
                        ? "rgba(217, 119, 6, 0.35)"
                        : "var(--dsw-alias-border-l2, rgba(9, 105, 218, 0.25))")),
                fontSize: "12px",
            },
        }, h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" } }, h("span", { style: { fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2328)" } }, status === "success" ? "🎉 升级完成" : (isAgeViolation ? "🛡️ 处于 24h 安全保护期" : "🚀 发现新版 v" + updateInfo.latestVersion)), h("button", {
            onClick: handleDismiss,
            title: "不再提醒此版本",
            style: { background: "none", border: "none", cursor: "pointer", color: "var(--dsw-alias-label-tertiary, #8c8c8c)", fontSize: "14px", padding: 0 },
        }, "✕")), h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "8px", lineHeight: "1.4" } }, msg || (status === "success"
            ? "需重启 DSH 服务彻底生效后端工具，或刷新网页预览新界面。"
            : "当前: v" + updateInfo.currentVersion + "，推荐升级以获取最新功能。")), h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, status === "success"
            ? h("button", {
                className: "dsh-github-btn-sm",
                onClick: handleReload,
                style: { flex: 1, justifyContent: "center", background: "#2ea043", color: "#fff", borderColor: "#2ea043" },
            }, "🔄 刷新页面")
            : h("button", {
                className: "dsh-github-btn-sm",
                disabled: status === "upgrading",
                onClick: handleUpgrade,
                style: {
                    flex: 1,
                    justifyContent: "center",
                    background: "var(--dsw-alias-link, #0969da)",
                    color: "#fff",
                    borderColor: "var(--dsw-alias-link, #0969da)",
                    opacity: status === "upgrading" ? 0.7 : 1,
                },
            }, status === "upgrading" ? "升级中..." : "⚡ 一键升级"), h("button", {
            className: "dsh-github-btn-sm",
            onClick: handleCopy,
            style: {
                fontSize: "11px",
                padding: "4px 8px",
                ...(status === "failed" ? {
                    background: "var(--dsw-alias-link, #0969da)",
                    color: "#ffffff",
                    borderColor: "var(--dsw-alias-link, #0969da)",
                    fontWeight: 600,
                } : {}),
            },
        }, "📋 复制命令")));
    }
    return h("div", {
        className: "dsh-github-upgrade-banner",
        style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            marginBottom: "16px",
            borderRadius: "8px",
            background: status === "success"
                ? "linear-gradient(90deg, rgba(46, 160, 67, 0.15) 0%, rgba(9, 105, 218, 0.12) 100%)"
                : (isAgeViolation
                    ? "linear-gradient(90deg, rgba(217, 119, 6, 0.15) 0%, rgba(245, 158, 11, 0.12) 100%)"
                    : "linear-gradient(90deg, rgba(9, 105, 218, 0.12) 0%, rgba(137, 87, 229, 0.12) 100%)"),
            border: "1px solid " + (status === "success" ? "rgba(46, 160, 67, 0.35)" : (isAgeViolation ? "rgba(217, 119, 6, 0.35)" : "rgba(9, 105, 218, 0.3)")),
            fontSize: "13px",
        },
    }, h("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, h("span", { style: { fontSize: "20px" } }, status === "success" ? "🎉" : (isAgeViolation ? "🛡️" : "🚀")), h("div", null, h("div", { style: { fontWeight: 600, color: "var(--dsw-alias-label-primary, #1f2328)" } }, status === "success"
        ? "升级完成！新版本 v" + updateInfo.latestVersion + " 已写入"
        : (isAgeViolation
            ? "🛡️ 触发 DSH 新版本 24 小时安全保护期 (供应链防投毒策略)"
            : "发现 dsh-github-flow 新版本 v" + updateInfo.latestVersion + "（当前版本: v" + updateInfo.currentVersion + "）")), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, msg || (status === "success"
        ? "💡 提示：DSH 后端驻留了旧版内存，需重启 DSH 服务彻底生效后端工具；若仅预览界面改动可先刷新网页。"
        : "包含最新 GitHub 工具特性与性能优化，点击右侧可一键自动升级。")))), h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 } }, status === "success"
        ? h("button", {
            className: "dsh-github-btn-sm",
            onClick: handleReload,
            style: { background: "#2ea043", color: "#fff", borderColor: "#2ea043", padding: "6px 14px", fontWeight: 600 },
        }, "🔄 立即刷新页面")
        : h("button", {
            className: "dsh-github-btn-sm",
            disabled: status === "upgrading",
            onClick: handleUpgrade,
            style: {
                background: "var(--dsw-alias-link, #0969da)",
                color: "#fff",
                borderColor: "var(--dsw-alias-link, #0969da)",
                padding: "6px 14px",
                fontWeight: 600,
                opacity: status === "upgrading" ? 0.7 : 1,
            },
        }, status === "upgrading" ? "正在自动升级中..." : "⚡ 一键自动升级"), h("button", {
        className: "dsh-github-btn-sm",
        onClick: handleCopy,
        style: {
            padding: "6px 12px",
            ...(status === "failed" ? {
                background: "var(--dsw-alias-link, #0969da)",
                color: "#ffffff",
                borderColor: "var(--dsw-alias-link, #0969da)",
                fontWeight: 600,
            } : {}),
        },
    }, status === "failed"
        ? (isAgeViolation ? "📋 复制命令 (需先退出DSH)" : "📋 复制命令手动升级")
        : "📋 复制命令"), h("button", {
        onClick: handleDismiss,
        title: "不再提醒此版本",
        style: { background: "none", border: "none", cursor: "pointer", color: "var(--dsw-alias-label-tertiary, #8c8c8c)", fontSize: "16px", padding: "0 4px" },
    }, "✕")));
}
