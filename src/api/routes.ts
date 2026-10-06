import { execFile } from 'node:child_process';
import path from 'node:path';
import type { GhExecutor } from '../executor.js';
import { TtlCache } from '../cache.js';
import { mapLimit, tryReadWorkspaces, findWorkspacePathBySession, findMostRecentWorkspacePath, hasGitDir } from '../workspace.js';
import type { GitHubOverviewData, GlobalOverviewData, UserRepoItem, WorkspaceMatrixItem, RepoMetadata, PrItem, IssueItem, WorkflowRunItem } from '../types.js';

/** path.basename 在空串/异常输入上会抛错，工作区路径来自磁盘文件，必须防御 */
function basenameSafe(p: string): string {
  try {
    return path.basename(p) || p;
  } catch {
    return p;
  }
}

/** 探测单个工作区时在途的 gh 进程数上限；libuv 线程池默认 4，留出余量给其他请求 */
const WORKSPACE_PROBE_CONCURRENCY = 3;

/**
 * 全局驾驶舱的缓存时长下限。
 * 这个端点要 spawn 十几次 gh，比单仓库概览重得多，因此不直接沿用 cacheTtlMs（默认 15s）。
 * 定在 5 分钟的依据：它展示的是「我的仓库 / 待办 PR / Issues」这类分钟级不变的数据，
 * 而每次刷新本机实测要 8-13 秒。缓存太短等于让用户反复等这段延迟——实测 60 秒缓存下，
 * 用户 65 秒后再打开面板仍需等 9.7 秒。仍随 cacheTtlMs 缩放，用户调大时这里同步变长。
 */
const GLOBAL_CACHE_MIN_TTL_MS = 300_000;

/**
 * 由用户配置推导全局驾驶舱的缓存时长。
 * 抽成导出的纯函数：TTL 的推导规则是测试断言的对象，埋在闭包里就只能靠猜。
 */
export function globalCacheTtlMs(cacheTtlMs: number): number {
  const base = Number.isFinite(cacheTtlMs) && cacheTtlMs >= 0 ? cacheTtlMs : 15_000;
  return Math.max(base * 20, GLOBAL_CACHE_MIN_TTL_MS);
}

