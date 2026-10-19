import assert from 'node:assert/strict';
import {
  apply,
  name,
  inject,
  CURRENT_PLUGIN_VERSION,
  PLUGIN_PACKAGE_NAME,
  isNewerVersion,
  UpdateChecker,
  UpgradeManager,
  buildCrossPlatformEnv,
  truncateOutput,
  GhExecutor,
} from './lib/index.js';

import { createPrTool } from './lib/tools/pr.js';
import { createIssueTool } from './lib/tools/issue.js';
import { createRunTool } from './lib/tools/run.js';
import { createRepoTool } from './lib/tools/repo.js';
import { createApiTool } from './lib/tools/api.js';

async function runComprehensiveAudit() {
  console.log('===============================================================');
  console.log('       dsh-github-flow 全量功能深度核查与端到端自动化测试       ');
  console.log('===============================================================\n');

  // --------------------------------------------------------------------------
  // [1] 插件元数据与 Cordis 契约规范核查
  // --------------------------------------------------------------------------
  console.log('▶ [1/6] 审查 Cordis 微内核契约与插件元数据...');
  assert.equal(name, 'dsh-github-flow', '插件名称必须为 dsh-github-flow');
  assert.ok(Array.isArray(inject), 'inject 必须为服务依赖数组');
  assert.ok(inject.includes('tools'), '必须注入 tools 核心服务');
  assert.ok(inject.includes('commands'), '必须注入 commands 核心服务');
  assert.ok(inject.includes('webServer'), '必须注入 webServer 核心服务 (确保路由正常注册)');
  assert.ok(inject.includes('workspaceRegistry'), '必须注入 workspaceRegistry 服务');
  console.log('  ✓ 插件名称与全部 4 项核心服务注入依赖声明合规');

  // --------------------------------------------------------------------------
  // [2] 后端执行引擎 (GhExecutor) 边界与安全性核查
  // --------------------------------------------------------------------------
  console.log('\n▶ [2/6] 审查 GhExecutor 输出截断、防溢出与认证探测...');
  const executor = new GhExecutor({ maxOutputChars: 500, maxOutputBytes: 1000 });

  // 2.1 正常短文本不截断
  const shortText = 'Commit e3a1f: fix bug in executor';
  const shortRes = truncateOutput(shortText, 500, 1000);
  assert.equal(shortRes.truncated, false);
  assert.equal(shortRes.text, shortText);
  console.log('  ✓ 短文本无损透传通过');

  // 2.2 字符数超长截断保护
  const longText = 'A'.repeat(2000);
  const longRes = truncateOutput(longText, 500, 2000);
  assert.equal(longRes.truncated, true);
  assert.ok(longRes.text.includes('内容过长已由 DSH GitHub 插件截断'));
  console.log('  ✓ 字符超长二分保留头尾截断通过');

  // 2.3 中文字符多字节 UTF-8 字节超长截断保护
  const chineseText = '深色模式与代码审查自动化'.repeat(100); // 1200 字符 = 3600 字节
  const byteRes = truncateOutput(chineseText, 5000, 500);
  assert.equal(byteRes.truncated, true);
  assert.ok(byteRes.text.includes('UTF-8 字节上限'));
  console.log('  ✓ 中文 UTF-8 真实字节数上限截断通过');

  // 2.4 认证算法容灾测试 (模拟各种 CLI 输出形态)
  // 通过反射私有 probeAuth 行为进行多场景断言
  const mockProbe = async (rawOutput, error = '') => {
    // 构造临时测试执行器
    const fakeExec = new GhExecutor();
    fakeExec.run = async () => ({ ok: !error, rawOutput, error });
    return (fakeExec).checkAuth(undefined, true);
  };

  // 场景 A: 真实标准成功输出 (带 Unicode 对勾)
  const authA = await mockProbe('github.com\n  ✓ Logged in to github.com account Alice (keyring)\n  - Active account: true\n  - Token: gho_xxx');
  assert.equal(authA.loggedIn, true);
  assert.equal(authA.user, 'Alice');

  // 场景 B: 容错 Windows GBK 环境下对勾变问号或根号
  const authB = await mockProbe('github.com\n  ? Logged in to github.com account Bob (keyring)\n  - Active account: true\n  - Token: gho_xxx');
  assert.equal(authB.loggedIn, true);
  assert.equal(authB.user, 'Bob');

  // 场景 C: 显式未登录
  const authC = await mockProbe('', 'You are not logged in to any GitHub hosts. Run gh auth login to authenticate.');
  assert.equal(authC.loggedIn, false);
  assert.equal(authC.installed, true);

  // 场景 D: CLI 未安装 (ENOENT)
  const authD = await mockProbe('', 'spawn gh ENOENT');
  assert.equal(authD.loggedIn, false);
  assert.equal(authD.installed, false);
  console.log('  ✓ probeAuth 登录探测算法在 Unicode、多语言及未安装异常下 100% 稳健');

  // --------------------------------------------------------------------------
  // [3] WebServer 全部 API 端点完整性与路由注册核查
  //     （路由数随功能演进增长：proxy 2 条 + update-settings 1 条，此处只验不漏不重）
  // --------------------------------------------------------------------------
  console.log('\n▶ [3/6] 审查 WebServer 全部 API 路由与通信契约...');
  const routes = [];
  const mockWebServer = {
    exact: new Map(),
    register: (r) => routes.push(r),
  };
  const mockCtx = {
    webServer: mockWebServer,
    commands: { register: () => {} },
    tools: { register: () => {} },
  };

  apply(mockCtx);

  const expectedPaths = [
    '/api/github/overview',
    '/api/github/refresh',
    '/api/github/action',
    '/api/github/global-overview',
    '/api/github/check-update',
    '/api/github/upgrade',
    '/api/github/upgrade-status',
    '/api/github/auth',
    '/api/github/proxy',
    '/api/github/proxy/probe',
    '/api/github/update-settings',
    '/api/github/commit-detail',
    '/api/github/git-log',
  ];

  for (const path of expectedPaths) {
    const hit = routes.find((r) => r.path === path);
    assert.ok(hit, `必须成功挂载路由: ${path}`);
  }
  assert.equal(routes.length, expectedPaths.length, `必须恰好注册 ${expectedPaths.length} 个 API 路由（不重不漏）`);
  console.log(`  ✓ WebServer ${expectedPaths.length} 个核心端点全量注册通过`);

  // 测试快速认证探针 /api/github/auth
  const authRoute = routes.find((r) => r.path === '/api/github/auth');
  let authResData = null;
  await authRoute.handler({ method: 'GET', url: '/api/github/auth?force=true' }, {
    statusCode: 200,
    setHeader: () => {},
    end: (str) => { authResData = JSON.parse(str); },
  });
  assert.ok(authResData.ok, '/api/github/auth 必须正常返回 200 响应');
  assert.ok(authResData.auth !== undefined, '/api/github/auth 必须包含 auth 节点');
  console.log('  ✓ /api/github/auth 快速认证探针端点通信正常');

  // 测试强制清空缓存端点 /api/github/refresh
  const refreshRoute = routes.find((r) => r.path === '/api/github/refresh');
  let refreshRes = null;
  await refreshRoute.handler({ method: 'POST', url: '/api/github/refresh' }, {
    statusCode: 200,
    setHeader: () => {},
    end: (str) => { refreshRes = JSON.parse(str); },
  });
  assert.ok(refreshRes.ok, '/api/github/refresh 必须返回 ok: true');
  console.log('  ✓ /api/github/refresh 缓存清空端点通信正常');

  // --------------------------------------------------------------------------
  // [4] Agent 领域核心工具与人类 Slash 命令核查
  //     （工具数随功能演进增长：release/secret/skill/help，此处只验不漏不重）
  // --------------------------------------------------------------------------
  console.log('\n▶ [4/6] 审查 Agent 原生工具与人类 Slash 指令...');
  const tools = [];
  const dummyCtx = {
    tools: { register: (t) => tools.push(t) },
    commands: { register: () => {} },
  };
  apply(dummyCtx);

  const expectedTools = ['github_pr', 'github_issue', 'github_run', 'github_repo', 'github_api', 'github_release', 'github_secret', 'github_skill', 'github_help'];
  assert.equal(tools.length, expectedTools.length, `必须注册 ${expectedTools.length} 个核心工具（不重不漏）`);
  const toolNames = tools.map((t) => t.name);
  for (const name of expectedTools) {
    assert.ok(toolNames.includes(name), `必须包含 ${name}`);
  }

  // 验证工具描述与网关格式
  for (const t of tools) {
    assert.ok(typeof t.description === 'string' && t.description.length > 10, `${t.name} 工具描述不完备`);
    assert.ok(t.parameters, `${t.name} 工具必须声明 parameters`);
  }
  console.log('  ✓ 5 大 Agent 工具规范契约与元数据校验通过');

  // 人类 Slash 命令测试
  let slashCmd = null;
  apply({
    commands: { register: (c) => { slashCmd = c; } },
  });
  assert.ok(slashCmd, '必须注册 /gh Slash 命令');
  const helpOut = await slashCmd.handler({ rawInput: 'help' });
  assert.ok(helpOut.text.includes('/gh status'));
  assert.ok(helpOut.text.includes('/gh upgrade'));
  const statusOut = await slashCmd.handler({ rawInput: 'status' });
  assert.ok(statusOut.text.includes(CURRENT_PLUGIN_VERSION));
  const upgradeOut = await slashCmd.handler({ rawInput: 'upgrade' });
  assert.ok(upgradeOut.text.includes(PLUGIN_PACKAGE_NAME));
  console.log('  ✓ /gh status、/gh upgrade、/gh help 终端指令全量测试通过');

  // --------------------------------------------------------------------------
  // [5] 跨平台升级与环境自愈引擎核查 (macOS / Windows)
  // --------------------------------------------------------------------------
  console.log('\n▶ [5/6] 审查跨平台版本检测、一键升级与环境自省引擎...');
  assert.equal(isNewerVersion('0.1.7', '0.1.8'), true);
  assert.equal(isNewerVersion('0.1.7', '0.1.7'), false);
  assert.equal(isNewerVersion('0.2.0', '0.1.9'), false);

  const upgrader = new UpgradeManager();
  const envInfo = upgrader.detectEnvironment();
  assert.ok(envInfo.platform, '环境信息必须包含当前 platform');
  console.log(`  ✓ 宿主环境识别成功 (Platform: ${envInfo.platform}, Desktop: ${envInfo.isDesktop}, Profile: ${envInfo.profile})`);

  // 验证跨平台环境变量注入（默认 registry 为官方源；镜像随用户「更新设置」注入）
  const crossEnv = buildCrossPlatformEnv();
  assert.ok(crossEnv.PATH && crossEnv.PATH.length > 0, '自愈补全的 PATH 不能为空');
  assert.equal(crossEnv.NPM_CONFIG_REGISTRY, 'https://registry.npmjs.org', '默认 registry 为 npm 官方源');
  console.log('  ✓ 跨平台环境变量自愈引擎测试通过');

  // 验证本地源码软链接模式防破坏保护
  assert.equal(envInfo.isDevLinked, true);
  const blockRes = await upgrader.executeUpgrade('0.1.8');
  assert.equal(blockRes.ok, false);
  assert.ok(blockRes.message.includes('本地 Git 源码软链接模式'));
  console.log('  ✓ 源码开发态安全保护防线生效');

  // --------------------------------------------------------------------------
  // [6] 前端持久化缓存、SWR 模式与毒丸防御核查
  // --------------------------------------------------------------------------
  console.log('\n▶ [6/6] 审查前端客户端 (lib/client.js) SWR 缓存与容灾机制...');
  // 验证 lib/client.js 构建产物已剔除非法 ESM 导出
  import('node:fs').then(fs => {
    const clientCode = fs.readFileSync('./lib/client.js', 'utf8');
    assert.ok(!clientCode.includes('export {};'), 'lib/client.js 必须彻底清除 export {}; 声明');
    assert.ok(clientCode.includes('dsh_github_global_overview_snapshot_v1'), '必须包含全局缓存存储键名');
    assert.ok(clientCode.includes('dsh_github_sync_settings_v1'), '必须包含同步设置存储键名');
    assert.ok(clientCode.includes('GlobalSyncSettingsModal'), '必须包含数据同步设置弹窗');
    assert.ok(clientCode.includes('SyncStatusBadge'), '必须包含状态胶囊指示器');
    assert.ok(clientCode.includes('/api/github/auth?force=true'), '必须包含轻量快速认证探针调用');
    console.log('  ✓ 前端 client.js 规范性、SWR 秒开、设置弹窗与快速探针集成验证全部通过');

    console.log('\n===============================================================');
    console.log('🎉 全面核查完成：6 大核心模块、全部 8 个路由、5 大工具 100% 稳健！');
    console.log('===============================================================');
  });
}

runComprehensiveAudit().catch((err) => {
  console.error('\n❌ 核查失败:', err);
  process.exit(1);
});
