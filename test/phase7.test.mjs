// test/phase7.test.mjs - Issue #2 唤起终端修复验证：命令构造/探测链/失败回传/前端如实展示
import { readFileSync } from 'node:fs';

let pass = 0, total = 0;
const fails = [];
function assert(c, n) { total++; if (c) pass++; else { fails.push(n); console.error('❌ ' + n); } }

// ---- 1. buildTerminalCommand 平台命令构造 ----
console.log('\n--- 1. terminal command construction ---');
const actions = await import('../lib/api/routes-actions.js');
{
  assert(typeof actions.buildTerminalCommand === 'function', 'buildTerminalCommand 已导出');

  if (process.platform === 'win32') {
    const built = actions.buildTerminalCommand('gh auth login');
    assert(built.bin === 'cmd.exe', `Windows 用 cmd.exe（实际: ${built.bin}）`);
    const i = built.args.indexOf('powershell.exe');
    assert(i > 0 && built.args[i - 1] === 'DSH GitHub', 'start 的标题占位在 powershell.exe 之前（防标题吞噬）');
    assert(built.args.includes('-NoExit') && built.args[built.args.length - 1] === 'gh auth login', '-NoExit + 命令在末位');
    assert(!built.args.slice(0, 3).includes('powershell'), 'powershell 不再作为 start 第一个参数');
    // -NoProfile：Windows 自带 5.1 默认策略 Restricted 下加载用户 profile 必报红
    // （conda init 场景实测）；白名单命令不依赖 profile，跨 5.1/7 语义一致
    const np = built.args.indexOf('-NoProfile');
    const nc = built.args.indexOf('-Command');
    assert(np > 0, '含 -NoProfile（5.1 Restricted 基线兼容）');
    assert(nc > np, '-NoProfile 位于 -Command 之前');
  } else if (process.platform === 'darwin') {
    const built = actions.buildTerminalCommand('gh auth login');
    assert(built.bin === 'osascript' && built.args[0] === '-e', 'macOS osascript 形态');
    assert(built.args[1].includes('do script "gh auth login"'), '命令正确嵌入 AppleScript');
    // 引号转义
    const escaped = actions.buildTerminalCommand('echo "hi"');
    assert(escaped.args[1].includes('\\"hi\\"'), '命令内双引号被转义');
  } else if (process.platform === 'linux') {
    // 本机是 Linux 的情况（CI 环境）：探测链应返回真实存在的终端或 null
    const built = actions.buildTerminalCommand('gh auth login');
    if (built) {
      assert(['gnome-terminal', 'konsole', 'xfce4-terminal', 'x-terminal-emulator', 'xterm'].includes(built.bin), `探测到合法终端: ${built.bin}`);
      assert(built.args.includes('sh') && built.args[built.args.length - 1].includes('exec sh'), 'sh -c + exec sh 防窗口闪退');
    } else {
      assert(true, '无可用终端时返回 null（走失败分支而非硬编码）');
    }
  }
}

