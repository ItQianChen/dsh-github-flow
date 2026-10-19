// test/phase23.test.mjs - Phase 23 · 离线身份解析对齐 git 规则（S2）回归测试套件
//
// 背景：旧实现用「取 .git/config 里第一个 github.com 匹配」定位仓库身份，
// 而 git 认的是 branch.<当前分支>.remote → origin。在
// `git remote rename origin upstream` + `git remote add origin <fork>` 布局下
// 旧实现会取到上游仓库（实测），导致面板与全局驾驶舱显示错归属。
//
// 覆盖：
// 1. parseGitConfig：remote/branch 段解析、HEAD 分支提取、detached 处理
// 2. resolveRemoteTarget：branch.remote → origin → 首个 三级回落，以及 "." 特殊值
// 3. parseGithubUrl：6 种 URL 形态 + 非 GitHub host 拒绝
// 4. getRepoIdentityFromLocal：双 remote 布局、顺序免疫、worktree 分离
// 5. getRepoMetadata 离线兜底与 getRepoIdentityFromLocal 结论一致
// 6. 静态断言：旧「取第一个 github.com」正则已彻底移除

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const created = [];
function track(d) {
  created.push(d);
  return d;
}
function cleanup() {
  for (const d of created) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
  created.length = 0;
}

/** 构造一个只含 .git/config（与可选 HEAD）的假仓库 */
function makeRepo(configText, headText = 'ref: refs/heads/main\n') {
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 's2-')));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'config'), configText, 'utf8');
  if (headText !== null) fs.writeFileSync(path.join(dir, '.git', 'HEAD'), headText, 'utf8');
  return dir;
}

