// test/phase44-rules-severity.test.mjs
//
// s7 §2.3 仓库审查规则（AGENTS.md）+ 严重度前缀回归网。
//
// 为什么必须有：
// 1. 规则必须来自**仓库自身**，不是插件内置偏好；读不到时**不加该键**，
//    否则「没有规则」与「规则为空」在输出里无法区分；
// 2. `[P2]` 自动补前缀是新增能力，必须幂等、且**永不降级** [P0]/[P1]——
//    一条审查意见的优先级是写它的人的语义判断，插件没有资格改写；
// 3. 截取边界（代码块里的 `##` 不算标题）是最容易写错、也最难靠人眼发现的地方。

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

const { extractSection, normalizeSeverity, summarizeSeverity, readReviewRules, renderReviewRules } = await import(
  lib('lib/review-rules.js')
);

console.log('\n--- 1. extractSection 的边界 ---');
{
  const md = [
    '# 标题',
    '无关前言',
    '## Code Review Rules',
    '规则 A',
    '规则 B',
    '## 其它章节',
    '不该出现',
  ].join('\n');
  const got = extractSection(md, 'Code Review Rules');
  ok(got === '规则 A\n规则 B', '按下一个二级标题截断', JSON.stringify(got));
}
{
  ok(extractSection('## Code Review Rules\nA', 'Code Review Rules') === 'A', '到文件末尾也能正确截取');
  ok(extractSection('## code review rules\nA', 'Code Review Rules') === 'A', '标题匹配大小写不敏感');
  ok(extractSection('# 只有一级标题\nA', 'Code Review Rules') === null, '找不到标题返回 null');
  ok(extractSection('', 'Code Review Rules') === null, '空文本返回 null');
  ok(extractSection(null, 'x') === null, '非字符串输入返回 null');
}
{
  // 代码块里的 ## 不是标题——否则规则里贴一段 diff 就会被截断
  const md = ['## Code Review Rules', '示例：', '```md', '## 这不是标题', '```', '规则 C', '## 下一节'].join('\n');
  const got = extractSection(md, 'Code Review Rules');
  ok(got && got.includes('## 这不是标题'), '代码围栏内的 ## 不当作标题', JSON.stringify(got));
  ok(got && got.includes('规则 C'), '围栏之后的规则仍被收进同一段');
}
{
  // 一级标题也算「同级或更高级」，必须结束当前段
  const md = ['## Code Review Rules', 'A', '# 大标题', 'B'].join('\n');
  ok(extractSection(md, 'Code Review Rules') === 'A', '一级标题同样终止截取');
}

console.log('\n--- 2. normalizeSeverity：只补不删、幂等、永不降级 ---');
{
  ok(normalizeSeverity('fix bug') === '[P2] fix bug', '缺省补 [P2]');
  ok(normalizeSeverity('[P0] boom') === '[P0] boom', '[P0] 原样保留');
  ok(normalizeSeverity('[P1] x') === '[P1] x', '[P1] 原样保留');
  ok(normalizeSeverity('[p1] x') === '[p1] x', '小写前缀也认（不重复补）');
  ok(normalizeSeverity('[P2]x') === '[P2]x', '前缀后无空格同样幂等');
  ok(normalizeSeverity('') === '', '空串保持空串');
  ok(normalizeSeverity('  [P0] y  ') === '[P0] y', '首尾空白被裁掉');
  const f = normalizeSeverity;
  ok(f(f('a')) === f('a') && f(f('[P0] b')) === f('[P0] b'), '幂等：f(f(x)) === f(x)');
  ok(f('[P0] 严重') !== '[P2] 严重', '[P0] 永远不会被降级成 [P2]');
}
{
  const s = summarizeSeverity(['[P0] a', '[P1] b', 'c', '[P2] d', 'e']);
  ok(s.P0 === 1 && s.P1 === 1 && s.P2 === 3, '严重度分布统计正确（缺省计 P2）', JSON.stringify(s));
}

