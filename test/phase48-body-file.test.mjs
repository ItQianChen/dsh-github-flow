// test/phase48-body-file.test.mjs
//
// 「正文/长文本来自本地文件」——统一入参解析 + 全工具接线。
//
// 为什么需要这个阶段：
// Agent 的典型工作流是先把报告写成 md 文件，再提交成 Issue / PR / 讨论 / 发版说明。
// 改造前这些入参只有字符串 body，模型只能把整篇正文塞进参数——既烧上下文，又会在
// Windows 约 32K 的命令行上限处炸掉，于是 Agent 干脆绕开插件用原生 `gh issue create -F`，
// 把插件的确认闸门、错误分类、渲染全部跳过。本阶段守护三件事：
//   1. 内联路径的 argv 与本阶段之前**逐字节一致**（旧调用零破坏）；
//   2. 文件路径走 `<flag> -` + stdin（绕开 argv 上限），REST 通道拿到同一份正文；
//   3. 上游 gh flag（--body-file / --notes-file / --input / --from-file）真实存在
//      ——读 phase34 的契约缓存，不联网、不调 gh。
//
// 运行前提：先 `pnpm run build`（本套件 import 的是 lib/ 产物）。

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const lib = (p) => 'file://' + path.join(ROOT, p).replace(/\\/g, '/');

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
async function throwsAsync(name, fn, needle) {
  try {
    await fn();
    ok(false, name, '本应抛错但正常返回');
  } catch (err) {
    const msg = String(err?.message || err);
    ok(!needle || msg.includes(needle), name, msg);
  }
}

// ─────────────────────────── 夹具：真实临时文件 ───────────────────────────
const DIR = mkdtempSync(path.join(os.tmpdir(), 'dsh-p48-'));
const CONTENT = '# 复现报告\n\n- 步骤一\n- 步骤二\n\n> 中文正文用于验证 UTF-8 通道\n';
const MD = path.join(DIR, 'report.md');
writeFileSync(MD, CONTENT, 'utf8');
const REL_NAME = 'rel-note.md';
writeFileSync(path.join(DIR, REL_NAME), 'relative body', 'utf8');
const EMPTY = path.join(DIR, 'empty.md');
writeFileSync(EMPTY, '', 'utf8');
// UTF-8 BOM：Windows 记事本常见，必须被剥离而不是当成正文第一个字符
const BOM = path.join(DIR, 'bom.md');
writeFileSync(BOM, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('标题', 'utf8')]));
// GBK 编码的「你好」（0xC4 0xE3 0xBA 0xC3 不是合法 UTF-8 序列）
const GBK = path.join(DIR, 'gbk.md');
writeFileSync(GBK, Buffer.from([0xc4, 0xe3, 0xba, 0xc3]));
const BIG = path.join(DIR, 'big.md');
writeFileSync(BIG, 'x'.repeat(65_537), 'utf8');
// 恰好触到上界：65,536 必须放行（上界闭合），差一个字符就必须拦住
const EXACT = path.join(DIR, 'exact.md');
writeFileSync(EXACT, 'a'.repeat(65_536), 'utf8');
// 合法 UTF-8 但含 NUL：二进制判据必须先于「非法 UTF-8」命中，否则报错会误导成改编码
const NUL_FILE = path.join(DIR, 'nul.md');
writeFileSync(NUL_FILE, 'a\u0000b');
const SUBDIR = path.join(DIR, 'adir');
mkdirSync(SUBDIR);

const { resolveBodySource, GITHUB_BODY_MAX_CHARS } = await import(lib('lib/tools/body-input.js'));

