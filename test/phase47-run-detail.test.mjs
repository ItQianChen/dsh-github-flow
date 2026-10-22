// test/phase47-run-detail.test.mjs - Phase 47 · Actions Run 在线详情（jobs/steps + 按需失败日志）
//
// 背景：右侧栏五个 Tab 里，PR 与 Issue 的卡片点击都进弹窗，只有 Actions 的标题是
// 一个 `<a target="_blank">`——「哪一步挂了」必须切浏览器或让 Agent 跑一轮。
//
// 本阶段把「结构」（run + jobs + steps，一次 `gh run view --json jobs`）与
// 「原因」（失败日志锚点，独立慢链路按需拉）拆成两条通道，覆盖：
//   1. run_id / job_id / repo 的参数白名单（run_id 是 `gh run view` 的位置参数，
//      不校验就等于把 flag 注入通道复制一份）
//   2. 命令字段集与输出预算（24KB 默认值会把大 run 打成假空详情）
//   3. 归一化与失败口径（failedJobs / failedSteps 只在服务端算一次）
//   4. 截断即显式失败 + 老 gh 字段降级链
//   5. 日志通道：定向 `-j <jobId> --log-failed`、最多 3 个 job、单 job 失败不拖垮整体
//   6. 路由 HTTP 语义（200/400/405/500）
//   7. 前端接线与布局纪律（标题行拆分、外跳 stopPropagation、卡片无内联 flex）
//   8. Hook 顺序 / 日志必须走 <pre> / bundle 内联顺序

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let total = 0;
function ok(cond, name, extra) {
  total++;
  if (cond) {
    passed++;
    console.log(`✅ PASS: ${name}${extra ? '  → ' + extra : ''}`);
  } else {
    console.error(`❌ FAIL: ${name}${extra ? '  → ' + extra : ''}`);
  }
}

const created = [];
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's47-'));
  created.push(dir);
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/o/r.git\n', 'utf8');
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
  return dir;
}
function cleanup() {
  for (const d of created) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
  created.length = 0;
}

const { GhExecutor } = await import('file://' + path.join(ROOT, 'lib/executor.js').replace(/\\/g, '/'));
const { buildPlainFailureExcerpt, interpretRunLogError } = await import(
  'file://' + path.join(ROOT, 'lib/executor/run-log.js').replace(/\\/g, '/')
);
const { registerActionRoutes } = await import(
  'file://' + path.join(ROOT, 'lib/api/routes-actions.js').replace(/\\/g, '/')
);

const repoDir = makeRepo();

/** 只替换 run 的 executor：其余逻辑（校验、归一化、口径计算）保持真实 */
function makeExec(runImpl) {
  const ex = new GhExecutor({});
  ex.calls = [];
  ex.run = async (args, opts) => {
    ex.calls.push({ args, opts });
    return runImpl(args, opts);
  };
  return ex;
}

const RUN_VIEW = {
  databaseId: 39731084700,
  attempt: 1,
  name: 'CI',
  displayTitle: 'feat: 示例提交',
  workflowName: 'CI',
  status: 'completed',
  conclusion: 'failure',
  event: 'push',
  headBranch: 'main',
  headSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  url: 'https://github.com/o/r/actions/runs/39731084700',
  createdAt: '2026-10-22T05:58:24Z',
  startedAt: '2026-10-22T05:58:27Z',
  updatedAt: '2026-10-22T05:59:00Z',
  jobs: [
    {
      databaseId: 111,
      name: 'verify',
      status: 'completed',
      conclusion: 'failure',
      startedAt: '2026-10-22T05:58:27Z',
      completedAt: '2026-10-22T05:58:49Z',
      url: 'https://github.com/o/r/actions/runs/39731084700/job/111',
      steps: [
        { number: 1, name: 'Set up job', status: 'completed', conclusion: 'success', startedAt: '2026-10-22T05:58:28Z', completedAt: '2026-10-22T05:58:29Z' },
        { number: 2, name: 'Run pnpm test', status: 'completed', conclusion: 'failure', startedAt: '2026-10-22T05:58:30Z', completedAt: '2026-10-22T05:58:40Z' },
      ],
    },
    // 无 steps：排队/跳过的 job 实测就是缺这个键，不得渲染成 undefined
    { databaseId: 222, name: 'lint', status: 'completed', conclusion: 'success' },
  ],
};

