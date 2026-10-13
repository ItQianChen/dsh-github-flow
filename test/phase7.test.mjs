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
    const req = { method: 'POST', on(ev, cb) { if (ev === 'data') cb('{}'); if (ev === 'end') cb(); } };
    // 覆写 body 内容：用闭包注入 payload
    let payload = JSON.stringify({ action: 'open_terminal', command: 'rm -rf /' });
    const req2 = { method: 'POST', on(ev, cb) { if (ev === 'data') cb(payload); if (ev === 'end') cb(); } };
    await handler(req2, res);
    const json = JSON.parse(body);
    assert(status === 500 && json.ok === false && /不支持唤起/.test(json.error || json.message || ''), '非白名单命令被拒绝');
  }

  // 4.2 合法命令（Windows 本机真实唤起会弹窗——用沙箱判定跳过真实 spawn，验证返回结构）
  {
    let status = 0, body = '';
    const res = { setHeader() {}, end(d) { body = d; }, get statusCode() { return status; }, set statusCode(v) { status = v; } };
    const payload = JSON.stringify({ action: 'open_terminal', command: 'gh auth login' });
    const req2 = { method: 'POST', on(ev, cb) { if (ev === 'data') cb(payload); if (ev === 'end') cb(); } };
    await handler(req2, res);
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

console.log(`\n===== Phase 7: ${pass}/${total} PASS =====`);
if (fails.length) process.exit(1);
