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

import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
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
  resolveRepoFromExec, resolveScopeFromExec,
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

  // 读操作：一行 result 自带身份（不留「发起但没结果」的假象，也省一半行数）
  store.recordCall('github_pr', { action: 'list' }, { ok: true }, { callId: 'c2' });
  ok(store.rowCount() === 3, '读操作只落 1 行');
  const read = store.list({ tool: 'github_pr' }).items.find((e) => e.callId === 'c2');
  ok(read && read.write === false && read.summary === '列出 PR', '读记录自带身份与摘要');

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
  ok(bytes.includes('c2'), '未删除的记录仍在文件里');
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
  const rows = [
    { v: 1, kind: 'intent', id: 'x1', at: 100, tool: 'github_issue', action: 'close', write: true, risk: 'destructive', summary: '关闭 Issue #1' },
    '{ 这行是断电留下的半行',
    { v: 1, kind: 'result', id: 'y1', at: 101, ok: true, tool: 'github_pr', action: 'list', write: false, risk: 'read', summary: '列出 PR' },
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

console.log('\n--- 6. 上限与分页 ---');
{
  const store = makeStore({ maxRows: 50 });
  for (let i = 0; i < 60; i++) store.recordCall('github_pr', { action: 'list' }, { ok: true }, { callId: 'k' + i });
  ok(store.rowCount() === 50, '超过 maxRows 后按时间尾部保留');
  const page = store.list({ limit: 200 });
  ok(page.total === 50, '折叠后总数等于上限');
  ok(page.items[0].at > page.items[49].at, '列表按时间倒序（最新在前）');
  const paged = store.list({ limit: 10, offset: 40 });
  ok(paged.items.length === 10 && paged.total === 50, 'limit/offset 分页正确');
  await store.flush();
  const lines = readFileSync(store.filePath(), 'utf8').trim().split('\n').filter(Boolean);
  ok(lines.length === 50, '压实后文件行数等于上限（超限部分真被丢弃）');
  ok(!lines[0].includes('"k0"'), '最早的那条已被截断');
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
  ok(routes.length === 3, '注册 3 条路由');
  ok(routes.every((r) => r.kind === 'exact'), '三条均为 exact 匹配');

  store.recordCall('github_pr', { action: 'merge', pr_number: 19 }, { ok: true }, { callId: 'r1' });
  store.recordCall('github_pr', { action: 'list' }, { ok: true }, { callId: 'r2' });

  let res = await hit(routes, '/api/github/audit/records', { method: 'GET', url: '/api/github/audit/records' });
  ok(res.statusCode === 200 && res.body.ok === true, 'GET 列表 200 + ok');
  ok(res.body.data.items.length === 2 && res.body.data.total === 2, '列表返回两条');
  ok(res.body.data.degraded === null, '未降级时 degraded 为 null');

  res = await hit(routes, '/api/github/audit/records', { method: 'GET', url: '/api/github/audit/records?write=1' });
  ok(res.body.data.items.length === 1 && res.body.data.items[0].write === true, 'write=1 只返回写操作');

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
  good.recordCall('github_pr', { action: 'list' }, { ok: true }, { callId: 'g1' });
  await good.dispose();
  let afterDisposeThrew = false;
  try {
    good.recordCall('github_pr', { action: 'list' }, { ok: true }, { callId: 'g2' });
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

    const f = path.join(home, 'data', 'dsh-github-flow', 'audit.jsonl');
    ok(existsSync(f), 'DSH_HOME 下真的落盘了 audit.jsonl（tools/result 接线成立）');
    const text = existsSync(f) ? readFileSync(f, 'utf8') : '';
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

for (const d of tmpDirs) {
  try { rmSync(d, { recursive: true, force: true }); } catch { /* 临时目录清不掉不影响结论 */ }
}

console.log(`\n=== phase52 结果: ${passed} 通过 / ${failed} 失败 ===`);
if (failed > 0) process.exit(1);