// ─────────────────────────── 0. 纯函数：入参语义 ───────────────────────────
console.log('\n--- 0. resolveBodySource 语义 ---');
ok(GITHUB_BODY_MAX_CHARS === 65_536, 'GitHub 正文上限常量 == 65,536');
{
  const r = resolveBodySource({ inline: 'hi' }, { cwd: DIR });
  ok(JSON.stringify(r.argv) === JSON.stringify(['--body', 'hi']), '内联 → [--body, text]（改造前形态）');
  ok(r.stdin === undefined && r.fromFile === false && r.chars === 2, '内联不带 stdin');
}
{
  const r = resolveBodySource({ inline: '', file: '' }, { cwd: DIR, keepEmptyInline: true });
  ok(JSON.stringify(r.argv) === JSON.stringify(['--body', '']), '空正文 + keepEmptyInline → [--body, ""]（create 保非交互）');
  ok(r.stdin === undefined, '空正文不进 stdin 通道');
}
{
  const r = resolveBodySource({}, { cwd: DIR });
  ok(r.argv.length === 0 && r.chars === 0, '都没有 → argv 为空（由调用方各自的必填文案拦截）');
}
{
  const r = resolveBodySource({ file: MD }, { cwd: DIR });
  ok(JSON.stringify(r.argv) === JSON.stringify(['--body-file', '-']), '文件 → [--body-file, -]');
  ok(r.stdin === CONTENT, 'stdin 恰好等于文件正文', String(r.stdin === CONTENT));
  ok(r.fromFile === true && r.file === MD, '回执里带解析后的绝对路径');
  ok(r.chars === CONTENT.length, 'chars 等于正文字符数');
}
{
  const r = resolveBodySource({ file: REL_NAME }, { cwd: DIR });
  ok(r.file === path.join(DIR, REL_NAME), '相对路径按 cwd 解析成绝对路径');
}
{
  const r = resolveBodySource({ file: BOM }, { cwd: DIR });
  ok(r.text === '标题', 'UTF-8 BOM 被剥离', JSON.stringify(r.text));
}
{
  const r = resolveBodySource({ file: EMPTY }, { cwd: DIR, keepEmptyInline: true });
  ok(r.chars === 0 && r.stdin === undefined && JSON.stringify(r.argv) === JSON.stringify(['--body', '']),
    '空文件 → 视同无正文（不依赖 gh 对空 stdin 的处理）');
}
await throwsAsync('内联 + 文件同时给 → 报错要求二选一',
  () => resolveBodySource({ inline: 'x', file: MD }, { cwd: DIR }), '二选一');
await throwsAsync('文件不存在 → 报错带绝对路径',
  () => resolveBodySource({ file: 'not-here.md' }, { cwd: DIR }), '不存在');
await throwsAsync('路径是目录 → 报错',
  () => resolveBodySource({ file: SUBDIR }, { cwd: DIR }), '不是文件');
await throwsAsync('GBK/ANSI 编码 → 明确报 UTF-8 错误（不静默乱码）',
  () => resolveBodySource({ file: GBK }, { cwd: DIR }), 'UTF-8');
await throwsAsync('超过 65,536 字符 → 报错且带实际字符数',
  () => resolveBodySource({ file: BIG }, { cwd: DIR }), '65537');
{
  const r = resolveBodySource({ file: EXACT }, { cwd: DIR });
  ok(r.chars === 65_536 && r.fromFile === true, '恰好 65,536 字符放行（上界闭合）', String(r.chars));
}
await throwsAsync('文件含 NUL 字节 → 按二进制拒绝（不是误导性的「非 UTF-8 / 请另存为 UTF-8」）',
  () => resolveBodySource({ file: NUL_FILE }, { cwd: DIR }), '二进制');
{
  // 4MB+1 字节曾显示成「4.0MB 超过 4MB」，看上去像插件算错；改为按字节数报错
  const HUGE = path.join(DIR, 'huge.bin');
  writeFileSync(HUGE, Buffer.alloc(4 * 1024 * 1024 + 1, 0x41));
  await throwsAsync('超过 4MB → 用字节数报错（不再出现四舍五入的 4.0MB）',
    () => resolveBodySource({ file: HUGE }, { cwd: DIR, maxChars: 0 }), '字节');
}
await throwsAsync('非字符串 file → 报错', () => resolveBodySource({ file: 123 }, { cwd: DIR }), '字符串');
{
  // maxChars: 0 关闭字符口径（gh api --input 的请求体不受「正文 65536」约束）
  const r = resolveBodySource({ file: BIG }, { cwd: DIR, maxChars: 0, flag: '--input', fileFlag: '--input' });
  ok(JSON.stringify(r.argv) === JSON.stringify(['--input', '-']), 'maxChars:0 时超长文件仍可解析（--input 通道）');
}
{
  const r = resolveBodySource({ file: MD }, { cwd: DIR, flag: '-b' });
  ok(JSON.stringify(r.argv) === JSON.stringify(['--body-file', '-']), '内联 flag 可定制（discussion 的 -b 不影响文件 flag）');
}

// ─────────────────────────── 1. 工具接线：argv 级回归 ───────────────────────────
console.log('\n--- 1. 工具接线（argv + stdin）---');

