export function createGithubPanelComponent() {
    return function GithubWorkspacePanel() {
        const [loading, setLoading] = React.useState(true);
        const [data, setData] = React.useState(null);
        const [error, setError] = React.useState(null);
        const loadData = React.useCallback(async (forceRefresh = false) => {
            setLoading(true);
            setError(null);
            try {
                if (forceRefresh) {
                    await fetch('/api/github/refresh', { method: 'POST' }).catch(() => { });
                }
                const res = await fetch('/api/github/overview');
                const json = await res.json();
                if (json.ok && json.data) {
                    setData(json.data);
                }
                else {
                    setError(json.error || json.message || '获取 GitHub 概览失败');
                }
            }
            catch (err) {
                setError(err.message || '网络连接异常');
            }
            finally {
                setLoading(false);
            }
        }, []);
        React.useEffect(() => {
            loadData(false);
            // 60秒自动温和轮询
            const timer = setInterval(() => loadData(false), 60_000);
            return () => clearInterval(timer);
        }, [loadData]);
        const h = React.createElement;
        // 头部区域
        const headerEl = h('div', { className: 'dsh-github-header' }, h('div', { className: 'dsh-github-title' }, h('svg', { viewBox: '0 0 16 16', width: 22, height: 22, fill: 'currentColor' }, h('path', {
            d: 'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z',
        })), h('h2', null, 'GitHub 工作台')), h('button', {
            className: 'dsh-github-refresh-btn',
            onClick: () => loadData(true),
            disabled: loading,
        }, loading ? '刷新中...' : '🔄 刷新状态'));
        if (loading && !data) {
            return h('div', { className: 'dsh-github-panel' }, headerEl, h('div', { className: 'dsh-github-empty' }, '正在连接 GitHub CLI 并获取仓库状态...'));
        }
        if (error && !data) {
            return h('div', { className: 'dsh-github-panel' }, headerEl, h('div', { className: 'dsh-github-empty', style: { borderColor: '#f85149', color: '#f85149' } }, `⚠️ ${error}`));
        }
        const auth = data?.auth;
        const repo = data?.repo;
        const prs = data?.pullRequests || [];
        const issues = data?.issues || [];
        const runs = data?.runs || [];
        // 概览卡片区
        const cardsEl = h('div', { className: 'dsh-github-overview-cards' }, h('div', { className: 'dsh-github-card' }, h('div', { className: 'dsh-github-card-title' }, '认证账号'), h('div', { className: 'dsh-github-card-value' }, auth?.loggedIn ? `👤 ${auth.user || '已登录'}` : '❌ 未登录', auth?.loggedIn ? h('span', { className: 'dsh-github-badge dsh-badge-green' }, 'Active') : null)), h('div', { className: 'dsh-github-card' }, h('div', { className: 'dsh-github-card-title' }, '当前关联仓库'), h('div', { className: 'dsh-github-card-value' }, repo
            ? h('a', { href: repo.url, target: '_blank', style: { color: 'inherit', textDecoration: 'none' } }, repo.nameWithOwner)
            : '未关联 GitHub 仓库')), h('div', { className: 'dsh-github-card' }, h('div', { className: 'dsh-github-card-title' }, '待审 PR / 活跃任务'), h('div', { className: 'dsh-github-card-value' }, `${prs.length} PRs · ${issues.length} Issues`)));
        // Pull Requests 区域
        const prsSectionEl = h('div', { className: 'dsh-github-section' }, h('div', { className: 'dsh-github-section-header' }, h('h3', null, `🔀 Pull Requests (${prs.length})`)), prs.length === 0
            ? h('div', { className: 'dsh-github-empty' }, '当前无开放的 Pull Request')
            : h('div', { className: 'dsh-github-list' }, prs.map((pr) => h('div', { key: pr.number, className: 'dsh-github-item' }, h('div', { className: 'dsh-github-item-main' }, h('a', { className: 'dsh-github-item-title', href: pr.url, target: '_blank' }, `#${pr.number} ${pr.title}`), h('div', { className: 'dsh-github-item-meta' }, h('span', null, `由 ${pr.author?.login || '未知'} 提交`), h('span', null, `${pr.headRefName} → ${pr.baseRefName}`), pr.mergeable === 'CONFLICTING'
                ? h('span', { className: 'dsh-github-badge dsh-badge-red' }, '冲突 Conflicting')
                : h('span', { className: 'dsh-github-badge dsh-badge-green' }, '可合并 Mergeable'))), h('div', { className: 'dsh-github-item-actions' }, h('a', { className: 'dsh-github-btn-sm', href: pr.url, target: '_blank', style: { textDecoration: 'none' } }, '在 GitHub 打开'))))));
        // GitHub Actions 区域
        const runsSectionEl = h('div', { className: 'dsh-github-section' }, h('div', { className: 'dsh-github-section-header' }, h('h3', null, `⚡ GitHub Actions 最近流水线 (${runs.length})`)), runs.length === 0
            ? h('div', { className: 'dsh-github-empty' }, '暂无工作流运行记录')
            : h('div', { className: 'dsh-github-list' }, runs.map((r) => h('div', { key: r.databaseId, className: 'dsh-github-item' }, h('div', { className: 'dsh-github-item-main' }, h('a', { className: 'dsh-github-item-title', href: r.url, target: '_blank' }, r.name), h('div', { className: 'dsh-github-item-meta' }, h('span', null, `分支: ${r.headBranch}`), h('span', null, `触发事件: ${r.event}`), r.conclusion === 'success'
                ? h('span', { className: 'dsh-github-badge dsh-badge-green' }, '成功 Success')
                : r.conclusion === 'failure'
                    ? h('span', { className: 'dsh-github-badge dsh-badge-red' }, '失败 Failure')
                    : h('span', { className: 'dsh-github-badge dsh-badge-yellow' }, r.status || '进行中'))), h('div', { className: 'dsh-github-item-actions' }, h('a', { className: 'dsh-github-btn-sm', href: r.url, target: '_blank', style: { textDecoration: 'none' } }, '查看流水线'))))));
        return h('div', { className: 'dsh-github-panel' }, headerEl, cardsEl, prsSectionEl, runsSectionEl);
    };
}
