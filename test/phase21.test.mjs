// test/phase21.test.mjs - Phase 21 · 未提交数据分页加载、Git 对比弹窗与 DSH 查看联动回归测试套件
// 涵盖：
// 1. parseGitStatusOutput 缺省 20 条防膨胀契约与大上限可选扩展
// 2. parseUncommittedDiff 差异增删行数提取纯算法
// 3. getUncommittedFiles 本地轻量流式分页逻辑
// 4. getFileDiff 路径穿越安全防护与多形态 diff 输出
// 5. routes-actions 注册 /api/github/file-diff 与 /api/github/uncommitted-files 契约
// 6. lib/client.js 自包含 Bundle 包含 FileDiffModal、触底加载与 sidebarRight 注入

import path from 'node:path';
import fs from 'node:fs';

async function runTests() {
  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
    }
  }

  console.log('\n--- 1. parseGitStatusOutput 契约与 maxFiles 扩展测试 ---');
  const { GhExecutor, parseGitStatusOutput, parseUncommittedDiff } = await import('../lib/executor.js');

  const manyLines = ['## master...origin/master'].concat(Array.from({ length: 45 }, (_, i) => ` M file_${i}.ts`)).join('\n');
  const defaultParsed = parseGitStatusOutput(manyLines);
  assert(defaultParsed && defaultParsed.dirtyCount === 45, 'dirtyCount 严格保留全量 45 个');
  assert(defaultParsed.dirtyFiles.length === 20, '未传参时严格保留默认 20 条（保护 phase11 契约防膨胀）');

  const expandedParsed = parseGitStatusOutput(manyLines, 50);
  assert(expandedParsed && expandedParsed.dirtyFiles.length === 45, '传入 maxFiles=50 时返回全量 45 条');

  const slicedParsed = parseGitStatusOutput(manyLines, 10);
  assert(slicedParsed && slicedParsed.dirtyFiles.length === 10, '传入 maxFiles=10 时精确切片 10 条');

  console.log('\n--- 2. parseUncommittedDiff 差异增删行数解析纯算法测试 ---');
  const sampleDiff = `diff --git a/test.ts b/test.ts
index 1234567..89abcdef 100644
--- a/test.ts
+++ b/test.ts
@@ -10,6 +10,8 @@ context before
-old line 1
-old line 2
+new line 1
+new line 2
+new line 3
 context after
@@ -30,4 +32,5 @@ second hunk
-deleted line
+added line
 context end`;

  const diffStats = parseUncommittedDiff(sampleDiff);
  assert(diffStats.additions === 4, '正确统计新增行数（忽略 +++ 文件头）');
  assert(diffStats.deletions === 3, '正确统计删除行数（忽略 --- 文件头）');
  assert(diffStats.hunksCount === 2, '正确统计 @@ hunk 区块数量');

  assert(parseUncommittedDiff('').additions === 0, '空字符串安全返回 0 增删');

  console.log('\n--- 3. getUncommittedFiles 与 getFileDiff 执行引擎逻辑测试 ---');
  const executor = new GhExecutor();

  // 路径穿越攻击拦截测试
  const escapeDiff1 = await executor.getFileDiff(process.cwd(), '../../etc/passwd');
  assert(!escapeDiff1.ok && escapeDiff1.error.includes('非法路径'), '有效拦截相对路径穿越 ../../ 攻击');

  const escapeDiff2 = await executor.getFileDiff(process.cwd(), '..\\..\\windows\\system32\\config');
  assert(!escapeDiff2.ok && escapeDiff2.error.includes('非法路径'), '有效拦截 Windows 反斜杠路径穿越攻击');

  const emptyDiff = await executor.getFileDiff(process.cwd(), '');
  assert(!emptyDiff.ok && emptyDiff.error.includes('缺少目标文件路径'), '缺少文件路径时优雅返回错误提示');

  // 当前仓库真实存在的文件 diff 探测
  const selfDiff = await executor.getFileDiff(process.cwd(), 'package.json');
  assert(selfDiff.ok && selfDiff.filePath === 'package.json', '探测已有文件返回结构化 diff 对象');

  // getUncommittedFiles 分页逻辑测试
  const pagedFiles = await executor.getUncommittedFiles(process.cwd(), 15, 0);
  assert(Array.isArray(pagedFiles.items), 'getUncommittedFiles 返回 items 数组');
  assert(typeof pagedFiles.totalCount === 'number', '返回结构化 totalCount 计数');
  assert(typeof pagedFiles.hasMore === 'boolean', '返回 hasMore 布尔标识');

  console.log('\n--- 4. routes-actions 路由层端点注册断言 ---');
  const routesSrc = fs.readFileSync(path.resolve('src/api/routes-actions.ts'), 'utf8');
  assert(routesSrc.includes("path: '/api/github/file-diff'"), '成功注册 /api/github/file-diff 路由');
  assert(routesSrc.includes("path: '/api/github/uncommitted-files'"), '成功注册 /api/github/uncommitted-files 路由');
  assert(routesSrc.includes('executor.getFileDiff'), '路由层正确调用 executor.getFileDiff');
  assert(routesSrc.includes('executor.getUncommittedFiles'), '路由层正确调用 executor.getUncommittedFiles');

  console.log('\n--- 5. lib/client.js 自包含前端产物断言 ---');
  const clientBundle = fs.readFileSync(path.resolve('lib/client.js'), 'utf8');
  assert(clientBundle.includes('UncommittedDiffView'), 'Bundle 产物包含 UncommittedDiffView 原生二级下钻视图');
  assert(clientBundle.includes('activeDiffFile'), 'Bundle 产物维护 activeDiffFile 状态');
  assert(clientBundle.includes('dsh-github-inline-diff-view'), 'Bundle 产物包含二级下钻容器类');
  assert(clientBundle.includes('openFileInDsh'), 'Bundle 产物包含 openFileInDsh DSH 原生查看文件函数');
  assert(clientBundle.includes('dsh-resource://file/session/'), 'Bundle 产物使用 dsh-resource://file/ 原生协议');
  assert(clientBundle.includes('loadMoreDirtyFiles'), 'Bundle 产物包含 loadMoreDirtyFiles 触底流式分页函数');
  assert(clientBundle.includes('visibleDirtyCount'), 'Bundle 产物维护 visibleDirtyCount 切片状态');
  assert(clientBundle.includes('dsh-github-dirty-item'), 'Bundle 产物包含未提交交互样式选择器');
  assert(clientBundle.includes('sidebarRight'), 'Bundle 产物在 inject 中声明 sidebarRight 可选依赖');

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Phase 21 测试通过: ${passed} / ${total}`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
