// test/phase52-audit.test.mjs
//
// 操作记录（AuditStore / 路由 / 摘要 / 结果形状 / 客户端登记）契约测试。
//
// 为什么独立成阶段：
// 1. 分类与风险必须有**唯一真源**（WRITE_ACTIONS / DESTRUCTIVE_ACTIONS）。本阶段
//    不新建第二张表，但必须证明「读的是同一张表」——表驱动遍历，不手抄清单。
// 2. 记录是 append-only 事件流：intent / result / decision / delete 四种行要能正确折叠，
//    且「删除」必须**真删磁盘字节**（用户点删除要的是隐私，不是墓碑表演）。
// 3. 本模块位于 tools/result 热路径且自带 Fail-Open：构造失败 / 写盘失败 / 卸载后调用
//    都不许抛错——Cordis 里 apply() 抛错 = Fiber FAILED = 19 个工具全丢。
// 4. `tools/result` 的第二参在运行时是归一化后的 `ToolExecutionResult`（原始值在 .value），
//    而老测试直接传原始载荷。两种形状都必须认，否则要么生产全错、要么既有断言静默失效。
// 5. 客户端模块漏登记 scripts/build.mjs 会**白屏且构建成功**，只能用静态断言守住。

import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import os from 'node:os';
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
const {
  AuditStore, classifyWrite, classifyRisk, summarizeOperation, extractOutcome, pickTarget,
  resolveRepoFromExec, resolveScopeFromExec, deriveMaxRows, clampBudget,
} = await import(lib('lib/audit.js'));
const { WRITE_ACTIONS } = await import(lib('lib/tool-tiers.js'));
const { DESTRUCTIVE_ACTIONS } = await import(lib('lib/destructive.js'));
const { registerAuditRoutes } = await import(lib('lib/api/routes-audit.js'));
const { sendJson, readJsonBody } = await import(lib('lib/api/route-helpers.js'));
const { TelemetryCollector } = await import(lib('lib/telemetry.js'));

