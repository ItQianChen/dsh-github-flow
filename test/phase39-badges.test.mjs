// test/phase39-badges.test.mjs
//
// 状态徽章共享映射（`src/shared/state-badges.ts`）契约测试。
//
// 为什么要独立成阶段：这份映射同时被**服务端 Markdown 渲染**与**客户端 bundle**
// 使用，两边的失败形态完全不同——
//  - 服务端文案漂移：CLI 输出里的徽章悄悄变样（用户不一定会报，但一致性没了）；
//  - 客户端内联失败：模块依赖没被剥干净 → 函数在 bundle 作用域里是 undefined → **白屏**。
// 所以这里既断言「服务端输出逐字等于旧实现」，也断言「共享模块零依赖 + bundle 内恰好一份」。

import { readFileSync } from 'node:fs';
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
const badges = await import(lib('lib/shared/state-badges.js'));
const common = await import(lib('lib/renderers/common.js'));

console.log('\n--- 1. 共享模块必须零依赖（构建期内联的硬前提）---');
const src = readFileSync(path.join(ROOT, 'src/shared/state-badges.ts'), 'utf8');
const importLines = src.split('\n').filter((l) => /^\s*import\s/.test(l));
ok(importLines.length === 0, 'state-badges.ts 不含任何 import（否则内联后符号为 undefined → 白屏）', importLines.join(' | '));
const libSrc = readFileSync(path.join(ROOT, 'lib/shared/state-badges.js'), 'utf8');
ok(!/^\s*import\s/m.test(libSrc) && !/\brequire\(/.test(libSrc), '编译产物同样零依赖');

console.log('\n--- 2. 六个纯函数的状态覆盖 ---');
ok(badges.prStateBadge('OPEN').icon === '🟢' && badges.prStateBadge('OPEN').tone === 'green', 'pr OPEN → 🟢 green');
ok(badges.prStateBadge('MERGED').tone === 'purple', 'pr MERGED → purple');
ok(badges.prStateBadge('CLOSED').tone === 'red', 'pr CLOSED → red');
ok(badges.prStateBadge('OPEN', true).label === 'DRAFT', 'draft 优先级高于 state');
ok(badges.prStateBadge('') === null, '空 state → null');
ok(badges.prStateBadge('WEIRD').tone === 'neutral', '未知 state → neutral（不猜颜色）');
ok(badges.issueStateBadge('OPEN').tone === 'green' && badges.issueStateBadge('CLOSED').tone === 'red', 'issue 两档状态');
ok(badges.issueStateBadge('MERGED')?.tone === 'neutral', 'issue 没有 MERGED 档（落到 neutral）');
ok(badges.ciBadge('', 'success').tone === 'green' && badges.ciBadge('', 'fail').tone === 'red', 'ci success/fail 色调');
ok(badges.ciBadge('', 'pending').tone === 'yellow' && badges.ciBadge('in_progress').tone === 'yellow', 'ci pending/running → yellow');
ok(badges.ciBadge('', 'skipped').tone === 'neutral', 'ci skipped → neutral');
ok(badges.ciBadge() === null, 'ci 无参数 → null');
ok(badges.conflictBadge('CLEAN').tone === 'green' && badges.conflictBadge('DIRTY').tone === 'yellow', 'conflict CLEAN/DIRTY');
ok(badges.conflictBadge('BLOCKED').tone === 'red', 'conflict BLOCKED → red');
ok(badges.releaseBadge(true).label === 'DRAFT' && badges.releaseBadge(false, true).label === 'PRE', 'release draft/pre');
ok(badges.releaseBadge(false, false).label === 'STABLE', 'release stable');
ok(badges.genericStateBadge('X').tone === 'neutral' && badges.genericStateBadge('') === null, 'generic 兜底');
for (const fn of ['prStateBadge', 'issueStateBadge', 'ciBadge', 'conflictBadge', 'releaseBadge', 'genericStateBadge']) {
  ok(typeof badges[fn] === 'function', `导出 ${fn}`);
}

console.log('\n--- 3. 服务端 format*Badge 必须与旧实现逐字一致 ---');
// 期望值来自 s5 实施前的旧实现（手写 if 链），一个字符都不能变——这些字符串直接进 CLI 输出
const legacy = [
  ['formatStateBadge', ['OPEN'], '🟢 OPEN'],
  ['formatStateBadge', ['MERGED'], '🟣 MERGED'],
  ['formatStateBadge', ['CLOSED'], '🔴 CLOSED'],
  ['formatStateBadge', ['open', true], '⚪ DRAFT'],
  // 空 state 必须优先于 draft（旧实现判定顺序），否则 undefined+true 会从 '-' 变 '⚪ DRAFT'
  ['formatStateBadge', [undefined, true], '-'],
  ['formatStateBadge', [undefined], '-'],
  ['formatStateBadge', ['weird'], 'WEIRD'],
  ['formatCiBadge', ['', 'success'], '✅ success'],
  ['formatCiBadge', ['', 'pass'], '✅ pass'],
  ['formatCiBadge', ['', 'failure'], '❌ failure'],
  ['formatCiBadge', ['', 'cancelled'], '🚫 cancelled'],
  ['formatCiBadge', ['', 'skipped'], '⏭️ skipped'],
  ['formatCiBadge', ['', 'pending'], '⏳ pending'],
  ['formatCiBadge', ['in_progress'], '⏳ running'],
  ['formatCiBadge', ['queued'], '⏱️ queued'],
  ['formatCiBadge', [], '-'],
  ['formatConflictBadge', ['CLEAN'], '✅ CLEAN'],
  ['formatConflictBadge', ['DIRTY'], '⚠️ CONFLICT'],
  ['formatConflictBadge', ['BLOCKED'], '⛔ BLOCKED'],
  ['formatConflictBadge', [undefined], '-'],
  ['formatReleaseBadge', [true], '⚪ DRAFT'],
  ['formatReleaseBadge', [false, true], '🍼 PRE'],
  ['formatReleaseBadge', [false, false], '✅ STABLE'],
];
for (const [fn, args, expect] of legacy) {
  const actual = common[fn](...args);
  ok(actual === expect, `${fn}(${args.map((a) => JSON.stringify(a)).join(',')}) === ${JSON.stringify(expect)}`, JSON.stringify(actual));
}

console.log('\n--- 4. 客户端 bundle：共享实现恰好一份且语法有效 ---');
const bundle = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
ok(bundle.includes('---- [Bundled: state-badges.js]'), 'state-badges.js 已作为独立块内联');
const defs = (name) => (bundle.match(new RegExp(`function ${name}\\(`, 'g')) || []).length;
for (const fn of ['prStateBadge', 'issueStateBadge', 'ciBadge', 'conflictBadge', 'releaseBadge', 'genericStateBadge']) {
  ok(defs(fn) === 1, `bundle 内 ${fn} 定义恰好 1 份`, String(defs(fn)));
}
ok(!/from\s+['"][^'"]*shared\//.test(bundle), 'bundle 内无残留 shared/ import 语句');
// UI 侧确实改用了共享映射（否则内联就是死代码）
ok(bundle.includes('prStateBadge(pr.state)'), 'client.ts 的 PR 状态徽章改用 prStateBadge');
ok(bundle.includes('issueStateBadge('), 'issue-modal / workspace-panel 改用 issueStateBadge');

console.log('\n--- 5. 构建脚本契约 ---');
const buildSrc = readFileSync(path.join(ROOT, 'scripts/build.mjs'), 'utf8');
ok(buildSrc.includes("'../shared/state-badges.js'"), 'build.mjs 的 leadingModules 显式登记共享模块');
ok(/\(ui\|shared\)/.test(buildSrc) || /ui\|shared/.test(buildSrc), 'build.mjs 剥 import 时覆盖 ui/ 与 shared/ 两族');
const pos = buildSrc.indexOf("'../shared/state-badges.js'");
const posUi = buildSrc.indexOf("'styles.js'");
ok(pos >= 0 && pos < posUi, '共享模块排在内联顺序最前（被依赖者先内联）');

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 39 Badges Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 39 Badges Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