// ============================================================
console.log('\n--- 1. getRunDetail：run_id / repo 参数白名单 ---');
// ============================================================
{
  // run_id 会成为 `gh run view <id>` 的位置参数：`--web` / `--log` 这类值必须在触达
  // 子进程之前被拒，否则等于把「用参数值注入 flag」这条已知缺陷复制到新通道
  for (const bad of [undefined, null, '', 0, -1, 'abc', NaN, 1.5, '--force', '--web', '12; rm -rf /', '-1']) {
    const ex = makeExec(() => ({ ok: true, data: RUN_VIEW }));
    const r = await ex.getRunDetail(repoDir, bad, 'o/r');
    ok(r.ok === false, `非法 run_id 被拒绝: ${JSON.stringify(bad)}`, r.error);
    ok(ex.calls.length === 0, `非法 run_id 零 argv 产出: ${JSON.stringify(bad)}`, `calls=${ex.calls.length}`);
  }
  for (const badRepo of ['not-a-repo', 'a/b/c', 'a b/c', 'a/;rm', '../x/y', '-x/y', 'a/../b']) {
    const ex = makeExec(() => ({ ok: true, data: RUN_VIEW }));
    const r = await ex.getRunDetail(repoDir, 123, badRepo);
    ok(r.ok === false, `非法 repo 被拒绝: "${badRepo}"`, r.error);
    ok(ex.calls.length === 0, `非法 repo 零 argv 产出: "${badRepo}"`, `calls=${ex.calls.length}`);
  }
}

// ============================================================
console.log('\n--- 2. 命令字段集与输出预算 ---');
// ============================================================
{
  const ex = makeExec(() => ({ ok: true, data: RUN_VIEW }));
  const r = await ex.getRunDetail(repoDir, 39731084700, 'o/r');
  ok(r.ok === true, 'getRunDetail 正常路径 ok');

  const call = ex.calls[0];
  ok(call.args[0] === 'run' && call.args[1] === 'view' && call.args[2] === '39731084700', '调用 gh run view <id>');
  const jsonIdx = call.args.indexOf('--json');
  const fields = jsonIdx >= 0 ? call.args[jsonIdx + 1] : '';
  for (const f of ['jobs', 'conclusion', 'status', 'headBranch', 'headSha', 'attempt', 'displayTitle', 'workflowName', 'url']) {
    ok(fields.split(',').includes(f), `--json 字段集含 ${f}`);
  }
  ok(call.args.includes('-R') && call.args[call.args.indexOf('-R') + 1] === 'o/r', 'repo 经 -R 精确透传');
  ok(call.opts.maxOutputChars >= 2_000_000, '输出预算显式放宽到 2MB 字符（否则大 run 会被截成假空详情）', String(call.opts.maxOutputChars));
  ok(call.opts.maxOutputBytes === 8 * 1024 * 1024, '字节预算 8MB', String(call.opts.maxOutputBytes));
}