const tmpDirs = [];
function tmpDir() {
  const d = mkdtempSync(path.join(os.tmpdir(), 'dsh-audit-'));
  tmpDirs.push(d);
  return d;
}
function makeStore(over) {
  let t = 1_700_000_000_000;
  return new AuditStore({
    dir: tmpDir(),
    flushDelayMs: 0,
    now: () => (t += 1000),
    ...(over || {}),
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n--- 1. 分类：真源必须是 WRITE_ACTIONS（表驱动，不手抄）---');
{
  let toolCount = 0;
  for (const [tool, spec] of Object.entries(WRITE_ACTIONS)) {
    if (spec === '*') {
      ok(classifyWrite(tool, 'anything') === true, `${tool} 通配记为写`);
      continue;
    }
    toolCount++;
    const allWrites = spec.every((a) => classifyWrite(tool, a) === true);
    ok(allWrites, `${tool} 的 ${spec.length} 个写 action 全部判定为写`);
  }
  ok(toolCount === 18, 'WRITE_ACTIONS 覆盖 18 个工具条目（含 3 个空清单）');
  const namedTools = Object.entries(WRITE_ACTIONS).filter(([, v]) => Array.isArray(v) && v.length > 0);
  const emptyTools = Object.entries(WRITE_ACTIONS).filter(([, v]) => Array.isArray(v) && v.length === 0);
  ok(namedTools.length === 15, '其中 15 个工具有具名写 action');
  ok(emptyTools.length === 3, 'ruleset / status / help 是纯只读工具（空清单）');
  ok(classifyWrite('github_pr', 'list') === false, 'github_pr list 是读');
  ok(classifyWrite('github_issue', 'view') === false, 'github_issue view 是读');
  ok(classifyWrite('github_unknown', 'merge') === false, '未知工具不判为写（保守取读）');
}

console.log('\n--- 2. 风险分级：命中闸门表才是 destructive ---');
{
  let pairs = 0;
  for (const [tool, table] of Object.entries(DESTRUCTIVE_ACTIONS)) {
    for (const action of Object.keys(table)) {
      pairs++;
      ok(classifyRisk(tool, action) === 'destructive', `${tool}.${action} 判为 destructive`);
    }
  }
  ok(pairs === 17, '闸门表共 17 对 (工具, action)');
  ok(classifyRisk('github_pr', 'create') === 'write', 'github_pr create 是普通写');
  ok(classifyRisk('github_pr', 'list') === 'read', 'github_pr list 是读');
  ok(classifyRisk('github_pr', 'toString') === 'read', '原型链上的名字不命中闸门（不炸）');
}

console.log('\n--- 3. 摘要：PR / Issue 人话，其余兜底 ---');
{
  const s = (tool, action, args) => summarizeOperation(tool, action, args || {});
  ok(s('github_pr', 'merge', { pr_number: 19 }) === '合并 PR #19（squash）', 'merge 默认 squash');
  ok(s('github_pr', 'merge', { pr_number: 19, merge_method: 'rebase', delete_branch: true })
    === '合并 PR #19（rebase，删源分支）', 'merge 带策略与删分支');
  ok(s('github_pr', 'view', { pr_number: 7 }) === '查看 PR #7', 'pr view 摘要');
  ok(s('github_pr', 'list', { state: 'open' }) === '列出 PR（open）', 'pr list 带状态');
  ok(s('github_issue', 'close', { issue_number: 3, reason: 'completed' }) === '关闭 Issue #3（completed）', 'issue close 带原因');
  ok(s('github_issue', 'delete', { issue_number: 3 }).includes('物理删除'), 'issue delete 强调不可恢复');
  ok(s('github_issue', 'transfer', { issue_number: 3, target_repo: 'a/b' }) === '迁移 Issue #3 → a/b', 'issue transfer 带目标');
  ok(s('github_pr', 'merge', {}) === '合并 PR #?（squash）', '缺编号时显示 #? 而不是空白');
  ok(s('github_release', 'delete', { tag: 'v0.7.1' }) === 'github_release.delete v0.7.1', '非 PR/Issue 走结构化兜底');
  ok(s('github_unknown', 'whatever', {}) === 'github_unknown.whatever', '未知工具兜底不抛');
  ok(s('github_api', '', { method: 'POST', endpoint: '/repos/a/b/issues' }) === 'github_api POST /repos/a/b/issues',
    'github_api 无 action 维度时摘要带 method + endpoint');
  ok(s('github_status', '', {}) === 'github_status', '既无 action 也无目标时只给工具名（不留尾点）');
  const long = 'x'.repeat(80);
  ok(s('github_pr', 'create', { title: long }).length < 60, '超长标题被裁剪');
  ok(s('github_pr', 'create', { title: long }).includes('…'), '裁剪后带省略号');
  ok(summarizeOperation('github_pr', 'merge', null) === '合并 PR #?（squash）', 'args 为 null 也不抛');
  ok(pickTarget({ pr_number: 19 }) === '#19' && pickTarget({ tag: 'v1' }) === 'v1', '目标标识按语义取第一个有值字段');
}

console.log('\n--- 4. 存储：折叠 / 墓碑 / 压实 / 决策行 ---');
{
  const store = makeStore();
  store.recordCall('github_pr', { action: 'merge', pr_number: 19 }, { ok: true }, { callId: 'c1', agent: { id: 'sess-1' } });
  const page = store.list();
  ok(page.total === 1, '一次写调用折叠成一条记录');
  const one = page.items[0];
  ok(one.result === 'ok', '结果折叠为 ok');
  ok(one.decision === 'auto', 's1 默认决策为 auto');
  ok(one.write === true && one.risk === 'destructive', 'write / risk 标记正确');
  ok(one.summary === '合并 PR #19（squash）', '摘要进记录');
  ok(one.sessionId === 'sess-1', 'sessionId 被记录');
  ok(one.callId === 'c1', 'callId 被记录');
  ok(store.rowCount() === 2, '写操作落 intent + result 两行');

  // 作用域：**只有 PR / Issue 的写操作**进记录（总纲 §一）
  store.recordCall('github_pr', { action: 'list' }, { ok: true }, { callId: 'c2' });
  ok(store.rowCount() === 2, 'PR 的读操作不入记录（只记写）');
  store.recordCall('github_release', { action: 'delete', tag: 'v1' }, { ok: true }, { callId: 'c3' });
  ok(store.rowCount() === 2, '非 PR / Issue 的工具不入记录（release 不计）');
  store.recordCall('github_issue', { action: 'close', issue_number: 3 }, { ok: true }, { callId: 'c4' });
  ok(store.rowCount() === 4, 'Issue 的写操作入记录（作用域含 PR + Issue）');
  ok(store.list().total === 2, '两条记录：PR merge + Issue close');

  // 决策行覆盖
  store.recordDecision('c1', 'rejected', '先改成 squash，别删分支');
  const afterDecision = store.list().items.find((e) => e.id === 'c1');
  ok(afterDecision.decision === 'rejected', '决策行覆盖默认 auto');
  ok(afterDecision.feedback === '先改成 squash，别删分支', '拒绝留言被记录');

  // 同一条记录重复决策：后写覆盖（真实语义：用户改了主意）
  store.recordDecision('c1', 'approved');
  ok(store.list().items.find((e) => e.id === 'c1').decision === 'approved', '后写的决策覆盖先写的');

  // 删除：同步压实——**返回时字节就必须没了**（不能靠攒批定时器，否则进程一退
  // 记录就复活，用户会认为删除是假的）
  const removed = await store.delete(['c1']);
  ok(removed === 1, 'delete 返回真实删除条数');
  ok(store.list().items.find((e) => e.id === 'c1') === undefined, '删除后列表不可见');
  const bytes = readFileSync(store.filePath(), 'utf8');
  ok(!bytes.includes('"id":"c1"'), 'delete 返回时文件字节已不含被删 id（同步压实，无需等 flush）');
  ok(bytes.includes('c4'), '未删除的记录仍在文件里');
  ok(await store.delete(['not-exist']) === 0, '删除不存在的 id 返回 0');

  // 清空
  await store.clear();
  ok(store.list().total === 0, 'clear 后列表为空');
  ok(readFileSync(store.filePath(), 'utf8').trim() === '', 'clear 返回时文件已为空');
}

console.log('\n--- 5. 文件装载：坏行跳过 / intent 无 result ---');
{
  const dir = tmpDir();
  const file = path.join(dir, 'audit.jsonl');
  /*
   * 样本必须是**写**操作：s3 起读取侧也按作用域过滤（记录只有 PR / Issue 的写操作），
   * 用读操作行当样本会被判越界丢弃，测出来的东西与真实数据流不一致。
   */
  const rows = [
    { v: 1, kind: 'intent', id: 'x1', at: 100, tool: 'github_issue', action: 'close', write: true, risk: 'destructive', summary: '关闭 Issue #1' },
    '{ 这行是断电留下的半行',
    { v: 1, kind: 'intent', id: 'y1', at: 101, tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '合并 PR #2' },
  ];
  writeFileSync(file, rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n', 'utf8');
  const store = new AuditStore({ dir, flushDelayMs: 0 });
  const page = store.list();
  ok(page.total === 2, '坏行被跳过，好行全部保留');
  const intentOnly = page.items.find((e) => e.id === 'x1');
  ok(intentOnly && intentOnly.result === 'unknown', '只有 intent 没有 result 时如实标为 unknown');
  ok(intentOnly && intentOnly.summary === '关闭 Issue #1', 'intent 行的身份信息被保留');
  await store.dispose();
}

console.log('\n--- 6. 派生行数上限与分页 ---');
{
  // 行数下限被 clamp 到 1000（防"极短行"病态）。作用域内只剩写操作，每次写 = 2 行，
  // 因此 600 次写 = 1200 行 → 淘汰 200 行（整 100 对）→ 剩 1000 行 / 500 条。
  const store = makeStore({ maxRows: 1000, maxBytes: 64 * 1024 * 1024 });
  for (let i = 0; i < 600; i++) store.recordCall('github_pr', { action: 'merge', pr_number: i }, { ok: true }, { callId: 'k' + i });
  ok(store.rowCount() === 1000, '超过行数上限后按时间尾部保留');
  const page = store.list({ limit: 200 });
  ok(page.total === 500, '折叠后是 500 条（1000 行 = 500 对 intent+result）');
  ok(page.items[0].at > page.items[99].at, '列表按时间倒序（最新在前）');
  const paged = store.list({ limit: 10, offset: 490 });
  ok(paged.items.length === 10 && paged.total === 500, 'limit/offset 分页正确');
  await store.flush();
  const lines = readFileSync(store.filePath(), 'utf8').trim().split('\n').filter(Boolean);
  ok(lines.length === 1000, '压实后文件行数等于上限（超限部分真被丢弃）');
  ok(!lines[0].includes('"k0"'), '最早的那条已被截断');
  ok(store.list().items.every((e) => e.result === 'ok'), '淘汰后没有留下"只有 intent 没有 result"的半对记录');
  await store.dispose();
}

console.log('\n--- 7. 路由契约 ---');
{
  const makeHarness = () => {
    const routes = [];
    const deps = { bindRoute: (r) => routes.push(r), sendJson, readJsonBody };
    const store = makeStore();
    registerAuditRoutes(deps, store);
    return { routes, store };
  };
  const REQ_OK = { host: '127.0.0.1:55716', origin: 'http://127.0.0.1:55716', 'content-type': 'application/json' };
  function makeReq(opts = {}) {
    const listeners = { data: [], end: [], error: [] };
    const req = {
      method: opts.method || 'GET',
      url: opts.url || '/',
      headers: opts.headers || {},
      resume() {},
      destroy() {},
      on(ev, cb) { (listeners[ev] || []).push(cb); return req; },
    };
    if (opts.body !== undefined) {
      setImmediate(() => {
        (listeners.data || []).forEach((f) => f(Buffer.from(opts.body)));
        (listeners.end || []).forEach((f) => f());
      });
    }
    return req;
  }
  function makeRes() {
    const res = {
      statusCode: 0,
      headers: {},
      body: null,
      setHeader(k, v) { res.headers[k] = v; },
      end(b) { res.body = b ? JSON.parse(b) : null; },
    };
    return res;
  }
  const hit = async (routes, p, opts) => {
    const r = routes.find((x) => x.path === p);
    const res = makeRes();
    await r.handler(makeReq(opts), res);
    return res;
  };

  const { routes, store } = makeHarness();
  // s3 起多了第 5 条：导出（`/audit/export`，JSON / Markdown 随响应回传，服务端不落文件）
  ok(routes.length === 5, '注册 5 条路由（列表 / 删除 / 清空 / 导出 / 设置）');
  ok(routes.every((r) => r.kind === 'exact'), '五条均为 exact 匹配');
  ok(routes.some((r) => r.path === '/api/github/audit/export'), '导出路由已挂载');

  store.recordCall('github_pr', { action: 'merge', pr_number: 19 }, { ok: true }, { callId: 'r1' });
  // 第二条也用写操作（Issue 评论）：作用域已排除读，用 list 会得到 0 条
  store.recordCall('github_issue', { action: 'comment', issue_number: 2 }, { ok: true }, { callId: 'r2' });

  let res = await hit(routes, '/api/github/audit/records', { method: 'GET', url: '/api/github/audit/records' });
  ok(res.statusCode === 200 && res.body.ok === true, 'GET 列表 200 + ok');
  ok(res.body.data.items.length === 2 && res.body.data.total === 2, '列表返回两条');
  ok(res.body.data.degraded === null, '未降级时 degraded 为 null');

  res = await hit(routes, '/api/github/audit/records', { method: 'GET', url: '/api/github/audit/records?write=1' });
  ok(res.body.data.items.length === 2 && res.body.data.items.every((e) => e.write === true), 'write=1 全部是写操作');

  res = await hit(routes, '/api/github/audit/records', { method: 'GET', url: '/api/github/audit/records?risk=destructive' });
  ok(res.body.data.items.length === 1, 'risk=destructive 只返回高危');

  // 作用域：不传 cwd = 全局；传了 cwd = 只看该工作区（宁可空，也不能退化成全局）
  res = await hit(routes, '/api/github/audit/records', { method: 'GET', url: '/api/github/audit/records' });
  ok(res.body.data.scope === 'global' && res.body.data.cwd === null, '不传 cwd 时如实回显全局作用域');
  res = await hit(routes, '/api/github/audit/records', { method: 'GET', url: '/api/github/audit/records?cwd=' + encodeURIComponent('D:/ws-a') });
  ok(res.statusCode === 200 && res.body.data.scope === 'workspace', '传 cwd 时如实回显工作区作用域');
  ok(res.body.data.items.length === 0, '这些记录没有该 cwd → 结果为空，而不是退化成全局');
  res = await hit(routes, '/api/github/audit/records', { method: 'GET', url: '/api/github/audit/records?cwd=' + encodeURIComponent('D:/a\u0000b') });
  ok(res.statusCode === 400, 'cwd 含控制字符 → 400');

  res = await hit(routes, '/api/github/audit/records', { method: 'GET', url: '/api/github/audit/records?limit=9999' });
  ok(res.statusCode === 200, 'limit 超上限不报错（内部钳到 200）');

  res = await hit(routes, '/api/github/audit/records', { method: 'POST' });
  ok(res.statusCode === 405, '列表端点拒绝 POST（405）');

  res = await hit(routes, '/api/github/audit/records/delete', { method: 'POST', headers: { ...REQ_OK, origin: 'http://evil.example' }, body: '{"ids":["r1"]}' });
  ok(res.statusCode === 403, '跨源删除被拒（403）');

  res = await hit(routes, '/api/github/audit/records/delete', { method: 'POST', headers: { ...REQ_OK, 'content-type': 'text/plain' }, body: '{"ids":["r1"]}' });
  ok(res.statusCode === 415, '非 JSON 媒体类型被拒（415）');

  res = await hit(routes, '/api/github/audit/records/delete', { method: 'POST', headers: REQ_OK, body: '{"ids":"r1"}' });
  ok(res.statusCode === 400, 'ids 非数组时 400');

  res = await hit(routes, '/api/github/audit/records/delete', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ ids: new Array(501).fill('x') }) });
  ok(res.statusCode === 400, '单次删除条数超限时 400');

  res = await hit(routes, '/api/github/audit/records/delete', { method: 'POST', headers: REQ_OK, body: '{"ids":["r1"]}' });
  ok(res.statusCode === 200 && res.body.data.removed === 1, '合法删除返回 removed 计数');
  ok(store.list().total === 1, '删除后存储里只剩一条');

  res = await hit(routes, '/api/github/audit/records/clear', { method: 'GET' });
  ok(res.statusCode === 405, '清空端点拒绝 GET（405）');

  res = await hit(routes, '/api/github/audit/records/clear', { method: 'POST', headers: REQ_OK, body: '{}' });
  ok(res.statusCode === 200, '清空 200');
  ok(store.list().total === 0, '清空后无记录');

  // 设置端点：关与预算（关闭只有一个入口 = enabled，预算 0 非法）
  res = await hit(routes, '/api/github/audit/records', { method: 'GET', url: '/api/github/audit/records' });
  ok(Boolean(res.body.data.usage) && res.body.data.usage.enabled === true, '列表响应带 usage（默认开）');
  res = await hit(routes, '/api/github/audit/settings', { method: 'GET' });
  ok(res.statusCode === 200 && Boolean(res.body.data.usage) && typeof res.body.data.approvalMode === 'string', '设置端点 GET 返回当前开关 / 预算 / 审核档位');
  res = await hit(routes, '/api/github/audit/settings', { method: 'PUT' });
  ok(res.statusCode === 405, '设置端点拒绝 PUT（405）');
  res = await hit(routes, '/api/github/audit/settings', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ budgetMB: 0 }) });
  ok(res.statusCode === 400, 'budgetMB=0 被拒（关闭走 enabled，不是预算 0）');
  res = await hit(routes, '/api/github/audit/settings', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ budgetMB: 65 }) });
  ok(res.statusCode === 400, 'budgetMB 超上限被拒');
  res = await hit(routes, '/api/github/audit/settings', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ budgetMB: 'abc' }) });
  ok(res.statusCode === 400, 'budgetMB 非数字被拒');
  res = await hit(routes, '/api/github/audit/settings', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ enabled: false }) });
  ok(res.statusCode === 200 && res.body.data.usage.enabled === false, '关闭记录 200 且 usage.enabled=false');
  res = await hit(routes, '/api/github/audit/settings', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ enabled: true, budgetMB: 4 }) });
  ok(res.statusCode === 200 && res.body.data.usage.enabled === true, '重新开启 200');
  ok(res.body.data.usage.maxBytes === 4 * 1024 * 1024, '预算改动随 usage 回显');
  // 审核档位：与开关/预算同端点、同文件（设置页一屏三个控件）
  res = await hit(routes, '/api/github/audit/settings', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ approvalMode: 'all-writes' }) });
  ok(res.statusCode === 200 && res.body.data.approvalMode === 'all-writes', '审核档位可改并回显');
  ok(store.approvalMode() === 'all-writes', '档位立即生效（无需重启）');
  res = await hit(routes, '/api/github/audit/settings', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ approvalMode: 'sometimes' }) });
  ok(res.statusCode === 400, '非法审核档位 → 400');
  // 改预算不应把档位冲掉（三个字段同文件，最容易写漏的一处）
  res = await hit(routes, '/api/github/audit/settings', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ budgetMB: 8 }) });
  ok(res.body.data.approvalMode === 'all-writes', '改预算不覆盖已保存的审核档位');
  await store.dispose();
}