/** open_browser 只允许 http/https，杜绝 file:// 与自定义协议被当作打开目标 */
function isSafeExternalUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function registerApiRoutes(webServerService: any, executor: GhExecutor, workspaceRegistry?: any, cacheTtlMs = 15_000) {
  if (!webServerService || typeof webServerService.register !== 'function') return;

  const cacheMap = new TtlCache<GitHubOverviewData>(cacheTtlMs);
  const globalCache = new TtlCache<GlobalOverviewData>(globalCacheTtlMs(cacheTtlMs));

  function sendJson(res: any, status: number, data: any) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(data));
  }

  // 1. 获取全局与当前仓库的 GitHub 概览
  webServerService.register({
    kind: 'exact',
    path: '/api/github/overview',
    handler: async (req: any, res: any) => {
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
          sendJson(res, 200, { ok: true, data: cachedData, fromCache: true, cwd });
          return;
        }

        const auth = await executor.checkAuth(cwd);
        const repo = await executor.getRepoMetadata(cwd);

        let pullRequests: PrItem[] = [];
        let issues: IssueItem[] = [];
        let runs: WorkflowRunItem[] = [];

        if (repo && auth.loggedIn) {
          // 并发拉取当前文件夹仓库的 PRs、Issues 和 Runs
          const [prsRes, issuesRes, runsRes] = await Promise.all([
            executor.run<PrItem[]>(
              ['pr', 'list', '--json', 'number,title,state,author,headRefName,baseRefName,isDraft,mergeable,reviewDecision,statusCheckRollup,url,updatedAt', '-L', '10'],
              { cwd, timeoutMs: 8_000 }
            ),
            executor.run<IssueItem[]>(
              ['issue', 'list', '--json', 'number,title,state,author,labels,assignees,url,updatedAt', '-L', '10'],
              { cwd, timeoutMs: 8_000 }
            ),
            executor.run<WorkflowRunItem[]>(
              ['run', 'list', '--json', 'databaseId,name,status,conclusion,event,headBranch,url,createdAt', '-L', '5'],
              { cwd, timeoutMs: 8_000 }
            ),
          ]);

          if (prsRes.ok && Array.isArray(prsRes.data)) pullRequests = prsRes.data;
          if (issuesRes.ok && Array.isArray(issuesRes.data)) issues = issuesRes.data;
          if (runsRes.ok && Array.isArray(runsRes.data)) runs = runsRes.data;
        }

        const freshData: GitHubOverviewData = {
          auth,
          repo: repo || undefined,
          pullRequests,
          issues,
          runs,
          lastUpdated: new Date().toISOString(),
        };

        cacheMap.set(cwd, freshData, now);

        sendJson(res, 200, { ok: true, data: freshData, fromCache: false, cwd });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err.message || '获取 GitHub 概览失败' });
      }
    },
  });

  // 2. 强制刷新缓存
  webServerService.register({
    kind: 'exact',
    path: '/api/github/refresh',
    handler: async (req: any, res: any) => {
      cacheMap.clear();
      globalCache.clear();
      sendJson(res, 200, { ok: true, message: '缓存已清空，下次读取将拉取最新数据' });
    },
  });

  // 3. 右侧栏快捷操作代理接口
  webServerService.register({
    kind: 'exact',
    path: '/api/github/action',
    handler: async (req: any, res: any) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: '仅支持 POST 请求' });
        return;
      }

      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const cwd = payload.cwd || process.cwd();

          switch (payload.action) {
            case 'create_pr': {
              const cmd = ['pr', 'create', '--title', payload.title || 'Update', '--body', payload.body || 'Created from DSH Rightbar'];
              if (payload.draft) cmd.push('--draft');
              const r = await executor.run(cmd, { cwd });
              if (!r.ok) throw new Error(r.error);
              sendJson(res, 200, { ok: true, message: 'PR 创建成功', url: r.rawOutput });
              break;
            }
            case 'create_issue': {
              const cmd = ['issue', 'create', '--title', payload.title || 'New Issue', '--body', payload.body || 'Created from DSH Rightbar'];
              const r = await executor.run(cmd, { cwd });
              if (!r.ok) throw new Error(r.error);
              sendJson(res, 200, { ok: true, message: 'Issue 创建成功', url: r.rawOutput });
              break;
            }
            case 'open_browser': {
              // 原实现把 payload.url 直接拼进 shell 字符串再交给 exec()，
              // 形如 https://x" & calc & " 的 URL 可闭合引号并追加任意命令——本机任意页面
              // 都能通过 POST 这个端点触发命令执行。
              // 现在改为：先用 URL 解析白名单协议，再用 execFile 参数数组传递，全程不经过 shell。
              if (!isSafeExternalUrl(payload.url)) {
                throw new Error('url 参数无效：只允许 http/https 开头的完整地址');
              }
              const { execFile } = await import('node:child_process');
              const [bin, args] = process.platform === 'win32'
                ? ['cmd', ['/c', 'start', '', payload.url]]
                : process.platform === 'darwin'
                  ? ['open', [payload.url]]
                  : ['xdg-open', [payload.url]];
              // 不 await，也不让打开失败反向影响接口语义；仅记录以便排查
              execFile(bin, args, (err: any) => {
                if (err) console.warn('[dsh-github-flow] 打开浏览器失败:', err?.message || err);
              });
              sendJson(res, 200, { ok: true, message: '已在浏览器打开' });
              break;
            }
            default:
              sendJson(res, 400, { ok: false, message: `未知的操作类型: ${payload.action}` });
          }
        } catch (err: any) {
          sendJson(res, 500, { ok: false, error: err.message || '操作执行失败' });
        }
      });
    },
  });

  // 4. 获取全局视角的驾驶舱概览数据 (不绑定单一项目)
  webServerService.register({
    kind: 'exact',
    path: '/api/github/global-overview',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }

      // 全局驾驶舱要 spawn 十几次 gh（认证 + 仓库 + PR + Issue + 每个工作区探测），
      // 实测冷启动曾达 18.9 秒。缓存是这里唯一的解药：面板每次挂载都会来取一次。
      const now = Date.now();
      const cachedGlobal = globalCache.get('global', now);
      if (cachedGlobal) {
        sendJson(res, 200, { ok: true, data: cachedGlobal, fromCache: true });
        return;
      }

      try {
        const auth = await executor.checkAuth();
        let userRepos: UserRepoItem[] = [];
        let myPrs: any[] = [];
        let myIssues: any[] = [];
        let workspaceMatrix: WorkspaceMatrixItem[] = [];
        let workspaceError: string | undefined;

        if (auth.loggedIn) {
          // 并发执行：1. 账号下仓库列表 2. 个人 PRs 3. 个人 Issues
          // 超时压到 8 秒：本机实测 `gh search issues --author=@me` 单次就要 10 秒，
          // 它是这组的木桶短板，直接决定首屏等待时间。面板查询不值得为它多等 4 秒。
          const [reposRes, prsRes, issuesRes] = await Promise.all([
            executor.run<any[]>(
              ['repo', 'list', '--limit', '20', '--json', 'name,nameWithOwner,description,defaultBranchRef,isPrivate,stargazerCount,updatedAt,url'],
              { timeoutMs: 8_000 }
            ),
            executor.run<any[]>(
              ['search', 'prs', '--author=@me', '--state=open', '--limit', '10', '--json', 'number,title,repository,url,updatedAt'],
              { timeoutMs: 8_000 }
            ),
            executor.run<any[]>(
              ['search', 'issues', '--author=@me', '--state=open', '--limit', '10', '--json', 'number,title,repository,url,updatedAt'],
              { timeoutMs: 8_000 }
            ),
          ]);

          if (reposRes.ok && Array.isArray(reposRes.data)) {
            userRepos = reposRes.data.map((r: any) => ({
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

        const globalData: GlobalOverviewData = {
          auth,
          userRepos,
          workspaceMatrix,
          myPrs,
          myIssues,
          lastUpdated: new Date().toISOString(),
          ...(workspaceError ? { workspaceError } : {}),
        };

        globalCache.set('global', globalData, now);
        sendJson(res, 200, { ok: true, data: globalData, fromCache: false });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err.message || '获取全局驾驶舱数据失败' });
      }
    },
  });
}
