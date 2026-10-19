// test/phase22.test.mjs - Phase 22 · remote 指纹缓存失效（S1）回归测试套件
//
// 背景：缓存失效原先用「解析出的仓库身份」比对字符串，而解析器在多 remote 布局下
// 会取错 [remote] 段（取第一个 github.com 匹配，而非 git 的 branch.<name>.remote → origin），
// 导致身份恒失配 → 缓存永久不命中 → 每次请求重拉 6 个 gh 子进程。
// S1 改为比对 remote 配置指纹：只回答「配置变没变」，不依赖任何语义解析。
//
// 覆盖：
// 1. parseRemoteUrls 只扫 [remote] 段（submodule 段不得混入）
// 2. getRemoteFingerprint 对书写顺序 / remote 数量 / 命名方式免疫
// 3. worktree（.git 为文件）能解析出指纹
// 4. TtlCache 指纹命中 / 失配作废 / 缺失保守
// 5. 路由层：双 remote 下缓存命中（防回归核心）
// 6. clear({ keepFallback: false }) 同时清指纹

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const created = [];

/** 创建一个带指定 config 的临时「仓库」，返回路径。不依赖 git 命令。 */
function makeFakeRepo(configText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-'));
  created.push(dir);
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'config'), configText, 'utf8');
  return dir;
}

function cleanup() {
  for (const d of created) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
  created.length = 0;
}

