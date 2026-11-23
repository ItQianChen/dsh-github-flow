// test/phase50-system-proxy.test.mjs
//
// 系统代理自动跟随（`src/proxy.ts` 扩展）契约测试。
//
// 为什么独立成阶段：getEffectiveUrl 是插件**全部外联流量**的唯一裁决点——
// gh 子进程环境变量、npm registry 探测、升级链路都从这里取代理。裁决语义一旦漂移
// （比如自动跟随意外覆盖手动配置、系统代理关闭后残留旧地址），表现是
// 「明明没配代理却走了代理」或「开了自动跟随却直连」，用户极难自查。
// 所以这里把解析纯函数、模式互斥语义、持久化、注入 env 四层全部钉死。

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
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

const lib = (p) => `file://${path.join(ROOT, p).replace(/\\/g, '/')}`;
const proxyMod = await import(lib('lib/proxy.js'));
const { parseProxyServer, parseRegQueryValue, detectSystemProxy, ProxyManager } = proxyMod;

console.log('\n--- 1. parseProxyServer：注册表 ProxyServer 的四种实测形态 ---');
ok(parseProxyServer('127.0.0.1:7890') === 'http://127.0.0.1:7890', '单一地址 → 补 http://', parseProxyServer('127.0.0.1:7890'));
ok(parseProxyServer('http=127.0.0.1:7890;https=127.0.0.1:7891;ftp=127.0.0.1:7892') === 'http://127.0.0.1:7891', '分协议写法取 https', parseProxyServer('http=127.0.0.1:7890;https=127.0.0.1:7891'));
ok(parseProxyServer('http=127.0.0.1:7890') === 'http://127.0.0.1:7890', '分协议只有 http 时用它', parseProxyServer('http=127.0.0.1:7890'));
ok(parseProxyServer('socks=127.0.0.1:7891') === 'socks5://127.0.0.1:7891', '仅 socks → socks5://', parseProxyServer('socks=127.0.0.1:7891'));
ok(parseProxyServer('=127.0.0.1:7890') === '', '等号开头无协议段的空段不产出地址', parseProxyServer('=127.0.0.1:7890'));
ok(parseProxyServer('proxy.mycompany.com:8080') === 'http://proxy.mycompany.com:8080', '域名形态同样补 http://', parseProxyServer('proxy.mycompany.com:8080'));
ok(parseProxyServer('http://127.0.0.1:7890') === 'http://127.0.0.1:7890', '已带 scheme 的原样保留', parseProxyServer('http://127.0.0.1:7890'));
ok(parseProxyServer('') === '', '空串 → 空串');
ok(parseProxyServer(null) === '', 'null → 空串');
ok(parseProxyServer('not-a-proxy') === '', '无端口结构 → 空串（PAC URL 等不支持形态不硬造）', parseProxyServer('not-a-proxy'));

console.log('\n--- 2. parseRegQueryValue：reg query 输出解析 ---');
const regSample = [
  '',
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
  '    ProxyEnable    REG_DWORD    0x1',
  '',
].join('\r\n');
ok(parseRegQueryValue(regSample) === '0x1', '提取 REG_DWORD 值', JSON.stringify(parseRegQueryValue(regSample)));
const regSz = [
  'HKEY_CURRENT_USER\\...\\Internet Settings',
  '    ProxyServer    REG_SZ    127.0.0.1:7890',
  '',
].join('\r\n');
ok(parseRegQueryValue(regSz) === '127.0.0.1:7890', '提取 REG_SZ 值', JSON.stringify(parseRegQueryValue(regSz)));
ok(parseRegQueryValue('') === '', '空输出 → 空串');
ok(parseRegQueryValue('garbage line without value') === '', '无值行 → 空串');

console.log('\n--- 3. detectSystemProxy：mock 注册表读取器 ---');
function readerOf(enable, server) {
  return async (key, value) => {
    if (value === 'ProxyEnable') return enable;
    if (value === 'ProxyServer') return server;
    return '';
  };
}
const on = await detectSystemProxy(readerOf(
  'HKEY...\r\n    ProxyEnable    REG_DWORD    0x1\r\n',
  'HKEY...\r\n    ProxyServer    REG_SZ    127.0.0.1:7890\r\n'
));
ok(on && on.enabled === true && on.url === 'http://127.0.0.1:7890', '系统代理开 → enabled + 规范化地址', JSON.stringify(on));
const off = await detectSystemProxy(readerOf(
  'HKEY...\r\n    ProxyEnable    REG_DWORD    0x0\r\n',
  'HKEY...\r\n    ProxyServer    REG_SZ    127.0.0.1:7890\r\n'
));
ok(off && off.enabled === false && off.url === '', 'ProxyEnable=0 → enabled=false', JSON.stringify(off));
const noServer = await detectSystemProxy(readerOf(
  'HKEY...\r\n    ProxyEnable    REG_DWORD    0x1\r\n',
  'ERROR: The system was unable to find the specified registry key or value.'
));
ok(noServer && noServer.enabled === false, 'ProxyServer 值不存在（reg 报错）→ 视为关闭不炸', JSON.stringify(noServer));
const boom = await detectSystemProxy(async () => { throw new Error('reg gone'); });
ok(boom === null, 'reader 抛错 → null（检测失败不是事故）', JSON.stringify(boom));

