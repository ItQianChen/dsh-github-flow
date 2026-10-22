// test/phase40-pagination.test.mjs
//
// 列表分页（15 条/页 + 下滑加载更多）与「截断不再静默」的契约测试。
//
// 为什么必须独立成阶段：这两件事的失败模式都是**静默**的——
// · 分页参数没接上：列表永远只有 15 条，用户以为仓库就这么多；
// · 截断被当成成功：`executor.run` 超限时跳过 JSON.parse，返回 ok:true + data:undefined，
//   路由把它当「仓库没有 PR」，面板显示空列表且零报错。
// 后者是真实事故：一个 579 PR 的仓库，`pr list` 全字段 -L20 = 28,608 字符，
// 撞上 24,000 的默认输出上限后，面板显示「该仓库暂无 PR」。
//
// 覆盖：
//   1. 默认页大小 = 15，与服务端解析函数一致
//   2. parseListLimit 的边界（缺省 / 非法 / 超限 / 小数）
//   3. 缓存键必须带分页参数（否则「加载更多」会命中旧缓存，列表不变）
//   4. 路由把 prLimit/issueLimit/runLimit 落到 argv
//   5. 截断 → 确定性 notice（不再静默空列表）
//   6. 全局路由同样支持 prLimit/issueLimit
//   7. 客户端 bundle 里三个 Tab 与主面板都有加载更多入口

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const lib = (p) => `file://${path.join(ROOT, p).replace(/\\/g, '/')}`;

let passed = 0;
let failed = 0;
function ok(cond, name, extra) {
  if (cond) {
    passed++;
    console.log(`✅ PASS: ${name}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${name}${extra ? '  → ' + extra : ''}`);
  }
}

const { registerOverviewRoutes, overviewCacheKey, RIGHTBAR_LIST_LIMIT } = await import(
  lib('lib/api/routes-overview.js')
);
const { TtlCache } = await import(lib('lib/cache.js'));
const { GhExecutor } = await import(lib('lib/executor.js'));

console.log('\n--- 1. 默认页大小 ---');
ok(RIGHTBAR_LIST_LIMIT === 15, '默认每页 15 条（与 Git 提交 / 未提交变更两个分页同口径）', String(RIGHTBAR_LIST_LIMIT));

console.log('\n--- 2. 缓存键必须区分分页参数 ---');
const k15 = overviewCacheKey('/repo', 15, 15, 15);
const k30 = overviewCacheKey('/repo', 30, 15, 15);
ok(k15 !== k30, '不同 prLimit 得到不同缓存键（否则加载更多会命中旧缓存）', `${k15} vs ${k30}`);
ok(k15 === overviewCacheKey('/repo', 15, 15, 15), '同参数得到稳定键');

/** 起一个只记录 argv 的 route 实例 */
function mount(options = {}) {
  const recorded = [];
  const executor = new GhExecutor();
  // 必须直接桩掉认证与仓库解析：否则 mock 的 run 返回空 data，
  // checkAuth 判为未登录 / getRepoMetadata 判为无仓库，路由会直接跳过三条列表查询。
  executor.checkAuth = async () => ({ installed: true, loggedIn: true, user: 'testuser' });
  executor.getRepoMetadata = async () => ({
    nameWithOwner: 'o/r', name: 'r', owner: 'o', defaultBranch: 'main', isPrivate: false, url: 'https://github.com/o/r',
  });
  executor.run = async (args) => {
    recorded.push([...args]);
    if (options.failPr && args.includes('pr') && args.includes('list')) {
      return { ok: false, error: '模拟超时', errorKind: 'transient' };
    }
    if (options.truncatePr && args.includes('pr') && args.includes('list')) {
      return { ok: true, truncated: true, rawOutput: '[]', data: undefined };
    }
    return { ok: true, data: [], rawOutput: '[]' };
  };
  const cache = new TtlCache(100000);
  const registered = {};
  registerOverviewRoutes({ bindRoute: (r) => (registered[r.path] = r.handler) }, executor, cache, new TtlCache(100000), {
    getQuickStatus: () => null,
  });
  return { recorded, registered, cache };
}

