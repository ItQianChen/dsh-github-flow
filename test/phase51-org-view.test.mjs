// test/phase51-org-view.test.mjs
//
// Organizations 只读浏览（issue #17 的「查看」诉求）契约测试。
//
// 为什么独立成阶段：
// 1. 组织名与仓库全名会直接进入 gh 的 argv（--owner= / --repo=），是**参数注入面**；
//    放行空格、分号或前导 '-' 会让 gh 把它们当成别的 flag。这里逐条钉死白名单。
// 2. 这个功能明确只读：任何写操作混进来都是越界，用静态断言守住「不出现写命令」。
// 3. 组织聚合与仓库下钻共用同一个路由，作用域参数只差 --owner / --repo，
//    一旦两者串了，用户会看到「组织的 PR 列表里混进了别的仓库」。
// 4. 组织视图是「切组织 → 看仓库 → 下钻 → 退回」的来回操作，必须带缓存；
//    同时前端要有序号守卫与作用域键，否则慢响应会让面包屑和列表分属不同组织。
// 5. 前端失败态必须清空旧数据：用「有数据就不显示错误」的旧写法会把
//    「切组织失败」渲染成「新组织里全是旧组织的仓库」，比空态更难被发现。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let passed = 0;
let failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log('✅ PASS: ' + name); }
  else { failed++; console.error('❌ FAIL: ' + name + (extra ? '  → ' + extra : '')); }
}

const lib = (p) => 'file://' + path.join(ROOT, p).replace(/\\/g, '/');
const { registerOrgRoutes } = await import(lib('lib/api/routes-org.js'));
const { TtlCache } = await import(lib('lib/cache.js'));

/** 构造一条路由 + 捕获 sendJson 输出（cache 可选：传了就启用组织视图缓存） */
function makeHarness(runs, cache) {
  const routes = [];
  const deps = {
    bindRoute: (r) => routes.push(r),
    sendJson: (res, status, payload) => { res.status = status; res.body = payload; },
    readJsonBody: async () => ({}),
  };
  const executor = {
    run: async (args, opts) => {
      runs.push(args.join(' '));
      // 按命令首词返回结构化假数据，模拟 gh 的 JSON 输出
      if (args[0] === 'api') {
        return { ok: true, data: [{ login: 'NewBabyWorld', description: 'demo', avatarUrl: '' }] };
      }
      if (args[0] === 'repo' && args[1] === 'list') {
        return { ok: true, data: [{ name: 'x', nameWithOwner: 'NewBabyWorld/x', defaultBranchRef: { name: 'main' }, isPrivate: true, stargazerCount: 3, updatedAt: '2026-11-20T00:00:00Z', url: 'https://github.com/NewBabyWorld/x' }] };
      }
      if (args[0] === 'search' && args[1] === 'prs') {
        return { ok: true, data: [{ number: 7, title: 'feat: x', state: 'OPEN', repository: { nameWithOwner: 'NewBabyWorld/x' }, url: 'https://github.com/NewBabyWorld/x/pull/7', updatedAt: '2026-11-21T00:00:00Z', isDraft: false, author: { login: 'mrgeda-me' } }] };
      }
      if (args[0] === 'search' && args[1] === 'issues') {
        return { ok: true, data: [{ number: 9, title: 'bug: y', state: 'OPEN', repository: { nameWithOwner: 'NewBabyWorld/x' }, url: 'https://github.com/NewBabyWorld/x/issues/9', updatedAt: '2026-11-22T00:00:00Z', author: { login: 'mrgeda-me' }, labels: [{ name: 'bug', color: 'f00' }] }] };
      }
      return { ok: true, data: [] };
    },
  };
  registerOrgRoutes(deps, executor, cache);
  return { routes, runs };
}

console.log('\n--- 1. 路由注册 ---');
{
  const { routes } = makeHarness([]);
  const paths = routes.map((r) => r.path);
  ok(paths.includes('/api/github/orgs'), '注册了组织列表路由');
  ok(paths.includes('/api/github/org-overview'), '注册了组织概览路由');
  ok(routes.every((r) => r.kind === 'exact'), '两条路由均为 exact 匹配');
}

