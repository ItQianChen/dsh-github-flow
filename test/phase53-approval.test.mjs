// test/phase53-approval.test.mjs
//
// 执行前人工审核（s2）契约测试。
//
// 为什么独立成阶段：
// 1. 这一层有**六个出口**（批准 / 拒绝 / 超时 / 取消 / 无客户端 / 自身异常）。漏一个
//    就是 Agent 停在一次工具调用上等一个永不到来的点击——而且不报错、不超时、不恢复。
//    每个出口都必须单独钉死。
// 2. 拒绝结果**必须是 `isError: true`**：既是语义正确，也是唯一能绕开
//    `createSuccessResult` 的 `output.schema` 校验的路（dsh-tools pipeline:578-596）。
// 3. 「审核依附于记录」是硬约束（总纲 §5.8.2）：记录关闭 / 降级时审核必须停用，
//    否则会变成"审核能开、记录关着"的半开状态，事后无据可查。
// 4. 批准之后工具体内的 confirm 闸门必须**被旁路**，否则一次操作问两遍
//    （`setGateBypass` 只可能来自队列，缺省不装时 17 条闸门行为必须逐条不变）。

import { readFileSync, existsSync } from 'node:fs';
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
const { ApprovalQueue, hashArgs } = await import(lib('lib/approval.js'));
const {
  shouldAskApproval, buildPendingApproval, rejectionResult, cancelledResult, awaitingResult, createApprovalGate,
} = await import(lib('lib/approval-gate.js'));
const { wrapWithGate, guardDestructive, describeDestructive, setGateBypass, GATE_BLOCKED } = await import(lib('lib/destructive.js'));
const { WRITE_ACTIONS } = await import(lib('lib/tool-tiers.js'));
const { DESTRUCTIVE_ACTIONS } = await import(lib('lib/destructive.js'));
const { registerApprovalRoutes } = await import(lib('lib/api/routes-approval.js'));
const { sendJson, readJsonBody } = await import(lib('lib/api/route-helpers.js'));
const { Config } = await import(lib('lib/main.js'));
// 轮询器必须能离线驱动（注入假 window），否则"隐藏标签页停摆"这类缺陷只能靠人眼撞见
const { startApprovalWatcher } = await import(lib('lib/ui/approval-modal.js'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const execOf = (name, args, callId = 'c1') => ({ name, arguments: args, callId, agent: { id: 'sess-1' } });

/** 假 store：只提供审核层需要的两个方法 */
function fakeStore(active = true) {
  const decisions = [];
  return {
    decisions,
    usage: () => ({ enabled: active, active, rows: 0, bytes: 0, maxRows: 1000, maxBytes: 1024, degraded: active ? null : 'stub-degraded' }),
    recordDecision: (id, decision, feedback) => decisions.push({ id, decision, ...(feedback ? { feedback } : {}) }),
  };
}

function harness(options = {}) {
  const queue = new ApprovalQueue({ timeoutMs: options.timeoutMs ?? 1000, maxPending: options.maxPending });
  const store = fakeStore(options.active !== false);
  const handler = createApprovalGate({ queue, store, modeOf: () => options.mode ?? 'destructive' });
  const calls = { next: 0 };
  const next = async () => { calls.next++; return { isError: false, value: { ok: true }, content: [{ type: 'text', text: 'executed' }] }; };
  return { queue, store, handler, calls, next };
}

console.log('\n--- 1. 策略覆盖：五条前置缺一不可 ---');
{
  const active = fakeStore(true);
  const inactive = fakeStore(false);
  const merge = execOf('github_pr', { action: 'merge', pr_number: 19 });
  const create = execOf('github_pr', { action: 'create', title: 'x' });
  const list = execOf('github_pr', { action: 'list' });

  ok(shouldAskApproval(merge, active, 'off') === false, 'off 档位：任何调用都不问');
  ok(shouldAskApproval(merge, active, 'destructive') === true, 'destructive：merge 要问');
  ok(shouldAskApproval(execOf('github_issue', { action: 'delete', issue_number: 3 }), active, 'destructive') === true, 'destructive：issue delete 要问');
  ok(shouldAskApproval(create, active, 'destructive') === false, 'destructive：pr create（可逆写）不问');
  ok(shouldAskApproval(list, active, 'destructive') === false, 'destructive：读操作不问');
  ok(shouldAskApproval(create, active, 'all-writes') === true, 'all-writes：可逆写也要问');
  ok(shouldAskApproval(execOf('github_issue', { action: 'comment', issue_number: 1 }), active, 'all-writes') === true, 'all-writes：评论也要问');
  ok(shouldAskApproval(list, active, 'all-writes') === false, 'all-writes：读操作仍不问');
  ok(shouldAskApproval(execOf('pwsh', { command: 'ls' }), active, 'all-writes') === false, '非 github_* 工具一律不拦');
  ok(shouldAskApproval(merge, inactive, 'destructive') === false, '记录关闭（active=false）→ 审核停用');
  ok(shouldAskApproval(merge, inactive, 'all-writes') === false, '记录关闭时连 all-writes 也停用');
  ok(shouldAskApproval({}, active, 'destructive') === false, '畸形 exec 不炸');

  // 覆盖面必须与作用域一致：**只审 PR / Issue**，且 destructive 档恰好是
  // 这两个工具里命中闸门表的那些（pr: merge/revert/checkout-force；issue: close/delete/transfer）。
  // 注意要喂齐条件型闸门（`when`）需要的参数：checkout 要 force、transfer 要 target_repo，
  // 否则它们本来就该"不弹窗"，会把这条断言算成漏覆盖。
  const gateArgs = { pr_number: 1, issue_number: 1, force: true, target_repo: 'a/b' };
  let matched = 0;
  let total = 0;
  for (const tool of ['github_pr', 'github_issue']) {
    const table = DESTRUCTIVE_ACTIONS[tool] || {};
    for (const action of Object.keys(table)) {
      total++;
      if (shouldAskApproval(execOf(tool, { action, ...gateArgs }), active, 'destructive')) matched++;
    }
  }
  ok(matched === total && total === 6, `destructive 档恰好覆盖 PR/Issue 的 6 条高危（实际 ${matched}/${total}）`);

  // 条件型闸门（`when`）必须被尊重，而不是只按 action 名分类
  ok(shouldAskApproval(execOf('github_pr', { action: 'checkout' }), active, 'destructive') === false, 'checkout 不带 force 不弹窗（非破坏性）');
  ok(shouldAskApproval(execOf('github_pr', { action: 'checkout', force: true }), active, 'destructive') === true, 'checkout 带 force 才弹窗');
  ok(shouldAskApproval(execOf('github_issue', { action: 'delete' }), active, 'destructive') === false, '缺 issue_number 时不弹窗（该先报缺参）');
  ok(shouldAskApproval(execOf('github_issue', { action: 'delete', issue_number: 3 }), active, 'destructive') === true, '有 issue_number 才弹窗');

  // 作用域外的高危动作**不进审核**：它们有自己的 confirm 闸门，不该再弹一次
  ok(shouldAskApproval(execOf('github_release', { action: 'delete', tag: 'v1' }), active, 'destructive') === false, 'release delete 不弹窗（作用域外）');
  ok(shouldAskApproval(execOf('github_secret', { action: 'delete', name: 'NPM_TOKEN' }), active, 'destructive') === false, 'secret delete 不弹窗（作用域外）');
  ok(shouldAskApproval(execOf('github_label', { action: 'delete', name: 'bug' }), active, 'destructive') === false, 'label delete 不弹窗（作用域外）');
  ok(shouldAskApproval(execOf('github_cache', { action: 'delete', all: true }), active, 'all-writes') === false, 'all-writes 也不越过作用域');
}

console.log('\n--- 2. 待审请求的构造 ---');
{
  const item = buildPendingApproval(execOf('github_pr', { action: 'merge', pr_number: 19, merge_method: 'squash' }, 'call-9'), undefined);
  ok(item.id === 'call-9', 'id 复用宿主 callId（审批与闸门旁路靠它关联）');
  ok(item.summary === '合并 PR #19（squash）', '摘要复用审计层的人话文案');
  ok(/^[0-9a-f]{16}$/.test(item.argsHash), '参数指纹是 16 位十六进制');
  ok(item.argsHash === hashArgs({ action: 'merge', pr_number: 19, merge_method: 'squash' }), '指纹与 hashArgs 一致');
  ok(item.argsHash !== hashArgs({ action: 'merge', pr_number: 20, merge_method: 'squash' }), '换了参数指纹就变（批准的是那一份参数）');
  ok(typeof item.warning === 'string' && item.warning.includes('合并'), '命中闸门表时带出 warning');
  ok(typeof item.impact === 'string' && item.impact.length > 0, '命中闸门表时带出 impact');
  const plain = buildPendingApproval(execOf('github_pr', { action: 'create', title: 'x' }), undefined);
  ok(plain.warning === undefined && plain.impact === undefined, '未命中闸门表时不硬塞影响评估');
}

console.log('\n--- 3. 三种结果的形状 ---');
{
  const rej = rejectionResult(execOf('github_pr', { action: 'merge' }), '先改成 squash，别删分支');
  ok(rej.isError === true, '拒绝结果是失败结果（伪装成功会让模型以为合并了）');
  ok(rej.value === undefined, '拒绝结果不带 value（成功形状会被 schema 校验并重渲染）');
  ok(rej.error.info.code === 'APPROVAL_REJECTED', '错误码复用宿主字面量 APPROVAL_REJECTED');
  const payload = JSON.parse(rej.content[0].text);
  ok(payload.status === 'REJECTED_BY_USER', '载荷状态是 REJECTED_BY_USER（区别于 AWAITING_CONFIRMATION）');
  ok(payload.feedback === '先改成 squash，别删分支', '留言原文回传');
  ok(payload.requiredAction.includes('不要重试'), '明确告诉模型别重试同一动作');
  const noFb = JSON.parse(rejectionResult(execOf('github_pr', { action: 'merge' })).content[0].text);
  ok(noFb.feedback === undefined && noFb.reason.includes('未填写'), '没留言时给出默认话术');

  const cancel = cancelledResult();
  ok(cancel.isError === true && cancel.error.info.code === 'APPROVAL_CANCELLED', '取消结果用 APPROVAL_CANCELLED');

  const awaiting = awaitingResult(execOf('github_pr', { action: 'merge', pr_number: 4 }));
  ok(awaiting.isError === false, '超时退回的是成功形状（交给模型去问人）');
  ok(awaiting.value && awaiting.value.status === GATE_BLOCKED, '载荷仍是旧的 AWAITING_CONFIRMATION');
  ok(typeof awaiting.value.warning === 'string', '带出原有的 warning 文案');
  const generic = awaitingResult(execOf('github_pr', { action: 'create' }));
  ok(generic.value.status === GATE_BLOCKED && generic.value.warning.includes('需要确认'), '无闸门条目时给通用确认载荷');
}

console.log('\n--- 4. 六个出口 ---');
{
  // 批准
  {
    const { queue, handler, calls, next, store } = harness();
    queue.heartbeat();
    const p = handler(execOf('github_pr', { action: 'merge', pr_number: 1 }, 'a1'), next);
    ok(queue.size() === 1, '待审入队');
    // 指纹从真实待审项里取，而不是自己重算：这样连"载荷→UI→决策"整条链路一起验
    queue.decide('a1', 'approved', { token: queue.token, argsHash: queue.list()[0].argsHash });
    const result = await p;
    ok(calls.next === 1, '批准后 next() 恰好一次');
    ok(result && result.isError === false, '批准后返回的是工具真实结果');
    ok(store.decisions.some((d) => d.id === 'a1' && d.decision === 'approved'), '批准写进记录的决策行');
  }
  // 拒绝
  {
    const { queue, handler, calls, next, store } = harness();
    queue.heartbeat();
    const p = handler(execOf('github_pr', { action: 'merge', pr_number: 2 }, 'r1'), next);
    queue.decide('r1', 'rejected', { token: queue.token, argsHash: queue.list()[0].argsHash, feedback: '别合并，先改 squash' });
    const result = await p;
    ok(calls.next === 0, '拒绝后 next() 零次（工具没跑）');
    ok(result.isError === true && result.error.info.code === 'APPROVAL_REJECTED', '拒绝返回失败结果');
    ok(JSON.parse(result.content[0].text).feedback === '别合并，先改 squash', '留言原文进结果');
    ok(store.decisions.some((d) => d.decision === 'rejected' && d.feedback === '别合并，先改 squash'), '拒绝与留言写进记录');
  }
  // 无客户端（fail-open）
  {
    const { queue, handler, calls, next, store } = harness();
    ok(queue.isClientOnline() === false, '未收到心跳时视为无客户端');
    const result = await handler(execOf('github_pr', { action: 'merge', pr_number: 3 }, 'n1'), next);
    ok(calls.next === 1, '无客户端 → 立刻放行（交给旧的 confirm 闸门）');
    ok(result.isError === false, '无客户端时不返回拒绝');
    ok(queue.size() === 0, '没有留下悬挂的待审');
    ok(store.decisions.some((d) => d.decision === 'no-client'), '记录里标为 no-client');
  }
  // 超时（真实计时器）
  {
    const { queue, handler, calls, next, store } = harness({ timeoutMs: 1000 });
    queue.heartbeat();
    const started = Date.now();
    const result = await handler(execOf('github_pr', { action: 'merge', pr_number: 4 }, 't1'), next);
    ok(Date.now() - started >= 900, '超时前确实在等（没有提前放行）');
    ok(calls.next === 0, '超时后 next() 未被调用');
    ok(result.isError === false && result.value.status === GATE_BLOCKED, '超时退回旧 confirm 载荷');
    ok(store.decisions.some((d) => d.decision === 'expired'), '记录里标为 expired');
    // 带上正确指纹，确保被拒的理由是"已结束"而不是"指纹不符"（否则这条断言会假通过）
    ok(queue.decide('t1', 'approved', { token: queue.token, argsHash: hashArgs({ action: 'merge', pr_number: 4 }) }).reason === 'already-decided', '超时后迟到的决策被丢弃');
  }
  // 取消（宿主 abort）
  {
    const { queue, handler, calls, next, store } = harness();
    queue.heartbeat();
    const ac = new AbortController();
    const p = handler({ ...execOf('github_pr', { action: 'merge', pr_number: 5 }, 'x1'), signal: ac.signal }, next);
    ac.abort();
    const result = await p;
    ok(calls.next === 0, '取消后不执行');
    ok(result.error.info.code === 'APPROVAL_CANCELLED', '取消返回 APPROVAL_CANCELLED');
    ok(store.decisions.some((d) => d.decision === 'cancelled'), '记录里标为 cancelled');
  }
  // 运行中关闭记录 → pending 立刻结算为 expired，不干等到 180s
  {
    const { queue, handler, calls, next, store } = harness();
    queue.heartbeat();
    const p = handler(execOf('github_pr', { action: 'merge', pr_number: 6 }, 'd1'), next);
    queue.onDisabled('操作记录已关闭');
    const result = await p;
    ok(calls.next === 0, '关闭后 pending 立刻结算（不阻塞）');
    ok(result.value && result.value.status === GATE_BLOCKED, '结算结果为 expired → 退回旧 confirm 载荷');
    ok(store.decisions.some((d) => d.decision === 'expired'), '结算写进记录');
    ok(queue.isDisabled() === true && queue.disabledBecause() === '操作记录已关闭', '停用原因可读');
  }
  // 自身异常 → 放行（绝不阻断工具）
  {
    const queue = new ApprovalQueue({ timeoutMs: 1000 });
    const broken = {
      usage: () => { throw new Error('store boom'); },
      recordDecision: () => { throw new Error('store boom'); },
    };
    const handler = createApprovalGate({ queue, store: broken, modeOf: () => 'destructive' });
    let nextCalled = 0;
    const result = await handler(execOf('github_pr', { action: 'merge', pr_number: 7 }, 'e1'), async () => { nextCalled++; return { isError: false, value: {}, content: [] }; });
    ok(nextCalled === 1, '审核自身异常 → 放行（按"没审核"处理）');
    ok(result && result.isError === false, '异常路径不吞掉工具结果');
  }
}

console.log('\n--- 5. 与既有 confirm 闸门的协同 ---');
{
  const tool = wrapWithGate({
    name: 'github_pr',
    description: 'x',
    output: { schema: { type: 'object' }, render: () => [{ type: 'text', text: 'ok' }] },
    async execute() { return { ok: true, merged: true }; },
  });

  setGateBypass(undefined);
  const gated = await tool.execute({ action: 'merge', pr_number: 8 }, { callId: 'no-grant' });
  ok(gated.status === GATE_BLOCKED, '未批准时 confirm 闸门照旧拦截');
  ok(guardDestructive('github_pr', { action: 'merge', pr_number: 8 }) !== undefined, 'guardDestructive 未变');
  ok(guardDestructive('github_pr', { action: 'merge', pr_number: 8, confirm: true }) === undefined, '带 confirm 时照旧放行');

  setGateBypass((exec) => exec?.callId === 'granted-call');
  const passed = await tool.execute({ action: 'merge', pr_number: 8 }, { callId: 'granted-call' });
  ok(passed.merged === true, '已批准的 callId 跳过 confirm 闸门（审批取代 confirm，不叠两次）');
  const other = await tool.execute({ action: 'merge', pr_number: 8 }, { callId: 'another-call' });
  ok(other.status === GATE_BLOCKED, '旁路只对那一个 callId 生效');

  setGateBypass(undefined);
  const restored = await tool.execute({ action: 'merge', pr_number: 8 }, { callId: 'granted-call' });
  ok(restored.status === GATE_BLOCKED, '清除钩子后恢复原行为（热重载必须清干净）');

  // phase38 回归抽查：默认（无钩子）下闸门表行为逐条不变
  let intact = 0;
  for (const [name, table] of Object.entries(DESTRUCTIVE_ACTIONS)) {
    for (const action of Object.keys(table)) {
      const payload = guardDestructive(name, { action, pr_number: 1, issue_number: 1, tag: 'v1', name: 'n', gist_id: 'g', cache_id: 'c', codespace: 'cs', item_id: 'i', skill_name: 's', repository: 'a/b' });
      const desc = describeDestructive(name, { action, pr_number: 1, issue_number: 1, tag: 'v1', name: 'n', gist_id: 'g', cache_id: 'c', codespace: 'cs', item_id: 'i', skill_name: 's', repository: 'a/b' });
      if ((desc === undefined) === (payload === undefined) && (payload === undefined || payload.status === GATE_BLOCKED)) intact++;
    }
  }
  ok(intact === 17, `17 条闸门在无钩子时行为不变（${intact}/17）`);
}

console.log('\n--- 6. 路由契约 ---');
{
  const routes = [];
  const deps = { bindRoute: (r) => routes.push(r), sendJson, readJsonBody };
  const queue = new ApprovalQueue({ timeoutMs: 1000 });
  registerApprovalRoutes(deps, queue);
  ok(routes.length === 3, '注册 3 条路由（待审 / 决策 / 心跳）');
  ok(routes.every((r) => r.kind === 'exact'), '三条均为 exact 匹配');

  const REQ_OK = { host: '127.0.0.1:62892', origin: 'http://127.0.0.1:62892', 'content-type': 'application/json' };
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
    const res = { statusCode: 0, headers: {}, body: null, setHeader(k, v) { res.headers[k] = v; }, end(b) { res.body = b ? JSON.parse(b) : null; } };
    return res;
  }
  const hit = async (p, opts) => {
    const r = routes.find((x) => x.path === p);
    const res = makeRes();
    await r.handler(makeReq(opts), res);
    return res;
  };

  let res = await hit('/api/github/approval/pending', { method: 'GET' });
  ok(res.statusCode === 200 && typeof res.body.data.token === 'string', 'GET 待审返回令牌（决策请求要带它）');
  ok(res.body.data.clientOnline === true, '轮询本身即在线证据（心跳被刷新）');
  ok(Array.isArray(res.body.data.items), 'items 是数组');

  // 造一条 pending
  const pending = queue.ask({ id: 'p1', at: 1, tool: 'github_pr', action: 'merge', summary: '合并 PR #1', argsHash: 'h' });
  res = await hit('/api/github/approval/pending', { method: 'GET' });
  ok(res.body.data.items.length === 1 && res.body.data.items[0].id === 'p1', '列表里能看到待审项');

  res = await hit('/api/github/approval/pending', { method: 'POST' });
  ok(res.statusCode === 405, '待审端点拒绝 POST（405）');

  res = await hit('/api/github/approval/decision', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ id: 'p1', decision: 'approved', token: 'wrong' }) });
  ok(res.statusCode === 403, '令牌不对 → 403');
  res = await hit('/api/github/approval/decision', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ id: 'p1', decision: 'maybe', token: queue.token }) });
  ok(res.statusCode === 400, 'decision 非法 → 400');
  res = await hit('/api/github/approval/decision', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ id: 'p1', decision: 'rejected', token: queue.token, feedback: '中'.repeat(2001) }) });
  ok(res.statusCode === 400, '留言超 2000 字 → 400');
  res = await hit('/api/github/approval/decision', { method: 'POST', headers: { ...REQ_OK, origin: 'http://evil.example' }, body: JSON.stringify({ id: 'p1', decision: 'approved', token: queue.token }) });
  ok(res.statusCode === 403, '跨源请求被拒（CSRF 门）');
  // 指纹是决策的必传项：弹窗上显示了「参数指纹」，它就必须真的参与校验
  res = await hit('/api/github/approval/decision', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ id: 'p1', decision: 'approved', token: queue.token }) });
  ok(res.statusCode === 400, '缺 argsHash → 400（显示的指纹必须带回）');
  res = await hit('/api/github/approval/decision', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ id: 'p1', decision: 'approved', token: queue.token, argsHash: 'zzz' }) });
  ok(res.statusCode === 400, 'argsHash 不匹配 → 400');
  ok(queue.size() === 1, '指纹不符不消费待审项（还能再决策）');
  res = await hit('/api/github/approval/decision', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ id: 'p1', decision: 'rejected', token: queue.token, argsHash: 'h', feedback: '改 squash' }) });
  ok(res.statusCode === 200, '合法决策 → 200');
  const outcome = await pending;
  ok(outcome.decision === 'rejected' && outcome.feedback === '改 squash', '决策送到队列并带回留言');
  res = await hit('/api/github/approval/decision', { method: 'POST', headers: REQ_OK, body: JSON.stringify({ id: 'p1', decision: 'approved', token: queue.token }) });
  ok(res.statusCode === 409, '重复决策 → 409（一次性消费）');

  res = await hit('/api/github/approval/heartbeat', { method: 'GET' });
  ok(res.statusCode === 405, '心跳端点拒绝 GET（405）');
  res = await hit('/api/github/approval/heartbeat', { method: 'POST', headers: REQ_OK, body: '{}' });
  ok(res.statusCode === 200 && res.body.data.clientOnline === true, '心跳 200');
  await queue.dispose();
}

