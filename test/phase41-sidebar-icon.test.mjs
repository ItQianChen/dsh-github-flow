// test/phase41-sidebar-icon.test.mjs
//
// 侧栏入口图标契约测试（issue #9 回归网）。
//
// 背景：宿主的 sidebar.panellist 行渲染器会向注册组件注入 { size, active }：
//   renderSlot("sidebar.panellist", { size: wide ? 16 : 18, active }, { only: id })
// 且图标格 .panelGlyph 是 flex:none、不设宽高——宽度完全由内容决定。
//
// 历史缺陷（v0.6.0）：组件忽略 props.size、硬编码 renderOctocat(18)，外层还套了
// 28px 内层盒子，导致
//   ① 图标 18px（同级 16px）；
//   ② 图标格被撑到 28px，整行标签右移 12px；
//   ③ 深色主题选中态多出渐变底 + 发光（宿主行高亮之外的第二层）。
//
// 为什么必须测「构建产物」而不是源码文本：这个 bug 的本质是**行为**（拿到 size 却
// 不传下去），字符串断言只能证明"代码里出现了 props.size"这几个字。这里沿用
// phase11 的手法，从 lib/client.js 抽出函数体、在沙箱里真调一次。

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

const bundle = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');

/** 从构建产物里按大括号配对抽出函数体（与 phase11 同一手法） */
function extractFnJs(name) {
  const start = bundle.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in lib/client.js`);
  const open = bundle.indexOf('{', start);
  let depth = 0;
  for (let j = open; j < bundle.length; j++) {
    if (bundle[j] === '{') depth++;
    if (bundle[j] === '}') {
      depth--;
      if (depth === 0) return bundle.slice(start, j + 1);
    }
  }
  throw new Error(`${name} unbalanced`);
}

// 桩：React.createElement 与 renderOctocat 都只记录形状，不碰 DOM
const createElementStub = (type, props, ...children) => ({ type, props: props || {}, children });
const octocatStub = (size, color) => ({ type: 'svg', props: { width: size, height: size, fill: color } });

const fnSrc = extractFnJs('GithubSidebarIcon');
const makeIcon = new Function(
  'React',
  'renderOctocat',
  `${fnSrc}\nreturn GithubSidebarIcon;`
);
const GithubSidebarIcon = makeIcon({ createElement: createElementStub }, octocatStub);

console.log('\n--- 1. 必须透传宿主注入的 size ---');
{
  const wide = GithubSidebarIcon({ size: 16, active: false });
  ok(wide && wide.type === 'svg', '展开态渲染出 svg 根节点', wide && wide.type);
  ok(wide && wide.props.width === 16, '展开态 size=16 被透传（同级项同尺寸）', String(wide && wide.props.width));
  ok(wide && wide.props.height === 16, '高度同样等于 size（方形图标）', String(wide && wide.props.height));

  const collapsed = GithubSidebarIcon({ size: 18, active: true });
  ok(collapsed && collapsed.props.width === 18, '收起态 size=18 被透传', String(collapsed && collapsed.props.width));
}

console.log('\n--- 2. 不得再包一层固定宽高的盒子 ---');
{
  // 有 wrapper 时返回值会是 div，宽度由 CSS 的 28px 决定 —— 这正是 12px 偏移的成因
  const vnode = GithubSidebarIcon({ size: 16, active: true });
  ok(vnode.type === 'svg', '根节点是 svg，不是 div wrapper', String(vnode.type));
  ok(!Array.isArray(vnode.children) || vnode.children.length === 0, 'svg 直接作为根，无中间层');
}

console.log('\n--- 3. 颜色必须继承（不许自带次级灰/品牌色） ---');
{
  const vnode = GithubSidebarIcon({ size: 16 });
  ok(vnode.props.fill === 'currentColor', 'fill 用 currentColor 继承宿主行颜色', String(vnode.props.fill));
}

console.log('\n--- 4. 宿主未传 size 时的兜底 ---');
{
  const noProps = GithubSidebarIcon();
  ok(noProps && noProps.type === 'svg', 'props 缺失不崩');
  ok(noProps.props.width === 16, '兜底 16px（展开态是默认形态）', String(noProps.props.width));

  const badSize = GithubSidebarIcon({ size: '16' });
  ok(badSize.props.width === 16, 'size 非数字时回落 16，不把字符串塞进 svg', String(badSize.props.width));
}

console.log('\n--- 5. 选中态交给宿主，组件不消费 active ---');
{
  const off = JSON.stringify(GithubSidebarIcon({ size: 16, active: false }));
  const on = JSON.stringify(GithubSidebarIcon({ size: 16, active: true }));
  ok(off === on, 'active 真假不改变输出结构（选中态由宿主 .panelRow.panelActive 负责）');
}

console.log('\n--- 6. 不得再引入自带样式的类名 ---');
{
  ok(!/dsh-github-icon/.test(fnSrc), '组件源码不含 dsh-github-icon 类名');
  ok(!/title\s*:/.test(fnSrc), '组件不再设 title（宿主已提供 aria-label + Tooltip，叠加会双提示）');
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 41 Sidebar Icon Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 41 Sidebar Icon Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