/** 只实现工具层真正用到的表面；把所有 gh 调用连同 opts 记下来 */
function makeMock() {
  const calls = [];
  const mock = {
    calls,
    defaultListLimit: 20,
    ghCalls: 0,
    resolveExecScope: (ctx) => ({ cwd: ctx?.cwd || process.cwd(), sessionId: ctx?.sessionId }),
    resolveWorkspaceCwd: () => process.cwd(),
    async run(cmd, opts) {
      calls.push({ cmd: [...cmd], opts: opts || {} });
      return { ok: true, data: {}, rawOutput: 'ok' };
    },
    async runGuarded(cmd, opts) {
      calls.push({ cmd: [...cmd], opts: opts || {} });
      return { ok: true, data: {}, rawOutput: 'ok' };
    },
    async getRepoMetadata() { return { nameWithOwner: 'owner/repo' }; },
    async getGhVersion() { return '2.96.0'; },
    async getLocalGitStatus() { return { branch: 'main', ahead: 0, behind: 0, dirtyCount: 0, dirtyFiles: [], hasUpstream: true }; },
    async ensureCleanWorkspace() { return { ok: true, dirtyCount: 0, samples: [] }; },
    async createPrReview(cwd, repo, num, payload) {
      calls.push({ cmd: ['pr', 'review', String(num)], opts: { rest: true }, payload });
      return { ok: true, data: { htmlUrl: 'https://example/1', state: 'COMMENT', comments: [] } };
    },
  };
  return mock;
}

const { createIssueTool } = await import(lib('lib/tools/issue.js'));
const { createPrTool } = await import(lib('lib/tools/pr.js'));
const { createDiscussionTool } = await import(lib('lib/tools/discussion.js'));
const { createReleaseTool } = await import(lib('lib/tools/release.js'));
const { createTaskTool } = await import(lib('lib/tools/task.js'));
const { createApiTool } = await import(lib('lib/tools/api.js'));
const { createAgentTaskTool } = await import(lib('lib/tools/agent-task.js'));
const { createHelpTool } = await import(lib('lib/tools/help.js'));

async function runTool(factory, args) {
  const mock = makeMock();
  const tool = factory(mock);
  let error;
  try {
    await tool.execute(args, { cwd: DIR, sessionId: 'phase48' });
  } catch (err) {
    error = String(err?.message || err);
  }
  return { calls: mock.calls, error };
}

// issue：内联逐字节不变（这是「旧调用零破坏」的硬证据）
{
  const { calls, error } = await runTool(createIssueTool, { action: 'create', repo: 'owner/repo', title: 'T', body: 'hi' });
  const expected = ['issue', 'create', '-R', 'owner/repo', '--title', 'T', '--body', 'hi'];
  ok(!error && JSON.stringify(calls[0].cmd) === JSON.stringify(expected),
    'issue create 内联 argv 与改造前逐字节一致', error || JSON.stringify(calls[0]?.cmd));
}
{
  const { calls, error } = await runTool(createIssueTool, { action: 'create', repo: 'owner/repo', title: 'T', body_file: MD });
  const cmd = calls[0]?.cmd || [];
  ok(!error && cmd.includes('--body-file') && cmd[cmd.indexOf('--body-file') + 1] === '-',
    'issue create body_file → --body-file -', error || JSON.stringify(cmd));
  ok(!cmd.includes('--body'), 'issue create 文件来源时不再出现 --body');
  ok(calls[0]?.opts.stdin === CONTENT, 'issue create 正文经 stdin 注入');
}
{
  const { calls } = await runTool(createIssueTool, { action: 'create', repo: 'owner/repo', title: 'T' });
  const cmd = calls[0]?.cmd || [];
  ok(cmd[cmd.indexOf('--body') + 1] === '' && calls[0]?.opts.stdin === undefined,
    'issue create 无正文仍下发 --body ""（保持非交互，不打开编辑器）');
}
{
  const { calls, error } = await runTool(createIssueTool, { action: 'edit', repo: 'owner/repo', issue_number: 12, body_file: MD });
  ok(!error && (calls[0]?.cmd || []).includes('--body-file') && calls[0]?.opts.stdin === CONTENT,
    'issue edit body_file → --body-file - + stdin', error);
}
{
  const { error } = await runTool(createIssueTool, { action: 'comment', repo: 'owner/repo', issue_number: 12 });
  ok(String(error).includes('必须提供 body'), 'issue comment 缺正文时报「必须提供 body 或 body_file」', String(error));
}
{
  const { calls, error } = await runTool(createIssueTool, {
    action: 'list', repo: 'owner/repo', body_file: MD,
  });
  ok(!error && calls.length > 0 && !calls[0].cmd.includes('--body-file'),
    '与正文无关的 action 不受 body_file 影响（不误读文件）', error);
}

