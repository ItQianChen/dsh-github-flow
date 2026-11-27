// test/phase57-settings-audit-usage.test.mjs
//
// Phase 57 · 设置页「操作记录与审核」的用量口径
//
// 为什么必须有这一阶段（2026-11-27 用户截图实证）：
//   设置页显示「当前已用 0.0 MB / 8.0 MB · 26 条」，而同屏的记录窗口写着「共 8 条」。
//   两个数都错在"口径"上，且都**不是**记账算错：
//     ① 26 = JSONL **行数**。一次写操作固定 2 行（intent + result），走过人工审核再多
//        1 行 decision。拿行数当条数 → 做一次操作数字 +3、删光 8 条后还剩 2 条删不掉的
//        孤儿 result 行，用户看到的就是"累加"与"删了也不减"。
//     ② 0.0 MB = 只保留一位小数的 MB。真实用量 10309 B（10.1 KB）。
//
//   这两件事以前**一处断言都没有**：phase56 只测记录弹窗，设置页这一屏零覆盖，
//   于是"弹窗改好了、设置页继续错"能安静地活一个月。
//
// 三组断言：
//   ① 服务端：/settings（GET 与 POST）回传的 records === list().total，且 !== usage.rows
//   ② bundle：字节格式化只有一份实现，设置页不再读 usage.rows
//   ③ 真实渲染（jsdom + 真 React）：10.1 KB / 全部 N 条记录；records 缺失时宁可不显示
//
// ② / ③ 需要 jsdom 与 react（非本项目依赖）：找不到时显式 SKIP 并打印原因（返回码 0），
// 与 phase34 / phase54 / phase56 的 SKIP 白名单同口径。注意：跳过不代表通过。

import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    console.error(`❌ FAIL: ${name}${extra !== undefined ? '  → ' + extra : ''}`);
  }
}

const { AuditStore } = await import(lib('lib/audit.js'));
const { registerAuditRoutes } = await import(lib('lib/api/routes-audit.js'));
const { sendJson, readJsonBody } = await import(lib('lib/api/route-helpers.js'));

const tmpDirs = [];
function tmpDir() {
  const d = mkdtempSync(path.join(os.tmpdir(), 'dsh-s57-'));
  tmpDirs.push(d);
  return d;
}
function cleanupTmp() {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* Windows 上偶发占用，忽略 */ }
  }
}

/* ================================================================ */
console.log('\n--- 1. 服务端：records 与 list().total 同源，不拿行数当条数 ---');
/* ================================================================ */
const REQ_OK = { host: '127.0.0.1:55716', origin: 'http://127.0.0.1:55716', 'content-type': 'application/json' };

function makeReq(opts = {}) {
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method: opts.method || 'POST',
    url: opts.url || '/',
    headers: opts.headers || {},
    resume() {},
    on(ev, fn) { (listeners[ev] || []).push(fn); return req; },
    destroy() {},
    emitData(chunk) { for (const fn of listeners.data) fn(Buffer.from(chunk)); },
    emitEnd() { for (const fn of listeners.end) fn(); },
  };
  return req;
}

function makeHit(routes) {
  return async function hit(urlPath, opts = {}) {
    const route = routes.find((r) => r.path === urlPath);
    if (!route) return { statusCode: 404, body: null };
    const req = makeReq(opts);
    let statusCode = 0;
    let payload = '';
    const res = {
      setHeader() {},
      set statusCode(v) { statusCode = v; },
      get statusCode() { return statusCode; },
      end(s) { payload = s || ''; },
    };
    const p = route.handler(req, res);
    if (opts.body !== undefined) { req.emitData(opts.body); req.emitEnd(); } else req.emitEnd();
    await p;
    let body = null;
    try { body = JSON.parse(payload); } catch { body = null; }
    return { statusCode, body };
  };
}

