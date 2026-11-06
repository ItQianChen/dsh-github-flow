// test/phase49-diff-preview.test.mjs
//
// 「提交详情 / 未提交清单 → 文件 Diff 弹窗」契约测试。
//
// 为什么需要这个阶段：一次 `git show <sha>` 拿到的是**整包 patch**，而用户要的是「点一个
// 文件看一个文件」。前端必须按 `diff --git` 边界把它切成逐文件块。切分规则（边界在哪、
// 重命名怎么认、二进制怎么判、--stat 的 `src/{old => new}.ts` 怎么归一）是纯逻辑：
// 写错了界面只会「点开是空的」或「展示成别的文件的 diff」，既不报错也不崩，肉眼极难发现。
// 所以必须脱离 DOM 直接测纯函数。
//
// 本阶段锁三件事：
//   1. `src/ui/diff-utils.ts` 四个纯函数的行为（含路径带空格、`{old => new}` 归一、
//      首个 `diff --git` 之前的头行必须丢弃）；
//   2. `executor.getCommitDiff` 在**真实临时 git 仓库**里的端到端产出——含 rename 提交与
//      非法 sha 拒绝，纯 mock 测不出 `git show` 的真实输出形态；
//   3. 路由 / action / 前端产物的接线锚点（新路由、action 名、bundle 里的组件与函数）。
//
// 运行前提：先 `pnpm run build`（本套件 import 的是 lib/ 产物）。

import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
    console.error(`❌ FAIL: ${name}${extra !== undefined && extra !== null ? '  → ' + extra : ''}`);
  }
}

const { parseDiffGitLine, normalizeRenamePath, splitUnifiedPatch, findPatchSection } =
  await import(lib('lib/ui/diff-utils.js'));

// ─────────────────────────── 0. parseDiffGitLine ───────────────────────────
console.log('\n--- 0. parseDiffGitLine：diff --git 头行解析 ---');
{
  const r = parseDiffGitLine('diff --git a/src/a.ts b/src/b.ts');
  ok(r !== null && r.aPath === 'src/a.ts' && r.bPath === 'src/b.ts',
    '常规头行切出 a/b 两侧路径（均去掉 a//b/ 前缀）', JSON.stringify(r));
}
{
  // 带空格的路径让这行本身有歧义：a 侧和 b 侧都以 "a "/"b " 开头，只能按最后一个 " b/" 切。
  // 若按第一个 " b/" 或首个空格切，bPath 会被截成 "my"，点开文件必然查不到。
  const r = parseDiffGitLine('diff --git a/my file.txt b/my file.txt');
  ok(r !== null && r.aPath === 'my file.txt' && r.bPath === 'my file.txt',
    '路径含空格时按最后一个 " b/" 切，b 侧不被截断', JSON.stringify(r));
}
{
  const r = parseDiffGitLine('diff --git a/old dir/a b.txt b/new dir/c d.txt');
  ok(r !== null && r.aPath === 'old dir/a b.txt' && r.bPath === 'new dir/c d.txt',
    '两侧路径都含空格且不同 → 各自完整还原', JSON.stringify(r));
}
{
  // a 侧路径里本身就出现 " b/"（目录名含空格 + b 开头的文件）：仍必须取最后一次出现，
  // 否则会把 a 侧的一个中间片段误当成 b 侧起点。
  const r = parseDiffGitLine('diff --git a/x b/y.txt b/z.txt');
  ok(r !== null && r.aPath === 'x b/y.txt' && r.bPath === 'z.txt',
    'a 侧内含 " b/" 时取最后一次出现，不误切', JSON.stringify(r));
}
{
  const notDiffLines = [
    'index 1234567..89abcdef 100644',
    '+++ b/src/a.ts',
    '--- a/src/a.ts',
    'diff --git a/only-a-side.ts',
    'diff --git a/x.ts c/y.ts',
    '',
  ];
  for (const line of notDiffLines) {
    ok(parseDiffGitLine(line) === null, `非 diff --git 形态返回 null：${JSON.stringify(line)}`,
      String(parseDiffGitLine(line)));
  }
}
{
  ok(parseDiffGitLine(null) === null, '非字符串入参（null）安全返回 null', String(parseDiffGitLine(null)));
}

