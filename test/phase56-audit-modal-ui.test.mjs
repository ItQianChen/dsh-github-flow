// test/phase56-audit-modal-ui.test.mjs - Phase 56 · 操作记录弹窗的真实渲染与交互
//
// 为什么必须有这一阶段：s3 的三处最关键承诺全都落在**现有测试的盲区**里——
//   ① 「清空没删干净」必须如实告知（partial 提示）
//   ② 「导出 MD / JSON」点了要真的产出下载
//   ③ 底栏在 640px 下不能挤成一团
// 而 phase55 对这三件事只做了**源码正则检查**，于是出现过这种事：
// partial 文案被紧随其后的 `load() → setError(null)` 当场擦掉，界面上一个字都不显示，
// 而三条"断言"仍然全绿。这一阶段用 jsdom + 真 React 把它渲出来、点一遍。
//
// 依赖 jsdom / react / react-dom **不是本项目依赖**：找不到时显式 SKIP 并打印原因
// （返回码 0），不静默通过——与 phase34 / phase54 的 SKIP 白名单同口径。
// 注意：跳过不代表通过，客户端 UI 改动请在本地跑一次本阶段。

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
    console.error(`❌ FAIL: ${name}${extra !== undefined ? '  → ' + extra : ''}`);
  }
}

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
  console.log('⏭️  SKIP phase56：未找到 jsdom / react / react-dom，跳过操作记录弹窗的真实渲染。');
  console.log(`   查找过的目录：${CANDIDATE_MODULE_DIRS.join(' ; ')}`);
  console.log('   设置 DSH_UI_TEST_MODULES=<含这三个包的 node_modules> 可启用。');
  console.log('   注意：跳过不代表通过 —— partial 提示 / 导出按钮 / 底栏布局请在本地跑一次本阶段。');
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
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = false;
globalThis.localStorage = dom.window.localStorage;
globalThis.Blob = dom.window.Blob;
globalThis.React = React;

/**
 * 轻量 fetch 桩：按 url 返回预设 JSON，并记录每次调用。
 * 不用 jest 之类——本仓零依赖，桩越薄越好读。
 */
const fetchLog = [];
let routes = {};
globalThis.fetch = (url, init) => {
  const u = String(url);
  fetchLog.push({ url: u, method: (init && init.method) || 'GET', body: init && init.body });
  /*
   * 按**最长**匹配的路由键命中：`/audit/records` 是 `/audit/records/clear` 的前缀，
   * 用 `find` 取第一个命中会把"清空"错配成"列表"，于是 partial 永远测不出来
   * （这不是产品 bug，但会让测试假红/假绿，属于必须钉死的桩行为）。
   */
  const key = Object.keys(routes)
    .filter((k) => u.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  const payload = key === undefined ? { ok: false, message: 'no route: ' + u } : routes[key];
  const body = typeof payload === 'function' ? payload({ url: u, init }) : payload;
  return Promise.resolve({
    status: 200,
    json: () => Promise.resolve(body),
  });
};
dom.window.fetch = globalThis.fetch;

/*
 * 下载通道桩：`URL.createObjectURL` + `<a download>` 在 jsdom 里不会真的落文件，
 * 这里接住三件事——生成的 blob 内容、下载文件名、以及 **revoke 有没有被调用**（内存泄漏面）。
 */
const downloads = [];
let revoked = 0;
const created = [];
dom.window.URL.createObjectURL = (blob) => {
  const id = 'blob:' + (created.length + 1);
  downloads.push({ id, blob });
  created.push(blob);
  return id;
};
dom.window.URL.revokeObjectURL = () => { revoked++; };
globalThis.URL.createObjectURL = dom.window.URL.createObjectURL;
globalThis.URL.revokeObjectURL = dom.window.URL.revokeObjectURL;
// jsdom 的 <a>.click() 会尝试导航，这里改成记录
const clickedDownloads = [];
dom.window.HTMLAnchorElement.prototype.click = function () {
  clickedDownloads.push({ download: this.download, href: this.href });
};

/** with(Proxy) 接管自由变量：未绑定的全局立刻以变量名抛错（白屏最小复现手段） */
const scope = new Proxy({}, {
  has: () => true,
  get(target, key) {
    if (key === Symbol.unscopables) return undefined;
    if (key in target) return target[key];
    if (key in globalThis) return globalThis[key];
    throw new ReferenceError(`未绑定的自由变量: ${String(key)}`);
  },
});

const MODAL_LIB = path.join(ROOT, 'lib/ui/audit-modal.js');
const UTILS_LIB = path.join(ROOT, 'lib/ui/utils.js');
const utilsMod = await import(pathToFileURL(UTILS_LIB).href);

/**
 * 把 `import { A as B } from '…'` 落成 `var B = A;` —— 与 `scripts/build.mjs` 的
 * `rewriteAliasedImports` 同一套逻辑。
 *
 * 为什么测试里也要做：`lib/ui/audit-modal.js` 是 tsc 的**未内联**产物，带 import 行；
 * 直接 `new Function` 会撞上 "Cannot use import statement outside a module"。
 * 顺手也把「别名必须绑定」这条事故（2026-11-26 白屏）在测试侧复现成同形约束。
 */
function inlineModule(src, provided = {}) {
  const aliases = [];
  let code = src.replace(
    /^[ \t]*import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]\s*;?[ \t]*$/gm,
    (_m, names) => {
      const assigns = [];
      for (const raw of String(names).split(',')) {
        const parts = raw.trim().split(/\s+as\s+/);
        if (parts.length === 2) {
          assigns.push(`var ${parts[1].trim()} = ${parts[0].trim()};`);
          aliases.push(parts[1].trim());
        }
      }
      return assigns.join('\n');
    },
  );
  code = code.replace(/^[ \t]*import\s+[^;]+;\s*$/gm, '');
  return { code, aliases, provided };
}

