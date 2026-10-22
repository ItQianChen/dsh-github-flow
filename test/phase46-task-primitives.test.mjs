// test/phase46-task-primitives.test.mjs
//
// s8 任务级原语（`github_task`）回归网。
//
// 为什么必须有：
// 1. 原语的产出是「结论包」，结论对不对取决于归类/推导/裁剪这些纯逻辑——它们
//    必须能脱离网络验证，否则只能"跑一次看看"；
// 2. `cost` 是原语存在的唯一判据（是否真的比手动串步骤省钱），必须由 executor
//    的调用计数派生，不能手写；
// 3. 原语里只有 `review_pr` 会写远端，默认零写回这条边界必须被钉住。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

const {
  classifyCommits,
  parseSemver,
  suggestVersion,
  selectFilesByBudget,
  finalizeEnvelope,
  extractFileAnchors,
  renderReleaseNotes,
} = await import(lib('lib/task-primitives.js'));
const { createTaskTool } = await import(lib('lib/tools/task.js'));
const { guardDestructive } = await import(lib('lib/destructive.js'));
const { applyTier, TOOL_PRESETS, WRITE_ACTIONS } = await import(lib('lib/tool-tiers.js'));

console.log('\n--- 1. Conventional Commits 归类：breaking 优先 ---');
{
  const g = classifyCommits([
    'feat(api)!: drop v1 endpoints', // 既是 feat 也是 breaking
    'feat: add dark mode',
    'fix: null check',
    'perf: cache',
    'refactor: split',
    'docs: typo',
    '随便写的提交',
  ]);
  ok(g.breaking.length === 1, '`feat!:` 归入 breaking 而不是 feat（否则版本少跳一级）', JSON.stringify(g.breaking));
  ok(g.feat.length === 1, '普通 feat 归入 feat');
  ok(g.fix.length === 1 && g.perf.length === 1 && g.refactor.length === 1 && g.docs.length === 1, '其余类型各自归位');
  ok(g.other.length === 1, '不符合 Conventional Commits 的归入 other');

  const withBody = classifyCommits(['fix: x'], ['BREAKING CHANGE: 接口改名']);
  ok(withBody.breaking.length === 1, 'body 里的 BREAKING CHANGE 也算破坏性变更');
}

console.log('\n--- 2. SemVer 推导 ---');
{
  ok(JSON.stringify(parseSemver('v1.2.3')) === JSON.stringify({ major: 1, minor: 2, patch: 3 }), 'v 前缀可解析');
  ok(JSON.stringify(parseSemver('0.6.0-rc.1')) === JSON.stringify({ major: 0, minor: 6, patch: 0 }), '预发布后缀被忽略');
  ok(parseSemver('not-a-version') === null, '非法版本返回 null');

  const g = classifyCommits(['feat!: boom']);
  ok(suggestVersion('v1.2.3', g).version === '2.0.0', 'breaking → major', suggestVersion('v1.2.3', g).version);
  const g2 = classifyCommits(['feat: x']);
  ok(suggestVersion('v1.2.3', g2).version === '1.3.0', 'feat → minor', suggestVersion('v1.2.3', g2).version);
  const g3 = classifyCommits(['fix: x']);
  ok(suggestVersion('v1.2.3', g3).version === '1.2.4', 'fix → patch', suggestVersion('v1.2.3', g3).version);
  ok(suggestVersion(null, g2).version === '0.1.0', '无 tag 时从 0.1.0 起步（不冒充 1.0.0）', suggestVersion(null, g2).version);
  ok(suggestVersion('v1.2.3', g3, 'major').version === '2.0.0', '显式 bump 覆盖自动推导');
  ok(suggestVersion('v1.2.3', g3).reason.includes('patch'), 'reason 说明推导依据', suggestVersion('v1.2.3', g3).reason);
}