console.log('\n--- 8. Fail-Open：任何失败都不许冒泡到 apply() ---');
{
  // 目录位置被一个**文件**占住 → mkdir 必然失败
  const dir = tmpDir();
  const blocked = path.join(dir, 'blocked');
  writeFileSync(blocked, 'x', 'utf8');
  let threw = false;
  let store = null;
  try {
    store = new AuditStore({ dir: blocked, flushDelayMs: 0 });
  } catch {
    threw = true;
  }
  ok(threw === false, '构造期不抛错（否则 apply() 失败 → 19 个工具全丢）');
  ok(store && typeof store.degradedReason === 'string' && store.degradedReason.length > 0, '降级原因可见（不静默）');
  let recordThrew = false;
  try { store.recordCall('github_pr', { action: 'merge', pr_number: 1 }, { ok: true }, { callId: 'z' }); } catch { recordThrew = true; }
  ok(recordThrew === false, '降级态下 recordCall 不抛');
  ok(store.list().total === 0, '降级态下列表为空而不是假数据');

  // 正常 store：卸载后调用不抛，且不再写盘
  const good = makeStore();
  good.recordCall('github_pr', { action: 'merge', pr_number: 7 }, { ok: true }, { callId: 'g1' });
  await good.dispose();
  let afterDisposeThrew = false;
  try {
    good.recordCall('github_pr', { action: 'merge', pr_number: 7 }, { ok: true }, { callId: 'g2' });
    await good.flush();
  } catch { afterDisposeThrew = true; }
  ok(afterDisposeThrew === false, 'dispose 之后调用不抛');
  const after = readFileSync(good.filePath(), 'utf8');
  ok(!after.includes('"g2"'), 'dispose 之后的调用不再落盘');

  let doubleDisposeThrew = false;
  try { await good.dispose(); } catch { doubleDisposeThrew = true; }
  ok(doubleDisposeThrew === false, 'dispose 幂等');

  // 非 github_ 前缀直接忽略
  const other = makeStore();
  other.recordCall('pwsh', { command: 'ls' }, { ok: true }, { callId: 'o1' });
  ok(other.list().total === 0, '非 github_* 工具不入记录');
  await other.dispose();
}