// ============================================================
console.log('\n--- 3. 归一化与失败口径（只在服务端算一次） ---');
// ============================================================
{
  const ex = makeExec(() => ({ ok: true, data: RUN_VIEW }));
  const r = await ex.getRunDetail(repoDir, 39731084700, 'o/r');
  const d = r.data || {};
  ok(d.runId === 39731084700, 'runId 取数据库 ID', String(d.runId));
  ok(d.attempt === 1, 'attempt 透传');
  ok(d.jobs.length === 2, 'jobs 数量正确', String(d.jobs.length));
  ok(d.jobs[0].steps.length === 2, 'steps 树透传');
  ok(d.jobs[0].steps[1].conclusion === 'failure', 'step 结论透传');
  ok(Array.isArray(d.jobs[1].steps) && d.jobs[1].steps.length === 0, '缺 steps 的 job 归一化为空数组（不是 undefined）');
  ok(d.jobs[1].conclusion === 'success', 'job 结论透传');
  ok('conclusion' in (d.jobs[0].steps[0] || {}), 'step 结论字段存在');
  ok(d.failedJobs === 1, 'failedJobs = 1', String(d.failedJobs));
  ok(d.failedSteps === 1, 'failedSteps = 1（UI 直接消费，不再自己推导）', String(d.failedSteps));
  ok(d.fieldsDegraded === undefined, '未降级时不下发 fieldsDegraded');
}
{
  // 全绿 run：两个口径都必须为 0，不能因为「有 job 但没失败」就报错
  const green = { ...RUN_VIEW, conclusion: 'success', jobs: [{ databaseId: 1, name: 'ok', status: 'completed', conclusion: 'success', steps: [] }] };
  const ex = makeExec(() => ({ ok: true, data: green }));
  const r = await ex.getRunDetail(repoDir, 1, 'o/r');
  ok(r.ok === true && r.data.failedJobs === 0 && r.data.failedSteps === 0, '全绿 run：失败口径均为 0');
}
{
  // run 刚触发 / 被跳过：jobs 为空是正常事实，不是错误
  const queued = { ...RUN_VIEW, jobs: [] };
  const ex = makeExec(() => ({ ok: true, data: queued }));
  const r = await ex.getRunDetail(repoDir, 1, 'o/r');
  ok(r.ok === true && r.data.jobs.length === 0, 'jobs 为空不视为失败（排队/跳过是正常态）');
}

// ============================================================
console.log('\n--- 4. 截断即显式失败 ---');
// ============================================================
{
  const ex = makeExec(() => ({ ok: true, truncated: true, rawOutput: '{"jobs":[', data: undefined }));
  const r = await ex.getRunDetail(repoDir, 42, 'o/r');
  ok(r.ok === false, 'truncated 必须返回 ok:false（不得渲染空 jobs 冒充「没有 job」）');
  ok(String(r.error).includes('42'), '错误文案带 run 编号', r.error);
  ok(String(r.error).includes('https://github.com/o/r/actions/runs/42'), '错误文案给出浏览器直达链接', r.error);
}
{
  const ex = makeExec(() => ({ ok: true, data: null }));
  const r = await ex.getRunDetail(repoDir, 43, 'o/r');
  ok(r.ok === false, 'data 缺失（解析失败）同样显式失败');
}
{
  const ex = makeExec(() => ({ ok: false, error: 'HTTP 404: Not Found' }));
  const r = await ex.getRunDetail(repoDir, 44, 'o/r');
  ok(r.ok === false && String(r.error).includes('404'), 'gh 报错原样上抛（不吞错）', r.error);
}

// ============================================================
console.log('\n--- 5. 老版本 gh 的字段降级链 ---');
// ============================================================
{
  let n = 0;
  const ex = makeExec((args) => {
    n++;
    if (n === 1) return { ok: false, error: 'Unknown JSON field: "displayTitle"' };
    return { ok: true, data: RUN_VIEW };
  });
  const r = await ex.getRunDetail(repoDir, 7, 'o/r');
  ok(r.ok === true, '字段降级后仍成功');
  ok(r.data.fieldsDegraded === true, 'fieldsDegraded 标记已置位');
  ok(ex.calls.length === 2, '只重试一次（不重试风暴）', String(ex.calls.length));
  const f1 = ex.calls[0].args[ex.calls[0].args.indexOf('--json') + 1];
  const f2 = ex.calls[1].args[ex.calls[1].args.indexOf('--json') + 1];
  ok(!f2.includes('displayTitle') && f2.includes('jobs'), '降级字段集更短但仍含 jobs', f2);
  ok(f1.length > f2.length, '降级字段集确实更短');
}
{
  let n = 0;
  const ex = makeExec(() => { n++; return { ok: false, error: 'network down' }; });
  const r = await ex.getRunDetail(repoDir, 8, 'o/r');
  ok(r.ok === false && n === 1, '非字段类失败不重试', `calls=${n}`);
}

