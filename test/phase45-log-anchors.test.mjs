// test/phase45-log-anchors.test.mjs
//
// s7 §2.4 CI 失败日志「锚点萃取」回归网。
//
// 为什么必须有：
// 矩阵构建下一个 run 有 N 个 job 的失败日志，动辄几万行。旧的 log_failed 是
// 「整段原文 + executor 默认 24,000 字符截断」——截断发生在萃取之前，等于
// Agent 永远只能看到前 24KB，后面的失败根本不存在于上下文里。
//
// 覆盖：
//   1. 三种主流框架（pytest / node / Go）的锚点都能命中
//   2. 相邻锚点合并成一块（一次失败不该被说两遍）
//   3. 每块行数 ≤ 2*radius+1（单块不能因连续堆栈无限膨胀）
//   4. maxBlocks 上限与 droppedBlocks 显式计数
//   5. 无锚点时返回空 blocks，走尾部 200 行回退
//   6. log_failed 的工具层确实放开了 maxOutputChars（否则萃取前就被截断）

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

const { extractFailureAnchors, renderFailureAnchors, tailLines } = await import(lib('lib/executor/failure-anchors.js'));

const PYTEST_LOG = [
  '============================= test session starts ==============================',
  'collected 12 items',
  'tests/test_api.py .......F..',
  '=================================== FAILURES ===================================',
  'FAILED tests/test_api.py::test_create - AssertionError: assert 500 == 200',
  'E   AssertionError: assert 500 == 200',
  'E    +  where 500 = client.post("/x").status_code',
  'tests/test_db.py::test_migrate PASSED',
  'FAILED tests/test_db.py::test_migrate - RuntimeError: table missing',
  '=========================== short test summary info ============================',
  'FAILED tests/test_api.py::test_create - AssertionError',
].join('\n');

const NODE_LOG = [
  '> app@1.0.0 test',
  '> vitest run',
  ' RUN  v1.0.0',
  ' ❯ src/calc.test.ts (3 tests | 1 failed)',
  '   × adds numbers',
  '     → expected 3 to be 4',
  'AssertionError: expected 3 to be 4',
  '    at src/calc.test.ts:12:20',
  '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
].join('\n');

const GO_LOG = [
  'go: downloading github.com/pkg/errors v0.9.1',
  'ok   example.com/a\t0.02s',
  '--- FAIL: TestDivide (0.00s)',
  '    divide_test.go:15: divide by zero',
  'panic: runtime error: integer divide by zero [recovered]',
  '\tpanic: runtime error: integer divide by zero',
  'goroutine 6 [running]:',
  'example.com/a.Divide(...)',
  '\t/app/divide.go:9',
].join('\n');

console.log('\n--- 1. 三种框架的锚点都能命中 ---');
{
  const py = extractFailureAnchors(PYTEST_LOG);
  ok(py.blocks.length >= 1, 'pytest FAILED 命中', String(py.blocks.length));
  ok(py.blocks.some((b) => b.text.includes('test_create')), 'pytest 块内含失败用例名');

  const node = extractFailureAnchors(NODE_LOG);
  ok(node.blocks.length >= 1, 'node AssertionError 命中', String(node.blocks.length));
  ok(node.blocks.some((b) => b.text.includes('expected 3 to be 4')), 'node 块内含断言差异');

  const go = extractFailureAnchors(GO_LOG);
  ok(go.blocks.length >= 1, 'Go panic 命中', String(go.blocks.length));
  ok(go.blocks.some((b) => b.text.includes('divide by zero')), 'Go 块内含 panic 原因');

  const ts = extractFailureAnchors('src/a.ts(3,5): error TS2322: Type string is not assignable to number');
  ok(ts.blocks.length === 1, 'TypeScript error TSxxxx 命中', String(ts.blocks.length));
}