console.log('\n--- 2. 只读约束（不得出现任何写命令）---');
{
  const src = readFileSync(path.join(ROOT, 'src/api/routes-org.ts'), 'utf8');
  const codeOnly = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
  for (const forbidden of ["'create'", "'edit'", "'merge'", "'delete'", "'comment'", "'close'", "'reopen'", "'transfer'"]) {
    ok(!codeOnly.includes(forbidden), '不含写操作子命令 ' + forbidden);
  }
  ok(!/POST|PUT|PATCH|DELETE/.test(codeOnly.replace(/405/g, '')), '没有注册任何非 GET 分支（405 除外）');
}

console.log('\n--- 3. 参数白名单（防 argv 注入）---');
{
  const bad = ['', '  ', '-R', '--flag', 'a;b', 'a b', 'owner/repo;rm', '../x', 'a..b', 'x'.repeat(120)];
  for (const v of bad) {
    const { routes } = makeHarness([]);
    const handler = routes.find((r) => r.path === '/api/github/org-overview').handler;
    const req = { method: 'GET', url: '/api/github/org-overview?org=' + encodeURIComponent(v) };
    const res = {};
    await handler(req, res);
    ok(res.status === 400, '非法组织名被拒绝: ' + JSON.stringify(v).slice(0, 30), 'status=' + res.status);
  }
}

console.log('\n--- 4. 组织名 / 仓库名的合法样例必须放行 ---');
{
  for (const v of ['NewBabyWorld', 'my-org', 'org.name', 'a_b']) {
    const { routes } = makeHarness([]);
    const handler = routes.find((r) => r.path === '/api/github/org-overview').handler;
    const res = {};
    await handler({ method: 'GET', url: '/api/github/org-overview?org=' + encodeURIComponent(v) }, res);
    ok(res.status === 200 && res.body.ok === true, '合法组织名放行: ' + v, 'status=' + res.status);
  }
}

console.log('\n--- 5. 组织聚合 vs 仓库下钻的作用域参数 ---');
{
  const { routes, runs } = makeHarness([]);
  const handler = routes.find((r) => r.path === '/api/github/org-overview').handler;

  const res1 = {};
  await handler({ method: 'GET', url: '/api/github/org-overview?org=NewBabyWorld' }, res1);
  const prCmd = runs.find((c) => c.startsWith('search prs'));
  ok(prCmd.includes('--owner=NewBabyWorld'), '组织聚合用 --owner=<org>', prCmd);
  ok(!prCmd.includes('--repo='), '组织聚合不带 --repo', prCmd);
  const repoCmd = runs.find((c) => c.startsWith('repo list'));
  ok(repoCmd && repoCmd.includes('NewBabyWorld'), '组织聚合拉该组织的仓库列表', repoCmd);
  ok(res1.body.data.repos.length === 1 && res1.body.data.repos[0].nameWithOwner === 'NewBabyWorld/x', '仓库列表映射正确');
  ok(res1.body.data.prs[0].author.login === 'mrgeda-me', 'PR 的作者字段被归一化为对象');
  ok(res1.body.data.issues[0].labels[0].name === 'bug', 'Issue 标签映射保留');

  const runs2 = [];
  const h2 = makeHarness(runs2);
  const res2 = {};
  await h2.routes.find((r) => r.path === '/api/github/org-overview').handler(
    { method: 'GET', url: '/api/github/org-overview?org=NewBabyWorld&repo=NewBabyWorld%2Fx' }, res2
  );
  const prCmd2 = runs2.find((c) => c.startsWith('search prs'));
  ok(prCmd2 && prCmd2.includes('--repo=NewBabyWorld/x'), '仓库下钻用 --repo=<owner/name>', prCmd2);
  ok(!prCmd2.includes('--owner='), '仓库下钻不带 --owner', prCmd2);
  ok(!runs2.some((c) => c.startsWith('repo list')), '下钻时不再拉仓库列表（已确定）');
  ok(res2.body.data.repo === 'NewBabyWorld/x', '响应回显下钻的仓库');
}