console.log('\n--- 3. readReviewRules：读不到就返回 null（不是空对象）---');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-rules-'));
try {
  ok(readReviewRules(tmpRoot) === null, '工作区没有 AGENTS.md → null');

  fs.writeFileSync(path.join(tmpRoot, 'AGENTS.md'), '## Code Review Rules\n- 必须写测试\n- 不许 any\n', 'utf8');
  const rootRules = readReviewRules(tmpRoot);
  ok(rootRules && rootRules.sources.length === 1, '根 AGENTS.md 被读到');
  ok(rootRules.sources[0].path === 'AGENTS.md', '来源路径记录为相对路径', rootRules.sources[0].path);
  ok(rootRules.sources[0].content.includes('必须写测试'), '规则正文被截取');
  ok(!rootRules.sources[0].content.includes('Code Review Rules'), '标题行本身不进正文');

  // 就近规则：变更文件所在目录的 AGENTS.md 也要读到，且排在根规则之后
  fs.mkdirSync(path.join(tmpRoot, 'src', 'ui'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'src', 'AGENTS.md'), '## Code Review Rules\n- src 目录规则\n', 'utf8');
  const near = readReviewRules(tmpRoot, ['src/ui/button.ts']);
  ok(near.sources.length === 2, '根 + 就近两份规则都读到', String(near.sources.length));
  ok(near.sources[0].path === 'AGENTS.md', '根规则排在前');
  ok(near.sources[1].path === 'src/AGENTS.md', '就近规则排在后', near.sources[1].path);

  // 整文件没有 ## Code Review Rules 时退化为整份文件（多数 AGENTS.md 就是散装文档）
  fs.writeFileSync(path.join(tmpRoot, 'AGENTS.md'), '# 项目约定\n- 提交信息用中文\n', 'utf8');
  const fallback = readReviewRules(tmpRoot);
  ok(fallback && fallback.sources[0].content.includes('提交信息用中文'), '无规则标题时退化为整份文件');

  // 渲染：无规则 → 空串；有规则 → 含来源与正文
  ok(renderReviewRules(null) === '', '无规则时渲染空串');
  const rendered = renderReviewRules(near);
  ok(rendered.includes('仓库审查规则（AGENTS.md）') && rendered.includes('src/AGENTS.md'), '渲染含章节标题与来源路径');
  ok(rendered.includes('src 目录规则'), '渲染含规则正文');

  /*
   * 超限裁剪必须按「字符」而不是「字节」切。
   * 8KB ≈ 2700 个汉字，切在字符中间会产出 U+FFFD 替换符——
   * 规则是要原样注入上下文的，出现乱码比少几个字更糟。
   */
  const bigRules = '## Code Review Rules\n' + '这是一条很长的中文审查规则说明。'.repeat(700);
  ok(Buffer.byteLength(bigRules, 'utf8') > 8 * 1024, '构造的规则文件确实超过 8KB（前置条件）', String(Buffer.byteLength(bigRules, 'utf8')));
  fs.writeFileSync(path.join(tmpRoot, 'AGENTS.md'), bigRules, 'utf8');
  const big = readReviewRules(tmpRoot);
  ok(big && big.truncated === true, '超限文件被标记 truncated');
  ok(big && !big.sources[0].content.includes('\uFFFD'), '裁剪后不含 U+FFFD 替换符（未切断多字节字符）');
  ok(big && Buffer.byteLength(big.sources[0].content, 'utf8') <= 8 * 1024, '裁剪后仍在字节上限内');
  ok(big && big.sources[0].content.length > 0, '裁剪后仍有内容（不是切没了）');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

console.log('\n--- 4. 工具层：无 AGENTS.md 时输出不含 reviewRules 键 ---');
{
  const { createPrTool } = await import(lib('lib/tools/pr.js'));
  const calls = [];
  const mockExecutor = {
    run: async (args) => {
      calls.push(args);
      return {
        ok: true,
        data: { number: 7, title: 't', state: 'OPEN', body: 'x', comments: [], files: [{ path: 'src/a.ts' }] },
        rawOutput: '',
      };
    },
    resolveExecScope: () => ({ cwd: ROOT }),
    getRepoMetadata: async () => ({ nameWithOwner: 'o/r' }),
    maxOutputChars: 24000,
    defaultTimeoutMs: 30000,
    defaultListLimit: 20,
  };
  const tool = createPrTool(mockExecutor);
  const out = await tool.execute({ action: 'view', pr_number: 7 });
  // 本仓库根目录没有 AGENTS.md（有 docs/ 但无该文件）——断言「不加键」而不是「值为空」
  const hasRulesFile = fs.existsSync(path.join(ROOT, 'AGENTS.md'));
  if (hasRulesFile) {
    ok(Object.hasOwn(out, 'reviewRules'), '存在 AGENTS.md 时注入 reviewRules');
  } else {
    ok(!Object.hasOwn(out, 'reviewRules'), '无 AGENTS.md 时输出不含 reviewRules 键（不是空对象）', Object.keys(out).join(','));
  }
  // 无论有没有规则，files 必须已请求（用于就近规则与截断判定）
  const viewArgv = calls.find((a) => a[0] === 'pr' && a[1] === 'view') || [];
  const jsonIdx = viewArgv.indexOf('--json');
  const fields = jsonIdx >= 0 ? viewArgv[jsonIdx + 1] : '';
  ok(fields.includes('headRefOid') && fields.includes('changedFiles') && fields.includes('files'), 'view 已请求 SHA / 总数 / 清单三件套', fields.slice(0, 120));
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 44 Rules Severity Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 44 Rules Severity Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