async function runTests() {
  let passed = 0;
  let total = 0;

  function assertAs(cond, name) {
    total++;
    if (cond) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
    }
  }

  const { GhExecutor, parseRemoteUrls } = await import('../lib/executor.js');
  const { TtlCache } = await import('../lib/cache.js');
  const exec = new GhExecutor({});

  // ============================================================
  console.log('\n--- 1. parseRemoteUrls 只扫 [remote] 段 ---');
  // ============================================================

  const cfgWithSubmodule = `[core]
\trepositoryformatversion = 0
[remote "origin"]
\turl = https://github.com/a/b.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
[submodule "lib"]
\turl = https://github.com/x/y.git
`;
  const urls1 = parseRemoteUrls(cfgWithSubmodule);
  assertAs(urls1.length === 1, 'submodule 段的 url 不得混入（核心：避免 submodule add 触发缓存作废）');
  assertAs(urls1[0] === 'https://github.com/a/b.git', '只取到 remote 段的 origin url');

  const cfgTwoRemotes = `[remote "upstream"]
\turl = https://github.com/maiphucgiang/codebuddy2api.git
[remote "origin"]
\turl = https://github.com/ItQianChen/codebuddy2api.git
`;
  const urls2 = parseRemoteUrls(cfgTwoRemotes);
  assertAs(urls2.length === 2, '双 remote 全部提取');
  assertAs(urls2[0].includes('maiphucgiang'), '保持文件出现顺序（排序交给调用方）');

  const cfgSSH = `[remote "origin"]
\turl = git@github.com:a/b.git
[remote "mirror"]
\turl = ssh://git@github.com/a/b-mirror.git
`;
  assertAs(parseRemoteUrls(cfgSSH).length === 2, 'SSH / ssh:// 形态均能提取');

  // 带引号的值：git 解析时会剥掉引号，指纹也必须剥，否则「加不加引号」
  // 这种语义等价的改动会触发无谓的缓存作废
  const cfgQuoted = '[remote "origin"]\n\turl = "https://github.com/a/b.git"\n';
  assertAs(
    parseRemoteUrls(cfgQuoted)[0] === 'https://github.com/a/b.git',
    '带引号的 url 值必须剥掉引号（与 git 解析口径一致）'
  );

  assertAs(parseRemoteUrls('').length === 0, '空 config 返回空数组');
  assertAs(parseRemoteUrls('[core]\n\tbare = false\n').length === 0, '无 remote 段返回空数组');

  // 段头前缀陷阱：`[remote-tracking]` 以 `remote` 开头但语义无关。
  // 用 \b 判定会误收（`-` 是非单词字符，会被当成词边界），必须用前瞻断言。
  assertAs(
    parseRemoteUrls('[remote-tracking]\n\turl = https://github.com/a/b.git\n').length === 0,
    '[remote-tracking] 段不得被当成 remote 段（前缀陷阱）'
  );
  assertAs(
    parseRemoteUrls('[remotes]\n\turl = https://github.com/a/b.git\n').length === 0,
    '[remotes] 段不得被当成 remote 段'
  );
  assertAs(
    parseRemoteUrls('[remote.origin]\n\turl = https://github.com/a/b.git\n').length === 1,
    '[remote.origin] 点号旧语法应被收录'
  );

  // ============================================================
  console.log('\n--- 2. getRemoteFingerprint 语义 ---');
  // ============================================================

  const repoA = makeFakeRepo(cfgTwoRemotes);
  const fpA = exec.getRemoteFingerprint(repoA);
  assertAs(typeof fpA === 'string' && fpA.length === 12, '指纹为 12 位十六进制');

  // 书写顺序调换：upstream 在后、origin 在前 —— 指纹必须相同
  const cfgReordered = `[remote "origin"]
\turl = https://github.com/ItQianChen/codebuddy2api.git
[remote "upstream"]
\turl = https://github.com/maiphucgiang/codebuddy2api.git
`;
  const repoB = makeFakeRepo(cfgReordered);
  assertAs(exec.getRemoteFingerprint(repoB) === fpA, '书写顺序调换后指纹不变（排序免疫）');

  // remote 改名但 url 不变 —— 指纹必须相同（命名方式不影响「配置变没变」）
  const cfgRenamed = `[remote "fork"]
\turl = https://github.com/ItQianChen/codebuddy2api.git
[remote "up"]
\turl = https://github.com/maiphucgiang/codebuddy2api.git
`;
  const repoC = makeFakeRepo(cfgRenamed);
  assertAs(exec.getRemoteFingerprint(repoC) === fpA, 'remote 改名但 url 集合不变 → 指纹不变');

  // 改动 url —— 指纹必须变化
  const cfgChanged = cfgTwoRemotes.replace('ItQianChen/codebuddy2api', 'OtherOrg/codebuddy2api');
  const repoD = makeFakeRepo(cfgChanged);
  assertAs(exec.getRemoteFingerprint(repoD) !== fpA, '改动 url 后指纹变化');

  // 新增无关 remote —— 指纹必须变化（这是「配置变了」的定义）
  const cfgAdded = cfgTwoRemotes + `[remote "third"]\n\turl = https://github.com/z/z.git\n`;
  const repoE = makeFakeRepo(cfgAdded);
  assertAs(exec.getRemoteFingerprint(repoE) !== fpA, '新增 remote 后指纹变化');

  // 子模块变化 —— 指纹必须不变
  const cfgSub = cfgTwoRemotes + `[submodule "x"]\n\turl = https://github.com/z/z.git\n`;
  const repoF = makeFakeRepo(cfgSub);
  assertAs(exec.getRemoteFingerprint(repoF) === fpA, 'submodule 段变化不影响指纹');

  // ============================================================
  console.log('\n--- 3. 异常与边界：不得抛错，返回 null ---');
  // ============================================================

  const notGit = fs.mkdtempSync(path.join(os.tmpdir(), 'nongit-'));
  created.push(notGit);
  assertAs(exec.getRemoteFingerprint(notGit) === null, '非 Git 目录返回 null');

  const noRemote = makeFakeRepo('[core]\n\tbare = false\n');
  const noRemoteFp = exec.getRemoteFingerprint(noRemote);
  // 「读到了、但没有任何 remote」是一个确定事实，必须与「读不到配置」区分开：
  // 前者要返回指纹（空集合的哈希），否则用户删光 remote 后指纹恒为 null，
  // 旧快照再也无法失效。后者才返回 null。
  assertAs(typeof noRemoteFp === 'string' && noRemoteFp.length === 12, '无 remote 但 config 可读 → 返回空集合指纹（不是 null）');

  // 删光 remote 必须能让旧缓存失效
  const cNoRemote = new TtlCache(100000);
  const repoWithRemote = makeFakeRepo('[remote "origin"]\n\turl = https://github.com/a/b.git\n');
  cNoRemote.set(repoWithRemote, { repo: { nameWithOwner: 'a/b' } }, Date.now(), exec.getRemoteFingerprint(repoWithRemote));
  fs.writeFileSync(path.join(repoWithRemote, '.git', 'config'), '[core]\n\tbare = false\n', 'utf8');
  assertAs(
    cNoRemote.invalidateIfFingerprintChanged(repoWithRemote, exec.getRemoteFingerprint(repoWithRemote)) === true,
    '删除全部 remote 后缓存必须失效（否则旧身份永久冻结）'
  );

  const repoBroken = makeFakeRepo(cfgTwoRemotes);
  fs.rmSync(path.join(repoBroken, '.git', 'config'));
  assertAs(exec.getRemoteFingerprint(repoBroken) === null, 'config 不存在返回 null（不抛错）');

  // ============================================================
  console.log('\n--- 4. worktree（.git 为文件）能解析出指纹 ---');
  // ============================================================

  function tryGit(args, cwd) {
    try {
      // stdio: 'ignore' 而非 'pipe'：本仓库的 DSH 沙箱禁止子进程管道
      // （Node spawn + stdio pipe 会 EPERM），而本用例只需要「命令执行成功」
      // 这个事实，不需要捕获输出。
      execFileSync('git', args, { cwd, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  const wtBase = fs.mkdtempSync(path.join(os.tmpdir(), 'wtbase-'));
  created.push(wtBase);
  const mainRepo = path.join(wtBase, 'main');
  fs.mkdirSync(mainRepo);

  const gitOk =
    tryGit(['init', '-q'], mainRepo) &&
    tryGit(['config', 'user.email', 't@t.com'], mainRepo) &&
    tryGit(['config', 'user.name', 't'], mainRepo) &&
    tryGit(['remote', 'add', 'origin', 'https://github.com/a/b.git'], mainRepo);
  fs.writeFileSync(path.join(mainRepo, 'f.txt'), 'x');
  const commitOk = gitOk && tryGit(['add', '-A'], mainRepo) && tryGit(['commit', '-q', '-m', 'init'], mainRepo);
  const wtPath = path.join(wtBase, 'wt');
  const wtOk = commitOk && tryGit(['worktree', 'add', '-q', wtPath, '-b', 'feat'], mainRepo);

  if (wtOk) {
    assertAs(fs.statSync(path.join(wtPath, '.git')).isFile(), '.git 在 worktree 下确实是文件');
    const wtFp = exec.getRemoteFingerprint(wtPath);
    const mainFp = exec.getRemoteFingerprint(mainRepo);
    assertAs(typeof wtFp === 'string' && wtFp.length === 12, 'worktree 能解析出指纹（不因 .git 是文件而失效）');
    assertAs(wtFp === mainFp, 'worktree 与主仓库共享 config → 指纹一致');
  } else {
    // 沙箱禁止 spawn git 时跳过：显式标注 SKIP，绝不计入通过数（虚报绿色比红更糟）
    total += 2;
    console.log('⏭️  SKIP: 当前环境无法执行 git 命令，worktree 两项用例跳过');
  }

  // ============================================================
  console.log('\n--- 5. TtlCache 指纹命中 / 失配 / 缺失 ---');
  // ============================================================

  const c1 = new TtlCache(100000);
  const now = Date.now();
  c1.set('k', { repo: { nameWithOwner: 'a/b' } }, now, 'fp-aaa');
  assertAs(c1.matchesFingerprint('k', 'fp-aaa') === true, '指纹一致 → 命中');
  assertAs(c1.invalidateIfFingerprintChanged('k', 'fp-aaa') === false, '指纹一致 → 不作废');
  assertAs(c1.getFallback('k') !== undefined, '未作废时容灾底座仍在');

  assertAs(c1.invalidateIfFingerprintChanged('k', 'fp-bbb') === true, '指纹失配 → 作废');
  assertAs(c1.getFallback('k') === undefined, '作废后容灾底座同步清除');
  assertAs(c1.get('k', now) === undefined, '作废后活动缓存同步清除');

  const c2 = new TtlCache(100000);
  c2.set('k', { repo: {} }, now, 'fp-aaa');
  // set(null) 必须保留旧指纹：null 的含义是「这次没读到」，不是「没有 remote」。
  // 若把 null 当清除，一次瞬时读取失败就永久抹掉失效检测能力。
  c2.set('k', { repo: {} }, now + 1, null);
  assertAs(c2.invalidateIfFingerprintChanged('k', 'fp-bbb') === true, 'set(null) 后旧指纹仍在 → remote 变更依然能被检出');
  assertAs(c2.invalidateIfFingerprintChanged('k', null) === false, '当前指纹为 null → 保守不作废');

  const c3 = new TtlCache(100000);
  c3.set('k', { repo: {} }, now); // 未提供指纹
  assertAs(c3.invalidateIfFingerprintChanged('k', 'fp-xyz') === false, '缓存未记录指纹 → 保守不作废');

  // clear 语义
  const c4 = new TtlCache(100000);
  c4.set('k', { repo: {} }, now, 'fp-aaa');
  c4.clear();
  assertAs(c4.getFallback('k') !== undefined, 'clear() 默认保留容灾底座');
  assertAs(c4.matchesFingerprint('k', 'fp-aaa') === true, 'clear() 默认保留指纹（底座仍在，指纹必须跟着留）');

  const c5 = new TtlCache(100000);
  c5.set('k', { repo: {} }, now, 'fp-aaa');
  c5.clear({ keepFallback: false });
  assertAs(c5.getFallback('k') === undefined, 'clear({keepFallback:false}) 清空容灾底座');
  assertAs(c5.matchesFingerprint('k', 'fp-aaa') === true, '指纹清空后 matchesFingerprint 走缺失分支（保守 true）');

  // ============================================================
  console.log('\n--- 6. 路由层：双 remote 下缓存命中（防回归核心）---');
  // ============================================================

  const { registerOverviewRoutes } = await import('../lib/api/routes-overview.js');

  const repoDir = makeFakeRepo(cfgTwoRemotes);
  const cache = new TtlCache(100000);

  const mockExec = new GhExecutor();
  // 让身份解析返回 fork（真实行为），但缓存失效不得依赖它
  mockExec.getRepoIdentityFromLocal = () => ({
    nameWithOwner: 'ItQianChen/codebuddy2api',
    name: 'codebuddy2api',
    owner: 'ItQianChen',
    defaultBranch: 'main',
    url: 'https://github.com/ItQianChen/codebuddy2api',
  });
  let ghCallCount = 0;
  mockExec.checkAuth = async () => ({ installed: true, loggedIn: true, user: 't' });
  mockExec.getRepoMetadata = async () => ({
    nameWithOwner: 'ItQianChen/codebuddy2api',
    name: 'codebuddy2api',
    owner: 'ItQianChen',
    defaultBranch: 'main',
    url: 'https://github.com/ItQianChen/codebuddy2api',
  });
  mockExec.run = async (args) => {
    ghCallCount++;
    if (args.includes('pr') && args.includes('list')) return { ok: true, data: [] };
    if (args.includes('issue') && args.includes('list')) return { ok: true, data: [] };
    if (args.includes('run') && args.includes('list')) return { ok: true, data: [] };
    return { ok: true, data: [] };
  };
  mockExec.getLocalGitStatus = async () => null;
  mockExec.getGitCommitLog = async () => null;
  mockExec.getGitBranches = async () => null;

  const registered = {};
  registerOverviewRoutes(
    { bindRoute: (r) => (registered[r.path] = r.handler) },
    mockExec,
    cache,
    new TtlCache(10000),
    { getQuickStatus: () => null }
  );
  const handler = registered['/api/github/overview'];

  async function callOnce() {
    let out = null;
    await handler(
      { method: 'GET', url: `/api/github/overview?cwd=${encodeURIComponent(repoDir)}` },
      { setHeader() {}, end(s) { out = JSON.parse(s); } }
    );
    return out;
  }

  const r1 = await callOnce();
  const r2 = await callOnce();
  const r3 = await callOnce();
  assertAs(r1.fromCache !== true, '第 1 次请求走真实拉取');
  assertAs(r2.fromCache === true, '第 2 次请求命中缓存（旧实现此处必然失配）');
  assertAs(r3.fromCache === true, '第 3 次请求命中缓存（旧实现此处必然失配）');

  // 改 remote → 必须作废
  fs.writeFileSync(
    path.join(repoDir, '.git', 'config'),
    cfgTwoRemotes.replace('ItQianChen/codebuddy2api', 'OtherOrg/codebuddy2api'),
    'utf8'
  );
  const r4 = await callOnce();
  assertAs(r4.fromCache !== true, '改动 remote url 后下一次请求必然重新拉取（指纹变化生效）');

  // 再加 return: 失效后重新命中
  const r5 = await callOnce();
  assertAs(r5.fromCache === true, '作废并重拉后再次命中（没有陷入永久失效）');

  cleanup();

  console.log(`\n========================================`);
  console.log(`Phase 22 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log(`========================================`);
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  cleanup();
  process.exit(1);
});