console.log('\n--- 2. 相邻锚点合并：一次失败不说两遍 ---');
{
  // 两行锚点相距 2 行（< radius=15）→ 必须并成一块
  const merged = extractFailureAnchors(['ERROR something', 'line', 'Error: detail'].join('\n'));
  ok(merged.totalBlocks === 1, '相距很近的两个锚点合并为一块', String(merged.totalBlocks));

  // 相距超过 radius → 两块
  const far = ['FAIL a', ...Array.from({ length: 40 }, () => 'noise'), 'FAIL b'].join('\n');
  ok(extractFailureAnchors(far).totalBlocks === 2, '相距超过 radius 的锚点分成两块');
}

console.log('\n--- 3. 单块行数上限 = 2*radius+1 ---');
{
  const radius = 5;
  const longBlock = ['FAIL head', ...Array.from({ length: 80 }, (_, i) => `stack line ${i}`)].join('\n');
  const r = extractFailureAnchors(longBlock, { radius });
  ok(r.blocks.length === 1, '单块');
  const lines = r.blocks[0].text.split('\n');
  ok(lines.length <= 2 * radius + 1, `块行数 ≤ ${2 * radius + 1}（实际 ${lines.length}）`, String(lines.length));
  ok(lines[0].includes('FAIL head'), '块从锚点行开始');
}
{
  // 默认 radius=15 → 每块 ≤31 行（DoD 的硬指标）
  const r = extractFailureAnchors(['panic: x', ...Array.from({ length: 200 }, (_, i) => `l${i}`)].join('\n'));
  ok(r.blocks[0].text.split('\n').length <= 31, '默认 radius 下每块 ≤31 行', String(r.blocks[0].text.split('\n').length));
}

console.log('\n--- 4. maxBlocks 与 droppedBlocks 显式计数 ---');
{
  const many = Array.from({ length: 12 }, (_, i) => `FAIL case${i}\n${'x\n'.repeat(30)}`).join('');
  const r = extractFailureAnchors(many);
  ok(r.totalBlocks === 12, '总块数如实统计', String(r.totalBlocks));
  ok(r.blocks.length === 8, '默认最多返回 8 块', String(r.blocks.length));
  ok(r.droppedBlocks === 4, '被丢弃的块数显式给出', String(r.droppedBlocks));
  const md = renderFailureAnchors(r);
  ok(md.includes('已省略 4 个失败块'), '渲染层说明省略了多少块');
  ok(md.includes('共 12 个'), '渲染层给出总数');
}

console.log('\n--- 5. 无锚点 → 空 blocks + 尾部回退 ---');
{
  const plain = ['step 1 ok', 'step 2 ok', 'all good'].join('\n');
  const r = extractFailureAnchors(plain);
  ok(r.blocks.length === 0 && r.totalBlocks === 0, '无锚点返回空 blocks（调用方据此走回退）');
  ok(renderFailureAnchors(r) === '', '空结果渲染空串');

  const big = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
  const tail = tailLines(big, 200);
  const tailArr = tail.split('\n');
  ok(tailArr.length === 200, '尾部回退恰好 200 行', String(tailArr.length));
  ok(tailArr[tailArr.length - 1] === 'line 499', '取的是尾部而不是头部');
  ok(tailLines('short', 200) === 'short', '不足 200 行时原样返回');
  ok(tailLines('', 200) === '', '空文本返回空串');
}

console.log('\n--- 6. 渲染结构 ---');
{
  const r = extractFailureAnchors(PYTEST_LOG);
  const md = renderFailureAnchors(r);
  ok(md.includes('失败块 1'), '渲染含块序号');
  ok(/日志第 \d+ 行起/.test(md), '渲染含起始行号（方便去原始日志定位）');
  ok(md.includes('```'), '块正文用代码围栏包裹');
}

