// test/phase36-host-contract.test.mjs
//
// 宿主契约测试：本插件「交给 DSH 宿主的东西」必须落在宿主真实接受的形状里。
//
// 为什么需要这个文件（s4 计划 §2.6 原本只要 bundle 断言）：
// 计划把「descriptor 形状是猜的，宿主收紧即 18 个工具一起失联」列为最大风险，解法是迁
// `defineTool`。实测推翻了这个前提，且迁移不可安装（见 docs/plans/08-hardening/
// s4-execution-plan.md §2.5 的实测记录），于是把「防形状漂移」这件事交给断言来做：
// 逐条复刻宿主 enforced JSON Schema 子集的规则（@deepseek-ai/dsh-tools
// lib/types/json-schema.d.ts 原文），18 个工具全部过一遍。
//
// 三节：
//   1. 客户端 Bundle 形状 —— window.__ModuleLoader__ 是对宿主 client 契约的适配层
//   2. 插件元数据 —— inject / provide / exports 子路径 / peer 依赖范围
//   3. 工具 descriptor —— name / parameters / output / execute 与 JSON Schema 子集

import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

/**
 * 去掉 JS/TS 源码里的 `//` 与 `/* *\/` 注释，保留字符串字面量内容。
 *
 * 为什么不用正则一把梭：注释里会出现引号和 `//`（如 URL），字符串里也会出现 `//`
 * 和 `/*`。逐字符状态机是唯一能同时照顾两者的做法，代价只有二十行。
 * 只服务于「静态守卫」这类必须区分「代码」与「注释」的断言。
 */
function stripComments(source) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    out += ch;
    i++;
  }
  return out;
}

