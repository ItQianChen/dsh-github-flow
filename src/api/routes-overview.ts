/**
 * 概览类路由：单仓库 overview + 全局驾驶舱 global-overview。
 * 这两个端点是面板首屏关键路径（也是项目里最重的两个 handler），单独成组
 * 便于按「读密集」特征统一演进（缓存策略、字段投影、并发控制）。
 */
import type { GhExecutor } from '../executor.js';
import { TtlCache } from '../cache.js';
import type { UpdateChecker } from '../updater.js';
import { mapLimit, tryReadWorkspaces, findWorkspacePathBySession, findMostRecentWorkspacePath, hasGitDir } from '../workspace.js';
import type { GitHubOverviewData, GlobalOverviewData, UserRepoItem, WorkspaceMatrixItem, PrItem, IssueItem, WorkflowRunItem, IssueStats, GlobalIssueItem } from '../types.js';
import { resolveIssueCategories, calculateIssueStats, basenameSafe, sendJson, type RouteDeps } from './route-helpers.js';
import { describeDeterministicError } from '../executor/error-classifier.js';

/** 探测单个工作区时在途的 gh 进程数上限；libuv 线程池默认 4，留出余量给其他请求 */
const WORKSPACE_PROBE_CONCURRENCY = 3;

export function registerOverviewRoutes(
  deps: RouteDeps,
  executor: GhExecutor,
  cacheMap: TtlCache<GitHubOverviewData>,
  globalCache: TtlCache<GlobalOverviewData>,
  checker: UpdateChecker
): void {
  const { bindRoute } = deps;

  // 1. 获取全局与当前仓库的 GitHub 概览
  bindRoute({
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
        const force = url.searchParams.get('force') === 'true';

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

        // 先行检查当前工作区是否真实包含 .git，无 .git 铁证判定为未关联仓库
        const isGitRepo = hasGitDir(cwd);

        // 缓存失效判定：比对 remote 配置指纹，而不是比对解析出的仓库身份。
        //
        // 为什么换：身份比对把「解析器的正确性」变成了「缓存有效性的前置条件」。
        // 多 remote 布局下（如 upstream 段写在 origin 段之前），取「第一个
        // github.com 匹配」会拿到上游仓库，与缓存里的 fork 身份恒失配，于是
        // 每次请求都作废缓存、重拉 6 个 gh 子进程。指纹只回答「配置变没变」，
        // 不依赖任何语义理解，对该类偏差免疫。
        //
        // 指纹读取是纯本地 readFileSync（几 KB），与 hasGitDir 同级开销，零子进程。
        const remoteFingerprint = isGitRepo ? executor.getRemoteFingerprint(cwd) : null;
        cacheMap.invalidateIfFingerprintChanged(cwd, remoteFingerprint);

        const cachedData = cacheMap.get(cwd, now);
        if (cachedData && !force) {
          sendJson(res, 200, {
            ok: true,
            data: { ...cachedData, updateInfo: checker.getQuickStatus() },
            fromCache: true,
            cwd,
          });
          return;
        }

        const auth = await executor.checkAuth(cwd);
        const repo = isGitRepo ? await executor.getRepoMetadata(cwd) : null;

        // 若当前工作区未关联 Git 仓库，直接返回纯净空状态，坚决不拉取远端数据
        if (!isGitRepo || !repo) {
          const emptyData: GitHubOverviewData = {
            auth,
            repo: undefined,
            pullRequests: [],
            issues: [],
            issueStats: { total: 0, reported: 0, assigned: 0, created: 0 },
            runs: [],
            lastUpdated: new Date().toISOString(),
            updateInfo: checker.getQuickStatus(),
          };
          cacheMap.set(cwd, emptyData, now, remoteFingerprint);
          sendJson(res, 200, { ok: true, data: emptyData, fromCache: false, cwd });
          return;
        }

        let pullRequests: PrItem[] = [];
        let issues: IssueItem[] = [];
        let runs: WorkflowRunItem[] = [];
        // 确定性降级说明（非错误）：在 if 块内累积、在块外随响应一起落缓存，
        // 因此必须在请求作用域声明，不能藏在分支里。
        const deterministicNotices: string[] = [];
        // 面板增强信息载体（git 状态/Release 锚定/分支 PR——全部可选字段，
        // 进缓存与快照时旧消费方零破坏，渲染层 ?. 兜底）
        const freshExtras: Record<string, any> = {};

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

          // 核心数据拉取故障检测：把失败按语义拆成两堆。
          //
          // 为什么必须拆：`gh` 对所有失败都返回非零退出，但两类失败的性质完全不同——
          // · 确定性（仓库关了 Issues / 仓库不存在 / 无权限）：重试一万次也还是失败，
          //   正确处置是「该字段降级为空列表 + 一句说明」，绝不能伪装成网络故障；
          // · 传输层（超时 / 断连 / 代理阻断）：值得回退历史快照并允许重试。
          // 旧实现把两者混为一谈，导致「仓库关了 Issues」弹出「网络连接失败」横幅，
          // 还被客户端重试器当成可恢复抖动反复空烧。
          const transientFailures: string[] = [];
          const collectFailure = (res: { ok: boolean; error?: string; errorKind?: string }, label: string) => {
            if (res.ok) return;
            const msg = res.error || '接口异常';
            // errorKind 由 GhExecutor 统一分类（单一事实源），这里只做分流
            if (res.errorKind === 'deterministic') {
              deterministicNotices.push(`${label}: ${describeDeterministicError(msg) || msg}`);
            } else {
              transientFailures.push(`${label}: ${msg}`);
            }
          };
          collectFailure(prsRes, 'PR 获取失败');
          collectFailure(issuesRes, 'Issue 获取失败');
          collectFailure(runsRes, 'Actions 获取失败');

          if (transientFailures.length > 0) {
            const failureReason = transientFailures.join('；');
            // 若此前内存有缓存，保全已有缓存内容，附加 networkError 与 partialFailure。
            // repo 必须用本次新鲜解析值覆盖：列表数据旧一点可以接受，仓库身份旧了就是错的
            // （典型场景：用户把 origin 从上游换成自己的 fork 后，issue list 永久失败，
            //  失败分支从不写缓存，旧身份被 freeze 在 fallback 里永远出不来）。
            const fallbackCached = cacheMap.getFallback(cwd) || cacheMap.get(cwd, now);
            if (fallbackCached && (fallbackCached.pullRequests.length > 0 || fallbackCached.issues.length > 0 || fallbackCached.runs.length > 0)) {
              sendJson(res, 200, {
                ok: true,
                fromCache: true,
                partialFailure: true,
                error: failureReason,
                data: {
                  ...fallbackCached,
                  repo: repo || fallbackCached.repo,
                  networkError: true,
                  networkErrorReason: failureReason,
                  auth: { ...fallbackCached.auth, networkError: true, networkErrorReason: failureReason },
                },
                cwd,
              });
              return;
            } else {
              const freshData: GitHubOverviewData = {
                auth: { ...auth, networkError: true, networkErrorReason: failureReason },
                repo: repo || undefined,
                pullRequests: [],
                issues: [],
                issueStats: { total: 0, reported: 0, assigned: 0, created: 0 },
                runs: [],
                networkError: true,
                networkErrorReason: failureReason,
                lastUpdated: new Date().toISOString(),
                updateInfo: checker.getQuickStatus(),
              };
              sendJson(res, 200, { ok: true, partialFailure: true, error: failureReason, data: freshData, cwd });
              return;
            }
          }

          if (prsRes.ok && Array.isArray(prsRes.data)) pullRequests = prsRes.data;
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
          if (runsRes.ok && Array.isArray(runsRes.data)) runs = runsRes.data;

          // 面板信息增强（三路并行，全部失败静默——可选装饰信息不阻塞主流程）：
          // 1. git 本地状态：纯本地毫秒级（remote-tracking 快照），零网络
          // 2. Release 锚定：gh release view，无 Release 仓库是常态非错误
          // 3. 当前分支↔PR 关联：pr status -c，无 PR 分支同样静默
          const [gitStatus, releaseInfo, branchPr] = await Promise.all([
            executor.getLocalGitStatus(cwd).catch(() => null),
            executor.run<any>(
              ['release', 'view', '--json', 'tagName,isPrerelease,isDraft,publishedAt,url', '-R', repo.nameWithOwner],
              { cwd, timeoutMs: 8_000 }
            ).then((r) => (r.ok && r.data && !r.data.isDraft ? r.data : null)).catch(() => null),
            executor.run<any>(
              ['pr', 'status', '-c', '--json', 'number,title,state,url,isDraft', '-R', repo.nameWithOwner],
              { cwd, timeoutMs: 8_000 }
            ).then((r) => {
              // 实测键集：{ createdBy: [...], needsReview: [...] }——「当前分支
              // 关联 PR」按优先级取 createdBy（自己发起）→ needsReview（待审）。
              // 不传 rawText：executor 对含 --json 的命令自动解析出 data——
              // rawText 模式 data 恒 undefined 会让本功能静默失效（审查抓到的真实 Bug）
              if (!r.ok || !r.data) return null;
              const createdBy = Array.isArray(r.data?.createdBy) ? r.data.createdBy : [];
              const needsReview = Array.isArray(r.data?.needsReview) ? r.data.needsReview : [];
              return createdBy[0] || needsReview[0] || null;
            }).catch(() => null),
          ]);
          (freshExtras as any).gitStatus = gitStatus;
          (freshExtras as any).releaseInfo = releaseInfo;
          (freshExtras as any).branchPr = branchPr;
          // 4. git 提交记录三段（领先/落后/最近）：依赖 gitStatus.hasUpstream 守卫，
          // 在并行波次之后串行补（本地毫秒级，无感知延迟）——放进第一波会因
          // Promise.all 参数在调用时求值而引用未解构的 gitStatus（恒 undefined）
          (freshExtras as any).commitLog = await executor
            .getGitCommitLog(cwd, gitStatus ? gitStatus.hasUpstream : false)
            .catch(() => null);
          // 5. 分支列表（纯本地毫秒级）：供右侧栏分支选择器 0ms 秒开，消除独立请求延迟与 404 风险
          (freshExtras as any).branches = await executor.getGitBranches(cwd).catch(() => null);
        }

        const issueStats = calculateIssueStats(issues);

        const freshData: GitHubOverviewData = {
          auth,
          repo: repo || undefined,
          pullRequests,
          issues,
          issueStats,
          runs,
          lastUpdated: new Date().toISOString(),
          updateInfo: checker.getQuickStatus(),
          // 确定性降级说明随数据一起落缓存：它是仓库的稳定属性（Issues 关着就一直关着），
          // 每次请求重新声明没有意义，也不该让它冒泡成 networkError。
          ...(deterministicNotices.length > 0 ? { notices: deterministicNotices } : {}),
          ...freshExtras,
        };

        cacheMap.set(cwd, freshData, now, remoteFingerprint);

        sendJson(res, 200, { ok: true, data: freshData, fromCache: false, cwd });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err.message || '获取 GitHub 概览失败' });
      }
    },
  });

  // 2. 获取全局视角的驾驶舱概览数据 (不绑定单一项目)
  bindRoute({
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
        sendJson(res, 200, {
          ok: true,
          data: { ...cachedGlobal, updateInfo: checker.getQuickStatus() },
          fromCache: true,
        });
        return;
      }

      try {
        const auth = await executor.checkAuth();
        let userRepos: UserRepoItem[] = [];
        let myPrs: any[] = [];
        let myIssues: GlobalIssueItem[] = [];
        let issueStats: IssueStats = { total: 0, reported: 0, assigned: 0, created: 0 };
        let workspaceMatrix: WorkspaceMatrixItem[] = [];
        let workspaceError: string | undefined;
        // 全局驾驶舱的确定性降级说明（同单仓库口径：在分支内累积、块外落缓存）
        const globalNotices: string[] = [];

        if (auth.loggedIn) {
          // 并发执行：1. 账号下仓库列表 2. 个人 PRs 3. 三维 Issue 检索（名下仓库用户提单 + 指派待办 + 我创建的）
          // 为什么三路并发搜索：
          // - --owner=@me: 捕获用户/访客在当前用户所有仓库下提的 Issue (如反馈 Bug、Feature Request)，解决外部提单看不见的问题
          // - --assignee=@me: 捕获团队成员或自己指派给当前账号的待办任务 (含跨组织/第三方项目)
          // - --author=@me: 捕获当前账号亲自发起的任务与向外部提起的议题
          // 3 个轻量进程与 repo/prs 同步 spawn，经 OS 并发调度实测仅耗时 3 秒出头，完全满足 8 秒超时门限。
          const issueFields = 'number,title,repository,author,assignees,labels,url,updatedAt';
          const queryResults = await Promise.allSettled([
            executor.run<any[]>(
              ['repo', 'list', '--limit', '20', '--json', 'name,nameWithOwner,description,defaultBranchRef,isPrivate,stargazerCount,updatedAt,url'],
              { timeoutMs: 8_000 }
            ),
            executor.run<any[]>(
              ['search', 'prs', '--author=@me', '--state=open', '--limit', '10', '--json', 'number,title,repository,url,updatedAt,isDraft'],
              { timeoutMs: 8_000 }
            ),
            executor.run<any[]>(
              ['search', 'issues', '--owner=@me', '--state=open', '--sort=updated', '--limit', '15', '--json', issueFields],
              { timeoutMs: 8_000 }
            ),
            executor.run<any[]>(
              ['search', 'issues', '--assignee=@me', '--state=open', '--sort=updated', '--limit', '15', '--json', issueFields],
              { timeoutMs: 8_000 }
            ),
            executor.run<any[]>(
              ['search', 'issues', '--author=@me', '--state=open', '--sort=updated', '--limit', '15', '--json', issueFields],
              { timeoutMs: 8_000 }
            ),
          ]);

          const reposRes = queryResults[0].status === 'fulfilled' ? queryResults[0].value : { ok: false };
          const prsRes = queryResults[1].status === 'fulfilled' ? queryResults[1].value : { ok: false };
          const ownerIssuesRes = queryResults[2].status === 'fulfilled' ? queryResults[2].value : { ok: false };
          const assignedIssuesRes = queryResults[3].status === 'fulfilled' ? queryResults[3].value : { ok: false };
          const authorIssuesRes = queryResults[4].status === 'fulfilled' ? queryResults[4].value : { ok: false };

          // 检测全局拉取是否发生网络故障，绝不把网络失败当作「0 仓库、0 PR」伪造成功。
          // 与单仓库概览同一口径：确定性失败（账号级搜索本就不存在确定性场景，
          // 但仓库列表拉取可能命中 404/403）不进入网络故障分支，只作为 notice 透出。
          const globalFailures: string[] = [];
          const collectGlobalFailure = (res: { ok: boolean; error?: string; errorKind?: string }, label: string) => {
            if (res.ok) return;
            const msg = res.error || '接口异常';
            if (res.errorKind === 'deterministic') {
              globalNotices.push(`${label}: ${describeDeterministicError(msg) || msg}`);
            } else {
              globalFailures.push(`${label}: ${msg}`);
            }
          };
          collectGlobalFailure(reposRes as any, '仓库列表拉取失败');
          collectGlobalFailure(prsRes as any, '个人 PR 拉取失败');

          if (globalFailures.length > 0) {
            const globalNetReason = globalFailures.join('；');
            const fallbackGlobal = globalCache.getFallback('global') || globalCache.get('global', now);
            if (fallbackGlobal) {
              sendJson(res, 200, {
                ok: true,
                fromCache: true,
                partialFailure: true,
                error: globalNetReason,
                data: {
                  ...fallbackGlobal,
                  networkError: true,
                  networkErrorReason: globalNetReason,
                  auth: { ...fallbackGlobal.auth, networkError: true, networkErrorReason: globalNetReason },
                },
              });
              return;
            }
          }

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

          // 多源 Issues 聚合、按 URL 唯一去重并排序
          const issueMap = new Map<string, any>();
          const collectIssues = (res: any) => {
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
              assignees: Array.isArray(raw.assignees) ? raw.assignees.map((a: any) => ({ login: a.login })) : [],
              labels: Array.isArray(raw.labels) ? raw.labels.map((l: any) => ({ name: l.name, color: l.color })) : [],
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
            // git 状态与身份识别同为纯本地探测（remote-tracking 快照零网络），
            // 挂进同一 mapLimit 有界并发——不新增并发维度，不碰性能红线
            const gitStatus = hasGit ? await executor.getLocalGitStatus(ws.path).catch(() => null) : null;
            return {
              id: ws.id,
              title: ws.title || basenameSafe(ws.path),
              path: ws.path,
              hasGit,
              repo: hasGit ? executor.getRepoIdentityFromLocal(ws.path) || undefined : undefined,
              sessionCount: ws.sessionIds.length,
              ...(gitStatus ? { gitStatus } : {}),
            };
          });
        }

        const globalData: GlobalOverviewData = {
          auth,
          userRepos,
          workspaceMatrix,
          myPrs,
          myIssues,
          issueStats,
          lastUpdated: new Date().toISOString(),
          updateInfo: checker.getQuickStatus(),
          ...(workspaceError ? { workspaceError } : {}),
          ...(globalNotices.length > 0 ? { notices: globalNotices } : {}),
        };

        globalCache.set('global', globalData, now);
        sendJson(res, 200, { ok: true, data: globalData, fromCache: false });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err.message || '获取全局驾驶舱数据失败' });
      }
    },
  });

  // 3. 单条提交详情（Git 记录页点击行的惰性查询——弹窗打开时才发起，
  //    不进 overview 缓存：低频单查 + git show 本地毫秒级，无缓存必要）
  bindRoute({
    kind: 'exact',
    path: '/api/github/commit-detail',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      try {
        const url = new URL(req.url || '', 'http://127.0.0.1');
        let cwd = url.searchParams.get('cwd') || undefined;
        const sessionId = url.searchParams.get('sessionId');
        if (!cwd && sessionId) {
          cwd = findWorkspacePathBySession(sessionId) || undefined;
        }
        if (!cwd) {
          cwd = findMostRecentWorkspacePath() || undefined;
        }
        const sha = url.searchParams.get('sha') || '';
        // sha 形态校验双保险（executor 内还有一道）：路由层先拦明显恶意值
        if (!/^[0-9a-f]{4,40}$/i.test(sha)) {
          sendJson(res, 400, { ok: false, error: '非法 sha（仅接受 4-40 位十六进制）' });
          return;
        }
        const detail = await executor.getGitCommitDetail(cwd, sha);
        if (detail === null) {
          sendJson(res, 404, { ok: false, error: '未找到该提交（可能不在当前仓库）' });
          return;
        }
        sendJson(res, 200, { ok: true, detail });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err.message || '查询提交详情失败' });
      }
    },
  });

  // 4. 分页获取最近提交记录（Git 记录页下滑触底自动加载或点击加载更多）
  bindRoute({
    kind: 'exact',
    path: '/api/github/git-log',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      try {
        const url = new URL(req.url || '', 'http://127.0.0.1');
        let cwd = url.searchParams.get('cwd') || undefined;
        const sessionId = url.searchParams.get('sessionId');
        if (!cwd && sessionId) {
          cwd = findWorkspacePathBySession(sessionId) || undefined;
        }
        if (!cwd) {
          cwd = findMostRecentWorkspacePath() || undefined;
        }
        const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 15), 50);
        const skip = Math.max(0, Number(url.searchParams.get('skip')) || 0);
        const result = await executor.getGitRecentLog(cwd, limit, skip);
        sendJson(res, 200, { ok: true, data: result });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, error: err.message || '获取提交记录失败' });
      }
    },
  });
}
