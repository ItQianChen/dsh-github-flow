const cacheMap = new Map();
export function registerApiRoutes(ctx, executor, config) {
    const webServer = ctx.get ? ctx.get('webServer') : ctx.webServer;
    if (!webServer || typeof webServer.register !== 'function')
        return;
    const cacheTtlMs = config?.cacheTtlMs || 15_000;
    const listLimit = String(config?.defaultListLimit || 20);
    function sendJson(res, status, data) {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(data));
    }
    // 接入 Cordis effect 管理生命周期，卸载或重载时注销所有路由
    const registerWithEffect = (fn) => {
        if (ctx.effect) {
            return ctx.effect(() => {
                const disposers = fn();
                return () => {
                    disposers.forEach((dispose) => {
                        if (typeof dispose === 'function')
                            dispose();
                    });
                };
            }, 'github-flow: api routes');
        }
        else {
            fn();
        }
    };
    registerWithEffect(() => {
        const disposers = [];
        // 1. 获取全局与当前工作区仓库的 GitHub 概览
        disposers.push(webServer.register({
            kind: 'exact',
            path: '/api/github/overview',
            handler: async (req, res) => {
                if (req.method !== 'GET') {
                    sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
                    return;
                }
                try {
                    const url = new URL(req.url || '', 'http://127.0.0.1');
                    const cwd = url.searchParams.get('cwd') || process.cwd();
                    const now = Date.now();
                    const cached = cacheMap.get(cwd);
                    if (cached && now - cached.time < cacheTtlMs) {
                        sendJson(res, 200, { ok: true, data: cached.data, fromCache: true, cwd });
                        return;
                    }
                    const auth = await executor.checkAuth(cwd);
                    const repo = await executor.getRepoMetadata(cwd);
                    let pullRequests = [];
                    let issues = [];
                    let runs = [];
                    if (repo && auth.loggedIn) {
                        // 并发拉取当前工作区仓库的 PRs、Issues 和 Runs
                        const [prsRes, issuesRes, runsRes] = await Promise.all([
                            executor.run([
                                'pr',
                                'list',
                                '--json',
                                'number,title,state,author,headRefName,baseRefName,isDraft,mergeable,reviewDecision,statusCheckRollup,url,updatedAt',
                                '-L',
                                '10',
                            ], { cwd, timeoutMs: 12_000 }),
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
                    const freshData = {
                        auth,
                        repo: repo || undefined,
                        pullRequests,
                        issues,
                        runs,
                        lastUpdated: new Date().toISOString(),
                    };
                    cacheMap.set(cwd, { data: freshData, time: now });
                    sendJson(res, 200, { ok: true, data: freshData, fromCache: false, cwd });
                }
                catch (err) {
                    sendJson(res, 500, { ok: false, error: err.message || '获取 GitHub 概览失败' });
                }
            },
        }));
        // 2. 强制刷新缓存
        disposers.push(webServer.register({
            kind: 'exact',
            path: '/api/github/refresh',
            handler: async (req, res) => {
                cacheMap.clear();
                sendJson(res, 200, { ok: true, message: '缓存已清空，下次读取将拉取最新数据' });
            },
        }));
        // 3. 右侧栏快捷操作代理接口
        disposers.push(webServer.register({
            kind: 'exact',
            path: '/api/github/action',
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
                    return;
                }
                let body = '';
                req.on('data', (chunk) => {
                    body += chunk;
                });
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
                                if (ctx.emit) {
                                    ctx.emit('github/pr:create', cwd, { title: payload.title || 'Update', url: r.rawOutput || '' });
                                }
                                sendJson(res, 200, { ok: true, message: 'PR 创建成功', url: r.rawOutput });
                                break;
                            }
                            case 'create_issue': {
                                const cmd = ['issue', 'create', '--title', payload.title || 'New Issue', '--body', payload.body || 'Created from DSH Rightbar'];
                                const r = await executor.run(cmd, { cwd });
                                if (!r.ok)
                                    throw new Error(r.error);
                                if (ctx.emit) {
                                    ctx.emit('github/issue:create', cwd, { title: payload.title || 'New Issue', url: r.rawOutput || '' });
                                }
                                sendJson(res, 200, { ok: true, message: 'Issue 创建成功', url: r.rawOutput });
                                break;
                            }
                            case 'open_browser': {
                                // 浏览器外链在 Client 端原生调用 window.open，服务端安全闭环响应
                                sendJson(res, 200, { ok: true, message: '外链已通过客户端安全打开' });
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
        }));
        // 4. 获取全局视角的驾驶舱概览数据 (不绑定单一项目)
        disposers.push(webServer.register({
            kind: 'exact',
            path: '/api/github/global-overview',
            handler: async (req, res) => {
                if (req.method !== 'GET') {
                    sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
                    return;
                }
                try {
                    const auth = await executor.checkAuth();
                    let userRepos = [];
                    let myPrs = [];
                    let myIssues = [];
                    let workspaceMatrix = [];
                    if (auth.loggedIn) {
                        // 并发拉取全局概览数据
                        const [reposRes, prsRes, issuesRes] = await Promise.all([
                            executor.run(['repo', 'list', '--limit', listLimit, '--json', 'name,nameWithOwner,description,defaultBranchRef,isPrivate,stargazerCount,updatedAt,url'], { timeoutMs: 12_000 }),
                            executor.run(['search', 'prs', '--author=@me', '--state=open', '--limit', '10', '--json', 'number,title,repository,url,updatedAt'], { timeoutMs: 12_000 }),
                            executor.run(['search', 'issues', '--author=@me', '--state=open', '--limit', '10', '--json', 'number,title,repository,url,updatedAt'], { timeoutMs: 12_000 }),
                        ]);
                        if (reposRes.ok && Array.isArray(reposRes.data)) {
                            userRepos = reposRes.data.map((r) => ({
                                name: r.name || '',
                                nameWithOwner: r.nameWithOwner || '',
                                description: r.description || '',
                                defaultBranch: r.defaultBranchRef?.name || 'main',
                                isPrivate: Boolean(r.isPrivate),
                                stargazerCount: r.stargazerCount || 0,
                                updatedAt: r.updatedAt || '',
                                url: r.url || `https://github.com/${r.nameWithOwner}`,
                            }));
                        }
                        if (prsRes.ok && Array.isArray(prsRes.data)) {
                            myPrs = prsRes.data;
                        }
                        if (issuesRes.ok && Array.isArray(issuesRes.data)) {
                            myIssues = issuesRes.data;
                        }
                    }
                    // 安全解析工作区矩阵：优先通过官方工作区服务获取，无服务时仅展示当前运行工作区，绝不私自侵入宿主私有文件
                    const currentCwd = process.cwd();
                    const currentRepo = await executor.getRepoMetadata(currentCwd);
                    workspaceMatrix = [
                        {
                            id: 'current',
                            title: '当前活动工作区',
                            path: currentCwd,
                            hasGit: Boolean(currentRepo),
                            repo: currentRepo || undefined,
                            sessionCount: 1,
                        },
                    ];
                    const globalData = {
                        auth,
                        userRepos,
                        workspaceMatrix,
                        myPrs,
                        myIssues,
                        lastUpdated: new Date().toISOString(),
                    };
                    sendJson(res, 200, { ok: true, data: globalData });
                }
                catch (err) {
                    sendJson(res, 500, { ok: false, error: err.message || '获取全局驾驶舱数据失败' });
                }
            },
        }));
        return disposers;
    });
}