// ============================================================
console.log('\n--- 1. 客户端 Bundle 形状（宿主 client 契约适配层）---');
// ============================================================
const bundle = readFileSync(path.join(ROOT, 'lib/client.js'), 'utf8');
ok(bundle.includes('window.__ModuleLoader__.load({'), 'loader 入口存在');
ok(/id:\s*"dsh-github-flow"/.test(bundle), 'loader id 固定为 dsh-github-flow');
ok(/exports\.apply = apply/.test(bundle) && /exports\.inject = inject/.test(bundle), 'apply/inject 已导出');
const bundledCount = (bundle.match(/---- \[Bundled: /g) || []).length;
ok(bundle.includes('---- [Bundled: state-badges.js]'), '共享状态徽章模块 state-badges.js 已内联（服务端与 UI 共用同一份映射）');
ok(bundledCount === 19, '19 个 Bundle 子模块已内联（18 UI + 1 shared）', `实际 ${bundledCount}`);
// 子模块被内联进闭包后不得残留 ESM 导出语法，否则整段在浏览器里语法错误
ok(!/^export\s+(const|function|class|default)\s/m.test(bundle), 'Bundle 内无残留 ESM export 语句');

// 侧栏入口的「样式主权」回归（issue #9）：
// 宿主的 .panelGlyph 是 flex:none 且不设宽高，宽度由内容决定；我们一旦给图标套
// 固定宽高的盒子，图标格就会被撑开、整行标签右移（历史值 28px vs 同级 16px = 12px）。
// 这条断言盯的是「别再把侧栏图标的样式主权抢回来」。
const stylesSrc = readFileSync(path.join(ROOT, 'src/ui/styles.ts'), 'utf8');
ok(!/\.dsh-github-icon-inner/.test(stylesSrc), '侧栏图标不再有固定宽高的内层盒子（.dsh-github-icon-inner 已移除）');
ok(!/\.dsh-github-icon\b/.test(stylesSrc), '侧栏图标不再覆盖宿主行样式（.dsh-github-icon 已移除）');
ok(!/\.dsh-github-icon-inner/.test(bundle) && !/\.dsh-github-icon\b/.test(bundle), '构建产物中同样不含这两个类名');

// ============================================================
console.log('\n--- 2. 插件元数据（cordis loader 消费面）---');
// ============================================================
const mainJs = readFileSync(path.join(ROOT, 'lib/main.js'), 'utf8');
const injectMatch = mainJs.match(/export const inject = (\[[^\]]*\]);/);
ok(injectMatch !== null, 'inject 以字面量数组导出（loader 静态可读）');
const injectList = injectMatch ? JSON.parse(injectMatch[1].replace(/'/g, '"')) : [];
// 只允许 tools：webServer/workspaceRegistry 由 dsh-web-app 提供，dsh-tui 与纯 CLI
// profile 只装 dsh-base，硬依赖会让插件在这些 profile 里永久 PENDING。
ok(injectList.length === 1 && injectList[0] === 'tools', 'inject 收敛为唯一硬依赖 tools', JSON.stringify(injectList));
ok(/export const provide = ['"]github['"]/.test(mainJs), 'provide 元数据声明为 github');

// 下面两条是「不许回退」的静态守卫，必须看**去掉注释的代码**：
// main.ts 里恰好有解释这两个坑的注释本身带着 `ctx.github = executor` 和 `'~standard'` 字样，
// 直接对全文正则会命中注释而假红。
const mainCode = stripComments(mainJs);
ok(!/ctx\.github\s*=/.test(mainCode), '不存在 ctx.github 裸赋值兜底');
ok(!/'~standard'/.test(mainCode), 'Config 不再是手写 ~standard 校验器（已迁 Schemastery）');

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
ok(
  Object.keys(pkg.peerDependencies ?? {}).join(',') === '@deepseek-ai/cordis',
  'peerDependencies 只声明宿主 cordis',
  JSON.stringify(pkg.peerDependencies)
);
ok(pkg.exports?.['./host'] === './lib/github-service.js', 'exports 声明 ./host 子路径');
ok(existsSync(path.join(ROOT, 'lib/github-service.js')), './host 指向的产物真实存在');

// ============================================================
console.log('\n--- 3. 工具 descriptor 必须落在宿主 enforced JSON Schema 子集内 ---');
// ============================================================
// 规则来源：@deepseek-ai/dsh-tools lib/types/json-schema.d.ts
// 「Unsupported or misplaced keywords reject rather than being accepted without enforcement.」
const ALLOWED_KEYWORDS = new Set([
  'type', 'oneOf', 'properties', 'required', 'additionalProperties',
  'items', 'enum', 'const', 'description', 'title', 'default', 'examples',
]);
const ALLOWED_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null']);
const RESERVED_TOOL_NAMES = new Set(['run_code']);

/** 递归校验一个 JSON Schema 节点，返回违规清单（空数组 = 合法） */
function schemaViolations(node, at) {
  const out = [];
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return [`${at} 不是对象`];
  }
  for (const key of Object.keys(node)) {
    if (!ALLOWED_KEYWORDS.has(key)) out.push(`${at} 含未支持关键字 "${key}"`);
  }
  if (node.type !== undefined && !ALLOWED_TYPES.has(node.type)) {
    out.push(`${at}.type 非法: ${String(node.type)}`);
  }
  const t = node.type;
  if (node.properties !== undefined) {
    if (t !== 'object') out.push(`${at}.properties 只能出现在 type:object 上`);
    for (const [k, child] of Object.entries(node.properties)) {
      out.push(...schemaViolations(child, `${at}.properties.${k}`));
    }
  }
  if (node.additionalProperties !== undefined && t !== 'object') {
    out.push(`${at}.additionalProperties 只能出现在 type:object 上`);
  }
  if (node.required !== undefined) {
    if (t !== 'object') out.push(`${at}.required 只能出现在 type:object 上`);
    if (!Array.isArray(node.required)) out.push(`${at}.required 必须是数组`);
    else {
      const declared = new Set(Object.keys(node.properties ?? {}));
      for (const name of node.required) {
        if (!declared.has(name)) out.push(`${at}.required 里的 "${name}" 未在 properties 中声明`);
      }
    }
  }
  if (node.items !== undefined) {
    if (t !== 'array') out.push(`${at}.items 只能出现在 type:array 上`);
    else out.push(...schemaViolations(node.items, `${at}.items`));
  }
  if (node.enum !== undefined) {
    if (!Array.isArray(node.enum) || node.enum.length === 0) out.push(`${at}.enum 必须是非空数组`);
    else if (SCALAR_TYPES.has(t)) {
      for (const v of node.enum) {
        if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
          out.push(`${at}.enum 含非标量值`);
        }
      }
    }
  }
  if (node.oneOf !== undefined) {
    if (!Array.isArray(node.oneOf) || node.oneOf.length < 2) out.push(`${at}.oneOf 至少需要 2 个分支`);
    else node.oneOf.forEach((child, i) => out.push(...schemaViolations(child, `${at}.oneOf[${i}]`)));
  }
  return out;
}

const LIB_TOOLS = path.join(ROOT, 'lib/tools');
const mock = { defaultListLimit: 20, async run() { return { ok: true, data: {}, rawOutput: '' }; } };
const descriptors = [];
for (const file of readdirSync(LIB_TOOLS).filter((f) => f.endsWith('.js') && f !== 'image-utils.js').sort()) {
  const mod = await import(`file://${LIB_TOOLS.replace(/\\/g, '/')}/${file}`);
  const factory = Object.entries(mod).find(([k, v]) => k.startsWith('create') && typeof v === 'function')?.[1];
  if (!factory) continue;
  descriptors.push({ file, tool: factory(mock) });
}

ok(descriptors.length === 19, '19 个工具工厂全部可实例化', `实际 ${descriptors.length}`);

const seen = new Set();
for (const { file, tool } of descriptors) {
  const tag = tool?.name ?? file;
  ok(/^github_[a-z][a-z0-9_]*$/.test(tool?.name ?? ''), `${tag} 工具名符合 github_* 命名`, tool?.name);
  ok(!RESERVED_TOOL_NAMES.has(tool?.name), `${tag} 未占用宿主保留名 run_code`);
  ok(!seen.has(tool?.name), `${tag} 工具名唯一`);
  seen.add(tool?.name);
  ok(typeof tool?.description === 'string' && tool.description.length > 10, `${tag} 有模型可读的 description`);
  ok(typeof tool?.execute === 'function', `${tag} 暴露 execute`);
  ok(typeof tool?.output?.render === 'function', `${tag} 暴露 output.render（否则结果无法持久化）`);
  ok(tool?.output?.schema !== undefined, `${tag} 声明 output.schema（宿主据此校验返回值）`);

  const params = tool?.parameters;
  ok(params?.type === 'object' && params?.properties && typeof params.properties === 'object', `${tag} parameters 是 object 根 schema`);
  const violations = [...schemaViolations(params, `${tag}.parameters`), ...schemaViolations(tool?.output?.schema, `${tag}.output.schema`)];
  ok(violations.length === 0, `${tag} 全部 schema 关键字在宿主支持子集内`, violations.slice(0, 3).join(' ; '));
}

// ============================================================
console.log('\n--- 4. 真实 cordis Context 加载冒烟（mock 抓不到的一类缺陷）---');
// ============================================================
// 为什么必须有这一节：cordis 的 Context 是 Proxy，**读未 inject 的服务属性会抛错**
// （`cannot get property "webServer" without inject`，cordis src/reflect.ts:144-169），
// 而不是返回 undefined。普通对象 mock 永远复现不了这一点——它曾经让
// `const webServer = ctx?.webServer || ctx` 这类"安全回退"在 CLI/TUI profile 里
// 把插件从「PENDING」变成「加载失败」，而 2013 条断言全绿。
// 这一节用真 Context 把那条路径钉死。
const { Context } = await import('@deepseek-ai/cordis');
const mainModule = await import(`file://${path.join(ROOT, 'lib/main.js').replace(/\\/g, '/')}`);
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

const registeredTools = [];
const root = new Context();
root.provide('tools', { register: (t) => { registeredTools.push(t.name); return () => {}; } });

// 只给 tools：等价于 dsh-tui / 纯 CLI profile（没有 webServer、没有 commands）
const fiber = root.plugin(mainModule, { checkUpdate: false });
await tick();

ok(fiber.state === 2, '无 webServer/commands 的 profile 里插件为 ACTIVE（0=PENDING 2=ACTIVE 3=FAILED）', `实际 state=${fiber.state}`);
ok(registeredTools.length === 19, '19 个工具全部注册', `实际 ${registeredTools.length}`);
ok(root.get('github') !== undefined, 'ctx.provide("github") 在真实 Context 上生效');
ok(root.get('github')?.constructor?.name === 'GhExecutor', '提供的是 GhExecutor 实例');

// 服务晚到：commands / webServer 在本插件就绪之后才出现
const registeredCommands = [];
root.provide('commands', { register: (c) => registeredCommands.push(c?.name) });
await tick();
ok(registeredCommands.length > 0, 'commands 晚于插件就绪时 /gh 仍被注册（ctx.inject 补触发）', `实际 ${registeredCommands.length} 条`);

const registeredRoutes = [];
const fakeWebServer = {
  exact: new Map(),
  prefixes: new Map(),
  register(route) {
    registeredRoutes.push(route.path);
    return () => {};
  },
};
root.provide('webServer', fakeWebServer);
await tick();
ok(registeredRoutes.length > 0, 'webServer 晚于插件就绪时 HTTP 路由仍被注册', `实际 ${registeredRoutes.length} 条`);
ok(registeredRoutes.includes('/api/github/overview'), '概览路由 /api/github/overview 已挂载');

fiber.dispose?.();

// --- 4.2 registerApiRoutes 自身在「webServer 从未被提供」的 Context 上不得抛错 ---
// 必须用一个**全新的、从未 provide 过 webServer 的根 Context**：cordis 的 Proxy 陷阱只在
// 「服务在整个隔离链上都不存在」时触发；只要某处 provide 过，未 inject 也能读到。
// 真实场景就是 CLI/TUI profile——webServer 根本不存在。
// main.ts 现在用 ctx.inject 等待 webServer，正常路径走不到这里；但 routes.ts 是对内 API，
// 未来任何一处漏传 override 的调用都会踩到这条陷阱，所以单独钉住它的解析顺序。
const { registerApiRoutes } = await import(`file://${path.join(ROOT, 'lib/api/routes.js').replace(/\\/g, '/')}`);
const bareRoot = new Context();
bareRoot.provide('tools', { register: () => () => {} });
const routeProbe = [];
const probeExecutor = { run: async () => ({ ok: true }), checkAuth: async () => ({ installed: true, loggedIn: false }) };
bareRoot.plugin({
  name: 'phase36-route-probe',
  inject: ['tools'],
  apply(c) {
    try {
      registerApiRoutes(c, probeExecutor);
      routeProbe.push('no-throw');
    } catch (err) {
      routeProbe.push('THROW: ' + err.message);
    }
  },
});
await tick();
ok(routeProbe[0] === 'no-throw', 'webServer 从未提供时 registerApiRoutes 优雅返回而非抛错', routeProbe[0]);

// --- 4.3 volatile 热更新的载荷必须带上 maxOutputBytes ---
// GhExecutor.updateConfig 收到 maxOutputChars 就把 maxOutputBytes 重算成 ×4
// （executor.ts:218-222）。载荷里不带显式配置的硬上限，一次热更新就会把它冲掉。
// 这里用真实 loader 路径验：改 volatile 引用 → emit loader/volatile-update → 看 executor。
const volWrite = Symbol.for('cosmokit.volatile.write');

const volRoot = new Context();
volRoot.provide('tools', { register: () => () => {} });
const volFiber = volRoot.plugin(mainModule, { maxOutputChars: 1000, maxOutputBytes: 500, checkUpdate: false });
await tick();
const volExec = volRoot.get('github');
ok(volExec.maxOutputChars === 1000 && volExec.maxOutputBytes === 500, '初始显式配置生效（1000 / 500）');
volFiber.config.maxOutputChars[volWrite]?.(2000);
volRoot.events.emit('loader/volatile-update', [['maxOutputChars']]);
await tick(40);
ok(volExec.maxOutputChars === 2000, '热更新把 maxOutputChars 推到 2000', String(volExec.maxOutputChars));
ok(volExec.maxOutputBytes === 500, '热更新未冲掉显式配置的 maxOutputBytes（应仍为 500）', String(volExec.maxOutputBytes));

// 对照：未显式配置 maxOutputBytes 时，必须继续按 maxOutputChars × 4 联动
const volRoot2 = new Context();
volRoot2.provide('tools', { register: () => () => {} });
const volFiber2 = volRoot2.plugin(mainModule, { maxOutputChars: 1000, checkUpdate: false });
await tick();
const volExec2 = volRoot2.get('github');
volFiber2.config.maxOutputChars[volWrite]?.(2000);
volRoot2.events.emit('loader/volatile-update', [['maxOutputChars']]);
await tick(40);
ok(volExec2.maxOutputBytes === 8000, '未显式配置 maxOutputBytes 时按 ×4 联动（2000 → 8000）', String(volExec2.maxOutputBytes));

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 36 Host Contract Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 36 Host Contract Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
