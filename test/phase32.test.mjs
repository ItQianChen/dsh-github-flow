// test/phase32.test.mjs - Phase 32 · 右侧栏 PR / Issue 状态筛选（默认全部）
//
// 背景（实测复现）：右侧栏「🔀 PR」「📋 Issues」只显示已打开记录，根因是
// `gh pr list` / `gh issue list` 的默认 state 就是 open，不传 `--state` 时：
//   pr list 默认        → []
//   pr list --state all → [#6 CLOSED]
// 数据在到达浏览器前就被 gh 过滤掉了，靠前端加筛选器救不回来。
//
// 覆盖：
// 1. 后端查询口径（--state all / 条数上限 / 触顶标记）
// 2. 偏好存储：按 cwd 隔离的往返、脏数据回退、非法值归一
// 3. 前端接线：两个 filter state 在 Hook 顶层、胶囊栏复用既有类、空态文案
// 4. 过滤语义：all / open / merged / closed 四档行为
// 5. bundle 与 CSS 完整性

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// localStorage shim：storage.ts 是浏览器模块，用最小实现承载
const memoryStore = new Map();
globalThis.localStorage = {
  getItem(k) { return memoryStore.has(k) ? memoryStore.get(k) : null; },
  setItem(k, v) { memoryStore.set(k, String(v)); },
  removeItem(k) { memoryStore.delete(k); },
  key(i) { return [...memoryStore.keys()][i] ?? null; },
  get length() { return memoryStore.size; },
};
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };

async function runTests() {
  let passed = 0, total = 0;
  const ok = (cond, name, extra = '') => {
    total++;
    if (cond) {
      console.log(`✅ PASS: ${name}${extra ? '  → ' + extra : ''}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}${extra ? '  → ' + extra : ''}`);
    }
  };

  const routeSrc = fs.readFileSync(path.join(__dirname, '../src/api/routes-overview.ts'), 'utf8');
  const clientSrc = fs.readFileSync(path.join(__dirname, '../src/client.ts'), 'utf8');
  const typesSrc = fs.readFileSync(path.join(__dirname, '../src/types.ts'), 'utf8');

  // ============================================================
  console.log('\n--- 1. 后端查询口径：必须显式 --state all ---');
  // ============================================================
  // 单仓库 overview 段（global-overview 走 search，另有 phase29 断言）
  const singleStart = routeSrc.indexOf("path: '/api/github/overview'");
  const singleEnd = routeSrc.indexOf("path: '/api/github/global-overview'");
  const singleSrc = singleStart >= 0 && singleEnd > singleStart ? routeSrc.slice(singleStart, singleEnd) : '';
  ok(singleSrc.length > 0, '成功定位单仓库 overview 段');

  ok(/export const RIGHTBAR_LIST_LIMIT = \d+/.test(routeSrc), '默认页大小抽成常量（客户端步长与它对齐）');
  const limitMatch = routeSrc.match(/const RIGHTBAR_LIST_LIMIT = (\d+)/);
  const limit = limitMatch ? Number(limitMatch[1]) : 0;
  // s5：首屏 15 + 下滑加载更多，所以不再要求单页 >= 20；关键是「能继续加载」
  ok(limit === 15, `默认每页 15 条（与 Git 提交 / 未提交变更两个分页同口径）`, String(limit));

  ok(/'pr',\s*'list',\s*'--state',\s*'all'/.test(singleSrc), 'PR 查询显式传 --state all');
  ok(/'issue',\s*'list',\s*'--state',\s*'all'/.test(singleSrc), 'Issue 查询显式传 --state all');
  // 只看实际命令数组：注释里为说明历史而提到 --state=open 是合理的，不该误伤
  ok(!/['"]--state['"]\s*,\s*['"]open['"]/.test(singleSrc), "单仓库命令不得传 --state open");
  ok(!/['"]--state=open['"]/.test(singleSrc), '单仓库命令不得出现 --state=open');

  const prLimitUsage = /'pr',\s*'list',[\s\S]{0,600}?'-L',\s*String\(prLimit\)/.test(singleSrc);
  const issueLimitUsage = /'issue',\s*'list',[\s\S]{0,600}?'-L',\s*String\(issueLimit\)/.test(singleSrc);
  ok(prLimitUsage, 'PR 查询使用本次请求的 prLimit 参数');
  ok(issueLimitUsage, 'Issue 查询使用本次请求的 issueLimit 参数');

  // 每条 gh 命令都必须在 Promise.all 里，不能退化成串行（右栏首屏受 8s 超时约束）
  ok(/Promise\.all\(\[/.test(singleSrc), 'PR/Issue/Run 仍并发拉取（不退化为串行）');
  ok(!/const RIGHTBAR_LIST_LIMIT[\s\S]{0,200}Promise[\s\S]{0,50}chain/.test(routeSrc), '未引入额外串行链路');

  // ============================================================
  console.log('\n--- 2. 触顶标记：截断必须可感知 ---');
  // ============================================================
  // 有真实总数时用精确比较（loaded < total），拿不到才回落「本次是否拉满」的启发式。
  // 精确比较能消除边界误报：loaded=total 时 `>= prLimit` 会误判为还有更多，点下去却拉不到东西。
  ok(/pullRequests\.length < repoCounts\.prTotal/.test(routeSrc), 'PR 触顶判定优先用真实总数做精确比较');
  ok(/pullRequests\.length >= prLimit/.test(routeSrc), 'PR 触顶判定在无总数时回落本次分页参数');
  ok(/issues\.length < repoCounts\.issueTotal/.test(routeSrc), 'Issue 触顶判定优先用真实总数做精确比较');
  ok(/issues\.length >= issueLimit/.test(routeSrc), 'Issue 触顶判定在无总数时回落本次分页参数');
  ok(/\.\.\.\(prsTruncated \? \{ prsTruncated: true \} : \{\}\)/.test(routeSrc), '仅在触顶时下发 prsTruncated');
  ok(/\.\.\.\(issuesTruncated \? \{ issuesTruncated: true \} : \{\}\)/.test(routeSrc), '仅在触顶时下发 issuesTruncated');
  ok(/prsTruncated\?:\s*boolean/.test(typesSrc), 'GitHubOverviewData 声明 prsTruncated');
  ok(/issuesTruncated\?:\s*boolean/.test(typesSrc), 'GitHubOverviewData 声明 issuesTruncated');

  // 失败分支不得带截断标记（否则网络故障会被误读成「数据被截断」）
  const failBranch = routeSrc.slice(routeSrc.indexOf('const freshData: GitHubOverviewData = {'), routeSrc.indexOf('sendJson(res, 200, { ok: true, partialFailure: true'));
  ok(!failBranch.includes('prsTruncated'), '网络失败分支不带截断标记');

  // ============================================================
  console.log('\n--- 3. 偏好存储：按 cwd 隔离 + 脏数据回退 ---');
  // ============================================================
  const storage = await import('../lib/ui/storage.js');
  ok(typeof storage.getStoredRightbarStateFilter === 'function', '导出 getStoredRightbarStateFilter');
  ok(typeof storage.saveStoredRightbarStateFilter === 'function', '导出 saveStoredRightbarStateFilter');
  ok(Array.isArray(storage.PR_STATE_FILTERS) && storage.PR_STATE_FILTERS.includes('merged'), 'PR 合法档含 merged');
  ok(Array.isArray(storage.ISSUE_STATE_FILTERS) && !storage.ISSUE_STATE_FILTERS.includes('merged'), 'Issue 合法档不含 merged（Issue 没有该状态）');

  // 默认值
  memoryStore.clear();
  const def = storage.getStoredRightbarStateFilter('/repo/a');
  ok(def.pr === 'all' && def.issue === 'all', '无存储时默认 all/all');

  // 往返
  storage.saveStoredRightbarStateFilter('/repo/a', { pr: 'merged' });
  ok(storage.getStoredRightbarStateFilter('/repo/a').pr === 'merged', 'PR 筛选可持久化并读回');
  ok(storage.getStoredRightbarStateFilter('/repo/a').issue === 'all', '只写 PR 不覆盖 Issue 档位');

  storage.saveStoredRightbarStateFilter('/repo/a', { issue: 'closed' });
  const both = storage.getStoredRightbarStateFilter('/repo/a');
  ok(both.pr === 'merged' && both.issue === 'closed', '分次写入可累积（不互相清空）');

  // 按 cwd 隔离
  ok(storage.getStoredRightbarStateFilter('/repo/b').pr === 'all', '不同 cwd 互不影响');
  storage.saveStoredRightbarStateFilter('/repo/b', { pr: 'open' });
  ok(storage.getStoredRightbarStateFilter('/repo/a').pr === 'merged', '写 B 仓库不污染 A 仓库');
  ok(storage.getStoredRightbarStateFilter('/repo/b').pr === 'open', 'B 仓库独立保存');

  // null / 空 cwd 归一到同一个 default 桶，不抛错
  ok(storage.getStoredRightbarStateFilter(null).pr === 'all', 'null cwd 不抛错且回落默认');
  storage.saveStoredRightbarStateFilter(null, { pr: 'closed' });
  ok(storage.getStoredRightbarStateFilter(null).pr === 'closed', 'null cwd 可正常读写');
  ok(storage.getStoredRightbarStateFilter(undefined).pr === 'closed', 'undefined 与 null 共用 default 桶');

  // 脏数据回退
  memoryStore.clear();
  memoryStore.set(storage.RIGHTBAR_STATE_FILTER_KEY, '{broken json');
  const broken = storage.getStoredRightbarStateFilter('/repo/a');
  ok(broken.pr === 'all' && broken.issue === 'all', 'JSON 损坏时回退默认，不抛错');
  storage.saveStoredRightbarStateFilter('/repo/a', { pr: 'open' });
  ok(storage.getStoredRightbarStateFilter('/repo/a').pr === 'open', '损坏后仍可重新写入（不被坏记录永久锁死）');

  // 非法值归一
  memoryStore.clear();
  storage.saveStoredRightbarStateFilter('/repo/a', { pr: 'not-a-state' });
  ok(storage.getStoredRightbarStateFilter('/repo/a').pr === 'all', '非法 PR 状态归一为 all');
  storage.saveStoredRightbarStateFilter('/repo/a', { issue: 'merged' });
  ok(storage.getStoredRightbarStateFilter('/repo/a').issue === 'all', 'Issue 不接受 merged（归一为 all）');

  // 大小写归一
  memoryStore.clear();
  storage.saveStoredRightbarStateFilter('/repo/a', { pr: 'MERGED' });
  ok(storage.getStoredRightbarStateFilter('/repo/a').pr === 'merged', '大写输入归一为小写档位');

  /*
   * 作用域键必须无碰撞。
   * 旧实现用 `replace(/[^a-zA-Z0-9_-]/g, "_")` 把不同路径压成同一个键——
   * 实测 `/a/b` 与 `/a_b` 都变成 `_a_b`，两个仓库的筛选会互相覆盖。
   */
  memoryStore.clear();
  storage.saveStoredRightbarStateFilter('/a/b', { pr: 'open' });
  storage.saveStoredRightbarStateFilter('/a_b', { pr: 'closed' });
  ok(storage.getStoredRightbarStateFilter('/a/b').pr === 'open', '斜杠路径与下划线路径不互相覆盖（/a/b）');
  ok(storage.getStoredRightbarStateFilter('/a_b').pr === 'closed', '斜杠路径与下划线路径不互相覆盖（/a_b）');

  // Windows 盘符路径与 POSIX 路径也不得碰撞
  memoryStore.clear();
  storage.saveStoredRightbarStateFilter('C:\\work\\repo', { pr: 'open' });
  storage.saveStoredRightbarStateFilter('C:/work/repo', { pr: 'merged' });
  ok(
    storage.getStoredRightbarStateFilter('C:\\work\\repo').pr !== storage.getStoredRightbarStateFilter('C:/work/repo').pr,
    '反斜杠与正斜杠路径分开存储（各自记住自己的选择）'
  );

  // ============================================================
  console.log('\n--- 4. 前端接线：Hook 位置与胶囊栏 ---');
  // ============================================================
  ok(/var \[prStateFilter, setPrStateFilter\] = React\.useState/.test(clientSrc), '新增 prStateFilter state');
  ok(/var \[issueStateFilter, setIssueStateFilter\] = React\.useState/.test(clientSrc), '新增 issueStateFilter state');
  ok(/getStoredRightbarStateFilter\(cwd\)\.pr/.test(clientSrc), 'PR 初值来自按 cwd 读取的偏好');
  ok(/getStoredRightbarStateFilter\(cwd\)\.issue/.test(clientSrc), 'Issue 初值来自按 cwd 读取的偏好');

  // 两个 state 必须在 GithubRightbarBody 组件体内（renderGithubRepoView 之外）。
  // 注意：renderGithubRepoView 定义在 GithubRightbarBody 之前，所以「定义位置在
  // renderGithubRepoView 之后」本身就是正确形态——不能用 index 大小判断内外。
  const bodyStart = clientSrc.indexOf('function GithubRightbarBody');
  const prStateIdx = clientSrc.indexOf('var [prStateFilter, setPrStateFilter]');
  ok(bodyStart >= 0 && prStateIdx > bodyStart, 'filter state 定义在 GithubRightbarBody 内');
  // 真正的判据：renderGithubRepoView 函数体内（签名起点到下一个顶层 function 之间）不含 useState
  const renderStart = clientSrc.indexOf('function renderGithubRepoView');
  const nextTopFn = clientSrc.indexOf('\n    function ', renderStart + 10);
  const renderBody = clientSrc.slice(renderStart, nextTopFn > 0 ? nextTopFn : renderStart + 20000);
  ok(renderStart > 0 && renderBody.length > 1000, '成功截取 renderGithubRepoView 函数体');
  ok(!/React\.useState\(/.test(renderBody), 'renderGithubRepoView 内无 useState（避免每次渲染新 Hook 序列）');

  // 形参追加在末尾（位置参数错位是静默 bug）
  const sigEnd = clientSrc.indexOf(') {', clientSrc.indexOf('function renderGithubRepoView'));
  const sig = clientSrc.slice(clientSrc.indexOf('function renderGithubRepoView'), sigEnd);
  ok(/onSelectIssue[\s\S]{0,400}prStateFilter[\s\S]{0,400}issueStateFilter[\s\S]{0,300}onChangePrFilter/.test(sig), '新增形参追加在既有参数之后');

  // 切仓库对齐偏好：只依赖 cwd
  ok(/React\.useEffect\(function \(\) \{[\s\S]{0,200}getStoredRightbarStateFilter\(cwd\)[\s\S]{0,200}\}, \[cwd\]\)/.test(clientSrc), '切仓库时对齐偏好，且只依赖 cwd（数据刷新不重置用户选择）');

  // 胶囊复用既有类名，不新造视觉
  const prPillsIdx = clientSrc.indexOf('var prPillsEl = h(');
  const issuePillsIdx = clientSrc.indexOf('var issuePillsEl = h(');
  ok(prPillsIdx > 0 && issuePillsIdx > 0, 'PR 与 Issue 各自渲染胶囊栏');
  const prPills = clientSrc.slice(prPillsIdx, prPillsIdx + 1800);
  const issuePills = clientSrc.slice(issuePillsIdx, issuePillsIdx + 1400);
  ok(prPills.includes('dsh-github-pills') && prPills.includes('dsh-github-pill-btn'), 'PR 胶囊复用首页既有样式类');
  ok(issuePills.includes('dsh-github-pills') && issuePills.includes('dsh-github-pill-btn'), 'Issue 胶囊复用首页既有样式类');
  ok(prPills.includes('全部 (') && issuePills.includes('全部 ('), '两处都有「全部」档');
  ok(prPills.includes('Merged (') && prPills.includes('Closed ('), 'PR 有 Merged / Closed 档');
  ok(!issuePills.includes('Merged ('), 'Issue 不显示 Merged 档（状态域不含该值）');
  ok(prPills.includes('aria-pressed') && issuePills.includes('aria-pressed'), '胶囊具备 aria-pressed 状态（无障碍）');

  // 过滤语义
  ok(/if \(prStateFilter === "all"\) return true;/.test(clientSrc), 'PR 过滤：all 直接放行');
  ok(/String\(pr\.state \|\| ""\)\.toLowerCase\(\) === prStateFilter/.test(clientSrc), 'PR 过滤：按 state 归一比较');
  ok(/if \(issueStateFilter === "all"\) return true;/.test(clientSrc), 'Issue 过滤：all 直接放行');
  ok(/String\(issue\.state \|\| ""\)\.toLowerCase\(\) === issueStateFilter/.test(clientSrc), 'Issue 过滤：按 state 归一比较');
  ok(/filteredPrs\.map\(/.test(clientSrc), 'PR 列表渲染使用过滤后的数组');
  ok(/filteredIssues\.map\(/.test(clientSrc), 'Issue 列表渲染使用过滤后的数组');

  // 计数必须先于过滤（否则切档后其它档显示 0）
  const prCountIdx = clientSrc.indexOf('var prByState = { open: 0, merged: 0, closed: 0 }');
  const prFilterIdx = clientSrc.indexOf('var filteredPrs = prs.filter(');
  ok(prCountIdx > 0 && prCountIdx < prFilterIdx, 'PR 计数在过滤之前（胶囊数字反映全量）');
  const issueCountIdx = clientSrc.indexOf('var issueByState = { open: 0, closed: 0 }');
  const issueFilterIdx = clientSrc.indexOf('var filteredIssues = issues.filter(');
  ok(issueCountIdx > 0 && issueCountIdx < issueFilterIdx, 'Issue 计数在过滤之前');

  // 空态文案：删掉错误暗示，补筛选引导
  ok(!clientSrc.includes('当前无开放中的 PR'), '删除「当前无开放中的 PR」（错误暗示）');
  ok(!clientSrc.includes('当前无开放中的 Issue'), '删除「当前无开放中的 Issue」（错误暗示）');
  ok(clientSrc.includes('该仓库暂无 Pull Request 记录'), 'PR 有「仓库无记录」空态');
  ok(clientSrc.includes('该仓库暂无 Issue 记录'), 'Issue 有「仓库无记录」空态');
  ok(/下无结果，共 \$\{prs\.length\} 条记录（切换到「全部」查看）/.test(clientSrc), 'PR 有空态+总数+切换引导');
  ok(/下无结果，共 \$\{issues\.length\} 条记录（切换到「全部」查看）/.test(clientSrc), 'Issue 有空态+总数+切换引导');
  // 空态文案里不能出现内部档位键（merged/closed），否则用户看到「当前筛选「merged」」
  ok(/当前筛选「\$\{prFilterLabel\}」/.test(clientSrc), 'PR 空态使用人类可读标签而非内部键');
  ok(/当前筛选「\$\{issueFilterLabel\}」/.test(clientSrc), 'Issue 空态使用人类可读标签而非内部键');
  ok(/var PR_STATE_LABEL: Record<string, string> = \{/.test(clientSrc), 'PR 档位标签映射表存在');
  ok(/var ISSUE_STATE_LABEL: Record<string, string> = \{/.test(clientSrc), 'Issue 档位标签映射表存在');

  // 截断提示渲染
  ok(clientSrc.includes('data.prsTruncated'), '前端消费 prsTruncated');
  ok(clientSrc.includes('data.issuesTruncated'), '前端消费 issuesTruncated');
  // s5 起「触顶」不再是只能看、不能动的提示，而是可点击的「加载更多」入口
  ok(/renderListMore\(\"prs\"/.test(clientSrc), 'PR 触顶时渲染可加载更多的页脚');
  ok(/renderListMore\(\"issues\"/.test(clientSrc), 'Issue 触顶时渲染可加载更多的页脚');

  // 卡片布局纪律（phase29 回归点）
  const prCardIdx = clientSrc.indexOf('filteredPrs.map((pr: any) =>');
  const prCardSlice = clientSrc.slice(prCardIdx, prCardIdx + 400);
  ok(!/style:\s*\{[^}]*display:\s*"flex"/.test(prCardSlice), 'PR 卡片容器仍无内联 display:flex');
  const issueCardIdx = clientSrc.indexOf('filteredIssues.map((issue: any) =>');
  const issueCardSlice = clientSrc.slice(issueCardIdx, issueCardIdx + 400);
  ok(!/style:\s*\{[^}]*display:\s*"flex"/.test(issueCardSlice), 'Issue 卡片容器仍无内联 display:flex');

  // ============================================================
  console.log('\n--- 5. bundle 与 CSS 完整性 ---');
  // ============================================================
  const bundle = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
  for (const key of ['prStateFilter', 'issueStateFilter', 'getStoredRightbarStateFilter', 'saveStoredRightbarStateFilter', 'filteredPrs', 'filteredIssues']) {
    ok(bundle.includes(key), `bundle 含 ${key}`);
  }
  ok(bundle.includes('RIGHTBAR_STATE_FILTER_KEY'), 'bundle 含偏好存储 key');
  ok(!bundle.includes('当前无开放中的 PR'), 'bundle 已无旧空态文案');
  ok(!/\bexport\s+(async\s+)?(function|const|var|let|class)\b/.test(bundle), 'bundle 无裸 export 残留');

  const cssVarMatch = bundle.match(/(?:var|const) GITHUB_PANEL_CSS = `([\s\S]*?)`;/);
  const inlinedCss = cssVarMatch ? cssVarMatch[1] : '';
  ok(inlinedCss.includes('.dsh-github-pill-btn'), '胶囊样式已内联（复用而非新造）');
  const openBraces = (inlinedCss.match(/\{/g) || []).length;
  const closeBraces = (inlinedCss.match(/\}/g) || []).length;
  ok(openBraces > 300 && openBraces === closeBraces, `内联 CSS 花括号配平（${openBraces} 对）`);

  console.log('\n========================================');
  console.log(`Phase 32 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
