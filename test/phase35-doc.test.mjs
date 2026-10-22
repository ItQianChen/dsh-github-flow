// test/phase35-doc.test.mjs
//
// 文档数字派生测试：README / help.ts / help-modal.ts 里的「工具数 / action 数」
// 必须等于从代码派生出来的值。
//
// 为什么需要它：104 vs 103 这两个数字在 README 内部共存了很久（:13/:76 写 104，
// :417 写 103），而 phase33 的对账只覆盖了「工具数 / action 数 / Tab 名」三处手写期望，
// 手写期望本身也会漂。这里的期望值全部从 lib/ 产物派生，一个都不手写。
//
// 断言 A：每个文档至少命中一处数字——防止"把数字删掉就通过"。
// 断言 B：所有命中的数字必须等于派生值（工具数 或 业务 action 数）。

import { readFileSync, readdirSync } from 'node:fs';
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

// ---- 1. 从代码派生：工具数 ----
// 只数「工具工厂实例化」语句（main.ts 的 allTools 数组）。注册点已收敛为一条 for 循环，
// 按 register 数会永远得到 1；按工厂调用数才与「注册多少工具」真实对应。
const mainSrc = readFileSync(path.join(ROOT, 'src/main.ts'), 'utf8');
const toolCount = (mainSrc.match(/^\s*create[A-Z]\w*Tool\(/gm) || []).length;

// ---- 2. 从产物派生：每个工具的 action enum 长度 ----
const LIB_TOOLS = path.join(ROOT, 'lib/tools');
const mock = { defaultListLimit: 20, async run() { return { ok: true, data: {}, rawOutput: '' }; } };
let businessActions = 0;
const perTool = {};
for (const file of readdirSync(LIB_TOOLS).filter((f) => f.endsWith('.js') && f !== 'image-utils.js').sort()) {
  const mod = await import(`file://${LIB_TOOLS.replace(/\\/g, '/')}/${file}`);
  const factory = Object.entries(mod).find(([k, v]) => k.startsWith('create') && typeof v === 'function')?.[1];
  if (!factory) continue;
  const tool = factory(mock);
  const props = tool?.parameters?.properties ?? {};
  // 兼容两种 descriptor 形状：现状是 JSON Schema 的 {type:'object',properties}，
  // 迁到 defineTool 之后会变成扁平的 { 参数名: {...} }。
  const actionEnum = props.action?.enum ?? props.properties?.action?.enum ?? [];
  perTool[tool.name] = actionEnum.length;
  businessActions += actionEnum.length;
}

console.log('\n--- 0. 派生基线 ---');
console.log(`工具数(源码派生): ${toolCount}   业务 action 数(产物派生): ${businessActions}`);
ok(toolCount === 18, `工具数为 18（实际 ${toolCount}）`);
ok(businessActions >= 90, `业务 action 数规模合理（实际 ${businessActions}）`);

const ALLOWED = new Set([String(toolCount), String(businessActions)]);

// ---- 3. 文档数字提取 ----
const DOCS = [
  { file: 'README.md', label: 'README.md' },
  { file: 'README.en.md', label: 'README.en.md' },
  { file: 'src/tools/help.ts', label: 'src/tools/help.ts' },
  { file: 'src/ui/help-modal.ts', label: 'src/ui/help-modal.ts' },
];

/**
 * 只匹配「工具数 / action 数」这一类语义，避免误伤：
 *  - `21 个查询主题` / `4 个 HTTP method` 不在列表里；
 *  - `5 个 Tab` 也不在。
 */
const PATTERNS = [
  /(\d+)\s*个\s*业务\s*action/g,
  /(\d+)\s*个\s*action/g,
  /(\d+)\s*个业务动作/g,
  /(\d+)\s*个\s*Agent\s*工具/g,
  /(\d+)\s*个工具/g,
  /(\d+)\s*大[^，。；\n]{0,14}?工具/g,
  /\((\d+)\s*actions?\b/g,
  /(\d+)\s*business\s+actions?/g,
  /(\d+)\s+(?:core\s+domain\s+Agent\s+)?tools?\b/g,
];

console.log('\n--- 1. 每个文档都要有可校验的数字（防"删掉就过"）---');
const hitsPerDoc = {};
for (const doc of DOCS) {
  const text = readFileSync(path.join(ROOT, doc.file), 'utf8');
  const hits = [];
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) hits.push({ value: m[1], snippet: m[0].replace(/\s+/g, ' ').slice(0, 40) });
  }
  hitsPerDoc[doc.file] = hits;
  ok(hits.length > 0, `${doc.label} 命中 ≥1 处数字（实际 ${hits.length}）`);
}

console.log('\n--- 2. 命中值必须等于派生值 ---');
for (const doc of DOCS) {
  const bad = hitsPerDoc[doc.file].filter((h) => !ALLOWED.has(h.value));
  ok(
    bad.length === 0,
    `${doc.label} 的 ${hitsPerDoc[doc.file].length} 处数字全部等于派生值`,
    bad.length ? [...new Set(bad.map((b) => `"${b.snippet}"=${b.value}`))].slice(0, 5).join(' ; ') : undefined
  );
}

console.log('\n--- 3. 已知漂移的回归守卫 ---');
const readmeSrc = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const readmeEn = readFileSync(path.join(ROOT, 'README.en.md'), 'utf8');
ok(!/\b104\b/.test(readmeSrc) && !/\b104\b/.test(readmeEn), 'README 两侧不再出现 104（旧口径）');
ok(!/87%|104\/120/.test(readmeSrc) && !/87%|104\/120/.test(readmeEn), '不再出现不可复现的「87%（104/120）」覆盖率');
ok(
  !/export function apply\(ctx/.test(readmeSrc) && !/export function apply\(ctx/.test(readmeEn),
  'README 的 ctx.github 示例已声明 async（否则照抄编译不过）'
);

console.log('\n--- 4. docs/architecture.md 声明的测试阶段数与 run-all.mjs 对账 ---');
// 这个数字在文档里长期是手写的（曾写「33 个独立阶段」而实际已是 35 个）。
// 断言它等于 phases 数组长度，加阶段忘了改文档就会红。
const runAllSrc = readFileSync(path.join(ROOT, 'test/run-all.mjs'), 'utf8');
const phasesMatch = runAllSrc.match(/const phases = \[([\s\S]*?)\];/);
const actualPhases = phasesMatch ? (phasesMatch[1].match(/'[^']+\.test\.mjs'/g) || []).length : 0;
const archSrc = readFileSync(path.join(ROOT, 'docs/architecture.md'), 'utf8');
const archPhaseMatch = archSrc.match(/(\d+)\s*个独立阶段/);
ok(actualPhases > 0, `run-all.mjs 的 phases 数组可解析（实际 ${actualPhases} 项）`);
ok(archPhaseMatch !== null, 'docs/architecture.md 声明了测试阶段数');
ok(
  archPhaseMatch !== null && Number(archPhaseMatch[1]) === actualPhases,
  `architecture.md 的阶段数与 run-all.mjs 一致（文档 ${archPhaseMatch?.[1] ?? '缺失'} / 实际 ${actualPhases}）`
);

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 35 Doc Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 35 Doc Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
