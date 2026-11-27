/*
 * 字节格式化只有一份实现（`utils.formatBytes`，KB / MB 分档）。
 *
 * 为什么设置页必须和操作记录弹窗共用：这里原来自己写了一份 MB-only 的 `auditMb`，
 * 10 KB 的用量显示成「0.0 MB」——用户看到的就是"占用一直是 0"（2026-11-27 截图实证）。
 * 弹窗那份早已改成 KB 分档，两份实现的结果是只修一处、另一处继续错。
 * 内联进 `lib/client.js` 后 `utils.js` 与本文件在同一闭包作用域，import 行由构建器剥掉。
 */
import { formatBytes } from './utils.js';
/**
 * 问号触发器：点击（或键盘 Enter / Space）打开二级说明弹窗。
 *
 * 为什么不是悬停浮层（2026-11-26 用户截图实证）：浮层绝对定位挂在卡片里，在靠底部的选项上
 * 打开时会撑开滚动区、把横向滚动条挤出来，自己还被弹窗边缘裁掉。改成固定定位的二级弹窗后
 * 完全脱离设置页的文档流，内容再多也只在弹窗内部滚动。
 *
 * 为什么是 span[role=button] 而不是 <button>：「启用操作记录」的标题位于 <label> 内，
 * HTML 内容模型不允许 label 里再出现可标记元素（button 就是），否则点问号会连带拨动复选框。
 * span 不是可标记元素，加上 tabIndex 与 Enter/Space 处理后键盘同样可用。
 */
function HelpDot(props) {
    // 局部取 h：不能在模块顶层写 var h（多个模块被内联进同一个闭包作用域，会互相撞名）
    var h = React.createElement;
    var open = function (e) {
        // 必须拦住：单选卡片的 onClick 是"选中并保存"，点问号不能把档位改掉
        e.stopPropagation();
        e.preventDefault();
        props.onOpen(e.currentTarget);
    };
    return h("span", {
        role: "button",
        tabIndex: 0,
        className: "dsh-github-note-dot",
        "aria-label": "查看说明：" + props.label,
        "aria-haspopup": "dialog",
        title: "查看说明",
        onClick: open,
        onKeyDown: function (e) {
            if (e.key === "Enter" || e.key === " ")
                open(e);
        },
    }, "?");
}
/**
 * 二级说明弹窗：固定定位、居中、内容自身滚动，盖在设置弹窗之上。
 *
 * 三条与层级有关的约束：
 * 1. 遮罩的 onClick 必须自己吃掉事件 —— 它嵌在设置页遮罩里，冒泡上去会连带关掉设置页；
 * 2. Esc 由设置页的窗口级监听器统一分发：说明开着时只关说明（见该处的 helpTopic 分支）；
 * 3. 打开后把焦点移进弹窗（关闭按钮 autoFocus），关闭后焦点还回触发的问号。
 */
function HelpModal(props) {
    var h = React.createElement;
    var body = [];
    var pills = [];
    var flushPills = function () {
        if (pills.length === 0)
            return;
        body.push(h("div", { key: "p" + body.length, className: "dsh-github-note-pills" }, pills));
        pills = [];
    };
    props.topic.lines.forEach(function (line, i) {
        if (line.indexOf("• ") === 0) {
            pills.push(h("span", { key: i, className: "dsh-github-note-pill" }, line.slice(2)));
            return;
        }
        flushPills();
        if (line === "")
            body.push(h("div", { key: i, className: "dsh-github-note-gap" }));
        else if (line.indexOf("# ") === 0)
            body.push(h("div", { key: i, className: "dsh-github-note-subhead" }, line.slice(2)));
        else
            body.push(h("div", { key: i, className: "dsh-github-note-line" }, line));
    });
    flushPills();
    return h("div", {
        className: "dsh-github-note-overlay",
        onClick: function (e) { e.stopPropagation(); props.onClose(); },
    }, h("div", {
        className: "dsh-github-note-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "说明：" + props.topic.label,
        onClick: function (e) { e.stopPropagation(); },
    }, h("div", { className: "dsh-github-note-head" }, h("h4", { style: { margin: 0, fontSize: "14px", fontWeight: 600 } }, "说明：" + props.topic.label), h("button", {
        className: "dsh-github-btn-sm",
        "aria-label": "关闭说明",
        autoFocus: true,
        style: { padding: "2px 8px", fontSize: "12px" },
        onClick: props.onClose,
    }, "✕")), h("div", { className: "dsh-github-note-content" }, body)));
}
/*
 * 说明文案。与 approval-gate.ts 的判定规则、WRITE_ACTIONS / DESTRUCTIVE_ACTIONS 必须一致：
 * test/phase52 会逐个 action 对账，代码加了写操作而这里没跟上，测试直接变红。
 * 行首标记（见 HelpModal）："• " 清单项（药丸）；"# " 小标题；空串 = 段间距。
 */
const HELP_RECORD_ENABLED = [
    "记什么：Agent 对 PR / Issue 的每一次写操作（创建、评论、合并、关闭、删除等 21 种）。查看 / 列表 / Diff 等读操作不记录；其余 17 个 GitHub 工具也不在此记录内。",
    "",
    "# 每条记录包含",
    "• 时间与动作",
    "• 仓库与工作区",
    "• 风险等级",
    "• 成败",
    "• 当时提交的参数（标题 / 正文，超长会按字段截断并标注）",
    "• 人工审核结论",
    "• 被操作对象的标题",
    "",
    "条数怎么算：面板里的「N 条记录」是**折叠后的记录数**——一次写操作算一条。磁盘上一条占 2–3 行 JSONL（intent 与 result 各一行，走过人工审核再加一行结论），所以健康看板里的「N 行」一定比条数大，两个数字不是一回事。",
    "统计范围：设置页这里是**全部**记录；从右侧栏工作区入口打开「🕘 操作记录」时只看当前工作区，两边数字可以不同，那不是出错。",
    "",
    "存在哪：~/.dsh/data/dsh-github-flow/audit/ 目录，每个进程一个段文件（audit.<pid>-<时间>-<序号>.jsonl），读取时按时间合并；纯本地文件，不上传。旧版的单个 audit.jsonl 会在升级后首次启动时自动迁进段文件。",
    "关闭后：不再写入新记录、启动也不再加载历史；已有文件保留在本地，可在「🕘 操作记录」里清空。",
    "注意：审核弹窗不依赖这个开关 —— 关掉记录后审核仍然生效，想停审核请改下方档位。",
];
const HELP_BUDGET = [
    "记录文件的总大小上限，可选 1–64 MB，默认 8 MB。",
    "",
    "• 一条记录通常不到 1 KB，带长正文时最多约 4 KB",
    "• 超出预算时自动丢弃最早的记录",
    "• 删除是真删磁盘字节，不是只做标记",
    "• 行数上限由预算自动推算，不需要单独设置",
    "• 改小预算立即生效并当场淘汰",
    "• 改大不会补回已丢弃的记录",
];
const HELP_APPROVAL_SECTION = [
    "只作用于 PR / Issue 的写操作。",
    "查看 / 列表 / Diff 等读操作在任何档位下都不审核；其余 17 个 GitHub 工具不经过这里，它们保留各自的 confirm 二次确认。",
    "",
    "只有确定要弹窗时才会去 GitHub 取对象信息（标题 / 状态 / 正文），所以读操作不会因此多出任何网络请求。",
];
const HELP_APPROVAL_OFF = [
    "从不弹出审核窗。",
    "高危操作（合并 / 关闭 / 删除 / 迁移等）仍然需要 Agent 带 confirm: true 才会执行 —— 那是工具自己的二次确认，不会询问你。",
    "操作记录照常写入。",
];
const HELP_APPROVAL_DESTRUCTIVE = [
    "只有这 6 项会弹窗：",
    "• 合并 PR（merge）",
    "• 回滚 PR（revert）",
    "• 强制检出 PR（checkout，仅 force: true）",
    "• 关闭 Issue（close）",
    "• 删除 Issue（delete）",
    "• 迁移 Issue（transfer，需提供目标仓库）",
    "",
    "创建 / 编辑 / 评论 / 重开 / 置顶 / 锁定等普通写操作不弹窗。",
];
const HELP_APPROVAL_ALL = [
    "PR / Issue 的全部 21 种写操作都会弹窗：",
    "# PR（9 种）",
    "• create 创建",
    "• review 提交评审",
    "• merge 合并",
    "• checkout 检出",
    "• ready 标记可评审",
    "• revert 回滚",
    "• update_branch 更新分支",
    "• comment 评论",
    "• edit 编辑",
    "# Issue（12 种）",
    "• create 创建",
    "• edit 编辑",
    "• develop 创建开发分支",
    "• comment 评论",
    "• close 关闭",
    "• reopen 重开",
    "• pin 置顶",
    "• unpin 取消置顶",
    "• lock 锁定",
    "• unlock 解锁",
    "• delete 删除",
    "• transfer 迁移",
];
const HELP_APPROVAL_RULES = [
    "在上面的三档之上，按**仓库**或**具体操作**单独改档位。",
    "",
    "格式：维度:值=档位，每行一条。",
    "可用维度：repo / action / tool",
    "可用档位：off / destructive / all-writes",
    "",
    "# 例子",
    "• repo:ItQianChen/dsh-github-flow=off",
    "  这个仓库永远别问我",
    "• action:github_issue:comment=off",
    "  Issue 评论太常用，别弹窗",
    "• repo:acme/prod|action:github_pr:merge=off",
    "  多维用 | 连接，表示「同时满足」（AND）",
    "",
    "# 三条必须知道的规则",
    "• **首条匹配即生效**：从上往下找，第一条命中的决定档位，不会取最严格的。",
    "• 一条都不匹配时，用上面选中的那个档位。",
    "• 写错的行会被忽略并在下方标出来（不会静默失效）。",
    "",
    "注意：只读档位（read_only）优先级更高 —— 它在注册期就把写操作剪掉了，",
    "规则根本没机会跑。配了 all-writes 却不弹窗，先检查是不是开了只读。",
];
/** 全景驾驶舱「⚙️ 设置」模态弹窗组件：左侧分区导航（数据同步 / 网络代理 / 更新设置 / 关于）+ 右侧内容区
 */