console.log('\n--- 7. 队列自身的生命周期 ---');
{
  const queue = new ApprovalQueue({ timeoutMs: 1000, maxPending: 2 });
  queue.heartbeat();
  const a = queue.ask({ id: 'm1', at: 1, tool: 't', action: 'a', summary: 's', argsHash: 'h' });
  const b = queue.ask({ id: 'm2', at: 1, tool: 't', action: 'a', summary: 's', argsHash: 'h' });
  const c = queue.ask({ id: 'm3', at: 1, tool: 't', action: 'a', summary: 's', argsHash: 'h' });
  ok(queue.size() === 2, '并发上限 2 生效');
  ok((await c).decision === 'expired', '超出上限的请求按 expired 结算（不静默丢弃）');
  queue.updateTimeout(5000);
  ok(queue.currentTimeoutMs() === 5000, '超时可热更新');
  ok(queue.updateTimeout(10) === undefined && queue.currentTimeoutMs() === 5000, '非法超时值被忽略');
  ok(queue.decide('m1', 'approved', { token: queue.token }).reason === 'mismatch', '缺指纹 → mismatch（队列层，先于消费）');
  ok(queue.decide('m1', 'approved', { token: queue.token, argsHash: 'nope' }).reason === 'mismatch', '指纹不符 → mismatch（队列层）');
  ok(queue.size() === 2, 'mismatch 不消费待审项');
  await queue.dispose();
  ok((await a).decision === 'cancelled' && (await b).decision === 'cancelled', 'dispose 后全部 pending 以 cancelled 结算');
  ok((await queue.ask({ id: 'm9', at: 1, tool: 't', action: 'a', summary: 's', argsHash: 'h' })).decision === 'cancelled', 'dispose 后新请求直接 cancelled');
}

