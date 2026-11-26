// test/phase54-ui-help.test.mjs - Phase 54 · 设置页问号说明（真 React + 真 DOM 渲染与交互）
//
// 为什么必须有这一阶段：本仓 2026-11-26 的白屏事故证明——**tsc 通过、build 成功、
// 静态断言全绿，也挡不住"一点就炸"**。那次是构建器没给 import 别名建绑定，只有真的
// 渲染一次才会抛 ReferenceError。本轮改的是客户端 UI（问号 + 二级说明弹窗），
// 所以必须用真 React 渲一次、再用真事件点一遍。
//
// 覆盖三个真机踩过的坑：
//   ① 自由变量/别名没绑定     → 用 with(Proxy) 接管，未定义即指认变量名
//   ② 悬停浮层撑开滚动区      → 改为二级弹窗，断言它在 fixed 遮罩里、不参与设置页文档流
//   ③ Esc 被窗口级监听器吃掉  → 断言"说明开着时 Esc 只关说明，不关设置页"
//
// 依赖：jsdom + react + react-dom（**不是本项目依赖**）。找不到时显式 SKIP 而不是失败：
// 本仓在 Linux CI 上没有这些包，不该让一条本地 UI 冒烟把 CI 变红；但跳过会打印原因，
// 不静默通过（与 phase34 的 SKIP 白名单同一口径）。

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/**
 * 定位 jsdom / react 的安装位置。
 * 优先环境变量（CI 若真装了这些包，指一个目录即可），其次若干已知位置，最后试裸导入。
 */
const CANDIDATE_MODULE_DIRS = [
  process.env.DSH_UI_TEST_MODULES,
  path.join(ROOT, 'node_modules'),
  'D:/Desktop/AgentWork/uToolsPlugIn/powershell-launcher/node_modules',
].filter(Boolean);

function findModuleDir(pkg) {
  for (const dir of CANDIDATE_MODULE_DIRS) {
    try {
      if (existsSync(path.join(dir, pkg, 'package.json'))) return dir;
    } catch { /* 路径不可读就跳过 */ }
  }
  return null;
}

const jsdomDir = findModuleDir('jsdom');
const reactDir = findModuleDir('react');
const reactDomDir = findModuleDir('react-dom');

if (!jsdomDir || !reactDir || !reactDomDir) {
  console.log('⏭️  SKIP phase54：未找到 jsdom / react / react-dom，跳过真实渲染冒烟。');
  console.log(`   查找过的目录：${CANDIDATE_MODULE_DIRS.join(' ; ')}`);
  console.log('   设置 DSH_UI_TEST_MODULES=<含这三个包的 node_modules> 可启用。');
  console.log('   注意：跳过不代表通过 —— 客户端 UI 改动请在本地跑一次本阶段。');
  process.exit(0);
}

const fileUrl = (dir, p) => pathToFileURL(path.join(dir, p)).href;
const { JSDOM } = await import(fileUrl(jsdomDir, 'jsdom/lib/api.js'));
const React = (await import(fileUrl(reactDir, 'react/index.js'))).default;
const { createRoot } = await import(fileUrl(reactDomDir, 'react-dom/client.js'));
const { flushSync } = await import(fileUrl(reactDomDir, 'react-dom/index.js'));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// Node 24 的 globalThis.navigator 只有 getter，不能直接赋值
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.MutationObserver = dom.window.MutationObserver;
// 用 flushSync 显式刷帧，不走 act()；关掉 act 环境标记，避免无关警告淹没真正的错误
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
globalThis.localStorage = dom.window.localStorage;
globalThis.React = React;

/** 网络一律拒绝（本阶段只验渲染与交互），但记录调用以证明"点问号不会误存档位" */
const fetchCalls = [];
globalThis.fetch = (url, init) => {
  fetchCalls.push({ url: String(url), method: (init && init.method) || 'GET', body: init && init.body });
  return Promise.reject(new Error('phase54: network disabled'));
};
dom.window.fetch = globalThis.fetch;

/**
 * with(Proxy) 接管模块的**自由变量**：未定义的全局立刻以变量名抛错。
 * 这是"漏绑定"类白屏的最小复现手段（typeof 形式会被静默吞掉，所以这里不返回 undefined）。
 */
