let cachedOverview = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 15_000; // 15秒轻量缓存，防止前端高频轮询耗尽 GitHub API 配额
export function registerApiRoutes(webServerService, executor, workspaceRegistry) {
    if (!webServerService || typeof webServerService.register !== 'function')
        return;
    function sendJson(res, status, data) {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(data));
    }
    // 1. 获取全局与当前仓库的 GitHub 概览
    webServerService.register({
        kind: 'exact',
        path: '/api/github/overview',
        handler: async (req, res) => {
            if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
                return;
            }
            const now = Date.now();
            if (cachedOverview && now - lastFetchTime < CACHE_TTL_MS) {
                sendJson(res, 200, { ok: true, data: cachedOverview, fromCache: true });
                return;
            }
            try {
                const url = new URL(req.url || '', 'http://127.0.0.1');
                let cwd = url.searchParams.get('cwd');
                // 优先从 query 获取；若未传，则自动由 workspaceRegistry 探测当前活跃工作区物理路径
                if (!cwd && workspaceRegistry && typeof workspaceRegistry.list === 'function') {
                    const wsList = workspaceRegistry.list();
                    if (wsList && wsList.length > 0 && wsList[0].path) {
                        cwd = wsList[0].path;
                    }
                }
                if (!cwd) {
                    cwd = process.cwd();
                }
                const auth = await executor.checkAuth(cwd);
                const repo = await executor.getRepoMetadata(cwd);
                let pullRequests = [];
                let issues = [];
                let runs = [];
                if (repo && auth.loggedIn) {
                    // 并发拉取当前文件夹仓库的 PRs、Issues 和 Runs
                    const [prsRes, issuesRes, runsRes] = await Promise.all([
                        executor.run(['pr', 'list', '--json', 'number,title,state,author,headRefName,baseRefName,isDraft,mergeable,reviewDecision,statusCheckRollup,url,updatedAt', '-L', '10'], { cwd, timeoutMs: 12_000 }),
                        executor.run(['issue', 'list', '--json', 'number,title,state,author,labels,assignees,url,updatedAt', '-L', '10'], { cwd, timeoutMs: 12_000 }),
                        executor.run(['run', 'list', '--json', 'databaseId,name,status,conclusion,event,headBranch,url,createdAt', '-L', '5'], { cwd, timeoutMs: 12_000 }),
                    ]);
                    if (prsRes.ok && Array.isArray(prsRes.data))
                        pullRequests = prsRes.data;
                    if (issuesRes.ok && Array.isArray(issuesRes.data))
                        issues = issuesRes.data;
                    if (runsRes.ok && Array.isArray(runsRes.data))
                        runs = runsRes.data;
                }
                cachedOverview = {
                    auth,
                    repo: repo || undefined,
                    pullRequests,
                    issues,
                    runs,
                    lastUpdated: new Date().toISOString(),
                };
                lastFetchTime = now;
                sendJson(res, 200, { ok: true, data: cachedOverview, fromCache: false, cwd });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, error: err.message || '获取 GitHub 概览失败' });
            }
        },
    });
    // 2. 强制刷新缓存
    webServerService.register({
        kind: 'exact',
        path: '/api/github/refresh',
        handler: async (req, res) => {
            cachedOverview = null;
            lastFetchTime = 0;
            sendJson(res, 200, { ok: true, message: '缓存已清空，下次读取将拉取最新数据' });
        },
    });
    // 3. 右侧栏快捷操作代理接口
    webServerService.register({
        kind: 'exact',
        path: '/api/github/action',
        handler: async (req, res) => {
            if (req.method !== 'POST') {
                sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
                return;
            }
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
                try {
                    const payload = body ? JSON.parse(body) : {};
                    const cwd = payload.cwd || process.cwd();
                    switch (payload.action) {
                        case 'create_pr': {
                            const cmd = ['pr', 'create', '--title', payload.title || 'Update', '--body', payload.body || 'Created from DSH Rightbar'];
                            if (payload.draft)
                                cmd.push('--draft');
                            const r = await executor.run(cmd, { cwd });
                            if (!r.ok)
                                throw new Error(r.error);
                            sendJson(res, 200, { ok: true, message: 'PR 创建成功', url: r.rawOutput });
                            break;
                        }
                        case 'create_issue': {
                            const cmd = ['issue', 'create', '--title', payload.title || 'New Issue', '--body', payload.body || 'Created from DSH Rightbar'];
                            const r = await executor.run(cmd, { cwd });
                            if (!r.ok)
                                throw new Error(r.error);
                            sendJson(res, 200, { ok: true, message: 'Issue 创建成功', url: r.rawOutput });
                            break;
                        }
                        case 'open_browser': {
                            if (!payload.url)
                                throw new Error('缺少 url 参数');
                            const { exec } = await import('node:child_process');
                            const openCmd = process.platform === 'win32' ? `start "" "${payload.url}"` : (process.platform === 'darwin' ? `open "${payload.url}"` : `xdg-open "${payload.url}"`);
                            exec(openCmd);
                            sendJson(res, 200, { ok: true, message: '已在浏览器打开' });
                            break;
                        }
                        default:
                            sendJson(res, 400, { ok: false, message: `未知的操作类型: ${payload.action}` });
                    }
                }
                catch (err) {
                    sendJson(res, 500, { ok: false, error: err.message || '操作执行失败' });
                }
            });
        },
    });
}