{
  let clock = 1_700_000_000_000;
  const store = new AuditStore({ dir: tmpDir(), flushDelayMs: 0, now: () => (clock += 1000) });
  const callA = 'call_A|fc_a';
  const callB = 'call_B|fc_b';

  // A：走人工审核（intent + result + decision = 3 行）
  store.recordCall('github_issue', { action: 'create', title: '示例 Issue', repo: 'acme/prod' }, { ok: true }, { callId: callA });
  store.recordDecision(callA, 'rejected', undefined, clock - 2000);
  // B：没有审核（intent + result = 2 行）
  store.recordCall('github_pr', { action: 'merge', pr_number: 7, repo: 'acme/prod' }, { ok: false, error: 'boom' }, { callId: callB });

  const usage0 = store.usage();
  const listed0 = store.list({});
  ok(usage0.rows === 5, '两次写操作落 5 行（其中一次带审核结论）', usage0.rows);
  ok(listed0.total === 2, '折叠后只有 2 条记录', listed0.total);
  ok(usage0.rows !== listed0.total, '行数与条数本来就是两个数（旧口径出错的地方）', `${usage0.rows} vs ${listed0.total}`);

  const routes = [];
  registerAuditRoutes({ bindRoute: (r) => routes.push(r), sendJson, readJsonBody }, store);
  const hit = makeHit(routes);

  let res = await hit('/api/github/audit/settings', { method: 'GET', headers: REQ_OK });
  ok(res.statusCode === 200 && res.body && res.body.ok === true, 'GET /settings 正常返回');
  ok(res.body.data.records === 2, 'GET 回传 records = 折叠后的条数（2）', res.body.data.records);
  ok(res.body.data.usage.rows === 5, 'usage.rows 仍是行数（原语义保留，供健康看板用）', res.body.data.usage.rows);

  res = await hit('/api/github/audit/settings', { headers: REQ_OK, body: JSON.stringify({ budgetMB: 4 }) });
  ok(res.statusCode === 200 && res.body.ok === true, 'POST /settings 保存预算成功');
  ok(res.body.data.records === 2, 'POST 响应里 records 与 GET 同源', res.body.data.records);
  ok(Math.round(res.body.data.usage.maxBytes / 1048576) === 4, '预算改小立即生效（4 MB）', res.body.data.usage.maxBytes);

  // 删 1 条：条数必须 -1，行数 -3（这正是"删了也不减"的反证）
  const removed = await store.delete([callA]);
  ok(removed === 1, '删除接口按记录计（1 条）', removed);
  res = await hit('/api/github/audit/settings', { method: 'GET', headers: REQ_OK });
  ok(res.body.data.records === 1, '删掉 1 条后 records 真的减 1', res.body.data.records);
  ok(res.body.data.usage.rows === 2, '磁盘上只少了 3 行——按行显示会看成"少了 3"，按条才是"少了 1"', res.body.data.usage.rows);

  await store.clear();
  res = await hit('/api/github/audit/settings', { method: 'GET', headers: REQ_OK });
  ok(res.body.data.records === 0 && res.body.data.usage.rows === 0, '清空后条数与行数同时归零', `${res.body.data.records}/${res.body.data.usage.rows}`);

  await store.dispose();
}