console.log('\n--- 6. 截断标记与部分失败 ---');
{
  const routes = [];
  const deps = { bindRoute: (r) => routes.push(r), sendJson: (res, s, p) => { res.status = s; res.body = p; }, readJsonBody: async () => ({}) };
  // PR 满页 + Issue 查询失败：部分成功仍要返回，且如实标记截断
  const executor = {
    run: async (args) => {
      if (args[1] === 'prs') {
        return { ok: true, data: Array.from({ length: 30 }, (_, i) => ({ number: i + 1, title: 'p' + i, state: 'OPEN', repository: { nameWithOwner: 'o/r' }, url: 'u', updatedAt: '2026-11-22T00:00:00Z' })) };
      }
      if (args[1] === 'issues') return { ok: false, error: 'boom' };
      return { ok: true, data: [] };
    },
  };
  registerOrgRoutes(deps, executor);
  const res = {};
  await routes.find((r) => r.path === '/api/github/org-overview').handler({ method: 'GET', url: '/api/github/org-overview?org=o' }, res);
  ok(res.status === 200 && res.body.ok === true, '部分成功照常返回（Issue 失败不拖垮整体）', 'status=' + res.status);
  ok(res.body.data.prsTruncated === true, 'PR 触顶时标记 truncated');
  ok(res.body.data.prs.length === 30, 'PR 条目数如实下发');
}

console.log('\n--- 7. 前端接线（源码级契约）---');
{
  const panel = readFileSync(path.join(ROOT, 'src/ui/workspace-panel.ts'), 'utf8');
  ok(panel.includes("/api/github/orgs"), '面板请求组织列表接口');
  ok(panel.includes("/api/github/org-overview?org="), '面板请求组织概览接口');
  ok(panel.includes("activeTab === 'orgs'"), '存在组织 Tab 分支');
  ok(panel.includes('组织视图为只读浏览'), '界面明示只读边界');
  ok(panel.includes('loadOrgOverview(selectedOrg, rr.nameWithOwner)'), '仓库卡片可下钻');
  ok(/setDrillRepo\(null\); if \(selectedOrg\) loadOrgOverview\(selectedOrg, null\)/.test(panel), '下钻后能回到组织聚合');
  ok(panel.includes('🏢 组织'), '组织 Tab 入口存在（本分支为 emoji 形态）');
}

console.log('\n--- 8. 分支独立性（本分支不带 svg-icons 图标体系）---');
{
  // master 分支刻意不包含 SVG 图标改版：组织视图必须能独立编译，
  // 不得 import 或调用 iconWithText / renderIcon，否则合并到上游会直接编译失败。
  const panelSrc = readFileSync(path.join(ROOT, 'src/ui/workspace-panel.ts'), 'utf8');
  ok(!panelSrc.includes('iconWithText('), '面板不调用 iconWithText（本分支无该模块）');
  ok(!panelSrc.includes('renderIcon('), '面板不调用 renderIcon');
  ok(!panelSrc.includes('renderDot('), '面板不调用 renderDot');
}

console.log('\n--- 9. 组织视图缓存（切组织/下钻不该每次都重跑 gh）---');
{
  const runs = [];
  const cache = new TtlCache(60_000);
  const { routes } = makeHarness(runs, cache);
  const handler = routes.find((r) => r.path === '/api/github/org-overview').handler;
  const url = '/api/github/org-overview?org=NewBabyWorld';

  const res1 = {};
  await handler({ method: 'GET', url }, res1);
  const firstRuns = runs.length;
  ok(res1.status === 200 && res1.body.ok === true, '首次请求正常返回');
  ok(!res1.body.fromCache, '首次请求未命中缓存');
  ok(firstRuns === 3, '组织聚合一次 spawn 3 个 gh（PR / Issue / 仓库列表）', String(firstRuns));

  const res2 = {};
  await handler({ method: 'GET', url }, res2);
  ok(res2.body.fromCache === true, '同参数第二次命中缓存');
  ok(runs.length === firstRuns, '命中缓存时不再 spawn gh', 'runs=' + runs.length);
  ok(res2.body.data.repos.length === 1 && res2.body.data.prs.length === 1, '缓存内容与首次一致');

  // 下钻是另一个作用域：绝不能被聚合缓存命中，否则仓库视图会显示整个组织的数据
  const res3 = {};
  await handler({ method: 'GET', url: url + '&repo=NewBabyWorld%2Fx' }, res3);
  ok(!res3.body.fromCache, '仓库下钻不复用组织聚合缓存');
  ok(res3.body.data.repo === 'NewBabyWorld/x', '下钻响应仍是仓库作用域');
  ok(runs.length > firstRuns, '下钻重新查询');

  // limit 不同即不同数据集
  const before = runs.length;
  const res4 = {};
  await handler({ method: 'GET', url: url + '&limit=5' }, res4);
  ok(!res4.body.fromCache, 'limit 不同不复用缓存');
  ok(runs.length > before, 'limit 不同重新查询');
}