async function call(handler, url) {
  let payload = null;
  await handler({ method: 'GET', url }, { setHeader() {}, end: (s) => (payload = JSON.parse(s)) });
  return payload;
}

console.log('\n--- 3. 单仓库路由：三个 limit 落到 argv ---');
{
  const { recorded, registered } = mount();
  const cwd = encodeURIComponent(ROOT);
  await call(registered['/api/github/overview'], `/api/github/overview?force=true&cwd=${cwd}&prLimit=30&issueLimit=20&runLimit=25`);

  ok(
    recorded.some((a) => a[0] === 'pr' && a[1] === 'list' && a[a.indexOf('-L') + 1] === '30'),
    'pr list 使用 prLimit=30',
    JSON.stringify(recorded.filter((a) => a[0] === 'pr'))
  );
  ok(
    recorded.some((a) => a[0] === 'issue' && a[1] === 'list' && a[a.indexOf('-L') + 1] === '20'),
    'issue list 使用 issueLimit=20'
  );
  ok(
    recorded.some((a) => a[0] === 'run' && a[1] === 'list' && a[a.indexOf('-L') + 1] === '25'),
    'run list 使用 runLimit=25'
  );
  ok(recorded.some((a) => a[0] === 'pr' && a[1] === 'list'), 'pr list 确实被调用');
}
{
  // 缺省不传参数 → 三个都用 15
  const { recorded, registered } = mount();
  await call(registered['/api/github/overview'], `/api/github/overview?force=true&cwd=${encodeURIComponent(ROOT)}`);
  const limits = recorded.filter((a) => a.includes('-L')).map((a) => a[a.indexOf('-L') + 1]);
  ok(limits.includes('15'), '缺省时使用 15 条/页', JSON.stringify(limits));
}
{
  // 非法值（负数 / 非数字）回落默认；超限截到 100
  const { recorded, registered } = mount();
  await call(registered['/api/github/overview'], `/api/github/overview?force=true&cwd=${encodeURIComponent(ROOT)}&prLimit=abc`);
  ok(recorded.some((a) => a[0] === 'pr' && a[a.indexOf('-L') + 1] === '15'), '非法 prLimit 回落 15');
  const { recorded: rec2, registered: reg2 } = mount();
  await call(reg2['/api/github/overview'], `/api/github/overview?force=true&cwd=${encodeURIComponent(ROOT)}&prLimit=99999`);
  ok(rec2.some((a) => a[0] === 'pr' && a[a.indexOf('-L') + 1] === '100'), '超限 prLimit 截到 100');
}

console.log('\n--- 4. 截断不得当成成功（历史事故的回归网）---');
{
  const { registered } = mount({ truncatePr: true });
  const payload = await call(
    registered['/api/github/overview'],
    `/api/github/overview?force=true&cwd=${encodeURIComponent(ROOT)}`
  );
  const notices = payload?.data?.notices || [];
  ok(
    notices.some((n) => String(n).includes('截断')),
    'PR 数据被截断时下发确定性 notice（不再静默空列表）',
    JSON.stringify(notices)
  );
  ok(!payload?.data?.networkError, '截断不误报成网络故障');
  ok(Array.isArray(payload?.data?.pullRequests), '截断时 pullRequests 仍是数组（前端不会崩）');
}

console.log('\n--- 5. 触顶标记基于本次分页参数 ---');
{
  // 让 pr list 返回恰好 15 条 → prsTruncated 必须为 true（说明可能还有更多）
  const executor = new GhExecutor();
  executor.checkAuth = async () => ({ installed: true, loggedIn: true, user: 'testuser' });
  executor.getRepoMetadata = async () => ({ nameWithOwner: 'o/r', name: 'r', owner: 'o', defaultBranch: 'main', isPrivate: false, url: '' });
  executor.run = async (args) => {
    if (args.includes('pr') && args.includes('list')) {
      return { ok: true, data: Array.from({ length: 15 }, (_, i) => ({ number: i + 1, title: 'x', state: 'OPEN' })) };
    }
    return { ok: true, data: [] };
  };
  const registered = {};
  registerOverviewRoutes(
    { bindRoute: (r) => (registered[r.path] = r.handler) },
    executor,
    new TtlCache(100000),
    new TtlCache(100000),
    { getQuickStatus: () => null }
  );
  const payload = await call(
    registered['/api/github/overview'],
    `/api/github/overview?force=true&cwd=${encodeURIComponent(ROOT)}&prLimit=15`
  );
  ok(payload?.data?.prsTruncated === true, '拉满 15 条时 prsTruncated=true（前端据此显示加载更多）');
  ok(payload?.data?.runsTruncated === undefined, '未拉满的列表不下发 truncated 标记');
}

