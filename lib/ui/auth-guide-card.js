/**
 * 认证与安装引导卡片组件（响应式自适应中央大面板与右侧栏）
 */
export function AuthGuideCard(props) {
    var auth = props ? props.auth : null;
    var onRefresh = props ? props.onRefresh : () => { };
    var isRightbar = Boolean(props && props.isRightbar);
    var [copied, setCopied] = React.useState(false);
    var [launching, setLaunching] = React.useState(false);
    var [toastMsg, setToastMsg] = React.useState(null);
    var isNetwork = Boolean(auth?.networkError);
    var notInstalled = !isNetwork && Boolean(auth && auth.installed === false);
    var notLoggedIn = !isNetwork && !notInstalled && Boolean(!auth?.loggedIn);
    var guide = auth?.installGuide;
    var defaultCmd = isNetwork
        ? "gh auth status"
        : notInstalled
            ? (guide?.command || "winget install --id GitHub.cli")
            : "gh auth login";
    var copyCmd = (cmd) => {
        try {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(cmd);
            }
            else {
                var input = document.createElement("textarea");
                input.value = cmd;
                document.body.appendChild(input);
                input.select();
                document.execCommand("copy");
                document.body.removeChild(input);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
        catch (e) {
            console.warn("复制失败:", e);
        }
    };
    var launchTerminal = async (cmd) => {
        setLaunching(true);
        setToastMsg(null);
        try {
            var res = await fetch("/api/github/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "open_terminal", command: cmd })
            });
            var json = await res.json();
            if (json.ok) {
                setToastMsg("已唤起系统终端，请在弹出窗口中完成操作；若未弹出，可手动打开终端执行上方命令");
                setTimeout(() => setToastMsg(null), 6000);
            }
            else {
                setToastMsg("❌ " + (json.message || "唤起失败，请手动打开终端执行上方命令"));
            }
        }
        catch (e) {
            setToastMsg("无法连接后台服务，请手动打开终端执行上方命令");
        }
        finally {
            setLaunching(false);
        }
    };
    var openDownload = async () => {
        var url = guide?.downloadUrl || "https://cli.github.com/";
        try {
            await fetch("/api/github/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "open_browser", url })
            });
        }
        catch (e) {
            window.open(url, "_blank", "noopener,noreferrer");
        }
    };
    var openProxySettings = () => {
        try {
            window.dispatchEvent(new CustomEvent("dsh-github-open-proxy"));
        }
        catch (e) { }
    };
    var h = React.createElement;
    return h("div", {
        className: "dsh-github-guide-card " + (isNetwork ? "warning" : notInstalled ? "danger" : "warning"),
        style: isRightbar ? { padding: "12px", marginBottom: "12px" } : undefined
    }, h("div", { className: "dsh-github-guide-header" }, isNetwork
        ? "🌐 无法连接 GitHub 服务器"
        : notInstalled
            ? "⚠️ 未检测到 GitHub CLI (gh)"
            : "🔑 GitHub 账号尚未登录", h("span", { className: "dsh-github-badge " + (isNetwork ? "dsh-badge-yellow" : notInstalled ? "dsh-badge-red" : "dsh-badge-yellow") }, isNetwork ? "网络受限" : notInstalled ? "未安装" : "未认证")), h("div", { className: "dsh-github-guide-desc" }, isNetwork
        ? (auth?.networkErrorReason || "检测到本机已安装 GitHub CLI，但当前无法连接至 api.github.com（网络超时、DNS 无法解析或被系统代理阻断）。")
        : notInstalled
            ? (guide?.description || "DSH GitHub Flow 插件依赖官方 GitHub CLI 工具与云端进行安全交互，当前系统 PATH 中未检测到该工具。")
            : "检测到本机已安装 GitHub CLI，请完成账号授权以解锁仓库管理、PR 审查和 Issues 待办。"), h("div", { className: "dsh-github-cmd-box" }, h("code", null, defaultCmd), h("button", {
        className: "dsh-github-copy-btn " + (copied ? "copied" : ""),
        onClick: () => copyCmd(defaultCmd),
        title: "复制命令到剪贴板"
    }, copied ? "✓ 已复制" : "📋 复制命令")), !notInstalled && !isRightbar
        ? (isNetwork
            ? h("ol", { className: "dsh-github-steps-list" }, h("li", null, "检查系统本地网络连接或 DNS 解析，确认能正常访问 github.com；"), h("li", null, "若使用了网络代理工具，可在下方点击「配置网络代理」填写 HTTP 或 SOCKS5 代理；"), h("li", null, "配置或恢复网络后，切回本面板或点击「重试连接」即可自动同步数据。"))
            : h("ol", { className: "dsh-github-steps-list" }, h("li", null, "打开系统终端（PowerShell / CMD / Terminal），运行上述命令；"), h("li", null, "按提示依次选择「GitHub.com」➜「HTTPS」➜「Login with a web browser」；"), h("li", null, "按回车打开浏览器确认授权后，切回本页面即可自动恢复。")))
        : null, h("div", { className: "dsh-github-guide-actions" }, isNetwork
        ? h("button", {
            className: "dsh-github-action-btn",
            onClick: onRefresh,
            title: "重新发起网络连接校验"
        }, "🔄 重试网络连接")
        : null, isNetwork
        ? h("button", {
            className: "dsh-github-action-btn",
            onClick: openProxySettings,
            title: "打开网络代理设置，配置 HTTP/SOCKS5 代理服务器"
        }, "⚙️ 配置网络代理")
        : null, h("button", {
        className: "dsh-github-action-btn",
        onClick: () => launchTerminal(defaultCmd),
        disabled: launching,
        title: "自动唤起系统终端并执行该命令"
    }, launching ? "正在唤起..." : (isNetwork ? "💻 终端排查状态" : notInstalled ? "💻 唤起终端安装" : "💻 唤起终端登录")), notInstalled
        ? h("button", {
            className: "dsh-github-action-btn",
            onClick: openDownload,
            title: "打开 GitHub CLI 官方下载主页获取安装包"
        }, "🌐 官网安装包 (.msi/.pkg)")
        : null, !isNetwork
        ? h("button", {
            className: "dsh-github-action-btn",
            onClick: function () {
                setToastMsg("正在快速检测登录状态...");
                var probeController = new AbortController();
                var probeTimer = setTimeout(function () { probeController.abort(); }, 10000);
                fetch("/api/github/auth?force=true", { signal: probeController.signal })
                    .then(function (res) { return res.json(); })
                    .then(function (json) {
                    clearTimeout(probeTimer);
                    if (json && json.ok && json.auth && json.auth.loggedIn) {
                        setToastMsg("✅ 已识别到 GitHub CLI 登录态，正在拉取数据...");
                        clearStoredGlobalOverview();
                        onRefresh();
                    }
                    else {
                        setToastMsg("⚠️ 暂未检测到登录凭据，请在终端执行 gh auth login 完成授权");
                        onRefresh();
                    }
                })
                    .catch(function () {
                    clearTimeout(probeTimer);
                    setToastMsg("❌ 检测超时或后端不可达，请稍后重试");
                    onRefresh();
                });
            },
            title: "重新检测登录与安装状态"
        }, "🔄 刷新状态")
        : null), toastMsg
        ? h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-link, #0969da)", marginTop: "8px" } }, `ℹ️ ${toastMsg}`)
        : null, h("div", { className: "dsh-github-guide-tip" }, notInstalled
        ? "💡 提示：使用包管理器安装完成后，若未立即识别，可重启 DeepSeek Harness 应用刷新系统环境变量 PATH。"
        : "💡 提示：凭证由官方 GitHub CLI 加密保存在操作系统安全凭据库中，授权完毕切回本窗口将自动识别刷新。"));
}