console.log('\n--- 9b. 失败结果不得进缓存 ---');
{
  const runs = [];
  const cache = new TtlCache(60_000);
  const routes = [];
  const deps = { bindRoute: (r) => routes.push(r), sendJson: (res, s, p) => { res.status = s; res.body = p; }, readJsonBody: async () => ({}) };
  const executor = { run: async (args) => { runs.push(args.join(' ')); return { ok: false, error: 'boom' }; } };
  registerOrgRoutes(deps, executor, cache);
  const handler = routes.find((r) => r.path === '/api/github/org-overview').handler;
  const url = '/api/github/org-overview?org=FailingOrg';

  const r1 = {};
  await handler({ method: 'GET', url }, r1);
  ok(r1.body.ok === false, '三路全失败 → ok:false（UI 才能进错误态）');

  const before = runs.length;
  const r2 = {};
  await handler({ method: 'GET', url }, r2);
  ok(!r2.body.fromCache, '失败结果不进缓存');
  ok(runs.length > before, '失败后再次请求会重试（一次瞬时故障不会在 TTL 内持续复现）');
}

console.log('\n--- 10. 组织列表分页口径 ---');
{
  // 裸 user/orgs 默认 per_page=30，加入组织多于 30 个会静默截断
  const runs = [];
  const { routes } = makeHarness(runs);
  const handler = routes.find((r) => r.path === '/api/github/orgs').handler;
  const res = {};
  await handler({ method: 'GET', url: '/api/github/orgs' }, res);
  const cmd = runs.find((c) => c.startsWith('api'));
  ok(cmd.includes('user/orgs?per_page=100'), '组织列表请求 per_page=100', cmd);
  ok(res.body.data.truncated === false, '未触顶时 truncated=false');

  // 满 100 条 → 如实标记触顶
  const routes2 = [];
  const deps2 = { bindRoute: (r) => routes2.push(r), sendJson: (res2, s, p) => { res2.status = s; res2.body = p; }, readJsonBody: async () => ({}) };
  const executor2 = { run: async () => ({ ok: true, data: Array.from({ length: 100 }, (_, i) => ({ login: 'org' + i, description: '', avatarUrl: '' })) }) };
  registerOrgRoutes(deps2, executor2);
  const resFill = {};
  await routes2.find((r) => r.path === '/api/github/orgs').handler({ method: 'GET', url: '/api/github/orgs' }, resFill);
  ok(resFill.body.data.orgs.length === 100 && resFill.body.data.truncated === true, '组织数触顶 100 → truncated=true（不假装列全了）');

  // 缺少 read:org scope 等失败：失败但不炸，且 orgs 为空数组
  const routes3 = [];
  const deps3 = { bindRoute: (r) => routes3.push(r), sendJson: (res3, s, p) => { res3.status = s; res3.body = p; }, readJsonBody: async () => ({}) };
  registerOrgRoutes(deps3, { run: async () => ({ ok: false, error: 'missing read:org scope' }) });
  const resErr = {};
  await routes3.find((r) => r.path === '/api/github/orgs').handler({ method: 'GET', url: '/api/github/orgs' }, resErr);
  ok(resErr.body.ok === false && Array.isArray(resErr.body.data.orgs), '读取失败 → ok:false + 空数组（UI 可展示原因而非空白）');
  ok(String(resErr.body.message).includes('read:org'), '失败原因原样透出（便于给出 gh auth refresh 指引）');
}

