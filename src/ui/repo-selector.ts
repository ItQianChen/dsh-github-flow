declare const React: any;

export interface RepoSelectorProps {
  associatedRepos?: any[];
  currentRepo?: string;
  cwd: string | null;
  onRepoSwitched?: (repo: string) => void;
  showToast?: (msg: string) => void;
}

/**
 * 关联仓库（上游源仓库 ↔ 个人复刻 Fork）切换下拉组件。
 *
 * 为什么单仓库时返回 null：单仓库场景没有切换意义，保持现有卡片外观 100% 纯净零噪音；
 * 仅在检测到当前工作区存在双 remote 或 Fork 关联拓扑时激活。
 */
export function RepoSelectorDropdown(props: RepoSelectorProps) {
  var associatedRepos = Array.isArray(props.associatedRepos) ? props.associatedRepos : [];
  var currentRepo = (props.currentRepo || '').toLowerCase();
  var cwd = props.cwd;
  var onRepoSwitched = props.onRepoSwitched || (() => {});
  var showToast = props.showToast || (() => {});

  // 严格遵守 React Hooks 铁律：所有 useState / useRef / useEffect 必须无条件在顶层执行，
  // 严禁在任何条件分支/early return 之后调用 Hooks，杜绝触发
  // "Rendered fewer hooks than expected" 的致命运行时崩溃。
  var [isOpen, setIsOpen] = React.useState(false);
  var [switching, setSwitching] = React.useState(false);
  var containerRef = React.useRef(null as any);

  React.useEffect(() => {
    if (!isOpen) return;
    var handleClickOutside = (e: any) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Hooks 执行完毕后再进行单仓库零噪音短路返回
  if (associatedRepos.length <= 1) {
    return null;
  }

  var toggleOpen = (e: any) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  var handleSwitch = async (targetRepo: string, targetRemote?: string) => {
    if (switching) return;
    setSwitching(true);
    try {
      var res = await fetch('/api/github/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_default_repo',
          cwd,
          repo: targetRepo,
          remote: targetRemote,
        }),
      });

      var json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        showToast(`❌ 切换基准仓库失败：${json.error || json.message || res.statusText}`);
        return;
      }

      setIsOpen(false);
      showToast(`✅ 已将基准仓库切换为 ${targetRepo}`);
      onRepoSwitched(targetRepo);
    } catch (err: any) {
      showToast(`❌ 切换请求异常：${err?.message || err}`);
    } finally {
      setSwitching(false);
    }
  };

  var roleLabel = (role: string) => {
    switch (role) {
      case 'fork': return '我的复刻';
      case 'upstream': return '上游源仓库';
      case 'parent': return '上游主干';
      case 'origin': return 'origin';
      default: return '远程关联';
    }
  };

  var roleBadgeTone = (role: string) => {
    switch (role) {
      case 'fork': return 'dsh-badge-purple';
      case 'upstream':
      case 'parent': return 'dsh-badge-readonly';
      default: return 'dsh-badge-blue';
    }
  };

  var h = React.createElement;

  return h(
    'div',
    {
      ref: containerRef,
      style: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
      className: 'dsh-github-repo-selector-container',
    },
    h(
      'button',
      {
        type: 'button',
        className: 'dsh-github-repo-switch-trigger',
        onClick: toggleOpen,
        title: `当前关联 ${associatedRepos.length} 个远程仓库（点击切换基准）`,
        disabled: switching,
      },
      h('span', null, switching ? '⏳' : '⇄'),
      h('span', { style: { fontSize: '11px', fontWeight: 500 } }, '切换仓库'),
      h('span', { style: { fontSize: '9px', opacity: 0.7 } }, '▾')
    ),
    isOpen
      ? h(
          'div',
          { className: 'dsh-github-repo-dropdown' },
          h(
            'div',
            { className: 'dsh-github-repo-dropdown-header' },
            h('span', null, '选择当前工作区基准仓库'),
            h('span', { style: { fontSize: '11px', opacity: 0.6 } }, `${associatedRepos.length} 可用`)
          ),
          h(
            'div',
            { className: 'dsh-github-repo-dropdown-list' },
            associatedRepos.map(function (item: any) {
              var isSelected = item.isCurrent || item.nameWithOwner.toLowerCase() === currentRepo;
              return h(
                'div',
                {
                  key: item.nameWithOwner,
                  className: 'dsh-github-repo-item' + (isSelected ? ' selected' : ''),
                  title: isSelected ? '当前正在使用的基准仓库' : `点击切换基准为 ${item.nameWithOwner}`,
                  onClick: function () {
                    if (!isSelected && !switching) {
                      handleSwitch(item.nameWithOwner, item.remoteName);
                    }
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
                  h(
                    'div',
                    { style: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 } },
                    h('span', { style: { color: isSelected ? 'var(--dsw-alias-link, #0969da)' : 'inherit', fontWeight: isSelected ? 600 : 400 } }, item.nameWithOwner),
                    h('span', { className: 'dsh-github-badge ' + roleBadgeTone(item.role), style: { fontSize: '10px', padding: '0 5px' } }, roleLabel(item.role))
                  ),
                  isSelected ? h('span', { style: { color: 'var(--dsw-alias-state-success, #1a7f37)', fontWeight: 600 } }, '✓') : null
                )
              );
            })
          ),
          h(
            'div',
            { className: 'dsh-github-repo-dropdown-footer' },
            '💡 切换后系统将自动调用 gh repo set-default 对齐终端与面板'
          )
        )
      : null
  );
}