// pr：create / comment / review 双通道
{
  const { calls, error } = await runTool(createPrTool, { action: 'create', repo: 'owner/repo', title: 'T', body_file: MD });
  ok(!error && (calls[0]?.cmd || []).includes('--body-file') && calls[0]?.opts.stdin === CONTENT,
    'pr create body_file → --body-file - + stdin', error);
}
{
  const { calls, error } = await runTool(createPrTool, { action: 'comment', repo: 'owner/repo', pr_number: 7, body_file: MD });
  ok(!error && (calls[0]?.cmd || []).includes('--body-file') && calls[0]?.opts.stdin === CONTENT,
    'pr comment body_file → --body-file - + stdin', error);
}
{
  // 行级评注走 REST：没有 flag 可传，正文必须由插件读出来塞进 JSON
  const { calls, error } = await runTool(createPrTool, {
    action: 'review', repo: 'owner/repo', pr_number: 7, review_decision: 'COMMENT',
    body_file: MD, comments: [{ path: 'src/a.ts', line: 3, body: '这里有问题' }],
  });
  const payload = calls.find((c) => c.payload)?.payload;
  ok(!error && payload?.body === CONTENT, 'pr review(REST 行级评注) body_file 正文进 payload', error);
}
{
  const { calls, error } = await runTool(createPrTool, {
    action: 'review', repo: 'owner/repo', pr_number: 7, review_decision: 'APPROVE', body_file: MD,
  });
  const cmd = calls[0]?.cmd || [];
  ok(!error && cmd.includes('--body-file') && calls[0]?.opts.stdin === CONTENT,
    'pr review(gh 通道) body_file → --body-file - + stdin', error);
}

// discussion：内联 flag 是 -b，文件 flag 是 --body-file，且 rawText/timeoutMs 不能丢
{
  const { calls, error } = await runTool(createDiscussionTool, {
    action: 'create', repo: 'owner/repo', title: 'RFC', category: 'Ideas', body_file: MD,
  });
  const call = calls[0] || {};
  ok(!error && call.cmd?.includes('--body-file') && call.opts?.stdin === CONTENT,
    'discussion create body_file → --body-file - + stdin', error);
  ok(call.opts?.rawText === true && typeof call.opts?.timeoutMs === 'number',
    'discussion 的 rawText/timeoutMs 与 stdin 并存（没被覆盖掉）');
}
{
  const { error } = await runTool(createDiscussionTool, { action: 'create', repo: 'owner/repo', title: 'RFC', category: 'Ideas' });
  ok(String(error).includes('必须提供 body'), 'discussion create 缺正文仍报「必须提供 body ...」', String(error));
}

// release：--notes-file
{
  const { calls, error } = await runTool(createReleaseTool, { action: 'create', repo: 'owner/repo', tag: 'v1.0.0', notes_file: MD });
  const cmd = calls[0]?.cmd || [];
  ok(!error && cmd.includes('--notes-file') && cmd[cmd.indexOf('--notes-file') + 1] === '-'
    && calls[0]?.opts.stdin === CONTENT, 'release create notes_file → --notes-file - + stdin', error);
}

// api：--input（请求体可以是 JSON，且不受 65536 字符口径约束）
{
  const { calls, error } = await runTool(createApiTool, { endpoint: 'graphql', input_file: MD });
  const cmd = calls[0]?.cmd || [];
  const method = cmd[cmd.indexOf('-X') + 1];
  ok(!error && cmd.includes('--input') && cmd[cmd.indexOf('--input') + 1] === '-',
    'api input_file → --input -', error || JSON.stringify(cmd));
  ok(calls[0]?.opts.stdin === CONTENT, 'api 请求体经 stdin 注入');
  ok(method === 'POST', 'api input_file 且未显式给 method → 默认 POST', String(method));
}
{
  const { calls } = await runTool(createApiTool, { endpoint: 'repos/o/r/issues', method: 'PATCH', input_file: MD });
  const cmd = calls[0]?.cmd || [];
  ok(cmd[cmd.indexOf('-X') + 1] === 'PATCH', 'api 显式 method 不被 input_file 覆盖');
}

