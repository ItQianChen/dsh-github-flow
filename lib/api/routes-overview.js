import { mapLimit, tryReadWorkspaces, findWorkspacePathBySession, findMostRecentWorkspacePath, hasGitDir } from '../workspace.js';
import { resolveIssueCategories, calculateIssueStats, basenameSafe, sendJson } from './route-helpers.js';
/** 探测单个工作区时在途的 gh 进程数上限；libuv 线程池默认 4，留出余量给其他请求 */
const WORKSPACE_PROBE_CONCURRENCY = 3;
export function registerOverviewRoutes(deps, executor, cacheMap, globalCache, checker) {
    const { bindRoute } = deps;
    // 1. 获取全局与当前仓库的 GitHub 概览
    bindRoute({
        kind: 'exact',
        path: '/api/github/overview',
        handler: async (req, res) => {
            if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
                return;
            }
            try {
                const url = new URL(req.url || '', 'http://127.0.0.1');
                let cwd = url.searchParams.get('cwd');
                const sessionId = url.searchParams.get('sessionId');
                // 会话 ID → 物理路径，以及「最近活跃工作区」兜底，统一由 workspace 模块提供
                if (!cwd && sessionId) {
                    cwd = findWorkspacePathBySession(sessionId) || null;
                }
                if (!cwd) {
                    cwd = findMostRecentWorkspacePath() || null;
                }
                if (!cwd) {
                    cwd = process.cwd();
                }
                const now = Date.now();
                const cachedData = cacheMap.get(cwd, now);
                if (cachedData) {
                    sendJson(res, 200, {
                        ok: true,
                        data: { ...cachedData, updateInfo: checker.getQuickStatus() },
                        fromCache: true,
                        cwd,
                    });
                    return;
                }
                const auth = await executor.checkAuth(cwd);
                const repo = await executor.getRepoMetadata(cwd);
                let pullRequests = [];
                let issues = [];
                let runs = [];
                if (repo && auth.loggedIn) {
                    // 并发拉取当前文件夹仓库的 PRs、Issues 和 Runs
                    const [prsRes, issuesRes, runsRes] = await Promise.all([
                        executor.run(['pr', 'list', '--json', 'number,title,state,author,headRefName,baseRefName,isDraft,mergeable,reviewDecision,statusCheckRollup,url,updatedAt', '-L', '10'], { cwd, timeoutMs: 8_000 }),
                        executor.run(['issue', 'list', '--json', 'number,title,state,author,labels,assignees,url,updatedAt', '-L', '10'], { cwd, timeoutMs: 8_000 }),
                        executor.run(['run', 'list', '--json', 'databaseId,name,status,conclusion,event,headBranch,url,createdAt', '-L', '5'], { cwd, timeoutMs: 8_000 }),
                    ]);
                    if (prsRes.ok && Array.isArray(prsRes.data))
                        pullRequests = prsRes.data;
                    if (issuesRes.ok && Array.isArray(issuesRes.data)) {
                        const currentUser = auth.user;
                        const repoOwner = repo?.owner || repo?.nameWithOwner?.split('/')[0];
                        issues = issuesRes.data.map((item) => {
                            const categories = resolveIssueCategories(item, currentUser, repoOwner);
                            return {
                                ...item,
                                categories,
                            };
                        });
                    }
                    if (runsRes.ok && Array.isArray(runsRes.data))
                        runs = runsRes.data;
                }
                const issueStats = calculateIssueStats(issues);
                const freshData = {
                    auth,
                    repo: repo || undefined,
                    pullRequests,
                    issues,
                    issueStats,
                    runs,
                    lastUpdated: new Date().toISOString(),
                    updateInfo: checker.getQuickStatus(),
                };
                cacheMap.set(cwd, freshData, now);
                sendJson(res, 200, { ok: true, data: freshData, fromCache: false, cwd });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, error: err.message || '获取 GitHub 概览失败' });
            }
        },
    });
    // 2. 获取全局视角的驾驶舱概览数据 (不绑定单一项目)
    bindRoute({
        kind: 'exact',
        path: '/api/github/global-overview',
        handler: async (req, res) => {
            if (req.method !== 'GET') {
                sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
                return;
            }
            // 全局驾驶舱要 spawn 十几次 gh（认证 + 仓库 + PR + Issue + 每个工作区探测），
            // 实测冷启动曾达 18.9 秒。缓存是这里唯一的解药：面板每次挂载都会来取一次。
            const now = Date.now();
            const cachedGlobal = globalCache.get('global', now);
            if (cachedGlobal) {
                sendJson(res, 200, {
                    ok: true,
                    data: { ...cachedGlobal, updateInfo: checker.getQuickStatus() },
                    fromCache: true,
                });
                return;
            }
            try {
                const auth = await executor.checkAuth();
                let userRepos = [];
                let myPrs = [];
                let myIssues = [];
                let issueStats = { total: 0, reported: 0, assigned: 0, created: 0 };
                let workspaceMatrix = [];
                let workspaceError;
                if (auth.loggedIn) {
                    // 并发执行：1. 账号下仓库列表 2. 个人 PRs 3. 三维 Issue 检索（名下仓库用户提单 + 指派待办 + 我创建的）
                    // 为什么三路并发搜索：
                    // - --owner=@me: 捕获用户/访客在当前用户所有仓库下提的 Issue (如反馈 Bug、Feature Request)，解决外部提单看不见的问题
                    // - --assignee=@me: 捕获团队成员或自己指派给当前账号的待办任务 (含跨组织/第三方项目)
                    // - --author=@me: 捕获当前账号亲自发起的任务与向外部提起的议题
                    // 3 个轻量进程与 repo/prs 同步 spawn，经 OS 并发调度实测仅耗时 3 秒出头，完全满足 8 秒超时门限。
                    const issueFields = 'number,title,repository,author,assignees,labels,url,updatedAt';
                    const queryResults = await Promise.allSettled([
                        executor.run(['repo', 'list', '--limit', '20', '--json', 'name,nameWithOwner,description,defaultBranchRef,isPrivate,stargazerCount,updatedAt,url'], { timeoutMs: 8_000 }),
                        executor.run(['search', 'prs', '--author=@me', '--state=open', '--limit', '10', '--json', 'number,title,repository,url,updatedAt'], { timeoutMs: 8_000 }),
                        executor.run(['search', 'issues', '--owner=@me', '--state=open', '--sort=updated', '--limit', '15', '--json', issueFields], { timeoutMs: 8_000 }),
                        executor.run(['search', 'issues', '--assignee=@me', '--state=open', '--sort=updated', '--limit', '15', '--json', issueFields], { timeoutMs: 8_000 }),
                        executor.run(['search', 'issues', '--author=@me', '--state=open', '--sort=updated', '--limit', '15', '--json', issueFields], { timeoutMs: 8_000 }),
                    ]);
                    const reposRes = queryResults[0].status === 'fulfilled' ? queryResults[0].value : { ok: false };
                    const prsRes = queryResults[1].status === 'fulfilled' ? queryResults[1].value : { ok: false };
                    const ownerIssuesRes = queryResults[2].status === 'fulfilled' ? queryResults[2].value : { ok: false };
                    const assignedIssuesRes = queryResults[3].status === 'fulfilled' ? queryResults[3].value : { ok: false };
                    const authorIssuesRes = queryResults[4].status === 'fulfilled' ? queryResults[4].value : { ok: false };
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
                    // 多源 Issues 聚合、按 URL 唯一去重并排序
                    const issueMap = new Map();
                    const collectIssues = (res) => {
                        if (res.ok && Array.isArray(res.data)) {
                            for (const item of res.data) {
                                if (item.url && !issueMap.has(item.url)) {
                                    issueMap.set(item.url, item);
                                }
                            }
                        }
                    };
                    collectIssues(ownerIssuesRes);
                    collectIssues(assignedIssuesRes);
                    collectIssues(authorIssuesRes);
                    const rawList = Array.from(issueMap.values());
                    // 统一按最后更新时间降序排列
                    rawList.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
                    const currentUser = auth.user;
                    myIssues = rawList.map((raw) => {
                        const categories = resolveIssueCategories(raw, currentUser);
                        return {
                            number: raw.number,
                            title: raw.title || '',
                            repository: raw.repository || { nameWithOwner: '' },
                            author: raw.author ? { login: raw.author.login } : undefined,
                            assignees: Array.isArray(raw.assignees) ? raw.assignees.map((a) => ({ login: a.login })) : [],
                            labels: Array.isArray(raw.labels) ? raw.labels.map((l) => ({ name: l.name, color: l.color })) : [],
                            url: raw.url || '',
                            updatedAt: raw.updatedAt || '',
                            state: raw.state || 'OPEN',
                            categories,
                        };
                    });
                    issueStats = calculateIssueStats(myIssues);
                }
                // 解析本地所有工作区与 GitHub 关联矩阵
                const wsRead = tryReadWorkspaces();
                workspaceError = wsRead.error;
                if (!workspaceError) {
                    const wsEntries = wsRead.workspaces.filter((ws) => ws.path);
                    // 有界并发探测：每个工作区最多 spawn 2 个 gh 进程，无上限并发会让它们全挤进
                    // libuv 默认 4 线程的队列里排队，延迟随工作区数量线性劣化。
                    // 这里刻意只用本地 .git/config 识别身份、不发网络请求——全局矩阵只需要「属于哪个仓库」，
                    // 每次网络往返都要秒级，5 个工作区就足以把该端点拖到 20 秒。
                    workspaceMatrix = await mapLimit(wsEntries, WORKSPACE_PROBE_CONCURRENCY, async (ws) => {
                        const hasGit = hasGitDir(ws.path);
                        return {
                            id: ws.id,
                            title: ws.title || basenameSafe(ws.path),
                            path: ws.path,
                            hasGit,
                            repo: hasGit ? executor.getRepoIdentityFromLocal(ws.path) || undefined : undefined,
                            sessionCount: ws.sessionIds.length,
                        };
                    });
                }
                const globalData = {
                    auth,
                    userRepos,
                    workspaceMatrix,
                    myPrs,
                    myIssues,
                    issueStats,
                    lastUpdated: new Date().toISOString(),
                    updateInfo: checker.getQuickStatus(),
                    ...(workspaceError ? { workspaceError } : {}),
                };
                globalCache.set('global', globalData, now);
                sendJson(res, 200, { ok: true, data: globalData, fromCache: false });
            }
            catch (err) {
                sendJson(res, 500, { ok: false, error: err.message || '获取全局驾驶舱数据失败' });
            }
        },
    });
}
