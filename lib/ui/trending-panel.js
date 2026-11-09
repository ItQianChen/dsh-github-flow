/** A stale DSH server may return plain-text "not found" for a missing route. */
async function readTrendingResponse(response, feature) {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('json')) {
        if (response.status === 404)
            throw new Error(`${feature} 接口不存在（HTTP 404）。请重新构建插件并重启 DSH 后端，确认新路由已加载。`);
        throw new Error(`${feature} 请求失败（HTTP ${response.status}），服务端没有返回 JSON。`);
    }
    try {
        return await response.json();
    }
    catch {
        throw new Error(`${feature} 返回的数据格式无效（HTTP ${response.status}）。`);
    }
}
/** Lazy-mounted from the existing GitHub dashboard; never depends on personal GitHub data. */
export function GithubTrendingPanel() {
    const h = React.createElement;
    const [period, setPeriod] = React.useState('daily');
    const [descriptionLocale, setDescriptionLocale] = React.useState('zh');
    const [boards, setBoards] = React.useState({});
    const [busy, setBusy] = React.useState(false);
    const [insights, setInsights] = React.useState({});
    const [agentError, setAgentError] = React.useState('');
    const agentGeneration = React.useRef(0);
    const [error, setError] = React.useState('');
    const [configRevision, setConfigRevision] = React.useState(0);
    const [configured, setConfigured] = React.useState(null);
    const requestRef = React.useRef(null);
    const generationRef = React.useRef(0);
    const load = React.useCallback(async (selected, refresh = false) => {
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        const generation = ++generationRef.current;
        // An Agent task scrapes, translates and summarises before answering, so allow the full server budget.
        const timer = setTimeout(() => controller.abort(), 300_000);
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/github/trending', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
                body: JSON.stringify({ period: selected, refresh }),
            });
            const json = await readTrendingResponse(response, '热点榜单');
            if (!response.ok || !json.ok)
                throw new Error(json.error || '热点榜单加载失败');
            if (generation !== generationRef.current)
                return;
            setBoards((previous) => ({ ...previous, [selected]: json.data }));
        }
        catch (err) {
            if (generation === generationRef.current)
                setError(controller.signal.aborted ? '请求超时，请重试' : err.message || '网络请求失败');
        }
        finally {
            clearTimeout(timer);
            if (generation === generationRef.current)
                setBusy(false);
        }
    }, []);
    React.useEffect(() => {
        const controller = new AbortController();
        const checkConfiguration = () => {
            fetch('/api/github/trending', { signal: controller.signal })
                .then(res => readTrendingResponse(res, 'Firecrawl 配置')).then(json => {
                if (controller.signal.aborted)
                    return;
                if (!json.ok)
                    throw new Error(json.error || '无法读取 Firecrawl 配置状态');
                setConfigured(json.data.configured);
                setConfigRevision((value) => value + 1);
            }).catch(err => { if (!controller.signal.aborted)
                setError(err.message); });
        };
        const onUpdated = () => {
            generationRef.current++;
            requestRef.current?.abort();
            setBoards({});
            setInsights({});
            setAgentError('');
            agentGeneration.current++;
            setError('');
            setBusy(false);
            checkConfiguration();
        };
        checkConfiguration();
        window.addEventListener('dsh-github-firecrawl-updated', onUpdated);
        return () => { window.removeEventListener('dsh-github-firecrawl-updated', onUpdated); controller.abort(); generationRef.current++; requestRef.current?.abort(); };
    }, []);
    React.useEffect(() => {
        if (configured)
            load(period);
        return () => { generationRef.current++; requestRef.current?.abort(); };
    }, [period, configured, configRevision, load]);
    const agentCall = React.useCallback(async (selected, action) => {
        const response = await fetch('/api/github/trending-agent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ period: selected, action }),
        });
        const json = await readTrendingResponse(response, 'Firecrawl Agent');
        if (!response.ok || !json.ok)
            throw new Error(json.error || 'Agent 请求失败');
        return json.data;
    }, []);
    // Automatically start analysis as soon as a successfully scraped board is available.
    // The service deduplicates jobs for the same snapshot, including remounts and tab switches.
    React.useEffect(() => {
        const board = boards[period];
        if (!board || !configured)
            return;
        // Agent mode ships the summary with the board; never spend a second task for it.
        if (board.insight) {
            setInsights((old) => ({
                ...old, [period]: { status: 'completed', insight: board.insight },
            }));
            return;
        }
        let stopped = false;
        let timer;
        const generation = ++agentGeneration.current;
        const current = () => !stopped && generation === agentGeneration.current;
        setAgentError('');
        setInsights((old) => ({ ...old, [period]: { status: 'processing' } }));
        const run = async () => {
            try {
                let state = await agentCall(period, 'start');
                if (!current())
                    return;
                setInsights((old) => ({ ...old, [period]: state }));
                const poll = async () => {
                    if (!current() || state.status !== 'processing')
                        return;
                    try {
                        state = await agentCall(period, 'status');
                        if (!current())
                            return;
                        setInsights((old) => ({ ...old, [period]: state }));
                        if (state.status === 'processing')
                            timer = setTimeout(poll, 3500);
                    }
                    catch (err) {
                        if (current())
                            setAgentError(err.message || 'Agent 状态获取失败');
                    }
                };
                if (state.status === 'processing')
                    timer = setTimeout(poll, 3500);
            }
            catch (err) {
                if (current())
                    setAgentError(err.message || 'Agent 分析失败');
            }
        };
        run();
        return () => { stopped = true; if (timer)
            clearTimeout(timer); };
    }, [period, boards[period]?.fetchedAt, configured, agentCall]);
    const board = boards[period];
    const periods = [['daily', '每日'], ['weekly', '每周'], ['monthly', '每月']];
    const increment = { daily: '今日新增', weekly: '本周新增', monthly: '本月新增' }[period];
    const columns = [['name', '项目'], ['url', '项目链接'], ['description', '简介'], ['language', '语言'], ['stars', '总 Star'], ['starsToday', increment]];
    const count = (value) => value === null ? '—' : value.toLocaleString('zh-CN');
    const translations = insights[period]?.status === 'completed'
        ? (insights[period]?.insight?.descriptionsZh || {}) : {};
    const localizedDescription = (row) => {
        if (descriptionLocale === 'en' || !row.description)
            return row.description || '—';
        return translations[row.name] || row.description || '—';
    };
    return h('section', { className: 'dsh-trending', 'aria-label': 'GitHub 热点看板' }, h('div', { className: 'dsh-trending-heading' }, h('div', null, h('span', { className: 'dsh-trending-eyebrow' }, 'DISCOVER / OPEN SOURCE'), h('h2', null, 'GitHub 热点看板'), h('p', null, '探索开源趋势，洞察每天涌现的新项目')), h('button', { className: 'dsh-github-btn-sm', disabled: busy || !configured, onClick: () => load(period, true), title: '绕过缓存，重新抓取当前榜单' }, busy ? '抓取中…' : '刷新榜单')), h('div', { className: 'dsh-trending-controls' }, h('div', { className: 'dsh-github-pills', role: 'tablist', 'aria-label': '榜单周期' }, ...periods.map(([key, label]) => h('button', { key, role: 'tab', 'aria-selected': period === key,
        className: 'dsh-github-pill-btn' + (period === key ? ' active' : ''), onClick: () => setPeriod(key) }, label))), h('div', { className: 'dsh-trending-locale-switch', role: 'group', 'aria-label': '项目简介语言' }, h('span', { className: 'dsh-trending-locale-label' }, '项目简介'), ...[['zh', '中文'], ['en', 'English']].map(([locale, label]) => h('button', { key: locale, type: 'button', className: 'dsh-trending-locale-btn' + (descriptionLocale === locale ? ' active' : ''),
        'aria-pressed': descriptionLocale === locale, onClick: () => setDescriptionLocale(locale) }, label)))), h('p', { className: 'dsh-trending-note' }, `starsToday 在当前榜单表示“${increment}”，统计周期以 GitHub Trending 为准。`, descriptionLocale === 'zh' && insights[period]?.status === 'processing' ? ' 中文简介正在由 Agent 翻译，完成前显示英文原文。' : ''), configured === false ? h('div', { className: 'dsh-trending-notice' }, h('strong', null, '配置 Firecrawl 后即可加载热点'), h('p', null, '在插件设置的 Firecrawl 分区中保存 API Key，即可开始使用。'), h('button', { className: 'dsh-github-btn-sm', onClick: () => window.dispatchEvent(new Event('dsh-github-open-firecrawl')) }, '配置 Firecrawl'), h('p', null, '自托管服务可在插件配置中设置 firecrawlBaseUrl（服务根地址，不包含 /v2/scrape），或设置 FIRECRAWL_BASE_URL。'), h('p', null, '密钥仅在服务端读取；查看热点无需安装 gh 或登录 GitHub。')) : null, configured === null && !error ? h('p', { role: 'status' }, '正在检查 Firecrawl 配置…') : null, error ? h('div', { className: 'dsh-trending-notice', role: 'alert' }, error, board ? '；以下保留上次成功结果。' : '', configured ? h('button', { className: 'dsh-github-btn-sm', disabled: busy, onClick: () => load(period, true) }, '重试') : null) : null, board?.stale ? h('div', { className: 'dsh-trending-notice', role: 'status' }, `刷新失败，显示缓存：${board.warning}`) : null, busy && !board ? h('div', { className: 'dsh-github-empty', role: 'status' }, '正在通过 Firecrawl 抓取榜单，请稍候…') : null, board ? h('div', { className: 'dsh-trending-board' }, h('div', { className: 'dsh-trending-meta' }, h('span', null, `${board.items.length} 个项目 · 最近成功获取 ${new Date(board.fetchedAt).toLocaleString()}${board.stale || error ? ' · 旧数据' : ''}`), h('a', { href: board.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, '查看 GitHub 原榜 ↗')), h('div', { className: 'dsh-trending-content' }, h('div', { className: 'dsh-trending-table-wrap', 'aria-busy': busy }, h('table', { className: 'dsh-trending-table' }, h('thead', null, h('tr', null, ...columns.map(([key, label]) => h('th', { key, scope: 'col' }, label, h('small', null, key))))), h('tbody', null, ...board.items.map(row => h('tr', { key: row.url }, h('td', { className: 'dsh-trending-name' }, h('a', { href: row.url, target: '_blank', rel: 'noopener noreferrer' }, row.name)), h('td', { className: 'dsh-trending-url' }, h('a', { href: row.url, target: '_blank', rel: 'noopener noreferrer' }, row.url)), h('td', { className: 'dsh-trending-description', lang: descriptionLocale === 'zh' && translations[row.name] ? 'zh-CN' : 'en',
        title: descriptionLocale === 'zh' && !translations[row.name] && row.description ? '中文翻译生成中或暂不可用，当前显示原文' : undefined }, localizedDescription(row)), h('td', null, row.language || '—'), h('td', { className: 'dsh-trending-number' }, count(row.stars)), h('td', { className: 'dsh-trending-number dsh-trending-gain' }, row.starsToday === null ? '—' : '+' + count(row.starsToday))))))), h('aside', { className: 'dsh-trending-insight', 'aria-label': 'Firecrawl Agent 总结与观察' }, h('div', { className: 'dsh-trending-insight-header' }, h('span', { className: 'dsh-trending-agent-icon', 'aria-hidden': true }, '✦'), h('div', null, h('h3', null, 'AI 趋势洞察'), h('small', null, 'FIRECRAWL AGENT · ' + ({ daily: '每日', weekly: '每周', monthly: '每月' })[period]))), (agentError || insights[period]?.error) ? h('p', { className: 'dsh-trending-agent-error', role: 'alert' }, agentError || insights[period]?.error) : null, insights[period]?.status === 'completed' ? h('div', { className: 'dsh-trending-insight-result' }, h('h4', null, '趋势总结'), h('p', null, insights[period].insight.summary), h('h4', null, '观察与发现'), h('ol', null, ...insights[period].insight.observations.map((item, i) => h('li', { key: i }, item)))) :
        insights[period]?.status === 'processing' && !agentError ? h('div', { className: 'dsh-trending-agent-loading', role: 'status' }, h('span', { className: 'dsh-trending-agent-spinner' }), 'Agent 正在分析榜单，请稍后…') : null))) : null);
}