// ─────────────────────────── 1. normalizeRenamePath ───────────────────────────
console.log('\n--- 1. normalizeRenamePath：--stat 的重命名写法归一 ---');
{
  ok(normalizeRenamePath('src/{old => new}.ts') === 'src/new.ts',
    '花括号形态 src/{old => new}.ts → src/new.ts', normalizeRenamePath('src/{old => new}.ts'));
  ok(normalizeRenamePath('src/{old => new}/x.ts') === 'src/new/x.ts',
    '目录级重命名 src/{old => new}/x.ts → src/new/x.ts', normalizeRenamePath('src/{old => new}/x.ts'));
  ok(normalizeRenamePath('old/name.ts => new/name.ts') === 'new/name.ts',
    '箭头形态 old/name.ts => new/name.ts → new/name.ts', normalizeRenamePath('old/name.ts => new/name.ts'));
  ok(normalizeRenamePath('src/app.ts') === 'src/app.ts',
    '非重命名路径原样返回', normalizeRenamePath('src/app.ts'));
  ok(normalizeRenamePath('"src/a.ts"') === 'src/a.ts',
    'git 引号包裹的路径被去掉引号', normalizeRenamePath('"src/a.ts"'));
  ok(normalizeRenamePath('') === '', '空串返回空串（不抛错）', JSON.stringify(normalizeRenamePath('')));
}

// ─────────────────────────── 2. splitUnifiedPatch ───────────────────────────
console.log('\n--- 2. splitUnifiedPatch：整包 patch 按 diff --git 切段 ---');

const TWO_FILE_PATCH = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 export {};
diff --git a/logo.png b/logo.png
index 3333333..4444444 100644
Binary files a/logo.png and b/logo.png differ`;

{
  const secs = splitUnifiedPatch(TWO_FILE_PATCH);
  ok(secs.length === 2, `两文件 patch 切出 2 段（实际 ${secs.length}）`, secs.map((s) => s.path).join(' , '));
  ok(secs[0]?.path === 'src/a.ts' && secs[1]?.path === 'logo.png',
    '每段 path 取 b 侧路径', `${secs[0]?.path} / ${secs[1]?.path}`);

  const a = secs[0] || {};
  ok(a.additions === 2, `首段 additions === 2（实际 ${a.additions}）`, String(a.additions));
  ok(a.deletions === 1, `首段 deletions === 1（实际 ${a.deletions}）`, String(a.deletions));
  ok(a.isBinary === false, '首段是文本块（isBinary === false）', String(a.isBinary));

  // text 必须覆盖该块**全部行**（含 diff --git / index / --- / +++ / @@）：
  // 少行 → 渲染缺上下文；多行 → 会把下一个文件的 diff 混进来。
  const aLines = String(a.text || '').split('\n');
  ok(aLines.length === 10, `首段 text 覆盖该块全部 10 行（实际 ${aLines.length}）`, JSON.stringify(a.text));
  ok(aLines[0] === 'diff --git a/src/a.ts b/src/a.ts', '首段 text 以 diff --git 行开头', String(aLines[0]));
  ok(String(a.text || '').includes('@@ -1,3 +1,4 @@'), '首段 text 保留 hunk 头 @@ 行');
  ok(String(a.text || '').includes('+const c = 4;'), '首段 text 保留新增行原文');
  ok(String(a.text || '').indexOf('logo.png') < 0, '首段 text 不得混入下一个文件的任何行');

  const bSec = secs[1] || {};
  ok(bSec.isBinary === true, 'Binary files 块 isBinary === true', String(bSec.isBinary));
  ok(bSec.additions === 0 && bSec.deletions === 0,
    '二进制块不计增删行（Binary files 行不是 +/- 行）', `${bSec.additions}/${bSec.deletions}`);

  ok(secs.map((s) => s.text).join('\n') === TWO_FILE_PATCH,
    '各段 text 按序拼接后与原 patch 逐字节相等（切分零丢行、零重复）');
}
{
  // 首个 diff --git 之前的内容必须丢弃：`git show` 不带 --format= 时会带提交头，
  // 混进第一段会渲染成一段「commit xxx」的幽灵差异。
  const HEADED_PATCH = `commit 0123456789abcdef0123456789abcdef01234567
Author: some one <a@b.c>
Date:   Mon Jan 1 00:00:00 2024 +0800

    subject line which is not a diff