console.log('\n--- 9. 结果形状：归一化包装与原始载荷都认 ---');
{
  ok(extractOutcome({ isError: false, value: { ok: true }, content: [] }).ok === true, '包装形状的成功');
  const wrappedFail = extractOutcome({ isError: true, error: { message: 'boom', info: { code: 'SCOPE_REQUIRED' } }, content: [] });
  ok(wrappedFail.ok === false, '包装形状的失败');
  ok(wrappedFail.errorType === 'SCOPE_REQUIRED', '失败优先取 info.code');
  ok(extractOutcome({ ok: true }).ok === true, '原始载荷的成功');
  const rawFail = extractOutcome({ ok: false, error: 'Workflow run not found' });
  ok(rawFail.ok === false && rawFail.errorType === 'Workflow run not found', '原始载荷的失败与错误文案');
  ok(extractOutcome({ isError: false, value: { status: 'AWAITING_CONFIRMATION' }, content: [] }).status === 'AWAITING_CONFIRMATION',
    '包装形状里能取到原始 status');
  ok(extractOutcome({ ok: true, degraded: true }).degraded === true, 'degraded 标记被提取');

  // 遥测同样是双形状：这是长期读错层级的那处，回归用
  const tel = new TelemetryCollector(50);
  tel.recordCall('github_release', { action: 'delete' }, { isError: false, value: { status: 'AWAITING_CONFIRMATION' }, content: [] });
  tel.recordCall('github_run', { action: 'view' }, { isError: true, error: { message: 'x', info: { code: 'NOT_FOUND' } }, content: [] });
  tel.recordCall('github_repo', { action: 'read_file' }, { isError: false, value: { ok: true, degraded: true }, content: [] });
  const summary = tel.getSummary();
  ok(summary.confirmBlockedCount === 1, '遥测：包装形状下 confirmBlocked 能正确计入');
  ok(summary.failureCount === 1, '遥测：包装形状下失败能正确计入');
  ok(summary.degradedCount === 1, '遥测：包装形状下降级能正确计入');
}

console.log('\n--- 10. 仓库解析：不 spawn gh，失败不猜 ---');
{
  const fakeExecutor = {
    resolveExecScope: () => ({ cwd: 'D:/repo', sessionId: 's1' }),
    getRepoIdentityFromLocal: () => ({ nameWithOwner: 'ItQianChen/dsh-github-flow' }),
  };
  ok(resolveRepoFromExec(fakeExecutor, {}, {}) === 'ItQianChen/dsh-github-flow', '从本地 git 身份解析仓库');
  ok(resolveRepoFromExec(fakeExecutor, {}, { repo: 'a/b' }) === 'a/b', '显式 repo 优先');
  ok(resolveRepoFromExec({ resolveExecScope: () => ({ cwd: 'D:/repo' }) }, {}, {}) === undefined, '解析不到时返回 undefined（不猜）');
  ok(resolveRepoFromExec({}, {}, {}) === undefined, '无 executor 时安全降级');
  ok(resolveRepoFromExec({}, {}, { repo: 'foo' }) === undefined, '无斜杠的 repo 脏值不回吐（只有 owner/name 才算数）');
  ok(resolveRepoFromExec({ resolveExecScope: () => { throw new Error('boom'); } }, {}, {}) === undefined, '异常被吞掉');

  const store = makeStore({ scopeResolver: (exec, args) => resolveScopeFromExec(fakeExecutor, exec, args) });
  store.recordCall('github_pr', { action: 'merge', pr_number: 19 }, { ok: true }, { callId: 'rp1' });
  ok(store.list().items[0].repo === 'ItQianChen/dsh-github-flow', '记录里带上仓库全名');
  ok(store.list().items[0].cwd === 'D:/repo', '记录里带上工作区路径（右侧栏按它做作用域）');
  const scope = resolveScopeFromExec(fakeExecutor, {}, {});
  ok(scope.repo === 'ItQianChen/dsh-github-flow' && scope.cwd === 'D:/repo', 'resolveScopeFromExec 同时给出 repo 与 cwd');
  ok(resolveScopeFromExec({}, {}, {}) .cwd === undefined, '无 executor 时 cwd 也是 undefined');
  await store.dispose();
}