export function GlobalSyncSettingsModal(props) {
    if (!props.isOpen)
        return null;
    var [activeSection, setActiveSection] = React.useState(props.initialSection || "sync");
    var [strategy, setStrategy] = React.useState(props.currentSettings.strategy || "swr");
    var [localGitWatch, setLocalGitWatch] = React.useState(props.currentSettings.localGitWatch !== false);
    var [cloudSyncIntervalMs, setCloudSyncIntervalMs] = React.useState(Number(props.currentSettings.cloudSyncIntervalMs) || 600000);
    var [cacheMeta, setCacheMeta] = React.useState(getCacheStorageMeta());
    var [clearTip, setClearTip] = React.useState("");
    React.useEffect(function () {
        if (props.isOpen && props.currentSettings) {
            setStrategy(props.currentSettings.strategy || "swr");
            setLocalGitWatch(props.currentSettings.localGitWatch !== false);
            setCloudSyncIntervalMs(Number(props.currentSettings.cloudSyncIntervalMs) || 600000);
        }
    }, [props.isOpen, props.currentSettings]);
    var [updateMode, setUpdateMode] = React.useState("official");
    var [updateBusy, setUpdateBusy] = React.useState(false);
    var [updateMsg, setUpdateMsg] = React.useState(null);
    var [aboutVersion, setAboutVersion] = React.useState(null);
    React.useEffect(function () {
        if (!props.isOpen)
            return;
        fetch("/api/github/update-settings")
            .then(function (r) { return r.json(); })
            .then(function (j) {
            if (j && j.ok && j.data && j.data.mode) {
                setUpdateMode(j.data.mode);
            }
        })
            .catch(function () { });
        fetch("/api/github/check-update")
            .then(function (r) { return r.json(); })
            .then(function (j) {
            if (j && j.ok && j.data && j.data.currentVersion)
                setAboutVersion(j.data.currentVersion);
        })
            .catch(function () { });
    }, [props.isOpen]);
    var [proxyEnabled, setProxyEnabled] = React.useState(false);
    var [proxyUrl, setProxyUrl] = React.useState("");
    var [proxyNoProxy, setProxyNoProxy] = React.useState("localhost,127.0.0.1");
    var [proxyApplyNpm, setProxyApplyNpm] = React.useState(true);
    var [proxyAutoFollow, setProxyAutoFollow] = React.useState(false);
    var [proxySystemProxy, setProxySystemProxy] = React.useState(null);
    /** npm 探测链路（Node fetch）能否真的用上代理；false 时在手动表单里明示差异 */
    var [proxyFetchAvailable, setProxyFetchAvailable] = React.useState(true);
    var [proxyBusy, setProxyBusy] = React.useState(false);
    var [proxyMsg, setProxyMsg] = React.useState(null);
    var [proxyProbe, setProxyProbe] = React.useState(null);
    /** 开关即时保存的回执时间戳（空串 = 不显示），2.6s 后自动消失 */
    var [proxyAutoTip, setProxyAutoTip] = React.useState("");
    /** 保存请求序号：快速连点开关时只让最后一次响应生效 */
    var proxySaveSeqRef = React.useRef(0);
    /**
     * 已保存的地址类配置（与输入框当前内容区分）。
     * 为什么需要：开关是即时保存的，但地址输入框仍要手动点保存。
     * 拨开关时若提交输入框当前值，等于「顺手把没保存的地址也存了」，
     * 保存按钮就失去意义；所以静默保存只用这里记录的已保存值。
     */
    var [savedProxyUrl, setSavedProxyUrl] = React.useState("");
    var [savedProxyNoProxy, setSavedProxyNoProxy] = React.useState("localhost,127.0.0.1");
    /*
     * 操作记录与审核（本分区是这两个功能的**唯一**设置入口）。
     *
     * 为什么设置放这里而不是放在「🕘 操作记录」窗口里：那个窗口只管"看与删"，
     * 开关属于配置。同一件事有两个入口时，用户永远不知道哪个是真的。
     */
    var [auditUsage, setAuditUsage] = React.useState(null);
    /**
     * 「条数」用服务端给的 `records`（`list()` 折叠后的记录数），**不是** `usage.rows`。
     *
     * `rows` 是落盘 JSONL 行数：一次写操作固定 2 行（intent + result），走过审核再多 1 行
     * decision。拿它当条数，用户看到的就是「做一次操作 +3」「删光了还剩 2 条删不掉」
     * （2026-11-27 截图实证：设置页 26 条 vs 记录窗口 共 8 条）。
     *
     * null = 还没拿到（旧服务端没有该字段）：此时**不显示条数**，宁缺勿错。
     */
    var [auditRecords, setAuditRecords] = React.useState(null);
    var [auditApprovalMode, setAuditApprovalMode] = React.useState("destructive");
    /**
     * 审核规则（s3）：文本框里的**原始多行文本**，不是数组。
     *
     * 为什么状态是字符串而不是数组：用户正在编辑时每敲一个换行就 split 一次，
     * 光标与空行都会被 React 受控组件吃掉（"打不出空行"是最典型的症状）。
     * 提交时才按行切分，服务端存数组。
     */
    var [auditRulesText, setAuditRulesText] = React.useState("");
    /**
     * 上一次**已保存**的规则文本（规范化后）。
     *
     * 两个用途，都是踩过的坑：
     * 1. 失焦保存前先比对——文本没变就不发请求。否则用户离开规则框去点「启用操作记录」时，
     *    blur 先把 `auditBusy` 置真、把那个复选框 disabled 掉，**这一次点击被吞**。
     * 2. 保存成功后**不回写**文本框。服务端会 trim 并丢弃空行，回写等于把用户刚打的分组空行
     *    当场吃掉，光标也会跳走。
     */
    var auditRulesSavedRef = React.useRef("");
    /** 服务端解析结果（有效 / 被忽略）。null = 还没拿到，此时不显示任何"N 条"断言 */
    var [auditRulesParsed, setAuditRulesParsed] = React.useState(null);
    var [auditBusy, setAuditBusy] = React.useState(false);
    var [auditMsg, setAuditMsg] = React.useState(null);
    /**
     * 二级说明弹窗当前显示的条目（null = 未打开）。
     * 状态放在设置页而不是问号自己身上：Esc 的分发要跨这两层（见窗口级 keydown 监听器）。
     */
    var [helpTopic, setHelpTopic] = React.useState(null);
    /** 打开说明时的触发元素：关闭后把焦点还回去，键盘用户不会"丢失位置" */
    var helpTriggerRef = React.useRef(null);
    var openHelp = function (topic, trigger) {
        helpTriggerRef.current = trigger || null;
        setHelpTopic(topic);
    };
    var closeHelp = function () {
        setHelpTopic(null);
        var el = helpTriggerRef.current;
        // 等弹窗从 DOM 卸载后再还焦点（此刻按钮可能仍持有焦点）
        if (el && typeof el.focus === "function") {
            setTimeout(function () { try {
                el.focus();
            }
            catch { /* 元素已卸载则忽略 */ } }, 0);
        }
    };
    /** 问号的 onOpen 工厂：把"标题 + 文案"绑成打开函数，调用处只需写一行 */
    var helpFor = function (label, lines) {
        return function (trigger) { openHelp({ label: label, lines: lines }, trigger); };
    };
    /** 字节 → 人类可读：直接复用 `utils.formatBytes`（KB / MB 分档，唯一实现） */
    var loadAuditSettings = function () {
        fetch("/api/github/audit/settings")
            .then(function (r) { return r.json().catch(function () { return null; }); })
            .then(function (j) {
            if (!j || !j.ok || !j.data)
                return;
            setAuditUsage(j.data.usage || null);
            // 条数只认服务端的 records（见上方 state 注释）；拿不到就置空，不退回 rows
            setAuditRecords(typeof j.data.records === "number" ? j.data.records : null);
            // 档位与本文件其余两项同源（audit-settings.json），打开分区时一并回读
            if (j.data.approvalMode)
                setAuditApprovalMode(j.data.approvalMode);
            // 规则：数组 → 多行文本（一行一条，正好是可编辑形态）
            if (Array.isArray(j.data.approvalRules)) {
                var loadedRules = j.data.approvalRules.join("\n");
                setAuditRulesText(loadedRules);
                auditRulesSavedRef.current = loadedRules;
            }
            if (j.data.rulesParsed)
                setAuditRulesParsed(j.data.rulesParsed);
        })
            .catch(function () { });
    };
    /**
     * 规则文本 → 字符串数组。
     *
     * 保留**非空行**、去掉行尾空白，但**不过滤注释行**：`#` 开头的注释由服务端
     * 解析器识别并跳过（那样"注释算不算一条"只有一个定义，不在前后端各写一遍）。
     */
    var splitRules = function (text) {
        return String(text || "")
            .split(/\r?\n/)
            .map(function (line) { return line.trim(); })
            .filter(function (line) { return line.length > 0; });
    };
    /**
     * 保存一项设置：服务端**立刻生效**并落 audit-settings.json，前端只回读结果。
     * 不做"本地先改再提交"——中间态会让用户以为设好了，实际服务端已把它钳回合法值。
     */
    var saveAuditSettings = function (patch) {
        if (auditBusy)
            return;
        setAuditBusy(true);
        setAuditMsg(null);
        fetch("/api/github/audit/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch || {}),
        })
            .then(function (r) { return r.json().catch(function () { return null; }); })
            .then(function (j) {
            setAuditBusy(false);
            if (!j || !j.ok) {
                setAuditMsg({ kind: "err", text: (j && j.message) || "保存失败" });
                return;
            }
            setAuditUsage(j.data && j.data.usage ? j.data.usage : auditUsage);
            if (j.data)
                setAuditRecords(typeof j.data.records === "number" ? j.data.records : null);
            if (j.data && j.data.approvalMode)
                setAuditApprovalMode(j.data.approvalMode);
            /*
             * **不回写**规则文本框。
             *
             * 服务端会 trim 并丢弃空行，把结果灌回受控 textarea 等于把用户刚打的分组空行
             * 当场吃掉（正是"状态用字符串而不是数组"要防的事），响应回来时用户若已重新聚焦
             * 继续输入，还会整段覆盖并让光标跳到末尾。
             * 只更新"已保存"基线，供失焦时的变更比对使用。
             */
            if (patch && Array.isArray(patch.approvalRules)) {
                auditRulesSavedRef.current = patch.approvalRules.join("\n");
            }
            if (j.data && j.data.rulesParsed)
                setAuditRulesParsed(j.data.rulesParsed);
            setAuditMsg({ kind: "ok", text: "已保存并立即生效" });
        })
            .catch(function (err) {
            setAuditBusy(false);
            setAuditMsg({ kind: "err", text: "网络请求异常：" + ((err && err.message) || "未知错误") });
        });
    };
    React.useEffect(function () {
        if (!props.isOpen)
            return;
        loadAuditSettings();
        // 只在打开时拉一次：分区内每次保存都会回读，不需要轮询
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.isOpen]);
    React.useEffect(function () {
        if (!props.isOpen)
            return;
        fetch("/api/github/proxy")
            .then(function (r) { return r.json(); })
            .then(function (j) {
            if (j && j.ok && j.state) {
                // 总开关是独立状态，不能再用「url 非空」反推——跟随系统时 url 本来就是空的，
                // 反推会让保存过的配置在重开弹窗时整个消失（2026-11-23 用户反馈的 bug）。
                var cfg = j.state.config || {};
                setProxyEnabled(typeof cfg.enabled === "boolean" ? cfg.enabled : Boolean(cfg.url || cfg.autoFollowSystem));
                setProxyUrl(cfg.url || "");
                setSavedProxyUrl(cfg.url || "");
                setProxyNoProxy(cfg.noProxy || "localhost,127.0.0.1");
                setSavedProxyNoProxy(cfg.noProxy || "localhost,127.0.0.1");
                setProxyApplyNpm(j.state.config ? j.state.config.applyToPackageManager !== false : true);
                setProxyAutoFollow(Boolean(j.state.config && j.state.config.autoFollowSystem));
                setProxySystemProxy(j.state.systemProxy || null);
                setProxyFetchAvailable(j.state.fetchProxyAvailable !== false);
                if (j.state.lastProbe)
                    setProxyProbe(j.state.lastProbe);
            }
        })
            .catch(function () { });
    }, [props.isOpen]);
    React.useEffect(function () {
        var onKeyDown = function (e) {
            if (e.key === "Escape" || e.keyCode === 27) {
                // 二级说明弹窗开着时，Esc 只关它（层级越靠上，越先吃掉 Esc）；没开才轮到设置页
                if (helpTopic) {
                    closeHelp();
                    return;
                }
                props.onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return function () { window.removeEventListener("keydown", onKeyDown); };
        // helpTopic 必须在依赖里：闭包要读到"此刻是否开着"，否则 Esc 永远关到设置页
    }, [props.onClose, helpTopic]);
    React.useEffect(function () {
        if (props.isOpen && props.initialSection) {
            setActiveSection(props.initialSection);
        }
    }, [props.isOpen, props.initialSection]);
    var handleUpdateSave = function () {
        setUpdateBusy(true);
        setUpdateMsg(null);
        fetch("/api/github/update-settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: updateMode }),
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
            setUpdateBusy(false);
            if (j && j.ok && j.data) {
                var d = j.data;
                var text = "";
                if (d.mode === "off") {
                    text = "✅ 已关闭自动检查更新（/gh upgrade 与一键升级仍可用），无需重启";
                }
                else if (d.probe && d.probe.latestVersion) {
                    text = "✅ 已切换至" + d.description + "，当前最新版本 v" + d.probe.latestVersion
                        + (d.probe.hasUpdate ? "（有可用更新）" : "（已是最新）") + "，无需重启";
                }
                else {
                    text = "✅ 已切换至" + d.description + "，但新源暂时不可达（版本探测失败，稍后会自动重试）；设置已生效，无需重启";
                }
                if (d.persisted === false) {
                    text += "；⚠️ 设置写盘失败，重启后需重新选择";
                }
                setUpdateMsg({ kind: "ok", text: text });
            }
            else {
                setUpdateMsg({ kind: "err", text: (j && j.message) || "保存失败" });
            }
        })
            .catch(function (e) {
            setUpdateBusy(false);
            setUpdateMsg({ kind: "err", text: "网络请求失败: " + (e && e.message ? e.message : e) });
        });
    };
    var h = React.createElement;
    var handleSave = function () {
        var updated = {
            strategy: strategy,
            localGitWatch: localGitWatch,
            cloudSyncIntervalMs: Number(cloudSyncIntervalMs) || 600000,
        };
        saveLocalSyncSettings(updated);
        props.onSave(updated);
        props.onClose();
    };
    var handleClear = function () {
        clearStoredGlobalOverview();
        props.onClearCache();
        setCacheMeta({ exists: false, sizeKb: 0, savedAt: 0 });
        setClearTip("本地缓存已彻底清空！");
        setTimeout(function () { setClearTip(""); }, 2000);
    };
    /**
     * 提交代理配置。
     *
     * overrides 显式传值而不是读 state：setState 是异步的，开关 onChange 里
     * 紧接着调用本函数时，闭包里的 state 还是旧值——直接读会提交「上一步的状态」。
     *
     * silent=true 用于开关类改动（即时生效，不打断用户、不弹大段提示）；
     * 手动地址表单仍走按钮触发（silent=false，给明确的保存反馈）。
     */
    /**
     * 把 systemProxy 检测结果翻译成一句人话。
     * 为什么必须按 reason 分支：enabled=false 有四种成因（平台不支持 / 用户关了 /
     * 用 PAC / 地址解析不出），笼统写「未检测到」会把企业 PAC 用户误导成
     * 「我明明开着系统代理，插件却说没有」。
     */
    var describeSystemProxy = function (info) {
        if (!info)
            return "尚未检测：保存后立即检测一次，此后每 30 秒自动刷新";
        if (info.supported === false)
            return "当前平台不支持自动检测（仅 Windows），请使用下方手动配置";
        if (info.enabled) {
            var suffix = info.url && /^socks5h?:\/\//i.test(info.url)
                ? "（socks5 代理下 npm 版本探测保持直连，GitHub 链路正常走代理）"
                : "";
            return "已跟随系统代理 " + info.url + suffix;
        }
        if (info.reason === "pac")
            return "检测到系统使用了 PAC 自动配置脚本，本插件暂不支持，已保持直连；如需代理请改用下方手动配置";
        if (info.reason === "unparsable")
            return "系统代理已开启，但地址无法解析（可能是无端口写法或非常规格式），已保持直连";
        if (info.reason === "disabled")
            return "当前系统代理处于关闭状态，插件保持直连；系统代理开启后 30 秒内自动跟进";
        return "当前未检测到可用的系统代理，已保持直连";
    };
    var persistProxy = function (overrides, silent) {
        var ov = overrides || {};
        var body = {
            enabled: typeof ov.enabled === "boolean" ? ov.enabled : proxyEnabled,
            // 静默保存（开关）只带已保存值：输入框里未点保存的修改不该被顺手提交。
            // 显式保存（地址按钮）才取输入框当前内容。
            url: typeof ov.url === "string" ? ov.url : (silent ? savedProxyUrl : proxyUrl.trim()),
            noProxy: typeof ov.noProxy === "string" ? ov.noProxy : (silent ? savedProxyNoProxy : proxyNoProxy),
            applyToPackageManager: typeof ov.applyToPackageManager === "boolean" ? ov.applyToPackageManager : proxyApplyNpm,
            autoFollowSystem: typeof ov.autoFollowSystem === "boolean" ? ov.autoFollowSystem : proxyAutoFollow,
        };
        // 请求序号：快速连点开关时，只让最后一次响应落地，避免旧响应覆盖新状态
        var seq = ++proxySaveSeqRef.current;
        // 回滚快照：静默保存是「乐观更新」——开关先拨再请求，失败必须拨回去，
        // 否则 UI 显示已开、后端其实没生效，用户下次重开弹窗才发现状态对不上。
        var rollback = silent
            ? { enabled: proxyEnabled, autoFollowSystem: proxyAutoFollow, applyToPackageManager: proxyApplyNpm }
            : null;
        if (!silent) {
            setProxyBusy(true);
            setProxyMsg(null);
        }
        fetch("/api/github/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
            if (seq !== proxySaveSeqRef.current)
                return; // 旧响应，丢弃
            setProxyBusy(false);
            if (j && j.ok) {
                if (j.state && j.state.systemProxy !== undefined)
                    setProxySystemProxy(j.state.systemProxy);
                if (j.state && typeof j.state.fetchProxyAvailable === "boolean")
                    setProxyFetchAvailable(j.state.fetchProxyAvailable);
                if (j.state && j.state.lastProbe)
                    setProxyProbe(j.state.lastProbe);
                if (silent) {
                    // 开关类改动：只给一句轻量回执，别用大段文案打断操作
                    setProxyAutoTip(new Date().toLocaleTimeString());
                    setTimeout(function () { setProxyAutoTip(""); }, 2600);
                }
                else {
                    // 手动保存成功：把输入框内容记为「已保存」，后续开关操作沿用这份值
                    setSavedProxyUrl(proxyUrl.trim());
                    setSavedProxyNoProxy(proxyNoProxy);
                    var effective = j.state && j.state.effectiveUrl;
                    var autoOn = j.state && j.state.config && j.state.config.autoFollowSystem;
                    setProxyMsg({
                        kind: "ok",
                        // 判断顺序必须「跟随系统优先于手动地址」：反过来会让「先存手动地址、再开跟随系统」
                        // 的用户看到手动口径的文案，而实际生效的是系统代理。
                        text: autoOn
                            ? (effective
                                ? "自动跟随已开启：当前跟随系统代理 " + effective + "，系统代理开关变化后 30 秒内自动同步"
                                : "自动跟随已开启：当前未检测到开启中的系统代理，将保持直连（系统代理开启后 30 秒内自动跟进）")
                            : j.state && j.state.config && j.state.config.enabled && j.state.config.url
                                ? "🌐 代理已保存并全局生效（驾驶舱 / 右侧栏 / Agent 工具 / 升级链路），无需重启"
                                : "已切换为系统默认网络（直连或系统环境代理），无需重启",
                    });
                }
            }
            else {
                if (rollback) {
                    setProxyEnabled(rollback.enabled);
                    setProxyAutoFollow(rollback.autoFollowSystem);
                    setProxyApplyNpm(rollback.applyToPackageManager);
                }
                setProxyMsg({ kind: "err", text: (j && j.message) || "保存失败（开关已恢复原状）" });
            }
        })
            .catch(function (e) {
            if (seq !== proxySaveSeqRef.current)
                return;
            setProxyBusy(false);
            if (rollback) {
                setProxyEnabled(rollback.enabled);
                setProxyAutoFollow(rollback.autoFollowSystem);
                setProxyApplyNpm(rollback.applyToPackageManager);
            }
            setProxyMsg({ kind: "err", text: "网络请求失败: " + (e && e.message ? e.message : e) + "（开关已恢复原状）" });
        });
    };
    /** 手动地址表单的保存入口（只有这里需要按钮） */
    var handleProxySave = function () {
        persistProxy({}, false);
    };
    var handleProxyProbe = function () {
        setProxyBusy(true);
        setProxyMsg(null);
        fetch("/api/github/proxy/probe", { method: "POST" })
            .then(function (r) { return r.json(); })
            .then(function (j) {
            setProxyBusy(false);
            if (j && j.ok && j.probe) {
                setProxyProbe(j.probe);
                // socks5 走的是 gh 链路而非 Node fetch，必须说明「测的是哪条链路」，
                // 否则用户无法解释为什么和浏览器直连的结果不一致
                var via = j.probe.viaGh ? "（经 gh 链路，socks5 代理）" : "";
                setProxyMsg(j.probe.ok
                    ? { kind: "ok", text: "✅ GitHub API 可达 (" + j.probe.latencyMs + "ms)" + via }
                    : { kind: "err", text: "❌ " + (j.probe.error || "探测失败") + via });
            }
            else {
                setProxyMsg({ kind: "err", text: (j && j.message) || "探测失败" });
            }
        })
            .catch(function (e) {
            setProxyBusy(false);
            setProxyMsg({ kind: "err", text: "探测请求失败: " + (e && e.message ? e.message : e) });
        });
    };
    return h("div", { className: "dsh-github-modal-overlay", onClick: props.onClose }, h("div", {
        // 加 `dsh-github-settings-dialog`：两栏布局需要比通用弹窗更宽（见 styles.ts 注释）
        className: "dsh-github-modal-dialog dsh-github-settings-dialog",
        onClick: function (e) { e.stopPropagation(); },
    }, h("div", { className: "dsh-github-modal-header" }, h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 600 } }, "⚙️ 设置"), h("button", {
        style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #656d76)" },
        onClick: props.onClose,
    }, "✕")), h("div", { className: "dsh-github-modal-body" }, h("div", { className: "dsh-github-settings-nav" }, h("button", {
        className: "dsh-github-settings-nav-item" + (activeSection === "sync" ? " active" : ""),
        onClick: function () { setActiveSection("sync"); },
    }, "🔄 数据同步"), h("button", {
        className: "dsh-github-settings-nav-item" + (activeSection === "proxy" ? " active" : ""),
        onClick: function () { setActiveSection("proxy"); },
    }, "🌐 网络代理"), h("button", {
        className: "dsh-github-settings-nav-item" + (activeSection === "audit" ? " active" : ""),
        onClick: function () { setActiveSection("audit"); },
    }, "🕘 操作记录与审核"), h("button", {
        className: "dsh-github-settings-nav-item" + (activeSection === "update" ? " active" : ""),
        onClick: function () { setActiveSection("update"); },
    }, "⬆️ 更新设置"), h("button", {
        className: "dsh-github-settings-nav-item" + (activeSection === "about" ? " active" : ""),
        onClick: function () { setActiveSection("about"); },
    }, "ℹ️ 关于")), h("div", { className: "dsh-github-settings-content" }, activeSection === "sync" ? h("div", null, h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } }, "配置 GitHub 全景驾驶舱的数据拉取节奏。启用秒开模式可利用本地持久化缓存消除每次打开时的漫长等待。"), h("div", { style: { marginBottom: "16px" } }, h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "数据刷新策略（三选一）"), h("div", {
        className: "dsh-github-radio-card" + (strategy === "swr" ? " active" : ""),
        onClick: function () { setStrategy("swr"); },
    }, h("input", { type: "radio", name: "sync-strategy", className: "dsh-github-radio", checked: strategy === "swr", readOnly: true }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "⚡ 秒开展示旧数据 (SWR, 强烈推荐)"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "打开立即展示上次本地缓存（0ms秒开），后台静默同步一次最新状态。"))), h("div", {
        className: "dsh-github-radio-card" + (strategy === "auto" ? " active" : ""),
        onClick: function () { setStrategy("auto"); },
    }, h("input", { type: "radio", name: "sync-strategy", className: "dsh-github-radio", checked: strategy === "auto", readOnly: true }), h("div", { style: { flex: 1 } }, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "☁️ 云端数据定时自动同步 (SWR + 定时轮询)"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "首屏秒开旧数据并立即拉新，拉取完成后开始计时；循环静默更新 PR、Issue 与 Actions。内置窗口息屏自动避让，防止耗尽配额。"), strategy === "auto"
        ? h("div", {
            style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" },
            onClick: function (e) { e.stopPropagation(); },
        }, h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", fontWeight: 500 } }, "同步周期:"), h("select", {
            className: "dsh-github-btn-sm",
            style: { padding: "4px 8px", fontSize: "12px", cursor: "pointer", background: "var(--dsw-alias-bg-base, #fff)" },
            value: cloudSyncIntervalMs,
            onChange: function (e) { setCloudSyncIntervalMs(Number(e.target.value)); },
        }, h("option", { value: 300000 }, "5 分钟 (高频感知)"), h("option", { value: 600000 }, "10 分钟 (标准推荐)"), h("option", { value: 1800000 }, "30 分钟 (轻量节省)"), h("option", { value: 3600000 }, "1 小时 (极低频)")))
        : null)), h("div", {
        className: "dsh-github-radio-card" + (strategy === "manual" ? " active" : ""),
        onClick: function () { setStrategy("manual"); },
    }, h("input", { type: "radio", name: "sync-strategy", className: "dsh-github-radio", checked: strategy === "manual", readOnly: true }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "📋 仅在手动点击时拉取 (Manual Only)"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "打开只浏览本地缓存，绝不自动触发后台 gh 进程，最省电、最省资源；想更新时点击「🔄 刷新」即可。")))), h("div", { style: { marginBottom: "16px", borderTop: "1px solid var(--dsw-alias-border-l2, #e1e4e8)", paddingTop: "14px" } }, h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "高级自动化与状态感知"), h("label", {
        style: { display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer", padding: "6px 8px", borderRadius: "6px", background: localGitWatch ? "var(--dsw-alias-bg-module-platform, rgba(9, 105, 218, 0.06))" : "transparent" },
    }, h("input", {
        type: "checkbox",
        style: { marginTop: "3px" },
        checked: localGitWatch,
        onChange: function (e) { setLocalGitWatch(e.target.checked); },
    }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "12px" } }, "📁 本地 Git 改动实时感知 (仅右侧栏生效)"), h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "定向监听当前仓库的 .git 核心元数据，代码修改、暂存与分支切换毫秒级自动对齐右侧栏，零网络流量消耗；全景首页不挂载，保持轻量。")))), h("div", {
        className: "dsh-github-cache-info-box",
    }, h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, h("span", null, cacheMeta.exists
        ? `📦 本地缓存: 约 ${cacheMeta.sizeKb} KB (上次保存: ${new Date(cacheMeta.savedAt).toLocaleTimeString()})`
        : "📦 暂无本地持久化缓存"), cacheMeta.exists ? h("button", {
        className: "dsh-github-btn-sm",
        style: { padding: "3px 8px", fontSize: "11px", color: "var(--dsw-alias-state-error-primary, #cf222e)" },
        onClick: handleClear,
    }, "🗑️ 清空缓存") : null), clearTip ? h("div", { style: { color: "var(--dsw-alias-state-success, #2ea043)", marginTop: "4px", fontWeight: 500 } }, clearTip) : null)) : activeSection === "audit" ? h("div", null, h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } }, "记录 Agent 对 Issue / PR 的每一次写操作。改动立即生效，无需重启。"), auditUsage ? h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "10px" } }, "当前已用 " + formatBytes(auditUsage.bytes) + " / " + formatBytes(auditUsage.maxBytes)
        // 「全部」是如实口径：这里统计的是全局记录，本分区的入口没有工作区筛选
        // （从右栏工作区打开记录窗口时只看本工作区，两处数字本来可以不同）
        + (auditRecords === null ? "" : " · 全部 " + auditRecords + " 条记录")
        + (auditUsage.degraded ? " · ⚠️ 存储不可用：" + auditUsage.degraded : "")) : null, h("div", { style: { marginBottom: "18px" } }, h("label", { style: { display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" } }, h("input", {
        type: "checkbox",
        checked: auditUsage ? auditUsage.enabled === true : true,
        disabled: auditBusy || !auditUsage,
        onChange: function (e) { saveAuditSettings({ enabled: e.target.checked === true }); },
        style: { marginTop: "2px" },
    }), h("div", null, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600 } }, "启用操作记录", h(HelpDot, { label: "启用操作记录", onOpen: helpFor("启用操作记录", HELP_RECORD_ENABLED) })), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "关闭后不再写入新记录、启动也不再加载历史；已有历史文件保留在本地，可在「🕘 操作记录」窗口里清空。")))), h("div", { style: { marginBottom: "18px" } }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, marginBottom: "6px" } }, "保留预算", h(HelpDot, { label: "保留预算", onOpen: helpFor("保留预算", HELP_BUDGET) })), h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, h("select", {
        className: "dsh-github-btn-sm",
        style: { padding: "4px 8px", fontSize: "12px", cursor: "pointer", background: "var(--dsw-alias-bg-base, #fff)" },
        value: String(Math.max(1, Math.round((Number(auditUsage && auditUsage.maxBytes) || 8 * 1048576) / 1048576))),
        disabled: auditBusy || !auditUsage || auditUsage.enabled !== true,
        onChange: function (e) { saveAuditSettings({ budgetMB: Number(e.target.value) }); },
    }, [1, 2, 4, 8, 16, 32, 64].map(function (mb) { return h("option", { key: mb, value: String(mb) }, mb + " MB"); }))), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "4px" } }, "超出预算时自动丢弃最早的记录。预算只暴露这一个数字——行数上限由它自动推算。")), 
    /*
     * 执行前人工审核（s2）：本插件自己的**审核范围**，与宿主的 approval 策略正交。
     *
     * 为什么文案里必须提 DSH 权限预设：档位说"要问"，而宿主说"问了有没有人答"。
     * `danger-full-access` 预设把策略固定成 `never`（派发前直接判 rejected），
     * 此时无论这里选什么都不会弹窗——不写清楚，用户只会看到"审核没生效"。
     * 为什么不再有"关闭记录时审核自动停用"：审批记录本身由宿主写在会话日志里
     * （approval/asked + approval/decided），不依赖本插件的 JSONL。
     */
    h("div", { style: { marginBottom: "18px" } }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "执行前人工审核", h(HelpDot, { label: "执行前人工审核", onOpen: helpFor("执行前人工审核", HELP_APPROVAL_SECTION) })), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "8px", lineHeight: "1.5" } }, "决定哪些 GitHub 写操作要先问你。命中后由 DSH 官方审核弹窗接管输入区：批准才真正执行，拒绝则工具当场失败，并把「不要重试、先确认意图」交回模型。"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-state-warning, #9a6700)", marginBottom: "8px", lineHeight: "1.5" } }, "⚠️ DSH 权限预设为 danger-full-access 时宿主不弹窗（审批策略被固定为 never），审核整体不生效；此时高危操作仍走原有的 confirm 二次确认。"), [
        { id: "off", title: "关闭审核", help: HELP_APPROVAL_OFF, label: "关闭（不弹窗，高危操作仍需 confirm: true）" },
        { id: "destructive", title: "仅高危（默认）", help: HELP_APPROVAL_DESTRUCTIVE, label: "仅高危（默认）：合并 / 关闭 / 删除 / 迁移等 6 项 PR 与 Issue 操作" },
        { id: "all-writes", title: "全部写操作", help: HELP_APPROVAL_ALL, label: "PR / Issue 的全部写操作（含创建 / 编辑 / 评论等 21 项）" },
    ].map(function (opt) {
        var active = auditApprovalMode === opt.id;
        return h("div", {
            key: opt.id,
            className: "dsh-github-radio-card" + (active ? " active" : ""),
            onClick: function () { if (!auditBusy)
                saveAuditSettings({ approvalMode: opt.id }); },
        }, h("input", { type: "radio", name: "audit-approval-mode", className: "dsh-github-radio", checked: active, readOnly: true }), 
        // 说明块要能撑满剩余宽度，长标签才会在这里换行而不是溢出卡片
        h("div", { style: { flex: 1, minWidth: 0, fontWeight: 600, fontSize: "13px" } }, opt.label), 
        // 问号固定在卡片右端、不随标签换行 —— 否则长标签的卡片里问号会被挤到第二行开头，
        // 三张卡片的问号位置各不相同（2026-11-26 用户截图实证）
        h(HelpDot, { label: opt.title, onOpen: helpFor(opt.title, opt.help) }));
    })), 
    /*
     * 按仓库 / 按 action 覆盖（s3）。
     *
     * 为什么只给一个多行文本框、不做规则编辑器 UI：字符串数组 + 3 个可复制示例
     * 已经覆盖真实需求（个位数规则），而做 UI 就要做校验、回显、迁移三件事，
     * 成本是收益的 5 倍。用户能复制一行改个仓库名就够了。
     */
    h("div", { style: { marginBottom: "18px" } }, h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, marginBottom: "6px" } }, "按仓库 / 操作覆盖档位", h(HelpDot, { label: "按仓库 / 操作覆盖档位", onOpen: helpFor("按仓库 / 操作覆盖档位", HELP_APPROVAL_RULES) })), h("textarea", {
        className: "dsh-github-textarea",
        value: auditRulesText,
        disabled: auditBusy || !auditUsage,
        rows: 4,
        spellCheck: false,
        placeholder: "repo:ItQianChen/dsh-github-flow=off\naction:github_issue:comment=off\nrepo:acme/prod|action:github_pr:merge=off",
        onChange: function (e) { setAuditRulesText(e.target.value); },
        onBlur: function () {
            /*
             * 失焦才保存：每次按键都发请求会打断输入。
             * 但**文本没变就不发**——否则用户离开规则框去点别的控件时，这一发请求
             * 会把 auditBusy 置真、把那几个控件瞬间 disabled，点击被吞掉。
             */
            if (auditBusy)
                return;
            var next = splitRules(auditRulesText).join("\n");
            if (next === auditRulesSavedRef.current)
                return;
            saveAuditSettings({ approvalRules: splitRules(auditRulesText) });
        },
        style: {
            width: "100%", boxSizing: "border-box", minHeight: "76px", resize: "vertical",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "11px", lineHeight: "1.6", padding: "6px 8px", borderRadius: "6px",
            border: "1px solid var(--dsw-alias-border-l2, #d1d9e0)",
            background: "var(--dsw-alias-bg-base, #fff)",
            color: "var(--dsw-alias-label-primary, #1f2328)",
        },
    }), h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "4px", lineHeight: "1.5" } }, "每行一条，失焦即保存。首条匹配生效；写错的行会被忽略并在下面标出来。"), 
    // 解析结果回显：**必须有**，否则规则写错了会静默失效（比多问一次危险得多）
    auditRulesParsed
        ? h("div", {
            style: {
                fontSize: "11px", marginTop: "4px", lineHeight: "1.5",
                color: auditRulesParsed.ignored.length > 0
                    ? "var(--dsw-alias-state-warning, #9a6700)"
                    : "var(--dsw-alias-label-secondary, #656d76)",
            },
        }, "解析出 " + auditRulesParsed.valid + " 条有效规则"
            + (auditRulesParsed.ignored.length > 0
                ? "，忽略 " + auditRulesParsed.ignored.length + " 条："
                    + auditRulesParsed.ignored.map(function (x) { return x.raw + "（" + x.reason + "）"; }).join("；")
                : ""))
        : null), 
    /*
     * 边界说明（一句白底黑字）。这不是装饰：
     * DSH 权限预设管的是**宿主权限**（沙箱 / 提权），本开关管的是
     * **GitHub 写操作的二次确认**——两套系统同名不同义，用户一定会混。
     * 这句话的成本是 40 个字，收益是少一批"为什么我关了审批它还在弹"的反馈。
     */
    h("div", {
        style: {
            fontSize: "11px", lineHeight: "1.6", padding: "6px 8px", marginBottom: "10px",
            borderRadius: "6px", background: "var(--dsw-alias-bg-base, #fff)",
            border: "1px solid var(--dsw-alias-border-l2, #e1e4e8)",
            color: "var(--dsw-alias-label-primary, #1f2328)",
        },
    }, "本开关与 DSH 的权限预设不是同一套：预设管宿主权限（沙箱 / 提权），本开关管 GitHub 写操作的二次确认。但宿主策略优先级更高——danger-full-access 下审批被固定为 never，这里无论选什么都不会弹窗（见上方警告）。"), auditMsg ? h("div", {
        style: {
            fontSize: "12px", marginTop: "4px",
            color: auditMsg.kind === "err" ? "var(--dsw-alias-state-error-primary, #cf222e)" : "var(--dsw-alias-state-success, #2ea043)",
        },
    }, auditMsg.text) : null) : activeSection === "update" ? h("div", null, h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } }, "选择插件新版本检测所用的 npm 源。检测与升级流量均遵循「🌐 网络代理」分区设置：启用 http/https 代理时自动经代理访问；socks5 代理下 npm 检测为直连（gh 与升级子进程链路仍走代理）。无论选择哪个源，安装与升级流程本身不受影响。"), h("div", { style: { marginBottom: "16px" } }, h("div", { style: { fontSize: "13px", fontWeight: 600, marginBottom: "8px" } }, "更新源"), h("div", {
        className: "dsh-github-radio-card" + (updateMode === "official" ? " active" : ""),
        onClick: function () { setUpdateMode("official"); },
    }, h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "official", readOnly: true }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "🌍 npm 官方源 (推荐)"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "版本全球首发最及时，刚发布的新版立即可见；国内直连可能较慢。"))), h("div", {
        className: "dsh-github-radio-card" + (updateMode === "mirror" ? " active" : ""),
        onClick: function () { setUpdateMode("mirror"); },
    }, h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "mirror", readOnly: true }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "🇨🇳 国内镜像 (npmmirror)"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "阿里云镜像，国内访问快；同步存在分钟级延迟，刚发布的新版可能暂时查不到。"))), h("div", {
        className: "dsh-github-radio-card" + (updateMode === "off" ? " active" : ""),
        onClick: function () { setUpdateMode("off"); },
    }, h("input", { type: "radio", className: "dsh-github-radio", checked: updateMode === "off", readOnly: true }), h("div", null, h("div", { style: { fontWeight: 600, fontSize: "13px" } }, "⛔ 不检查更新"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "关闭自动检查与新版提示横幅；/gh upgrade 命令与一键升级仍然可用。")))), h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } }, h("button", {
        className: "dsh-github-btn-sm dsh-github-primary-btn",
        disabled: updateBusy,
        onClick: handleUpdateSave,
    }, updateBusy ? "验证中..." : "💾 保存并全局应用"), updateMsg ? h("span", {
        style: {
            fontSize: "12px",
            lineHeight: "1.5",
            color: updateMsg.kind === "ok"
                ? "var(--dsw-alias-state-success, #2ea043)"
                : updateMsg.kind === "err"
                    ? "var(--dsw-alias-state-error-primary, #cf222e)"
                    : "var(--dsw-alias-label-secondary, #656d76)",
        },
    }, updateMsg.text) : null)) : activeSection === "about" ? h("div", null, h("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" } }, renderOctocatBadge(40), h("div", null, h("div", { style: { fontSize: "15px", fontWeight: 600 } }, "DSH GitHub Flow"), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginTop: "2px" } }, "当前版本: v" + (aboutVersion || "…")))), h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.6" } }, "让 DeepSeek Harness Agent 拥有操作 GitHub 的原生手脚。原生复用宿主机 gh CLI 安全凭据，深度打通本地 Git 工作区与云端协作，提供 19 大领域 Agent 工具、人类 Slash 指令、Web 全景驾驶舱与一键跨平台升级。"), h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" } }, h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } }, h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "仓库地址"), h("a", { href: "https://github.com/ItQianChen/dsh-github-flow", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "github.com/ItQianChen/dsh-github-flow")), h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } }, h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "npm 包"), h("a", { href: "https://www.npmjs.com/package/dsh-github-flow", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "npmjs.com/package/dsh-github-flow")), h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" } }, h("span", { style: { minWidth: "64px", color: "var(--dsw-alias-label-secondary, #656d76)" } }, "开源协议"), h("a", { href: "https://github.com/ItQianChen/dsh-github-flow/blob/master/LICENSE", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dsw-alias-link, #0969da)" } }, "MIT License"))), h("div", {
        className: "dsh-github-about-star-box",
        style: {
            display: "flex",
            alignItems: "center",
            gap: "10px",
        },
    }, h("span", { style: { fontSize: "18px" } }, "⭐"), h("div", { style: { flex: 1, fontSize: "12px", lineHeight: "1.5" } }, "如果这个插件对你的日常研发有帮助，欢迎到 GitHub 仓库点个 Star 支持一下——你的 Star 是持续迭代的动力！也欢迎提交 Issue 与 PR。"), h("a", {
        target: "_blank",
        href: "https://github.com/ItQianChen/dsh-github-flow",
        rel: "noopener noreferrer",
        className: "dsh-github-btn-sm dsh-github-primary-btn",
    }, "🌟 去点 Star"))) : h("div", null, h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #656d76)", marginBottom: "14px", lineHeight: "1.5" } }, "设置后插件的 GitHub 数据链路（本页面、右侧栏、Agent 工具调用、版本升级）全部经代理访问；未启用时默认使用系统环境代理或直连。保存后立即生效，无需重启。"), 
    /* 一级：代理总开关 + 测试连通性。
     * 「测试连通性」探测的是**实际生效**的配置，与开关是同一层级的使用动作，
     * 不该被压到手动表单下面（跟随系统时手动表单根本不显示，按钮就消失了）。 */
    h("div", { className: "dsh-proxy-level1" }, h("label", { className: "dsh-toggle-row", style: { flex: "1", marginBottom: 0 } }, h("input", {
        type: "checkbox",
        checked: proxyEnabled,
        onChange: function (e) {
            var v = Boolean(e.target.checked);
            setProxyEnabled(v);
            persistProxy({ enabled: v }, true); // 开关即时生效，无需点保存
        },
    }), h("span", { className: "dsh-toggle-track" }, h("span", { className: "dsh-toggle-thumb" })), h("div", { className: "dsh-toggle-body" }, h("div", { className: "dsh-toggle-title" }, "启用代理"), h("div", { className: "dsh-toggle-desc" }, "关闭后插件保持直连（各项设置会记住，下次开启时恢复）"))), h("button", {
        className: "dsh-github-btn-sm dsh-proxy-probe-btn",
        disabled: proxyBusy || !proxyEnabled,
        onClick: handleProxyProbe,
        title: "经实际生效的代理配置探测 GitHub API 连通性（约 2.5 秒）",
    }, "🧪 测试连通性"), proxyProbe ? h("span", {
        style: {
            fontSize: "12px",
            fontWeight: 500,
            whiteSpace: "nowrap",
            color: proxyProbe.ok ? "var(--dsw-alias-state-success, #2ea043)" : "var(--dsw-alias-state-error-primary, #cf222e)",
        },
        title: proxyProbe.error || "",
    }, proxyProbe.ok ? "✅ " + proxyProbe.latencyMs + "ms" : "❌ 探测失败") : null), 
    /* 二级开关：仅在总开关开启时出现。跟随系统 = 代理来源交给注册表；关闭 = 手动配置 */
    proxyEnabled ? h("div", { className: "dsh-toggle-sub" }, h("label", { className: "dsh-toggle-row" }, h("input", {
        type: "checkbox",
        checked: proxyAutoFollow,
        onChange: function (e) {
            var v = Boolean(e.target.checked);
            setProxyAutoFollow(v);
            persistProxy({ autoFollowSystem: v }, true);
        },
    }), h("span", { className: "dsh-toggle-track" }, h("span", { className: "dsh-toggle-thumb" })), h("div", { className: "dsh-toggle-body" }, h("div", { className: "dsh-toggle-title" }, "跟随系统代理"), h("div", { className: "dsh-toggle-desc" }, "读取 Windows 注册表的系统代理（clash / v2rayN 等工具的「系统代理」开关），开启则自动使用、关闭则自动直连，30 秒内同步"))), 
    /* npm 同步与「跟随系统代理」同级：无论代理来自系统还是手动地址，这个选项都控制 npm 链路是否跟随 */
    h("label", { className: "dsh-toggle-row" }, h("input", {
        type: "checkbox",
        checked: proxyApplyNpm,
        onChange: function (e) {
            var v = Boolean(e.target.checked);
            setProxyApplyNpm(v);
            persistProxy({ applyToPackageManager: v }, true);
        },
    }), h("span", { className: "dsh-toggle-track" }, h("span", { className: "dsh-toggle-thumb" })), h("div", { className: "dsh-toggle-body" }, h("div", { className: "dsh-toggle-title" }, "同时应用于 npm 版本探测与一键升级"), h("div", { className: "dsh-toggle-desc" }, "npm registry 探测与一键升级流量是否也经当前代理访问（socks5 时探测保持直连）"))), 
    /* 三级内容：跟随开 → 检测状态卡；跟随关 → 手动表单 */
    proxyAutoFollow
        ? h("div", {
            style: {
                fontSize: "12px", lineHeight: "1.6", marginBottom: "10px", padding: "10px 12px",
                borderRadius: "6px",
                background: proxySystemProxy && proxySystemProxy.enabled
                    ? "var(--dsw-alias-state-success-subtle, rgba(46, 160, 67, 0.1))"
                    : "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.03))",
                color: proxySystemProxy && proxySystemProxy.enabled
                    ? "var(--dsw-alias-state-success, #1a7f37)"
                    : "var(--dsw-alias-label-secondary, #656d76)",
            },
        }, describeSystemProxy(proxySystemProxy))
        : h("div", null, h("div", { style: { fontSize: "12px", marginBottom: "4px" } }, "代理地址"), h("input", {
            className: "dsh-github-input",
            style: { width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: "13px", marginBottom: "10px" },
            placeholder: "http://127.0.0.1:7890 或 socks5h://127.0.0.1:1080（DNS 由代理解析）",
            value: proxyUrl,
            onChange: function (e) { setProxyUrl(e.target.value); },
        }), h("div", { style: { fontSize: "12px", marginBottom: "4px" } }, "NO_PROXY 排除列表（逗号分隔，localhost 与 127.0.0.1 强制包含）"), h("input", {
            className: "dsh-github-input",
            style: { width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: "12px", marginBottom: "10px" },
            value: proxyNoProxy,
            onChange: function (e) { setProxyNoProxy(e.target.value); },
        }), 
        /* 只有手动地址这一层需要按钮：开关类改动都是即时保存的 */
        h("button", {
            className: "dsh-github-btn-sm",
            style: {
                padding: "5px 14px",
                fontSize: "12px",
                background: "var(--dsw-alias-link, #0969da)",
                color: "#ffffff",
                borderColor: "var(--dsw-alias-link, #0969da)",
                fontWeight: 600,
            },
            disabled: proxyBusy,
            onClick: handleProxySave,
            title: "保存上面填写的代理地址与排除列表",
        }, proxyBusy ? "保存中..." : "💾 保存地址配置"), 
        /* fetchProxyAvailable 的唯一消费者：npm 探测链路（Node fetch）只有在
         * http/https 代理且 undici 可解析时才真的走代理。socks5 或宿主无 undici
         * 时它保持直连——不说清楚，用户会以为「代理开了但 npm 还慢」是 bug。 */
        proxyFetchAvailable === false && String(proxyUrl || "").trim()
            ? h("div", {
                style: { fontSize: "11px", opacity: 0.6, marginTop: "8px", lineHeight: 1.6 },
            }, "⚠️ 该地址无法用于 npm 版本探测（socks5 或当前宿主无法解析 undici），npm 探测将保持直连；GitHub 数据链路与 Agent 工具不受影响。")
            : null)) : null, 
    /* 自动保存回执：开关拨动后给一句轻量确认，不打断操作 */
    proxyAutoTip ? h("div", {
        style: { fontSize: "11px", color: "var(--dsw-alias-state-success, #2ea043)", marginTop: "2px" },
    }, "开关已即时生效并保存（" + proxyAutoTip + "）") : null, proxyMsg ? h("div", {
        style: {
            marginTop: "8px",
            fontSize: "12px",
            lineHeight: "1.5",
            color: proxyMsg.kind === "ok"
                ? "var(--dsw-alias-state-success, #2ea043)"
                : proxyMsg.kind === "err"
                    ? "var(--dsw-alias-state-error-primary, #cf222e)"
                    : "var(--dsw-alias-label-secondary, #656d76)",
        },
    }, proxyMsg.text) : null))), h("div", { className: "dsh-github-modal-footer" }, activeSection === "sync" ? h("button", {
        className: "dsh-github-btn-sm",
        style: {
            padding: "6px 16px",
            background: "var(--dsw-alias-link, #0969da)",
            color: "#ffffff",
            borderColor: "var(--dsw-alias-link, #0969da)",
            fontWeight: 600,
        },
        onClick: handleSave,
    }, "保存同步设置") : null, h("button", {
        className: "dsh-github-btn-sm",
        style: { padding: "6px 14px" },
        onClick: props.onClose,
    }, activeSection === "sync" ? "取消" : "完成"))), 
    // 二级说明弹窗：作为设置页遮罩的第二个子节点，盖在对话框之上（见 HelpModal 的层级说明）
    helpTopic ? h(HelpModal, { topic: helpTopic, onClose: closeHelp }) : null);
}