console.log('\n--- 7. 工具层：log_failed 必须放开输出预算 ---');
{
  const fsMod = await import('node:fs');
  const runSrc = fsMod.readFileSync(path.join(ROOT, 'src/tools/run.ts'), 'utf8');
  ok(/maxOutputChars:\s*2_000_000/.test(runSrc), 'log_failed 已放开到 2MB 字符（否则萃取前就被 24K 截断）');
  ok(/maxOutputBytes:\s*8\s*\*\s*1024\s*\*\s*1024/.test(runSrc), '字节上限 8MB（与 PR diff 通道同口径）');
  ok(runSrc.includes('extractFailureAnchors'), 'log_failed 已接入锚点萃取');
  ok(runSrc.includes('tailLines'), '无锚点时有尾部回退');
}

console.log('\n--- 8. gh 日志前缀必须被剥离（真实格式的致命细节）---');
// 真实 `gh run view --log-failed` 每行是 `<job>\t<step>\t<ISO8601>Z <正文>`。
// 不打掉前缀，行首全是 job 名 → 两条锚点正则一条也命中不了 → 萃取整体退化成
// 「尾部 200 行回退」，功能等于不存在。这是拿真实 run 日志验证时抓出来的。
{
  const { stripLogPrefix } = await import(lib('lib/executor/failure-anchors.js'));
  const P = 'verify\t全量测试\t2026-10-21T10:22:30.5857124Z ';
  const prefixed = [
    P + '❌ FAIL: something broke',
    P + 'detail line without anchor',
    P + 'Error: boom',
  ].join('\n');

  ok(stripLogPrefix(P + '❌ FAIL: x').startsWith('❌ FAIL:'), 'stripLogPrefix 剥离 job/step/timestamp 前缀');
  ok(stripLogPrefix('plain line') === 'plain line', '无前缀时原样返回');
  ok(stripLogPrefix('') === '', '空串安全');

  const r = extractFailureAnchors(prefixed);
  ok(r.blocks.length >= 1, '带前缀的真实格式仍能命中锚点（此前会全军覆没）', String(r.blocks.length));
  ok(r.blocks.some((b) => b.text.includes('something broke')), '块正文保留原始行（含 job/step 上下文）');
  ok(r.blocks[0].text.split('\n')[0].includes('verify\t'), '块正文不剥离前缀（便于人去 Actions 对照）');
}

console.log('\n--- 9. 底层输出被硬截断时必须显式说明 ---');
// 为什么：gh 原始日志已按 2MB/8MB 裁过，此时「没找到更多失败块」≠「没有更多失败」。
// 不说明的话 Agent 会把「日志里就这些」当结论，而真实失败可能在被裁掉的那段里。
{
  const { createRunTool } = await import(lib('lib/tools/run.js'));
  const tool = createRunTool({
    run: async () => ({ ok: true, rawOutput: ['FAIL a', 'stack line'].join('\n'), truncated: true }),
    resolveExecScope: () => ({ cwd: ROOT }),
    getRepoMetadata: async () => ({ nameWithOwner: 'o/r' }),
    maxOutputChars: 24000,
    defaultTimeoutMs: 30000,
    defaultListLimit: 20,
  });
  const out = await tool.execute({ action: 'log_failed', run_id: 1 });
  const text = String(out.result || '');
  ok(text.includes('已被截断'), '底层截断时输出顶部有明确告警', text.slice(0, 60));
  ok(text.indexOf('已被截断') < text.indexOf('失败块'), '告警在失败块之前（不会被长内容淹没）');
}
{
  const { createRunTool } = await import(lib('lib/tools/run.js'));
  const tool = createRunTool({
    run: async () => ({ ok: true, rawOutput: ['FAIL a', 'stack line'].join('\n'), truncated: false }),
    resolveExecScope: () => ({ cwd: ROOT }),
    getRepoMetadata: async () => ({ nameWithOwner: 'o/r' }),
    maxOutputChars: 24000,
    defaultTimeoutMs: 30000,
    defaultListLimit: 20,
  });
  const out = await tool.execute({ action: 'log_failed', run_id: 1 });
  ok(!String(out.result || '').includes('已被截断'), '未截断时不出现多余告警');
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 45 Log Anchors Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 45 Log Anchors Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