diff --git a/x.ts b/x.ts
index 1..2 100644
--- a/x.ts
+++ b/x.ts
@@ -1 +1 @@
-a
+b`;
  const secs = splitUnifiedPatch(HEADED_PATCH);
  ok(secs.length === 1, `前置头行不产生幽灵段（实际 ${secs.length} 段）`, secs.map((s) => s.path).join(' , '));
  const only = secs[0] || {};
  ok(String(only.text || '').indexOf('commit 0123456789abcdef') < 0,
    '首段 text 不含 diff --git 之前的提交头', JSON.stringify(String(only.text || '').slice(0, 60)));
  ok(String(only.text || '').indexOf('diff --git a/x.ts b/x.ts') === 0,
    '首段 text 以首个 diff --git 行开头', String(only.text || '').slice(0, 40));
  ok(only.additions === 1 && only.deletions === 1,
    '丢弃头行后增删计数仍准确（1/1）', `${only.additions}/${only.deletions}`);
}
{
  const RENAME_PATCH = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 100%
rename from src/old-name.ts
rename to src/new-name.ts`;
  const secs = splitUnifiedPatch(RENAME_PATCH);
  ok(secs.length === 1, `纯重命名块切出 1 段（实际 ${secs.length}）`, String(secs.length));
  ok(secs[0]?.oldPath === 'src/old-name.ts', `rename 块 oldPath 为 a 侧旧路径（实际 ${secs[0]?.oldPath}）`);
  ok(secs[0]?.path === 'src/new-name.ts', `rename 块 path 为 b 侧新路径（实际 ${secs[0]?.path}）`);
  ok(secs[0]?.isBinary === false && secs[0]?.additions === 0 && secs[0]?.deletions === 0,
    '纯重命名块无文本差异（isBinary false / 0 增 0 删）',
    `${secs[0]?.isBinary}/${secs[0]?.additions}/${secs[0]?.deletions}`);
}
{
  ok(splitUnifiedPatch('').length === 0, '空串切出 0 段', String(splitUnifiedPatch('').length));
  ok(splitUnifiedPatch('just a plain text, no diff here').length === 0,
    '完全没有 diff --git 的文本切出 0 段', String(splitUnifiedPatch('just a plain text, no diff here').length));
}

// ─────────────────────────── 3. findPatchSection ───────────────────────────
console.log('\n--- 3. findPatchSection：按目标路径取段 ---');
{
  const secs = splitUnifiedPatch(TWO_FILE_PATCH);
  ok(findPatchSection(secs, 'src/a.ts') === secs[0], '按新路径命中首段');
  ok(findPatchSection(secs, 'logo.png') === secs[1], '按新路径命中第二段');
  ok(findPatchSection(secs, 'src/not-there.ts') === null, '不存在的路径返回 null',
    String(findPatchSection(secs, 'src/not-there.ts')));
  ok(findPatchSection([], 'src/a.ts') === null, '空段数组返回 null');
  ok(findPatchSection(null, 'src/a.ts') === null, '非数组入参（null）返回 null');
  ok(findPatchSection(secs, '') === null, '空目标路径返回 null');
}
{
  const secs = splitUnifiedPatch(`diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 100%
rename from src/old-name.ts
rename to src/new-name.ts`);
  // 三种命中形态：新路径 / 旧路径 / --stat 里那串 `{old => new}` 原文。
  // 最后一种是关键——提交详情列表的路径就来自 --stat，拿它查不到等于点了没反应。
  ok(findPatchSection(secs, 'src/new-name.ts') === secs[0], '重命名块按新路径命中');
  ok(findPatchSection(secs, 'src/old-name.ts') === secs[0], '重命名块按旧路径命中（oldPath 兜底）');
  ok(findPatchSection(secs, 'src/{old-name => new-name}.ts') === secs[0],
    '按 --stat 的 {old => new} 形态命中（先归一化再比）',
    String(findPatchSection(secs, 'src/{old-name => new-name}.ts')?.path));
}

// ─────────────────────────── 4. executor.getCommitDiff 真跑 ───────────────────────────
console.log('\n--- 4. executor.getCommitDiff（真实临时 git 仓库）---');
const { GhExecutor } = await import(lib('lib/executor.js'));
const executor = new GhExecutor();
const hasGetCommitDiff = typeof executor.getCommitDiff === 'function';
ok(hasGetCommitDiff, 'lib/executor.js 导出了 getCommitDiff', typeof executor.getCommitDiff);

