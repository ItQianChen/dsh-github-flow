// test/phase42-review-anchor.test.mjs
//
// s7 §2.1 审阅锚点回归网。
//
// 为什么必须有：
// 分支名会移动（force-push / 新提交）。拿分支名当审查锚点，等于「我审的到底是
// 哪一版」永远说不清，而行级评注写入又必须以 commit SHA 作为 commit_id。
// 之前 `gh pr view` 的字段列表里根本没有 headRefOid，`headRepositoryOwner` 更是
// 在读一个从未请求过的字段（恒 undefined 的死读）。
//
// 覆盖：
//   1. getPrDetail 真的把 SHA 取回来了（40 位十六进制）
//   2. 渲染层把 SHA 钉在分支行上（`feat/x@a1b2c3d`），缺 SHA 时不出现 @undefined
//   3. changedFiles / filesTruncated / diffIncomplete 三个截断字段各自成立

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

const { GhExecutor } = await import(lib('lib/executor.js'));
const { renderPrMarkdown } = await import(lib('lib/renderers/pr.js'));

const SHA_HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SHA_BASE = '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c';

/** 构造一个只走内存的 executor：run 被替换，其余逻辑（字段拼装）保持真实 */
function makeExecutor(overrides = {}) {
  const ex = new GhExecutor({});
  ex.run = async (args) => {
    if (args[0] === 'pr' && args[1] === 'view') {
      return {
        ok: true,
        data: {
          number: 12,
          title: 'feat: 示例 PR',
          state: 'OPEN',
          isDraft: false,
          url: 'https://github.com/o/r/pull/12',
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-02T00:00:00Z',
          author: { login: 'alice' },
          headRefName: 'feat/x',
          baseRefName: 'main',
          headRefOid: SHA_HEAD,
          baseRefOid: SHA_BASE,
          headRepositoryOwner: { login: 'o' },
          changedFiles: 3,
          body: '',
          additions: 10,
          deletions: 2,
          // 只返回 2 个文件，而 changedFiles=3 → 清单被截断
          files: [
            { path: 'src/a.ts', additions: 8, deletions: 1, changeType: 'MODIFIED' },
            { path: 'src/b.ts', additions: 2, deletions: 1, changeType: 'MODIFIED' },
          ],
          comments: [],
          reviews: [],
          ...overrides.view,
        },
      };
    }
    if (args[0] === 'pr' && args[1] === 'diff') {
      // 只给出 a.ts 的 diff → b.ts 属于「清单里有、切片里没有」
      return { ok: true, rawOutput: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\n' };
    }
    if (args[0] === 'api') return { ok: true, data: [] };
    return { ok: true, data: {} };
  };
  ex.getRepoIdentityFromLocal = () => ({ nameWithOwner: 'o/r' });
  return ex;
}

console.log('\n--- 1. getPrDetail 必须取回不可移动的 SHA ---');
{
  const ex = makeExecutor();
  const r = await ex.getPrDetail(ROOT, 12, 'o/r');
  ok(r.ok === true, 'getPrDetail 成功');
  const d = r.data || {};
  ok(d.headRefOid === SHA_HEAD, 'headRefOid 已取回', String(d.headRefOid));
  ok(/^[0-9a-f]{40}$/.test(String(d.headRefOid)), 'headRefOid 是 40 位十六进制', String(d.headRefOid));
  ok(d.baseRefOid === SHA_BASE, 'baseRefOid 已取回', String(d.baseRefOid));
  // 死读修复：此前该字段读的是从未请求过的 headRepositoryOwner
  ok(d.headRepoOwner === 'o', 'headRepositoryOwner 不再恒空（死读已消除）', String(d.headRepoOwner));
}

console.log('\n--- 2. 渲染层把 SHA 钉在分支行上 ---');
{
  const withSha = renderPrMarkdown(
    { action: 'view' },
    { number: 12, title: 't', state: 'OPEN', headRefName: 'feat/x', baseRefName: 'main', headRefOid: SHA_HEAD, url: 'https://x' }
  );
  ok(withSha.includes('feat/x@a1b2c3d'), '分支行渲染为 `feat/x@a1b2c3d`（7 位短 SHA）', withSha.split('\n')[1]);
  ok(!withSha.includes(SHA_HEAD), '分支行不塞 40 位全长 SHA（完整值仍在 JSON 里）');

  const noSha = renderPrMarkdown(
    { action: 'view' },
    { number: 12, title: 't', state: 'OPEN', headRefName: 'feat/x', baseRefName: 'main', url: 'https://x' }
  );
  ok(!noSha.includes('@undefined'), '缺 SHA 时绝不渲染 @undefined');
  ok(noSha.includes('`feat/x`'), '缺 SHA 时只显示分支名');

  const shortSha = renderPrMarkdown(
    { action: 'view' },
    { number: 12, title: 't', state: 'OPEN', headRefName: 'feat/x', headRefOid: 'abc', url: 'https://x' }
  );
  ok(!shortSha.includes('@abc'), '短于 7 位的残缺 SHA 不渲染（宁缺勿错）');
}

console.log('\n--- 3. 三个截断字段各自回答一个问题 ---');
{
  const ex = makeExecutor();
  const r = await ex.getPrDetail(ROOT, 12, 'o/r');
  const d = r.data || {};
  ok(d.changedFiles === 3, 'changedFiles 取权威总数 3', String(d.changedFiles));
  ok(d.files.length === 2, 'files 只有实际返回的 2 条');
  ok(d.filesTruncated === true, 'filesTruncated = files.length < changedFiles', String(d.filesTruncated));
  ok(d.diffIncomplete === true, 'diffIncomplete = 有文件没拿到 diff 切片', String(d.diffIncomplete));
  ok(d.diffTruncated === undefined, 'diffTruncated 不被复用（两种原因不能共用一个开关）');
}
{
  // 无截断的干净场景：三个字段都不得误报
  const ex = makeExecutor({
    view: {
      changedFiles: 2,
      files: [
        { path: 'src/a.ts', additions: 1, deletions: 0, changeType: 'MODIFIED' },
        { path: 'src/b.ts', additions: 1, deletions: 0, changeType: 'MODIFIED' },
      ],
    },
  });
  // 覆盖 diff，使两个文件都有切片
  const baseRun = ex.run;
  ex.run = async (args) => {
    if (args[0] === 'pr' && args[1] === 'diff') {
      return {
        ok: true,
        rawOutput:
          'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\n' +
          'diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-p\n+q\n',
      };
    }
    return baseRun(args);
  };
  const r = await ex.getPrDetail(ROOT, 12, 'o/r');
  const d = r.data || {};
  ok(d.filesTruncated === undefined, '清单完整时不报 filesTruncated');
  ok(d.diffIncomplete === undefined, 'diff 齐全时不报 diffIncomplete');
}

console.log('\n--- 4. Agent 侧（renderer）也要看到清单截断 ---');
{
  const md = renderPrMarkdown(
    { action: 'view' },
    {
      number: 12,
      title: 't',
      state: 'OPEN',
      headRefName: 'feat/x',
      changedFiles: 250,
      files: Array.from({ length: 100 }, (_, i) => ({ path: `f${i}.ts` })),
      url: 'https://x',
    }
  );
  ok(md.includes('仅列出前 100 / 250 个'), 'Agent 侧输出显式说明清单被截断', md.split('\n').find((l) => l.includes('变动文件')));
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 42 Review Anchor Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 42 Review Anchor Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
