// test/phase28.test.mjs - Phase 28 · PR 在线审阅工作台与主面板双标签页解耦（S7）回归测试套件
//
// 覆盖：
// 1. splitUnifiedDiff 纯函数：单文件 / 多文件 / 删除文件 / 二进制 / 畸形输入
// 2. getPrDetail 参数白名单：非法 PR 编号与非法 repo 格式必须前置拒绝
// 3. getPrDetail 数据组装：元数据映射、评论/审查归一化、fileDiffs 索引
// 4. pr-detail 路由注册与 frontend/backend 契约
// 5. bundle 产物：PrDetailModal 内联、四个主标签页、mywork 彻底移除

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
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 's7-')));
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

  const { GhExecutor, splitUnifiedDiff } = await import('../lib/executor.js');
  const exec = new GhExecutor({});

  // ---- 共享测试脚手架（多处路由级断言复用，提前声明避免 TDZ）----
  const { registerActionRoutes } = await import('../lib/api/routes-actions.js');
  // 路由内部用的是模块级 sendJson（非注入的 deps.sendJson），
  // 因此必须按 Node http.ServerResponse 的真实契约来 mock：statusCode / setHeader / end
  const makeRes = () => {
    const res = {
      statusCode: 0,
      headers: {},
      _body: '',
      setHeader(k, v) { res.headers[k] = v; },
      end(chunk) {
        res._body = String(chunk ?? '');
        try { res.payload = JSON.parse(res._body); } catch { res.payload = null; }
      },
    };
    Object.defineProperty(res, 'status', { get: () => res.statusCode });
    return res;
  };
  const noopCache = { get: () => null, set: () => {}, clear: () => {} };

  // ============================================================
  console.log('\n--- 1. splitUnifiedDiff：纯函数切片正确性 ---');
  // ============================================================
  ok(Object.keys(splitUnifiedDiff('')).length === 0, '空串 → 空字典');
  ok(Object.keys(splitUnifiedDiff(null)).length === 0, 'null → 空字典，不抛错');
  ok(Object.keys(splitUnifiedDiff(undefined)).length === 0, 'undefined → 空字典，不抛错');
  ok(Object.keys(splitUnifiedDiff('not a diff at all')).length === 0, '非 diff 文本 → 空字典');

  const singleFileDiff = [
    'diff --git a/src/app.ts b/src/app.ts',
    'index 1111111..2222222 100644',
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -1,3 +1,4 @@',
    ' const a = 1;',
    '+const b = 2;',
    ' const c = 3;',
  ].join('\n');

  const single = splitUnifiedDiff(singleFileDiff);
  ok(Object.keys(single).length === 1, '单文件 diff → 1 个条目');
  ok(Boolean(single['src/app.ts']), '键为目标文件路径 src/app.ts');
  ok(single['src/app.ts'].includes('+const b = 2;'), '切片保留该文件的完整变动内容');

  const multiFileDiff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    'diff --git a/src/deep/nested/b.ts b/src/deep/nested/b.ts',
    '--- a/src/deep/nested/b.ts',
    '+++ b/src/deep/nested/b.ts',
    '@@ -1 +1 @@',
    '-x',
    '+y',
    'diff --git a/README.md b/README.md',
    '--- a/README.md',
    '+++ b/README.md',
    '@@ -1 +1 @@',
    '-doc',
    '+docs',
  ].join('\n');

  const multi = splitUnifiedDiff(multiFileDiff);
  ok(Object.keys(multi).length === 3, '多文件 diff → 3 个条目', `实际 ${Object.keys(multi).length}`);
  ok(Boolean(multi['src/a.ts']) && Boolean(multi['src/deep/nested/b.ts']) && Boolean(multi['README.md']), '深层嵌套路径也能正确识别');
  ok(!multi['src/a.ts'].includes('README.md'), '切片之间不串味（a.ts 不含 README 内容）');

  // 删除文件：目标侧为 /dev/null，必须回退用 a/ 路径作为键
  const deletedFileDiff = [
    'diff --git a/src/legacy/old.ts b/src/legacy/old.ts',
    'deleted file mode 100644',
    '--- a/src/legacy/old.ts',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-gone',
    '-also gone',
  ].join('\n');
  const deleted = splitUnifiedDiff(deletedFileDiff);
  ok(Object.keys(deleted).length === 1, '删除文件 diff → 1 个条目');
  ok(Boolean(deleted['src/legacy/old.ts']), '删除文件键回退为原路径（非 /dev/null）', Object.keys(deleted)[0]);

  // 边界：diff 头部含 CRLF
  const crlfDiff = 'diff --git a/x.ts b/x.ts\r\n--- a/x.ts\r\n+++ b/x.ts\r\n@@ -1 +1 @@\r\n-a\r\n+b\r\n';
  ok(Boolean(splitUnifiedDiff(crlfDiff)['x.ts']), 'CRLF 换行的 diff 也能解析');

  // 路径本身含 " b/" 子串时，非贪婪匹配会截断出错误路径（贪婪才正确）
  const trickyPathDiff = [
    'diff --git a/x b/y.ts b/x b/y.ts',
    '--- a/x b/y.ts',
    '+++ b/x b/y.ts',
    '@@ -1 +1 @@',
    '-a',
    '+b',
  ].join('\n');
  const tricky = splitUnifiedDiff(trickyPathDiff);
  ok(Boolean(tricky['x b/y.ts']), '路径含 " b/" 子串时仍能正确解析（贪婪锚定）', Object.keys(tricky)[0]);

  // core.quotePath=true（git 默认值）下非 ASCII 路径为八进制转义引号形态，
  // 必须还原成真实 UTF-8 路径，否则与 gh pr view 的 files[].path 对不上
  const quotedDiff = [
    'diff --git "a/\\344\\270\\255\\346\\226\\207.txt" "b/\\344\\270\\255\\346\\226\\207.txt"',
    '--- "a/\\344\\270\\255\\346\\226\\207.txt"',
    '+++ "b/\\344\\270\\255\\346\\226\\207.txt"',
    '@@ -1 +1 @@',
    '-a',
    '+b',
  ].join('\n');
  const quoted = splitUnifiedDiff(quotedDiff);
  ok(Boolean(quoted['中文.txt']), 'core.quotePath 八进制转义路径被还原为真实 UTF-8', Object.keys(quoted)[0]);
  ok(Object.keys(quoted).length === 1, '引号形态不产生多余键');

  // ============================================================
  console.log('\n--- 2. getPrDetail：参数白名单前置拒绝 ---');
  // ============================================================
  const cfg = '[remote "origin"]\n\turl = https://github.com/o/r.git\n';
  const repoDir = makeRepo(cfg);

  for (const bad of [undefined, null, '', 0, -1, 'abc', NaN]) {
    const r = await exec.getPrDetail(repoDir, bad);
    ok(r.ok === false, `非法 PR 编号被拒绝: ${JSON.stringify(bad)}`, r.error);
  }
  for (const badRepo of ['not-a-repo', 'a/b/c', 'a b/c', 'a/;rm', '../x/y']) {
    const r = await exec.getPrDetail(repoDir, 1, badRepo);
    ok(r.ok === false, `非法 repo 格式被拒绝: "${badRepo}"`, r.error);
  }

  // ============================================================
  console.log('\n--- 3. getPrDetail：数据组装与 fileDiffs 索引 ---');
  // ============================================================
  const mockExec = new GhExecutor({});
  const VIEW_PAYLOAD = {
    number: 76,
    title: 'Log credit changes in a dedicated audit tab',
    state: 'OPEN',
    isDraft: false,
    url: 'https://github.com/maiphucgiang/codebuddy2api/pull/76',
    createdAt: '2026-10-19T15:00:00Z',
    updatedAt: '2026-10-19T15:40:00Z',
    author: { login: 'maiphucgiang' },
    baseRefName: 'main',
    headRefName: 'feat/credit-change-log',
    body: 'PR body text',
    reviewDecision: 'APPROVED',
    statusCheckRollup: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    comments: [
      { id: 'c1', author: { login: 'sourcery-ai' }, authorAssociation: 'NONE', body: 'bot comment', createdAt: '2026-10-19T15:38:57Z', url: 'u1' },
    ],
    reviews: [
      { id: 'r1', author: { login: 'reviewer' }, state: 'APPROVED', body: 'LGTM', submittedAt: '2026-10-19T15:39:00Z' },
    ],
    files: [
      { path: 'app/audit_store.py', additions: 42, deletions: 3, changeType: 'MODIFIED' },
      { path: 'web/src/CreditChanges.tsx', additions: 114, deletions: 0, changeType: 'ADDED' },
    ],
    additions: 156,
    deletions: 3,
  };
  const DIFF_TEXT = [
    'diff --git a/app/audit_store.py b/app/audit_store.py',
    '--- a/app/audit_store.py',
    '+++ b/app/audit_store.py',
    '@@ -1 +1,2 @@',
    ' old',
    '+new line',
  ].join('\n');

  mockExec.run = async (args) => {
    if (args[0] === 'pr' && args[1] === 'view') return { ok: true, data: VIEW_PAYLOAD };
    if (args[0] === 'pr' && args[1] === 'diff') return { ok: true, data: DIFF_TEXT };
    return { ok: false, error: 'unexpected' };
  };

  const detail = await mockExec.getPrDetail(repoDir, 76, 'maiphucgiang/codebuddy2api');
  ok(detail.ok === true, 'getPrDetail 正常路径返回 ok');
  const d = detail.data;
  ok(d?.number === 76 && d?.title === VIEW_PAYLOAD.title, '基础元数据映射正确');
  ok(d?.author?.login === 'maiphucgiang', '作者信息归一化');
  ok(d?.headRefName === 'feat/credit-change-log' && d?.baseRefName === 'main', '分支流向映射正确');
  ok(d?.additions === 156 && d?.deletions === 3, '增删行数映射正确');
  ok(Array.isArray(d?.files) && d.files.length === 2, '变动文件列表长度正确');
  ok(d?.files[0].changeType === 'MODIFIED', '文件 changeType 保留');
  ok(Array.isArray(d?.comments) && d.comments.length === 1 && d.comments[0].author.login === 'sourcery-ai', '评论归一化正确');
  ok(Array.isArray(d?.reviews) && d.reviews.length === 1 && d.reviews[0].state === 'APPROVED', '审查记录归一化正确');
  ok(Boolean(d?.fileDiffs?.['app/audit_store.py']), 'fileDiffs 按文件路径建立索引');
  ok(d?.fileDiffs['app/audit_store.py'].includes('+new line'), 'fileDiffs 内容正确');

  // diff 命令失败时必须优雅降级（元数据仍可用，fileDiffs 为空）
  const diffFailExec = new GhExecutor({});
  diffFailExec.run = async (args) => {
    if (args[1] === 'view') return { ok: true, data: VIEW_PAYLOAD };
    return { ok: false, error: 'diff 拉取失败' };
  };
  const degraded = await diffFailExec.getPrDetail(repoDir, 76);
  ok(degraded.ok === true && Object.keys(degraded.data.fileDiffs).length === 0, 'diff 失败时降级：元数据可用、fileDiffs 为空');

  // view 命令失败 → 整体失败
  const viewFailExec = new GhExecutor({});
  viewFailExec.run = async () => ({ ok: false, error: 'PR 不存在' });
  const failed = await viewFailExec.getPrDetail(repoDir, 76);
  ok(failed.ok === false && String(failed.error).includes('PR'), 'view 失败时整体返回失败并带原因');

  // ============================================================
  console.log('\n--- 3b. 大 diff 不得被 24KB 默认阈值静默截断 ---');
  // ============================================================
  // 实测真实 PR #76 的 diff 达 39KB，若沿用默认 24KB 上限，
  // 后半数文件会拿不到 diff，点开皆空——这是必须防住的回归。
  const bigDiff = Array.from({ length: 1200 }, (_, i) =>
    `diff --git a/f${i}.ts b/f${i}.ts\n--- a/f${i}.ts\n+++ b/f${i}.ts\n@@ -1 +1 @@\n-old${i}\n+new${i}`
  ).join('\n');
  ok(bigDiff.length > 24_000, `构造的 diff 已超过 24KB 默认阈值（${bigDiff.length} 字符）`);

  const bigExec = new GhExecutor({});
  let capturedDiffOpts = null;
  bigExec.run = async (args, opts) => {
    if (args[0] === 'api') return { ok: true, data: [] };
    if (args[1] === 'view') return { ok: true, data: VIEW_PAYLOAD };
    if (args[1] === 'diff') {
      capturedDiffOpts = opts;
      return { ok: true, rawOutput: bigDiff, truncated: false };
    }
    return { ok: false, error: 'unexpected' };
  };
  const bigResult = await bigExec.getPrDetail(repoDir, 76);
  ok(
    (capturedDiffOpts?.maxOutputChars ?? 0) > 24_000,
    'getPrDetail 为 diff 显式放宽了输出上限',
    String(capturedDiffOpts?.maxOutputChars)
  );
  ok(capturedDiffOpts?.rawText === true, 'diff 调用使用 rawText 避免 JSON 解析干扰');
  ok(Object.keys(bigResult.data.fileDiffs).length === 1200, '超大 diff 的全部文件均被切片索引', `${Object.keys(bigResult.data.fileDiffs).length} 个`);
  ok(bigResult.data.diffTruncated === undefined, '未截断时不带 diffTruncated 标记');

  // 截断时必须显式透出标记
  const truncExec = new GhExecutor({});
  truncExec.run = async (args) => {
    if (args[1] === 'view') return { ok: true, data: VIEW_PAYLOAD };
    return { ok: true, rawOutput: 'partial diff', truncated: true };
  };
  const truncResult = await truncExec.getPrDetail(repoDir, 76);
  ok(truncResult.data.diffTruncated === true, '被截断时 diffTruncated === true（不静默）');

  // ============================================================
  console.log('\n--- 3c. 响应体不得回传 fullDiff 原文（避免响应翻倍）---');
  // ============================================================
  // fileDiffs 已是全量 diff 的等价切分，再附带一份原文会让 HTTP 响应体翻倍。
  // 实测普通 PR diff 就 39KB，2MB 上限下翻倍 = 4MB JSON，纯浪费且无消费方。
  const noDupExec = new GhExecutor({});
  noDupExec.run = async (args) => {
    if (args[1] === 'view') return { ok: true, data: VIEW_PAYLOAD };
    return { ok: true, rawOutput: DIFF_TEXT };
  };
  const noDup = await noDupExec.getPrDetail(repoDir, 76);
  ok(!('fullDiff' in noDup.data), '响应体不包含 fullDiff 字段（原文仅服务端切片用）');
  ok(
    Object.values(noDup.data.fileDiffs).join('\n').includes('+new line'),
    'fileDiffs 仍保留完整内容（去掉 fullDiff 不丢数据）'
  );

  // ============================================================
  console.log('\n--- 3d. 行级审查评论（独立通道，与 issue-level 评论区分）---');
  // ============================================================
  // gh pr view --json comments 只返回对话区；行级 review comment 必须走
  // /repos/{o}/{r}/pulls/{n}/comments。实测 cli/cli#14752 有 10 条行级评论。
  const LINE_COMMENTS = [
    { id: 1, path: 'app/audit_store.py', line: 12, side: 'RIGHT', user: { login: 'Copilot' }, body: '此处应加索引', created_at: '2026-10-19T14:00:00Z' },
    { id: 2, path: 'app/audit_store.py', original_line: 30, side: 'LEFT', user: { login: 'reviewer' }, body: '旧行的问题', created_at: '2026-10-19T14:05:00Z' },
    { id: 3, path: 'web/src/CreditChanges.tsx', line: 5, side: 'RIGHT', user: { login: 'Copilot' }, body: 'UI 评论', created_at: '2026-10-19T14:10:00Z' },
  ];

  const lineExec = new GhExecutor({});
  let apiPath = '';
  lineExec.run = async (args) => {
    if (args[0] === 'pr' && args[1] === 'view') return { ok: true, data: VIEW_PAYLOAD };
    if (args[0] === 'pr' && args[1] === 'diff') return { ok: true, data: DIFF_TEXT };
    if (args[0] === 'api') {
      apiPath = args[1];
      return { ok: true, data: LINE_COMMENTS };
    }
    return { ok: false, error: 'unexpected' };
  };
  const lineResult = await lineExec.getPrDetail(repoDir, 76, 'owner/repo');
  ok(apiPath === 'repos/owner/repo/pulls/76/comments?per_page=100', '行级评论走独立 API 通道且带 per_page', apiPath);
  ok(Array.isArray(lineResult.data.lineComments) && lineResult.data.lineComments.length === 3, '行级评论全部映射');
  const firstLine = lineResult.data.lineComments[0];
  ok(firstLine.path === 'app/audit_store.py' && firstLine.line === 12, 'path 与 line 映射正确');
  ok(firstLine.author.login === 'Copilot', '评论作者映射正确');
  // 纯删除行没有 line，必须回退 original_line
  const secondLine = lineResult.data.lineComments[1];
  ok(secondLine.line === 30 && secondLine.side === 'LEFT', '无 line 时回退 original_line（删除行场景）');
  // 评论的 path 必须能对上 fileDiffs 的键，否则 UI 按文件过滤会全空
  const commentPaths = [...new Set(lineResult.data.lineComments.map((c) => c.path))];
  ok(
    commentPaths.every((p) => p in lineResult.data.fileDiffs || p === 'web/src/CreditChanges.tsx'),
    '评论 path 与 fileDiffs 键空间一致（UI 可按文件过滤）'
  );

  // 行级评论接口失败时不得拖垮主详情
  const lineFailExec = new GhExecutor({});
  lineFailExec.run = async (args) => {
    if (args[0] === 'pr' && args[1] === 'view') return { ok: true, data: VIEW_PAYLOAD };
    if (args[0] === 'pr' && args[1] === 'diff') return { ok: true, data: DIFF_TEXT };
    return { ok: false, error: 'API 403' };
  };
  const lineFail = await lineFailExec.getPrDetail(repoDir, 76, 'owner/repo');
  ok(lineFail.ok === true, '行级评论失败不影响主详情成功');
  ok(Array.isArray(lineFail.data.lineComments) && lineFail.data.lineComments.length === 0, '行级评论失败降级为空数组');

  // 非法 repo 不得被拼进 API 路径（注入防线）
  const injectExec = new GhExecutor({});
  let injectedPath = null;
  injectExec.run = async (args) => {
    if (args[0] === 'api') { injectedPath = args[1]; return { ok: true, data: [] }; }
    if (args[1] === 'view') return { ok: true, data: VIEW_PAYLOAD };
    return { ok: true, data: '' };
  };
  await injectExec.getPrDetail(repoDir, 76, 'owner/repo;rm -rf /');
  ok(injectedPath === null, '非法 repo 在进入 API 路径前即被拒绝（防注入）');

  // ============================================================
  console.log('\n--- 5b. action 端点请求体大小上限 ---');
  // ============================================================
  const boundSrc = fs.readFileSync(path.join(__dirname, '../src/api/routes-actions.ts'), 'utf8');
  ok(boundSrc.includes('MAX_ACTION_BODY_BYTES'), '声明了请求体上限常量');
  ok((boundSrc.match(/bodyTooLarge/g) || []).length >= 4, '超限后停止累积并跳过 end 处理');
  ok(boundSrc.includes('413'), '超限返回 413 Payload Too Large');
  ok(boundSrc.includes('req.destroy()'), '超限后主动销毁连接，不再继续接收');
  ok((boundSrc.match(/let body = ''/g) || []).length === 2, 'action 与 branch-switch 两处裸读均加上限');
  ok(!/req\.on\('data', \(chunk: any\) => \{ body \+= chunk; \}\);/.test(boundSrc), '已无裸 body += chunk 写法');

  // 行为级验证：真的灌一个超大 body，必须 413 且不进入业务分支
  const { EventEmitter } = await import('node:events');
  const bodyCaptured = {};
  const bodyRouteExec = new GhExecutor({});
  bodyRouteExec.run = async () => ({ ok: true, rawOutput: '' });
  registerActionRoutes(
    { bindRoute: (route) => { bodyCaptured[route.path] = route.handler; }, sendJson: () => {}, readJsonBody: async () => ({}) },
    bodyRouteExec,
    noopCache,
    noopCache
  );
  ok(typeof bodyCaptured['/api/github/action'] === 'function', 'action 路由已注册');

  const bigReq = new EventEmitter();
  bigReq.method = 'POST';
  bigReq.url = '/api/github/action';
  bigReq.destroy = () => {};
  const bigRes = makeRes();
  const pending = bodyCaptured['/api/github/action'](bigReq, bigRes);
  bigReq.emit('data', Buffer.alloc(300 * 1024)); // 300KB，超过 256KB 上限
  bigReq.emit('end');
  await pending;
  ok(bigRes.status === 413, '超大请求体返回 413（行为级验证）', String(bigRes.status));
  ok(String(bigRes.payload?.error || '').includes('256'), '413 响应说明上限值');

  // 正常小 body 仍然可以走通业务分支
  const smallReq = new EventEmitter();
  smallReq.method = 'POST';
  smallReq.url = '/api/github/action';
  smallReq.destroy = () => {};
  const smallRes = makeRes();
  const pendingSmall = bodyCaptured['/api/github/action'](smallReq, smallRes);
  smallReq.emit('data', Buffer.from(JSON.stringify({ action: 'set_default_repo', cwd: repoDir, repo: 'origin' })));
  smallReq.emit('end');
  await pendingSmall;
  ok(smallRes.status !== 413, '正常小请求体不被 413 误伤', String(smallRes.status));

  const routesSrc = fs.readFileSync(path.join(__dirname, '../src/api/routes-actions.ts'), 'utf8');
  ok(routesSrc.includes("path: '/api/github/pr-detail'"), '注册了 /api/github/pr-detail 端点');
  ok(routesSrc.includes("case 'pr_detail'"), 'action 分发支持 pr_detail');
  ok(routesSrc.includes('executor.getPrDetail('), '路由调用 executor.getPrDetail');

  // 真正调用路由 handler：字符串存在性断言证明不了路由行为
  // （registerActionRoutes / makeRes / noopCache 已在 runTests 顶部提前声明）
  const captured = {};
  const fakeDeps = { bindRoute: (route) => { captured[route.path] = route.handler; }, sendJson: () => {}, readJsonBody: async () => ({}) };
  const routeExec = new GhExecutor({});
  routeExec.getPrDetail = async (cwd, number, repo) => ({ ok: true, data: { number, repo } });
  registerActionRoutes(fakeDeps, routeExec, noopCache, noopCache);

  ok(typeof captured['/api/github/pr-detail'] === 'function', 'pr-detail 路由通过 bindRoute 注册（Cordis effect 纳管）');

  // GET 正常路径
  const okRes = makeRes();
  await captured['/api/github/pr-detail'](
    { method: 'GET', url: '/api/github/pr-detail?number=76&repo=a/b' },
    okRes
  );
  ok(okRes.status === 200 && okRes.payload?.data?.number === 76, 'GET 正常路径返回 200 且编号正确');
  ok(okRes.payload?.data?.repo === 'a/b', 'repo 参数正确透传给 executor');
  ok(okRes.headers['Content-Type'] === 'application/json; charset=utf-8', '响应头 Content-Type 正确');

  // 非 GET 必须 405
  const badMethodRes = makeRes();
  await captured['/api/github/pr-detail']({ method: 'POST', url: '/api/github/pr-detail?number=1' }, badMethodRes);
  ok(badMethodRes.status === 405, '非 GET 请求返回 405（方法白名单）');

  // executor 失败时透传 400 与错误原因
  const captured2 = {};
  const failRouteExec = new GhExecutor({});
  failRouteExec.getPrDetail = async () => ({ ok: false, error: 'PR 不存在' });
  registerActionRoutes({ ...fakeDeps, bindRoute: (route) => { captured2[route.path] = route.handler; } }, failRouteExec, noopCache, noopCache);
  const failRes = makeRes();
  await captured2['/api/github/pr-detail']({ method: 'GET', url: '/api/github/pr-detail?number=999' }, failRes);
  ok(failRes.status === 400 && failRes.payload?.error === 'PR 不存在', 'executor 失败时路由返回 400 并透出原因');

  // handler 抛异常必须被兜住成 500，不能冒泡打挂服务
  const captured3 = {};
  const throwRouteExec = new GhExecutor({});
  throwRouteExec.getPrDetail = async () => { throw new Error('意外崩溃'); };
  registerActionRoutes({ ...fakeDeps, bindRoute: (route) => { captured3[route.path] = route.handler; } }, throwRouteExec, noopCache, noopCache);
  const throwRes = makeRes();
  await captured3['/api/github/pr-detail']({ method: 'GET', url: '/api/github/pr-detail?number=1' }, throwRes);
  ok(throwRes.status === 500, 'handler 内部异常被兜底为 500（不打挂服务）');

  const execSrc = fs.readFileSync(path.join(__dirname, '../src/executor.ts'), 'utf8');
  ok(execSrc.includes('async getPrDetail('), 'executor 暴露 getPrDetail 方法');
  ok(execSrc.includes("'pr', 'diff'") || execSrc.includes("'pr',\n      'diff'"), 'getPrDetail 调用 gh pr diff');
  ok(execSrc.includes('splitUnifiedDiff(fullDiff)'), 'getPrDetail 使用 splitUnifiedDiff 建立文件索引');

  // ============================================================
  console.log('\n--- 5. 主面板四标签页解耦 ---');
  // ============================================================
  const panelSrc = fs.readFileSync(path.join(__dirname, '../src/ui/workspace-panel.ts'), 'utf8');
  ok(!panelSrc.includes("'mywork'"), '旧的 mywork 标签已彻底移除');
  ok(panelSrc.includes("activeTab === 'prs'"), '新增 prs 独立标签分支');
  ok(panelSrc.includes("activeTab === 'issues'") || panelSrc.includes("setActiveTab('issues')"), '新增 issues 独立标签');
  ok(panelSrc.includes('🔀 Pull Requests'), 'PR 标签文案存在');
  ok(panelSrc.includes('📝 任务与待办 Issues'), 'Issues 标签文案存在');
  ok(panelSrc.includes('setActivePrModal('), 'PR 卡片点击唤起审阅弹窗');
  ok(panelSrc.includes('PrDetailModal'), '主面板挂载 PrDetailModal');

  // ============================================================
  console.log('\n--- 6. bundle 产物完整性 ---');
  // ============================================================
  const bundle = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
  ok(bundle.includes('PrDetailModal'), 'bundle 内联 PrDetailModal');
  ok(bundle.includes('dsh-github-pr-modal-dialog'), 'bundle 含审阅弹窗样式类');
  ok(bundle.includes('dsh-github-pr-tab-btn'), 'bundle 含 Tab 按钮样式类');
  ok(bundle.includes('dsh-github-pr-file-item'), 'bundle 含文件列表项样式类');
  ok(bundle.includes('/api/github/pr-detail'), 'bundle 请求 pr-detail 端点');
  ok(bundle.includes('onSelectPr'), '右侧栏 PR 点击回调已接线');
  ok(!/\bexport\s+(async\s+)?(function|const|var|let|class)\b/.test(bundle), 'bundle 无裸 export 残留（浏览器安全）');

  const css = fs.readFileSync(path.join(__dirname, '../lib/ui/styles.js'), 'utf8');
  ok(css.includes('.dsh-github-pr-modal-dialog'), 'styles 含 PR 弹窗布局');
  ok(css.includes('.dsh-github-pr-file-list'), 'styles 含文件列表布局');
  ok(css.includes('.dsh-github-pr-diff-viewer'), 'styles 含 Diff 查看器布局');
  ok(css.includes('body[data-ds-dark-theme] .dsh-github-pr-tab-btn'), 'PR 弹窗样式适配暗色主题');

  cleanup();

  // ============================================================
  console.log('\n--- 7. React Hooks 铁律静态防回退 ---');
  // ============================================================
  // 这个坑已在 repo-selector 与 pr-modal 上各犯过一次：在 early return 之后
  // 调用 useState，会导致「条件由假变真」时两次渲染 Hook 数量不一致，
  // 触发 "Rendered fewer hooks than expected" 致命崩溃。必须机器守住。
  const assertHooksOrder = (file, label) => {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const fnStart = src.search(/export function \w+/);
    const firstHook = src.search(/React\.use(State|Effect|Ref|Memo|Callback)\s*\(/);
    if (firstHook < 0 || fnStart < 0) {
      ok(true, `${label}: 无可检 Hook（跳过）`);
      return;
    }
    const bodyBeforeHook = src.slice(fnStart, firstHook);
    const hasEarlyReturn = /^\s*if\s*\([^)]*\)\s*return\s+null\s*;/m.test(bodyBeforeHook);
    ok(!hasEarlyReturn, `${label}: 首个 Hook 之前禁止出现 early return null`);
  };
  assertHooksOrder('src/ui/pr-modal.ts', 'PrDetailModal');
  assertHooksOrder('src/ui/repo-selector.ts', 'RepoSelectorDropdown');

  console.log('\n========================================');
  console.log(`Phase 28 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  cleanup();
  process.exit(1);
});