// ---- 2. Linux 探测链逻辑（源码级：候选清单与缓存） ----
console.log('\n--- 2. linux detection chain ---');
{
  const src = readFileSync('src/api/routes-actions.ts', 'utf8');
  const candidatesMatch = src.match(/\[(['"]gnome-terminal['"].*?)\]/s);
  assert(candidatesMatch && candidatesMatch[1].includes('gnome-terminal') && candidatesMatch[1].includes('konsole') && candidatesMatch[1].includes('xterm'), 'Linux 候选链覆盖主流桌面（gnome/kde/xfce/debian/xterm）');
  assert(src.includes('cachedLinuxTerminal'), '探测结果进程级缓存');
  assert(typeof actions.resetLinuxTerminalCache === 'function', '测试辅助 reset 导出');
  // 参数形态差异
  assert(src.includes("'--', ...shArgs"), 'gnome-terminal 用 -- 形态');
  assert(src.includes("'-e', ...shArgs"), 'konsole/xterm 用 -e 形态');
  assert(src.includes("'-x', ...shArgs"), 'xfce4-terminal 用 -x 形态');
}

// ---- 3. 失败回传语义（源码级：不再先斩后奏） ----
console.log('\n--- 3. honest failure reporting ---');
{
  const src = readFileSync('src/api/routes-actions.ts', 'utf8');
  assert(src.includes('launchTerminalAndWait') && src.includes('await launchTerminalAndWait'), 'open_terminal 等待真实结果再回传');
  assert(src.includes('唤起终端失败：'), '失败响应含原因文案');
  assert(src.includes('请手动打开系统终端执行'), '失败响应含手动出路');
  // 旧的 fire-and-forget + 假成功模式必须消失
  const openTermSection = src.slice(src.indexOf("case 'open_terminal'"), src.indexOf("default:", src.indexOf("case 'open_terminal'")));
  assert(!openTermSection.includes("sendJson(res, 200, { ok: true, message: '已请求唤起系统终端' })"), '旧的「已请求唤起」假成功文案已移除');
  assert(!/execFile\(bin, args, \(err/.test(openTermSection), '旧的吞错 fire-and-forget 已移除');
}

// ---- 4. 路由端到端：HTTP 语义（mock webServer） ----
console.log('\n--- 4. route e2e (mock) ---');
{
  const registered = {};
  const fakeCtx = {
    webServer: { exact: new Map(), prefixes: new Map(), register: (r) => { registered[r.path] = r.handler; return () => {}; } },
    effect: (fn) => { const d = fn(); return () => {}; },
  };
  const { registerApiRoutes } = await import('../lib/api/routes.js');
  const { TtlCache } = await import('../lib/cache.js');
  const mockExec = { run: async () => ({ ok: true }), checkAuth: async () => ({ installed: true, loggedIn: false }) };
  registerApiRoutes(fakeCtx, mockExec, undefined, 15000);

  const handler = registered['/api/github/action'];
  assert(typeof handler === 'function', 'action 路由已注册');

  // 4.1 白名单外的命令 → 500 + 明确拒绝
  {
    let status = 0, body = '';
    const res = { setHeader() {}, end(d) { body = d; }, get statusCode() { return status; }, set statusCode(v) { status = v; } };
    const req = { method: 'POST', headers: { 'content-type': 'application/json' }, on(ev, cb) { if (ev === 'data') cb('{}'); if (ev === 'end') cb(); } };
    // 覆写 body 内容：用闭包注入 payload
    let payload = JSON.stringify({ action: 'open_terminal', command: 'rm -rf /' });
    const req2 = { method: 'POST', headers: { 'content-type': 'application/json' }, on(ev, cb) { if (ev === 'data') cb(payload); if (ev === 'end') cb(); } };
    await handler(req2, res);
    const json = JSON.parse(body);
    assert(status === 500 && json.ok === false && /不支持唤起/.test(json.error || json.message || ''), '非白名单命令被拒绝');
  }

  // 4.2 合法命令（Windows 本机真实唤起会弹窗——stdio ignore 后 cmd start 亚秒返回，
  //     close 事件异步到达，需轮询等待响应而非同步断言）
  {
    let status = 0, body = '';
    const res = { setHeader() {}, end(d) { body = d; }, get statusCode() { return status; }, set statusCode(v) { status = v; } };
    const payload = JSON.stringify({ action: 'open_terminal', command: 'gh auth login' });
    const req2 = { method: 'POST', headers: { 'content-type': 'application/json' }, on(ev, cb) { if (ev === 'data') cb(payload); if (ev === 'end') cb(); } };
    await handler(req2, res);
    // 响应经 spawn close 异步到达：最多等 12s（后端兜底 10s + 余量）
    for (let i = 0; i < 120 && !body; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(body, 'open_terminal 响应最终到达（不悬挂）');
    const json = JSON.parse(body);
    // 真实环境：ok:true（终端已弹出）或 ok:false+原因（如沙箱 EPERM）——两者都是「如实」，不能是恒真
    if (json.ok === true) {
      assert(json.message === '已唤起系统终端', '成功响应语义正确');
    } else {
      // 失败如实回传：沙箱 spawn EPERM 走的是 catch 分支（error 字段），真实终端缺失走 message 分支——两者都算「如实」
      const msg = json.message || json.error || '';
      assert(status === 500 && (msg.includes('唤起终端失败') || msg.includes('EPERM') || msg.includes('失败')), `失败如实回传（沙箱环境预期）: ${msg.slice(0, 60)}`);
    }
  }
}

// ---- 5. 前端如实展示锚点 ----
console.log('\n--- 5. frontend honest display ---');
{
  const cj = readFileSync('lib/client.js', 'utf8');
  assert(cj.includes('若未弹出，可手动打开终端执行上方命令'), '成功 toast 留余地');
  assert(cj.includes('"❌ " +'), '失败 toast 带 ❌ 前缀如实展示');
}

// ---- 6. 检查更新与 gh 链路并行化（不得被业务数据门控）----
console.log('\n--- 6. update check parallelization ---');
{
  const cs = readFileSync('lib/client.js', 'utf8');
  // 原缺陷：useEffect(..., [data]) + if (!data) return 导致 check-update 串行等待
  // gh 概览（5~19s），且 gh 冷启动失败时 data 恒空、横幅永不出。修复后挂载/开窗即触发。
  // 触发点三处：右侧栏 + 全景主页（并行化）+ 设置弹窗「关于」分区版本号（开窗即取，同语义）。
  const gates = cs.split('fetch("/api/github/check-update")').length - 1;
  assert(gates === 3, `check-update 恰好三处触发点（实际: ${gates}）`);
  const gatedPatterns = [
    /if \(!data\) return;\s*\n\s*var timer = setTimeout\(function \(\) \{\s*\n\s*fetch\("\/api\/github\/check-update"\)/,
  ];
  for (const re of gatedPatterns) {
    assert(!re.test(cs), `不再存在 data 门控的 check-update: ${re.source.slice(0, 50)}`);
  }
  // 空依赖挂载（[], 300ms 微延迟）形态应出现两次：fetch 后 ~275 字符处收尾 "}, 300);"（放宽至 350 容错）
  const parallelCount = (cs.match(/fetch\("\/api\/github\/check-update"\)[\s\S]{0,350}?\}, 300\);/g) || []).length;
  assert(parallelCount === 2, `两处 check-update 均为挂载即触发（实际: ${parallelCount}）`);
  const mountDepCount = (cs.match(/\}, 300\);[\s\S]{0,80}?\}, \[\]\);/g) || []).length;
  assert(mountDepCount === 2, `两处 effect 依赖均为空数组 []（实际: ${mountDepCount}）`);
}

// ---- 7. 更新设置分区 UI 锚点 ----
console.log('\n--- 7. update settings section ---');
{
  const cs = readFileSync('lib/client.js', 'utf8');
  // 三分区导航
  assert(cs.includes('"⬆️ 更新设置"'), '设置弹窗含「⬆️ 更新设置」导航项');
  // 三选项 radio
  assert(cs.includes('"🌍 npm 官方源 (推荐)"'), '官方源选项存在');
  assert(cs.includes('"🇨🇳 国内镜像 (npmmirror)"'), '镜像源选项存在');
  assert(cs.includes('"⛔ 不检查更新"'), '不检查更新选项存在');
  // 源区别提示（关键差异点：镜像同步延迟）
  assert(cs.includes('同步存在分钟级延迟'), '镜像源提示同步延迟');
  assert(cs.includes('刚发布的新版立即可见'), '官方源提示即时可见');
  assert(cs.includes('国内直连可能较慢'), '官方源提示国内访问慢');
  // off 能力保留说明
  assert(cs.includes('/gh upgrade 命令与一键升级仍然可用'), 'off 模式能力保留说明');
  // 代理联动提示
  assert(cs.includes('遵循「🌐 网络代理」'), '更新设置提示遵循全局代理');
  assert(cs.includes('socks5 代理下 npm 检测为直连'), 'socks5 边界如实提示');
  // 保存走后端路由
  assert(cs.includes('"/api/github/update-settings"'), '前端调用 update-settings 路由');
  // 后端路由存在
  const rl = readFileSync('src/api/routes-lifecycle.ts', 'utf8');
  assert(rl.includes("path: '/api/github/update-settings'"), '后端注册 update-settings 路由');
  assert(rl.includes('checker.applySettings(mode)'), '路由保存后热切换 checker');
  // version.ts 与 package.json 同版（防假横幅回归——build.mjs 也拦，测试双保险）
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const vt = readFileSync('src/version.ts', 'utf8');
  const m = vt.match(/CURRENT_PLUGIN_VERSION\s*=\s*'([^']+)'/);
  assert(m && m[1] === pkg.version, `version.ts(${m?.[1]}) 与 package.json(${pkg.version}) 同版`);

  // 「关于」分区锚点：项目信息/仓库/协议/求 Star
  assert(cs.includes('"ℹ️ 关于"'), '设置弹窗含「ℹ️ 关于」导航项');
  assert(cs.includes('"github.com/ItQianChen/dsh-github-flow"'.replace(/"/g, '"')), '关于页含仓库地址');
  assert(cs.includes('"npmjs.com/package/dsh-github-flow"'.replace(/"/g, '"')), '关于页含 npm 包地址');
  assert(cs.includes('"MIT License"'), '关于页含 MIT 开源协议');
  assert(cs.includes('去点 Star'), '关于页含求 Star 行动按钮');
  assert(cs.includes('当前版本: v'), '关于页展示当前版本号');

  // 插件身份标识锚点：界面用 GitHub 官方 Octocat 做功能图标，新用户易误认为
  // 官方功能——两处面板标题（右侧栏/工作台共用渲染 + 驾驶舱）必须带「插件」徽标
  assert(cs.includes('function renderPluginBadge('), '插件身份徽标组件存在');
  assert((cs.match(/renderPluginBadge\(h\)/g) || []).length === 2, `两处标题渲染函数调用身份徽标（实际: ${(cs.match(/renderPluginBadge\(h\)/g) || []).length}）`);
  assert(cs.includes('data-ds-dark-theme] .dsh-github-plugin-badge'), '徽标含暗色主题适配');
  assert(cs.includes('dsh-github-flow 插件'), 'tab/tooltip 文案注明插件身份');
  // 徽标交互语义：点击打开「关于」弹窗而非直接跳仓库（事件派发 + initialSection 直开 about）
  assert(cs.includes('dsh-github-open-about'), '徽标点击派发 open-about 事件');
  assert((cs.match(/addEventListener\("dsh-github-open-about"/g) || []).length === 2, '两个宿主面板都监听徽标事件');
  assert(cs.includes('initialSection: "about"'), '徽标路径直开关于分区');
  assert(!cs.includes('href: "https://github.com/ItQianChen/dsh-github-flow",\n        target: "_blank"'), '徽标不再直跳仓库');
  // 右侧栏设置按钮：复用主页设置弹窗（onOpenSettings 回调 + 完整 save/clear 接线）
  assert(cs.includes('onOpenSettings = null') || cs.includes('onOpenSettings: (() => void) | null = null'), '渲染函数支持设置入口回调');
  assert(cs.includes('openRightbarSettings'), '右侧栏有设置打开函数');
  assert(cs.includes('setRightbarModalSection("sync")'), '右侧栏设置默认打开数据同步分区');
  assert(cs.includes('setSyncSettings(newSettings)'), '右侧栏设置保存完整接线');
  // 多宿主防叠层 + 分区同步（审核修复项）：可见性守卫防止主页与右侧栏同时弹窗；
  // initialSection 同步 effect 防止常驻弹窗实例停留在旧分区
  assert((cs.match(/getBoundingClientRect\(\)/g) || []).length >= 2, '两个宿主都有可见性守卫（防双层弹窗）');
  assert(cs.includes('setActiveSection(props.initialSection)'), '弹窗打开时对齐 initialSection（实例常驻不重初始化）');
}

// ---- 8. 数据链路 fetch 超时保护锚点（防刷新永久卡死回归）----
console.log('\n--- 8. fetch timeout guards ---');
{
  const cs = readFileSync('lib/client.js', 'utf8');
  // 8.1 refresh 预置请求必须绑定 signal（原缺陷：挂起时 loading 永不清除）
  const refreshCalls = (cs.match(/fetch\("\/api\/github\/refresh"[^)]*\)/g) || []).length;
  const guardedRefresh = (cs.match(/fetch\("\/api\/github\/refresh", \{ method: "POST", signal: controller\.signal \}\)/g) || []).length;
  assert(refreshCalls === 2 && guardedRefresh === 2, `两处 refresh 预置请求均绑定 signal（实际: ${guardedRefresh}/${refreshCalls}）`);
  // 8.2 右侧栏 loadData 必须有 AbortController + 45s（原先完全没有）
  assert(cs.includes('signal: controller.signal'), '右侧栏 overview fetch 绑定 signal');
  assert((cs.match(/\}, 45000\);/g) || []).length === 2, `两处 loadData 均有 45 秒超时定时器（实际: ${(cs.match(/\}, 45000\);/g) || []).length}）`);
  // 8.3 引导卡刷新按钮 10s 超时
  assert(cs.includes('probeController.abort(); }, 10000);'), 'AuthGuideCard 探测按钮 10s 超时');
  // 8.4 超时文案与实际一致（45 秒），不再有 30 秒的旧文案
  assert(cs.includes('获取超时（45 秒）'), '超时文案为 45 秒');
  assert(!cs.includes('获取超时（30 秒）'), '旧 30 秒文案已清除');
}

console.log(`\n===== Phase 7: ${pass}/${total} PASS =====`);
if (fails.length) process.exit(1);