console.log('\n--- 3. 预算裁剪：装不下就给元信息，不硬塞 ---');
{
  const files = [
    { path: 'a.ts', additions: 1, deletions: 0, patch: 'x'.repeat(100) },
    { path: 'b.ts', additions: 50, deletions: 10, patch: 'y'.repeat(400) }, // 变更量最大 → 排第一
    { path: 'huge.ts', additions: 999, deletions: 0, patch: 'z'.repeat(5000) },
  ];
  const r = selectFilesByBudget(files, 1000);
  ok(r.selected.length === 3, '所有文件都保留条目（元信息不丢）', String(r.selected.length));
  ok(r.omitted >= 1, '超预算的文件被计入 omitted', String(r.omitted));
  const huge = r.selected.find((f) => f.path === 'huge.ts');
  ok(huge && huge.patch === undefined, '超预算文件不携带 patch（否则一个文件吃光预算）');
  ok(huge && huge.additions === 999, '但元信息仍在');
  ok(r.chars <= 1000, '实际占用不超预算', String(r.chars));

  const empty = selectFilesByBudget([], 1000);
  ok(empty.selected.length === 0 && empty.omitted === 0, '空输入安全');
}

console.log('\n--- 4. 信封：cost 由调用计数派生 ---');
{
  const env = finalizeEnvelope('summary', { a: 1 }, ['next'], { ghCalls: 3, elapsedMs: 42 });
  ok(env.summary === 'summary' && env.facts.a === 1, 'summary/facts 透传');
  ok(env.cost.ghCalls === 3 && env.cost.elapsedMs === 42, 'cost 透传调用方给的计数');
  ok(env.cost.chars > 0, 'cost.chars 由信封体积计算（不是手写常量）', String(env.cost.chars));
  ok(!('truncated' in env), '无裁剪时不带 truncated 键');

  const withT = finalizeEnvelope('s', {}, [], {
    ghCalls: 1,
    elapsedMs: 1,
    truncated: { fields: ['log'], reason: 'r', totalUnknown: true },
  });
  ok(withT.truncated && withT.truncated.totalUnknown === true, '裁剪信息透传（含 totalUnknown）');
}

console.log('\n--- 5. 日志定位锚点与 notes 渲染 ---');
{
  const anchors = extractFileAnchors('at src/a.ts:12:5 boom\nand app/divide.go:9\nand src/a.ts:12 again');
  ok(anchors.length === 2, '同一位置去重', JSON.stringify(anchors));
  ok(anchors[0].file === 'src/a.ts' && anchors[0].line === 12, '路径与行号解析正确');
  ok(extractFileAnchors('no anchors here').length === 0, '无锚点返回空数组');

  const notes = renderReleaseNotes('1.3.0', classifyCommits(['feat: a', 'fix: b', 'feat!: c']));
  ok(notes.includes('## v1.3.0'), 'notes 带版本标题');
  ok(notes.indexOf('Breaking Changes') < notes.indexOf('Features'), 'breaking 段在 features 之前');
  ok(notes.includes('- feat: a') && notes.includes('- fix: b'), '条目逐条列出（保留原始 subject）', notes.split('\n').slice(0, 6).join(' | '));
}

console.log('\n--- 6. 闸门：review_pr 的写回必须 confirm ---');
{
  ok(guardDestructive('github_task', { action: 'review_pr', pr_number: 1 }) === undefined, '读模式（无 write）放行');
  const blocked = guardDestructive('github_task', { action: 'review_pr', pr_number: 1, write: true });
  ok(blocked && blocked.status === 'AWAITING_CONFIRMATION', 'write 无 confirm 被拦截');
  ok(guardDestructive('github_task', { action: 'review_pr', pr_number: 1, write: true, confirm: true }) === undefined, 'write + confirm 放行');
  ok(guardDestructive('github_task', { action: 'diagnose_ci', run_id: 1 }) === undefined, 'diagnose_ci 恒放行');
  ok(guardDestructive('github_task', { action: 'prepare_release' }) === undefined, 'prepare_release 恒放行（不发版）');
}