// ============================================================
console.log('\n--- 6. getRunLogExcerpts：定向 argv / 上限 / 部分失败 ---');
// ============================================================
{
  const ex = makeExec((args) => {
    if (args.includes('--log-failed')) return { ok: true, rawOutput: 'line1\nFAILED tests/x.py::test\nAssertionError: boom' };
    return { ok: true, data: RUN_VIEW };
  });
  // 超上限必须显式拒绝，不能静默 slice——否则调用方会以为 5 个 job 的日志都拉了
  const over = await ex.getRunLogExcerpts(repoDir, 39731084700, [111, 222, 333, 444, 555], 'o/r');
  ok(over.ok === false, '5 个 job_id 被显式拒绝（不静默截断）', over.error);
  ok(String(over.error).includes('3'), '错误文案说明上限', over.error);
  ok(ex.calls.filter((c) => c.args.includes('--log-failed')).length === 0, '超上限时零日志调用');

  const r = await ex.getRunLogExcerpts(repoDir, 39731084700, [111, 222, 333], 'o/r');
  ok(r.ok === true, '3 个 job 正常拉取');
  const logCalls = ex.calls.filter((c) => c.args.includes('--log-failed'));
  ok(logCalls.length === 3, '3 个 job 各一次定向调用', `实际 ${logCalls.length}`);
  ok(logCalls.every((c) => c.args.includes('-j')), '每个日志调用都带 -j（定向拉取，不下整包）');
  ok(logCalls.every((c) => !c.args.includes('--log')), '绝不使用 --log（整包日志，几十 MB）');
  ok(logCalls.every((c) => c.opts.timeoutMs >= 60_000 && c.opts.timeoutMs <= 90_000), '单 job 超时 60s 且不越过总预算', String(logCalls[0].opts.timeoutMs));
  ok(logCalls[0].args[0] === 'run' && logCalls[0].args[1] === 'view' && logCalls[0].args[2] === '39731084700', '日志调用形如 gh run view <id> -j <jobId> --log-failed');
}
{
  // 总预算耗尽：不得再赌一次（传 0 让分支立即命中，无需真的等待）
  const ex = makeExec((args) => {
    if (args.includes('--log-failed')) return { ok: true, rawOutput: 'FAILED x\nboom' };
    return { ok: true, data: RUN_VIEW };
  });
  const r = await ex.getRunLogExcerpts(repoDir, 39731084700, [111, 222], 'o/r', { totalBudgetMs: 0 });
  ok(r.ok === true, '总预算耗尽仍返回 ok（部分成功语义）');
  ok(Array.isArray(r.data.errors) && r.data.errors.length === 2, '两个 job 都进 errors[]（显式、可重试）');
  ok(ex.calls.filter((c) => c.args.includes('--log-failed')).length === 0, '超预算时零日志调用');
}
{
  // 详情失败 → 名字取不到：必须显式标注，不能悄悄退化成 job #<id>
  const ex = makeExec((args) => {
    if (args.includes('--log-failed')) return { ok: true, rawOutput: 'FAILED x\nboom' };
    return { ok: false, error: 'detail failed' };
  });
  const r = await ex.getRunLogExcerpts(repoDir, 39731084700, [111], 'o/r');
  ok(r.ok === true && r.data.namesUnavailable === true, '名字降级置 namesUnavailable（降级必须可见）');
  ok(r.data.jobs[0].jobName === 'job #111', '降级时名称回退为 job #<id>', r.data.jobs[0].jobName);
}
{
  // 参数非法：空列表 / 非数字 / 全 0
  for (const bad of [undefined, [], ['abc'], ['--force'], [0], [-1]]) {
    const ex = makeExec(() => ({ ok: true, data: RUN_VIEW }));
    const r = await ex.getRunLogExcerpts(repoDir, 123, bad, 'o/r');
    ok(r.ok === false, `非法 job_id 列表被拒绝: ${JSON.stringify(bad)}`, r.error);
    ok(ex.calls.length === 0, `非法 job_id 零 argv 产出: ${JSON.stringify(bad)}`);
  }
}
{
  // 部分失败：一个 job 拿到锚点、另一个连接被重置 → ok:true + errors[]
  const ex = makeExec((args) => {
    if (args.includes('--log-failed')) {
      if (args[args.indexOf('-j') + 1] === '222') return { ok: false, error: 'read tcp: connection forcibly closed' };
      return { ok: true, rawOutput: 'garbage\nFAILED tests/a.py::test\nboom' };
    }
    return { ok: true, data: RUN_VIEW };
  });
  const r = await ex.getRunLogExcerpts(repoDir, 39731084700, [111, 222], 'o/r');
  ok(r.ok === true, '单 job 失败不拖垮整体（部分成功优于整体失败）');
  ok(r.data.jobs.length === 1 && r.data.jobs[0].jobId === 111, '成功的 job 进 jobs[]');
  ok(Array.isArray(r.data.errors) && r.data.errors.length === 1, '失败的 job 进 errors[]');
  ok(String(r.data.errors[0].error).includes('forcibly closed'), 'errors[] 保留原始错误，供界面展示');
  ok(r.data.jobs[0].excerpt.includes('失败块 1'), '日志被压成锚点块（不是整段原文）', String(r.data.jobs[0].excerpt).slice(0, 60));
  ok(r.data.jobs[0].jobName === 'verify', 'jobName 从详情树补齐（可直接展示）', r.data.jobs[0].jobName);
}
{
  // 确定性结论：job 没有失败步骤 → 进正文而不是 errors[]
  const ex = makeExec((args) => {
    if (args.includes('--log-failed')) return { ok: false, error: 'found no failed jobs in run' };
    return { ok: true, data: RUN_VIEW };
  });
  const r = await ex.getRunLogExcerpts(repoDir, 39731084700, [111], 'o/r');
  ok(r.ok === true && (!r.data.errors || r.data.errors.length === 0), '「无失败步骤」不是错误');
  ok(String(r.data.jobs[0].excerpt).includes('未检测到任何失败的任务步骤'), '给出确定性结论文案', String(r.data.jobs[0].excerpt).slice(0, 40));
}
{
  // 日志被 2MB 截断 → 摘要必须显式声明「仅基于已获取部分」
  const ex = makeExec((args) => {
    if (args.includes('--log-failed')) return { ok: true, rawOutput: 'FAILED x\nboom', truncated: true };
    return { ok: true, data: RUN_VIEW };
  });
  const r = await ex.getRunLogExcerpts(repoDir, 39731084700, [111], 'o/r');
  ok(r.data.jobs[0].truncated === true, 'truncated 透出到数据契约');
  ok(String(r.data.jobs[0].excerpt).includes('仅基于已获取的部分'), '截断在正文里显式说明');
}

