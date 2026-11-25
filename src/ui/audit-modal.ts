declare const React: any;

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

const PAGE_SIZE = 50;

const DECISION_LABEL: Record<string, string> = {
  auto: '自动',
  confirmed: '确认',
  approved: '已批准',
  rejected: '已拒绝',
  expired: '已超时',
  'no-client': '未审核',
  cancelled: '已取消',
};

const RISK_COLOR: Record<string, string> = {
  read: 'var(--dsw-alias-label-secondary, #656d76)',
  write: '#9a6700',
  destructive: '#cf222e',
};

function apiUrl(path: string, params: Record<string, string>): string {
  var qs = Object.keys(params)
    .filter(function (k) { return params[k] !== ''; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
    .join('&');
  return '/api/github' + path + (qs ? '?' + qs : '');
}

export function AuditModal(props: {
  isOpen: boolean;
  onClose: () => void;
  /**
   * 作用域：
   * - `global`（默认）：全景驾驶舱入口，展示本机**全部**工作区的记录；
   * - `workspace`：右栏工作区入口，只展示**当前工作区**（按 cwd 精确匹配）的记录。
   *
   * 为什么由入口决定而不是在弹窗里自己判断：同一个弹窗组件两种语义，
   * 判定依据只能是"从哪儿打开的"；让组件去猜 cwd 属于哪个作用域只会出现
   * "驾驶舱里也只剩一个仓库的记录"这种自相矛盾的状态。
   */
  scope?: 'global' | 'workspace';
  cwd?: string | null;
}) {
  if (!props.isOpen) return null;

  var scope = props.scope === 'workspace' ? 'workspace' : 'global';
  var scopedCwd = scope === 'workspace' ? (props.cwd || '') : '';

  var h = React.createElement;
  var [items, setItems] = React.useState([] as any[]);
  var [total, setTotal] = React.useState(0);
  var [loading, setLoading] = React.useState(false);
  var [busy, setBusy] = React.useState(false);
  var [error, setError] = React.useState(null as string | null);
  var [degraded, setDegraded] = React.useState(null as string | null);
  var [onlyWrite, setOnlyWrite] = React.useState(false);
  var [onlyDestructive, setOnlyDestructive] = React.useState(false);
  var [toolFilter, setToolFilter] = React.useState('');
  var [selected, setSelected] = React.useState([] as string[]);
  /** 两段式确认：'delete' / 'clear' 时底部按钮进入确认态，再点一次才真正执行 */
  var [armed, setArmed] = React.useState(null as 'delete' | 'clear' | null);
  /** 用量与开关（服务端 `usage`）：`enabled=false` 时列表为空是"关掉了"，不是"没有记录" */
  var [usage, setUsage] = React.useState(null as any);
  /** 设置面板是否展开（开关 + 预算就地改，改完立刻生效、无需重启） */
  var [settingsOpen, setSettingsOpen] = React.useState(false);
  var [budgetDraft, setBudgetDraft] = React.useState(8);
  var [savingSettings, setSavingSettings] = React.useState(false);

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
  var relTime = function (ms: any): string {
    if (typeof ms !== 'number' || !isFinite(ms)) return '';
    try { return fmtRelative(new Date(ms).toISOString()); } catch { return ''; }
  };

  var load = function () {
    setLoading(true);
    setError(null);
    var url = apiUrl('/audit/records', {
      limit: String(PAGE_SIZE),
      write: onlyWrite ? '1' : '',
      risk: onlyDestructive ? 'destructive' : '',
      tool: toolFilter,
      cwd: scopedCwd,
    });
    fetch(url)
      // 先看 HTTP 状态再解析：路由不存在时 webServer 返回的是 HTML（或空体），
      // 只写 `r.json()` 会得到"无法解析的内容"这种对用户毫无指引的报错。
      .then(function (r: any) {
        return r
          .json()
          .then(function (j: any) { return { status: r.status, j: j }; })
          .catch(function () { return { status: r.status, j: null }; });
      })
      .then(function (res: any) {
        setLoading(false);
        if (!res.j) {
          setError(
            res.status === 404
              ? '后端还没有这个接口（HTTP 404）。插件刚升级时需要**重启 DSH 桌面端**载入新后端，重启后再刷新本页。'
              : '服务端返回了无法解析的内容（HTTP ' + res.status + '）。请重启 DSH 桌面端后重试。'
          );
          return;
        }
        var j = res.j;
        if (!j.ok) { setError(j.message || '读取操作记录失败'); return; }
        setItems(Array.isArray(j.data && j.data.items) ? j.data.items : []);
        setTotal(Number(j.data && j.data.total) || 0);
        setDegraded(j.data && j.data.degraded ? String(j.data.degraded) : null);
        if (j.data && j.data.usage) {
          setUsage(j.data.usage);
          setBudgetDraft(Math.max(1, Math.round((Number(j.data.usage.maxBytes) || 0) / 1048576)));
        }
        setSelected([]);
        setArmed(null);
      })
      .catch(function (err: any) {
        setLoading(false);
        setError('网络请求异常：' + ((err && err.message) || '未知错误'));
      });
  };

  /** 保存开关/预算：热生效（服务端立即改运行时 + 落 audit-settings.json） */
  var saveSettings = function (patch: any) {
    if (savingSettings) return;
    setSavingSettings(true);
    fetch('/api/github/audit/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch || {}),
    })
      .then(function (r: any) { return r.json().catch(function () { return null; }); })
      .then(function (j: any) {
        setSavingSettings(false);
        if (!j || !j.ok) { setError((j && j.message) || '保存设置失败'); return; }
        if (j.data && j.data.usage) setUsage(j.data.usage);
        setError(null);
        load();
      })
      .catch(function (err: any) {
        setSavingSettings(false);
        setError('网络请求异常：' + ((err && err.message) || '未知错误'));
      });
  };

  var mbText = function (bytes: any) {
    var mb = (Number(bytes) || 0) / 1048576;
    return (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)) + ' MB';
  };

  React.useEffect(function () {
    if (props.isOpen) load();
  }, [props.isOpen, props.scope, props.cwd, onlyWrite, onlyDestructive, toolFilter]);

  React.useEffect(function () {
    var onKeyDown = function (e: any) {
      if (e.key === 'Escape' || e.keyCode === 27) props.onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return function () { window.removeEventListener('keydown', onKeyDown); };
  }, [props.onClose]);

  var post = function (path: string, body: any, after: () => void) {
    setBusy(true);
    fetch('/api/github' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
      .then(function (r: any) { return r.json().catch(function () { return null; }); })
      .then(function (j: any) {
        setBusy(false);
        if (!j || !j.ok) { setError((j && j.message) || '操作失败'); return; }
        after();
        load();
      })
      .catch(function (err: any) {
        setBusy(false);
        setError('网络请求异常：' + ((err && err.message) || '未知错误'));
      });
  };

  var toggle = function (id: string) {
    setArmed(null);
    setSelected(function (prev: string[]) {
      return prev.indexOf(id) >= 0 ? prev.filter(function (x) { return x !== id; }) : prev.concat([id]);
    });
  };

  var allSelected = items.length > 0 && selected.length === items.length;
  var toggleAll = function () {
    setArmed(null);
    setSelected(allSelected ? [] : items.map(function (it: any) { return it.id; }));
  };

  var handleDelete = function () {
    if (selected.length === 0 || busy) return;
    if (armed !== 'delete') { setArmed('delete'); return; }
    setArmed(null);
    post('/audit/records/delete', { ids: selected }, function () { setSelected([]); });
  };

  var handleClear = function () {
    if (busy) return;
    if (armed !== 'clear') { setArmed('clear'); return; }
    setArmed(null);
    post('/audit/records/clear', {}, function () { setSelected([]); });
  };

  // 工具下拉的候选来自当前页：不做全量扫描（数据量小，够用且零额外请求）。
  // 必须把**当前筛选项**也并进去：否则筛到只剩某工具、而该页刚好没有它时，
  // select 的 value 不在 options 里，界面会显示成空白。
  var toolOptions: string[] = toolFilter ? [toolFilter] : [];
  items.forEach(function (it: any) {
    if (it && typeof it.tool === 'string' && toolOptions.indexOf(it.tool) < 0) toolOptions.push(it.tool);
  });
  toolOptions.sort();

  var renderRow = function (it: any) {
    var checked = selected.indexOf(it.id) >= 0;
    var resultText = it.result === 'fail' ? '❌ 失败' : it.result === 'unknown' ? '⏳ 未记录结果' : '✅ 成功';
    var resultColor = it.result === 'fail' ? '#cf222e' : it.result === 'unknown' ? '#9a6700' : '#1a7f37';
    return h(
      'div',
      {
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
      },
      h('input', {
        type: 'checkbox',
        checked: checked,
        onChange: function () { toggle(it.id); },
        style: { marginTop: '2px', cursor: 'pointer' },
        'aria-label': '选择该记录',
      }),
      h(
        'div',
        { style: { color: 'var(--dsw-alias-label-secondary, #656d76)', whiteSpace: 'nowrap' } },
        fmtRelative(it.at)
      ),
      h(
        'div',
        { style: { minWidth: 0 } },
        h(
          'div',
          {
            style: {
              color: RISK_COLOR[it.risk] || 'inherit',
              fontWeight: it.risk === 'destructive' ? 600 : 400,
              wordBreak: 'break-word',
            },
            title: (it.tool || '') + '.' + (it.action || ''),
          },
          it.summary || ((it.tool || '') + '.' + (it.action || ''))
        ),
        it.repo
          ? h('div', { style: { fontSize: '10px', opacity: 0.7, marginTop: '1px' } }, it.repo)
          : null,
        it.feedback
          ? h('div', { style: { fontSize: '10px', color: '#cf222e', marginTop: '2px' } }, '留言：' + it.feedback)
          : null
      ),
      h(
        'div',
        { style: { whiteSpace: 'nowrap' } },
        DECISION_LABEL[it.decision] || it.decision || '自动'
      ),
      h(
        'div',
        { style: { color: resultColor, whiteSpace: 'nowrap' }, title: it.errorType || '' },
        resultText + (it.degraded ? ' · 降级' : '')
      )
    );
  };

  var filterChip = function (label: string, active: boolean, onClick: () => void) {
    return h(
      'button',
      {
        className: 'dsh-github-btn-sm' + (active ? ' active' : ''),
        onClick: onClick,
        style: { padding: '3px 8px', fontSize: '11px' },
        'aria-pressed': active ? 'true' : 'false',
      },
      label
    );
  };

  return h(
    'div',
    { className: 'dsh-github-modal-overlay', onClick: props.onClose, style: { zIndex: 100000 } },
    h(
      'div',
      {
        className: 'dsh-github-modal-dialog',
        style: {
          width: '94%',
          maxWidth: '920px',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
        onClick: function (e: any) { e.stopPropagation(); },
      },
      // 标题栏
      h(
        'div',
        { className: 'dsh-github-modal-header', style: { flexShrink: 0, alignItems: 'flex-start' } },
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            h('span', { style: { fontSize: '15px' } }, '🕘'),
            h('h3', { style: { margin: 0, fontSize: '14px', fontWeight: 600 } }, '操作记录'),
            h(
              'span',
              {
                style: {
                  fontSize: '10px',
                  padding: '1px 7px',
                  borderRadius: '999px',
                  border: '1px solid var(--dsw-alias-border-l2, #d1d9e0)',
                  color: 'var(--dsw-alias-label-secondary, #656d76)',
                  whiteSpace: 'nowrap',
                },
                title:
                  scope === 'workspace'
                    ? scopedCwd
                      ? '只显示当前工作区的记录：' + scopedCwd
                      : '未识别到当前工作区路径，已退化为全局视图'
                    : '显示本机全部工作区的记录',
              },
              scope === 'workspace' ? (scopedCwd ? '🏠 当前工作区' : '🏠 工作区未识别') : '🌐 全局'
            ),
            h(
              'span',
              { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #656d76)' } },
              total > 0 ? '共 ' + total + ' 条' : ''
            )
          ),
          h(
            'div',
            { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #656d76)', lineHeight: 1.5 } },
            '记录 Agent 通过本插件对 Issue / PR（以及其余 GitHub 工具）的每一次调用：谁、在哪个仓库、做了什么、成没成。'
          )
        ),
        h(
          'button',
          {
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
          },
          '✕'
        )
      ),
      // 筛选行
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            padding: '10px 16px',
            borderBottom: '1px solid var(--dsw-alias-border-l2, #eaeef2)',
            flexShrink: 0,
          },
        },
        filterChip('仅写操作', onlyWrite, function () { setOnlyWrite(!onlyWrite); }),
        filterChip('仅高危', onlyDestructive, function () { setOnlyDestructive(!onlyDestructive); }),
        h(
          'select',
          {
            className: 'dsh-github-select',
            value: toolFilter,
            onChange: function (e: any) { setToolFilter(e.target.value); },
            style: { fontSize: '11px', padding: '3px 6px', borderRadius: '4px' },
            'aria-label': '按工具筛选',
          },
          h('option', { value: '' }, '全部工具'),
          toolOptions.map(function (t) { return h('option', { key: t, value: t }, t); })
        ),
        h('div', { style: { flex: 1 } }),
        h(
          'button',
          {
            className: 'dsh-github-btn-sm',
            onClick: load,
            disabled: loading || busy,
            style: { padding: '3px 10px', fontSize: '11px' },
          },
          loading ? '加载中…' : '🔄 刷新'
        )
      ),
      // 正文
      h(
        'div',
        {
          className: 'dsh-github-modal-body',
          style: { padding: '8px 12px 14px', overflowY: 'auto', flex: 1, minHeight: 0, boxSizing: 'border-box' },
        },
        degraded
          ? h(
              'div',
              {
                className: 'dsh-github-guide-card warning',
                style: { marginBottom: '10px' },
              },
              h('div', { className: 'dsh-github-guide-header' }, '⚠️ 记录功能已禁用'),
              h('div', { className: 'dsh-github-guide-desc' }, degraded)
            )
          : null,
        // 设置面板：开关与预算就地改，改完立刻生效（服务端热改 + 落 audit-settings.json）
        settingsOpen
          ? h(
              'div',
              { className: 'dsh-github-guide-card', style: { marginBottom: '10px' } },
              h('div', { className: 'dsh-github-guide-header' }, '⚙️ 操作记录设置'),
              h(
                'label',
                { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', margin: '6px 0' } },
                h('input', {
                  type: 'checkbox',
                  checked: recordEnabled,
                  disabled: savingSettings,
                  onChange: function (e: any) { saveSettings({ enabled: e.target.checked === true }); },
                }),
                '启用操作记录（关闭后不再写盘，启动也不再加载历史）'
              ),
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', flexWrap: 'wrap' } },
                '保留预算：',
                h(
                  'select',
                  {
                    className: 'dsh-github-select',
                    value: String(budgetDraft),
                    disabled: !recordEnabled || savingSettings,
                    onChange: function (e: any) {
                      var mb = Number(e.target.value);
                      setBudgetDraft(mb);
                      saveSettings({ budgetMB: mb });
                    },
                    style: { fontSize: '11px', padding: '2px 6px' },
                    'aria-label': '保留预算',
                  },
                  [1, 2, 4, 8, 16, 32, 64].map(function (mb) {
                    return h('option', { key: mb, value: String(mb) }, mb + ' MB');
                  })
                ),
                h(
                  'span',
                  { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #656d76)' } },
                  usage ? '已用 ' + mbText(usage.bytes) + ' / ' + mbText(usage.maxBytes) : ''
                )
              ),
              h(
                'div',
                { className: 'dsh-github-guide-desc', style: { marginTop: '4px' } },
                '超出预算时自动丢弃最早的记录。审核（若已开启）依赖本开关：关掉记录，审核一并停用。'
              )
            )
          : null,
        // 关闭态：列表没有意义（没加载），只给"开启"与"清空"两个动作。
        // 判据用 `recordEnabled`（用户关的）而不是 `recordActive`：降级时上面已经有
        // 「记录功能已禁用」提示，再来一张「已关闭」会让人以为是两个问题。
        !recordEnabled
          ? h(
              'div',
              { className: 'dsh-github-guide-card warning', style: { marginBottom: '10px' } },
              h('div', { className: 'dsh-github-guide-header' }, '🕘 操作记录已关闭'),
              h(
                'div',
                { className: 'dsh-github-guide-desc' },
                '关闭后不再写入新记录、启动也不再加载历史。已有历史文件仍保留在本地，可点「清空历史记录」删除。'
              ),
              h(
                'div',
                { style: { display: 'flex', gap: '8px', marginTop: '8px' } },
                h(
                  'button',
                  {
                    className: 'dsh-github-primary-btn',
                    onClick: function () { saveSettings({ enabled: true }); },
                    disabled: savingSettings,
                  },
                  '立即开启'
                ),
                h(
                  'button',
                  {
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
                  armed === 'clear' ? '确认清空历史记录？' : '清空历史记录'
                )
              )
            )
          : null,
        // 从右栏打开但拿不到工作区路径：如实说明"已退化为全局"，而不是静默显示全部
        // ——否则用户会把别的仓库的记录当成自己的，这比空列表更误导。
        recordActive && scope === 'workspace' && !scopedCwd
          ? h(
              'div',
              { className: 'dsh-github-guide-card warning', style: { marginBottom: '10px' } },
              h('div', { className: 'dsh-github-guide-header' }, '⚠️ 未识别到当前工作区'),
              h(
                'div',
                { className: 'dsh-github-guide-desc' },
                '当前会话还没有绑定物理仓库路径，因此下面显示的是**全局**记录。切换到已关联仓库的工作区后再打开，即可只看该工作区。'
              )
            )
          : null,
        error
          ? h('div', { className: 'dsh-github-empty', style: { color: '#cf222e' } }, error)
          : null,
        recordActive && items.length === 0 && !loading && !error
          ? h(
              'div',
              { className: 'dsh-github-empty' },
              onlyWrite || onlyDestructive || toolFilter
                ? '当前筛选条件下没有记录'
                : scope === 'workspace' && scopedCwd
                  ? '这个工作区还没有记录。Agent 在本工作区调用 GitHub 工具后，这里会出现一条。'
                  : '还没有记录。Agent 每次调用 GitHub 工具后，这里会出现一条。'
            )
          : null,
        recordActive && items.length > 0
          ? h(
              'div',
              {
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
              },
              h('input', {
                type: 'checkbox',
                checked: allSelected,
                onChange: toggleAll,
                title: allSelected ? '取消全选' : '全选本页',
                'aria-label': '全选本页',
                style: { cursor: 'pointer' },
              }),
              h('div', null, '时间'),
              h('div', null, '操作'),
              h('div', null, '审核'),
              h('div', null, '结果')
            )
          : null,
        recordActive ? items.map(renderRow) : null
      ),
      // 底栏
      h(
        'div',
        {
          className: 'dsh-github-modal-footer',
          style: {
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderTop: '1px solid var(--dsw-alias-border-l2, #eaeef2)',
          },
        },
        h(
          'span',
          { style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #656d76)' } },
          !recordEnabled
            ? '记录已关闭'
            : !recordActive
              ? '记录不可用（存储降级）'
              : selected.length > 0
                ? '已选 ' + selected.length + ' 条'
                : usage
                  ? '已用 ' + mbText(usage.bytes) + ' / ' + mbText(usage.maxBytes) + ' · ' + usage.rows + ' 条'
                  : '最多显示最近 ' + PAGE_SIZE + ' 条'
        ),
        h('div', { style: { flex: 1 } }),
        h(
          'button',
          {
            className: 'dsh-github-btn-sm' + (settingsOpen ? ' active' : ''),
            onClick: function () { setSettingsOpen(!settingsOpen); },
            style: { padding: '4px 10px', fontSize: '11px' },
            title: '开关操作记录、调整保留预算（改完立刻生效，无需重启）',
            'aria-expanded': settingsOpen ? 'true' : 'false',
          },
          '⚙️ 设置'
        ),
        h(
          'button',
          {
            className: 'dsh-github-btn-sm' + (armed === 'delete' ? ' active' : ''),
            onClick: handleDelete,
            disabled: !recordActive || selected.length === 0 || busy,
            style: {
              padding: '4px 10px',
              fontSize: '11px',
              ...(armed === 'delete' ? { color: '#cf222e', fontWeight: 600 } : {}),
            },
          },
          armed === 'delete' ? '确认删除 ' + selected.length + ' 条？' : '🗑 删除选中'
        ),
        h(
          'button',
          {
            className: 'dsh-github-btn-sm' + (armed === 'clear' ? ' active' : ''),
            onClick: handleClear,
            disabled: busy,
            style: {
              padding: '4px 10px',
              fontSize: '11px',
              color: '#cf222e',
              ...(armed === 'clear' ? { fontWeight: 600 } : {}),
            },
          },
          armed === 'clear' ? '确认清空全部？' : '清空全部'
        )
      )
    )
  );
}