console.log('\n--- 11. 前端竞态与失败态契约（防回退）---');
{
  const panel = readFileSync(path.join(ROOT, 'src/ui/workspace-panel.ts'), 'utf8');
  // 竞态：两个独立序号，概览请求不得把组织列表响应判废
  ok(panel.includes('orgSeqRef'), '组织概览请求有序号守卫');
  ok(panel.includes('orgsSeqRef'), '组织列表请求有独立序号');
  ok(/if \(seq !== orgSeqRef\.current\) return;/.test(panel), '概览旧响应被丢弃（连点切组织）');
  ok(/if \(seq !== orgsSeqRef\.current\) return;/.test(panel), '列表旧响应被丢弃');
  // 失败态：不能再用「有没有数据」判断，否则旧数据会把错误掩盖成错配内容
  ok(!panel.includes('orgError && !orgData'), '错误态不再依赖「有无数据」判断');
  ok(panel.includes('setOrgDataKey(null)'), '请求开始时清空作用域键与数据');
  ok(/orgDataKey !== expectedOrgKey/.test(panel), '渲染期守卫：数据必须与当前作用域对齐');
  ok(panel.includes('if (j && j.ok && j.data)'), '只在 ok 时接受数据（失败不被渲染成空组织）');
  ok(panel.includes('返回组织列表'), '错误态提供返回入口（不再是死页）');
  // 截断可见性
  ok(/d\.reposTruncated \? "\+" : ""/.test(panel), '仓库列表渲染截断标记 +');
  ok(panel.includes('orgsTruncated'), '组织列表渲染触顶提示');
  ok(panel.includes('orgsLoaded ?'), 'Tab 计数在加载完成前不显示 0');
}

console.log('\n--- 12. 刷新链路必须一并清空组织缓存 ---');
{
  const { registerActionRoutes } = await import(lib('lib/api/routes-actions.js'));
  const orgCache = new TtlCache(60_000);
  const mapCache = new TtlCache(60_000);
  const globalCache = new TtlCache(60_000);
  orgCache.set('o/r|', { marker: 'stale' }, Date.now());
  ok(orgCache.get('o/r|', Date.now()) !== undefined, '预置组织缓存条目');

  const routes = [];
  const deps = { bindRoute: (r) => routes.push(r), sendJson: (res, s, p) => { res.status = s; res.body = p; }, readJsonBody: async () => ({}) };
  registerActionRoutes(deps, { run: async () => ({ ok: true, data: [] }) }, mapCache, globalCache, orgCache);
  const refresh = routes.find((r) => r.path === '/api/github/refresh');
  ok(Boolean(refresh), '刷新路由已注册');
  // 该分组用的是模块级 sendJson（直接操作 http.ServerResponse），
  // 不是 deps.sendJson——mock 必须提供 setHeader/end，否则会抛 TypeError
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(raw) { this.raw = raw; this.body = JSON.parse(raw); },
  };
  await refresh.handler({ method: 'POST', headers: {} }, res);
  ok(res.statusCode === 200 && res.body.ok === true, '刷新返回成功');
  ok(orgCache.get('o/r|', Date.now()) === undefined,
    '刷新按钮同时清空组织缓存（否则驾驶舱更新了、组织 Tab 仍是陈数据）');

  // 接线契约：缓存实例必须真的从注册器传下来，而不是各自 new 一份
  const routesSrc = readFileSync(path.join(ROOT, 'src/api/routes.ts'), 'utf8');
  ok(routesSrc.includes('registerActionRoutes(deps, executor, cacheMap, globalCache, orgCache)'),
    '注册器把同一个 orgCache 同时交给组织路由与刷新路由');
  ok(routesSrc.includes('TtlCache<OrgOverviewData>'), '组织缓存使用具体类型而非 any');
}

console.log('\n--- 13. 组织 Tab 的错误态可恢复 ---');
{
  const panel = readFileSync(path.join(ROOT, 'src/ui/workspace-panel.ts'), 'utf8');
  ok(panel.includes('🔄 重新加载'), '错误态提供重新加载入口（否则只能刷新整页）');
  ok(/setOrgsLoaded\(false\);\s*\n\s*loadOrgs\(\)/.test(panel), '重新加载会重置已加载标记并重拉组织列表');
  ok(panel.includes('loadOrgOverview(selectedOrg, drillRepo)'), '已在组织内时重试按当前下钻层级重拉');
}

console.log('\n========================================');
console.log('Phase 51 Org View Result: ' + (failed === 0 ? passed + '/' + (passed + failed) + ' assertions PASSED!' : failed + ' FAILED, ' + passed + ' passed'));
console.log('========================================');
if (failed > 0) process.exit(1);
