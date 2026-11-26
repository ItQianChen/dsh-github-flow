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
const PAGE_SIZE = 10;
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
    /** 当前页（0 基）；每页 10 条，翻页由服务端 offset 承担（不在前端切） */
    var [page, setPage] = React.useState(0);
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
            limit: String(PAGE_SIZE),
            offset: String(page * PAGE_SIZE),
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
            if (page > 0 && totalNow <= page * PAGE_SIZE) {
                setPage(Math.max(0, Math.ceil(totalNow / PAGE_SIZE) - 1));
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
     * 字节 → MB 的展示。**只有展示用**：记账与预算判断一律在服务端按字节做
     * （中文 3 字节/字，前端按字符数算会少算 3 倍）。
     */
    var mbText = function (bytes) {
        var mb = (Number(bytes) || 0) / 1048576;
        return (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)) + ' MB';
    };
    // 翻页 / 换筛选都要重新拉数据；翻页时不重置筛选条件
    React.useEffect(function () {
        if (props.isOpen)
            load();
    }, [props.isOpen, props.scope, props.cwd, onlyDestructive, toolFilter, page]);
    React.useEffect(function () {
        var onKeyDown = function (e) {
            if (e.key === 'Escape' || e.keyCode === 27)
                props.onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return function () { window.removeEventListener('keydown', onKeyDown); };
    }, [props.onClose]);
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
    var pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
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
    var renderRow = function (it) {
        var checked = selected.indexOf(it.id) >= 0;
        var resultText = it.result === 'fail' ? '❌ 失败' : it.result === 'unknown' ? '⏳ 未记录结果' : '✅ 成功';
        var resultColor = it.result === 'fail' ? '#cf222e' : it.result === 'unknown' ? '#9a6700' : '#1a7f37';
        return h('div', {
            key: it.id,
            style: {
                display: 'grid',
                gridTemplateColumns: '20px 96px 1fr 74px 88px',
                gap: '8px',
                alignItems: 'start',
                padding: '7px 8px',
                borderRadius: '6px',
                borderBottom: '1px solid var(--dsw-alias-border-l2, #eaeef2)',
                fontSize: '12px',
                background: checked ? 'var(--dsw-alias-bg-module-platform, #f6f8fa)' : 'transparent',
            },
        }, h('input', {
            type: 'checkbox',
            checked: checked,
            onChange: function () { toggle(it.id); },
            style: { marginTop: '2px', cursor: 'pointer' },
            'aria-label': '选择该记录',
        }), h('div', { style: { color: 'var(--dsw-alias-label-secondary, #656d76)', whiteSpace: 'nowrap' } }, fmtRelative(it.at)), h('div', { style: { minWidth: 0 } }, h('div', {
            style: {
                color: RISK_COLOR[it.risk] || 'inherit',
                fontWeight: it.risk === 'destructive' ? 600 : 400,
                wordBreak: 'break-word',
            },
            title: (it.tool || '') + '.' + (it.action || ''),
        }, it.summary || ((it.tool || '') + '.' + (it.action || ''))), it.repo
            ? h('div', { style: { fontSize: '10px', opacity: 0.7, marginTop: '1px' } }, it.repo)
            : null, it.feedback
            ? h('div', { style: { fontSize: '10px', color: '#cf222e', marginTop: '2px' } }, '留言：' + it.feedback)
            : null), h('div', { style: { whiteSpace: 'nowrap' } }, DECISION_LABEL[it.decision] || it.decision || '自动'), h('div', { style: { color: resultColor, whiteSpace: 'nowrap' }, title: it.errorType || '' }, resultText + (it.degraded ? ' · 降级' : '')));
    };
    var filterChip = function (label, active, onClick) {
        return h('button', {
            className: 'dsh-github-btn-sm' + (active ? ' active' : ''),
            onClick: onClick,
            style: { padding: '3px 8px', fontSize: '11px' },
            'aria-pressed': active ? 'true' : 'false',
        }, label);
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
        : null, recordActive && items.length > 0
        ? h('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: '20px 96px 1fr 74px 88px',
                gap: '8px',
                padding: '4px 8px 6px',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--dsw-alias-label-secondary, #656d76)',
                borderBottom: '1px solid var(--dsw-alias-border-l2, #eaeef2)',
            },
        }, h('input', {
            type: 'checkbox',
            checked: allSelected,
            onChange: toggleAll,
            title: allSelected ? '取消全选' : '全选本页',
            'aria-label': '全选本页',
            style: { cursor: 'pointer' },
        }), h('div', null, '时间'), h('div', null, '操作'), h('div', null, '审核'), h('div', null, '结果'))
        : null, recordActive ? items.map(renderRow) : null), 
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
    // 分页：每页 10 条，翻页走服务端 offset（不在前端切数组——数据可能被别的窗口删过）
    recordActive && total > 0
        ? h('span', { style: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' } }, h('button', {
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
    }, armed === 'clear' ? '确认清空全部？' : '清空全部'))));
}
