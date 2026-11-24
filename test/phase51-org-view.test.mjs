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

/** 构造一条路由 + 捕获 sendJson 输出 */
function makeHarness(runs) {
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
  registerOrgRoutes(deps, executor);
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

console.log('\n========================================');
console.log('Phase 51 Org View Result: ' + (failed === 0 ? passed + '/' + (passed + failed) + ' assertions PASSED!' : failed + ' FAILED, ' + passed + ' passed'));
console.log('========================================');
if (failed > 0) process.exit(1);