// 临时仓库而不是本仓：本仓的历史与改动随时在变，拿它当夹具等于测工作区状态而非被测逻辑。
const repoDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-p49-repo-'));
try {
  const git = (...args) => execFileSync('git', args, { cwd: repoDir, stdio: 'ignore' });
  const gitOut = (...args) => String(execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' })).trim();

  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  writeFileSync(path.join(repoDir, 'a.txt'), 'line1\nline2\n', 'utf8');
  writeFileSync(path.join(repoDir, 'b.txt'), 'bbb\n', 'utf8');
  git('add', 'a.txt', 'b.txt');
  git('commit', '-q', '-m', 'init: two files');
  const initSha = gitOut('rev-parse', 'HEAD');

  if (!hasGetCommitDiff) {
    ok(false, '两文件提交 → getCommitDiff 可调用', 'executor.getCommitDiff 尚未实现，跳过真实仓库断言');
  } else {
    const d = await executor.getCommitDiff(repoDir, initSha);
    ok(d && d.ok === true, '两文件提交 → ok === true', d && d.error);
    ok(d && d.truncated === false, '小补丁不触发截断（truncated === false）', d && String(d.truncated));
    ok(d && typeof d.patch === 'string' && d.patch.length > 0, '回执带非空 patch 正文',
      d && typeof d.patch);

    const secs = splitUnifiedPatch(String((d && d.patch) || ''));
    ok(secs.length === 2, `两文件提交切出 2 段（实际 ${secs.length}）`, secs.map((s) => s.path).join(' , '));
    ok(secs.some((s) => s.path === 'a.txt') && secs.some((s) => s.path === 'b.txt'),
      '切出的两段路径分别为 a.txt / b.txt', secs.map((s) => s.path).join(' , '));

    // 重命名提交：`git show` 不会输出 +/- 行，只给 rename from/to。
    // 前端要靠它把「点旧路径」也定位到同一段，所以这里连切分结果一起验。
    git('mv', 'a.txt', 'c.txt');
    git('commit', '-q', '-m', 'rename a.txt to c.txt');
    const renameSha = gitOut('rev-parse', 'HEAD');
    const rd = await executor.getCommitDiff(repoDir, renameSha);
    ok(rd && rd.ok === true, '重命名提交 → ok === true', rd && rd.error);
    ok(/^rename from a\.txt$/m.test(String((rd && rd.patch) || '')),
      'rename 提交的 patch 含 "rename from a.txt"', String((rd && rd.patch) || '').slice(0, 200));
    ok(/^rename to c\.txt$/m.test(String((rd && rd.patch) || '')),
      'rename 提交的 patch 含 "rename to c.txt"', String((rd && rd.patch) || '').slice(0, 200));

    const rsecs = splitUnifiedPatch(String((rd && rd.patch) || ''));
    ok(rsecs.length === 1 && rsecs[0]?.oldPath === 'a.txt' && rsecs[0]?.path === 'c.txt',
      'rename 提交切分后 oldPath=a.txt / path=c.txt',
      JSON.stringify(rsecs.map((s) => ({ oldPath: s.oldPath, path: s.path }))));
    ok(findPatchSection(rsecs, 'a.txt') === rsecs[0] && findPatchSection(rsecs, 'c.txt') === rsecs[0],
      '按旧路径与新路径都能命中同一个重命名段');

    // 非法 sha 必须在触达子进程前拒绝：它是 `git show` 的位置参数，
    // 一个 '-' 开头的字符串会被 git 当成命令行选项。
    const bad = await executor.getCommitDiff(repoDir, 'zzz');
    ok(bad && bad.ok === false, '非法 sha（zzz）→ ok === false', JSON.stringify(bad));
    ok(bad && String(bad.error || '').includes('非法'),
      '非法 sha 的 error 明确写「非法」', bad && bad.error);

    // 体积护栏：整包 patch 超过 400_000 字符时，必须在**最后一个 `\ndiff --git` 边界**截断
    // ——切在 hunk 中间会让前端渲染出错行，宁可整段丢弃并在 UI 上标注「已截断」。
    // 造「小文件 + 巨型文件」的提交：截断后小文件必须活下来、巨型文件必须整段消失。
    writeFileSync(path.join(repoDir, 'a2-small.txt'), 'small change\n', 'utf8');
    writeFileSync(path.join(repoDir, 'z-huge.txt'),
      Array.from({ length: 40000 }, (_, i) => `line ${i} padding`).join('\n') + '\n', 'utf8');
    git('add', 'a2-small.txt', 'z-huge.txt');
    git('commit', '-q', '-m', 'add small + huge');
    const hugeSha = gitOut('rev-parse', 'HEAD');
    const hd = await executor.getCommitDiff(repoDir, hugeSha);
    const hPatch = String((hd && hd.patch) || '');
    ok(hd && hd.ok === true && hd.truncated === true,
      '超大补丁 → ok:true 且 truncated === true',
      `ok=${hd && hd.ok} truncated=${hd && hd.truncated} chars=${hPatch.length}`);
    ok(hPatch.length <= 400000, `截断后长度 ≤ 400000（实际 ${hPatch.length}）`, String(hPatch.length));
    const hsecs = splitUnifiedPatch(hPatch);
    ok(hsecs.length === 1 && hsecs[0]?.path === 'a2-small.txt',
      '在 diff --git 边界截断：保住小文件、整段丢弃巨型文件',
      `${hsecs.map((s) => s.path).join(' , ')} (len=${hPatch.length})`);
    ok(hPatch.indexOf('z-huge.txt') < 0,
      '被丢弃的巨型文件不残留半截 hunk', String(hPatch.length));
  }
} finally {
  // 临时仓库必须删干净：它含 .git 目录，残留在 %TEMP% 里会累积成大量小文件
  rmSync(repoDir, { recursive: true, force: true });
}

// ─────────────────────────── 5. 路由层与源码契约 ───────────────────────────
console.log('\n--- 5. routes-actions 路由与 action 注册 ---');
const routesSrc = readFileSync(path.join(ROOT, 'src/api/routes-actions.ts'), 'utf8');
ok(routesSrc.includes("path: '/api/github/commit-diff'"),
  '路由注册 /api/github/commit-diff');
ok(routesSrc.includes('executor.getCommitDiff'),
  '路由层调用 executor.getCommitDiff');
ok(routesSrc.includes("'get_commit_diff'"),
  'action 通道注册 get_commit_diff（单引号字面量）');

// ─────────────────────────── 6. 前端产物与源码接线 ───────────────────────────
console.log('\n--- 6. 前端 bundle 与组件接线 ---');
const clientPath = path.join(ROOT, 'lib/client.js');
ok(existsSync(clientPath), 'lib/client.js 产物存在');
const clientSrc = existsSync(clientPath) ? readFileSync(clientPath, 'utf8') : '';
ok(clientSrc.includes('FileDiffModal'), 'bundle 含 FileDiffModal 组件（提交详情 / 未提交清单共用）');
ok(clientSrc.includes('splitUnifiedPatch'), 'bundle 含 splitUnifiedPatch 切分函数（整包 patch 前端切段）');
ok(clientSrc.includes('commit-diff'), 'bundle 含 /api/github/commit-diff 调用锚点');
ok(clientSrc.includes('parseDiffGitLine'), 'bundle 含 parseDiffGitLine 头行解析（被内联的 diff-utils）');

ok(existsSync(path.join(ROOT, 'src/ui/file-diff-modal.ts')), 'src/ui/file-diff-modal.ts 文件存在');
const commitModalSrc = readFileSync(path.join(ROOT, 'src/ui/commit-modal.ts'), 'utf8');
ok(commitModalSrc.includes('FileDiffModal'),
  '提交详情弹窗接入 FileDiffModal（文件变更统计行可点开）');
ok(commitModalSrc.includes('onClick'),
  '提交详情的文件统计行绑定了 onClick（不是静态文本）');

// ─────────────────────────── 7. 登记与文档对账 ───────────────────────────
console.log('\n--- 7. run-all 登记与文档 ---');
const runAllSrc = readFileSync(path.join(ROOT, 'test/run-all.mjs'), 'utf8');
const phasesMatch = runAllSrc.match(/const phases = \[([\s\S]*?)\];/);
const phaseList = phasesMatch
  ? (phasesMatch[1].match(/'[^']+\.test\.mjs'/g) || []).map((s) => s.slice(1, -1))
  : [];
ok(phaseList.includes('phase49-diff-preview.test.mjs'),
  'run-all.mjs 的 phases 已登记 phase49-diff-preview.test.mjs', String(phaseList.length));
ok(phaseList.indexOf('phase49-diff-preview.test.mjs') === phaseList.indexOf('phase48-body-file.test.mjs') + 1,
  'phase49 紧随 phase48（后续阶段可追加）', phaseList.slice(-2).join(' , '));

const archSrc = readFileSync(path.join(ROOT, 'docs/architecture.md'), 'utf8');
ok(archSrc.includes(`${phaseList.length} 个独立阶段`),
  `docs/architecture.md 的阶段数与 run-all 一致（${phaseList.length}）`);
ok(archSrc.includes('phase49'),
  'docs/architecture.md 的阶段要点列表含 phase49 条目');

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 49 Diff Preview Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 49 Diff Preview Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
