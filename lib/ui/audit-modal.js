/**
 * 操作记录大窗口（Agent 对 PR / Issue 做了什么）。
 *
 * 为什么做成大弹窗而不是右侧第 6 个 Tab：
 * 1. `phase33` 的断言是从 `dsh-github-tab-btn` 出现次数派生标签数的（现 5 个），
 *    加 Tab 会让三处文档数字与一条断言一起动；
 * 2. 「翻旧账」是低频查询动作，不配占一个常驻标签位。
 *
 * 交互契约：
 * - 打开即拉一页（50 条），筛选变化重新拉，不做本地过滤（口径以服务端为准）；
 * - 删除是**真删除**（服务端追加墓碑后整体压实），因此必须二次确认；
 * - 服务端降级（目录不可写等）时显式提示「记录功能已禁用」，**不能**显示成空列表——
 *   「Agent 什么都没做」和「记录坏了」是两件完全不同的事。
 *
 * 为什么不用 `window.confirm()`：本仓所有弹窗都是自绘的，Electron 内原生对话框
 * 行为不一致；这里用**两段式按钮**（点一次进确认态，再点一次执行），零依赖且可测。
 */
import { formatRelativeTime as fmtRelative } from './utils.js';
/** 每页条数候选。上限 100：服务端 `limit` 会钳到 200，这里留一倍余量 */
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 10;
/** 每页条数属于"阅读习惯"，持久化到 localStorage；不写进记录、不入版本库 */
const PAGE_SIZE_STORAGE_KEY = 'dsh-github-audit-page-size';
/**
 * 工具筛选的候选：**只有 PR 与 Issue**。
 *
 * 记录本身就限定在这两个工具的写操作上（`AUDITED_TOOLS`），列出 Release / 标签 /
 * 缓存等选项毫无意义——选了永远是空列表。筛选器只能列"可能出现的值"。
 * 该页若出现表里没有的工具（历史遗留数据），下面会把它补进来，避免无法筛选。
 */
