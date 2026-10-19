// test/phase24.test.mjs - Phase 24 · 拓扑权限字段 · 布局分类 · 默认分支推断（S3）回归测试套件
//
// 覆盖：
// 1. parseRemoteHost：5 种 URL 形态的 host 提取
// 2. classifyRepoLayout：四种布局分类
// 3. pickGithubRemote：混合布局下的确定性选择（顺序免疫）
// 4. readDefaultBranchFromRef：符号引用读取与回落
// 5. mapRepoMetadata（通过 getRepoMetadata 间接验证）：isFork/parent/viewerPermission
// 6. 离线路径三个新字段必须为 undefined（不猜）

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const created = [];
const track = (d) => { created.push(d); return d; };
function cleanup() {
  for (const d of created) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  created.length = 0;
}

function makeRepo(configText, headText = 'ref: refs/heads/main\n', extra = {}) {
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 's3-')));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'config'), configText, 'utf8');
  if (headText !== null) fs.writeFileSync(path.join(dir, '.git', 'HEAD'), headText, 'utf8');
  for (const [rel, content] of Object.entries(extra)) {
    const p = path.join(dir, '.git', rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
  return dir;
}

async function runTests() {
  let passed = 0, total = 0;
  const ok = (cond, name, extra = '') => {
    total++;
    if (cond) { console.log(`✅ PASS: ${name}${extra ? '  → ' + extra : ''}`); passed++; }
    else console.error(`❌ FAIL: ${name}${extra ? '  → ' + extra : ''}`);
  };

  const { GhExecutor, parseRemoteHost, classifyRepoLayout, pickGithubRemote, parseGitConfig } = await import('../lib/executor.js');
  const exec = new GhExecutor({});

  // ============================================================
  console.log('\n--- 1. parseRemoteHost ---');
  // ============================================================
  const hostCases = [
    ['https://github.com/a/b.git', 'github.com'],
    ['git@github.com:a/b.git', 'github.com'],
    ['ssh://git@ghe.corp.com:2222/a/b.git', 'ghe.corp.com'],
    ['https://user:token@github.com/a/b.git', 'github.com'],
    ['https://GitHub.com/a/b.git', 'github.com'],
    ['git@ghe.corp.com:a/b.git', 'ghe.corp.com'],
  ];
  for (const [url, want] of hostCases) {
    ok(parseRemoteHost(url) === want, `host 提取：${url.slice(0, 42)}`, String(parseRemoteHost(url)));
  }
  ok(parseRemoteHost('') === null && parseRemoteHost(null) === null, '空值返回 null 不抛错');
  // 本地路径不是远程 host，必须返回 null 而非把协议名/盘符当 host
  ok(parseRemoteHost('file:///c/Users/me/repo') === null, 'file:// 本地路径返回 null');
  ok(parseRemoteHost('C:\\local\\repo') === null, 'Windows 盘符路径返回 null');
  ok(parseRemoteHost('not a url') === null, '非 URL 文本返回 null');

  // ============================================================
  console.log('\n--- 2. classifyRepoLayout 四种布局 ---');
  // ============================================================
  const cfgGithubOnly = '[remote "origin"]\n\turl = https://github.com/a/b.git\n[remote "upstream"]\n\turl = https://github.com/c/d.git\n';
  ok(classifyRepoLayout(parseGitConfig(cfgGithubOnly, null)) === 'github-only', '全 GitHub → github-only');

  const cfgMixed = '[remote "origin"]\n\turl = https://ghe.corp.com/a/b.git\n[remote "upstream"]\n\turl = https://github.com/c/d.git\n';
  ok(classifyRepoLayout(parseGitConfig(cfgMixed, null)) === 'github-mixed', 'GHE origin + GitHub upstream → github-mixed');

  const cfgNoGithub = '[remote "origin"]\n\turl = https://ghe.corp.com/a/b.git\n[remote "other"]\n\turl = https://gitlab.com/x/y.git\n';
  ok(classifyRepoLayout(parseGitConfig(cfgNoGithub, null)) === 'no-github', '全非 GitHub → no-github');

  ok(classifyRepoLayout(parseGitConfig('', null)) === 'no-remote', '无 remote → no-remote');
  ok(classifyRepoLayout(null) === 'no-remote', 'null 输入 → no-remote 不抛错');

  // ============================================================
  console.log('\n--- 3. pickGithubRemote：确定性选择（顺序免疫）---');
  // ============================================================
  const mixedAB = '[remote "upstream"]\n\turl = https://github.com/up/up.git\n[remote "ghe1"]\n\turl = https://ghe.corp/a/b.git\n[remote "zzz"]\n\turl = https://github.com/zzz/zzz.git\n';
  const pAB = pickGithubRemote(parseGitConfig(mixedAB, null));
  ok(pAB?.name === 'upstream', '无 origin 时取字典序最小的 GitHub remote', pAB?.name);

  const mixedBA = '[remote "zzz"]\n\turl = https://github.com/zzz/zzz.git\n[remote "ghe1"]\n\turl = https://ghe.corp/a/b.git\n[remote "upstream"]\n\turl = https://github.com/up/up.git\n';
  const pBA = pickGithubRemote(parseGitConfig(mixedBA, null));
  ok(pBA?.name === 'upstream', '顺序反过来结果不变（顺序免疫）', pBA?.name);

  const mixedWithOrigin = '[remote "aaa"]\n\turl = https://github.com/aaa/aaa.git\n[remote "origin"]\n\turl = https://github.com/o/o.git\n';
  ok(pickGithubRemote(parseGitConfig(mixedWithOrigin, null))?.name === 'origin', '有 origin 时 origin 优先于字典序');

  ok(pickGithubRemote(parseGitConfig(cfgNoGithub, null)) === null, '无 GitHub remote 时返回 null');

  // ============================================================
  console.log('\n--- 4. 身份解析：布局分类驱动 ---');
  // ============================================================
  const idMixed = exec.getRepoIdentityFromLocal(makeRepo(cfgMixed));
  ok(idMixed?.nameWithOwner === 'c/d', '混合布局选中 GitHub remote', idMixed?.nameWithOwner);
  ok(idMixed?.layout === 'github-mixed', '身份带上 layout 标记', String(idMixed?.layout));

  const idGithubOnly = exec.getRepoIdentityFromLocal(makeRepo(cfgGithubOnly));
  ok(idGithubOnly?.nameWithOwner === 'a/b', '纯 GitHub 按 git 规则选 origin（非字典序）', idGithubOnly?.nameWithOwner);
  ok(idGithubOnly?.layout === 'github-only', '布局标记正确');

  ok(exec.getRepoIdentityFromLocal(makeRepo(cfgNoGithub)) === null, '全 GHE → null（不猜测）');

  // ============================================================
  console.log('\n--- 5. 默认分支推断 ---');
  // ============================================================
  const cfgSingle = '[remote "origin"]\n\turl = https://github.com/ItQianChen/dsh-github-flow.git\n';

  const repoWithRef = makeRepo(cfgSingle, 'ref: refs/heads/master\n', {
    'refs/remotes/origin/HEAD': 'ref: refs/remotes/origin/master\n',
  });
  const idRef = exec.getRepoIdentityFromLocal(repoWithRef);
  ok(idRef?.defaultBranch === 'master', '从 origin/HEAD 符号引用读默认分支', idRef?.defaultBranch);

  const repoNoRef = makeRepo(cfgSingle, 'ref: refs/heads/main\n');
  ok(exec.getRepoIdentityFromLocal(repoNoRef)?.defaultBranch === 'main', '无 HEAD ref → 回落 main');

  const repoBadRef = makeRepo(cfgSingle, 'ref: refs/heads/main\n', {
    'refs/remotes/origin/HEAD': 'not-a-symbolic-ref\n',
  });
  ok(exec.getRepoIdentityFromLocal(repoBadRef)?.defaultBranch === 'main', '非符号引用 → 回落 main（不解析出错）');

  ok(exec.readDefaultBranchFromRef('nonexistent', repoNoRef) === null, 'readDefaultBranchFromRef 对不存在的 remote 返回 null');

  // ============================================================
  console.log('\n--- 6. 离线路径：三个新字段必须 undefined（不猜）---');
  // ============================================================
  ok(idGithubOnly?.isFork === undefined, '离线 isFork 为 undefined');
  ok(idGithubOnly?.parent === undefined, '离线 parent 为 undefined');
  ok(idGithubOnly?.viewerPermission === undefined, '离线 viewerPermission 为 undefined');

  const offlineMeta = await new GhExecutor();
  offlineMeta.run = async () => ({ ok: false, error: 'GitHub CLI 命令执行超时 (10000ms)' });
  const meta = await offlineMeta.getRepoMetadata(makeRepo(cfgSingle));
  ok(meta?.isFork === undefined && meta?.parent === undefined && meta?.viewerPermission === undefined, 'getRepoMetadata 离线兜底同样不带三字段');
  ok(meta?.description === '已成功关联本地 Git 远程仓库', '离线兜底保留原有描述文案');

  // ============================================================
  console.log('\n--- 7. 在线路径：三字段映射（用真实 gh 载荷形态，不依赖网络）---');
  // ============================================================
  // 为什么用固定载荷而不是真调 gh：映射逻辑的正确性与网络无关，
  // 而 CI/沙箱环境通常无法 spawn gh。载荷取自 2026-10-19 实测输出。
  const FORK_PAYLOAD = {
    nameWithOwner: 'ItQianChen/codebuddy2api',
    name: 'codebuddy2api',
    owner: { login: 'ItQianChen' },
    defaultBranchRef: { name: 'main' },
    description: 'Use your CodeBuddy subscription as local OpenAI APIs.',
    isPrivate: false,
    url: 'https://github.com/ItQianChen/codebuddy2api',
    stargazerCount: 0,
    forkCount: 0,
    isFork: true,
    parent: { id: 'R_kgDOUVhp9Q', name: 'codebuddy2api', owner: { id: 'U_kgDOEIh2dQ', login: 'maiphucgiang' } },
    viewerPermission: 'ADMIN',
  };
  const mockExec = new GhExecutor({});
  mockExec.run = async () => ({ ok: true, data: FORK_PAYLOAD });
  const forkMeta = await mockExec.getRepoMetadata(makeRepo(cfgSingle));

  ok(forkMeta?.isFork === true, '在线：fork 仓库 isFork === true', String(forkMeta?.isFork));
  ok(
    forkMeta?.parent?.nameWithOwner === 'maiphucgiang/codebuddy2api',
    '在线：parent.nameWithOwner 由 owner.login + name 拼接',
    forkMeta?.parent?.nameWithOwner
  );
  ok(forkMeta?.parent?.url === 'https://github.com/maiphucgiang/codebuddy2api', '在线：parent.url 生成正确');
  ok(forkMeta?.viewerPermission === 'ADMIN', '在线：viewerPermission 映射', String(forkMeta?.viewerPermission));

  // 只读仓库（非 fork）
  const READONLY_PAYLOAD = {
    nameWithOwner: 'maiphucgiang/codebuddy2api',
    name: 'codebuddy2api',
    owner: { login: 'maiphucgiang' },
    defaultBranchRef: { name: 'main' },
    description: 'Use your CodeBuddy subscription as local OpenAI APIs.',
    isPrivate: false,
    url: 'https://github.com/maiphucgiang/codebuddy2api',
    stargazerCount: 203,
    forkCount: 46,
    isFork: false,
    parent: null,
    viewerPermission: 'READ',
  };
  const roExec = new GhExecutor({});
  roExec.run = async () => ({ ok: true, data: READONLY_PAYLOAD });
  const roMeta = await roExec.getRepoMetadata(makeRepo(cfgSingle));
  ok(roMeta?.isFork === false, '在线：非 fork 仓库 isFork === false');
  ok(roMeta?.parent === undefined, '在线：parent 为 null 时不生成 parent 字段（不造假对象）');
  ok(roMeta?.viewerPermission === 'READ', '在线：他人仓库权限 READ');

  // 未知权限档位必须被丢弃，不能当成可写
  const WEIRD_PERM = { ...READONLY_PAYLOAD, viewerPermission: 'SOMETHING_NEW' };
  const wpExec = new GhExecutor({});
  wpExec.run = async () => ({ ok: true, data: WEIRD_PERM });
  ok((await wpExec.getRepoMetadata(makeRepo(cfgSingle)))?.viewerPermission === undefined, '未知权限档位被丢弃（不冒认可写）');

  // isFork 为 true 但 parent 缺失时不得生成半截对象
  const HALF_PAYLOAD = { ...FORK_PAYLOAD, parent: null };
  const hpExec = new GhExecutor({});
  hpExec.run = async () => ({ ok: true, data: HALF_PAYLOAD });
  ok((await hpExec.getRepoMetadata(makeRepo(cfgSingle)))?.parent === undefined, 'isFork=true 但 parent 缺失 → 不生成半截 parent');

  // ============================================================
  console.log('\n--- 8. 字段缺失渲染不崩 ---');
  // ============================================================
  const { renderRepoMarkdown } = await import('../lib/renderers/markdown.js');
  let rendered = '';
  try {
    rendered = renderRepoMarkdown({ action: 'view' }, idGithubOnly);
    ok(typeof rendered === 'string' && rendered.length > 0, '渲染器对缺失新字段不崩溃');
  } catch (e) {
    ok(false, '渲染器对缺失新字段不崩溃', e.message);
  }

  cleanup();

  console.log('\n========================================');
  console.log(`Phase 24 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  cleanup();
  process.exit(1);
});