console.log('\n--- 8. 配置默认值与构建登记 ---');
{
  const cfg = Config({});
  ok(cfg.approvalMode === 'destructive', 'approvalMode 默认 destructive（开，但只覆盖高危）');
  ok(typeof cfg.approvalTimeoutMs?.get === 'function' && cfg.approvalTimeoutMs.get() === 180_000, 'approvalTimeoutMs 默认 180s 且是 volatile 引用（读取必须走 .get()）');
  ok(cfg.auditEnabled === true, 'auditEnabled 默认 true');
  let threw = false;
  try { Config({}); } catch { threw = true; }
  ok(threw === false, '旧配置（无这些键）靠默认值通过校验，不抛 ValidationError');

  const buildSrc = readFileSync(path.join(ROOT, 'scripts/build.mjs'), 'utf8');
  ok(buildSrc.includes("'approval-modal.js'"), 'build.mjs 已登记 approval-modal.js');
  const modalPath = path.join(ROOT, 'lib/ui/approval-modal.js');
  ok(existsSync(modalPath), 'lib/ui/approval-modal.js 已产出');
  const modalSrc = readFileSync(modalPath, 'utf8');
  // 服务端已强制校验指纹：客户端不带就是每条决策都 400（这条把两端钉在一起）
  ok(modalSrc.includes('argsHash: current.argsHash'), '客户端决策请求带回 argsHash（否则服务端必然 mismatch）');
  ok(!/\.unref\?\.\(\)/.test(modalSrc), '不再用 Node 式的 unref（浏览器里是空操作，会误导读者）');
  const clientSrc = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
  const start = clientSrc.indexOf('[Bundled: approval-modal.js]');
  const nextMarker = clientSrc.indexOf('// ---- [Bundled:', start + 20);
  const block = start > 0 ? clientSrc.slice(start, nextMarker > 0 ? nextMarker : undefined) : '';
  ok(start > 0 && block.length > 200, 'client.js 内联了审核弹窗模块');
  ok(!/^\s*import\s/m.test(block), '内联块里没有 import（构建器已剥除）');
  ok(clientSrc.includes('startApprovalWatcher'), '客户端确实启动了审核守护');
}