const TOOL_FILTER_OPTIONS = [
    { value: 'github_pr', label: 'PR' },
    { value: 'github_issue', label: 'Issue' },
];
const DECISION_LABEL = {
    auto: '自动',
    confirmed: '确认',
    approved: '已批准',
    rejected: '已拒绝',
    expired: '已超时',
    'no-client': '未审核',
    cancelled: '已取消',
};
const RISK_COLOR = {
    read: 'var(--dsw-alias-label-secondary, #656d76)',
    write: '#9a6700',
    destructive: '#cf222e',
};
function apiUrl(path, params) {
    var qs = Object.keys(params)
        .filter(function (k) { return params[k] !== ''; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
        .join('&');
    return '/api/github' + path + (qs ? '?' + qs : '');
}
export function AuditModal(props) {
    if (!props.isOpen)
        return null;
    var scope = props.scope === 'workspace' ? 'workspace' : 'global';
    var scopedCwd = scope === 'workspace' ? (props.cwd || '') : '';
    var h = React.createElement;
    var [items, setItems] = React.useState([]);
    var [total, setTotal] = React.useState(0);
    var [loading, setLoading] = React.useState(false);
    var [busy, setBusy] = React.useState(false);
    var [error, setError] = React.useState(null);
    var [degraded, setDegraded] = React.useState(null);
    // 记录本身已限定为「PR / Issue 的写操作」，因此不再需要「仅写操作」筛选
    var [onlyDestructive, setOnlyDestructive] = React.useState(false);
    var [toolFilter, setToolFilter] = React.useState('');
    var [selected, setSelected] = React.useState([]);
    /** 两段式确认：'delete' / 'clear' 时底部按钮进入确认态，再点一次才真正执行 */
    var [armed, setArmed] = React.useState(null);
    /** 用量与开关（服务端 `usage`）：`enabled=false` 时列表为空是"关掉了"，不是"没有记录" */
    var [usage, setUsage] = React.useState(null);
    /** 当前页（0 基）；每页条数可调，翻页由服务端 offset 承担（不在前端切） */
    var [page, setPage] = React.useState(0);
    /**
     * 每页条数。
     *
     * 为什么持久化：这是个人阅读习惯，不是记录内容——每次打开都重挑一遍很烦。
     * 读取时校验候选集：localStorage 里可能是旧版本留下的非法值（或被人手改过），
     * 不校验就会拿一个 `NaN` 去请求服务端。
     */
    var [pageSize, setPageSize] = React.useState(function () {
        try {
            var saved = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
            return PAGE_SIZE_OPTIONS.indexOf(saved) >= 0 ? saved : DEFAULT_PAGE_SIZE;
        }
        catch {
            return DEFAULT_PAGE_SIZE;
        }
    });
    /**
     * 详情弹窗：`detailRecord` 非空时弹出第二级窗口。
     *
     * 为什么拆成四个状态而不是塞进一个对象：加载中 / 出错 / 拿到数据 是三件不同的事，
     * 合并成一个 `{loading,error,data}` 会让 "刷新同一条" 时的中间态难以表达清楚。
     */
    var [detailRecord, setDetailRecord] = React.useState(null);
    var [detailData, setDetailData] = React.useState(null);
    var [detailLoading, setDetailLoading] = React.useState(false);
    var [detailError, setDetailError] = React.useState(null);
    /**
     * 两个布尔必须分开（服务端 `usage` 也分两个）：
     * - `recordEnabled`：**用户的开关**，驱动复选框；
     * - `recordActive`：**实际在工作**（开关开 且 存储没降级），驱动列表与关闭态。
     * 合并成一个的话，磁盘坏掉时复选框会显示成"未勾选"，用户再点一下又因为
     * "开关本来就是开的"而无变化——一个怎么点都不动的开关，比明确的错误提示更糟。
     */
    var recordEnabled = usage ? usage.enabled === true : true;
    var recordActive = usage ? usage.active === true : true;
    /** 相对时间：记录里是 epoch 毫秒，而 formatRelativeTime 吃 ISO 字符串 */
    var relTime = function (ms) {
        if (typeof ms !== 'number' || !isFinite(ms))
            return '';
        try {
            return fmtRelative(new Date(ms).toISOString());
        }
        catch {
            return '';
        }
    };
    var load = function () {
        setLoading(true);
        setError(null);
        var url = apiUrl('/audit/records', {
            limit: String(pageSize),
            offset: String(page * pageSize),
            risk: onlyDestructive ? 'destructive' : '',
            tool: toolFilter,
            cwd: scopedCwd,
        });
        fetch(url)
            // 先看 HTTP 状态再解析：路由不存在时 webServer 返回的是 HTML（或空体），
            // 只写 `r.json()` 会得到"无法解析的内容"这种对用户毫无指引的报错。
            .then(function (r) {
            return r
                .json()
                .then(function (j) { return { status: r.status, j: j }; })
                .catch(function () { return { status: r.status, j: null }; });
        })
            .then(function (res) {
            setLoading(false);
            if (!res.j) {
                setError(res.status === 404
                    ? '后端还没有这个接口（HTTP 404）。插件刚升级时需要**重启 DSH 桌面端**载入新后端，重启后再刷新本页。'
                    : '服务端返回了无法解析的内容（HTTP ' + res.status + '）。请重启 DSH 桌面端后重试。');
                return;
            }
            var j = res.j;
            if (!j.ok) {
                setError(j.message || '读取操作记录失败');
                return;
            }
            setItems(Array.isArray(j.data && j.data.items) ? j.data.items : []);
            var totalNow = Number(j.data && j.data.total) || 0;
            setTotal(totalNow);
            // 删完最后一页的最后几条后，当前页会落到空页：自动回退到最后一个有内容的页
            if (page > 0 && totalNow <= page * pageSize) {
                setPage(Math.max(0, Math.ceil(totalNow / pageSize) - 1));
            }
            setDegraded(j.data && j.data.degraded ? String(j.data.degraded) : null);
            if (j.data && j.data.usage)
                setUsage(j.data.usage);
            setSelected([]);
            setArmed(null);
        })
            .catch(function (err) {
            setLoading(false);
            setError('网络请求异常：' + ((err && err.message) || '未知错误'));
        });
    };
    /**
     * 字节 → 人类可读。**只有展示用**：记账与预算判断一律在服务端按字节做
     * （中文 3 字节/字，前端按字符数算会少算 3 倍）。
     * 小于 1 MB 时改用 KB：以前一律保留一位小数的 MB，几百字节会显示成
     * 「已用 0.0 MB」，看着像坏了。
     */
    var mbText = function (bytes) {
        var b = Number(bytes) || 0;
        if (b < 1024)
            return b + ' B';
        if (b < 1048576)
            return (b / 1024).toFixed(1) + ' KB';
        var mb = b / 1048576;
        return (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)) + ' MB';
    };
    /** 从 `target`（形如 "#12"）或摘要里抠出 PR / Issue 编号；挖不到返回 0 */
    var targetNumber = function (v) {
        var m = String(v || '').match(/#(\d+)/);
        return m ? Number(m[1]) : 0;
    };
    /*
     * 详情弹窗的数据源：按记录里的编号去拉**真实的** PR / Issue。
     *
     * 为什么必须另发一次请求：记录里只有一句人话摘要（"合并 PR #12（squash）"），
     * 用户点开详情想看的是那条 PR/Issue 本身——标题、状态、作者、正文、改动文件。
     * 拉不到也不阻断查看：记录字段照常显示，只多一行"为什么没拉到"（比如 PR 已删除、
     * 仓库改名、无 gh 权限），这比弹一个空白区更有用。
     */
    React.useEffect(function () {
        if (!detailRecord) {
            setDetailData(null);
            setDetailError(null);
            setDetailLoading(false);
            return;
        }
        /*
         * 被拒绝的操作**不去远端找内容**。
         *
         * 原因：那次操作在 GitHub 上根本没发生——`pr create` 被拒时连 PR 都不存在，
         * `merge` 被拒时 PR 还在但它并不是"这条记录"的产物；远端还可能返回一个与
         * 记录无关的同名编号。这类记录只展示本地快照（参数原文），那才是
         * "用户当时拒绝的那份提交内容"。
         */
        if (detailRecord.decision === 'rejected') {
            setDetailData(null);
            setDetailError(null);
            setDetailLoading(false);
            return;
        }
        var kind = detailRecord.tool === 'github_pr' ? 'pr' : detailRecord.tool === 'github_issue' ? 'issue' : '';
        var num = targetNumber(detailRecord.target) || targetNumber(detailRecord.summary);
        if (!kind || !num) {
            setDetailData(null);
            setDetailError(null);
            setDetailLoading(false);
            return;
        }
        setDetailLoading(true);
        setDetailError(null);
        setDetailData(null);
        var url = '/api/github/' + kind + '-detail?number=' + encodeURIComponent(String(num)) +
            (detailRecord.repo ? '&repo=' + encodeURIComponent(detailRecord.repo) : '') +
            (detailRecord.cwd ? '&cwd=' + encodeURIComponent(detailRecord.cwd) : '');
        fetch(url)
            .then(function (r) { return r.json().catch(function () { return null; }); })
            .then(function (j) {
            setDetailLoading(false);
            if (j && j.ok && j.data)
                setDetailData(j.data);
            else
                setDetailError((j && (j.error || j.message)) || '读取 GitHub 详情失败');
        })
            .catch(function (err) {
            setDetailLoading(false);
            setDetailError('网络请求异常：' + ((err && err.message) || '未知错误'));
        });
    }, [detailRecord]);
    // 翻页 / 换筛选都要重新拉数据；翻页时不重置筛选条件
    React.useEffect(function () {
        if (props.isOpen)
            load();
    }, [props.isOpen, props.scope, props.cwd, onlyDestructive, toolFilter, page, pageSize]);
    React.useEffect(function () {
        var onKeyDown = function (e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                // 详情弹窗开着时先关它：一次 Esc 关掉三层窗口，用户会不知道自己在哪
                if (detailRecord) {
                    setDetailRecord(null);
                    return;
                }
                props.onClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return function () { window.removeEventListener('keydown', onKeyDown); };
    }, [props.onClose, detailRecord]);
    var post = function (path, body, after) {
        setBusy(true);
        fetch('/api/github' + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
        })
            .then(function (r) { return r.json().catch(function () { return null; }); })
            .then(function (j) {
            setBusy(false);
            if (!j || !j.ok) {
                setError((j && j.message) || '操作失败');
                return;
            }
            after();
            load();
        })
            .catch(function (err) {
            setBusy(false);
            setError('网络请求异常：' + ((err && err.message) || '未知错误'));
        });
    };
    var toggle = function (id) {
        setArmed(null);
        setSelected(function (prev) {
            return prev.indexOf(id) >= 0 ? prev.filter(function (x) { return x !== id; }) : prev.concat([id]);
        });
    };
    var allSelected = items.length > 0 && selected.length === items.length;
    var toggleAll = function () {
        setArmed(null);
        setSelected(allSelected ? [] : items.map(function (it) { return it.id; }));
    };
    /** 页数：至少 1，用于禁用上一页/下一页 */
    var pageCount = Math.max(1, Math.ceil(total / pageSize));
    /**
     * 改每页条数。
     * 必须把 page 归零：原来在第 5 页（每页 10 条），改成每页 100 条后第 5 页大概率越界，
     * 服务端会返回空页 —— 用户看到的是"改了条数记录就没了"。
     */
    var changePageSize = function (next) {
        setPageSize(next);
        setPage(0);
        setArmed(null);
        try {
            window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(next));
        }
        catch { /* 隐私模式写不了，不影响本次使用 */ }
    };
    var handleDelete = function () {
        if (selected.length === 0 || busy)
            return;
        if (armed !== 'delete') {
            setArmed('delete');
            return;
        }
        setArmed(null);
        post('/audit/records/delete', { ids: selected }, function () { setSelected([]); });
    };
    var handleClear = function () {
        if (busy)
            return;
        if (armed !== 'clear') {
            setArmed('clear');
            return;
        }
        setArmed(null);
        post('/audit/records/clear', {}, function () { setSelected([]); });
    };
    /*
     * 工具下拉的候选 = **固定的 19 个工具** + 该页出现但不在表里的（新增工具兜底）。
     * 顺序按 TOOL_FILTER_OPTIONS（PR / Issue 在最前），不排序——
     * 「PR / Issue」被排到字母序中间就失去了"最常用"的意图。
     */
    var toolOptions = TOOL_FILTER_OPTIONS.slice();
    items.forEach(function (it) {
        var name = it && typeof it.tool === 'string' ? it.tool : '';
        if (name && !toolOptions.some(function (o) { return o.value === name; })) {
            toolOptions.push({ value: name, label: name });
        }
    });
    // 已选中的值必须留在候选里（否则 select 会显示成空白）
    if (toolFilter && !toolOptions.some(function (o) { return o.value === toolFilter; })) {
        toolOptions.push({ value: toolFilter, label: toolFilter });
    }
    /** 详情里的一行「标签：值」；值为空时显示占位，不留空白让人以为没记 */
    var detailRow = function (label, value) {
        var shown = value === null || value === undefined || value === '' ? '（未记录）' : String(value);
        return h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } }, h('span', { style: { flex: '0 0 78px', opacity: 0.65 } }, label), h('span', { style: { flex: 1, minWidth: 0, wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' } }, shown));
    };
    /** 表头单元格样式：列宽 + 对齐（操作列不传宽度，吃掉剩余空间） */
    var thStyle = function (width, align) {
        return {
            width: width ? width + 'px' : undefined,
            textAlign: align || 'left',
            padding: '6px 5px',
            fontWeight: 600,
            fontSize: '10px',
            color: 'var(--dsw-alias-label-secondary, #656d76)',
            borderBottom: '1px solid var(--dsw-alias-border-l2, #eaeef2)',
            whiteSpace: 'nowrap',
            verticalAlign: 'middle',
        };
    };
    /** 单元格基础样式：只有下边框与内边距，颜色/对齐由各列覆盖 */
    var tdBase = {
        padding: '7px 5px',
        verticalAlign: 'top',
        borderBottom: '1px solid var(--dsw-alias-border-l2, #eaeef2)',
    };
    /*
     * 行渲染：`<tr>` + 6 个 `<td>`，顺序与 thead 的 6 个 `<th>` 严格一一对应。
     * 列宽只声明在 thead（tableLayout:fixed），行里不再写宽度——**一份列定义**，
     * 这是"表头与数据不错位"的结构性保证，而不是靠两处数值保持一致。
     */
    var renderRow = function (it) {
        var checked = selected.indexOf(it.id) >= 0;
        var resultText = it.result === 'fail' ? '❌ 失败' : it.result === 'unknown' ? '⏳ 未记录' : '✅ 成功';
        var resultColor = it.result === 'fail' ? '#cf222e' : it.result === 'unknown' ? '#9a6700' : '#1a7f37';
        var toolAction = (it.tool || '') + (it.action ? '.' + it.action : '');
        return h('tr', {
            key: it.id,
            style: { background: checked ? 'var(--dsw-alias-bg-module-platform, #f6f8fa)' : 'transparent' },
        }, h('td', { style: { ...tdBase, paddingTop: '9px' } }, h('input', {
            type: 'checkbox',
            checked: checked,
            onChange: function () { toggle(it.id); },
            style: { cursor: 'pointer' },
            'aria-label': '选择该记录',
        })), h('td', { style: { ...tdBase, fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #656d76)', whiteSpace: 'nowrap' } }, relTime(it.at) || '—'), h('td', { style: { ...tdBase, minWidth: 0 } }, h('div', {
            style: {
                color: RISK_COLOR[it.risk] || 'inherit',
                fontWeight: it.risk === 'destructive' ? 600 : 400,
                wordBreak: 'break-word',
            },
            title: toolAction,
        }, it.summary || toolAction), h('div', { style: { fontSize: '10px', opacity: 0.7, marginTop: '2px', wordBreak: 'break-word' } }, [it.repo, toolAction].filter(Boolean).join(' · '))), h('td', { style: { ...tdBase, fontSize: '11px', whiteSpace: 'nowrap' } }, DECISION_LABEL[it.decision] || it.decision || '自动'), h('td', { style: { ...tdBase, fontSize: '11px', color: resultColor, whiteSpace: 'nowrap' }, title: it.errorType || '' }, resultText), h('td', { style: { ...tdBase, textAlign: 'right', whiteSpace: 'nowrap' } }, h('button', {
            className: 'dsh-github-btn-sm',
            onClick: function () { setDetailRecord(it); },
            style: { padding: '2px 8px', fontSize: '11px' },
            title: '查看这条记录对应的 PR / Issue 内容',
        }, '详情')));
    };
    var filterChip = function (label, active, onClick) {
        return h('button', {
            className: 'dsh-github-btn-sm' + (active ? ' active' : ''),
            onClick: onClick,
            style: { padding: '3px 8px', fontSize: '11px' },
            'aria-pressed': active ? 'true' : 'false',
        }, label);
    };
    /*
     * 二级详情弹窗：记录字段 + **真实的 PR / Issue 内容**。
     *
     * 为什么正文用 <pre> 而不是 markdown 渲染：本仓的 markdown-lite 是构建期内联的
     * 全局函数，跨模块依赖只能靠"内联顺序"保证——2026-11-26 的白屏事故就是这么来的
     * （见 utils 那条 import 别名注释）。看内容是首要目的，排版次要，
     * 这里选零跨模块依赖的纯文本渲染，宁可朴素也不引入第二条隐形依赖。
     */
    var renderDetailPopup = function () {
        var it = detailRecord;
        if (!it)
            return null;
        var d = detailData || {};
        var stateText = d.state ? String(d.state) : '';
        var stateColor = /MERGED/i.test(stateText)
            ? '#8250df'
            : /CLOSED/i.test(stateText)
                ? '#cf222e'
                : /OPEN/i.test(stateText)
                    ? '#1a7f37'
                    : 'inherit';
        var author = (d.author && (d.author.login || d.author.name)) || '';
        var bodyText = typeof d.body === 'string' ? d.body.trim() : '';
        var files = Array.isArray(d.files) ? d.files : [];
        /* 本地参数快照：详情页在任何情况下都要能展示"当时提交了什么" */
        var argsText = typeof it.args === 'string' ? it.args : '';
        var argsObj = null;
        if (argsText) {
            try {
                argsObj = JSON.parse(argsText);
            }
            catch {
                argsObj = null;
            }
        }
        var isLongValue = function (v) {
            return typeof v === 'string' && (v.length > 60 || v.indexOf('\n') >= 0);
        };
        var monoPre = {
            margin: '2px 0 0',
            padding: '6px 8px',
            maxHeight: '180px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '11px',
            lineHeight: 1.6,
            borderRadius: '6px',
            background: 'var(--dsw-alias-bg-module-platform, #f6f8fa)',
            border: '1px solid var(--dsw-alias-border-l2, #eaeef2)',
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        };
        var chip = function (text, color) {
            return h('span', {
                style: {
                    fontSize: '10px',
                    padding: '1px 7px',
                    borderRadius: '999px',
                    border: '1px solid var(--dsw-alias-border-l2, #d1d9e0)',
                    color: color || 'var(--dsw-alias-label-secondary, #656d76)',
                    whiteSpace: 'nowrap',
                },
            }, text);
        };
        return h('div', {
            style: {
                position: 'fixed',
                inset: '0',
                zIndex: 100002,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.45)',
            },
            onClick: function () { setDetailRecord(null); },
        }, h('div', {
            className: 'dsh-github-modal-dialog',
            onClick: function (e) { e.stopPropagation(); },
            style: {
                width: 'min(760px, 94vw)',
                maxHeight: '86vh',
                overflowY: 'auto',
                padding: '16px 18px',
                borderRadius: '10px',
                background: 'var(--dsw-alias-bg-module-platform, #ffffff)',
                color: 'var(--dsw-alias-label-primary, #1f2328)',
                border: '1px solid var(--dsw-alias-border-l2, #d1d9e0)',
                boxSizing: 'border-box',
            },
        }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', { style: { fontSize: '15px' } }, '🧾'), h('strong', { style: { fontSize: '14px' } }, '记录详情'), d.url
            ? h('a', {
                href: d.url,
                target: '_blank',
                rel: 'noopener noreferrer',
                style: { fontSize: '11px', color: 'var(--dsw-alias-link, #0969da)', textDecoration: 'none' },
            }, '在 GitHub 打开 ↗')
            : null, h('div', { style: { flex: 1 } }), h('button', {
            className: 'dsh-github-btn-sm',
            onClick: function () { setDetailRecord(null); },
            style: { padding: '2px 8px', fontSize: '12px' },
            title: '关闭',
        }, '✕')), h('div', { style: { fontSize: '13px', fontWeight: 600, marginTop: '6px', wordBreak: 'break-word' } }, it.summary || ''), h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' } }, chip(relTime(it.at) || '时间未记录'), it.repo ? chip(it.repo) : null, chip('审核：' + (DECISION_LABEL[it.decision] || it.decision || '自动')), chip(it.result === 'fail' ? '❌ 失败' : it.result === 'unknown' ? '⏳ 未记录结果' : '✅ 成功', it.result === 'fail' ? '#cf222e' : it.result === 'unknown' ? '#9a6700' : '#1a7f37')), h('div', {
            style: {
                marginTop: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--dsw-alias-border-l2, #d1d9e0)',
                background: 'var(--dsw-alias-bg-base, #ffffff)',
            },
        }, h('div', { style: { fontSize: '11px', fontWeight: 600, opacity: 0.7, marginBottom: '6px' } }, it.tool === 'github_pr' ? 'PR 内容' : it.tool === 'github_issue' ? 'Issue 内容' : 'GitHub 内容'), it.decision === 'rejected'
            ? h('div', { style: { fontSize: '12px', color: '#9a6700', lineHeight: 1.7 } }, '这次操作被拒绝，GitHub 上没有对应内容（操作从未发生）。下面是记录时保存的调用参数。')
            : detailLoading
                ? h('div', { style: { fontSize: '12px', opacity: 0.75 } }, '正在读取 GitHub 内容…')
                : detailError
                    ? h('div', { style: { fontSize: '12px', color: '#9a6700', lineHeight: 1.7 } }, '读不到这条 ' + (it.tool === 'github_pr' ? 'PR' : 'Issue') + ' 的内容：' + detailError, h('div', { style: { opacity: 0.8, marginTop: '2px' } }, '常见原因：PR / Issue 已删除、仓库已改名或转移、当前 gh 账号无访问权限。记录本身不受影响。'))
                    : d.title
                        ? h('div', null, h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, h('span', { style: { fontSize: '13px', fontWeight: 600, wordBreak: 'break-word' } }, d.title), stateText ? chip(stateText + (d.isDraft ? ' · Draft' : ''), stateColor) : null), h('div', { style: { fontSize: '11px', opacity: 0.75, marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '10px' } }, author ? h('span', null, '作者：' + author) : null, d.baseRefName && d.headRefName ? h('span', null, '分支：' + d.headRefName + ' → ' + d.baseRefName) : null, typeof d.additions === 'number'
                            ? h('span', null, '改动：+' + d.additions + ' / -' + (d.deletions || 0) + ' · ' + (d.changedFiles || files.length) + ' 个文件')
                            : null, Array.isArray(d.comments) ? h('span', null, '评论：' + d.comments.length) : null), bodyText
                            ? h('pre', {
                                style: {
                                    margin: '8px 0 0',
                                    padding: '8px 10px',
                                    maxHeight: '220px',
                                    overflow: 'auto',
                                    fontSize: '11px',
                                    lineHeight: 1.6,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    borderRadius: '6px',
                                    background: 'var(--dsw-alias-bg-module-platform, #f6f8fa)',
                                    border: '1px solid var(--dsw-alias-border-l2, #eaeef2)',
                                    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                                },
                            }, bodyText)
                            : h('div', { style: { fontSize: '11px', opacity: 0.6, marginTop: '6px' } }, '（这条没有正文描述）'), files.length > 0
                            ? h('div', { style: { marginTop: '8px', fontSize: '11px', lineHeight: 1.8 } }, h('div', { style: { opacity: 0.7, marginBottom: '2px' } }, '改动文件（前 ' + Math.min(files.length, 10) + ' 个' + (files.length > 10 ? '，共 ' + files.length + ' 个' : '') + '）'), files.slice(0, 10).map(function (f, i) {
                                return h('div', {
                                    key: (f && f.path) || i,
                                    style: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', wordBreak: 'break-all' },
                                }, (f && f.path) || '(未知路径)', typeof (f && f.additions) === 'number' ? h('span', { style: { color: '#1a7f37' } }, '  +' + f.additions) : null, typeof (f && f.deletions) === 'number' ? h('span', { style: { color: '#cf222e' } }, '  -' + f.deletions) : null);
                            }))
                            : null)
                        : h('div', { style: { fontSize: '12px', opacity: 0.7 } }, '这条记录没有关联到可读取的 PR / Issue（例如非 PR/Issue 工具的操作）。')), 
        /*
         * 本地参数快照区。
         * 这是详情页的**底线**：远端内容可能不存在（被拒绝）、可能腐烂（PR 删了、
         * 仓库改了、权限没了），但这一段永远在——它就是记录时写下的东西。
         */
        h('div', {
            style: {
                marginTop: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--dsw-alias-border-l2, #d1d9e0)',
                background: 'var(--dsw-alias-bg-base, #ffffff)',
            },
        }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, opacity: 0.7, marginBottom: '6px' } }, '本次调用参数（记录时保存）', it.argsTruncated ? chip('已截断', '#9a6700') : null), !argsText
            ? h('div', { style: { fontSize: '12px', opacity: 0.7 } }, '这条记录没有保存参数快照（旧格式记录；升级后再产生的记录会带）。')
            : argsObj && typeof argsObj === 'object'
                ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' } }, Object.keys(argsObj).map(function (k) {
                    var v = argsObj[k];
                    if (isLongValue(v)) {
                        return h('div', { key: k }, h('div', { style: { opacity: 0.65 } }, k), h('pre', { style: monoPre }, v));
                    }
                    return h('div', { key: k }, detailRow(k, typeof v === 'string' ? v : JSON.stringify(v)));
                }))
                : h('pre', { style: monoPre }, argsText + (it.argsTruncated ? '\n…（已截断）' : ''))), 
        // 记录字段区
        h('div', { style: { marginTop: '12px', fontSize: '11px', lineHeight: 1.9, display: 'flex', flexDirection: 'column', gap: '2px' } }, h('div', { style: { fontSize: '11px', fontWeight: 600, opacity: 0.7, marginBottom: '4px' } }, '记录字段'), detailRow('工具 / 动作', (it.tool || '-') + (it.action ? '.' + it.action : '')), detailRow('风险', it.risk === 'destructive' ? '⚠️ 高危（不可逆或影响远端状态）' : it.risk === 'write' ? '写操作' : it.risk || '-'), it.feedback ? detailRow('用户留言', it.feedback) : null, detailRow('工作区', it.cwd), detailRow('会话', it.sessionId), detailRow('调用 ID', it.callId || it.id), detailRow('记录 ID', it.id), detailRow('时间', typeof it.at === 'number' ? new Date(it.at).toLocaleString() : ''), it.errorType ? detailRow('错误码', it.errorType) : null)));
    };
    return h('div', { className: 'dsh-github-modal-overlay', onClick: props.onClose, style: { zIndex: 100000 } }, h('div', {
        className: 'dsh-github-modal-dialog',
        style: {
            width: '94%',
            maxWidth: '920px',
            maxHeight: '86vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        },
        onClick: function (e) { e.stopPropagation(); },
    }, 
    // 标题栏
    h('div', { className: 'dsh-github-modal-header', style: { flexShrink: 0, alignItems: 'flex-start' } }, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 } }, h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', { style: { fontSize: '15px' } }, '🕘'), h('h3', { style: { margin: 0, fontSize: '14px', fontWeight: 600 } }, '操作记录'), h('span', {
        style: {
            fontSize: '10px',
            padding: '1px 7px',
            borderRadius: '999px',
            border: '1px solid var(--dsw-alias-border-l2, #d1d9e0)',
            color: 'var(--dsw-alias-label-secondary, #656d76)',
            whiteSpace: 'nowrap',
        },
        title: scope === 'workspace'
            ? scopedCwd
                ? '只显示当前工作区的记录：' + scopedCwd
                : '未识别到当前工作区路径，已退化为全局视图'
            : '显示本机全部工作区的记录',
    }, scope === 'workspace' ? (scopedCwd ? '🏠 当前工作区' : '🏠 工作区未识别') : '🌐 全局'), h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #656d76)' } }, total > 0 ? '共 ' + total + ' 条' : '')), h('div', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #656d76)', lineHeight: 1.5 } }, '记录 Agent 通过本插件对 Issue / PR（以及其余 GitHub 工具）的每一次调用：谁、在哪个仓库、做了什么、成没成。')), h('button', {
        style: {
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: 'var(--dsw-alias-label-secondary, #656d76)',
            padding: '0 4px',
        },
        onClick: props.onClose,
        title: '关闭 (Esc)',
    }, '✕')), 
    // 筛选行：两个 chip + 工具下拉 + 刷新**同一行**（下拉给固定宽度，否则
    // `.dsh-github-select` 的 width:100% 会把它挤到自己一行，刷新再掉到第三行）
    h('div', {
        style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            padding: '10px 16px',
            borderBottom: '1px solid var(--dsw-alias-border-l2, #eaeef2)',
            flexShrink: 0,
        },
    }, filterChip('仅高危', onlyDestructive, function () { setOnlyDestructive(!onlyDestructive); }), h('select', {
        className: 'dsh-github-select',
        value: toolFilter,
        onChange: function (e) { setToolFilter(e.target.value); },
        style: {
            fontSize: '11px',
            padding: '3px 6px',
            borderRadius: '4px',
            width: 'auto',
            minWidth: '96px',
            maxWidth: '150px',
            flex: '0 0 auto',
        },
        title: '按工具筛选（PR / Issue 在最前）',
        'aria-label': '按工具筛选',
    }, h('option', { value: '' }, '全部工具'), toolOptions.map(function (t) { return h('option', { key: t.value, value: t.value }, t.label); })), h('div', { style: { flex: 1 } }), h('button', {
        className: 'dsh-github-btn-sm',
        onClick: load,
        disabled: loading || busy,
        style: { padding: '3px 10px', fontSize: '11px', flex: '0 0 auto' },
    }, loading ? '加载中…' : '🔄 刷新')), 
    // 正文
    h('div', {
        className: 'dsh-github-modal-body',
        style: { padding: '8px 12px 14px', overflowY: 'auto', flex: 1, minHeight: 0, boxSizing: 'border-box' },
    }, degraded
        ? h('div', {
            className: 'dsh-github-guide-card warning',
            style: { marginBottom: '10px' },
        }, h('div', { className: 'dsh-github-guide-header' }, '⚠️ 记录功能已禁用'), h('div', { className: 'dsh-github-guide-desc' }, degraded))
        : null, 
    // 设置面板与开关**不在这里**——它们属于「设置」窗口的独立分区
    // （`sync-settings-modal.ts` 的「🕘 操作记录与审核」）。本窗口只负责
    // 查看与删除记录，两个窗口各管一件事，避免"同一个开关出现在两个地方"。
    // 关闭态：列表没有意义（没加载），只给"清空"与"去哪儿开启"的指引。
    // 判据用 `recordEnabled`（用户关的）而不是 `recordActive`：降级时上面已经有
    // 「记录功能已禁用」提示，再来一张「已关闭」会让人以为是两个问题。
    !recordEnabled
        ? h('div', { className: 'dsh-github-guide-card warning', style: { marginBottom: '10px' } }, h('div', { className: 'dsh-github-guide-header' }, '🕘 操作记录已关闭'), h('div', { className: 'dsh-github-guide-desc' }, '关闭后不再写入新记录、启动也不再加载历史。已有历史文件仍保留在本地，可点「清空历史记录」删除。'), h('div', { className: 'dsh-github-guide-desc', style: { marginTop: '4px' } }, '要重新开启：设置 → 🕘 操作记录与审核 → 勾选「启用操作记录」。'), h('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } }, h('button', {
            className: 'dsh-github-btn-sm' + (armed === 'clear' ? ' active' : ''),
            onClick: handleClear,
            disabled: busy,
            style: {
                color: '#cf222e',
                ...(armed === 'clear' ? { fontWeight: 600 } : {}),
            },
        }, 
        // 两段式确认的第二次点击要给出与首次不同的文案，否则用户不知道
        // 这一下就是真删了（共享 handleClear 的 armed 状态，但措辞按此处语境）
        armed === 'clear' ? '确认清空历史记录？' : '清空历史记录')))
        : null, 
    // 从右栏打开但拿不到工作区路径：如实说明"已退化为全局"，而不是静默显示全部
    // ——否则用户会把别的仓库的记录当成自己的，这比空列表更误导。
    recordActive && scope === 'workspace' && !scopedCwd
        ? h('div', { className: 'dsh-github-guide-card warning', style: { marginBottom: '10px' } }, h('div', { className: 'dsh-github-guide-header' }, '⚠️ 未识别到当前工作区'), h('div', { className: 'dsh-github-guide-desc' }, '当前会话还没有绑定物理仓库路径，因此下面显示的是**全局**记录。切换到已关联仓库的工作区后再打开，即可只看该工作区。'))
        : null, error
        ? h('div', { className: 'dsh-github-empty', style: { color: '#cf222e' } }, error)
        : null, recordActive && items.length === 0 && !loading && !error
        ? h('div', { className: 'dsh-github-empty' }, onlyDestructive || toolFilter
            ? '当前筛选条件下没有记录'
            : scope === 'workspace' && scopedCwd
                ? '这个工作区还没有记录。Agent 在本工作区调用 GitHub 工具后，这里会出现一条。'
                : '还没有记录。Agent 每次调用 GitHub 工具后，这里会出现一条。')
        : null, 
    /*
     * 真表格：`<table>` 的列宽由浏览器在**同一张表**内统一分配，
     * 表头与数据行不可能错位——这正是不用两套 grid 的原因。
     * thead 用 sticky 钉在滚动容器顶部，长列表翻页时列名不会滚走。
     */
    recordActive && items.length > 0
        ? h('table', {
            style: {
                width: '100%',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                fontSize: '12px',
            },
        }, h('thead', null, h('tr', {
            style: {
                position: 'sticky',
                top: 0,
                zIndex: 2,
                background: 'var(--dsw-alias-bg-base, #ffffff)',
            },
        }, h('th', { style: thStyle(28) }, h('input', {
            type: 'checkbox',
            checked: allSelected,
            onChange: toggleAll,
            title: allSelected ? '取消全选' : '全选本页',
            'aria-label': '全选本页',
            style: { cursor: 'pointer' },
        })), h('th', { style: thStyle(80) }, '时间'), 
        // 操作列不设宽度：tableLayout:fixed 下它会吃掉剩余空间
        h('th', { style: thStyle(undefined) }, '操作'), h('th', { style: thStyle(58) }, '审核'), h('th', { style: thStyle(70) }, '结果'), h('th', { style: thStyle(54, 'right') }, ''))), h('tbody', null, items.map(renderRow)))
        : null), 
    // 底栏
    h('div', {
        className: 'dsh-github-modal-footer',
        style: {
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderTop: '1px solid var(--dsw-alias-border-l2, #eaeef2)',
        },
    }, h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #656d76)' } }, !recordEnabled
        ? '记录已关闭'
        : !recordActive
            ? '记录不可用（存储降级）'
            : selected.length > 0
                ? '已选 ' + selected.length + ' 条（含其他页勾选）'
                : usage
                    ? '已用 ' + mbText(usage.bytes) + ' / ' + mbText(usage.maxBytes) + ' · 共 ' + total + ' 条'
                    : ''), h('div', { style: { flex: 1 } }), 
    // 分页：每页条数可选，翻页走服务端 offset（不在前端切数组——数据可能被别的窗口删过）
    recordActive && total > 0
        ? h('span', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' } }, h('span', { style: { opacity: 0.75 } }, '每页'), h('select', {
            className: 'dsh-github-select',
            value: String(pageSize),
            onChange: function (e) { changePageSize(Number(e.target.value)); },
            disabled: loading || busy,
            title: '每页显示条数',
            'aria-label': '每页显示条数',
            style: { fontSize: '11px', padding: '2px 4px', width: 'auto', borderRadius: '4px' },
        }, PAGE_SIZE_OPTIONS.map(function (n) {
            return h('option', { key: n, value: String(n) }, String(n));
        })), h('button', {
            className: 'dsh-github-btn-sm',
            onClick: function () { setArmed(null); setPage(Math.max(0, page - 1)); },
            disabled: page <= 0 || loading,
            style: { padding: '2px 8px', fontSize: '11px' },
            title: '上一页',
        }, '‹ 上一页'), h('span', { style: { opacity: 0.8 } }, pageCount > 0 ? `${Math.min(page, pageCount - 1) + 1} / ${pageCount}` : '0 / 0'), h('button', {
            className: 'dsh-github-btn-sm',
            onClick: function () { setArmed(null); setPage(page + 1); },
            disabled: page + 1 >= pageCount || loading,
            style: { padding: '2px 8px', fontSize: '11px' },
            title: '下一页',
        }, '下一页 ›'))
        : null, h('button', {
        className: 'dsh-github-btn-sm' + (armed === 'delete' ? ' active' : ''),
        onClick: handleDelete,
        disabled: !recordActive || selected.length === 0 || busy,
        style: {
            padding: '4px 10px',
            fontSize: '11px',
            ...(armed === 'delete' ? { color: '#cf222e', fontWeight: 600 } : {}),
        },
        title: '删除勾选的记录（可跨页勾选，一次删完）',
    }, armed === 'delete' ? '确认删除 ' + selected.length + ' 条？' : '🗑 删除选中'), h('button', {
        className: 'dsh-github-btn-sm' + (armed === 'clear' ? ' active' : ''),
        onClick: handleClear,
        disabled: busy,
        style: {
            padding: '4px 10px',
            fontSize: '11px',
            color: '#cf222e',
            ...(armed === 'clear' ? { fontWeight: 600 } : {}),
        },
    }, armed === 'clear' ? '确认清空全部？' : '清空全部')), 
    // 二级详情弹窗：叠在操作记录窗口之上
    renderDetailPopup()));
}
