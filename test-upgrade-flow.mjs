import assert from 'node:assert/strict';
import {
  isNewerVersion,
  UpdateChecker,
  UpgradeManager,
  buildCrossPlatformEnv,
  CURRENT_PLUGIN_VERSION,
  PLUGIN_PACKAGE_NAME,
  apply,
} from './lib/index.js';

async function runTests() {
  console.log('=== [1/5] 测试语义化版本比对算法 (isNewerVersion) ===');
  assert.equal(isNewerVersion('0.1.7', '0.1.8'), true, '0.1.7 < 0.1.8');
  assert.equal(isNewerVersion('0.1.7', '0.2.0'), true, '0.1.7 < 0.2.0');
  assert.equal(isNewerVersion('0.1.7', '1.0.0'), true, '0.1.7 < 1.0.0');
  assert.equal(isNewerVersion('0.1.7', '0.1.7'), false, '0.1.7 == 0.1.7');
  assert.equal(isNewerVersion('0.1.7', '0.1.6'), false, '0.1.7 > 0.1.6');
  assert.equal(isNewerVersion('v0.1.7', 'v0.1.8'), true, 'v0.1.7 < v0.1.8');
  assert.equal(isNewerVersion('0.1.7-beta.1', '0.1.8'), true, '0.1.7-beta < 0.1.8');
  console.log('✅ 语义化版本算法全部边界测试通过');

  console.log('\n=== [2/5] 测试 UpdateChecker 内存缓存与双源高可用探测 ===');
  const checker = new UpdateChecker({ intervalMs: 5000 });
  const quick = checker.getQuickStatus();
  assert.equal(quick.currentVersion, CURRENT_PLUGIN_VERSION);
  assert.equal(quick.hasUpdate, false);
  assert.ok(quick.upgradeCommand.includes(PLUGIN_PACKAGE_NAME));
  console.log('✅ getQuickStatus() 0ms 纯内存读取通过:', quick.currentVersion);

  // 测试外网真实 npmmirror 探测（网络畅通时获取当前最新版本）
  try {
    const live = await checker.check(true);
    console.log('✅ npm 实际最新版本探测成功:', live.latestVersion, '| 是否有更新:', live.hasUpdate);
  } catch (err) {
    console.log('⚠️ 外网探测遇到网络限制（预期内静默）:', err.message);
  }

  // 测试 Fail-Safe 容灾：向不可达的恶意地址探测时绝不能抛异常
  const brokenChecker = new UpdateChecker({ customRegistry: 'http://127.0.0.1:59999/unreachable' });
  const safeResult = await brokenChecker.check(true);
  assert.equal(safeResult.hasUpdate, false);
  console.log('✅ Fail-Safe 网络故障静默兜底机制通过');

  console.log('\n=== [3/5] 测试 UpgradeManager 环境自省与并发互斥锁 ===');
  const upgrader = new UpgradeManager();
  const envInfo = upgrader.detectEnvironment();
  console.log('宿主环境识别结果:', JSON.stringify(envInfo));
  assert.equal(envInfo.isDevLinked, true, '在当前开发仓库下必须识别为 devLinked');
  assert.equal(envInfo.isDesktop, true, '当前 session 下注入了 DSH_PROFILE=desktop，必须识别为桌面版环境');

  // 测试跨平台环境补全 (macOS / Linux / Windows PATH 自愈)
  const crossEnv = buildCrossPlatformEnv();
  assert.ok(crossEnv.PATH, '生成的进程环境必须包含合法 PATH');
  assert.ok(crossEnv.NPM_CONFIG_REGISTRY, '生成的进程环境必须包含 npm 镜像加速');
  console.log('✅ 跨平台子进程环境变量自愈补全测试通过');

  const upgradeRes = await upgrader.executeUpgrade('0.1.8');
  assert.equal(upgradeRes.ok, false);
  assert.ok(upgradeRes.message.includes('本地 Git 源码软链接模式'));
  console.log('✅ 源码模式安全防线生效，成功阻止意外 npm 覆盖');

  console.log('\n=== [4/5] 测试 API 路由挂载与端点注册 ===');
  const registeredRoutes = [];
  const mockWebServer = {
    register: (route) => registeredRoutes.push(route),
  };
  const mockCtx = {
    webServer: mockWebServer,
    commands: { register: () => {} },
    tools: { register: () => {} },
  };

  apply(mockCtx);

  const checkUpdateRoute = registeredRoutes.find((r) => r.path === '/api/github/check-update');
  const upgradeRoute = registeredRoutes.find((r) => r.path === '/api/github/upgrade');
  const upgradeStatusRoute = registeredRoutes.find((r) => r.path === '/api/github/upgrade-status');
  const authRoute = registeredRoutes.find((r) => r.path === '/api/github/auth');

  assert.ok(checkUpdateRoute, '必须注册 /api/github/check-update 路由');
  assert.ok(upgradeRoute, '必须注册 /api/github/upgrade 路由');
  assert.ok(upgradeStatusRoute, '必须注册 /api/github/upgrade-status 路由');
  assert.ok(authRoute, '必须注册 /api/github/auth 快速认证探针路由');
  console.log(`✅ WebServer 成功注册全套升级与快速认证端点 (共 ${registeredRoutes.length} 个路由)`);

  // 模拟调用 /api/github/check-update 接口
  let checkResJson = null;
  const mockRes = {
    statusCode: 200,
    setHeader: () => {},
    end: (str) => { checkResJson = JSON.parse(str); },
  };
  await checkUpdateRoute.handler({ method: 'GET', url: '/api/github/check-update' }, mockRes);
  assert.equal(mockRes.statusCode, 200);
  assert.ok(checkResJson?.ok);
  assert.equal(checkResJson.data.currentVersion, CURRENT_PLUGIN_VERSION);
  console.log('✅ /api/github/check-update 端点执行成功:', checkResJson.data.currentVersion);

  console.log('\n=== [5/5] 测试 Slash 命令 /gh status 与 /gh upgrade ===');
  let registeredCmd = null;
  const cmdMockCtx = {
    commands: {
      register: (cmd) => { registeredCmd = cmd; },
    },
  };
  apply(cmdMockCtx);
  assert.ok(registeredCmd, '必须注册 /gh 命令');

  const statusOut = await registeredCmd.handler({ rawInput: 'status' });
  assert.ok(statusOut.text.includes(CURRENT_PLUGIN_VERSION), '输出中必须包含插件当前版本号');
  console.log('✅ /gh status 输出成功包含版本标识:\n' + statusOut.text.split('\n')[2]);

  const upgradeOut = await registeredCmd.handler({ rawInput: 'upgrade' });
  assert.ok(upgradeOut.text.includes('升级指南'));
  assert.ok(upgradeOut.text.includes('pnpm dsh plugin add'));
  console.log('✅ /gh upgrade 升级指引命令执行成功');

  console.log('\n🎉 所有 5 项核心升级与提示专项测试全部通过！');
}

runTests().catch((err) => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