console.log('\n--- 7. 档位：core 用 3 个任务替代 15 个领域工具 ---');
{
  ok(TOOL_PRESETS.core.length === 3, 'core 预设恰好 3 个', String(TOOL_PRESETS.core.length));
  ok(TOOL_PRESETS.core.includes('github_task'), 'core 含 github_task');
  ok(JSON.stringify(WRITE_ACTIONS.github_task) === JSON.stringify(['review_pr']), 'WRITE_ACTIONS 里只有 review_pr 是写');
}

// ---------------------------------------------------------------- 工具行为
/** 构造一个会记录 argv 并累加 ghCalls 的 mock executor */
function makeMock(overrides = {}) {
  const calls = [];
  const mock = {
    ghCalls: 0,
    maxOutputChars: 24_000,
    defaultTimeoutMs: 30_000,
    defaultListLimit: 20,
    resolveExecScope: () => ({ cwd: ROOT }),
    getRepoMetadata: async () => ({ nameWithOwner: 'o/r' }),
    getLocalGitStatus: async () => ({ branch: 'main', ahead: 0, behind: 0, dirtyCount: 0, hasUpstream: true, dirtyFiles: [] }),
    async run(args, opts) {
      mock.ghCalls++;
      calls.push({ args, opts });
      return overrides.run ? overrides.run(args, opts, calls.length) : { ok: true, data: [], rawOutput: '' };
    },
    async getPrDetail() {
      mock.ghCalls += 3;
      return {
        ok: true,
        data: {
          number: 12,
          title: 'feat: 示例',
          headRefOid: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
          baseRefOid: 'b'.repeat(40),
          additions: 10,
          deletions: 2,
          changedFiles: 2,
          files: [
            { path: 'src/a.ts', additions: 8, deletions: 1, changeType: 'MODIFIED' },
            { path: 'src/b.ts', additions: 2, deletions: 1, changeType: 'MODIFIED' },
          ],
          fileDiffs: { 'src/a.ts': 'diff --git a/src/a.ts', 'src/b.ts': 'diff --git a/src/b.ts' },
          lineComments: [{ id: '1' }],
        },
      };
    },
    async getReleaseInputs() {
      return {
        ok: true,
        fromTag: 'v0.6.0',
        commits: [
          { sha: 'aaa', subject: 'feat: 新功能', author: 'u', date: '' },
          { sha: 'bbb', subject: 'fix: 修复', author: 'u', date: '' },
        ],
        totalCommits: 2,
      };
    },
    async createPrReview(cwd, repo, num, input) {
      mock.ghCalls++;
      calls.push({ args: ['createPrReview'], input });
      return { ok: true, data: { htmlUrl: 'https://x/r/1', state: 'COMMENTED', comments: [] } };
    },
    calls,
  };
  return mock;
}