// agent-task：--from-file（内联仍走位置参数）
{
  const { calls, error } = await runTool(createAgentTaskTool, { action: 'create', repo: 'owner/repo', prompt_file: MD });
  const cmd = calls[0]?.cmd || [];
  ok(!error && cmd.includes('--from-file') && cmd[cmd.indexOf('--from-file') + 1] === '-'
    && calls[0]?.opts.stdin === CONTENT, 'agent-task create prompt_file → --from-file - + stdin', error);
  ok(cmd.includes('create') && !cmd.includes('--body'), 'agent-task 文件来源不带内联正文 flag');
}
{
  const { calls, error } = await runTool(createAgentTaskTool, { action: 'create', repo: 'owner/repo', prompt: '把这个函数重命名' });
  const cmd = calls[0]?.cmd || [];
  ok(!error && cmd[cmd.indexOf('create') + 1] === '把这个函数重命名',
    'agent-task 内联 prompt 仍作为位置参数（逐字节兼容）', error || JSON.stringify(cmd));
}

// ─────────────────────────── 2. schema：参数声明与宿主白名单 ───────────────────────────
console.log('\n--- 2. schema 声明 ---');
const ALLOWED_KEYS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples']);
const tools = {
  github_issue: createIssueTool(makeMock()),
  github_pr: createPrTool(makeMock()),
  github_discussion: createDiscussionTool(makeMock()),
  github_release: createReleaseTool(makeMock()),
  github_task: createTaskTool(makeMock()),
  github_api: createApiTool(makeMock()),
  github_agent_task: createAgentTaskTool(makeMock()),
  github_help: createHelpTool(makeMock()),
};
const EXPECTED = {
  github_issue: 'body_file',
  github_pr: 'body_file',
  github_discussion: 'body_file',
  github_release: 'notes_file',
  github_task: 'body_file',
  github_api: 'input_file',
  github_agent_task: 'prompt_file',
};
for (const [toolName, field] of Object.entries(EXPECTED)) {
  const spec = tools[toolName]?.parameters?.properties?.[field];
  ok(Boolean(spec) && spec.type === 'string', `${toolName} 声明了 ${field}（string）`, JSON.stringify(spec));
  ok(Boolean(spec) && Object.keys(spec).every((k) => ALLOWED_KEYS.has(k)),
    `${toolName}.${field} 只用了宿主允许的 schema 关键字`, JSON.stringify(Object.keys(spec || {})));
  ok(Boolean(spec?.description?.includes('本地')) && Boolean(spec?.description?.includes('工作区')),
    `${toolName}.${field} 描述说明了「本地路径 / 按工作区解析」`, spec?.description);
}
ok(!tools.github_help.parameters.properties.body_file, 'github_help 不会被误加正文参数');

// ─────────────────────────── 3. 契约锚点：上游 flag 真实存在 ───────────────────────────
console.log('\n--- 3. 契约锚点（读 phase34 缓存，不联网）---');
const fixture = JSON.parse(readFileSync(path.join(ROOT, 'test/fixtures/gh-help.json'), 'utf8'));
const helpTextOf = (key) => {
  const raw = fixture.commands?.[key];
  return typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : '';
};
const flagOk = (key, flag) => helpTextOf(key).includes(flag);
for (const key of ['issue create', 'issue edit', 'issue comment', 'pr create', 'pr edit', 'pr comment', 'pr review', 'discussion create', 'discussion edit', 'discussion comment']) {
  ok(flagOk(key, '--body-file'), `gh ${key} 的 --body-file 存在于契约缓存`);
}
ok(flagOk('release create', '--notes-file'), 'gh release create 的 --notes-file 存在');
ok(flagOk('api', '--input'), 'gh api 的 --input 存在');
ok(flagOk('agent-task create', '--from-file'), 'gh agent-task create 的 --from-file 存在（preview 命令）');

// ─────────────────────────── 4. 模型可见文案：help 知识库反漂移 ───────────────────────────
console.log('\n--- 4. help 知识库 ---');
const helpTool = createHelpTool(makeMock());
for (const topic of ['issue', 'pr', 'mapping', 'release', 'discussion', 'api']) {
  const res = await helpTool.execute({ topic }, { cwd: DIR, sessionId: 'phase48' });
  const text = String(res?.result || '');
  ok(/body_file|notes_file|input_file/.test(text), `help(topic:'${topic}') 提到了文件入参`, text.slice(0, 80));
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 48 Body File Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 48 Body File Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