console.log('\n--- 10b. 作用域过滤：全局 vs 当前工作区 ---');
{
  const store = makeStore({
    scopeResolver: (exec) => ({ cwd: exec && exec.ws, repo: 'o/r' }),
  });
  store.recordCall('github_pr', { action: 'merge', pr_number: 1 }, { ok: true }, { callId: 'w1', ws: 'D:/ws-a' });
  store.recordCall('github_pr', { action: 'merge', pr_number: 2 }, { ok: true }, { callId: 'w2', ws: 'D:/ws-b' });
  ok(store.list().total === 2, '不加 cwd 过滤 = 全局视角，两条都在');
  ok(store.list({ cwd: 'D:/ws-a' }).total === 1, 'cwd 精确匹配只返回该工作区的记录');
  ok(store.list({ cwd: 'D:/ws-a' }).items[0].id === 'w1', '命中的确实是那个工作区的那条');
  ok(store.list({ cwd: 'D:\\ws-a\\' }).total === 1, '反斜杠 + 尾斜杠写法也能命中（路径归一）');
  ok(process.platform !== 'win32' || store.list({ cwd: 'd:/WS-A' }).total === 1, 'Windows 下大小写不敏感也能命中');
  ok(store.list({ cwd: 'D:/ws-a/deeper' }).total === 0, '不做前缀匹配：子目录不算同一个工作区');
  ok(store.list({ cwd: 'D:/ws-a', write: true, risk: 'destructive' }).total === 1, 'cwd 与其它筛选可叠加');
  await store.dispose();
}