const scope = new Proxy({ getCacheStorageMeta: () => ({ exists: false, sizeKb: 0, savedAt: 0 }) }, {
  has: () => true,
  get(target, key) {
    if (key === Symbol.unscopables) return undefined;
    if (key in target) return target[key];
    if (key in globalThis) return globalThis[key];
    throw new ReferenceError(`未绑定的自由变量: ${String(key)}`);
  },
});

console.log('\n--- 1. 真实渲染设置弹窗（带未绑定变量检测）---');
const MODAL_LIB = path.join(ROOT, 'lib/ui/sync-settings-modal.js');
const rawSrc = readFileSync(MODAL_LIB, 'utf8').replace(/^export function /m, 'function ');
const factory = new Function('__scope__', `with (__scope__) { ${rawSrc}\n return GlobalSyncSettingsModal; }`);
const GlobalSyncSettingsModal = factory(scope);

let closeCalls = 0;
const props = {
  isOpen: true,
  initialSection: 'audit',
  currentSettings: { strategy: 'swr', localGitWatch: false, cloudSyncIntervalMs: 600000 },
  onClose: () => { closeCalls++; },
};

const root = createRoot(document.getElementById('root'));
let thrown = null;
try {
  flushSync(() => root.render(React.createElement(GlobalSyncSettingsModal, props)));
} catch (error) {
  thrown = error;
}

const text = document.body.textContent || '';
const q = (sel) => Array.from(document.querySelectorAll(sel));
const modalOpen = () => q('.dsh-github-note-dialog').length > 0;
const modalText = () => q('.dsh-github-note-content').map((n) => n.textContent).join(' | ');
const settingsPosts = () => fetchCalls.filter((c) => c.url.includes('/audit/settings') && c.method === 'POST');
const checkedIndex = () => q('input[name="audit-approval-mode"]').findIndex((r) => r.checked);

ok(thrown === null, '渲染未抛错（漏绑定的自由变量会在这里现形）', thrown && (thrown.stack || String(thrown)));
ok(text.includes('执行前人工审核'), '渲染出「执行前人工审核」分区');
ok(text.includes('启用操作记录') && text.includes('保留预算'), '操作记录开关与保留预算都在');
ok(text.includes('6 项') && text.includes('21 项'), '三档的项数与真实作用域一致');
ok(!text.includes('写留言'), '不再出现 v1 的「写留言」承诺');
ok(text.includes('danger-full-access'), '明示了 danger-full-access 预设会让审核失效');
ok(q('input[type=radio]').length === 3, '三档单选齐全', String(q('input[type=radio]').length));

