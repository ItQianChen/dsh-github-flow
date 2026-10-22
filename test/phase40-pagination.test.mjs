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
  ok(bundle.includes('renderListMore'), '右侧栏存在列表加载更多渲染器');
  ok(/下滑或点击加载更多/.test(bundle), '页脚文案存在（下滑或点击）');
  ok(/prLimit=/.test(bundle) && /issueLimit=/.test(bundle) && /runLimit=/.test(bundle), '右侧栏请求带上三个分页参数');
  ok(/prLimit=/.test(bundle) && /global-overview/.test(bundle), '主面板请求也带分页参数');
  ok(/loadMoreLists/.test(bundle), '加载更多回调已接线');
  // 三个 Tab 各自渲染页脚
  ok(/renderListMore\("prs"/.test(bundle), 'PR Tab 有页脚');
  ok(/renderListMore\("issues"/.test(bundle), 'Issues Tab 有页脚');
  ok(/renderListMore\("runs"/.test(bundle), 'Runs Tab 有页脚');
  // 主面板两处（PR / Issue）
  ok((bundle.match(/下滑或点击加载更多 PR/g) || []).length >= 1, '主面板 PR 列表有页脚');
  ok((bundle.match(/下滑或点击加载更多 Issue/g) || []).length >= 1, '主面板 Issue 列表有页脚');
  // 旧的高危提示文案不应再出现在「只能到此为止」的位置
  ok(!/已触及检索上限）？。更早的记录请到 GitHub 查看/.test(bundle), '旧的「已触及上限，请到 GitHub 查看」文案已被加载更多取代');
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 40 Pagination Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 40 Pagination Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
