let cachedOverview = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 15_000; // 15秒轻量缓存，防止前端高频轮询耗尽 GitHub API 配额
export function registerApiRoutes(webServerService, executor) {
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
                const cwd = process.cwd();
                const auth = await executor.checkAuth(cwd);
                const repo = await executor.getRepoMetadata(cwd);
                let pullRequests = [];
                let issues = [];
                let runs = [];
                if (repo && auth.loggedIn) {
                    // 并发拉取当前仓库的 PRs、Issues 和 Runs
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
                sendJson(res, 200, { ok: true, data: cachedOverview, fromCache: false });
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
}