console.log('\n--- 8b. 客户端轮询：切换标签页不得让审核静默失效 ---');
{
  /*
   * 这一组守的是一个**曾经真实存在**的缺陷：`tick()` 里在 `visibilityState === 'hidden'`
   * 时直接 return。而 `GET /pending` 同时是服务端判定"有没有人在看"的心跳，
   * 于是隐藏标签页 60s 后 `isClientOnline()` 变 false，`ask()` 返回 `no-client`，
   * 高危操作**不经弹窗直接执行**——正是本设计要消灭的"看起来在工作"。
   * 「切到别的标签页」是最常见的使用现场，不是失败场景。
   */
  const ITEM = { id: 'c9', at: 1, tool: 'github_pr', action: 'merge', summary: '合并 PR #9', argsHash: 'abc123' };

  // 轮询节奏是规格值，这里按字面量断言：改它必须是一次有意识的改动
  const POLL_VISIBLE_MS = 2000;
  const POLL_HIDDEN_MS = 15000;
  const WATCHDOG_MS = 5000;

  /**
   * 假 window。四个能力撑起本组的全部场景：
   * - `pendingItems`：让待审拉取带回条目，逼 `render()` 真的跑一遍（否则"弹窗出现"是空断言）；
   * - `deferPending`：让拉取挂住，由测试决定何时结算、或被超时闸打断；
   * - `onBody()`：按 `remove()` 算**当前还挂在页面上**的节点数——只数历史 appendChild
   *   会把"已经摘掉的弹窗"也算成挂载，那两件事必须分开；
   * - `pollDelays()`：只挑轮询定时器。超时闸同样是 `setTimeout`，一律看 `timers[0]` 会取错那个。
   */
  const makeFakeWin = (visibility, opts = {}) => {
    const fetches = [];
    const timers = [];
    const nodes = [];
    let releasePending = () => {};
    let aborts = 0;
    const makeNode = () => ({
      style: {}, className: '', id: '', value: '', textContent: '', children: [], removed: false,
      appendChild(c) { this.children.push(c); },
      remove() { this.removed = true; },
      focus() {},
    });
    const reply = (items) => Promise.resolve({ json: async () => ({ ok: true, data: { items, token: 'tok' } }) });
    class FakeAbortController {
      constructor() {
        let onAbort = () => {};
        this.signal = { aborted: false, addEventListener: (_e, cb) => { onAbort = cb; } };
        this.abort = () => { aborts++; this.signal.aborted = true; onAbort(); };
      }
    }
    return {
      fetches,
      timers,
      AbortController: FakeAbortController,
      aborts: () => aborts,
      onBody: () => nodes.filter((n) => !n.removed).length,
      pollDelays: () => timers.filter((t) => t.ms === POLL_VISIBLE_MS || t.ms === POLL_HIDDEN_MS).map((t) => t.ms),
      document: {
        visibilityState: visibility,
        body: { appendChild: (n) => nodes.push(n) },
        getElementById: (id) => nodes.find((n) => n.id === id && !n.removed) || null,
        createElement: () => makeNode(),
      },
      fetch: (url, init) => {
        fetches.push(url);
        if (!url.includes('approval/pending')) return reply([]);          // 心跳等：立即成功
        if (opts.deferPending) {
          return new Promise((res, rej) => {
            releasePending = () => res({ json: async () => ({ ok: true, data: { items: [ITEM], token: 'tok' } }) });
            init?.signal?.addEventListener?.('abort', () => rej(new Error('aborted')));
          });
        }
        return reply(opts.pendingItems || []);
      },
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      clearTimeout: () => {},
      release: () => releasePending(),
    };
  };

  const countOf = (win, seg) => win.fetches.filter((u) => u.includes(seg)).length;
  const timersOf = (win, ms) => win.timers.filter((t) => t.ms === ms);
  // 返回"是否真的排定了这个定时器"：缺失时让断言干净地红，而不是用 TypeError 崩掉整个阶段
  const fireLast = (win, ms) => {
    const t = timersOf(win, ms).at(-1);
    if (!t) return false;
    t.fn();
    return true;
  };

  // ① 可见：2s 一轮，且加载即发心跳 + 立刻拉一次待审
  const vis = makeFakeWin('visible');
  const stopVis = startApprovalWatcher(vis);
  await sleep(20);
  ok(countOf(vis, 'approval/heartbeat') === 1, '可见态：加载即发一次心跳（声明"我在线"）');
  ok(countOf(vis, 'approval/pending') >= 1, '可见态：加载即拉一次待审');
  ok(vis.pollDelays()[0] === POLL_VISIBLE_MS, '可见态：轮询间隔 2s', `实际 ${vis.pollDelays()[0]}`);

  // ② 隐藏：必须**继续**轮询（只是降频），否则心跳饿死 → 审核静默失效
  const hid = makeFakeWin('hidden');
  const stopHid = startApprovalWatcher(hid);
  await sleep(20);
  ok(countOf(hid, 'approval/heartbeat') === 1, '隐藏态：加载仍发一次心跳');
  ok(countOf(hid, 'approval/pending') === 1, '隐藏态：加载仍拉一次待审（不得因隐藏整段跳过）');
  ok(hid.pollDelays()[0] === POLL_HIDDEN_MS, '隐藏态：降频到 15s 而不是停摆', `实际 ${hid.pollDelays()[0]}`);

  // ③ 连续两轮定时器都要真的发出请求（心跳靠它续命，60s TTL 内至少 4 次）
  const before = countOf(hid, 'approval/pending');
  fireLast(hid, POLL_HIDDEN_MS); await sleep(20);
  fireLast(hid, POLL_HIDDEN_MS); await sleep(20);
  ok(countOf(hid, 'approval/pending') === before + 2, '隐藏态：后续每轮定时器都真的发出轮询（心跳得以续命）');
  ok(hid.pollDelays().at(-1) === POLL_HIDDEN_MS, '隐藏态：后续轮次仍是 15s 间隔');

  // ④ 防重入：重复 apply 不起第二套轮询
  const stopDup = startApprovalWatcher(hid);
  await sleep(10);
  ok(countOf(hid, 'approval/heartbeat') === 1, '重复加载不起第二套轮询（哨兵位挡住）');
  stopDup();

  // ⑤ 有待审时必须真的把弹窗挂到页面上，卸载时必须真的摘掉
  //    这条以前没有：`render()` 从未被任何断言驱动过，"弹窗出现"只能靠人眼。
  const live = makeFakeWin('visible', { pendingItems: [ITEM] });
  const stopLive = startApprovalWatcher(live);
  await sleep(20);
  ok(live.onBody() === 1, '接到待审后把弹窗挂到 document.body', `实际 ${live.onBody()} 个`);
  stopLive();
  ok(live.onBody() === 0, '卸载时把弹窗从页面摘掉（不留在用户眼前）', `实际 ${live.onBody()} 个`);

  // ⑥ 卸载后迟到的响应不得把弹窗挂回来：那时哨兵位已复位、定时器已清，没人会再关它
  const zom = makeFakeWin('visible', { deferPending: true });
  const stopZom = startApprovalWatcher(zom);
  await sleep(10);
  stopZom();
  zom.release();
  await sleep(30);
  ok(zom.onBody() === 0, '卸载后迟到的响应不再渲染（不留僵尸弹窗）', `实际挂载 ${zom.onBody()} 个`);

  // ⑦ 宿主卡死时靠客户端超时闸自救。
  //    单飞与超时是一对：没有单飞就层层叠请求，没有超时则一次悬挂让 polling 永不复位，
  //    轮询彻底停摆——那等于心跳饿死，和「切标签页」是同一个终点。
  const hung = makeFakeWin('visible', { deferPending: true });
  const stopHung = startApprovalWatcher(hung);
  await sleep(10);
  ok(countOf(hung, 'approval/pending') === 1, '请求未回来时只发出一次');
  fireLast(hung, POLL_VISIBLE_MS); await sleep(10);
  ok(countOf(hung, 'approval/pending') === 1, '上一次未回来时不再叠请求（单飞）');
  ok(fireLast(hung, WATCHDOG_MS) === true, '悬挂的请求必须排定超时闸（缺了它就是永久停摆）');
  await sleep(20);
  ok(hung.aborts() === 1, '超时闸真的 abort 了在途请求', `实际 ${hung.aborts()} 次`);
  fireLast(hung, POLL_VISIBLE_MS); await sleep(20);
  ok(countOf(hung, 'approval/pending') === 2, '超时后轮询自动恢复（心跳不会饿死）');
  stopHung();

  stopVis();
  stopHid();
  ok(vis.__dshGithubApprovalWatcher === false && hid.__dshGithubApprovalWatcher === false, '卸载后哨兵位复位（热重载后可重新接管）');
}

console.log('\n--- 9. 记账协同：留言长度与决策行 ---');
{
  // 2000 字中文留言 ≈ 6KB（UTF-8），这是行宽异常的主要来源，s1b 的字节预算要兜住它
  const text = '中'.repeat(2000);
  const bytes = Buffer.byteLength(text, 'utf8');
  ok(bytes === 6000, '2000 字中文 = 6000 字节（记账必须按字节）');
  const rej = rejectionResult(execOf('github_pr', { action: 'merge' }), text);
  ok(Buffer.byteLength(rej.content[0].text, 'utf8') > 6000, '拒绝结果里留言原文确实在（长度可验证）');
  const item = buildPendingApproval(execOf('github_pr', { action: 'merge', pr_number: 1 }), undefined);
  ok(item.argsHash.length === 16, '指纹长度固定，不随参数大小增长');
}

console.log(`\n=== phase53 结果: ${passed} 通过 / ${failed} 失败 ===`);
if (failed > 0) process.exit(1);
