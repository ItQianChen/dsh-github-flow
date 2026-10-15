// test/phase12.test.mjs - 针对工作区隔离与网络异常态专项回归测试套件
//
// 验证两大核心 Bug 修复：
// 1. 工作区路径所有权收敛：非 Git 空白文件夹工作区绝不被篡改成上一仓库；
// 2. 状态空间解耦与网络异常容灾：网络卡顿/超时/断网时精准报告网络问题，绝不误判为未安装或未登录，保全 SWR 快照。

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('🧪 开始执行 Phase 12 专项回归测试\n');
  let total = 0;
  let passed = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`✅ PASS: ${name}`);
    } catch (e) {
      console.error(`❌ FAIL: ${name}`);
      console.error(e);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`✅ PASS: ${name}`);
    } catch (e) {
      console.error(`❌ FAIL: ${name}`);
      console.error(e);
    }
  }

  const { GhExecutor } = await import('../lib/executor.js');
  const exec = new GhExecutor();

  // ============================================================
  // 一、测试问题 1：工作区路径所有权与非 Git 目录防越权篡改
  // ============================================================
  console.log('\n--- 1. Workspace Cwd Ownership & Non-Git Guard ---');

  // 1.1 创建一个临时空白目录（确认其真实存在，但绝不包含 .git）
  const tempEmptyDir = path.join(os.tmpdir(), `dsh-test-empty-ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(tempEmptyDir, { recursive: true });

  try {
    test('resolveWorkspaceCwd 面对显式非 Git 目录，原样返回该目录，严禁篡改为上一 Git 仓库', () => {
      const resolved = exec.resolveWorkspaceCwd(tempEmptyDir);
      assert.strictEqual(
        resolved,
        tempEmptyDir,
        `显式传入的空工作区应原样返回，实测返回了: ${resolved}`
      );
    });

    test('resolveWorkspaceCwd 即使一级子目录包含 Git，也严格原样返回当前目录，绝不越权穿透到子目录', () => {
      const subRepo = path.join(tempEmptyDir, 'sub-package');
      const subGit = path.join(subRepo, '.git');
      fs.mkdirSync(subGit, { recursive: true });

      const resolved = exec.resolveWorkspaceCwd(tempEmptyDir);
      assert.strictEqual(
        resolved,
        tempEmptyDir,
        `显式传入的父目录应原样返回自身，绝不进入子目录，实测返回了: ${resolved}`
      );

      // 清理子目录 .git
      fs.rmSync(subRepo, { recursive: true, force: true });
    });

    await asyncTest('getRepoMetadata 在非 Git 空白目录下安全返回 null，绝不伪造上一仓库数据', async () => {
      const meta = await exec.getRepoMetadata(tempEmptyDir);
      assert.strictEqual(meta, null, '空白工作区应返回 null，严禁返回任何仓库元数据');
    });

    test('客户端构建产物中已具备 cwd 响应式重置 (useEffect([cwd]))', () => {
      const builtClient = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
      assert(builtClient.includes('getStoredRightbarSnapshot(cwd)'), '应包含按当前 cwd 读取快照逻辑');
      assert(builtClient.includes('setData(snap?.data || null)'), '切换 cwd 时必须立即置换为新工作区数据或 null');
      assert(builtClient.includes('未检测到关联的 GitHub 仓库'), '客户端必须包含未关联仓库的空状态提示');
    });

    test('未绑定仓库时快捷操作栏安全隐藏或保护，不展示无意义外部操作', () => {
      const builtClient = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
      assert(builtClient.includes('快捷操作栏 (仅在检测到关联仓库时展示'), '快捷操作栏必须在 repo 存在时才渲染');
    });
  } finally {
    // 清理临时测试目录
    try { fs.rmSync(tempEmptyDir, { recursive: true, force: true }); } catch {}
  }

  // ============================================================
  // 二、测试问题 2：本地凭据读取、网络异常判定与状态解耦
  // ============================================================
  console.log('\n--- 2. Network Error Decoupling & SWR Cache Preservation ---');

  test('checkLocalGhCredential 纯本地轻量读取已存凭据', () => {
    const cred = exec.checkLocalGhCredential();
    // 本地环境若已配置 gh，能安全解析出结果或 null（不抛异常）
    assert(cred === null || (typeof cred === 'object' && cred.hasToken === true), '本地凭据检测应安全返回');
  });

  await asyncTest('checkAuth 遭遇网络异常时保全已有有效登录缓存', async () => {
    // 注入模拟的已登录缓存
    const fakeValidAuth = {
      installed: true,
      loggedIn: true,
      user: 'test-user',
      host: 'github.com',
    };
    exec.authCache = { at: Date.now(), value: fakeValidAuth };

    // 模拟 probeAuth 发生网络超时
    const originalProbe = exec.probeAuth;
    exec.probeAuth = async () => ({
      installed: true,
      loggedIn: false,
      networkError: true,
      networkErrorReason: '连接 GitHub API 超时 (10 秒)。请检查网络连通性或代理配置。',
    });

    try {
      const result = await exec.checkAuth(undefined, true);
      assert.strictEqual(result.installed, true, '网络异常时 installed 必须保持 true');
      assert.strictEqual(result.loggedIn, true, '已有登录缓存时遭遇网络错误，loggedIn 应容灾保全');
      assert.strictEqual(result.user, 'test-user', '用户名应得以继承保全');
      assert.strictEqual(result.networkError, true, 'networkError 必须显式标记');
      assert(result.networkErrorReason.includes('超时'), '应带有明确的超时提示');
    } finally {
      exec.probeAuth = originalProbe;
      exec.authCache = null;
    }
  });

  test('客户端废除对未登录快照的毒丸物理抹除 (保护 SWR 离线快照)', () => {
    const builtClient = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
    // 确认 getStoredGlobalOverview / getStoredRightbarSnapshot 不再包含毒丸删除注释与逻辑
    assert(!builtClient.includes('毒丸缓存自愈清洗'), '全局面板快照读取时废除毒丸删除');
    assert(!builtClient.includes('毒丸拦截：若快照未登录，物理删除'), '右侧栏快照读取时废除毒丸删除');
    assert(builtClient.includes('saveStoredGlobalOverview(data)'), '存在保存全局快照逻辑');
    assert(builtClient.includes('networkError'), '快照保存具备网络故障拦截');
  });

  test('客户端 AuthGuideCard 支持网络异常态，提供重试与配置网络代理', () => {
    const builtClient = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
    assert(builtClient.includes('🌐 无法连接 GitHub 服务器'), '必须包含网络异常标题');
    assert(builtClient.includes('网络受限'), '必须包含网络受限徽章');
    assert(builtClient.includes('🔄 重试网络连接'), '必须提供重试网络连接按钮');
    assert(builtClient.includes('⚙️ 配置网络代理'), '必须提供一键打开代理设置按钮');
    assert(builtClient.includes('dsh-github-open-proxy'), '必须支持代理弹窗事件通信');
  });

  test('客户端具备醒目的 NetworkAlertBanner 与刷新失败 Toast，彻底杜绝静默欺骗', () => {
    const builtClient = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
    assert(builtClient.includes('NetworkAlertBanner'), '必须包含 NetworkAlertBanner 组件');
    assert(builtClient.includes('网络连接失败，当前展示离线历史数据'), '横幅必须大字警示离线历史数据事实');
    assert(builtClient.includes('❌ 刷新失败 (离线)'), '微标在失败时必须明确展示刷新失败');
    assert(builtClient.includes('showToast'), '必须具备失败时的 Toast 提示');
    assert(builtClient.includes('networkAlertBannerEl'), '页面根容器必须置顶注入网络告警横幅');
    assert(builtClient.includes('isFail'), '客户端刷新必须严格分流判断失败状态');
  });

  await asyncTest('overview 路由在 PR 接口失败时保全已有有效 PR 缓存，绝不将数据冲刷为空且标记 partialFailure', async () => {
    const { registerOverviewRoutes } = await import('../lib/api/routes-overview.js');
    const { TtlCache } = await import('../lib/cache.js');

    const fakeCache = new TtlCache(100000);
    // 注入已有 1 条有效 PR 的缓存
    fakeCache.set(process.cwd(), {
      auth: { installed: true, loggedIn: true },
      repo: { nameWithOwner: 'test/repo', name: 'repo', owner: 'test', defaultBranch: 'main' },
      pullRequests: [{ number: 123, title: 'Existing Important PR' }],
      issues: [],
      runs: [],
      lastUpdated: new Date().toISOString(),
    });

    const mockExec = new GhExecutor();
    // 模拟 run 执行 gh pr list 时遭遇网络超时失败
    mockExec.run = async (args) => {
      if (args.includes('pr') && args.includes('list')) {
        return { ok: false, error: 'GitHub CLI 命令执行超时 (8000ms)。请检查网络连通性。' };
      }
      if (args.includes('auth')) {
        return { ok: true, rawOutput: '✓ Logged in to github.com account testuser' };
      }
      return { ok: true, data: [] };
    };

    let responseData = null;
    const registered = {};
    const deps = { bindRoute: r => registered[r.path] = r.handler };
    registerOverviewRoutes(deps, mockExec, fakeCache, new TtlCache(10000), { getQuickStatus: () => null });

    const handler = registered['/api/github/overview'];
    await handler(
      { method: 'GET', url: `/api/github/overview?force=true&cwd=${encodeURIComponent(process.cwd())}` },
      {
        setHeader() {},
        end(str) { responseData = JSON.parse(str); }
      }
    );

    assert(responseData !== null, '必须有响应');
    assert.strictEqual(responseData.partialFailure, true, 'PR 拉取失败必须显式标记 partialFailure');
    assert(responseData.data.pullRequests.length === 1, '用户的 1 个 PR 必须完好无损地被保全，严禁抹成空数组');
    assert.strictEqual(responseData.data.pullRequests[0].number, 123, '保全的 PR 数据必须正确');
  });

  console.log('\n========================================');
  console.log(`Phase 12 Test Result: ${passed}/${total} assertions PASSED!`);
  console.log('========================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