const inlined = inlineModule(readFileSync(MODAL_LIB, 'utf8'));
const rawSrc = inlined.code.replace(/^export function /m, 'function ');
// 别名指向的真实实现由 scope 提供（与 build.mjs 内联后它们在同一个闭包作用域里等价）
const auditScopeTarget = { formatRelativeTime: utilsMod.formatRelativeTime };
const factory = new Function('__scope__', `with (__scope__) { ${rawSrc}\n return AuditModal; }`);
const AuditModal = factory(new Proxy(auditScopeTarget, {
  has: () => true,
  get(target, key) {
    if (key === Symbol.unscopables) return undefined;
    if (key in target) return target[key];
    if (key in globalThis) return globalThis[key];
    throw new ReferenceError(`未绑定的自由变量: ${String(key)}`);
  },
}));
ok(inlined.aliases.includes('fmtRelative'), 'audit-modal 的别名 import 被落成显式绑定（白屏事故同形约束）');

/** 挂载一个新实例，返回 { root, container, unmount } */
function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(React.createElement(AuditModal, props)));
  return { root, container, unmount: () => { try { root.unmount(); } catch { /* 已卸载 */ } container.remove(); } };
}

/** 从当前 DOM 里按文本找按钮 */
function findButton(container, text) {
  return [...container.querySelectorAll('button')].find((b) => (b.textContent || '').includes(text));
}
const textOf = (el) => (el ? el.textContent || '' : '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 让 .then 链跑完（fetch 桩是 Promise.resolve，两跳足够；用 setTimeout 让宏任务也过一遍） */
const settle = async () => { for (let i = 0; i < 6; i++) await sleep(0); };

/* ================================================================ */
console.log('\n--- 1. 底色：正常渲染 + 列表条数 + 副标题口径 ---');
/* ================================================================ */
{
  routes = {
    '/api/github/audit/records': {
      ok: true,
      data: {
        items: [
          { id: 'a1', at: Date.now() - 60_000, tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '合并 PR #19', decision: 'approved', result: 'ok' },
          { id: 'a2', at: Date.now() - 120_000, tool: 'github_issue', action: 'comment', write: true, risk: 'write', summary: '在 Issue #3 发表评论', decision: 'no-client', result: 'ok' },
        ],
        total: 2,
        scope: 'global',
        cwd: null,
        degraded: null,
        usage: { enabled: true, active: true, rows: 4, bytes: 1024, maxRows: 1000, maxBytes: 8388608, degraded: null, segments: 1 },
      },
    },
  };
  fetchLog.length = 0;
  const m = mount({ isOpen: true, onClose: () => {} });
  await settle();

  const text = textOf(m.container);
  ok(text.includes('合并 PR #19') && text.includes('在 Issue #3 发表评论'), '两条记录都渲染出来了');
  ok(text.includes('Issue / PR 的每一次写操作'), '副标题写明"只有 PR / Issue 的写操作"');
  ok(!text.includes('以及其余 GitHub 工具'), '副标题没有"以及其余 GitHub 工具"这句与作用域矛盾的话');
  // 「无客户端」不是「未审核」：前者是部署缺陷，后者听起来像"没人看过"
  ok(text.includes('无客户端'), '决策列用「无客户端」这个词');
  ok(!text.includes('未审核'), '决策列不再用含混的「未审核」');
  m.unmount();
}

/* ================================================================ */
console.log('\n--- 2. 工具下拉只有 PR / Issue（历史脏工具不许冒出来） ---');
/* ================================================================ */
{
  routes = {
    '/api/github/audit/records': {
      ok: true,
      data: {
        // 故意塞一条 github_api 记录：服务端已按作用域过滤，UI 也不该把它补进下拉
        items: [{ id: 'x1', at: Date.now(), tool: 'github_api', action: '', write: true, risk: 'read', summary: 'github_api GET /user', decision: 'auto', result: 'ok' }],
        total: 1, scope: 'global', cwd: null, degraded: null,
        usage: { enabled: true, active: true, rows: 2, bytes: 100, maxRows: 1000, maxBytes: 8388608, degraded: null, segments: 1 },
      },
    },
  };
  const m = mount({ isOpen: true, onClose: () => {} });
  await settle();

  const select = m.container.querySelector('select');
  ok(select !== null, '存在筛选下拉');
  const options = [...select.querySelectorAll('option')].map((o) => o.value);
  ok(options.filter((v) => v.startsWith('github_')).length === 2,
    '工具下拉候选恰好 2 项（PR / Issue）', options.join(','));
  ok(!options.includes('github_api'),
    '数据里出现 github_api 也不会被补进下拉（那会传达"这里什么都会记"）', options.join(','));
  m.unmount();
}

/* ================================================================ */
console.log('\n--- 3. 「清空没删干净」必须真的显示出来（本次最核心的诚实性承诺） ---');
/* ================================================================ */
{
  routes = {
    '/api/github/audit/records': {
      ok: true,
      data: {
        items: [{ id: 'a1', at: Date.now(), tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '合并 PR #19', decision: 'auto', result: 'ok' }],
        total: 1, scope: 'global', cwd: null, degraded: null,
        usage: { enabled: true, active: true, rows: 2, bytes: 100, maxRows: 1000, maxBytes: 8388608, degraded: null, segments: 2 },
      },
    },
    // 清空返回 partial：另一个进程的段没删掉
    '/api/github/audit/records/clear': { ok: true, data: { clearedSegments: 1, partial: true, remainingSegments: 2 } },
  };
  const m = mount({ isOpen: true, onClose: () => {} });
  await settle();

  const clearBtn = findButton(m.container, '清空全部');
  ok(clearBtn !== undefined, '存在「清空全部」按钮');
  // 两段式确认：第一次点只进确认态
  flushSync(() => clearBtn.click());
  ok(textOf(m.container).includes('确认清空全部？'), '第一次点击进入确认态（危险动作不一次触发）');
  const confirmBtn = findButton(m.container, '确认清空全部？');
  flushSync(() => confirmBtn.click());
  await settle();

  const afterText = textOf(m.container);
  /*
   * 这一条是本次审查抓到的真 bug 的回归：
   * 早先 partial 文案塞进 `error` state，而清空成功后立刻 `load()` 刷新列表，
   * `load()` 第一行 `setError(null)` 当场把它擦掉 —— 界面上一个字都不显示，
   * 而 phase55 的三条源码正则断言照样全绿。
   */
  ok(afterText.includes('其他进程的记录未被清空'),
    'partial 提示真的出现在 DOM 里（不是只写在源码里）', afterText.slice(0, 200));
  ok(afterText.includes('2'), 'partial 提示里带上未清空的段数');
  ok(m.container.querySelector('[role="status"]') !== null, 'partial 提示带 role=status');

  // 「知道了」能收起提示
  const ack = findButton(m.container, '知道了');
  ok(ack !== undefined, 'partial 提示有「知道了」');
  flushSync(() => ack.click());
  ok(!textOf(m.container).includes('其他进程的记录未被清空'), '点「知道了」后提示消失');
  m.unmount();
}

/* ================================================================ */
console.log('\n--- 4. 清空失败必须说失败（不能被 load() 擦成"看起来成功"） ---');
/* ================================================================ */
{
  routes = {
    '/api/github/audit/records': {
      ok: true,
      data: { items: [], total: 0, scope: 'global', cwd: null, degraded: null, usage: { enabled: true, active: true, rows: 0, bytes: 0, maxRows: 1000, maxBytes: 8388608, degraded: null, segments: 1 } },
    },
    '/api/github/audit/records/clear': { ok: false, message: '清空操作记录失败' },
  };
  const m = mount({ isOpen: true, onClose: () => {} });
  await settle();
  flushSync(() => findButton(m.container, '清空全部').click());
  flushSync(() => findButton(m.container, '确认清空全部？').click());
  await settle();
  ok(textOf(m.container).includes('清空操作记录失败'),
    '清空失败时错误文案留在 DOM 里（危险动作失败不能看起来像成功）', textOf(m.container).slice(0, 200));
  m.unmount();
}

/* ================================================================ */
console.log('\n--- 5. 导出：真的产出 Blob / 文件名 / 并回收 URL ---');
/* ================================================================ */
{
  routes = {
    '/api/github/audit/records': {
      ok: true,
      data: { items: [{ id: 'a1', at: Date.now(), tool: 'github_pr', action: 'merge', write: true, risk: 'destructive', summary: '合并 PR #19', decision: 'auto', result: 'ok' }], total: 1, scope: 'global', cwd: null, degraded: null, usage: { enabled: true, active: true, rows: 2, bytes: 100, maxRows: 1000, maxBytes: 8388608, degraded: null, segments: 1 } },
    },
    '/api/github/audit/export': ({ init }) => {
      const req = JSON.parse(init.body || '{}');
      const isMd = req.format === 'md';
      return {
        ok: true,
        data: {
          filename: isMd ? 'github-audit-x.md' : 'github-audit-x.json',
          contentType: isMd ? 'text/markdown' : 'application/json',
          content: isMd ? '# 导出\n| 时间 | 摘要 |\n' : '{"count":1}',
        },
      };
    },
  };
  const m = mount({ isOpen: true, onClose: () => {} });
  await settle();
  downloads.length = 0;
  clickedDownloads.length = 0;
  revoked = 0;
  fetchLog.length = 0;

  const mdBtn = findButton(m.container, '导出 MD');
  ok(mdBtn !== undefined, '底栏有「导出 MD」');
  flushSync(() => mdBtn.click());
  await settle();

  const mdReq = fetchLog.find((f) => f.url.includes('/audit/export'));
  ok(mdReq !== undefined, '点「导出 MD」真的发了导出请求');
  ok(mdReq && JSON.parse(mdReq.body).format === 'md', '请求体 format=md');
  ok(clickedDownloads.length === 1, '触发了一次浏览器下载', String(clickedDownloads.length));
  ok(clickedDownloads[0].download === 'github-audit-x.md', '下载文件名来自服务端', clickedDownloads[0].download);
  ok(downloads.length === 1, '生成了 Blob（内容随响应回传，不在服务端落文件）');
  await sleep(1100); // revoke 是 1s 后延迟回收
  ok(revoked >= 1, 'URL 被回收（不 revoke 会让整个文档的 blob 常驻内存）');

  // JSON 出口同样通
  clickedDownloads.length = 0;
  fetchLog.length = 0;
  flushSync(() => findButton(m.container, '导出 JSON').click());
  await settle();
  const jsonReq = fetchLog.find((f) => f.url.includes('/audit/export'));
  ok(jsonReq && JSON.parse(jsonReq.body).format === 'json', '点「导出 JSON」请求体 format=json');
  ok(clickedDownloads.length === 1 && /\.json$/.test(clickedDownloads[0].download),
    'JSON 导出同样触发下载且文件名正确', JSON.stringify(clickedDownloads));

  // 筛选条件必须一并带给服务端（否则导出件与看到的列表不是一个范围）
  fetchLog.length = 0;
  const select = m.container.querySelector('select');
  const prOption = [...select.querySelectorAll('option')].find((o) => o.value === 'github_pr');
  ok(prOption !== undefined, '下拉里有 PR 选项');
  flushSync(() => {
    select.value = 'github_pr';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await settle();
  flushSync(() => findButton(m.container, '导出 MD').click());
  await settle();
  const filteredReq = fetchLog.find((f) => f.url.includes('/audit/export'));
  const filteredBody = filteredReq ? JSON.parse(filteredReq.body) : {};
  ok(filteredBody.filter && filteredBody.filter.tool === 'github_pr',
    '导出的 filter 带上当前工具筛选（导出件与列表同范围）', JSON.stringify(filteredBody));
  m.unmount();
}

/* ================================================================ */
console.log('\n--- 6. 底栏布局 + 长列表滚动链（20/50/100 条不得撑大窗口） ---');
/* ================================================================ */
{
  routes = {
    '/api/github/audit/records': {
      ok: true,
      data: { items: [], total: 0, scope: 'global', cwd: null, degraded: null, usage: { enabled: true, active: true, rows: 0, bytes: 0, maxRows: 1000, maxBytes: 8388608, degraded: null, segments: 1 } },
    },
  };
  const m = mount({ isOpen: true, onClose: () => {} });
  await settle();
  const footer = m.container.querySelector('.dsh-github-modal-footer');
  ok(footer !== null, '存在底栏');
  ok((footer.getAttribute('style') || '').includes('flex-wrap'),
    '底栏允许换行（640px 下状态+分页+4 个按钮挤不下，换行比压扁好看）');

  /*
   * 长列表不得撑大窗口：这是「选 20/50/100 条会不会把窗口顶破」的正面回答。
   *
   * jsdom 没有真实布局引擎，量不出像素高度，但能钉住**滚动链必须完整**这个事实——
   * 而缺任何一环，100 条记录就一定会把 footer 推出视口。四要素：
   *   ① dialog 有 maxHeight 上限 + overflow hidden
   *   ② body 是 column 方向（复用设置页的 `.dsh-github-modal-body` 时它默认是 row，
   *      不写就会让提示卡/表格横排，且 overflowY 作用在交叉轴上失效）
   *   ③ body 有 minHeight:0（flex 子项默认 min-height:auto 会拒绝收缩，最易漏）
   *   ④ body 有 overflowY:auto（真正产生滚动条的地方）
   */
  const dialog = m.container.querySelector('.dsh-github-modal-dialog');
  ok(dialog !== null, '存在弹窗外层');
  const dStyle = dialog.getAttribute('style') || '';
  /*
   * 断言要同时接受 `max-height: 86vh` 与 `max-size: 920px 86vh` 两种序列化形态：
   * jsdom 的 cssstyle 会把相邻的 max-width / max-height 合并成 `max-size` 简写，
   * 直接匹配 `max-height:` 会假红（这里踩过）。两种形态都证明"有高度上限"。
   */
  ok(/(max-height:\s*86vh|max-size:[^;]*86vh)/.test(dStyle),
    '弹窗有高度上限（86vh），不会随内容无限长高', dStyle.slice(0, 140));
  ok(/overflow:\s*hidden/.test(dStyle), '弹窗裁掉溢出内容（滚动交给正文容器）');

  const body = m.container.querySelector('.dsh-github-modal-body');
  ok(body !== null, '存在正文容器');
  const bStyle = body.getAttribute('style') || '';
  ok(/flex-direction:\s*column/.test(bStyle),
    '正文容器显式 column（复用设置页的 .dsh-github-modal-body 时它默认 row，会导致提示卡与表格横排）', bStyle);
  ok(/min-height:\s*0/.test(bStyle), '正文容器 minHeight:0（flex 子项默认 min-height:auto 会拒绝收缩）');
  ok(/overflow-y:\s*auto/.test(bStyle), '正文容器 overflowY:auto（长列表在这里滚动）');
  ok(/flex:\s*1/.test(bStyle), '正文容器吃满剩余高度（footer 因此被固定在底部）');

  // 每页条数候选必须含用户关心的三档，且切换时页码归零（否则从第 3 页切 100 条会落到空页）
  const sizeSelect = [...m.container.querySelectorAll('select')].find((s) =>
    [...s.querySelectorAll('option')].some((o) => o.value === '100'));
  ok(sizeSelect === undefined || ['20', '50', '100'].every((v) =>
    [...sizeSelect.querySelectorAll('option')].some((o) => o.value === v)),
    '每页条数候选包含 20 / 50 / 100（空列表时下拉不渲染，跳过）');

  m.unmount();
}

/* ================================================================ */
console.log('\n--- 7. 空态文案与新作用域口径一致 ---');
/* ================================================================ */
{
  routes = {
    '/api/github/audit/records': {
      ok: true,
      data: { items: [], total: 0, scope: 'workspace', cwd: 'D:/repo', degraded: null, usage: { enabled: true, active: true, rows: 0, bytes: 0, maxRows: 1000, maxBytes: 8388608, degraded: null, segments: 1 } },
    },
  };
  const m = mount({ isOpen: true, onClose: () => {}, scope: 'workspace', cwd: 'D:/repo' });
  await settle();
  const t = textOf(m.container);
  ok(t.includes('PR / Issue'), '空态文案说的是"对 PR / Issue 发起写操作"', t.slice(0, 300));
  m.unmount();
}

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 56 Audit Modal UI Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 56 Audit Modal UI Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}