console.log('\n--- 6. 全局路由同样分页 ---');
{
  const recorded = [];
  const executor = new GhExecutor();
  // 必须直接桩掉认证与仓库解析：否则 mock 的 run 返回空 data，
  // checkAuth 判为未登录 / getRepoMetadata 判为无仓库，路由会直接跳过三条列表查询。
  executor.checkAuth = async () => ({ installed: true, loggedIn: true, user: 'testuser' });
  executor.getRepoMetadata = async () => ({
    nameWithOwner: 'o/r', name: 'r', owner: 'o', defaultBranch: 'main', isPrivate: false, url: 'https://github.com/o/r',
  });
  executor.run = async (args) => {
    recorded.push([...args]);
    return { ok: true, data: [] };
  };
  const registered = {};
  registerOverviewRoutes(
    { bindRoute: (r) => (registered[r.path] = r.handler) },
    executor,
    new TtlCache(100000),
    new TtlCache(100000),
    { getQuickStatus: () => null }
  );
  await call(registered['/api/github/global-overview'], '/api/github/global-overview?prLimit=40&issueLimit=35');
  const searchPr = recorded.find((a) => a[0] === 'search' && a[1] === 'prs');
  const searchIssues = recorded.filter((a) => a[0] === 'search' && a[1] === 'issues');
  ok(searchPr && searchPr[searchPr.indexOf('--limit') + 1] === '40', '全局 PR 检索使用 prLimit=40', JSON.stringify(searchPr));
  ok(
    searchIssues.length === 3 && searchIssues.every((a) => a[a.indexOf('--limit') + 1] === '35'),
    '全局三路 Issue 检索都使用 issueLimit=35',
    JSON.stringify(searchIssues.map((a) => a[a.indexOf('--limit') + 1]))
  );
}