/* ================================================================ */
console.log('\n--- 2. bundle：字节格式化只有一份实现，设置页不再读行数 ---');
/* ================================================================ */
{
  const bundle = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
  const defs = (bundle.match(/function formatBytes\(/g) || []).length;
  ok(defs === 1, 'formatBytes 在 bundle 里只有一份定义（两个弹窗共用）', defs);
  ok((bundle.match(/formatBytes\(/g) || []).length >= 5, '两处用量显示都调它（1 定义 + ≥4 调用）');
  ok(!/\bauditMb\s*\(/.test(bundle), '设置页那份 MB-only 实现已删除');
  ok(!/\bmbText\s*\(/.test(bundle), '记录弹窗那份重复实现已删除');
  ok(!/auditUsage\.rows/.test(bundle), '设置页不再把 usage.rows 当条数显示');
  ok(/全部 " \+ auditRecords \+ " 条记录/.test(bundle), '设置页条数文案来自 auditRecords 且标明"全部"');
}

/* ================================================================ */
console.log('\n--- 3. 真实渲染：KB 档 + 条数取 records ---');
/* ================================================================ */
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
  console.log('⏭️  SKIP phase57 第 3 组：未找到 jsdom / react / react-dom，跳过设置页的真实渲染。');
  console.log(`   查找过的目录：${CANDIDATE_MODULE_DIRS.join(' ; ')}`);
  console.log('   设置 DSH_UI_TEST_MODULES=<含这三个包的 node_modules> 可启用。');
  console.log('   注意：跳过不代表通过 —— KB 档与条数口径请在本地跑一次本阶段。');
  cleanupTmp();
  console.log(`\n${failed === 0 ? '🎉' : '❌'} phase57：${passed} 通过 / ${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
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
globalThis.React = React;

const fetchLog = [];
let routes = {};
globalThis.fetch = (url, init) => {
  const u = String(url);
  fetchLog.push({ url: u, method: (init && init.method) || 'GET', body: init && init.body });
  // 最长匹配：`/audit/settings` 与 `/audit/records` 有公共前缀，取第一个命中会错配
  const key = Object.keys(routes)
    .filter((k) => u.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  const payload = key === undefined ? { ok: false, message: 'no route: ' + u } : routes[key];
  const body = typeof payload === 'function' ? payload({ url: u, init }) : payload;
  return Promise.resolve({ status: 200, json: () => Promise.resolve(body) });
};
dom.window.fetch = globalThis.fetch;

const utilsMod = await import(lib('lib/ui/utils.js'));

/** 与 scripts/build.mjs 同款内联：剥 import、剥 export、别名落成显式绑定 */
function inlineModule(src) {
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
  code = code.replace(/\bexport\s+(async\s+)?(function|const|var|let|class)\b/g, '$1$2');
  return { code, aliases };
}

/** 设置页模块依赖的自由变量（内联进 client.js 后由 utils/storage/icons 提供） */
const SETTINGS_GLOBALS = {
  formatBytes: utilsMod.formatBytes,
  renderOctocatBadge: () => null,
  getCacheStorageMeta: () => ({ exists: false, sizeKb: 0, savedAt: 0 }),
  saveLocalSyncSettings: () => {},
  clearStoredGlobalOverview: () => {},
};

const inlined = inlineModule(readFileSync(path.join(ROOT, 'lib/ui/sync-settings-modal.js'), 'utf8'));
const factory = new Function('__scope__', `with (__scope__) { ${inlined.code}\n return GlobalSyncSettingsModal; }`);
const GlobalSyncSettingsModal = factory(new Proxy(SETTINGS_GLOBALS, {
  has: () => true,
  get(target, key) {
    if (key === Symbol.unscopables) return undefined;
    if (key in target) return target[key];
    if (key in globalThis) return globalThis[key];
    throw new ReferenceError(`未绑定的自由变量: ${String(key)}`);
  },
}));

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(React.createElement(GlobalSyncSettingsModal, {
    isOpen: true,
    onClose: () => {},
    currentSettings: {},
    onSave: () => {},
    onClearCache: () => {},
    initialSection: 'audit',
  })));
  return { root, container, unmount: () => { try { root.unmount(); } catch { /* 已卸载 */ } container.remove(); } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 8; i++) await sleep(0); };
const textOf = (el) => (el ? el.textContent || '' : '');

/** 线上真实用量：两个段合计 10309 B / 26 行 / 折叠成 8 条 */
const REAL_USAGE = { enabled: true, active: true, rows: 26, bytes: 10309, maxRows: 1000, maxBytes: 8388608, degraded: null, segments: 2 };

{
  routes = {
    '/api/github/audit/settings': { ok: true, data: { usage: REAL_USAGE, records: 8, approvalMode: 'all-writes', approvalRules: [], rulesParsed: { valid: 0, ignored: [] } } },
  };
  const m = mount();
  await settle();
  const text = textOf(m.container);

  ok(text.includes('操作记录与审核'), '设置页左侧导航含「操作记录与审核」');
  ok(text.includes('10.1 KB'), '用量按 KB 显示（10309 B → 10.1 KB）', text.slice(0, 160));
  ok(!text.includes('0.0 MB'), '不再出现「0.0 MB」这种"占用一直是 0"的显示');
  ok(text.includes('全部 8 条记录'), '条数取 records（8）而不是行数（26），并标明"全部"');
  ok(!text.includes('26 条'), '不再把 26 行当成 26 条');
  m.unmount();
}

{
  // 旧服务端没有 records 字段：宁可不显示条数，也不能退回行数（那是错的数）
  routes = {
    '/api/github/audit/settings': { ok: true, data: { usage: REAL_USAGE, approvalMode: 'destructive', approvalRules: [], rulesParsed: { valid: 0, ignored: [] } } },
  };
  const m = mount();
  await settle();
  const text = textOf(m.container);
  ok(text.includes('10.1 KB'), '缺 records 时用量照常显示');
  ok(!text.includes('条记录'), '缺 records 时不显示条数（宁缺勿错）', text.slice(0, 160));
  ok(!text.includes('26 条'), '缺 records 时也不回退成行数');
  m.unmount();
}

{
  // 保存后必须立刻刷新条数：删完记录回来改设置，最容易看出"没减掉"
  routes = {
    '/api/github/audit/settings': ({ init }) => ((init && init.method === 'POST')
      ? { ok: true, data: { usage: { ...REAL_USAGE, rows: 23 }, records: 7, approvalMode: 'all-writes', approvalRules: [], rulesParsed: { valid: 0, ignored: [] } } }
      : { ok: true, data: { usage: REAL_USAGE, records: 8, approvalMode: 'all-writes', approvalRules: [], rulesParsed: { valid: 0, ignored: [] } } }),
  };
  const m = mount();
  await settle();
  ok(textOf(m.container).includes('全部 8 条记录'), '初始条数 8');

  const checkbox = m.container.querySelector('input[type="checkbox"]');
  ok(checkbox !== null, '找到「启用操作记录」复选框');
  checkbox.click();
  await settle();
  const after = textOf(m.container);
  ok(after.includes('已保存并立即生效'), '保存回执可见');
  ok(after.includes('全部 7 条记录'), '保存后条数立刻跟上服务端（8 → 7）', after.slice(0, 200));
  m.unmount();
}

cleanupTmp();
console.log(`\n${failed === 0 ? '🎉' : '❌'} phase57：${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