console.log('\n--- 2. 问号与二级说明弹窗（真事件）---');
let ixErr = null;
const initialChecked = checkedIndex();
try {
  var openAtStart = modalOpen();
  var dots = q('.dsh-github-note-dot');

  // 点「21 项」那一档的问号
  flushSync(() => dots[5].click());
  var allWritesOpen = modalOpen();
  var allWritesText = modalText();
  var pillCount = q('.dsh-github-note-pill').length;
  var postsAfterDotClick = settingsPosts().length;
  var checkedAfterDotClick = checkedIndex();

  // 点遮罩：只关说明
  var closeBeforeOverlay = closeCalls;
  flushSync(() => q('.dsh-github-note-overlay')[0].click());
  var closedByOverlay = !modalOpen();
  var settingsSurvivedOverlay = closeCalls === closeBeforeOverlay;

  // 键盘 Enter 打开「仅高危」，再 Esc
  flushSync(() => dots[4].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  var destructiveText = modalText();
  var closeBeforeEsc = closeCalls;
  flushSync(() => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  var closedByEsc = !modalOpen();
  var settingsSurvivedEsc = closeCalls === closeBeforeEsc;

  // 说明已关，再按 Esc 才该关设置页
  flushSync(() => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  var settingsClosedByEsc = closeCalls === closeBeforeEsc + 1;

  // 点内容不关闭；关闭按钮可用
  flushSync(() => dots[3].click());
  var offText = modalText();
  var openedAgain = modalOpen();
  flushSync(() => q('.dsh-github-note-content')[0].click());
  var survivedInnerClick = modalOpen();
  flushSync(() => q('.dsh-github-note-head button')[0].click());
  var closedByButton = !modalOpen();

  // 对照：点卡片本身仍然保存
  flushSync(() => q('.dsh-github-radio-card')[0].click());
  var postsAfterCardClick = settingsPosts();
} catch (error) {
  ixErr = error;
}

ok(ixErr === null, '交互过程未抛错', ixErr && (ixErr.stack || String(ixErr)));
ok(dots.length === 6, '6 个位置各有一个问号（开关 / 预算 / 分区标题 / 三档）', String(dots.length));
ok(dots.every((d) => d.tabIndex === 0 && d.getAttribute('role') === 'button'), '问号可键盘聚焦（role=button + tabIndex=0）');
ok(openAtStart === false, '初始不显示说明弹窗');
ok(allWritesOpen === true, '点问号 → 二级弹窗出现');
ok(allWritesText.includes('21 种') && allWritesText.includes('update_branch') && allWritesText.includes('unpin'),
  '弹窗列出全部 21 项（含 update_branch / unpin）', allWritesText);
ok(pillCount >= 20, '清单项排成药丸，而不是一坨长文本', String(pillCount));
ok(postsAfterDotClick === 0, '点问号不会触发保存', JSON.stringify(postsAfterDotClick));
ok(checkedAfterDotClick === initialChecked, '点问号不会改变选中的档位', `${initialChecked} → ${checkedAfterDotClick}`);
ok(closedByOverlay === true, '点遮罩关闭说明');
ok(settingsSurvivedOverlay === true, '点遮罩**不会**连带关掉设置页');
ok(destructiveText.includes('6 项') && destructiveText.includes('仅 force: true'),
  '键盘 Enter 也能打开说明，且条件项写清楚了', destructiveText);
ok(closedByEsc === true, 'Esc 只关说明');
ok(settingsSurvivedEsc === true, 'Esc **不会**连带关掉设置页（窗口级监听器的分发顺序）',
  `onClose 调用次数 ${closeBeforeEsc} → ${closeCalls}`);
ok(settingsClosedByEsc === true, '说明已关闭时 Esc 才关设置页');
ok(openedAgain === true && survivedInnerClick === true, '点弹窗内容不会关闭它');
ok(closedByButton === true, '关闭按钮能关说明');
ok(offText.includes('confirm: true') && !offText.includes('21 种'), '各档说明文案各不相同（不是复制粘贴）', offText);
ok(postsAfterCardClick.length === 1 && String(postsAfterCardClick[0].body).includes('"off"'),
  '对照：直接点卡片本身仍会保存该档位', JSON.stringify(postsAfterCardClick.map((p) => p.body)));

console.log('\n--- 3. 产物层：说明弹窗的样式与依赖边界 ---');
const stylesSrc = readFileSync(path.join(ROOT, 'src/ui/styles.ts'), 'utf8');
const bundle = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
ok(/\.dsh-github-note-overlay\s*\{[^}]*position:\s*fixed/.test(stylesSrc),
  '说明弹窗是 fixed 遮罩（不参与设置页文档流，撑不开滚动条）');
ok(/\.dsh-github-note-dialog\s*\{[^}]*height:\s*fit-content/.test(stylesSrc),
  '弹窗高度按内容自适应（height: fit-content）');
ok(/\.dsh-github-note-content\s*\{[^}]*min-height:\s*0/.test(stylesSrc),
  '内容区可收缩（column flex 里不加 min-height:0，长内容会溢出外框）');
ok(!/\.dsh-github-note-pop\b/.test(stylesSrc), '旧的悬停浮层样式已彻底移除（不是留着不用）');
ok(bundle.includes('.dsh-github-note-overlay') && bundle.includes('dsh-github-note-pill'),
  '样式真的进了客户端产物（只在源码里等于没生效）');
// 组件用 with(Proxy) 加载，说明它没有在模块顶层依赖任何未声明的全局
ok(!/^var h = React\.createElement;/m.test(rawSrc), '没有模块顶层 var h（会与其他内联模块撞名）');

console.log('\n--- 4. 类名命名空间不得与「使用指南大窗口」冲突 ---');
/*
 * 2026-11-26 第二次截图实证的事故：说明弹窗复用了 `.dsh-github-help-dialog`，
 * 而那是 help-modal.ts（使用指南）的类名，带着 `height: 85vh` —— 结果宽度按新的、
 * 高度吃了旧的，弹窗永远撑满屏幕。两个功能必须各自独占命名空间。
 */
{
  const guideModalSrc = readFileSync(path.join(ROOT, 'src/ui/help-modal.ts'), 'utf8');
  // 说明弹窗用的一组类名（新命名空间）
  const noteClasses = ['dot', 'overlay', 'dialog', 'head', 'content', 'line', 'subhead', 'gap', 'pills', 'pill'];
  // 使用指南用的一组类名：从它自己的源码里取，避免我手抄漏项
  const guideClasses = [...new Set([...guideModalSrc.matchAll(/dsh-github-help-[a-z-]+/g)].map((m) => m[0]))];
  ok(guideClasses.length > 0, '能从 help-modal.ts 里取出「使用指南」实际使用的类名', String(guideClasses.length));

  // 真正的冲突定义：我的那段 CSS 里**不许出现** help- 前缀的类名（一旦出现就是又借了别人的命名空间）。
  // 注意不能反过来"把 note- 映射成 help- 再比"——dialog/head 这类通用词两边天然都有，那不是冲突。
  const marker = '/*\n * 设置页的问号与二级说明弹窗';
  const at = stylesSrc.indexOf(marker);
  ok(at > 0, '能在样式表里定位到说明弹窗的规则段');
  const myBlock = at > 0 ? stylesSrc.slice(at) : '';
  // 扫描前先剥掉注释：注释里为了说明历史会提到旧的 help- 类名，那不算"借命名空间"
  const myBlockNoComments = myBlock.replace(/\/\*[\s\S]*?\*\//g, '');
  const leakedHelpClasses = [...new Set([...myBlockNoComments.matchAll(/\.dsh-github-help-[a-z-]+/g)].map((m) => m[0]))];
  ok(leakedHelpClasses.length === 0,
    '说明弹窗的规则段里没有任何 help- 前缀的类名（完全独立命名空间）', leakedHelpClasses.join(', '));
  ok(/\.dsh-github-note-dot\s*\{/.test(myBlockNoComments) && /\.dsh-github-note-dialog\s*\{/.test(myBlockNoComments),
    '说明弹窗的规则确实在自己的规则段里');
  ok(guideClasses.includes('dsh-github-help-dialog'),
    '使用指南确实占用着 dsh-github-help-dialog（改名不是无的放矢）');

  // 更强的保证：使用指南自己的弹窗规则没被动过（85vh 还在），且说明弹窗不含固定高度
  const guideDialogRule = (stylesSrc.match(/^\.dsh-github-help-dialog\s*\{[^}]*\}/m) || [''])[0];
  ok(guideDialogRule.includes('85vh'), '使用指南弹窗的 85vh 高度没有被说明弹窗改动', guideDialogRule.slice(0, 80));
  // 只禁裸 height:<数字>vh；max-height 是上限，正是我们要的（内容超长才封顶）
  const fixedHeights = [...myBlockNoComments.matchAll(/(^|[;{\s])height:\s*\d+(?:\.\d+)?v[hw]/gm)].map((m) => m[0].trim());
  ok(fixedHeights.length === 0,
    '说明弹窗没有固定高度（只允许 max-height 封顶，高度必须按内容自适应）', fixedHeights.join(', '));

  // 每个说明弹窗类名在样式表里**作为顶层选择器**恰好定义一次
  // （深色变体 body[...] .x 是另一条规则，不计入；这里锚行首，避免把变体误判成重复定义）
  const dupes = noteClasses.filter((c) => (stylesSrc.match(new RegExp('^\\.dsh-github-note-' + c + '\\s*\\{', 'gm')) || []).length !== 1);
  ok(dupes.length === 0, '每个说明弹窗类名作为顶层选择器恰好定义一次', dupes.join(', '));
}

console.log('\n========================================');
if (failed === 0) console.log(`Phase 54 UI Help Result: ${passed}/${passed} assertions PASSED!`);
else {
  console.error(`Phase 54 UI Help Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}