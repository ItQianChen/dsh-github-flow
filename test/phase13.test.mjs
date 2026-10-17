// test/phase13.test.mjs - 针对本地 Git 文件监控与云端定时同步机制专项回归测试套件
//
// 验证两大核心新能力：
// 1. 本地 Git 改动实时感知：仅右侧栏当前工作区生效，只监控 .git 核心元数据（防抖 800ms），首页坚决不开启；
// 2. 云端数据定时自动同步：右侧栏与全景首页通用，首屏 SWR 立即拉取，拉取结算后再递归启动计时，带息屏避让。

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('🧪 开始执行 Phase 13 专项回归测试\n');
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
  // 一、测试设置模型契约与客户端 UI 交互
  // ============================================================
  console.log('\n--- 1. Settings Contract & UI Interaction ---');

  const builtClient = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');

  test('设置默认值与数据模型契约完备（收敛为三选一互斥单选 + 本地监控单独开关）', () => {
    assert(builtClient.includes('localGitWatch: true'), '默认设置必须包含 localGitWatch 且默认开启');
    assert(builtClient.includes('cloudSyncIntervalMs: 600000'), '默认轮询周期为 10 分钟 (600,000ms)');
    assert(builtClient.includes('merged.cloudSyncIntervalMs < 300000'), '轮询周期必须有安全下限门限 (不低于 5 分钟)');
  });

  test('设置弹窗将SWR、云端定时与手动刷新收敛为互斥三单选，本地Git独立勾选', () => {
    assert(builtClient.includes('本地 Git 改动实时感知 (仅右侧栏生效)'), '设置弹窗包含本地 Git 感知开关');
    assert(builtClient.includes('云端数据定时自动同步'), '设置弹窗包含云端定时同步选项');
    assert(builtClient.includes('5 分钟 (高频感知)'), '提供 5 分钟选项');
    assert(builtClient.includes('10 分钟 (标准推荐)'), '提供 10 分钟推荐选项');
    assert(builtClient.includes('30 分钟 (轻量节省)'), '提供 30 分钟选项');
    assert(builtClient.includes('1 小时 (极低频)'), '提供 1 小时选项');
  });

  test('独立宽屏指南大窗口与双端浅入口契约完整（GithubHelpModal + 四大子版块 + Prompt 复制）', () => {
    // 1. 独立宽屏大窗口组件与四大分类导航
    assert(builtClient.includes('GithubHelpModal'), '必须导出独立大窗口组件 GithubHelpModal');
    assert(builtClient.includes('使用指南与实战手册'), '必须包含独立大窗口标头');
    assert(builtClient.includes('3分钟极速上手'), '必须包含「🚀 3分钟极速上手」版块');
    assert(builtClient.includes('Agent 提示词实战'), '必须包含「🤖 Agent 提示词实战」版块');
    assert(builtClient.includes('两大界面操作图解'), '必须包含「🖥️ 两大界面操作图解」版块');
    assert(builtClient.includes('常见自愈排错'), '必须包含「🔑 常见自愈排错」版块');

    // 2. 具备 Prompt 一键复制机制
    assert(builtClient.includes('一键复制 Prompt'), '界面必须提供一键复制 Prompt 按钮');

    // 3. 全景驾驶舱浅入口直达独立大窗口
    assert(builtClient.includes('isHelpModalOpen'), '全景主页必须包含大窗口打开状态');
    assert(builtClient.includes('📖 使用指南'), '全景主页必须包含「📖 使用指南」直达按钮');

    // 4. 会话右侧栏浅入口直达独立大窗口
    assert(builtClient.includes('helpModalOpen'), '会话右侧栏必须包含独立大窗口状态');
    assert(builtClient.includes('onOpenHelp'), '会话右侧栏必须包含直达大窗口的 onOpenHelp 回调');
  });

  // ============================================================
  // 二、测试云端定时同步调度机制（右侧栏 + 首页通用）
  // ============================================================
  console.log('\n--- 2. Cloud Poller Lifecycle & Scheduling Invariants ---');

  test('云端定时调度机制契约完整：打开立即拉取，拉取结算后再计时，带息屏避让且彻底杜绝死循环', () => {
    // 1. 验证必须在拉取完成后（finally 块）才调用 scheduleNextCloudSync 启动计时
    assert(builtClient.includes('scheduleNextCloudSync();'), '拉取完成后必须启动下一次计时');
    // 2. 验证挂载与打开时，开启 SWR 或 开启云端定时均立即发起首屏同步
    assert(builtClient.includes('syncSettings.strategy === "swr" || syncSettings.strategy === "auto"'), '开启定时或SWR时首屏均立即拉新');
    // 3. 验证页面可见性检查（息屏避让）
    assert(builtClient.includes('document.visibilityState === "hidden"'), '必须具备窗口后台/息屏避让');
    assert(builtClient.includes('visibilitychange'), '必须监听可见性恢复');
    // 4. 验证组件卸载时清理定时器句柄防泄漏
    assert(builtClient.includes('clearTimeout(cloudTimerRef.current)'), '卸载时必须清除定时器防泄漏');
    // 5. 验证 dataRef 解耦，彻底消灭本地快照与同步中来回闪现的死循环
    assert(builtClient.includes('dataRef = React.useRef(data)'), '必须使用 dataRef 解耦闭包状态');
    assert(builtClient.includes('lastCwdRef'), '必须使用 lastCwdRef 拦截同一工作区伪切换重触发');
  });

  // ============================================================
  // 三、测试本地 Git 监控机制（右侧栏独占，首页坚决不加）
  // ============================================================
  console.log('\n--- 3. Local Git Watcher & Isolation Invariants ---');

  await asyncTest('后端 /api/github/git-watch 路由契约与非 Git 目录防御', async () => {
    const { registerActionRoutes } = await import('../lib/api/routes-actions.js');
    const registered = {};
    const deps = { bindRoute: (r) => { registered[r.path] = r.handler; } };
    registerActionRoutes(deps, exec, new (await import('../lib/cache.js')).TtlCache(1000), new (await import('../lib/cache.js')).TtlCache(1000));

    const watchHandler = registered['/api/github/git-watch'];
    assert(typeof watchHandler === 'function', 'git-watch 路由必须已注册');

    const localGitStatusHandler = registered['/api/github/local-git-status'];
    assert(typeof localGitStatusHandler === 'function', 'local-git-status 路由必须已注册');

    // 非 Git 目录测试
    const tempDir = path.join(os.tmpdir(), `dsh-watch-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      let status = 0;
      let body = '';
      await watchHandler(
        { method: 'GET', url: `/api/github/git-watch?cwd=${encodeURIComponent(tempDir)}`, on: () => {} },
        {
          setHeader() {},
          end(d) { body = d; },
          get statusCode() { return status; },
          set statusCode(v) { status = v; }
        }
      );
      assert.strictEqual(status, 400, '非 Git 目录必须返回 400 拒绝监听');
      assert(body.includes('非 Git 仓库'), '应提示非 Git 仓库');

      let lStatus = 0;
      let lBody = '';
      await localGitStatusHandler(
        { method: 'GET', url: `/api/github/local-git-status?cwd=${encodeURIComponent(tempDir)}` },
        {
          setHeader() {},
          end(d) { lBody = d; },
          get statusCode() { return lStatus; },
          set statusCode(v) { lStatus = v; }
        }
      );
      assert.strictEqual(lStatus, 400, 'local-git-status 面对非 Git 目录返回 400');
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  });

  test('架构隔离铁律：本地 Git 监控仅在右侧栏挂载，首页（全景驾驶舱）坚决不开启文件监控', () => {
    // 读取右侧栏与全景主页的代码段
    const rightbarCode = builtClient.slice(builtClient.indexOf('function GithubRightbarBody'), builtClient.indexOf('function GithubWorkspacePanel'));
    const panelCode = builtClient.slice(builtClient.indexOf('function GithubWorkspacePanel'));

    // 右侧栏必须包含 git-watch 长轮询与 localGitWatch 条件
    assert(rightbarCode.includes('/api/github/git-watch'), '右侧栏必须挂载本地 git-watch 监听');
    assert(rightbarCode.includes('localGitWatch'), '右侧栏受 localGitWatch 门控');

    // 动静解耦：git-watch 变动时必须调用 refreshLocalGit 纯本地刷新，严禁调用 loadData 连带拉取远端
    assert(rightbarCode.includes('refreshLocalGit();'), 'git-watch changed 时必须局部调用 refreshLocalGit');
    assert(rightbarCode.includes('/api/github/local-git-status'), '前端包含 local-git-status 局部端点调用');

    // 网络弹性：全景面板与右侧栏必须监听 window online 自愈
    assert(rightbarCode.includes('addEventListener("online"'), '右侧栏必须监听 online 网络恢复自愈');
    assert(panelCode.includes('addEventListener("online"'), '全景主页必须监听 online 网络恢复自愈');

    // 首页（全景主页）坚决不包含任何 git-watch 调用
    assert(!panelCode.includes('/api/github/git-watch'), '全景首页坚决不能包含任何 git-watch 调用，保持轻量');
    assert(panelCode.includes('首页坚决不挂载任何文件监控'), '首页必须明确注释不挂载文件监控');
  });

  console.log('\n========================================');
  console.log(`Phase 13 Test Result: ${passed}/${total} assertions PASSED!`);
  console.log('========================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