async function runTests() {
  let passed = 0;
  let total = 0;
  const ok = (cond, name) => {
    total++;
    if (cond) { console.log(`✅ PASS: ${name}`); passed++; }
    else console.error(`❌ FAIL: ${name}`);
  };

  const { GhExecutor, parseGitConfig, resolveRemoteTarget, parseGithubUrl } = await import('../lib/executor.js');
  const exec = new GhExecutor({});

  // ============================================================
  console.log('\n--- 1. parseGitConfig：段解析与 HEAD ---');
  // ============================================================

  const cfgBasic = `[core]
\trepositoryformatversion = 0
[remote "origin"]
\turl = https://github.com/ItQianChen/codebuddy2api.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
\tremote = origin
\tmerge = refs/heads/main
`;
  const p1 = parseGitConfig(cfgBasic, 'ref: refs/heads/main\n');
  ok(p1.remotes.length === 1 && p1.remotes[0].name === 'origin', '解析出 origin remote');
  ok(p1.currentBranch === 'main', 'HEAD 提取当前分支 main');
  ok(p1.branchRemote === 'origin', '解析出 branch.main.remote = origin');

  const p2 = parseGitConfig(cfgBasic, '761692f5fd41e62f6e0777f20c75312d27342878\n');
  ok(p2.currentBranch === null, 'detached HEAD（40 位 sha）→ currentBranch 为 null');
  ok(p2.branchRemote === null, 'detached 时 branchRemote 为 null');

  const p3 = parseGitConfig(cfgBasic, null);
  ok(p3.currentBranch === null && p3.branchRemote === null, 'HEAD 缺失时不抛错，分支信息为 null');

  // 点号旧语法段头
  const cfgDotted = '[remote.origin]\n\turl = https://github.com/a/b.git\n';
  const p4 = parseGitConfig(cfgDotted, null);
  ok(p4.remotes.length === 1 && p4.remotes[0].name === 'origin', '[remote.origin] 点号语法可解析');

  // remote-tracking 前缀陷阱
  const cfgTrap = '[remote-tracking]\n\turl = https://github.com/x/y.git\n';
  ok(parseGitConfig(cfgTrap, null).remotes.length === 0, '[remote-tracking] 不被当成 remote 段');

  // 引号剥离
  const cfgQuoted = '[remote "origin"]\n\turl = "https://github.com/a/b.git"\n';
  ok(parseGitConfig(cfgQuoted, null).remotes[0].url === 'https://github.com/a/b.git', 'url 值的成对引号被剥离');

  // 同 remote 多 url 行：身份取首个，指纹收集全集。
  // 若两者都用「按名字去重」，备用 url 变化会静默漏检（实测过）。
  const cfgMultiUrl = '[remote "origin"]\n\turl = https://github.com/a/b.git\n\turl = https://github.com/a/backup.git\n';
  const pMulti = parseGitConfig(cfgMultiUrl, null);
  ok(pMulti.remotes.length === 1 && pMulti.remotes[0].url === 'https://github.com/a/b.git', '同 remote 多 url：身份取首个（与 git 一致）');
  ok(pMulti.allUrls.length === 2, '同 remote 多 url：allUrls 收集全部（指纹需要）');

  // 行尾注释：git 会剥掉（实测 `;` 与 `#` 即使紧贴前置内容也算注释起点）。
  // 不剥会导致 `url = ... ; note` 这类手写配置解析失败。
  const commentCases = [
    ['分号注释', 'https://github.com/a/b.git ; note'],
    ['井号注释', 'https://github.com/a/b.git # note'],
    ['紧贴分号', 'https://github.com/a/b.git;note'],
    ['引号后注释', '"https://github.com/a/b.git" ; note'],
  ];
  for (const [label, value] of commentCases) {
    const u = parseGitConfig(`[remote "origin"]\n\turl = ${value}\n`, null).remotes[0]?.url;
    ok(u === 'https://github.com/a/b.git', `行尾注释剥离：${label}`);
  }
  // 引号内的注释符是字面值（密码含 # 的场景）
  const pwUrl = parseGitConfig('[remote "origin"]\n\turl = "https://user:p#ss@github.com/a/b.git"\n', null).remotes[0]?.url;
  ok(pwUrl === 'https://user:p#ss@github.com/a/b.git', '引号内的 # 是字面值，不得当注释剥掉');

  // ============================================================
  console.log('\n--- 2. resolveRemoteTarget：三级回落 ---');
  // ============================================================

  const cfgTwoRemotes = `[remote "upstream"]
\turl = https://github.com/maiphucgiang/codebuddy2api.git
[remote "origin"]
\turl = https://github.com/ItQianChen/codebuddy2api.git
`;
  // 核心场景：upstream 段写在 origin 段之前
  const t1 = resolveRemoteTarget(parseGitConfig(cfgTwoRemotes, 'ref: refs/heads/main\n'));
  ok(t1?.name === 'origin', '无 branch 配置时回落到 origin（即使 upstream 段写在前面）');

  // branch.<name>.remote 指向 upstream 时，应以它为准
  const cfgBranchUpstream = cfgTwoRemotes + '[branch "main"]\n\tremote = upstream\n';
  const t2 = resolveRemoteTarget(parseGitConfig(cfgBranchUpstream, 'ref: refs/heads/main\n'));
  ok(t2?.name === 'upstream', 'branch.main.remote=upstream 时以 branch 配置为准');

  // branch.<name>.remote 指向不存在的 remote → 回落 origin
  const cfgBranchGhost = cfgTwoRemotes + '[branch "main"]\n\tremote = ghost\n';
  const t3 = resolveRemoteTarget(parseGitConfig(cfgBranchGhost, 'ref: refs/heads/main\n'));
  ok(t3?.name === 'origin', 'branch 指向不存在的 remote 时回落 origin');

  // 特殊值 "."
  const cfgDot = cfgTwoRemotes + '[branch "main"]\n\tremote = .\n';
  const t4 = resolveRemoteTarget(parseGitConfig(cfgDot, 'ref: refs/heads/main\n'));
  ok(t4?.name === 'origin', 'branch.remote="." 时跳过该值，回落 origin');

  // 无 origin
  const cfgNoOrigin = '[remote "upstream"]\n\turl = https://github.com/u/u.git\n';
  const t5 = resolveRemoteTarget(parseGitConfig(cfgNoOrigin, 'ref: refs/heads/main\n'));
  ok(t5?.name === 'upstream', '无 origin 时取第一个 remote');

  ok(resolveRemoteTarget(parseGitConfig('', null)) === null, '无任何 remote 时返回 null');

  // ============================================================
  console.log('\n--- 3. parseGithubUrl：URL 形态 ---');
  // ============================================================

  const urlCases = [
    ['https://github.com/ItQianChen/codebuddy2api.git', 'ItQianChen/codebuddy2api'],
    ['https://github.com/ItQianChen/codebuddy2api', 'ItQianChen/codebuddy2api'],
    ['git@github.com:ItQianChen/codebuddy2api.git', 'ItQianChen/codebuddy2api'],
    ['ssh://git@github.com/ItQianChen/codebuddy2api.git', 'ItQianChen/codebuddy2api'],
    ['https://user:token@github.com/ItQianChen/codebuddy2api.git', 'ItQianChen/codebuddy2api'],
    ['https://github.com/ItQianChen/codebuddy2api.git/', 'ItQianChen/codebuddy2api'],
  ];
  for (const [url, want] of urlCases) {
    const r = parseGithubUrl(url);
    const got = r ? `${r.owner}/${r.repo}` : null;
    ok(got === want, `URL 形态：${url.slice(0, 46)} → ${want}`);
  }

  const rejectCases = [
    'https://gitlab.com/a/b.git',
    'https://ghe.company.com/a/b.git',
    'https://github.com.evil.com/a/b.git',
    'https://notgithub.com/a/b.git',
    'https://github.com/onlyowner',
  ];
  for (const url of rejectCases) {
    ok(parseGithubUrl(url) === null, `非 GitHub host 拒绝：${url.slice(0, 46)}`);
  }
  ok(parseGithubUrl('') === null && parseGithubUrl(null) === null, '空值/null 返回 null 不抛错');

  // ============================================================
  console.log('\n--- 4. getRepoIdentityFromLocal：双 remote 与顺序免疫（核心修复）---');
  // ============================================================

  const repoDual = makeRepo(cfgTwoRemotes);
  const idDual = exec.getRepoIdentityFromLocal(repoDual);
  ok(idDual?.nameWithOwner === 'ItQianChen/codebuddy2api', `双 remote（upstream 在前）→ 解析出 fork，实际：${idDual?.nameWithOwner}`);

  // 顺序反过来必须同样结论
  const cfgReversed = `[remote "origin"]
\turl = https://github.com/ItQianChen/codebuddy2api.git
[remote "upstream"]
\turl = https://github.com/maiphucgiang/codebuddy2api.git
`;
  const idRev = exec.getRepoIdentityFromLocal(makeRepo(cfgReversed));
  ok(idRev?.nameWithOwner === 'ItQianChen/codebuddy2api', 'remote 书写顺序不影响结论（顺序免疫）');

  // 模拟 rename origin→upstream 后 add origin
  const cfgRenamed = `[remote "upstream"]
\turl = https://github.com/maiphucgiang/codebuddy2api.git
[remote "origin"]
\turl = https://github.com/ItQianChen/codebuddy2api.git
[branch "main"]
\tremote = origin
`;
  const idRenamed = exec.getRepoIdentityFromLocal(makeRepo(cfgRenamed));
  ok(idRenamed?.nameWithOwner === 'ItQianChen/codebuddy2api', 'rename origin→upstream 布局下解析出 fork');

  // Tier 2：GHE 作 origin、GitHub 作 upstream
  const cfgGhe = `[remote "origin"]
\turl = https://ghe.company.com/a/b.git
[remote "upstream"]
\turl = https://github.com/up/stream.git
`;
  const idGhe = exec.getRepoIdentityFromLocal(makeRepo(cfgGhe));
  ok(idGhe?.nameWithOwner === 'up/stream', 'GHE 作 origin 时 Tier2 兜底找到 GitHub upstream');

  // 全 GHE → null
  const cfgAllGhe = '[remote "origin"]\n\turl = https://ghe.company.com/a/b.git\n';
  ok(exec.getRepoIdentityFromLocal(makeRepo(cfgAllGhe)) === null, '全部为非 GitHub host → null（不猜测）');

  // 非 Git 目录
  const plain = track(fs.mkdtempSync(path.join(os.tmpdir(), 's2plain-')));
  ok(exec.getRepoIdentityFromLocal(plain) === null, '非 Git 目录返回 null');

  // ============================================================
  console.log('\n--- 5. worktree：HEAD 与 config 分居两处 ---');
  // ============================================================

  function tryGit(args, cwd) {
    try {
      execFileSync('git', args, { cwd, stdio: 'ignore' });
      return true;
    } catch { return false; }
  }

  const wtBase = track(fs.mkdtempSync(path.join(os.tmpdir(), 's2wt-')));
  const mainRepo = path.join(wtBase, 'main');
  fs.mkdirSync(mainRepo);

  const gitOk =
    tryGit(['init', '-q'], mainRepo) &&
    tryGit(['config', 'user.email', 't@t.com'], mainRepo) &&
    tryGit(['config', 'user.name', 't'], mainRepo) &&
    tryGit(['remote', 'add', 'origin', 'https://github.com/ItQianChen/codebuddy2api.git'], mainRepo);
  fs.writeFileSync(path.join(mainRepo, 'f.txt'), 'x');
  const commitOk = gitOk && tryGit(['add', '-A'], mainRepo) && tryGit(['commit', '-q', '-m', 'init'], mainRepo);
  const wtPath = path.join(wtBase, 'wt');
  const wtOk = commitOk && tryGit(['worktree', 'add', '-q', wtPath, '-b', 'feat'], mainRepo);

  if (wtOk) {
    const info = exec.resolveGitDirInfo(wtPath);
    ok(info !== null && info.localDir !== info.commonDir, 'worktree 的 localDir 与 commonDir 不同');
    ok(
      fs.readFileSync(path.join(info.localDir, 'HEAD'), 'utf8').includes('refs/heads/feat'),
      '局部 gitdir 的 HEAD 是本 worktree 的分支（feat）'
    );
    ok(
      fs.readFileSync(path.join(info.commonDir, 'HEAD'), 'utf8').includes('refs/heads/master'),
      '共享 dir 的 HEAD 是主工作树的分支（master）——证明读错会得到错误分支'
    );
    ok(exec.resolveGitDirPath(wtPath) === info.commonDir, 'resolveGitDirPath 仍返回共享目录（兼容 S1）');

    const pWt = parseGitConfig(
      fs.readFileSync(path.join(info.commonDir, 'config'), 'utf8'),
      fs.readFileSync(path.join(info.localDir, 'HEAD'), 'utf8')
    );
    ok(pWt.currentBranch === 'feat', 'worktree 解析出正确分支 feat（而非主树的 master）');

    // 身份解析在 worktree 下必须能拿到 remote
    const idWt = exec.getRepoIdentityFromLocal(wtPath);
    ok(idWt?.nameWithOwner === 'ItQianChen/codebuddy2api', 'worktree 下身份解析可用');
  } else {
    total += 6;
    console.log('⏭️  SKIP: 环境无法执行 git 命令，worktree 六项用例跳过');
  }

  // ============================================================
  console.log('\n--- 6. getRepoMetadata 离线兜底与身份解析一致 ---');
  // ============================================================

  const repoMeta = makeRepo(cfgTwoRemotes);
  const mock = new GhExecutor();
  // 让 gh 全部失败 → 走离线兜底
  mock.run = async () => ({ ok: false, error: 'GitHub CLI 命令执行超时 (10000ms)' });
  const meta = await mock.getRepoMetadata(repoMeta);
  const ident = mock.getRepoIdentityFromLocal(repoMeta);
  ok(meta?.nameWithOwner === 'ItQianChen/codebuddy2api', `离线兜底解析出 fork，实际：${meta?.nameWithOwner}`);
  ok(meta?.nameWithOwner === ident?.nameWithOwner, 'getRepoMetadata 兜底与 getRepoIdentityFromLocal 结论一致');

  // ============================================================
  console.log('\n--- 7. 静态断言：旧正则已移除 ---');
  // ============================================================

  const srcExecutor = fs.readFileSync(new URL('../src/executor.ts', import.meta.url), 'utf8');
  ok(
    !/github\\\.com\[:\/\]/.test(srcExecutor),
    'src/executor.ts 不再包含「取第一个 github.com 匹配」的旧正则'
  );
  const callCount = (srcExecutor.match(/getRepoIdentityFromLocal\(/g) || []).length;
  ok(callCount >= 2, `getRepoMetadata 复用了 getRepoIdentityFromLocal（当前出现 ${callCount} 次）`);

  cleanup();

  console.log('\n========================================');
  console.log(`Phase 23 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  cleanup();
  process.exit(1);
});