console.log('\n--- 7. 客户端：三个 Tab + 主面板都有加载更多入口 ---');
{
  const bundle = fs.readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
  const clientSrc = fs.readFileSync(path.join(ROOT, 'src/client.ts'), 'utf8');

  ok(bundle.includes('renderListMore'), '右侧栏存在列表加载更多渲染器');
  ok(/下滑或点击加载更多/.test(bundle), '页脚文案存在（下滑或点击）');
  ok(/prLimit=/.test(bundle) && /issueLimit=/.test(bundle) && /runLimit=/.test(bundle), '右侧栏请求带上三个独立分页参数');
  ok(/tabLimitsRef/.test(clientSrc), '使用 tabLimitsRef 独立维护各 Tab 游标（避免跨 Tab 并发膨胀）');
  ok(/prLimit=/.test(bundle) && /global-overview/.test(bundle), '主面板请求也带分页参数');
  ok(/loadMoreTabList/.test(bundle), '按 Tab 独立的加载更多回调已接线');

  // 三个 Tab 各自渲染页脚，且必须严格嵌套在各自的 data-tab-page 页面容器内部（防止泄漏到 Git 记录上方）
  ok(/renderListMore\("prs"/.test(bundle), 'PR Tab 有页脚');
  ok(/renderListMore\("issues"/.test(bundle), 'Issues Tab 有页脚');
  ok(/renderListMore\("runs"/.test(bundle), 'Runs Tab 有页脚');
  ok(/data-tab-page":\s*"prs"[\s\S]*?renderListMore\("prs"/.test(clientSrc), 'PR 加载更多严格嵌套在 prs 专属页面容器内部');
  ok(/data-tab-page":\s*"issues"[\s\S]*?renderListMore\("issues"/.test(clientSrc), 'Issue 加载更多严格嵌套在 issues 专属页面容器内部');
  ok(/data-tab-page":\s*"runs"[\s\S]*?renderListMore\("runs"/.test(clientSrc), 'Runs 加载更多严格嵌套在 runs 专属页面容器内部');

  // 滚动触底与鼠标滚轮事件监听器完整接入 prs / issues / runs
  ok(/activeTab === "prs" && data\?\.prsTruncated/.test(clientSrc), 'onScroll/onWheel 监听 PR 列表触底加载');
  ok(/activeTab === "issues" && data\?\.issuesTruncated/.test(clientSrc), 'onScroll/onWheel 监听 Issues 列表触底加载');
  ok(/activeTab === "runs" && data\?\.runsTruncated/.test(clientSrc), 'onScroll/onWheel 监听 Actions 列表触底加载');

  // 主面板两处（PR / Issue）
  ok((bundle.match(/下滑或点击加载更多 PR/g) || []).length >= 1, '主面板 PR 列表有页脚');
  ok((bundle.match(/下滑或点击加载更多 Issue/g) || []).length >= 1, '主面板 Issue 列表有页脚');
  // 旧的高危提示文案不应再出现在「只能到此为止」的位置
  ok(!/已触及检索上限）？。更早的记录请到 GitHub 查看/.test(bundle), '旧的「已触及上限，请到 GitHub 查看」文案已被加载更多取代');
}

console.log('\n--- 8. 执行引擎 maxOutputBytes 联动推导（防止大仓 100 条 PR 被 96KB 误截断）---');
{
  const ex = new GhExecutor();
  // 借用 node 可执行文件直接模拟输出 150KB 纯文本（超过默认的 96KB 字节上限）
  ex.ghPath = process.execPath;
  const res = await ex.run(['-e', 'console.log("X".repeat(150000))'], {
    rawText: true,
    maxOutputChars: 1_048_576,
    // 故意不传 maxOutputBytes，验证其能否随 maxOutputChars 自动联动拓展到 4MB
  });
  ok(res.ok === true, '子进程正常执行完成');
  ok(res.truncated === false, '未传 maxOutputBytes 时自动随 maxOutputChars 联动放大，150KB 输出不被误截断', `实际 truncated=${res.truncated}`);
  ok(res.rawOutput.length === 150000, '完整接收 150KB 数据无截断', `实际长度=${res.rawOutput.length}`);
}

console.log('\n--- 9. PR/Issue 总数必须与分页解耦（下滑不得改变总数）---');
// 为什么必须有这一节：列表是按页拉的，`pullRequests.length` 只是「已加载条数」。
// 早期实现直接拿它当总数，用户每下滑一次 Tab 上的数字就从 15 → 30 → 45，
// 看起来像仓库总数在变——这是用户实测报出来的 bug。
// 正确做法：单独用 GraphQL `search.issueCount` 拿真实总数，与列表分页完全无关。
{
  const recorded = [];
  const executor = new GhExecutor();
  executor.checkAuth = async () => ({ installed: true, loggedIn: true, user: 'testuser' });
  executor.getRepoMetadata = async () => ({
    nameWithOwner: 'o/r', name: 'r', owner: 'o', defaultBranch: 'main', isPrivate: false, url: '',
  });
  executor.run = async (args) => {
    recorded.push([...args]);
    if (args[0] === 'api' && args[1] === 'graphql') {
      return {
        ok: true,
        data: {
          data: {
            prAll: { issueCount: 579 }, prOpen: { issueCount: 12 }, prMerged: { issueCount: 400 }, prClosed: { issueCount: 500 },
            issAll: { issueCount: 261 }, issOpen: { issueCount: 12 }, issClosed: { issueCount: 249 },
          },
        },
      };
    }
    if (args[0] === 'pr' && args[1] === 'list') {
      return { ok: true, data: Array.from({ length: 15 }, (_, i) => ({ number: i + 1, title: 'x', state: 'OPEN' })) };
    }
    // Actions 总数走 REST（GraphQL 没有 workflow runs 连接），响应体带 total_count
    if (args[0] === 'api' && typeof args[1] === 'string' && args[1].includes('/actions/runs')) {
      return { ok: true, data: { total_count: 1146, workflow_runs: [] } };
    }
    return { ok: true, data: [] };
  };
  const registered = {};
  registerOverviewRoutes(
    { bindRoute: (r) => (registered[r.path] = r.handler) },
    executor, new TtlCache(100000), new TtlCache(100000), { getQuickStatus: () => null }
  );
  const payload = await call(
    registered['/api/github/overview'],
    `/api/github/overview?force=true&cwd=${encodeURIComponent(ROOT)}&prLimit=15&issueLimit=15&runLimit=15`
  );
  const d = payload?.data || {};
  ok(d.prTotal === 579, 'PR 总数来自 GraphQL 统计（不是已加载条数）', String(d.prTotal));
  ok(d.issueTotal === 261, 'Issue 总数来自 GraphQL 统计', String(d.issueTotal));
  ok(d.prOpenTotal === 12 && d.prMergedTotal === 400 && d.prClosedTotal === 500, 'PR 分状态总数全部下发');
  ok(d.issueOpenTotal === 12 && d.issueClosedTotal === 249, 'Issue 分状态总数全部下发');
  // Actions 总数：GraphQL 无 workflow runs 连接，必须走 REST 的 total_count
  ok(d.runTotal === 1146, 'Actions 总数来自 REST actions/runs 的 total_count', String(d.runTotal));
  const runsApi = recorded.find((a) => a[0] === 'api' && typeof a[1] === 'string' && a[1].includes('/actions/runs'));
  ok(Boolean(runsApi), '确实发起了 Actions 总数 REST 查询');
  ok(runsApi && runsApi[1].includes('per_page=1'), 'Actions 总数查询用 per_page=1 压响应体');
  ok(d.pullRequests.length === 15, '列表本身仍是分页的 15 条');
  ok(d.prTotal !== d.pullRequests.length, '总数与已加载条数彻底解耦（下滑不会改总数）');
  ok(d.runTotal !== (d.runs || []).length, 'Actions 总数同样与已加载条数解耦');

  const gql = recorded.find((a) => a[0] === 'api' && a[1] === 'graphql');
  ok(Boolean(gql), '确实发起了 GraphQL 统计请求');
  const gqlArg = (gql || []).join(' ');
  // 曾经的真实缺陷：把 `query:` 前缀重复拼进 search() 参数，GitHub 直接报
  // "Expected NAME, actual: COLON"，整个统计静默失效。
  ok(!/query:query:/.test(gqlArg), 'GraphQL 查询没有拼出重复的 query: 前缀');
  ok(/search\(query:"repo:o\/r is:pr"/.test(gqlArg), 'PR 总数用 is:pr 限定符（避免把 Issue 算进来）');
  ok(/search\(query:"repo:o\/r is:issue"/.test(gqlArg), 'Issue 总数用 is:issue 限定符（避免把 PR 算进来）');
}

console.log('\n--- 10. 统计失败时必须优雅降级（回落已加载条数，不影响列表）---');
{
  const executor = new GhExecutor();
  executor.checkAuth = async () => ({ installed: true, loggedIn: true, user: 'testuser' });
  executor.getRepoMetadata = async () => ({ nameWithOwner: 'o/r', name: 'r', owner: 'o', defaultBranch: 'main', isPrivate: false, url: '' });
  executor.run = async (args) => {
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: false, error: 'graphql down', errorKind: 'transient' };
    if (args[0] === 'pr' && args[1] === 'list') return { ok: true, data: Array.from({ length: 15 }, (_, i) => ({ number: i + 1, title: 'x', state: 'OPEN' })) };
    return { ok: true, data: [] };
  };
  const registered = {};
  registerOverviewRoutes(
    { bindRoute: (r) => (registered[r.path] = r.handler) },
    executor, new TtlCache(100000), new TtlCache(100000), { getQuickStatus: () => null }
  );
  const payload = await call(
    registered['/api/github/overview'],
    `/api/github/overview?force=true&cwd=${encodeURIComponent(ROOT)}&prLimit=15`
  );
  ok(payload?.data?.prTotal === undefined, '统计失败时不下发 prTotal（前端回落已加载条数）');
  ok(payload?.data?.pullRequests?.length === 15, '统计失败不影响列表本身');
}

console.log('\n--- 11. 客户端必须用总数渲染计数（不能再用已加载条数）---');
{
  const clientSrc = fs.readFileSync(path.join(ROOT, 'src/client.ts'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(ROOT, 'src/ui/workspace-panel.ts'), 'utf8');
  ok(/prTotalCount/.test(clientSrc) && /data\?\.prTotal/.test(clientSrc), '右侧栏计数取 prTotal');
  ok(/issueTotalCount/.test(clientSrc) && /data\?\.issueTotal/.test(clientSrc), '右侧栏 Issue 计数取 issueTotal');
  ok(!/count: prs\.length/.test(clientSrc), 'Tab 上的 PR 计数不再直接用已加载条数');
  ok(!/count: issues\.length/.test(clientSrc), 'Tab 上的 Issue 计数不再直接用已加载条数');
  ok(/data\?\.prTotal/.test(panelSrc), '主面板 PR 计数取 prTotal');
  // 主面板 Issue 侧**故意没有**总数：列表是 owner/assignee/author 三路并集，
  // `is:issue involves:@me` 不含「我仓库里别人提的 issue」（实测差集确实存在），
  // 三路相加又会因重叠虚高。拿不到正确口径就不下发假总数，界面老实标「已加载 N」。
  ok(!/data\?\.issueTotal/.test(panelSrc), '主面板不再使用口径不一致的 issueTotal');
  ok(/已加载 \$\{myIssues\.length\}/.test(panelSrc), '主面板 Issue 标题老实标注「已加载 N」');
  // Actions 也必须是总数，不能再用已加载条数
  ok(/runTotalCount/.test(clientSrc) && /data\?\.runTotal/.test(clientSrc), '右侧栏 Actions 计数取 runTotal');
  ok(!/count: runs\.length/.test(clientSrc), 'Tab 上的 Actions 计数不再直接用已加载条数');
}

console.log('\n--- 12. 加载更多必须显示「正在加载中」（三个 Tab + 主面板两处）---');
// 为什么必须有：请求往返几百毫秒到数秒，页脚若无反馈，用户会以为点击没生效而连点，
// 触发重复请求；同时「⬇️ 下滑或点击加载更多」在加载中仍显示会误导成还能再点。
{
  const clientSrc = fs.readFileSync(path.join(ROOT, 'src/client.ts'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(ROOT, 'src/ui/workspace-panel.ts'), 'utf8');
  const bundle = fs.readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');

  ok(/正在加载中/.test(clientSrc), '右侧栏页脚有「正在加载中」文案');
  ok(/listLoading/.test(clientSrc), '右侧栏按 Tab 维护加载中标记');
  ok(/setListLoading/.test(clientSrc), '加载中标记通过 state 驱动重渲染');
  ok(/renderListMore\("prs",[^)]*listLoading/.test(clientSrc), 'PR 页脚接入加载中标记');
  ok(/renderListMore\("issues",[^)]*listLoading/.test(clientSrc), 'Issues 页脚接入加载中标记');
  ok(/renderListMore\("runs",[^)]*listLoading/.test(clientSrc), 'Actions 页脚接入加载中标记');
  ok(/loadData\(true\)\.finally/.test(clientSrc), '请求结束后复位加载中标记（失败也要复位）');

  ok(/loadingPrs/.test(panelSrc) && /loadingIssues/.test(panelSrc), '主面板 PR/Issue 各有加载中标记');
  ok(/正在加载中/.test(panelSrc), '主面板页脚有「正在加载中」文案');
  ok(/setLoadingPrs\(true\)/.test(panelSrc) && /setLoadingPrs\(false\)/.test(panelSrc), '主面板 PR 标记成对置位/复位');
  ok(/setLoadingIssues\(true\)/.test(panelSrc) && /setLoadingIssues\(false\)/.test(panelSrc), '主面板 Issue 标记成对置位/复位');

  ok(/⏳ 正在加载中…/.test(bundle), '构建产物里包含加载中文案（前端已生效）');
}

console.log('\n--- 13. 触顶判定必须精确，且不能在 100 条上限处形成死循环 ---');
// 两个真实缺陷的回归网：
//  ① loaded == total 时用 `loaded >= prLimit` 会误判「还有更多」，页脚一直显示但点了拉不到；
//  ② `parseListLimit` 把 limit 夹在 100，客户端顶到 100 后再点只会拿到同样的 100 条，
//     而 loaded(100) < total(323) 恒成立 —— 页脚永远显示、永远点不动（死循环）。
//     服务端必须在 limit 饱和时停止下发 truncated，由前端改显「更早记录请到 GitHub」。
async function probe({ prTotal, loaded, prLimit }) {
  const executor = new GhExecutor();
  executor.checkAuth = async () => ({ installed: true, loggedIn: true, user: 'testuser' });
  executor.getRepoMetadata = async () => ({ nameWithOwner: 'o/r', name: 'r', owner: 'o', defaultBranch: 'main', isPrivate: false, url: '' });
  executor.run = async (args) => {
    if (args[0] === 'api' && args[1] === 'graphql') {
      return { ok: true, data: { data: { prAll: { issueCount: prTotal } } } };
    }
    if (args[0] === 'pr' && args[1] === 'list') {
      return { ok: true, data: Array.from({ length: loaded }, (_, i) => ({ number: i + 1, title: 'x', state: 'OPEN' })) };
    }
    return { ok: true, data: [] };
  };
  const registered = {};
  registerOverviewRoutes(
    { bindRoute: (r) => (registered[r.path] = r.handler) },
    executor, new TtlCache(100000), new TtlCache(100000), { getQuickStatus: () => null }
  );
  const payload = await call(
    registered['/api/github/overview'],
    `/api/github/overview?force=true&cwd=${encodeURIComponent(ROOT)}&prLimit=${prLimit}`
  );
  return payload?.data || {};
}
{
  const equal = await probe({ prTotal: 15, loaded: 15, prLimit: 15 });
  ok(equal.prsTruncated === undefined, 'loaded == total 时不再显示「加载更多」（精确比较）');

  const more = await probe({ prTotal: 20, loaded: 15, prLimit: 15 });
  ok(more.prsTruncated === true, 'loaded < total 时正常显示「加载更多」');

  const saturated = await probe({ prTotal: 323, loaded: 100, prLimit: 100 });
  ok(saturated.prsTruncated === undefined, 'limit 顶到 100 上限时停止下发 truncated（否则死循环）');

  const saturatedOver = await probe({ prTotal: 323, loaded: 100, prLimit: 150 });
  ok(saturatedOver.prsTruncated === undefined, '请求 limit 超上限被夹回后同样停止下发 truncated');

  const belowCap = await probe({ prTotal: 323, loaded: 99, prLimit: 99 });
  ok(belowCap.prsTruncated === true, '未到上限时仍可继续加载');

  const clientSrc = fs.readFileSync(path.join(ROOT, 'src/client.ts'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(ROOT, 'src/ui/workspace-panel.ts'), 'utf8');
  const bundle = fs.readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
  ok(/renderListEnd/.test(clientSrc), '右侧栏有「到底了」终态提示渲染器');
  ok(/更早记录请到 GitHub 查看/.test(clientSrc), '右侧栏终态提示文案说明更早记录去哪看');
  ok(/renderListEnd\("prs"/.test(clientSrc) && /renderListEnd\("issues"/.test(clientSrc) && /renderListEnd\("runs"/.test(clientSrc), '三个 Tab 都接入终态提示');
  ok(/更早记录请到 GitHub 查看/.test(panelSrc), '主面板也有终态提示文案');
  ok(/更早记录请到 GitHub 查看/.test(bundle), '构建产物包含终态提示（前端已生效）');
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 40 Pagination Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 40 Pagination Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