// ============================================================
console.log('\n--- 7. run-log 纯函数：锚点 / 尾部回退 / 预算 ---');
// ============================================================
{
  const empty = buildPlainFailureExcerpt('');
  ok(empty.mode === 'empty' && empty.text === '', '空日志 → mode=empty');

  const noAnchor = buildPlainFailureExcerpt(Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n'));
  ok(noAnchor.mode === 'tail', '无锚点 → tail 模式');
  ok(noAnchor.text.includes('尾部 200 行'), '尾部回退显式说明');
  ok(!noAnchor.text.includes('line 0'), '尾部回退确实只取尾部');

  const anchored = buildPlainFailureExcerpt('ok\nFAILED a.py::t\nAssertionError: x');
  ok(anchored.mode === 'anchors' && anchored.blockCount >= 1, '锚点模式命中');
  ok(anchored.text.includes('失败块 1'), '纯文本块带序号');
  ok(!anchored.text.includes('```'), '纯文本渲染不带 Markdown 代码围栏（否则 <pre> 里会原样打出反引号）');

  const cut = buildPlainFailureExcerpt('FAILED a\n' + 'x'.repeat(500), { budget: 80 });
  ok(cut.truncated === true, '二次预算裁剪置 truncated');
  ok(cut.text.includes('字符上限截断'), '二次裁剪显式说明');

  const tr = buildPlainFailureExcerpt('FAILED a\nboom', { truncated: true });
  ok(tr.text.startsWith('⚠️'), 'gh 侧截断时首行就声明');
}
{
  ok(String(interpretRunLogError('no failed jobs in run 9', 9)).includes('Run #9'), '错误映射带 run 编号');
  ok(interpretRunLogError('Access is denied.', 9).includes('写权限'), 'Access denied 给可行动指引');
  ok(interpretRunLogError('completely unrelated', 9) === null, '未知错误原样上抛（返回 null）');
}

// ============================================================
console.log('\n--- 8. 路由：注册与 HTTP 语义 ---');
// ============================================================
{
  const makeRes = () => {
    const res = {
      statusCode: 0,
      headers: {},
      _body: '',
      setHeader(k, v) { res.headers[k] = v; },
      end(chunk) {
        res._body = String(chunk ?? '');
        try { res.payload = JSON.parse(res._body); } catch { res.payload = null; }
      },
    };
    Object.defineProperty(res, 'status', { get: () => res.statusCode });
    return res;
  };
  const noopCache = { get: () => null, set: () => {}, clear: () => {} };
  const mount = (exec) => {
    const captured = {};
    registerActionRoutes(
      { bindRoute: (route) => { captured[route.path] = route.handler; }, sendJson: () => {}, readJsonBody: async () => ({}) },
      exec,
      noopCache,
      noopCache
    );
    return captured;
  };

  const routeExec = new GhExecutor({});
  routeExec.getRunDetail = async (cwd, runId, repo) => ({ ok: true, data: { runId: Number(runId), repo } });
  let seenJobIds = null;
  routeExec.getRunLogExcerpts = async (cwd, runId, jobIds, repo) => {
    seenJobIds = jobIds;
    return { ok: true, data: { runId: Number(runId), jobs: [], fetchedAt: 'now' } };
  };
  const routes = mount(routeExec);

  ok(typeof routes['/api/github/run-detail'] === 'function', 'run-detail 路由已注册');
  ok(typeof routes['/api/github/run-logs'] === 'function', 'run-logs 路由已注册');

  const okRes = makeRes();
  await routes['/api/github/run-detail']({ method: 'GET', url: '/api/github/run-detail?run_id=42&repo=o/r' }, okRes);
  ok(okRes.status === 200 && okRes.payload?.data?.runId === 42, 'GET 正常路径 200');
  ok(okRes.payload?.data?.repo === 'o/r', 'repo 正确透传');
  ok(okRes.headers['Content-Type'] === 'application/json; charset=utf-8', 'Content-Type 正确');

  const badMethod = makeRes();
  await routes['/api/github/run-detail']({ method: 'POST', url: '/api/github/run-detail?run_id=42' }, badMethod);
  ok(badMethod.status === 405, '非 GET → 405');

  const logsRes = makeRes();
  await routes['/api/github/run-logs']({ method: 'GET', url: '/api/github/run-logs?run_id=42&job_id=1,2,3' }, logsRes);
  ok(logsRes.status === 200 && Array.isArray(seenJobIds) && seenJobIds.length === 3, '逗号分隔 job_id 被正确切分');
  const logsRes2 = makeRes();
  await routes['/api/github/run-logs']({ method: 'GET', url: '/api/github/run-logs?run_id=42&job_id=7&job_id=8' }, logsRes2);
  ok(seenJobIds.length === 2 && seenJobIds[0] === '7' && seenJobIds[1] === '8', '重复 job_id 参数同样支持');

  const failExec = new GhExecutor({});
  failExec.getRunDetail = async () => ({ ok: false, error: 'Run 不存在' });
  const failRoutes = mount(failExec);
  const failRes = makeRes();
  await failRoutes['/api/github/run-detail']({ method: 'GET', url: '/api/github/run-detail?run_id=999' }, failRes);
  ok(failRes.status === 400 && failRes.payload?.error === 'Run 不存在', 'executor 失败 → 400 并透出原因');

  const throwExec = new GhExecutor({});
  throwExec.getRunDetail = async () => { throw new Error('意外崩溃'); };
  const throwRoutes = mount(throwExec);
  const throwRes = makeRes();
  await throwRoutes['/api/github/run-detail']({ method: 'GET', url: '/api/github/run-detail?run_id=1' }, throwRes);
  ok(throwRes.status === 500, 'handler 抛错 → 500');
}

// ============================================================
console.log('\n--- 9. 前端接线与布局纪律 ---');
// ============================================================
{
  const clientSrc = fs.readFileSync(path.join(ROOT, 'src/client.ts'), 'utf8');
  ok(clientSrc.includes("from './ui/run-modal.js'"), '右侧栏导入 RunDetailModal');
  ok(/listLoading[\s\S]{0,300}onSelectRun/.test(clientSrc), 'onSelectRun 追加在形参末尾（不打乱既有位置参数）');
  ok(clientSrc.includes('setActiveRun(target)'), '点击接线到 activeRun 状态');
  ok(clientSrc.includes('runId: activeRun.runId'), 'RunDetailModal 挂载时传 runId');

  const start = clientSrc.indexOf('runs.map((r: any) =>');
  const block = start >= 0 ? clientSrc.slice(start, start + 3000) : '';
  ok(block.length > 0, '成功定位右侧栏 Actions 渲染块');
  ok(block.includes('dsh-github-pr-title-row'), '标题与外跳按钮同行');
  ok(block.includes('GitHub ↗'), '外跳按钮有明确文字标签');
  ok(/dsh-github-pr-gh-btn[\s\S]{0,400}stopPropagation/.test(block), '外跳 stopPropagation（不连带开弹窗）');
  ok(!/h\(\s*"a",\s*\{\s*className:\s*"dsh-github-item-title"/.test(block), '标题不再是裸 <a>（点击进弹窗）');
  const cardStyle = block.slice(0, block.indexOf('dsh-github-pr-title-row'));
  ok(!/style:\s*\{[^}]*display:\s*"flex"/.test(cardStyle), '卡片容器不得内联 display:flex（会顶掉 column 布局）');
  ok(block.includes('onSelectRun({ runId: Number(r.databaseId)'), '卡片点击携带 runId 与 repo');
}

// ============================================================
console.log('\n--- 10. 弹窗实现纪律（Hook 顺序 / 日志排版） ---');
// ============================================================
{
  const modalSrc = fs.readFileSync(path.join(ROOT, 'src/ui/run-modal.ts'), 'utf8');
  const fnStart = modalSrc.indexOf('export function RunDetailModal');
  const body = fnStart >= 0 ? modalSrc.slice(fnStart) : '';
  ok(fnStart >= 0, 'run-modal.ts 导出 RunDetailModal');
  const firstHook = body.search(/React\.use(State|Effect|Memo|Ref|Callback)\(/);
  // 必须匹配「行首的语句」而不是注释里被引用的同名文本（注释里就写着这句话）
  const earlyReturn = body.search(/\n\s*if \(!runId\) return null/);
  ok(firstHook >= 0 && earlyReturn > firstHook, 'Hook 全部先于 early return（否则「runId 由空变有值」时 Hook 数量不一致直接崩）', `hook=${firstHook} return=${earlyReturn}`);
  ok(body.includes('aria-expanded'), 'job 折叠按钮带 aria-expanded');
  ok(body.includes('h("pre"'), '日志渲染必须走 <pre>（Markdown 会把堆栈与 diff 撕碎）');
  ok(!body.includes('parseMarkdownBlocks') && !body.includes('renderMarkdownBlocks'), '日志与详情不接 markdown-lite');
  ok(!modalSrc.includes('dangerouslySetInnerHTML'), '零 HTML 注入面');
  ok(modalSrc.includes('export function formatRunDuration'), '耗时格式化导出以便单测');
  ok(/window\.addEventListener\("keydown"/.test(body) && /removeEventListener\("keydown"/.test(body), 'Esc 监听成对注册/移除');
  ok(body.includes('stopPropagation'), '弹窗内容区 stopPropagation（点内容不关窗）');
  // 慢链路的三道闸：客户端超时、失败 job 口径、databaseId 守卫
  ok(/AbortController/.test(body) && /signal:\s*controller\.signal/.test(body), '日志请求有客户端超时（AbortController）');
  ok(/clearTimeout\(timer\)/.test(body), '超时定时器在成功/失败路径都要清掉（否则泄漏）');
  ok(body.includes('pickLogJobIds') && body.includes('stepFailed'), '按 job/step 双口径选失败 job（按钮出现条件与取数条件一致）');
  ok(/jobId\s*<=\s*0/.test(body), 'databaseId 为 0 的 job 不会被请求（服务端只收正整数）');
  ok(body.includes('namesUnavailable'), '名称降级在界面显式提示');
}

// ============================================================
console.log('\n--- 10.1 服务端慢链路预算（源码级契约） ---');
// ============================================================
{
  const executorSrc = fs.readFileSync(path.join(ROOT, 'src/executor.ts'), 'utf8');
  ok(/RUN_LOG_TOTAL_BUDGET_MS\s*=\s*90_000/.test(executorSrc), '批次总预算 90s 常量存在');
  ok(/const remaining = deadline - Date\.now\(\)/.test(executorSrc), '每次调用前重算剩余预算');
  ok(/timeoutMs:\s*Math\.min\(60_000, remaining\)/.test(executorSrc), '单 job 超时被总预算夹住');
  ok(/超出本批日志总预算/.test(executorSrc), '超预算的 job 给出显式错误（不是静默跳过）');
}

// ============================================================
console.log('\n--- 11. bundle：模块内联顺序与产物形状 ---');
// ============================================================
{
  const bundlePath = path.join(ROOT, 'lib/client.js');
  const bundle = fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath, 'utf8') : '';
  ok(bundle.length > 0, 'lib/client.js 存在（需先 pnpm run build）');
  ok(bundle.includes('RunDetailModal'), 'bundle 含 RunDetailModal');
  ok(bundle.includes('/api/github/run-detail') && bundle.includes('/api/github/run-logs'), 'bundle 含两条路由字符串');
  const iIssue = bundle.indexOf('---- [Bundled: issue-modal.js]');
  const iRun = bundle.indexOf('---- [Bundled: run-modal.js]');
  ok(iIssue >= 0 && iRun > iIssue, 'run-modal 排在 issue-modal 之后内联（顺序即依赖）');
  ok(!/\bexport\s+(async\s+)?(function|const|var|let|class)\b/.test(bundle), 'bundle 内无残留 ESM export');

  const css = fs.readFileSync(path.join(ROOT, 'lib/ui/styles.js'), 'utf8');
  for (const cls of [
    '.dsh-github-run-modal-dialog',
    '.dsh-github-run-body',
    '.dsh-github-run-job',
    '.dsh-github-run-step',
    '.dsh-github-run-log',
    '.dsh-github-run-error',
  ]) {
    ok(css.includes(cls), `样式含 ${cls}`);
  }
  ok(/body\[data-ds-dark-theme\][\s\S]{0,200}dsh-github-run/.test(css), 'Run 弹窗有暗色主题适配');
}

cleanup();

console.log('\n========================================');
if (total === passed) {
  console.log(`Phase 47 Run Detail Result: ${passed}/${total} assertions PASSED!`);
} else {
  console.error(`Phase 47 Run Detail Result: ${passed}/${total} passed, ${total - passed} FAILED`);
  process.exitCode = 1;
}
