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
    assert(builtClient.includes('fetchWithRetry'), '客户端必须包含 fetchWithRetry 调用');
    assert(builtClient.includes('网络抖动，正在自愈重试'), '必须包含自愈重试的用户提示');
  });

  await asyncTest('fetchWithRetry 阶梯退避算法与软硬错误识别断言', async () => {
    const { fetchWithRetry } = await import('../lib/ui/utils.js');
    let callCount = 0;
    const retryDelays = [];

    // 模拟第一次和第二次失败（软错误 503），第三次成功
    const fakeFetch = async () => {
      callCount++;
      if (callCount < 3) {
        return {
          status: 503,
          ok: false,
          statusText: 'Service Unavailable',
          json: async () => ({}),
        };
      }
      return {
        status: 200,
        ok: true,
        statusText: 'OK',
        json: async () => ({ ok: true, data: { success: true } }),
      };
    };

    const oldFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch;

    try {
      const result = await fetchWithRetry('https://api.github.com/mock', {}, {
        maxRetries: 3,
        baseDelayMs: 40,
        onRetry: (attempt, delay) => {
          retryDelays.push(delay);
        },
      });

      assert.strictEqual(callCount, 3, '重试了两次并在第三次成功');
      assert.strictEqual(result.json.data.success, true, '成功拿到业务数据');
      assert.strictEqual(retryDelays.length, 2, '记录了两次退避等待');
      assert(retryDelays[1] > retryDelays[0], '第二次退避时间大于第一次退避时间（阶梯指数增长）');
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  await asyncTest('overview 路由在 PR 接口失败时保全已有有效 PR 缓存，绝不将数据冲刷为空且标记 partialFailure', async () => {
    const { registerOverviewRoutes } = await import('../lib/api/routes-overview.js');
    const { TtlCache } = await import('../lib/cache.js');

    const fakeCache = new TtlCache(100000);
    // 注入已有 1 条有效 PR 的缓存。
    // 仓库身份必须与当前工作区真实身份一致：since v0.5.1 缓存读取前会做一次
    // 身份失效校验（.git/config 变了就作废脏快照），种一个假 owner 会被直接清掉，
    // 那是校验在正常工作，不是本用例要验的「网络故障时保全列表」行为。
    const realIdentity = new GhExecutor().getRepoIdentityFromLocal(process.cwd());
    fakeCache.set(process.cwd(), {
      auth: { installed: true, loggedIn: true },
      repo: realIdentity || { nameWithOwner: 'test/repo', name: 'repo', owner: 'test', defaultBranch: 'main' },
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

  // ============================================================
  // 三、测试 Git 分支查看与安全切换功能（零 🌿 违禁图标，纯原生 Git 交互）
  // ============================================================
  console.log('\n--- 3. Git Branch Inspection & Safe Switcher ---');

  const { parseGitBranchLines } = await import('../lib/executor.js');

  test('parseGitBranchLines 结构化解析分支输出并正确标记当前分支与过滤 HEAD', () => {
    const mockOutput = [
      'master|*|origin/master|10 minutes ago|2258731|fix(panel): sample commit',
      'origin/HEAD| ||15 hours ago|29e2109|chore(release): v0.3.0',
      'feature/login| |origin/feature/login|2 hours ago|a1b2c3d|feat: add login',
      'origin/master| ||15 hours ago|29e2109|chore(release): v0.3.0',
    ].join('\n');

    const result = parseGitBranchLines(mockOutput);
    assert.strictEqual(result.current, 'master', '当前分支识别为 master');
    assert.strictEqual(result.branches.length, 3, '应过滤掉 origin/HEAD 符号引用');
    assert.strictEqual(result.branches[0].name, 'master', '第一条应为 master');
    assert.strictEqual(result.branches[0].isCurrent, true, 'master 应为当前分支');
    assert.strictEqual(result.branches[0].upstream, 'origin/master', '上游分支解析正确');
    assert.strictEqual(result.branches[0].shortSha, '2258731', 'SHA 解析正确');
    assert.strictEqual(result.branches[1].name, 'feature/login', '第二条为 feature/login');
    assert.strictEqual(result.branches[1].isRemote, false, 'feature/login 为本地分支');
    assert.strictEqual(result.branches[2].isRemote, true, 'origin/master 为远程分支');
  });

  await asyncTest('switchGitBranch 参数合法性与注入防护', async () => {
    // 注入尝试：以 - 开头会被当成 CLI flag
    const bad1 = await exec.switchGitBranch(process.cwd(), '-b');
    assert.strictEqual(bad1.ok, false, '以 - 开头的分支名必须被拦截');

    // 注入尝试：含分号或控制字符
    const bad2 = await exec.switchGitBranch(process.cwd(), 'master; rm -rf /');
    assert.strictEqual(bad2.ok, false, '含分号注入字符的分支名必须被拦截');

    // 注入尝试：含连续点号
    const bad3 = await exec.switchGitBranch(process.cwd(), 'master..dev');
    assert.strictEqual(bad3.ok, false, '含连续点号的分支名必须被拦截');

    // 非 Git 目录拦截
    const nonGitTemp = path.join(os.tmpdir(), `dsh-non-git-${Date.now()}`);
    fs.mkdirSync(nonGitTemp, { recursive: true });
    try {
      const bad4 = await exec.switchGitBranch(nonGitTemp, 'master');
      assert.strictEqual(bad4.ok, false, '非 Git 目录切换必须被拦截');
      assert(bad4.error.includes('不是有效的 Git 仓库'), '非 Git 目录应有明确提示');
    } finally {
      try { fs.rmSync(nonGitTemp, { recursive: true, force: true }); } catch {}
    }
  });

  test('客户端构建产物断言：严禁包含 🌿 违禁植物图标，必须使用 Git 官方矢量图标与下拉交互', () => {
    const builtClient = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
    // 铁律检查：绝不使用 🌿 图标
    assert(!builtClient.includes('🌿'), '严禁在客户端代码中出现 🌿 违禁图标');
    // 核心组件与交互
    assert(builtClient.includes('BranchSelectorDropdown'), '客户端必须包含 BranchSelectorDropdown 分支选择组件');
    assert(builtClient.includes('dsh-github-branch-btn'), '必须包含分支选择器按钮类名');
    assert(builtClient.includes('dsh-github-branch-dropdown'), '必须包含分支选择器浮层类名');
    assert(builtClient.includes('/api/github/branches'), '必须包含读取分支列表接口');
    assert(builtClient.includes('/api/github/branch-switch'), '必须包含切换分支接口');
    assert(builtClient.includes('搜索分支 (输入关键词)...'), '必须包含分支实时搜索过滤框');
  });

  await asyncTest('路由端点契约：/api/github/branches 与 /api/github/branch-switch 均已正确注册', async () => {
    const { registerActionRoutes } = await import('../lib/api/routes-actions.js');
    const registered = {};
    const deps = { bindRoute: (r) => { registered[r.path] = r.handler; } };
    registerActionRoutes(deps, exec, new (await import('../lib/cache.js')).TtlCache(1000), new (await import('../lib/cache.js')).TtlCache(1000));

    assert(typeof registered['/api/github/branches'] === 'function', '分支列表接口 GET /api/github/branches 必须已注册');
    assert(typeof registered['/api/github/branch-switch'] === 'function', '分支切换接口 POST /api/github/branch-switch 必须已注册');
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
