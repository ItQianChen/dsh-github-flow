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

/**
 * 右侧栏单仓库 PR / Issue 的展示条数上限。
 *
 * 为什么从 10 提到 20：加上 `--state all` 后列表里混入了 closed/merged，
 * 而 `gh pr list` 的排序依据是 **number 降序**（实测 30 条验证：14763、14752、
 * 14751 …… 严格递减），不是 updatedAt。取 10 条时实测 cli/cli 只剩 5 条非 OPEN，
 * 用户切到「Merged」可能只有 2-3 条，筛选体验形同虚设。
 * 多拉 10 条的代价可忽略（同一个 gh 进程，仅 JSON 体积略增），
 * 但绝不能改成「每个状态各查一次」——那会把 3 个 gh 子进程变成 6~9 个，
 * 右侧栏首屏本就受 Promise.all 8 秒超时约束。
 */
/**
 * 列表默认每页条数。
 *
 * 为什么是 15 而不是 20：与右侧栏「Git 提交」「未提交变更」两个已有分页的默认页大小对齐，
 * 用户下滑即可继续加载（`prLimit/issueLimit/runLimit` 查询参数），所以首屏不必再靠
 * 「多拉一点」来换取筛选体验。20 条时代首屏 JSON 实测可达 28,608 字符，直接撞上
 * executor 的 24,000 字符输出上限 → 被截断 → JSON 解析被跳过 → 面板空列表且无报错。
 */
export const RIGHTBAR_LIST_LIMIT = 15;

/** 单页上限：防止一次请求把几万条拉进内存（gh 自身也没有更细的分页） */
const LIST_LIMIT_MAX = 100;

/**
 * 列表类查询的输出上限（字符）。
 *
 * 为什么不能沿用默认的 24,000：那个阈值是按「喂给模型上下文」调的。面板列表是
 * **程序化消费**——前端只渲染首屏，永不整段进模型上下文。用 24KB 截 15 条 PR 的结果是
 * 截断后 JSON 解析被跳过、`data` 变 undefined，表现为「这个仓库拉不到 PR」。
 * 与 pr diff / issue 详情放宽到 2MB 是同一个理由。
 */
const LIST_OUTPUT_CAP = 1_048_576;

/**
 * 解析分页参数：非法/缺失回落默认页大小，超过上限则截到上限。
 * 上限存在是因为面板可能被脚本按 `prLimit=999999` 调用。
 */
function parseListLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return RIGHTBAR_LIST_LIMIT;
  return Math.min(Math.floor(n), LIST_LIMIT_MAX);
}

/**
 * 缓存键：必须把三个分页参数算进去。
 * 只用 cwd 当键的话，「先加载 15 条」的缓存会喂给「请求 30 条」的那次刷新，
 * 表现是点了「加载更多」列表不变——而且因为命中的是缓存，连请求日志都没有。
 */
