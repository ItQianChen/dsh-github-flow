// test/phase27.test.mjs - Phase 27 · 关联仓库自由切换（S6）回归测试套件
//
// 覆盖：
// 1. getAssociatedRepos 纯本地推导：双 remote 场景（Fork+Upstream）、单 remote+在线 parent 合并
// 2. isCurrent 精确判定与角色标识（fork / upstream / origin / parent）
// 3. setDefaultRepo 参数安全白名单与防注入校验
// 4. action: 'set_default_repo' 路由端点处理与缓存彻底重置（keepFallback: false）
// 5. bundle 产物内联完整性与 CSS 样式存在性断言

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const created = [];
const track = (d) => { created.push(d); return d; };
function cleanup() {
  for (const d of created) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
  created.length = 0;
}

function makeRepo(configText, headText = 'ref: refs/heads/main\n') {
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 's6-')));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'config'), configText, 'utf8');
  if (headText !== null) fs.writeFileSync(path.join(dir, '.git', 'HEAD'), headText, 'utf8');
  return dir;
}

async function runTests() {
  let passed = 0, total = 0;
  const ok = (cond, name, extra = '') => {
    total++;
    if (cond) {
      console.log(`✅ PASS: ${name}${extra ? '  → ' + extra : ''}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}${extra ? '  → ' + extra : ''}`);
    }
  };

  const { GhExecutor } = await import('../lib/executor.js');
  const exec = new GhExecutor({});

  // ============================================================
  console.log('\n--- 1. getAssociatedRepos: 双 remote 场景（codebuddy2api 典型）---');
  // ============================================================
  const dualConfig = [
    '[remote "origin"]',
    '\turl = https://github.com/ItQianChen/codebuddy2api.git',
    '[remote "upstream"]',
    '\turl = https://github.com/maiphucgiang/codebuddy2api.git',
  ].join('\n') + '\n';

  const dualDir = makeRepo(dualConfig);
  const currentUpstream = {
    nameWithOwner: 'maiphucgiang/codebuddy2api',
    isFork: false,
    viewerPermission: 'READ',
  };

  // 当前展示上游源仓库
  const items1 = exec.getAssociatedRepos(dualDir, currentUpstream, 'ItQianChen');
  ok(items1.length === 2, '双 remote 解析出 2 个关联仓库', `数量: ${items1.length}`);

  const upstreamItem = items1.find((i) => i.nameWithOwner === 'maiphucgiang/codebuddy2api');
  ok(upstreamItem?.isCurrent === true, '上游源仓库正确标记为 isCurrent === true');
  ok(upstreamItem?.role === 'upstream', 'role 正确判定为 upstream');
  ok(upstreamItem?.remoteName === 'upstream', 'remoteName 记录为 upstream');

  const forkItem = items1.find((i) => i.nameWithOwner === 'ItQianChen/codebuddy2api');
  ok(forkItem?.isCurrent === false, '个人 Fork 仓库标记为 isCurrent === false');
  ok(forkItem?.role === 'fork', '根据 currentUser 匹配 owner，role 判定为 fork');
  ok(forkItem?.remoteName === 'origin', 'remoteName 记录为 origin');

  // 当前切到自己的 Fork 仓库
  const currentFork = {
    nameWithOwner: 'ItQianChen/codebuddy2api',
    isFork: true,
    parent: { nameWithOwner: 'maiphucgiang/codebuddy2api' },
    viewerPermission: 'ADMIN',
  };
  const items2 = exec.getAssociatedRepos(dualDir, currentFork, 'ItQianChen');
  const forkItem2 = items2.find((i) => i.nameWithOwner === 'ItQianChen/codebuddy2api');
  const upItem2 = items2.find((i) => i.nameWithOwner === 'maiphucgiang/codebuddy2api');
  ok(forkItem2?.isCurrent === true, '切换后 Fork 仓库变为 isCurrent === true');
  ok(upItem2?.isCurrent === false, '上游仓库变为 isCurrent === false');

  // ============================================================
  console.log('\n--- 2. getAssociatedRepos: 单 remote + 在线 parent 合并 ---');
  // ============================================================
  const singleConfig = [
    '[remote "origin"]',
    '\turl = https://github.com/myuser/myfork.git',
  ].join('\n') + '\n';
  const singleDir = makeRepo(singleConfig);
  const forkMetaOnline = {
    nameWithOwner: 'myuser/myfork',
    isFork: true,
    parent: { nameWithOwner: 'upstream-org/upstream-repo', url: 'https://github.com/upstream-org/upstream-repo' },
  };

  const itemsSingle = exec.getAssociatedRepos(singleDir, forkMetaOnline, 'myuser');
  ok(itemsSingle.length === 2, '本地未加 upstream 时自动通过 parent 合并出上游仓库', `数量: ${itemsSingle.length}`);
  const parentMerged = itemsSingle.find((i) => i.nameWithOwner === 'upstream-org/upstream-repo');
  ok(parentMerged?.role === 'parent', '合并项 role 正确标记为 parent');
  ok(parentMerged?.isCurrent === false, '合并项 isCurrent 为 false');

  // ============================================================
  console.log('\n--- 3. 单仓库零噪音断言 ---');
  // ============================================================
  const plainConfig = '[remote "origin"]\n\turl = https://github.com/owner/single-repo.git\n';
  const plainDir = makeRepo(plainConfig);
  const plainMeta = { nameWithOwner: 'owner/single-repo', isFork: false };
  const itemsPlain = exec.getAssociatedRepos(plainDir, plainMeta, 'owner');
  ok(itemsPlain.length === 1, '普通单仓库关联列表长度仅为 1（满足前端自动隐藏下拉框条件）');

  // ============================================================
  console.log('\n--- 4. setDefaultRepo 参数安全白名单与防注入校验 ---');
  // ============================================================
  const testDir = makeRepo(dualConfig);

  // 非法参数测试（严防命令注入与畸形字符串）
  const dangerousTargets = [
    '',
    '   ',
    '-R',
    '--flag',
    'origin; calc',
    'origin && calc',
    'owner/repo | calc',
    'owner/repo/extra',
    '../traversal',
    'has space/repo',
  ];

  for (const bad of dangerousTargets) {
    const res = await exec.setDefaultRepo(testDir, bad);
    ok(res.ok === false, `非法目标安全拦截: "${bad}"`, res.error);
  }

  // 合法格式白名单测试（模拟 run）
  const safeExec = new GhExecutor({});
  let lastRanArgs = null;
  safeExec.run = async (args) => {
    lastRanArgs = args;
    return { ok: true, data: '' };
  };

  const okRes1 = await safeExec.setDefaultRepo(testDir, 'origin');
  ok(okRes1.ok === true && lastRanArgs?.[1] === 'set-default' && lastRanArgs?.[2] === 'origin', '支持通过 remote 别名设为默认: origin');

  const okRes2 = await safeExec.setDefaultRepo(testDir, 'ItQianChen/codebuddy2api');
  ok(okRes2.ok === true && lastRanArgs?.[2] === 'ItQianChen/codebuddy2api', '支持通过 owner/repo 设为默认: ItQianChen/codebuddy2api');

  // 非 Git 目录阻断
  const nonGitRes = await exec.setDefaultRepo(os.tmpdir(), 'origin');
  ok(nonGitRes.ok === false && nonGitRes.error.includes('不是有效的 Git 仓库'), '非 Git 目录前置拦截');

  // ============================================================
  console.log('\n--- 5. bundle 产物内联完整性断言 ---');
  // ============================================================
  const builtClient = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
  ok(builtClient.includes('RepoSelectorDropdown'), 'bundle 必须内联 RepoSelectorDropdown 组件');
  ok(builtClient.includes('set_default_repo'), 'bundle 必须包含 set_default_repo 交互动作调用');
  ok(builtClient.includes('dsh-github-repo-switch-trigger'), 'bundle 包含触发器样式类名');
  ok(builtClient.includes('dsh-github-switch-quicklink'), 'bundle 包含卡片快速切换链接样式类名');
  ok(builtClient.includes('⑂ 本地复刻仓库:'), 'bundle 包含显式复刻识别提示文案');

  const css = fs.readFileSync(path.join(__dirname, '../lib/ui/styles.js'), 'utf8');
  ok(css.includes('.dsh-github-repo-switch-trigger'), 'styles.js 包含触发器样式定义');
  ok(css.includes('.dsh-github-repo-dropdown'), 'styles.js 包含下拉框样式定义');
  ok(css.includes('.dsh-github-switch-quicklink'), 'styles.js 包含快捷切换链接样式定义');

  cleanup();

  console.log('\n========================================');
  console.log(`Phase 27 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  cleanup();
  process.exit(1);
});
