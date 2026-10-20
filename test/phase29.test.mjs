// test/phase29.test.mjs - Phase 29 · PR/Issue 数据可见性 · 文件区拖拽折叠 · 右侧栏点击行为
//
// 背景（实测）：账号 7 个 PR 全为 merged/closed、5 个 Issue 全为 closed，
// `--state=open` 恒返回空数组（exit 0，属"正确但无用"），用户看到一片空白。
//
// 覆盖：
// 1. 查询放宽：不得再带 --state=open，且 --json 必须含 state
// 2. clampFilePaneWidth 纯函数边界
// 3. 文件区偏好持久化 get/save 往返与脏数据回退
// 4. 弹窗拖拽/折叠结构存在性
// 5. 右侧栏 PR 标题不再是直接跳转的 <a>
// 6. React Hooks 顺序防回退

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  // ============================================================
  console.log('\n--- 1. PR/Issue 查询放宽（不再被 --state=open 过滤成空）---');
  // ============================================================
  ok(!/search',\s*'prs'[\s\S]{0,200}--state=open/.test(routeSrc), 'PR 查询不再带 --state=open');
  ok(!/search',\s*'issues'[\s\S]{0,200}--state=open/.test(routeSrc), 'Issue 查询不再带 --state=open');
  ok(!routeSrc.includes("'--state=open'"), '整个文件已无任何 --state=open 硬过滤');
  ok(/search',\s*'prs',\s*'--author=@me'/.test(routeSrc), 'PR 仍按 author=@me 检索（保留身份语义）');
  ok(/number,title,state,repository,url,updatedAt,isDraft/.test(routeSrc), 'PR 的 --json 含 state 字段');
  ok(/const issueFields = '[^']*\bstate\b[^']*'/.test(routeSrc), 'Issue 的 issueFields 含 state 字段');

  // 三条 Issue 查询都必须还在（owner / assignee / author）
  ok(routeSrc.includes("'--owner=@me'") && routeSrc.includes("'--assignee=@me'") && routeSrc.includes("'--author=@me'"), 'Issue 三维检索（owner/assignee/author）全部保留');

  /*
   * 截断必须可感知：去掉 open 过滤后按 updatedAt 降序取最近 N 条，
   * 若历史 PR 超过上限，界面会静默少显示——用户无法区分
   * 「列表到此为止」与「数据没取到」。必须把触顶事实透出到 UI。
   */
  ok(/PR_SEARCH_LIMIT\s*=\s*\d+/.test(routeSrc), 'PR 检索上限抽成常量（避免查询与截断判断两处漂移）');
  ok(/myPrs\.length\s*>=\s*PR_SEARCH_LIMIT/.test(routeSrc), '命中上限时记录截断标记');
  ok(routeSrc.includes('prsTruncated'), '响应体下发 prsTruncated 字段');
  const typesSrc = fs.readFileSync(path.join(__dirname, '../src/types.ts'), 'utf8');
  ok(/prsTruncated\?:\s*boolean/.test(typesSrc), 'GlobalOverviewData 声明 prsTruncated');

  // ============================================================
  console.log('\n--- 2. clampFilePaneWidth 纯函数边界 ---');
  // ============================================================
  const { clampFilePaneWidth, getPrFilePanePrefs, savePrFilePanePrefs,
          PR_FILE_PANE_MIN_WIDTH, PR_FILE_PANE_DEFAULT_WIDTH } = await import('../lib/ui/storage.js');

  ok(clampFilePaneWidth(300, 1000) === 300, '正常区间内原样返回');
  ok(clampFilePaneWidth(10, 1000) === PR_FILE_PANE_MIN_WIDTH, '低于下限被抬到最小值', String(clampFilePaneWidth(10, 1000)));
  ok(clampFilePaneWidth(9999, 1000) === 600, '超过容器 60% 被压到上限', String(clampFilePaneWidth(9999, 1000)));
  ok(clampFilePaneWidth(9999, 0) === 9999, '容器宽度未知时只做下限保护');
  // 容器极窄：上限算出来比下限还小，必须保下限而不是返回更小的值
  ok(clampFilePaneWidth(500, 100) === PR_FILE_PANE_MIN_WIDTH, '容器极窄时仍保下限（不会把 diff 挤成 0）', String(clampFilePaneWidth(500, 100)));
  ok(clampFilePaneWidth(NaN, 1000) === PR_FILE_PANE_DEFAULT_WIDTH, 'NaN 回退默认宽度');
  ok(clampFilePaneWidth(-50, 1000) === PR_FILE_PANE_MIN_WIDTH, '负宽度被抬到最小值');
  ok(clampFilePaneWidth(300.7, 1000) === 301, '小数四舍五入为整数');

  // ============================================================
  console.log('\n--- 3. 文件区偏好持久化（含脏数据回退）---');
  // ============================================================
  // 用最小 localStorage 垫片在 Node 里驱动真实读写逻辑
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  ok(getPrFilePanePrefs().width === PR_FILE_PANE_DEFAULT_WIDTH, '无存储时返回默认宽度');
  ok(getPrFilePanePrefs().hidden === false, '无存储时默认不折叠');

  savePrFilePanePrefs({ width: 420, hidden: true });
  const roundTrip = getPrFilePanePrefs();
  ok(roundTrip.width === 420 && roundTrip.hidden === true, '保存后读取往返一致');

  store.set('dsh_github_pr_file_pane_v1', '{ 坏 JSON');
  ok(getPrFilePanePrefs().width === PR_FILE_PANE_DEFAULT_WIDTH, '脏 JSON 回退默认值不抛错');

  store.set('dsh_github_pr_file_pane_v1', JSON.stringify({ width: 'abc', hidden: 'yes' }));
  const dirty = getPrFilePanePrefs();
  ok(dirty.width === PR_FILE_PANE_DEFAULT_WIDTH, '非数字宽度回退默认');
  ok(dirty.hidden === false, '非布尔折叠态按 false 处理');

  store.set('dsh_github_pr_file_pane_v1', JSON.stringify({ width: 5, hidden: false }));
  ok(getPrFilePanePrefs().width === PR_FILE_PANE_MIN_WIDTH, '存储里的小宽度读出时仍被 clamp');

  // ============================================================
  console.log('\n--- 4. 弹窗拖拽与折叠结构 ---');
  // ============================================================
  const modalSrc = fs.readFileSync(path.join(__dirname, '../src/ui/pr-modal.ts'), 'utf8');
  ok(modalSrc.includes('beginResize'), '存在拖拽起始处理函数');
  ok(modalSrc.includes("document.addEventListener(\"mousemove\""), 'mousemove 挂在 document（防指针脱离丢事件）');
  ok(modalSrc.includes("document.removeEventListener(\"mousemove\""), 'mouseup 成对解绑，无监听泄漏');
  ok(modalSrc.includes('col-resize'), '拖拽期间切 col-resize 光标');
  // 拖到一半按 Esc 关闭弹窗时，mouseup 永不触发——必须有卸载兜底清理，
  // 否则 document 监听泄漏且 body 上残留 col-resize 光标（整页光标异常）
  ok(modalSrc.includes('cleanupDragRef'), '存在拖拽清理函数登记（防监听泄漏）');
  ok(/React\.useEffect\(\(\) => \{\s*return \(\) => \{[\s\S]{0,300}cleanupDragRef\.current/.test(modalSrc), '卸载时兜底调用拖拽清理');
  ok(modalSrc.includes('document.body.style.cursor = ""'), '清理时复位光标');
  ok(modalSrc.includes('toggleFilePane'), '存在折叠切换函数');
  ok(modalSrc.includes('dsh-github-pr-splitter'), '分隔条元素存在');
  ok(modalSrc.includes('dsh-github-pr-splitter-toggle'), '折叠按钮存在');
  ok(modalSrc.includes('filePaneHidden'), '折叠态参与渲染分支');
  ok(/filePaneWidth \+ "px"/.test(modalSrc), '文件区宽度由状态驱动而非固定 280px');

  // Hooks 顺序：文件区状态也必须在 early return 之前
  const fnStart = modalSrc.search(/export function PrDetailModal/);
  const earlyReturn = modalSrc.search(/if \(!prNumber\) return null;/);
  const paneHook = modalSrc.search(/React\.useState\(initialPanePrefs\.width\)/);
  ok(fnStart >= 0 && paneHook > fnStart, '文件区宽度 Hook 位于组件体内');
  ok(earlyReturn < 0 || paneHook < earlyReturn, '文件区 Hook 在 early return 之前（Hooks 顺序铁律）');

  // ============================================================
  console.log('\n--- 5. 右侧栏 PR 标题不再直接跳转 ---');
  // ============================================================
  const clientSrc = fs.readFileSync(path.join(__dirname, '../src/client.ts'), 'utf8');
  // 定位右侧栏 PR 渲染块。
  // 锚点从 'prs.map(' 改为 'filteredPrs.map(' —— phase32 加了状态筛选，
  // 渲染对象换成了过滤后的数组。断言内容不变，仅跟随实现演进。
  const prBlockStart = clientSrc.indexOf('filteredPrs.map((pr: any) =>');
  const prBlock = prBlockStart >= 0 ? clientSrc.slice(prBlockStart, prBlockStart + 2600) : '';
  ok(prBlock.length > 0, '成功定位右侧栏 PR 渲染块');
  ok(prBlock.includes('dsh-github-pr-title-row'), '右侧栏：标题与跳转按钮包进同行容器');
  ok(/dsh-github-pr-title-row[\s\S]{0,700}dsh-github-pr-gh-btn/.test(prBlock), '右侧栏：跳转按钮位于标题行内');
  ok(prBlock.includes('GitHub ↗'), '右侧栏：跳转按钮有明确文字标签（非裸箭头）');
  ok(/dsh-github-pr-gh-btn[\s\S]{0,400}stopPropagation/.test(prBlock), '右侧栏：跳转按钮 stopPropagation（不连带开弹窗）');
  // 标题必须是 span 而非 <a href>，否则点标题仍会跳浏览器
  ok(!/h\("a",\s*\{\s*className: "dsh-github-item-title"/.test(prBlock), '右侧栏：标题不是 <a>（点击进弹窗）');
  ok(!prBlock.includes('dsh-github-pr-ext-link'), '右侧栏：旧的裸箭头类名已移除');

  // ============================================================
  console.log('\n--- 5b. 主面板 PR 标题行与右侧栏同构 ---');
  // ============================================================
  const panelSrc = fs.readFileSync(path.join(__dirname, '../src/ui/workspace-panel.ts'), 'utf8');
  const panelPrStart = panelSrc.indexOf('filteredPrs.map((pr: any)');
  const panelPrBlock = panelPrStart >= 0 ? panelSrc.slice(panelPrStart, panelPrStart + 2600) : '';
  ok(panelPrBlock.length > 0, '成功定位主面板 PR 渲染块');
  ok(panelPrBlock.includes('dsh-github-pr-title-row'), '主面板：标题与跳转按钮同行');
  ok(panelPrBlock.includes('GitHub ↗'), '主面板：跳转按钮有文字标签（替换原裸 ↗）');
  /*
   * 卡片容器绝不能带 display:flex / alignItems / flexWrap 这类内联样式。
   * 曾经写成 display:flex + alignItems:center + flexWrap:wrap，
   * 直接顶掉 .dsh-github-item 的 flex-direction:column，
   * 导致标题、徽章、时间全部横向挤成一行并整体居中——整张卡片布局被毁。
   */
  const cardStyleSlice = panelPrBlock.slice(0, panelPrBlock.indexOf('dsh-github-pr-title-row'));
  ok(!/style:\s*\{[^}]*display:\s*"flex"/.test(cardStyleSlice), '主面板：卡片容器不得内联 display:flex（会顶掉 column 布局）');
  ok(!/style:\s*\{[^}]*alignItems/.test(cardStyleSlice), '主面板：卡片容器不得内联 alignItems（会导致内容居中）');
  ok(!/style:\s*\{[^}]*flexWrap/.test(cardStyleSlice), '主面板：卡片容器不得内联 flexWrap');

  /*
   * 状态徽章必须在标题行内，且排在标题之后、GitHub 按钮之前。
   * 顺序错了（如徽章落在按钮后面，或跑回卡片独立一行）都会破坏阅读顺序。
   */
  const titleRowStart = panelPrBlock.indexOf('dsh-github-pr-title-row');
  const titleRowEnd = panelPrBlock.indexOf('formatRelativeTime(pr.updatedAt)');
  const titleRowBlock = titleRowEnd > titleRowStart
    ? panelPrBlock.slice(titleRowStart, titleRowEnd)
    : panelPrBlock.slice(titleRowStart);
  ok(titleRowBlock.includes("s === 'MERGED'"), '状态徽章已移入标题行（不再独占一行）');
  ok(titleRowBlock.includes('dsh-github-pr-gh-btn'), '标题行内含 GitHub 跳转按钮');
  const stateIdx = titleRowBlock.indexOf("s === 'MERGED'");
  const btnIdx = titleRowBlock.indexOf('dsh-github-pr-gh-btn');
  ok(stateIdx >= 0 && btnIdx >= 0 && stateIdx < btnIdx, '状态徽章排在按钮左侧（标题 → 状态 → 按钮）');
  // 标题行内各元素顺序：标题 span 在最前
  const titleSpanIdx = titleRowBlock.indexOf('dsh-github-item-title');
  ok(titleSpanIdx >= 0 && titleSpanIdx < stateIdx, '标题排在最前（标题 → 状态 → 按钮）');
  // 两处必须共用同一套类名，禁止各写一套导致视觉分裂
  ok(prBlock.includes('dsh-github-pr-gh-btn') && panelPrBlock.includes('dsh-github-pr-gh-btn'), '侧栏与主面板共用同一按钮类名');
  ok(prBlock.includes('dsh-github-pr-title-row') && panelPrBlock.includes('dsh-github-pr-title-row'), '侧栏与主面板共用同一标题行类名');
  // 状态徽章两处都要有：同一 PR 在侧栏与主面板显示的信息必须一致
  ok(panelPrBlock.includes("s === 'MERGED'"), '主面板显示 PR 状态徽章');
  ok(/s === "MERGED"|s === 'MERGED'/.test(prBlock), '右侧栏同样显示 PR 状态徽章（与主面板一致）');

  // ============================================================
  console.log('\n--- 6. bundle 与样式产物 ---');
  // ============================================================
  const bundle = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
  for (const key of ['dsh-github-pr-splitter', 'dsh-github-pr-splitter-toggle', 'dsh-github-pr-gh-btn', 'dsh-github-pr-title-row', 'clampFilePaneWidth']) {
    ok(bundle.includes(key), `bundle 含 ${key}`);
  }
  ok(!bundle.includes('dsh-github-pr-ext-link'), 'bundle 无旧跳转按钮样式残留');
  ok(bundle.includes('prStateFilter'), 'bundle 含 PR 状态筛选状态');

  /*
   * 关键回归：bundle 内联的 CSS 必须是「注释已整体剥离、语法完好」的。
   *
   * 历史 Bug：build.mjs 曾用 `.filter(l => !l.startsWith('/*'))` 逐行过滤，
   * 只能丢掉「以 /* 开头」的行；多行注释的中间行形如 `* 说明文字`，
   * 不以 /* 开头 → 被保留，而首尾的 /* 与 *\/ 被丢弃。
   * 于是 CSS 里残留 `* margin-left: auto 是双保险…` 这类非法文本，
   * 浏览器判定该规则无效并整条丢弃，
   * 表现为「写了边框背景的按钮渲染成裸链接」「flex 布局完全不生效」。
   */
  const cssVarMatch = bundle.match(/(?:var|const) GITHUB_PANEL_CSS = `([\s\S]*?)`;/);
  ok(Boolean(cssVarMatch), '能在 bundle 中定位内联的 GITHUB_PANEL_CSS');
  const inlinedCss = cssVarMatch ? cssVarMatch[1] : '';
  ok(!inlinedCss.includes('/*'), '内联 CSS 无残留 /* 注释开头');
  ok(!inlinedCss.includes('*/'), '内联 CSS 无残留 */ 注释结尾');
  ok(!/^\*/m.test(inlinedCss), '内联 CSS 无「行首 *」非法注释残留（曾导致整条规则被浏览器丢弃）');
  const openBraces = (inlinedCss.match(/\{/g) || []).length;
  const closeBraces = (inlinedCss.match(/\}/g) || []).length;
  ok(openBraces > 300 && openBraces === closeBraces, `内联 CSS 花括号配平（${openBraces} 对）`);

  // 内联后的按钮规则必须真的带有视觉样式（而非被丢弃成裸链接）
  const inlinedBtnRule = inlinedCss.slice(inlinedCss.indexOf('.dsh-github-pr-gh-btn {'));
  const inlinedBtnBody = inlinedBtnRule.slice(0, inlinedBtnRule.indexOf('}'));
  ok(inlinedBtnBody.includes('border: 1px solid'), '内联按钮规则含边框（证明未被压缩器破坏）');
  ok(inlinedBtnBody.includes('background:'), '内联按钮规则含背景');
  ok(inlinedBtnBody.includes('padding: 3px 10px'), '内联按钮规则含内边距');
  ok(inlinedBtnBody.includes('margin-left: auto'), '内联按钮规则含 margin-left:auto');

  const css = fs.readFileSync(path.join(__dirname, '../lib/ui/styles.js'), 'utf8');
  ok(css.includes('.dsh-github-pr-splitter'), '样式含分隔条');
  ok(css.includes('.dsh-github-pr-splitter-toggle'), '样式含折叠按钮');
  ok(css.includes('body[data-ds-dark-theme] .dsh-github-pr-splitter'), '分隔条适配暗色主题');
  ok(css.includes('.dsh-github-pr-gh-btn'), '样式含 GitHub 跳转按钮');
  ok(css.includes('.dsh-github-pr-title-row'), '样式含标题行容器');
  ok(!css.includes('.dsh-github-pr-ext-link'), '旧 ext-link 样式已彻底移除（无死代码）');
  // 长标题不挤掉按钮的两个必要条件：标题可收缩 + 按钮不压缩。
  // 注意：构建产物保留原始换行与注释，断言不要假设压缩后的单行形态。
  const titleRule = css.slice(css.indexOf('.dsh-github-pr-title-row .dsh-github-item-title'));
  const titleRuleBody = titleRule.slice(0, titleRule.indexOf('}'));
  ok(titleRuleBody.includes('min-width: 0'), '标题有 min-width:0（否则 ellipsis 失效、按钮被顶出）');

  const btnRule = css.slice(css.indexOf('.dsh-github-pr-gh-btn'));
  const btnRuleBody = btnRule.slice(0, btnRule.indexOf('}'));
  ok(btnRuleBody.includes('flex-shrink: 0'), '按钮 flex-shrink:0（永不压缩）');
  ok(btnRuleBody.includes('white-space: nowrap'), '按钮不换行');

  // ---- 按钮必须钉在标题行最右侧，且严格同行 ----
  ok(btnRuleBody.includes('margin-left: auto'), '按钮 margin-left:auto（强制推到最右，不贴标题屁股）');
  // 标题必须单行：允许换行会让按钮浮到首行右侧、与文字末行错位
  ok(titleRuleBody.includes('white-space: nowrap'), '标题强制单行（否则换行时按钮会跑到上面）');
  ok(titleRuleBody.includes('text-overflow: ellipsis'), '超长标题省略号收尾');
  /*
   * 必须是 flex: 1 1 0% 而非 flex: 1。
   * 简写 flex:1 的隐含 flex-basis 是 auto —— 短标题（如 "#77 Fix bug"）
   * 不会长到撑满，按钮会贴着文字停在中间而不是最右。
   * 实测 320px 容器下旧写法按钮右缘停在 206px，距右缘还差 114px。
   */
  ok(titleRuleBody.includes('flex: 1 1 0%'), '标题用 flex-basis:0 吃满剩余宽度（短标题也能把按钮推到最右）');
  ok(!/flex:\s*1;/.test(titleRuleBody), '不得使用简写 flex:1（basis:auto 会让短标题下按钮停在中途）');

  const titleRowRule = css.slice(css.indexOf('.dsh-github-pr-title-row {'));
  const titleRowBody = titleRowRule.slice(0, titleRowRule.indexOf('}'));
  ok(titleRowBody.includes('display: flex'), '标题行是 flex 容器');
  ok(!titleRowBody.includes('flex-direction: column'), '标题行不是纵向（否则按钮又独占一行）');
  ok(titleRowBody.includes('align-items: center'), '标题行垂直居中，保证「同一行」视觉');
  ok(titleRowBody.includes('width: 100%'), '标题行占满卡片宽度（按钮才能贴到卡片右缘）');

  // ============================================================
  console.log('\n--- 7. 空态文案区分「筛选为空」与「无记录」---');
  // ============================================================
  ok(panelSrc.includes('该账号下暂无任何 Pull Request 记录'), 'PR 有「账号无记录」空态');
  ok(panelSrc.includes('下无结果') && panelSrc.includes('条记录'), 'PR 有「筛选为空」空态并给出总数');
  ok(panelSrc.includes('该账号下暂无任何 Issue 记录'), 'Issue 有「账号无记录」空态');
  ok(!panelSrc.includes('暂无开放中的 PR'), '不再出现「暂无开放中的 PR」这种错误暗示');
  ok(panelSrc.includes("prStateFilter === 'merged'"), 'PR 状态胶囊含 merged');

  console.log('\n========================================');
  console.log(`Phase 29 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