console.log('\n--- 4. ProxyManager：两种模式互斥裁决 ---');
// 铁律：测试绝不写用户真实配置。
// 2026-11-23 事故复盘：本测试原先把占位代理 http://manual2.example:8888 写进
// 真实 ~/.dsh/data/dsh-github-flow/proxy.json，而还原逻辑误用了 ESM 里不存在的
// require()，异常被空 catch 吞掉 → 占位地址长期残留，重启后插件把宿主进程的
// 全局 undici dispatcher 指向死地址，整个 DSH 的外联全部瘫痪。
// 现在改用 storePath 注入 + 临时目录，测试与用户配置物理隔离。
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-proxy50-'));
const storePath = path.join(tmpDir, 'proxy.json');

try {
  const sysReader = readerOf(
    'HKEY...\r\n    ProxyEnable    REG_DWORD    0x1\r\n',
    'HKEY...\r\n    ProxyServer    REG_SZ    127.0.0.1:7890\r\n'
  );

  // 4a. 自动跟随开：系统代理开 → 用系统地址，手动 url 被无视（互斥语义的核心）
  const m1 = new ProxyManager('http://127.0.0.1:9999', sysReader, storePath);
  await m1.refreshSystemProxy();
  m1.save({ url: '', autoFollowSystem: true });
  ok(m1.getEffectiveUrl() === 'http://127.0.0.1:7890', '自动跟随开 + 系统开 → 系统地址（无视手动 url）', m1.getEffectiveUrl());
  ok((m1.getEnv('gh').HTTPS_PROXY || '') === 'http://127.0.0.1:7890', 'gh env 注入系统地址', JSON.stringify(m1.getEnv('gh')));
  ok((m1.getEnv('package-manager').HTTPS_PROXY || '') === 'http://127.0.0.1:7890', 'npm 链路同样注入');

  // 4b. 系统代理关（同 reader 换 enable=0）：自动跟随开 → 直连，无残留
  const sysReaderOff = readerOf(
    'HKEY...\r\n    ProxyEnable    REG_DWORD    0x0\r\n',
    'HKEY...\r\n    ProxyServer    REG_SZ    127.0.0.1:7890\r\n'
  );
  const m2 = new ProxyManager('', sysReaderOff, storePath);
  await m2.refreshSystemProxy();
  m2.save({ url: '', autoFollowSystem: true });
  ok(m2.getEffectiveUrl() === '', '自动跟随开 + 系统关 → 直连（空 env）', JSON.stringify(m2.getEffectiveUrl()));
  ok(Object.keys(m2.getEnv('gh')).length === 0, '系统关 → env 零干预');

  // 4d. 持久化往返：save 后新实例读回 autoFollowSystem
  //     （必须在 4c 之前：三个实例共享同一份持久化文件，最后一次 save 的状态才是读回的状态）
  const roundtrip = new ProxyManager('', sysReader, storePath);
  ok(roundtrip.snapshot().config.autoFollowSystem === true, '持久化读回 autoFollowSystem=true', JSON.stringify(roundtrip.snapshot().config));

  // 4c. 自动跟随关：纯手动模式（原有语义不变）
  const m3 = new ProxyManager('http://127.0.0.1:9999', sysReader, storePath);
  await m3.refreshSystemProxy();
  m3.save({ url: 'http://127.0.0.1:8888', autoFollowSystem: false });
  ok(m3.getEffectiveUrl() === 'http://127.0.0.1:8888', '自动跟随关 → 手动 url 生效', m3.getEffectiveUrl());
  ok((m3.getEnv('gh').HTTPS_PROXY || '') === 'http://127.0.0.1:8888', '手动模式 env 注入手动地址');

  // 4e. snapshot 暴露 systemProxy + effectiveUrl（UI 展示数据源）
  const snap = m1.snapshot();
  ok(snap.systemProxy && snap.systemProxy.enabled === true && snap.systemProxy.url === 'http://127.0.0.1:7890', 'snapshot 带 systemProxy', JSON.stringify(snap.systemProxy));
  ok(snap.effectiveUrl === 'http://127.0.0.1:7890', 'snapshot 带 effectiveUrl', snap.effectiveUrl);

  // 4f. NO_PROXY 强制包含 localhost（防回环劫持的既有不变量在自动跟随下同样成立）
  ok((m1.getEnv('gh').NO_PROXY || '').includes('127.0.0.1'), 'NO_PROXY 恒含 127.0.0.1', m1.getEnv('gh').NO_PROXY);

  // 4i. 总开关必须独立持久化（2026-11-23 用户反馈的 bug：改完保存，重开设置页配置消失）
  //
  // 复现路径：开总开关 → 开跟随系统（此时 url 为空）→ 保存 → 重开弹窗。
  // 旧实现用「url 是否非空」反推总开关，url 为空让总开关读成 false，整个子区域不渲染，
  // 用户看到的就是「保存了但什么都没生效」。
  const m4 = new ProxyManager('', sysReader, storePath);
  m4.save({ enabled: true, url: '', autoFollowSystem: true });
  const reload = new ProxyManager('', sysReader, storePath);
  // 构造器里的首次系统代理检测是异步的（reg 子进程），必须等它落地再断言生效地址
  await reload.refreshSystemProxy();
  ok(reload.snapshot().config.enabled === true, '跟随系统且 url 为空 → 总开关读回仍为 true（不再靠 url 反推）', JSON.stringify(reload.snapshot().config));
  ok(reload.snapshot().config.autoFollowSystem === true, '跟随开关同样读回');
  ok(reload.getEffectiveUrl() === 'http://127.0.0.1:7890', '重载后系统代理仍然生效');

  // 4j. 总开关关闭 = 显式要求直连，优先于任何残留配置
  const m5 = new ProxyManager('', sysReader, storePath);
  m5.save({ enabled: false, url: 'http://127.0.0.1:8888', autoFollowSystem: false });
  ok(m5.getEffectiveUrl() === '', '总开关关闭 → 直连（即使保留着 url）', JSON.stringify(m5.getEffectiveUrl()));
  ok(Object.keys(m5.getEnv('gh')).length === 0, '总开关关闭 → env 零干预');

  // 4k. 老配置向后兼容：没有 enabled 字段时按「有 url 即启用」推断
  const legacyPath = path.join(tmpDir, 'legacy.json');
  writeFileSync(legacyPath, JSON.stringify({
    config: { url: 'http://127.0.0.1:7777', noProxy: 'localhost,127.0.0.1', applyToPackageManager: true },
  }), 'utf8');
  const legacy = new ProxyManager('', sysReader, legacyPath);
  ok(legacy.snapshot().config.enabled === true, '老配置（无 enabled 字段、有 url）推断为启用', JSON.stringify(legacy.snapshot().config));
  ok(legacy.getEffectiveUrl() === 'http://127.0.0.1:7777', '老配置仍按原地址生效');
} finally {
  // 只清临时目录：真实配置全程未被触碰（storePath 注入把读写都导向 tmpDir）
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

console.log('\n--- 4g. 保留域名防护（2026-11-23 事故的直接触发点）---');
{
  // 事故复盘：http://manual2.example:8888 这种占位符能通过纯格式校验并落盘，
  // 重启后把宿主进程全局 dispatcher 指向死地址。这里钉死"保留域名一律拒绝"。
  const v = proxyMod.validateProxyUrl;
  const bad1 = v('http://manual2.example:8888');
  ok(bad1.ok === false && /保留测试域名/.test(bad1.error || ''), '.example 占位符被拒绝保存', JSON.stringify(bad1));
  ok(v('http://foo.invalid:8080').ok === false, '.invalid 被拒绝');
  ok(v('http://foo.test:8080').ok === false, '.test 被拒绝');
  ok(v('http://example.com:8080').ok === false, 'example.com 被拒绝');
  ok(v('http://127.0.0.1:7890').ok === true, '真实回环地址照常放行');
  ok(v('http://192.168.1.10:8080').ok === true, '内网地址照常放行');
  ok(proxyMod.isReservedHostname('manual2.example') === true, 'isReservedHostname 命中 .example');
  ok(proxyMod.isReservedHostname('proxy.mycorp.com') === false, 'isReservedHostname 不误伤正常域名');
}

console.log('\n--- 4h. 全局 dispatcher 不复存在的静态契约（架构级防护）---');
{
  const proxySrc = readFileSync(path.join(ROOT, 'src/proxy.ts'), 'utf8');
  const updaterSrc = readFileSync(path.join(ROOT, 'src/updater.ts'), 'utf8');
  // 只检查代码行：注释里保留事故复盘的历史表述是有价值的，不该被这条断言误伤
  const codeOnly = (src) => src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
  ok(!codeOnly(proxySrc).includes('setGlobalDispatcher'), 'proxy.ts 代码中不再调用 setGlobalDispatcher（禁止进程级劫持）');
  ok(!codeOnly(proxySrc).includes('getGlobalDispatcher'), 'proxy.ts 代码中不再快照全局 dispatcher');
  ok(proxySrc.includes('getDispatcher()'), 'proxy.ts 改为暴露局部 dispatcher');
  ok(updaterSrc.includes('init.dispatcher = dispatcher'), 'updater 的 fetch 显式携带 dispatcher（作用域限定自身）');

  // lib 产物同样不得残留全局劫持
  const proxyLib = readFileSync(path.join(ROOT, 'lib/proxy.js'), 'utf8');
  ok(!codeOnly(proxyLib).includes('setGlobalDispatcher'), 'lib/proxy.js 产物中亦无 setGlobalDispatcher');
}

console.log('\n--- 5. UI 与路由接线（源码级契约）---');
{
  const modalSrc = readFileSync(path.join(ROOT, 'src/ui/sync-settings-modal.ts'), 'utf8');
  ok(modalSrc.includes('autoFollowSystem'), '设置弹窗提交 autoFollowSystem');
  ok(modalSrc.includes('跟随系统代理'), '设置弹窗渲染跟随系统代理开关');
  // 2026-11-23 交互改版：checkbox 平铺 → 层级式滑块开关（总开关 → 跟随系统 → 手动表单逐级出现）
  ok(modalSrc.includes('dsh-toggle-row') && modalSrc.includes('dsh-toggle-track'), '开关使用滑块样式（iOS 风格 toggle）');
  ok(/proxyEnabled \? h\("div", \{ className: "dsh-toggle-sub"/.test(modalSrc), '跟随系统代理仅在总开关开启时渲染（层级显示）', '缺少 dsh-toggle-sub 条件渲染');
  ok(modalSrc.includes('proxyAutoFollow\n') || /proxyAutoFollow\s*\?\s*h\(/.test(modalSrc) || modalSrc.includes('proxyAutoFollow\n                ? h(') || /proxyAutoFollow\s*\n?\s*\?/.test(modalSrc), '跟随开启显示状态卡、关闭显示手动表单（三级内容切换）');
  ok(modalSrc.includes('各项设置会记住，下次开启时恢复'), '总开关描述明示状态记忆语义');

  // 2026-11-23 交互改版二：开关即时生效，保存按钮只服务手动地址
  ok((modalSrc.match(/persistProxy\(\{[^}]*\}, true\)/g) || []).length === 3, '三个开关 onChange 均走 persistProxy(..., true) 即时保存', String((modalSrc.match(/persistProxy\(\{[^}]*\}, true\)/g) || []).length));
  ok(modalSrc.includes('dsh-proxy-level1'), '「测试连通性」与总开关同级（同一行容器）');
  ok(modalSrc.includes('保存地址配置'), '手动表单的保存按钮文案改为「保存地址配置」（只服务地址）');
  ok(modalSrc.includes('proxyAutoTip'), '开关即时保存后有轻量回执');
  ok(modalSrc.includes('savedProxyUrl') && modalSrc.includes('silent ? savedProxyUrl : proxyUrl.trim()'), '静默保存只带已保存值，不顺手提交未保存的输入框内容');
  ok(modalSrc.includes('proxySaveSeqRef'), '保存请求有序号守卫，快速连点不会被旧响应覆盖');
  const routeSrc = readFileSync(path.join(ROOT, 'src/api/routes-proxy.ts'), 'utf8');
  ok(routeSrc.includes('proxyManager.save(body'), '保存路由透传请求体（autoFollowSystem 经由 body 到达）');
  const proxySrc = readFileSync(path.join(ROOT, 'src/proxy.ts'), 'utf8');
  ok(proxySrc.includes('startSystemProxyWatch'), 'ProxyManager 具备系统代理轮询');
  ok(/30_000/.test(proxySrc), '轮询间隔 30 秒');
}

console.log(`\n========================================`);
console.log(`Phase 50 System Proxy Result: ${passed + failed === 0 ? 'NO ASSERTIONS' : failed === 0 ? passed + '/' + (passed + failed) + ' assertions PASSED!' : failed + ' FAILED, ' + passed + ' passed'}`);
console.log(`========================================`);
if (failed > 0) process.exit(1);