export function overviewCacheKey(cwd: string, prLimit: number, issueLimit: number, runLimit: number): string {
  return `${cwd}|${prLimit}|${issueLimit}|${runLimit}`;
}

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
        // 分页参数：默认 15，非法值回落默认，超过上限截断（见 parseListLimit）
        const prLimit = parseListLimit(url.searchParams.get('prLimit'));
        const issueLimit = parseListLimit(url.searchParams.get('issueLimit'));
        const runLimit = parseListLimit(url.searchParams.get('runLimit'));

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
        // 缓存键带上分页参数：否则「15 条」的缓存会喂给「请求 30 条」的刷新，
        // 表现为点了加载更多但列表不变（且连请求日志都没有，因为命中的是缓存）。
        const cacheKey = overviewCacheKey(cwd, prLimit, issueLimit, runLimit);
        // 指纹失效必须针对**同一个键**，否则「remote url 变了」永远作废不掉缓存条目
        cacheMap.invalidateIfFingerprintChanged(cacheKey, remoteFingerprint);
        const cachedData = cacheMap.get(cacheKey, now);
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
        if (repo) {
          // 推导当前工作区可用的关联仓库（如 origin/Fork 与 upstream/Parent），
          // 仅在存在多个关联仓库或 Fork 场景下供 UI 渲染手动切换控件。
          repo.associatedRepos = executor.getAssociatedRepos(cwd, repo, auth?.user);
        }

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
          cacheMap.set(cacheKey, emptyData, now, remoteFingerprint);
          sendJson(res, 200, { ok: true, data: emptyData, fromCache: false, cwd });
          return;
        }

        let pullRequests: PrItem[] = [];
        /** 仓库总量（GraphQL 统计；失败为 null，前端回落已加载条数） */
        let repoCounts: { prTotal?: number; prOpenTotal?: number; prMergedTotal?: number; prClosedTotal?: number; issueTotal?: number; issueOpenTotal?: number; issueClosedTotal?: number; runTotal?: number } | null = null;
        let issues: IssueItem[] = [];
        let runs: WorkflowRunItem[] = [];
        // 确定性降级说明（非错误）：在 if 块内累积、在块外随响应一起落缓存，
        // 因此必须在请求作用域声明，不能藏在分支里。
        const deterministicNotices: string[] = [];
        // 面板增强信息载体（git 状态/Release 锚定/分支 PR——全部可选字段，
        // 进缓存与快照时旧消费方零破坏，渲染层 ?. 兜底）
        const freshExtras: Record<string, any> = {};

        if (repo && auth.loggedIn) {
          /*
           * 并发拉取当前文件夹仓库的 PRs、Issues 和 Runs。
           *
           * 必须显式传 `--state all`：gh 的默认值是 open，不传就只剩未关闭记录。
           * 本仓库实测 `pr list` 默认返回 []、`--state all` 才返回 [#6 CLOSED]——
           * 右侧栏「只显示已打开」的根因就在这里，靠前端加筛选器救不回来，
           * 因为数据在到达浏览器前就被 gh 过滤掉了。
           * 与全局面板（gh search，phase29 已移除 --state=open）保持同一口径。
           */
          // 仓库标识（owner/name）。只接受该形态，避免把任意字符串拼进 GraphQL / REST 路径。
          const repoNwo = repo?.nameWithOwner || '';
          const repoNwoValid = /^[\w.-]+\/[\w.-]+$/.test(repoNwo);
          const [prsRes, issuesRes, runsRes, totalsRes, runsTotalRes] = await Promise.all([
            executor.run<PrItem[]>(
              [
                'pr', 'list', '--state', 'all',
                // 列表只渲染简要信息（编号、标题、分支、状态、合并冲突与 CI），无需拉取 author 等未消费对象
                '--json', 'number,title,state,headRefName,baseRefName,isDraft,mergeable,reviewDecision,statusCheckRollup,url,updatedAt',
                '-L', String(prLimit),
              ],
              { cwd, timeoutMs: 8_000, maxOutputChars: LIST_OUTPUT_CAP, maxOutputBytes: LIST_OUTPUT_CAP * 4 }
            ),
            executor.run<IssueItem[]>(
              [
                'issue', 'list', '--state', 'all',
                '--json', 'number,title,state,author,labels,assignees,url,updatedAt',
                '-L', String(issueLimit),
              ],
              { cwd, timeoutMs: 8_000, maxOutputChars: LIST_OUTPUT_CAP, maxOutputBytes: LIST_OUTPUT_CAP * 4 }
            ),
            executor.run<WorkflowRunItem[]>(
              ['run', 'list', '--json', 'databaseId,name,status,conclusion,event,headBranch,url,createdAt', '-L', String(runLimit)],
              { cwd, timeoutMs: 8_000, maxOutputChars: LIST_OUTPUT_CAP, maxOutputBytes: LIST_OUTPUT_CAP * 4 }
            ),
            /*
             * 总量统计（与列表分页彻底解耦）。
             *
             * 为什么必须单独查：列表是「按页拉」的，`pullRequests.length` 只是**已加载条数**，
             * 拿它当总数会在用户下滑时从 15 跳到 30、再跳到 45——看起来像总数在变，是明显的 bug。
             * 真正的总数只能靠 GitHub 的计数接口拿。
             *
             * 为什么用 GraphQL `search.issueCount` 而不是 `repository.pullRequests.totalCount`：
             * `Repository.issues` 在 GitHub 语义里**包含 PR**（共用 issue 空间），直接取会把 PR 算进 Issue；
             * `search` 加 `is:pr` / `is:issue` 限定符才能精确区分，且一次请求可以并发拿全 7 个口径。
             */
            (() => {
              const nwo = repoNwo;
              // 只接受 owner/name 形态，避免把任意字符串拼进 GraphQL 查询
              if (!repoNwoValid) return Promise.resolve({ ok: false } as any);
              const scope = `repo:${nwo}`;
              // GraphQL 字符串字面量必须用双引号；这里整段 query 作为**单个 argv 元素**传给
              // execFile（不经过 shell），所以双引号无需再转义，写了反斜杠反而会让 GitHub 解析失败。
              // 注意只产出「带引号的查询值」，`query:` 前缀由调用点写——否则会拼成 query:query:"..."
              const q = (extra: string) => `"${scope} ${extra}"`;
              const query =
                `query{` +
                `prAll:search(query:${q('is:pr')},type:ISSUE){issueCount}` +
                `prOpen:search(query:${q('is:pr is:open')},type:ISSUE){issueCount}` +
                `prMerged:search(query:${q('is:pr is:merged')},type:ISSUE){issueCount}` +
                `prClosed:search(query:${q('is:pr is:closed')},type:ISSUE){issueCount}` +
                `issAll:search(query:${q('is:issue')},type:ISSUE){issueCount}` +
                `issOpen:search(query:${q('is:issue is:open')},type:ISSUE){issueCount}` +
                `issClosed:search(query:${q('is:issue is:closed')},type:ISSUE){issueCount}` +
                `}`;
              return executor.run<any>(['api', 'graphql', '-f', `query=${query}`], { cwd, timeoutMs: 8_000 });
            })(),
            /*
             * Actions 运行总数。
             *
             * 为什么单独走 REST：GitHub GraphQL **没有** workflow runs 连接
             * （`Repository` 上不存在 `workflowRuns` 字段），拿不到 totalCount；
             * REST `GET /repos/{owner}/{repo}/actions/runs?per_page=1` 的响应体里带
             * `total_count`（实测该仓 1146），per_page=1 只为把响应压到最小。
             */
            (() => {
              if (!repoNwoValid) return Promise.resolve({ ok: false } as any);
              return executor.run<any>(['api', `repos/${repoNwo}/actions/runs?per_page=1`], {
                cwd,
                timeoutMs: 8_000,
              });
            })(),
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
          const collectFailure = (
            res: { ok: boolean; error?: string; errorKind?: string; truncated?: boolean },
            label: string
          ) => {
            if (res.ok) {
              // 截断不是成功。`executor.run` 在超限时会跳过 JSON.parse（data 变 undefined）
              // 但仍返回 ok:true —— 旧实现因此把它当「仓库没有 PR」，面板显示空列表且零报错。
              // 这条曾经让一个 579 个 PR 的仓库看起来「无法拉取 PR」，必须显式透出。
              if (res.truncated) {
                deterministicNotices.push(`${label}: 返回数据过大已被截断，请到 GitHub 查看完整列表`);
              }
              return;
            }
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
            const fallbackCached = cacheMap.getFallback(cacheKey) || cacheMap.get(cacheKey, now);
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

          /*
           * 解析「仓库总量」。
           *
           * 与列表分页彻底解耦：列表按页拉，`pullRequests.length` 只是已加载条数；
           * 总数来自 GraphQL `search.issueCount`（第 4 路）与 REST `actions/runs.total_count`（第 5 路）。
           * 任何解析失败都返回 null → 前端回落到「已加载条数」，绝不因计数失败影响列表本身。
           */
          repoCounts = (() => {
            const body = (totalsRes as any)?.ok ? (totalsRes as any).data : null;
            const root = body && typeof body === 'object' ? (body as any).data : null;
            if (!root || typeof root !== 'object') return null;
            const num = (key: string): number | undefined => {
              const v = (root as any)[key];
              return v && typeof v.issueCount === 'number' ? v.issueCount : undefined;
            };
            // Actions 总数来自 REST（GraphQL 没有 workflow runs 连接），响应体里是 total_count
            const runsBody = (runsTotalRes as any)?.ok ? (runsTotalRes as any).data : null;
            const runTotal =
              runsBody && typeof runsBody.total_count === 'number' ? runsBody.total_count : undefined;
            const prTotal = num('prAll');
            // PR/Issue 统计失败但 Actions 拿到时，仍要下发 runTotal（两者互相独立）
            if (prTotal === undefined) return runTotal === undefined ? null : ({ runTotal } as any);
            return {
              prTotal,
              prOpenTotal: num('prOpen'),
              prMergedTotal: num('prMerged'),
              prClosedTotal: num('prClosed'),
              issueTotal: num('issAll'),
              issueOpenTotal: num('issOpen'),
              issueClosedTotal: num('issClosed'),
              ...(runTotal !== undefined ? { runTotal } : {}),
            };
          })();
        }

        const issueStats = calculateIssueStats(issues);

        /*
         * 「还有没有更多」判定。
         *
         * 有真实总数时用精确比较（loaded < total）——这是「还有更多」的定义本身；
         * 拿不到总数才回落到「本次是否拉满」的启发式。
         *
         * 为什么必须精确：`>= prLimit` 在边界上会误报。例如 loaded=total 时，
         * `loaded >= prLimit` 仍为真，页脚一直显示，用户点下去却一条都拉不到。
         *
         * 为什么还要叠加 `!*Saturated`：`parseListLimit` 把请求夹在 LIST_LIMIT_MAX(100) 内。
         * 一旦客户端已经把 limit 顶到这个上限，再点「加载更多」只会拿到同样的 100 条
         * （limit 115 → 夹回 100），而 loaded(100) < total(323) 又恒成立 →
         * 页脚永远显示、永远点不动，这是比误报更糟的死循环。
         * 此时必须停止下发 truncated，由前端改显「已加载 X / 共 Y，更早记录请到 GitHub」。
         */
        const prLimitSaturated = prLimit >= LIST_LIMIT_MAX;
        const issueLimitSaturated = issueLimit >= LIST_LIMIT_MAX;
        const runLimitSaturated = runLimit >= LIST_LIMIT_MAX;

        const prsTruncated =
          !prLimitSaturated &&
          (repoCounts?.prTotal !== undefined ? pullRequests.length < repoCounts.prTotal : pullRequests.length >= prLimit);
        const issuesTruncated =
          !issueLimitSaturated &&
          (repoCounts?.issueTotal !== undefined ? issues.length < repoCounts.issueTotal : issues.length >= issueLimit);
        const runsTruncated =
          !runLimitSaturated &&
          (repoCounts?.runTotal !== undefined ? runs.length < repoCounts.runTotal : runs.length >= runLimit);

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
          // 仅在真的触顶时才下发，避免给正常场景增加无意义字段
          ...(prsTruncated ? { prsTruncated: true } : {}),
          ...(issuesTruncated ? { issuesTruncated: true } : {}),
          ...(runsTruncated ? { runsTruncated: true } : {}),
          // 仓库总量（与分页无关的真实总数）；查询失败时整组缺席，前端回落已加载条数
          ...(repoCounts || {}),
          ...freshExtras,
        };

        cacheMap.set(cacheKey, freshData, now, remoteFingerprint);

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
      // 全局面板同样支持分页：默认 15，与右侧栏以及 Git/未提交两条列表同口径。
      // 缓存键必须带分页参数，否则「15 条」的缓存会喂给「请求 30 条」的刷新。
      const url = new URL(req.url || '', 'http://127.0.0.1');
      const prLimit = parseListLimit(url.searchParams.get('prLimit'));
      const issueLimit = parseListLimit(url.searchParams.get('issueLimit'));
      const globalCacheKey = `global|${prLimit}|${issueLimit}`;
      const cachedGlobal = globalCache.get(globalCacheKey, now);
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
        /** 账号级总量（GraphQL 统计；失败为 null） */
        let accountCounts: { prTotal: number; prOpenTotal?: number; prMergedTotal?: number; prClosedTotal?: number } | null = null;
        let myIssues: GlobalIssueItem[] = [];
        let issueStats: IssueStats = { total: 0, reported: 0, assigned: 0, created: 0 };
        let workspaceMatrix: WorkspaceMatrixItem[] = [];
        let workspaceError: string | undefined;
        /** PR 检索是否触及 limit（命中即说明可能还有更早的 PR 未返回） */
        let prsTruncated = false;
        /** Issues 三路检索是否任一路触及 limit（去重合并后无法从长度反推） */
        let issuesTruncated = false;
        // 全局驾驶舱的确定性降级说明（同单仓库口径：在分支内累积、块外落缓存）
        const globalNotices: string[] = [];

        if (auth.loggedIn) {
          // 并发执行：1. 账号下仓库列表 2. 个人 PRs 3. 三维 Issue 检索（名下仓库用户提单 + 指派待办 + 我创建的）
          // 为什么三路并发搜索：
          // - --owner=@me: 捕获用户/访客在当前用户所有仓库下提的 Issue (如反馈 Bug、Feature Request)，解决外部提单看不见的问题
          // - --assignee=@me: 捕获团队成员或自己指派给当前账号的待办任务 (含跨组织/第三方项目)
          // - --author=@me: 捕获当前账号亲自发起的任务与向外部提起的议题
          // 3 个轻量进程与 repo/prs 同步 spawn，经 OS 并发调度实测仅耗时 3 秒出头，完全满足 8 秒超时门限。
          // 为什么不再限定 --state=open：
          // 实测当前账号 7 个 PR 全为 merged/closed、5 个 Issue 全为 closed，
          // `--state=open` 恒返回空数组（退出码仍为 0，属于"正确但无用"）。
          // 用户看到的就是一片空白，且无法区分「确实没有」与「请求失败」。
          // 改为拉全量并在前端做状态筛选：数据先可见，再谈收敛。
          // 同时 --json 必须补上 state 字段——不下发的话前端根本无从筛选。
          const issueFields = 'number,title,state,repository,author,assignees,labels,url,updatedAt';
          /**
           * PR 检索上限。提到常量是因为「命中 limit」这个事实要被下游用来判断截断，
           * 散落的字面量会让两处逻辑（查询与判断）出现漂移。
           */
          const queryResults = await Promise.allSettled([
            executor.run<any[]>(
              ['repo', 'list', '--limit', '20', '--json', 'name,nameWithOwner,description,defaultBranchRef,isPrivate,stargazerCount,updatedAt,url'],
              { timeoutMs: 8_000 }
            ),
            executor.run<any[]>(
              ['search', 'prs', '--author=@me', '--limit', String(prLimit), '--json', 'number,title,state,repository,url,updatedAt,isDraft'],
              { timeoutMs: 8_000 }
            ),
            executor.run<any[]>(
              ['search', 'issues', '--owner=@me', '--sort=updated', '--limit', String(issueLimit), '--json', issueFields],
              { timeoutMs: 8_000 }
            ),
            executor.run<any[]>(
              ['search', 'issues', '--assignee=@me', '--sort=updated', '--limit', String(issueLimit), '--json', issueFields],
              { timeoutMs: 8_000 }
            ),
            executor.run<any[]>(
              ['search', 'issues', '--author=@me', '--sort=updated', '--limit', String(issueLimit), '--json', issueFields],
              { timeoutMs: 8_000 }
            ),
            /*
             * 账号级 PR 总量（与列表分页解耦）。
             *
             * 为什么必须单独查：`myPrs.length` 只是已加载条数，拿它当总数会在下滑时不断变大。
             * PR 侧口径与列表完全一致（都是 `is:pr author:@me`），所以这个总数可以精确比较。
             *
             * 为什么**不**给 Issue 也配一个总数：列表是 owner/assignee/author 三路的并集，
             * 而唯一能给出不重复总数的查询是 `is:issue involves:@me`——它不含「我仓库里
             * 别人提的 issue」（实测差集确实存在，不是索引延迟）。拿它当总数会**小于**已加载条数，
             * 三路分别计数相加又会因重叠而虚高。既然拿不到正确口径，就不下发假总数，
             * 由前端老实显示「已加载 N」。
             */
            executor.run<any>(
              [
                'api', 'graphql', '-f',
                'query=' +
                  `query{` +
                  `prAll:search(query:"is:pr author:@me",type:ISSUE){issueCount}` +
                  `prOpen:search(query:"is:pr author:@me is:open",type:ISSUE){issueCount}` +
                  `prMerged:search(query:"is:pr author:@me is:merged",type:ISSUE){issueCount}` +
                  `prClosed:search(query:"is:pr author:@me is:closed",type:ISSUE){issueCount}` +
                  `}`,
              ],
              { timeoutMs: 10_000 }
            ),
          ]);

          const reposRes = queryResults[0].status === 'fulfilled' ? queryResults[0].value : { ok: false };
          const prsRes = queryResults[1].status === 'fulfilled' ? queryResults[1].value : { ok: false };
          const ownerIssuesRes = queryResults[2].status === 'fulfilled' ? queryResults[2].value : { ok: false };
          const assignedIssuesRes = queryResults[3].status === 'fulfilled' ? queryResults[3].value : { ok: false };
          const authorIssuesRes = queryResults[4].status === 'fulfilled' ? queryResults[4].value : { ok: false };
          const totalsRes = queryResults[5].status === 'fulfilled' ? queryResults[5].value : { ok: false };

          /*
           * 解析账号级总量。失败时返回 null → 前端回落「已加载条数」，
           * 绝不因计数失败影响列表本身。
           */
          accountCounts = (() => {
            const body = (totalsRes as any)?.ok ? (totalsRes as any).data : null;
            const root = body && typeof body === 'object' ? (body as any).data : null;
            if (!root || typeof root !== 'object') return null;
            const num = (key: string): number | undefined => {
              const v = (root as any)[key];
              return v && typeof v.issueCount === 'number' ? v.issueCount : undefined;
            };
            const prTotal = num('prAll');
            if (prTotal === undefined) return null;
            return {
              prTotal,
              prOpenTotal: num('prOpen'),
              prMergedTotal: num('prMerged'),
              prClosedTotal: num('prClosed'),
            };
          })();

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
            const fallbackGlobal = globalCache.getFallback(globalCacheKey) || globalCache.get(globalCacheKey, now);
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
            /*
             * PR「还有更多」判定。
             *
             * 优先用账号级真实总数做精确比较——`accountCounts.prTotal` 与列表查询
             * 是**同一个口径**（都是 `is:pr author:@me`），所以 `loaded < total` 就是定义。
             * 拿不到总数才回落到「本次是否拉满」的启发式。
             *
             * 为什么精确比较重要：`>= prLimit` 在边界会误报——用户点够次数后页脚一直显示
             * 「加载更多」，点下去却一条都拉不到。
             */
            prsTruncated =
              // 顶到单次上限后「再加载」不可能有新结果（parseListLimit 会把更大的 limit 夹回 100），
              // 必须停止下发 truncated，否则 loaded < total 恒成立 → 页脚永远显示、点不动
              prLimit < LIST_LIMIT_MAX &&
              (accountCounts?.prTotal !== undefined ? myPrs.length < accountCounts.prTotal : myPrs.length >= prLimit);
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

          /*
           * Issues 的「还有更多」判定：三路检索只要有一路拉满，就说明可能还有更早的记录。
           * 三路结果会被去重合并，所以不能拿 myIssues.length 反推（去重后天然变小）。
           *
           * 这里**故意不用** accountCounts.issueTotal 做精确比较：那个总数用的是
           * `is:issue involves:@me`（author/assignee/mention/commenter 的超集），
           * 而列表是三路（owner/assignee/author）的并集，前者恒 ≥ 后者。
           * 拿它比较会得到 `loaded < total` 永远成立 → 页脚永远显示、点了却拉不到东西。
           */
          for (const r of [ownerIssuesRes, assignedIssuesRes, authorIssuesRes]) {
            // 已顶到单次上限时不再喊「还有更多」：再点也只会拿到同样的数据（死循环）
            if (issueLimit >= LIST_LIMIT_MAX) break;
            if (r.ok && Array.isArray(r.data) && r.data.length >= issueLimit) {
              issuesTruncated = true;
              break;
            }
          }

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
          // 仅在真的触顶时才下发，避免给正常场景增加无意义字段
          ...(prsTruncated ? { prsTruncated: true } : {}),
          ...(issuesTruncated ? { issuesTruncated: true } : {}),
          // 账号级总量（与分页无关）；计数查询失败时整组缺席，前端回落已加载条数
          ...(accountCounts || {}),
          ...(globalNotices.length > 0 ? { notices: globalNotices } : {}),
        };

        globalCache.set(globalCacheKey, globalData, now);
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
