// test/phase38-gate.test.mjs
//
// 破坏性操作闸门（`src/destructive.ts` 声明表）契约测试。
//
// 为什么必须有它：s5 把 16 处手写闸门收敛成一张表 + 一个包装器。收敛的风险不是
// 「拦不住」（旧代码本来拦得住），而是**过度拦截**与**文案漂移**——
// 前者让正常操作突然要 confirm，后者让用户看到的提示变差。
// 因此这里同时断言两件事：该拦的必须拦，不该拦的一个都不能拦。
//
// 真值表覆盖 `cache delete` 的五条分支（s2 曾在这上面漏过两条），
// 外加两个带条件的闸门（release upload 仅 clobber、skill publish 仅正式发布）。

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

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

const lib = (p) => `file://${path.join(ROOT, p).replace(/\\/g, '/')}`;
const { DESTRUCTIVE_ACTIONS, guardDestructive, wrapWithGate, GATE_BLOCKED } = await import(lib('lib/destructive.js'));

console.log('\n--- 0. 声明表形状 ---');
const entries = Object.entries(DESTRUCTIVE_ACTIONS).flatMap(([tool, actions]) =>
  Object.keys(actions).map((action) => `${tool}.${action}`)
);
ok(entries.length === 17, '闸门表覆盖 17 个 (tool, action) 组合', String(entries.length));
ok(entries.includes('github_pr.checkout'), '含 github_pr.checkout（仅 force 时拦）');
ok(entries.includes('github_issue.transfer'), '含 github_issue.transfer');
ok(entries.includes('github_cache.delete'), '含 github_cache.delete');
for (const [tool, actions] of Object.entries(DESTRUCTIVE_ACTIONS)) {
  for (const [action, spec] of Object.entries(actions)) {
    ok(typeof spec.describe === 'function', `${tool}.${action} 有 describe()`);
  }
}

console.log('\n--- 1. cache delete 真值表（s2 漏闸的两条分支就是这里）---');
const blocked = (tool, args) => {
  const g = guardDestructive(tool, args);
  return g ? g.status === GATE_BLOCKED : false;
};
ok(blocked('github_cache', { action: 'delete', all: true }) === true, '[all:true 无 confirm] 拦截');
ok(blocked('github_cache', { action: 'delete', cache_id: '123' }) === true, '[cache_id 无 confirm] 拦截');
ok(blocked('github_cache', { action: 'delete', key: 'build-x' }) === true, '[key 无 confirm] 拦截');
ok(blocked('github_cache', { action: 'delete' }) === false, '[无选择器] 不拦，仍由工具抛「必须指定…」精确报错');
ok(blocked('github_cache', { action: 'list', all: true }) === false, '[list + all] 不误伤');
ok(blocked('github_cache', { action: 'delete', cache_id: '123', confirm: true }) === false, '[cache_id + confirm] 放行');
{
  const g = guardDestructive('github_cache', { action: 'delete', cache_id: ' 123 ' });
  ok(g.cache_id === '123', 'cache_id 归一化后回显（与工具本体的 trim 同口径）', JSON.stringify(g?.cache_id));
  ok(!('repo' in (g ?? {})), '拦截载荷不再内插运行时仓库名（注册期拿不到 repo）');
}

console.log('\n--- 2. 条件闸门不得过度拦截 ---');
ok(blocked('github_release', { action: 'upload', tag: 'v1', assets: ['a.zip'], clobber: true }) === true, 'release upload + clobber 无 confirm → 拦截');
ok(blocked('github_release', { action: 'upload', tag: 'v1', assets: ['a.zip'] }) === false, 'release upload 不带 clobber → 不拦');
ok(blocked('github_release', { action: 'upload', tag: 'v1', assets: [] , clobber: true }) === false, 'release upload 无 assets → 不拦（精确报错留给工具）');
ok(blocked('github_skill', { action: 'publish', dry_run: false, tag: 'v1.0.0' }) === true, 'skill publish 正式发布无 confirm → 拦截');
ok(blocked('github_skill', { action: 'publish', dry_run: true }) === false, 'skill publish dry_run:true（预演）→ 不拦');
ok(blocked('github_skill', { action: 'publish', dry_run: false, fix: true, tag: 'v1.0.0' }) === false, 'skill publish fix 模式 → 不拦');
ok(blocked('github_pr', { action: 'checkout', pr_number: 1 }) === false, 'pr checkout 不带 force → 不拦');
ok(blocked('github_pr', { action: 'checkout', pr_number: 1, force: true }) === true, 'pr checkout + force 无 confirm → 拦截');
ok(blocked('github_pr', { action: 'list' }) === false, 'pr list 不受任何闸门影响');
ok(blocked('github_issue', { action: 'transfer', issue_number: 1 }) === false, 'issue transfer 缺 target_repo → 不拦（精确报错留给工具）');
ok(blocked('github_issue', { action: 'transfer', issue_number: 1, target_repo: 'o/dst' }) === true, 'issue transfer 有 target_repo → 拦截');