console.log('\n--- 11. 客户端登记（漏了就是白屏，且构建成功）---');
{
  const buildSrc = readFileSync(path.join(ROOT, 'scripts/build.mjs'), 'utf8');
  ok(buildSrc.includes("'audit-modal.js'"), 'build.mjs 的 leadingModules 已登记 audit-modal.js');
  const idxAudit = buildSrc.indexOf("'audit-modal.js'");
  const idxUtils = buildSrc.indexOf("'utils.js'");
  const idxStyles = buildSrc.indexOf("'styles.js'");
  ok(idxAudit > idxUtils && idxAudit > idxStyles, 'audit-modal 排在其依赖 utils / styles 之后');

  const modalPath = path.join(ROOT, 'lib/ui/audit-modal.js');
  ok(existsSync(modalPath), 'lib/ui/audit-modal.js 已产出');
  const modalSrc = readFileSync(modalPath, 'utf8');
  const topLevelH = modalSrc.split('\n').some((l) => /^var h = React\.createElement/.test(l));
  ok(topLevelH === false, '没有顶层 var h（会与其他模块在同一 bundle 作用域内相撞）');

  const clientSrc = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
  // 构建器会剥掉 import，因此要断言的是**内联块**里没有 import（源文件有 import 是正常的）
  const start = clientSrc.indexOf('[Bundled: audit-modal.js]');
  const nextMarker = clientSrc.indexOf('// ---- [Bundled:', start + 20);
  const block = clientSrc.slice(start, nextMarker > 0 ? nextMarker : undefined);
  ok(start > 0 && block.length > 200, 'client.js 里确实内联了 audit-modal（块非空）');
  ok(!/^\s*import\s/m.test(block), '内联块里没有 import（构建器已剥除，符号不会变 undefined）');
  const topLevelImport = modalSrc.split('\n').filter((l) => /^import\s/.test(l)).length;
  ok(topLevelImport <= 1, '源模块最多一条 import（只依赖 utils，不引入 react）');

  // 筛选候选必须与记录作用域一致：只列 PR / Issue（列 Release 之类的选项永远选不出东西）
  const filterValues = modalSrc.match(/value: 'github_[a-z_]+'/g) || [];
  ok(filterValues.length === 2, `工具筛选候选只有 2 项（实际 ${filterValues.length}）`, filterValues.join(','));
  ok(!modalSrc.includes("value: 'github_release'"), '筛选候选里没有作用域外的工具');

  // 两个入口必须是两种作用域：驾驶舱全局、右栏当前工作区
  ok(/scope:\s*["']workspace["']/.test(clientSrc), '右栏入口传 scope="workspace"');
  ok(/scope:\s*["']global["']/.test(clientSrc), '驾驶舱入口传 scope="global"');
  ok(/cwd:\s*cwd/.test(clientSrc), '右栏入口把当前 cwd 传进弹窗（否则工作区视图无从过滤）');
}

console.log('\n--- 12. 集成：真 cordis Context 下 tools/result 切面真的会写入 ---');
{
  /*
   * 为什么必须有这一节：s1 的**全部**价值都压在一个假设上——
   * 「宿主 dispatch 工具后，我们用 onHostEvent 挂的 tools/result 监听器会被调到」。
   * 单测只能证明 store 会写盘，证明不了这个接线存在；而它一旦不成立，
   * 界面上永远显示「还没有记录」，且没有任何报错。这里用真 Context 挂一遍插件，
   * 再手动 emit 一次 tools/result，把接线本身变成断言。
   *
   * 隔离：DSH_HOME 指向临时目录，绝不碰用户真实的 ~/.dsh/data/dsh-github-flow。
   */
  const { Context } = await import('@deepseek-ai/cordis');
  const home = tmpDir();
  const prevHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  let root = null;
  try {
    const registered = [];
    root = new Context();
    // 裸 Context 没有 tools 服务，而 apply() 会无条件 ctx.tools.register(...)：
    // 不提供就抛错（这正是 CLI profile 里插件必须能活下来的那类约束）。
    root.provide('tools', { register(def) { registered.push(def); return () => {}; } });
    const main = await import(lib('lib/main.js'));
    main.apply(root, main.Config({ checkUpdate: false }));
    await sleep(50);
    ok(registered.length === 19, '裸 Context 下 19 个工具照常注册（缺 webServer/commands 只让子 fiber PENDING）');

    root.emit('tools/result',
      { name: 'github_issue', arguments: { action: 'close', issue_number: 3 }, callId: 'it-1', agent: { id: 'sess-it' } },
      { isError: false, value: { ok: true }, content: [] });
    await sleep(400);

    /*
     * s3 起记录分段落盘：`audit/audit.<pid>-<ts>-<seq>.jsonl`，每进程一段。
     * 断言仍要证明"真的落盘了"，只是不再假设那唯一一个文件名。
     */
    const segDir = path.join(home, 'data', 'dsh-github-flow', 'audit');
    const segs = existsSync(segDir) ? readdirSync(segDir).filter((n) => n.endsWith('.jsonl')) : [];
    ok(segs.length >= 1, 'DSH_HOME 下真的落盘了记录段（tools/result 接线成立）', `段数=${segs.length}`);
    const text = segs.map((n) => readFileSync(path.join(segDir, n), 'utf8')).join('\n');
    ok(text.includes('"kind":"intent"') && text.includes('关闭 Issue #3'), '写操作产生了带人话摘要的 intent 行');
    ok(text.includes('sess-it'), '会话 id 被记录');
    ok(text.includes('"ok":true'), '结果行被记录');
  } catch (err) {
    ok(false, '集成装载未抛错', err && err.message);
  } finally {
    try { await root?.dispose?.(); } catch { /* 无 dispose 也不影响结论 */ }
    if (prevHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prevHome;
  }
}

console.log('\n--- 13. 保留预算：派生行数 / 字节闸门 / UTF-8 记账 ---');
{
  // 派生行数：纯函数，clamp 到 1000–200000，正常永不触发
  ok(deriveMaxRows(8 * 1024 * 1024) === Math.floor((8 * 1024 * 1024) / 120), '8 MB 按 120B/行派生行数');
  ok(deriveMaxRows(1024) === 1000, '极小预算钳到行数下限 1000');
  ok(deriveMaxRows(1e9) === 200000, '极大预算钳到行数上限 200000');
  ok(clampBudget(0) === 8 * 1024 * 1024, '预算 0 → 回落默认 8 MB（不是"关闭"）');
  ok(clampBudget(1e9) === 64 * 1024 * 1024, '预算超上限 → 64 MB');
  ok(clampBudget(1024 * 1024) === 1024 * 1024, '合法预算原样通过');

  // 字节闸门：一条带 2000 字中文留言的 decision 行 ≈ 6 KB，256 KB 预算约 40 余行就满
  const store = makeStore({ maxBytes: 256 * 1024 });
  for (let i = 0; i < 120; i++) {
    store.recordCall('github_pr', { action: 'merge', pr_number: i }, { ok: true }, { callId: 'z' + i });
    store.recordDecision('z' + i, 'rejected', '中'.repeat(2000));
  }
  const u = store.usage();
  ok(u.maxBytes === 256 * 1024, '预算按传入值生效');
  ok(u.bytes <= u.maxBytes, '灌满后记账字节 ≤ 预算（字节闸门生效）');
  ok(u.rows < 240, '行数远未到派生上限就已淘汰（拦住它的是字节，不是行数）');
  await store.flush();
  const size = statSync(store.filePath()).size;
  ok(size <= u.maxBytes + 8 * 1024, `文件真实大小也 ≤ 预算（实际 ${size} B)`);
  ok(Math.abs(u.bytes - size) <= 8 * 1024, '记账字节与文件真实大小一致（UTF-8 记账正确）');
  ok(u.bytes > 200 * 1024, '中文按 3 字节/字记账（若用字符数会少算 3 倍）');
  ok(store.list({ limit: 1 }).items[0].callId === 'z119', '淘汰只丢最早的：最新一条仍在');
  await store.dispose();
}

console.log('\n--- 14. 开关：默认开 / 可关 / 热切 ---');
{
  /*
   * 这里同时覆盖 s3 的**旧布局迁移**：`audit.jsonl`（单文件）现在是"最旧的一段"，
   * 首次启动时被导入本进程段并删除。升级绝不能把用户历史弄丢。
   */
  const dir = tmpDir();
  const legacy = path.join(dir, 'audit.jsonl');
  writeFileSync(
    legacy,
    JSON.stringify({ v: 1, kind: 'intent', id: 'old', at: 1, tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '旧记录' }) + '\n',
    'utf8'
  );
  const off = new AuditStore({ dir, flushDelayMs: 0, enabled: false });
  ok(off.usage().enabled === false, 'enabled=false 反映在 usage');
  ok(off.rowCount() === 0, '关闭态不加载历史（零内存、零启动成本）');
  off.recordCall('github_pr', { action: 'merge', pr_number: 1 }, { ok: true }, { callId: 'off1' });
  await off.flush();
  // 关闭态下本段文件可能根本还没被创建（零 I/O 是设计目标），所以先判存在再读内容
  const offBody = existsSync(off.filePath()) ? readFileSync(off.filePath(), 'utf8') : '';
  ok(!offBody.includes('off1'), '关闭态不写盘');
  // 关闭态不加载 = 不迁移，旧文件原样不动（那是用户的文件）
  ok(existsSync(legacy) && readFileSync(legacy, 'utf8').includes('"id":"old"'), '关闭态不动历史文件（那是用户的文件）');

  const on = await off.setEnabled(true);
  ok(on.enabled === true && on.rows === 1, '重新开启后加载历史');
  // 开启时迁移：旧单文件的行进入本进程段，旧文件被移除（先落盘再删，任一步失败都不丢数据）
  ok(existsSync(off.filePath()) && readFileSync(off.filePath(), 'utf8').includes('"id":"old"'),
    '旧单文件的历史被迁进段文件（升级不丢记录）');
  ok(!existsSync(legacy), '迁移完成后旧单文件被移除（不会下次启动再导入一遍）');

  off.recordCall('github_pr', { action: 'merge', pr_number: 2 }, { ok: true }, { callId: 'on1' });
  await off.flush();
  ok(readFileSync(off.filePath(), 'utf8').includes('on1'), '开启后恢复写盘');

  // 优先级：设置文件（UI 改的） > 构造参数（静态配置）
  await off.setEnabled(false);
  ok(existsSync(path.join(dir, 'audit-settings.json')), '开关变化落 audit-settings.json');
  ok(JSON.parse(readFileSync(path.join(dir, 'audit-settings.json'), 'utf8')).enabled === false, '落盘内容与开关一致');
  const re = new AuditStore({ dir, flushDelayMs: 0, enabled: true });
  ok(re.usage().enabled === false, '设置文件优先于静态配置');
  await re.clear();
  ok(readFileSync(re.filePath(), 'utf8').trim() === '', '关闭态也能清空历史文件');
  await re.dispose();
  await off.dispose();
}

console.log('\n--- 15. 热改预算 ---');
{
  const store = makeStore({ maxBytes: 256 * 1024 });
  for (let i = 0; i < 60; i++) {
    store.recordCall('github_pr', { action: 'merge', pr_number: i }, { ok: true }, { callId: 'h' + i });
    store.recordDecision('h' + i, 'rejected', '中'.repeat(2000));
  }
  ok(store.usage().bytes <= 256 * 1024, '初始预算下已淘汰到预算内');
  const before = store.usage().rows;
  await store.setBudget(16 * 1024 * 1024);
  ok(store.usage().maxBytes === 16 * 1024 * 1024, 'setBudget 立即生效（无需重启）');
  ok(store.usage().rows === before, '放大预算不会凭空补回已淘汰的行');
  await store.setBudget(256 * 1024);
  ok(store.usage().maxBytes === 256 * 1024 && store.usage().bytes <= 256 * 1024, '再改小也立即生效并当场淘汰');
  await store.dispose();
}

console.log('\n--- 16. 降级与关闭的语义分离 / 单行超预算 ---');
{
  // 降级：用户开关仍是"开"，但实际不可用 —— 两者必须分开报，否则开关会显示成关的、
  // 再点又"无变化"，变成怎么点都不动的死开关
  const dir = tmpDir();
  const blocked = path.join(dir, 'blocked');
  writeFileSync(blocked, 'x', 'utf8');
  const bad = new AuditStore({ dir: blocked, flushDelayMs: 0 });
  ok(bad.usage().enabled === true, '降级时 enabled（用户意图）仍为 true');
  ok(bad.usage().active === false, '降级时 active（实际可用）为 false');
  ok(typeof bad.usage().degraded === 'string', '降级原因可见');
  await bad.dispose();

  // 关闭态下 recordDecision 也不许写盘（s2 的 onDisabled 结算会走这里）
  const off = new AuditStore({ dir: tmpDir(), flushDelayMs: 0, enabled: false });
  off.recordDecision('x1', 'rejected', '这条不该落盘');
  await off.flush();
  const offBody = existsSync(off.filePath()) ? readFileSync(off.filePath(), 'utf8') : '';
  ok(!offBody.includes('这条不该落盘'), '关闭态下 decision 行不落盘（文件甚至没被创建）');
  await off.dispose();
}

console.log('\n--- 17. 内联别名必须被绑定（2026-11-26「点操作记录白屏」事故）---');
{
  /*
   * 事故复现链：`audit-modal.ts` 写的是 `import { formatRelativeTime as fmtRelative }`，
   * 构建器内联时把 import 行删了却没落别名 → bundle 里 `fmtRelative` 永远 undefined。
   * 列表为空时不调用 renderRow 所以看不出问题；一旦有记录，第一行就抛
   * ReferenceError，React 整棵树卸载 = 白屏。tsc 通过、build 成功、「内联块无残留
   * import」的断言也全绿，只有真点一下才炸。
   */
  const bundle = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
  const bad = [];
  for (const f of readdirSync(path.join(ROOT, 'src/ui')).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(path.join(ROOT, 'src/ui', f), 'utf8');
    for (const hit of src.matchAll(/^\s*import\s*\{([^}]*)\}\s*from/gm)) {
      for (const raw of String(hit[1]).split(',')) {
        const parts = raw.trim().split(/\s+as\s+/);
        if (parts.length !== 2) continue;
        const local = parts[1].trim();
        if (!new RegExp('var\\s+' + local + '\\s*=').test(bundle)) bad.push(`${f}: ${local}`);
      }
    }
  }
  ok(bad.length === 0, '内联模块的 import 别名在 bundle 里都有绑定（否则只在用到时抛 ReferenceError）', bad.join(', '));
  ok(/var fmtRelative = formatRelativeTime/.test(bundle), 'fmtRelative 这个历史别名已被显式绑定');

  // build.mjs 的另一条护栏：输入输出同文件，跳过 tsc 重跑会把模块重复内联
  const buildSrc = readFileSync(path.join(ROOT, 'scripts/build.mjs'), 'utf8');
  ok(buildSrc.includes("// ---- [Bundled:"), 'build.mjs 会拒绝在已聚合的 client.js 上二次内联');
}

console.log('\n--- 18. 参数快照：记录必须自包含（被拒绝的操作远端不存在）---');
{
  /*
   * 为什么要有这一组：详情页原来只靠"去 GitHub 拉"。但被拒绝的操作在远端**根本不存在**
   * （`pr create` 被拒时连 PR 都没有），远端内容还会腐烂（PR 删除、仓库改名、权限丢失）。
   * 所以记录必须在写入时就把"当时提交了什么"存下来。
   */
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-audit-snap-'));
  tmpDirs.push(dir);
  const store = new AuditStore({ dir, flushDelayMs: 0 });
  const args = { action: 'create', title: '修复登录重试', body: '正文：把重试次数从 3 改成 5', base: 'master' };
  store.recordCall('github_pr', args, { ok: true }, { callId: 'snap1', agent: { id: 's1' } });
  const row = store.list().items[0];
  ok(typeof row.args === 'string' && row.args.length > 10, 'intent 行带参数快照');
  ok(row.args.includes('修复登录重试'), '快照里能读到用户真正提交的标题');
  ok(row.args.includes('重试次数从 3 改成 5'), '快照里能读到正文');
  ok(row.argsTruncated === undefined, '未超长时不打截断标记');

  // 超长正文必须被裁，且**显式**标记（不能让人以为原文就这么短）
  const longBody = '很长的正文'.repeat(800);
  store.recordCall('github_pr', { action: 'create', title: 'x', body: longBody }, { ok: true }, { callId: 'snap2' });
  const rows2 = store.list().items;
  const longRow = rows2.find((r) => r.callId === 'snap2');
  ok(typeof longRow.args === 'string' && longRow.args.length <= 4000, '超长参数被裁到 4000 字符预算内', `实际 ${longRow.args.length}`);
  ok(longRow.argsTruncated === true, '被裁时显式标记 argsTruncated');
  ok(Array.isArray(longRow.fieldsTruncated) && longRow.fieldsTruncated.includes('body'),
    '被裁的字段名要点名（fieldsTruncated 含 body）', JSON.stringify(longRow.fieldsTruncated));

  /*
   * 2026-11-26 用户实证：详情里读不出拒绝时的正文。
   * 根因是旧实现 `JSON.stringify(args).slice(0, 2000)` —— 切在字符串中间，
   * `JSON.parse` 必然失败，UI 只能退化成一段被切碎的原文。这一条钉住"永远合法 JSON"。
   */
  {
    let parsed = null;
    let threw = null;
    try { parsed = JSON.parse(longRow.args); } catch (e) { threw = String(e && e.message); }
    ok(threw === null, '被裁后的快照仍然是**合法 JSON**（旧实现切半个 JSON，UI 解析必败）', threw);
    ok(parsed !== null && parsed.title === 'x', '即使被裁，标题这类短字段也完整保留');
    ok(parsed !== null && typeof parsed.body === 'string' && parsed.body.length > 1000,
      '正文保留可读的一大段（不是只剩几十字）', parsed && typeof parsed.body === 'string' ? String(parsed.body.length) : 'n/a');
  }

  // body_file 通道：正文在文件里，参数里只有路径 —— 必须补读，否则"拒绝时提交了什么"永远说不出来
  {
    const bodyPath = path.join(dir, 'body.md');
    const fileBody = '## 背景\n' + '来自文件的正文。'.repeat(50);
    writeFileSync(bodyPath, fileBody, 'utf8');
    store.recordCall('github_pr', { action: 'create', title: '来自文件', body_file: bodyPath }, { ok: true }, { callId: 'snap3' });
    const fileRow = store.list().items.find((r) => r.callId === 'snap3');
    const parsed = JSON.parse(fileRow.args);
    ok(typeof parsed.body === 'string' && parsed.body.includes('来自文件的正文'),
      'body_file 指向的正文被补进快照（否则只剩一条路径，等于没存内容）');
    ok(typeof parsed.body_file === 'string' && parsed.body_file.length > 0,
      '同时保留 body_file 原值（详情页可显示正文来自哪个文件）');
  }

  // 读不到文件时必须安静退回"只留路径"，绝不能因为补读失败让记录丢失
  {
    store.recordCall('github_pr', { action: 'create', title: 'x', body_file: 'Z:/definitely/missing.md' }, { ok: true }, { callId: 'snap4' });
    const missRow = store.list().items.find((r) => r.callId === 'snap4');
    ok(typeof missRow.args === 'string' && missRow.args.includes('missing.md'), '补读失败仍保留路径（不吞掉这条记录）');
    ok(JSON.parse(missRow.args).body === undefined, '补读失败时不会塞入空的 body 键');
  }

  // 参数与决策行共存：被拒绝的记录仍能看到"提交了什么"
  store.recordDecision('snap1', 'rejected', '改成 squash 再试');
  const rejRow = store.list().items.find((r) => r.callId === 'snap1');
  ok(rejRow.decision === 'rejected' && typeof rejRow.args === 'string', '被拒绝的记录同时带决策与参数快照（详情页据此展示，不必访问 GitHub）');

  // 旧格式记录（没有 args / argsTruncated 字段）必须照常可读，不许因为缺字段崩。
  // 顺序要紧：先 dispose 让本实例刷完盘，再手写文件，否则会被它的末次 flush 覆盖。
  await store.dispose();
  writeFileSync(
    path.join(dir, 'audit.jsonl'),
    JSON.stringify({ v: 1, kind: 'intent', id: 'old1', at: Date.now(), tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '合并 PR #1' }) + '\n',
    'utf8'
  );
  const legacyStore = new AuditStore({ dir, flushDelayMs: 0 });
  ok(legacyStore.list().items[0].args === undefined, '旧格式记录没有 args 也能正常读出（UI 显示"没有保存快照"）');
  await legacyStore.dispose();
}

// ============================================================
console.log('\n--- 19. 详情弹窗的两条 UX 契约（2026-11-26 用户截图实证）---');
// ============================================================
{
  /*
   * 截图实证的两个问题，都是"能用但难看"的那一类，只能靠静态契约钉住：
   * ① 失败的操作（result=fail）仍然去 GitHub 拉内容 → 404 大红框把真正有用的
   *    「本次调用参数」压下去；那条记录里正文其实好好存着。
   * ② 「调用 ID」与「记录 ID」是同一个值（记录 id 就是宿主 callId），却占两行。
   */
  const modalSrc = readFileSync(path.join(ROOT, 'src/ui/audit-modal.ts'), 'utf8');
  ok(/detailRecord\.result !== 'ok'/.test(modalSrc),
    '失败的操作不去远端读内容（远端根本没有它的产物，只会得到 404 噪音）');
  ok(/detailRecord\.decision === 'rejected'/.test(modalSrc),
    '被拒绝的操作同样不去远端读（原有契约不回退）');
  ok(/'这次操作没有成功，远端没有产生内容/.test(modalSrc),
    '失败记录给一行中性说明，而不是抢占版面的大色块');
  ok(/it\.callId !== it\.id \? '调用 ID' : '记录 ID'/.test(modalSrc),
    '调用 ID 与记录 ID 相同时只渲染一行');
}

// ============================================================
console.log('\n--- 20. 被操作对象的标题（targetTitle）---');
// ============================================================
{
  /*
   * `合并 PR #19` 说不出"合的是哪一个"。标题由审核阶段查一次、暂存在 target-title.ts，
   * `recordCall` 按 callId 取走写进 intent 行。这一组钉住：取得到、能折叠、取不到不坏。
   */
  const { stashTargetTitle, takeTargetTitle, resetTargetTitles } = await import(lib('lib/target-title.js'));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-audit-title-'));
  tmpDirs.push(dir);
  const store = new AuditStore({ dir, flushDelayMs: 0 });

  // ① 正常路径：审核暂存 → 记录取走 → 折叠后可读
  resetTargetTitles();
  stashTargetTitle('t1', 'fix: 权限校验失效');
  store.recordCall('github_pr', { action: 'merge', pr_number: 19 }, { ok: true }, { callId: 't1', agent: { id: 's' } });
  const t1 = store.list().items.find((r) => r.callId === 't1');
  ok(t1.targetTitle === 'fix: 权限校验失效', '记录里存下了被操作对象的标题');
  ok(t1.summary === '合并 PR #19（squash）', 'summary 仍是"动作"（标题单独存，不拼进去）');
  ok(takeTargetTitle('t1') === undefined, '记录取走后暂存即清（一次性消费）');

  // ② 没走审核的调用（档位 off / never / 读操作）：没有暂存，记录照常成立
  store.recordCall('github_pr', { action: 'merge', pr_number: 20 }, { ok: true }, { callId: 't2' });
  const t2 = store.list().items.find((r) => r.callId === 't2');
  ok(t2.targetTitle === undefined && t2.result === 'ok', '没有暂存时 targetTitle 缺省，记录不受影响');
  ok(!/targetTitle/.test(JSON.stringify(t2)), '缺省时不落一个空的 targetTitle 键（不浪费字节）');

  // ③ 落盘再读回：标题在 intent 行上，重启后仍在
  await store.dispose();
  const reloaded = new AuditStore({ dir, flushDelayMs: 0 });
  const r1 = reloaded.list().items.find((r) => r.callId === 't1');
  ok(r1.targetTitle === 'fix: 权限校验失效', '重载后标题仍在（落在 intent 行，不是只在内存）');
  await reloaded.dispose();

  // ④ 暂存表的防御：空 callId / 空标题不收；超过上限丢最早的
  resetTargetTitles();
  stashTargetTitle('', 'x');
  stashTargetTitle('k', '   ');
  ok(takeTargetTitle('') === undefined && takeTargetTitle('k') === undefined, '空 callId / 空白标题不入表');
  for (let i = 0; i < 70; i++) stashTargetTitle('p' + i, 't' + i);
  ok(takeTargetTitle('p0') === undefined, '超过上限时最早的一条已被丢弃');
  ok(takeTargetTitle('p69') === 't69', '最新的一条仍在');
  resetTargetTitles();
}

for (const d of tmpDirs) {
  try { rmSync(d, { recursive: true, force: true }); } catch { /* 临时目录清不掉不影响结论 */ }
}

console.log(`\n=== phase52 结果: ${passed} 通过 / ${failed} 失败 ===`);
if (failed > 0) process.exit(1);