console.log('\n--- 8. review_pr：一次调用给出可审的上下文包 ---');
{
  const mock = makeMock({
    run: (args) => {
      if (args[0] === 'pr' && args[1] === 'checks') {
        return { ok: true, data: [{ name: 'ci', state: 'SUCCESS', bucket: 'pass' }, { name: 'lint', state: 'FAILURE', bucket: 'fail' }] };
      }
      return { ok: true, data: [] };
    },
  });
  const tool = createTaskTool(mock);
  const out = await tool.execute({ action: 'review_pr', pr_number: 12 });

  ok(typeof out.summary === 'string' && out.summary.includes('PR #12'), 'summary 是结论而不是原始 JSON', String(out.summary).slice(0, 60));
  ok(out.facts.sha === 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', 'facts 带审查锚点 SHA');
  ok(out.facts.files.length === 2 && out.facts.files.every((f) => f.patch), 'facts 带文件 diff');
  ok(out.facts.checks.fail === 1 && out.facts.checks.pass === 1, 'facts 带 CI 三态计数', JSON.stringify(out.facts.checks));
  // skipping / cancel 不能算绿：那会把「跳过了」谎报成「通过了」
  const skipMock = makeMock({
    run: (args) =>
      args[0] === 'pr' && args[1] === 'checks'
        ? { ok: true, data: [{ name: 'a', state: 'SKIPPED', bucket: 'skipping' }, { name: 'b', state: 'SUCCESS', bucket: 'pass' }] }
        : { ok: true, data: [] },
  });
  const skipOut = await createTaskTool(skipMock).execute({ action: 'review_pr', pr_number: 12 });
  ok(skipOut.facts.checks.skipped === 1 && skipOut.facts.checks.pass === 1, 'skipped 单独计数，不混进 pass', JSON.stringify(skipOut.facts.checks));
  ok(out.facts.existingLineComments === 1, 'facts 带既有行级评论数');
  ok(Array.isArray(out.nextActions) && out.nextActions.length >= 2, 'nextActions 给出可执行下一步');
  ok(out.nextActions.some((a) => a.includes('diagnose_ci')), 'CI 有失败时优先建议诊断 CI', JSON.stringify(out.nextActions.slice(0, 1)));
  ok(out.cost.ghCalls === 4, 'cost.ghCalls 由真实调用派生（getPrDetail 3 + checks 1）', String(out.cost.ghCalls));
  ok(out.cost.chars > 0 && out.cost.elapsedMs >= 0, 'cost 三元组齐全');
  ok(out.facts.written === undefined, '读模式不产生 written 字段（零写回）');
  /*
   * 整包预算不变量：cost.chars 必须 ≤ budget_chars。
   * 曾经的缺陷是「只约束 diff、不管 summary/facts 的固定开销」，实测 61 文件 PR
   * 按 24K 选完 diff 后整包 28.8K——比它声称的预算还大 4.8K，约束形同虚设。
   */
  const bigMock = makeMock({
    run: (args) =>
      args[0] === 'pr' && args[1] === 'checks'
        ? { ok: true, data: [{ name: 'ci', state: 'SUCCESS', bucket: 'pass' }] }
        : { ok: true, data: [] },
  });
  const bigDetail = await bigMock.getPrDetail();
  bigMock.getPrDetail = async () => {
    const d = await bigDetail;
    d.data.files = Array.from({ length: 60 }, (_, i) => ({
      path: `src/f${i}.ts`,
      additions: 40,
      deletions: 10,
      changeType: 'MODIFIED',
    }));
    d.data.fileDiffs = Object.fromEntries(d.data.files.map((f) => [f.path, 'x'.repeat(1200)]));
    d.data.changedFiles = 60;
    return d;
  };
  const bigOut = await createTaskTool(bigMock).execute({ action: 'review_pr', pr_number: 12, budget_chars: 12000 });
  ok(bigOut.cost.chars <= 12000, '整包体积 ≤ budget_chars（超了就回缩重选，不是只约束 diff）', String(bigOut.cost.chars));
  ok(bigOut.truncated && String(bigOut.truncated.reason).includes('12000'), 'truncated.reason 用用户可见的预算值', String(bigOut.truncated && bigOut.truncated.reason));
  ok(!mock.calls.some((c) => c.args[0] === 'createPrReview'), '读模式绝不调用写入通道');
}

console.log('\n--- 9. review_pr 写回：必须 confirm，且复用 s7 通道 ---');
{
  const mock = makeMock({ run: () => ({ ok: true, data: [] }) });
  const tool = createTaskTool(mock);
  const blocked = await tool.execute({ action: 'review_pr', pr_number: 12, write: true, body: 'b' });
  ok(blocked && blocked.status === 'AWAITING_CONFIRMATION', 'write 无 confirm → 返回确认载荷', JSON.stringify(blocked).slice(0, 60));
  ok(!mock.calls.some((c) => c.args[0] === 'createPrReview'), '被拦截时绝不写回');

  const mock2 = makeMock({ run: () => ({ ok: true, data: [] }) });
  const tool2 = createTaskTool(mock2);
  const done = await tool2.execute({
    action: 'review_pr',
    pr_number: 12,
    write: true,
    confirm: true,
    body: '整体说明',
    comments: [{ path: 'src/a.ts', line: 3, body: '问题' }],
  });
  const writeCall = mock2.calls.find((c) => c.args[0] === 'createPrReview');
  ok(Boolean(writeCall), 'confirm 后走 createPrReview（复用 s7 的行级写入通道）');
  ok(writeCall.input.commit_id === 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', 'commit_id 自动钉在 head SHA 上');
  ok(writeCall.input.comments.length === 1, 'comments 透传');
  ok(done.facts.written && done.facts.written.htmlUrl === 'https://x/r/1', '返回写入地址供复核');
  ok(String(done.summary).includes('已写回'), 'summary 明确说明已写回');
}

console.log('\n--- 10. diagnose_ci：定位失败 job + 萃取锚点 ---');
{
  const logText = [
    'verify\t全量测试\t2026-10-21T10:22:30.5857124Z ❌ FAIL: something broke',
    'verify\t全量测试\t2026-10-21T10:22:30.6Z     at src/calc.test.ts:12:20',
    'verify\t全量测试\t2026-10-21T10:22:31.0Z Error: boom',
  ].join('\n');
  const mock = makeMock({
    run: (args) => {
      if (args[0] === 'run' && args[1] === 'view' && args.includes('--json')) {
        return {
          ok: true,
          data: {
            databaseId: 999,
            name: 'CI',
            status: 'completed',
            conclusion: 'failure',
            url: 'https://x/run/999',
            jobs: [
              { name: 'test', conclusion: 'failure', databaseId: 1, steps: [{ name: 'run tests', conclusion: 'failure' }] },
              { name: 'build', conclusion: 'success', databaseId: 2, steps: [] },
            ],
          },
        };
      }
      if (args[0] === 'run' && args[1] === 'view' && args.includes('--log-failed')) {
        return { ok: true, rawOutput: logText, truncated: false };
      }
      return { ok: true, data: [] };
    },
  });
  const tool = createTaskTool(mock);
  const out = await tool.execute({ action: 'diagnose_ci', run_id: 999 });

  ok(out.facts.failedJobs.length === 1 && out.facts.failedJobs[0].name === 'test', '只挑失败 job', JSON.stringify(out.facts.failedJobs));
  ok(out.facts.failedJobs[0].steps.includes('run tests'), '带出失败 step');
  ok(out.facts.excerpts.length >= 1, '萃取到失败锚点');
  ok(out.facts.suspectedFiles.includes('src/calc.test.ts'), '汇总疑似相关文件', JSON.stringify(out.facts.suspectedFiles));
  ok(out.facts.runId === 999, 'facts 带 run id');
  ok(out.cost.ghCalls === 2, '两次 gh 调用（view + log）', String(out.cost.ghCalls));
  ok(!out.truncated, '未截断时无 truncated');

  // 日志被截断 → totalUnknown 必须为 true
  const mock2 = makeMock({
    run: (args) => {
      if (args[0] === 'run' && args[1] === 'view' && args.includes('--json')) {
        return { ok: true, data: { databaseId: 1, jobs: [{ name: 't', conclusion: 'failure', steps: [] }] } };
      }
      if (args[0] === 'run' && args[1] === 'view' && args.includes('--log-failed')) {
        return { ok: true, rawOutput: 'FAIL x', truncated: true };
      }
      return { ok: true, data: [] };
    },
  });
  const out2 = await createTaskTool(mock2).execute({ action: 'diagnose_ci', run_id: 1 });
  ok(out2.truncated && out2.truncated.totalUnknown === true, '日志截断时 totalUnknown=true（不要相信「就这些失败」）', JSON.stringify(out2.truncated));

  // 日志「拉取失败」与「没有锚点」必须区分：前者是取数问题，后者是内容问题
  const mock5 = makeMock({
    run: (args) => {
      if (args[0] === 'run' && args[1] === 'view' && args.includes('--json')) {
        return { ok: true, data: { databaseId: 1, jobs: [{ name: 't', conclusion: 'failure', steps: [] }] } };
      }
      if (args[0] === 'run' && args[1] === 'view' && args.includes('--log-failed')) {
        return { ok: false, error: 'gh: HTTP 502' };
      }
      return { ok: true, data: [] };
    },
  });
  const out5 = await createTaskTool(mock5).execute({ action: 'diagnose_ci', run_id: 1 });
  ok(String(out5.summary).includes('日志拉取失败'), '日志拉取失败在 summary 里显式说明', String(out5.summary));
  ok(String(out5.facts.logError).includes('502'), 'facts.logError 带上原始错误', String(out5.facts.logError));
  ok(!String(out5.summary).includes('未匹配到框架锚点'), '拉取失败不被说成「没有锚点」');
}

console.log('\n--- 11. prepare_release：只准备，不发版 ---');
{
  const mock = makeMock({
    run: (args) => {
      if (args[0] === 'run' && args[1] === 'list') {
        return { ok: true, data: [{ conclusion: 'success', status: 'completed', url: 'https://x' }] };
      }
      return { ok: true, data: [] };
    },
  });
  const tool = createTaskTool(mock);
  const out = await tool.execute({ action: 'prepare_release' });

  ok(out.facts.fromTag === 'v0.6.0', 'fromTag 来自最近 tag');
  ok(out.facts.suggestedVersion === '0.7.0', '有 feat → minor（0.6.0 → 0.7.0）', String(out.facts.suggestedVersion));
  ok(out.facts.groups.feat.length === 1 && out.facts.groups.fix.length === 1, '提交已归类');
  ok(out.facts.health.clean === true && out.facts.health.synced === true, '体检：工作区干净 + 同步正常');
  ok(out.facts.health.ciGreen === true, '体检：CI 绿');
  ok(String(out.facts.notes).includes('## v0.7.0'), 'notes 草稿已生成');
  ok(out.nextActions.some((a) => a.includes('git tag')), 'nextActions 给出打 tag 命令');
  ok(out.nextActions.some((a) => a.includes('gh release create')), 'nextActions 给出创建 Release 命令');
  ok(!mock.calls.some((c) => c.args[0] === 'release'), '**绝不自动发版**：没有 release 相关调用', JSON.stringify(mock.calls.map((c) => c.args[0])));

  // from_tag 必须真的透传给 executor（否则统计区间与标签对不上）
  const seen = [];
  const mock3 = makeMock();
  const origGet = mock3.getReleaseInputs;
  mock3.getReleaseInputs = async (cwd, fromTag) => {
    seen.push(fromTag);
    return origGet();
  };
  await createTaskTool(mock3).execute({ action: 'prepare_release', from_tag: 'v1.2.0' });
  ok(seen[0] === 'v1.2.0', 'from_tag 透传给 getReleaseInputs（参与 range 计算，不只是标签）', String(seen[0]));

  // `-` 开头的 from_tag 会被拼进 `git log <tag>..HEAD` 的首位 → 必须提前拒掉
  const { GhExecutor } = await import(lib('lib/executor.js'));
  const realEx = new GhExecutor({});
  const dashRes = await realEx.getReleaseInputs(ROOT, '-p');
  ok(dashRes.ok === false && String(dashRes.error).includes('不能以 - 开头'), 'from_tag 以 - 开头被拒（用户输入不许以 - 开头）', String(dashRes.error));
  const badRes = await realEx.getReleaseInputs(ROOT, 'v1;rm -rf');
  ok(badRes.ok === false, 'from_tag 含非法字符被拒');

  // body 里的 BREAKING CHANGE 必须参与归类
  const mock4 = makeMock();
  mock4.getReleaseInputs = async () => ({
    ok: true,
    fromTag: 'v1.0.0',
    commits: [{ sha: 'x', subject: 'fix: 调整接口', author: 'u', date: '', body: 'BREAKING CHANGE: 参数顺序变了' }],
    totalCommits: 1,
  });
  const out4 = await createTaskTool(mock4).execute({ action: 'prepare_release' });
  ok(out4.facts.groups.breaking.length === 1, 'body 里的 BREAKING CHANGE 被识别（只看标题会漏判 major）', JSON.stringify(out4.facts.groups));
  ok(out4.facts.suggestedVersion === '2.0.0', '正文声明破坏性 → major', String(out4.facts.suggestedVersion));
}

console.log('\n--- 12. 工具面：注册与档位 ---');
{
  const mock = makeMock();
  const tool = createTaskTool(mock);
  ok(tool.name === 'github_task', '工具名为 github_task');
  const actions = tool.parameters.properties.action.enum;
  ok(JSON.stringify(actions) === JSON.stringify(['review_pr', 'diagnose_ci', 'prepare_release']), '三个原语', JSON.stringify(actions));
  ok(typeof tool.output.render === 'function', '有原生渲染器');
  const rendered = tool.output.render({ action: 'prepare_release' }, { summary: 'S', facts: { suggestedVersion: '0.7.0' }, nextActions: ['n'], cost: { chars: 10, ghCalls: 1, elapsedMs: 2 } })[0].text;
  ok(rendered.includes('S') && rendered.includes('0.7.0') && rendered.includes('cost:'), '渲染器把 summary/facts/cost 都呈现出来');
  /*
   * diff 正文必须出现在渲染结果里。
   * 只列文件名等于给了目录不给内容——模型还得再调一次 github_pr(diff) 才能审，
   * 那这个原语的"一轮看完"就名不副实了。
   */
  const renderedWithDiff = tool.output.render({ action: 'review_pr' }, {
    summary: 'S',
    facts: { sha: 'a'.repeat(40), changedFiles: 1, files: [{ path: 'src/a.ts', additions: 1, deletions: 0, patch: 'diff --git a/src/a.ts b/src/a.ts' }] },
    nextActions: [],
    cost: { chars: 1, ghCalls: 1, elapsedMs: 1 },
  })[0].text;
  ok(renderedWithDiff.includes('```diff') && renderedWithDiff.includes('diff --git a/src/a.ts'), '渲染结果里铺开了 diff 正文', renderedWithDiff.slice(0, 80));
  const renderedNotes = tool.output.render({ action: 'prepare_release' }, {
    summary: 'S',
    facts: { suggestedVersion: '0.7.0', notes: '## v0.7.0\n\n### Features\n- x' },
    nextActions: [],
    cost: { chars: 1, ghCalls: 1, elapsedMs: 1 },
  })[0].text;
  ok(renderedNotes.includes('Release notes 草稿') && renderedNotes.includes('### Features'), '渲染结果里含 Release notes 草稿');

  const tier = applyTier([tool], { toolsets: ['core'] });
  ok(tier.kept.length === 1, 'core 档能选中 github_task');

  // 只读模式下 review_pr 被剪掉，另两个原语仍可用
  const ro = applyTier([tool], { read_only: true });
  const roActions = ro.kept[0].parameters.properties.action.enum;
  ok(!roActions.includes('review_pr'), '只读模式剪掉 review_pr（写分支）', JSON.stringify(roActions));
  ok(roActions.includes('diagnose_ci') && roActions.includes('prepare_release'), '只读模式保留两个只读原语');
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 46 Task Primitives Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 46 Task Primitives Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