console.log('\n--- 2b. 缺参数时必须交还给工具抛精确错（闸门前移的回归网）---');
// 闸门从工具体内挪到工厂入口后，它就跑在「必填校验」之前了。若不把前置校验编码进
// `when`，一个 {action:'merge'} 的缺号调用会返回「你即将合并 PR #（合并策略: squash）」
// 这种空号确认载荷——既不精确也没法执行。这一节钉住「缺号不拦」。
const missingParamCases = [
  ['github_pr', { action: 'merge' }],
  ['github_pr', { action: 'revert' }],
  ['github_issue', { action: 'close' }],
  ['github_issue', { action: 'delete' }],
  ['github_issue', { action: 'transfer', target_repo: 'o/x' }],
];
for (const [tool, args] of missingParamCases) {
  ok(blocked(tool, args) === false, `${tool}.${args.action} 缺号 → 不拦（否则返回空号确认载荷）`);
}
// 端到端：缺号调用必须拿到工具本体的精确报错，而不是确认载荷
{
  const issueMod = await import(lib('lib/tools/issue.js'));
  const mock = {
    defaultListLimit: 20,
    async run() { throw new Error('不应触达 gh'); },
    async getRepoMetadata() { return { nameWithOwner: 'o/r' }; },
    resolveExecScope() { return { cwd: process.cwd() }; },
  };
  const tool = issueMod.createIssueTool(mock);
  let err = null;
  try {
    await tool.execute({ action: 'close' }, {});
  } catch (e) {
    err = String(e?.message || e);
  }
  ok(err !== null && err.includes('必须提供 issue_number'), '缺号 close 抛出工具本体的精确报错', err);
  const res = await tool.execute({ action: 'close', issue_number: 9 }, {});
  ok(res.status === GATE_BLOCKED, '补齐 issue_number 后仍被闸门拦住');
}

console.log('\n--- 3. 文案快照（逐字保留旧实现的主文案）---');
const text = (tool, args) => {
  const g = guardDestructive(tool, args);
  return `${g.warning}\n${g.impact}\n${g.requiredAction}`;
};
const snapshots = [
  ['github_pr.merge', 'github_pr', { action: 'merge', pr_number: 7 }, '你即将合并 PR #7（合并策略: squash）。'],
  ['github_pr.revert', 'github_pr', { action: 'revert', pr_number: 7 }, '你即将对 PR #7 创建反向提交（revert）。'],
  ['github_issue.close', 'github_issue', { action: 'close', issue_number: 3 }, '你即将关闭 Issue #3。'],
  ['github_issue.delete', 'github_issue', { action: 'delete', issue_number: 3 }, '**物理删除** Issue #3'],
  ['github_secret.delete', 'github_secret', { action: 'delete', name: 'NPM_TOKEN' }, '你即将删除 Secret「NPM_TOKEN」。'],
  ['github_codespace.delete', 'github_codespace', { action: 'delete', codespace: 'cs-1' }, '你即将永久删除云端开发环境「cs-1」。'],
  ['github_gist.delete', 'github_gist', { action: 'delete', gist_id: 'abc123' }, '即将永久删除 Gist 代码片段 "abc123"'],
  ['github_project.item-delete', 'github_project', { action: 'item-delete', item_id: 'PVTI_x' }, '你即将从看板中删除条目（ID: PVTI_x）。'],
  ['github_skill.install', 'github_skill', { action: 'install', repository: 'a/b' }, '你即将从仓库「a/b」安装 Skill'],
];
for (const [label, tool, args, expect] of snapshots) {
  const t = text(tool, args);
  ok(t.includes(expect), `${label} 文案包含「${expect}」`, t.split('\n')[0]);
}
ok(text('github_pr', { action: 'merge', pr_number: 7, delete_branch: true }).includes('且删除源分支'), 'merge + delete_branch 文案带「且删除源分支」');
ok(text('github_secret', { action: 'delete', name: 'K', kind: 'variable' }).includes('Variable「K」'), 'kind=variable 时按 Variable 措辞');

console.log('\n--- 4. wrapWithGate：只替换 execute，其余字段原样 ---');
{
  const calls = [];
  const tool = {
    name: 'github_issue',
    description: 'desc',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['close'] } } },
    output: { schema: { type: 'object' }, render: () => [] },
    async execute(args) { calls.push(args); return { message: 'ok' }; },
  };
  const wrapped = wrapWithGate(tool);
  ok(wrapped.name === tool.name && wrapped.description === tool.description, 'name/description 保持不变');
  ok(wrapped.parameters === tool.parameters && wrapped.output === tool.output, 'parameters/output 保持同一引用');
  ok(wrapped.execute !== tool.execute, 'execute 被替换为带闸门的包装');
  const blockedRes = await wrapped.execute({ action: 'close', issue_number: 1 });
  ok(blockedRes.status === GATE_BLOCKED && calls.length === 0, '无 confirm 时拦截且不触达工具本体（零副作用）');
  const okRes = await wrapped.execute({ action: 'close', issue_number: 1, confirm: true });
  ok(okRes.message === 'ok' && calls.length === 1, '带 confirm 时透传到工具本体');
}
{
  // 不在表里的工具/action 必须直通
  const tool = { name: 'github_status', description: 'd', parameters: {}, async execute() { return { result: 'x' }; } };
  const wrapped = wrapWithGate(tool);
  const r = await wrapped.execute({ action: 'view' }, {});
  ok(r.result === 'x', '无闸门条目的工具/action 直通');
}

console.log('\n--- 5. 工厂产物已带闸门（16 处内联代码确实被移除）---');
{
  const mod = await import(lib('lib/tools/cache.js'));
  const mock = {
    defaultListLimit: 20,
    async run() { throw new Error('不应触达 gh'); },
    async getRepoMetadata() { return { nameWithOwner: 'o/r' }; },
    resolveExecScope() { return { cwd: process.cwd() }; },
  };
  const tool = mod.createCacheTool(mock);
  const res = await tool.execute({ action: 'delete', all: true });
  ok(res.status === GATE_BLOCKED, 'createCacheTool 产物自带闸门（无需注册期再包）');
  const issueMod = await import(lib('lib/tools/issue.js'));
  const issueTool = issueMod.createIssueTool(mock);
  const r2 = await issueTool.execute({ action: 'delete', issue_number: 9 });
  ok(r2.status === GATE_BLOCKED, 'createIssueTool 产物自带闸门');
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 38 Gate Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 38 Gate Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
