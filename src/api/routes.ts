import type { GhExecutor } from '../executor.js';
import type { GitHubOverviewData, PrItem, IssueItem, WorkflowRunItem } from '../types.js';

const cacheMap = new Map<string, { data: GitHubOverviewData; time: number }>();
const CACHE_TTL_MS = 15_000;

export function registerApiRoutes(webServerService: any, executor: GhExecutor, workspaceRegistry?: any) {
  if (!webServerService || typeof webServerService.register !== 'function') return;

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

        // 1. 优先通过 sessionId 从 workspace.json 逆向解析物理路径
        if (!cwd && sessionId) {
          try {
            const fs = await import('node:fs');
            const path = await import('node:path');
            const os = await import('node:os');
            const wsJsonPath = path.join(os.homedir(), '.dsh', 'storages', 'workspace.json');
            if (fs.existsSync(wsJsonPath)) {
              const wsData = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
              const workspaces = wsData.tables?.workspaces || {};
              for (const wsId of Object.keys(workspaces)) {
                const item = workspaces[wsId];
                if (item.sessionIds && item.sessionIds.includes(sessionId)) {
                  cwd = item.path;
                  break;
                }
              }
            }
          } catch (e) {}
        }

        // 2. 若仍未获取，从 workspace.json 自动匹配最近活跃的工作区
        if (!cwd) {
          try {
            const fs = await import('node:fs');
            const path = await import('node:path');
            const os = await import('node:os');
            const wsJsonPath = path.join(os.homedir(), '.dsh', 'storages', 'workspace.json');
            if (fs.existsSync(wsJsonPath)) {
              const wsData = JSON.parse(fs.readFileSync(wsJsonPath, 'utf8'));
              const workspaces = wsData.tables?.workspaces || {};
              let latestItem: any = null;
              for (const wsId of Object.keys(workspaces)) {
                const item = workspaces[wsId];
                if (!latestItem || new Date(item.updatedAt || 0) > new Date(latestItem.updatedAt || 0)) {
                  latestItem = item;
                }
              }
              if (latestItem && latestItem.path) {
                cwd = latestItem.path;
              }
            }
          } catch (e) {}
        }

        if (!cwd) {
          cwd = process.cwd();
        }

        const now = Date.now();
        const cached = cacheMap.get(cwd);
        if (cached && now - cached.time < CACHE_TTL_MS) {
          sendJson(res, 200, { ok: true, data: cached.data, fromCache: true, cwd });
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
              { cwd, timeoutMs: 12_000 }
            ),
            executor.run<IssueItem[]>(
              ['issue', 'list', '--json', 'number,title,state,author,labels,assignees,url,updatedAt', '-L', '10'],
              { cwd, timeoutMs: 12_000 }
            ),
            executor.run<WorkflowRunItem[]>(
              ['run', 'list', '--json', 'databaseId,name,status,conclusion,event,headBranch,url,createdAt', '-L', '5'],
              { cwd, timeoutMs: 12_000 }
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

        cacheMap.set(cwd, { data: freshData, time: now });

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
              if (!payload.url) throw new Error('缺少 url 参数');
              const { exec } = await import('node:child_process');
              const openCmd = process.platform === 'win32' ? `start "" "${payload.url}"` : (process.platform === 'darwin' ? `open "${payload.url}"` : `xdg-open "${payload.url}"`);
              exec(openCmd);
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
}
