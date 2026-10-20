// test/phase31.test.mjs - Phase 31 · Issue 在线查看工作台（详情 / 评论时间线 / 元数据）
//
// 背景：Issue 此前只有列表级数据，点击只能跳浏览器。本阶段把 PR 在线审阅的
// 成熟范式镜像到 Issue：executor.getIssueDetail + GET /api/github/issue-detail
// + IssueDetailModal。
//
// 覆盖：
// 1. 参数白名单（编号/仓库格式）
// 2. 输出阈值必须显式放宽（24KB 默认值会让长讨论 Issue 变成假空详情）
// 3. 数据归一化（state/author/labels/milestone/comments/linkedPrs/subIssues/images）
// 4. 老版本 gh 的 `Unknown JSON field` 字段降级链
// 5. 截断必须显式失败，不得伪造「暂无评论」
// 6. 路由注册与 HTTP 语义（200/400/405/500）
// 7. 前端接线（两处列表 + 卡片布局纪律 + 外跳 stopPropagation）
// 8. React Hooks 顺序防回退 / bundle 模块顺序 / CSS 完整性

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
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 's31-')));
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
  const { registerActionRoutes } = await import('../lib/api/routes-actions.js');

  // 路由内部用的是模块级 sendJson，必须按 Node http.ServerResponse 真实契约 mock
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

  const cfg = '[remote "origin"]\n\turl = https://github.com/o/r.git\n';
  const repoDir = makeRepo(cfg);

  // ============================================================
  console.log('\n--- 1. getIssueDetail：参数白名单前置拒绝 ---');
  // ============================================================
  for (const bad of [undefined, null, '', 0, -1, 'abc', NaN, 1.5, -0.5]) {
    const r = await GhExecutor.prototype.getIssueDetail.call(new GhExecutor({}), repoDir, bad);
    ok(r.ok === false, `非法 Issue 编号被拒绝: ${JSON.stringify(bad)}`, r.error);
  }
  for (const badRepo of ['not-a-repo', 'a/b/c', 'a b/c', 'a/;rm', '../x/y']) {
    const r = await GhExecutor.prototype.getIssueDetail.call(new GhExecutor({}), repoDir, 1, badRepo);
    ok(r.ok === false, `非法 repo 格式被拒绝: "${badRepo}"`, r.error);
  }

  // ============================================================
  console.log('\n--- 2. 命令字段集与输出阈值 ---');
  // ============================================================
  const VIEW = {
    number: 10030,
    title: 'Verifying attestations offline fails',
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    closedAt: '2024-12-10T19:41:48Z',
    url: 'https://github.com/cli/cli/issues/10030',
    createdAt: '2024-12-06T22:39:42Z',
    updatedAt: '2024-12-10T19:41:48Z',
    author: { login: 'bigswede74' },
    body: '### Describe the bug\r\n\r\n![shot](https://user-images.githubusercontent.com/1/a.png)',
    labels: [
      { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
      { name: 'gh-attestation', color: '0e8a16' },
    ],
    assignees: [{ login: 'kommendorkapten' }],
    milestone: { number: 70, title: 'v1.37', description: '', dueOn: '2026-12-01T00:00:00Z' },
    isPinned: true,
    issueType: { name: 'Bug' },
    comments: [
      {
        id: 'c1',
        author: { login: 'kommendorkapten' },
        authorAssociation: 'CONTRIBUTOR',
        body: 'Hi 👋 这看起来是编码问题 ![x](https://github.com/user-attachments/assets/abc)',
        createdAt: '2024-12-09T08:13:58Z',
        includesCreatedEdit: true,
        isMinimized: false,
        minimizedReason: '',
        url: 'https://github.com/cli/cli/issues/10030#issuecomment-1',
      },
      {
        id: 'c2',
        author: { login: 'spammer' },
        authorAssociation: 'NONE',
        body: 'buy now',
        createdAt: '2024-12-09T09:00:00Z',
        isMinimized: true,
        minimizedReason: 'SPAM',
        url: 'https://github.com/cli/cli/issues/10030#issuecomment-2',
      },
    ],
    closedByPullRequestsReferences: [
      { id: 'PR_1', number: 13787, repository: { name: 'cli', owner: { login: 'cli' } }, url: 'https://github.com/cli/cli/pull/13787' },
      { id: 'PR_2', number: 0, url: '' },
    ],
    subIssuesSummary: { completed: 2, percentCompleted: 40, total: 5 },
  };

  const captured = [];
  const exec = new GhExecutor({});
  exec.run = async (args, opts) => {
    captured.push({ args, opts });
    return { ok: true, data: VIEW };
  };

  const detail = await exec.getIssueDetail(repoDir, 10030, 'cli/cli');
  ok(detail.ok === true, 'getIssueDetail 正常路径返回 ok');

  const first = captured[0];
  const jsonIdx = first.args.indexOf('--json');
  const fields = jsonIdx >= 0 ? first.args[jsonIdx + 1] : '';
  ok(first.args[0] === 'issue' && first.args[1] === 'view' && first.args[2] === '10030', '调用 gh issue view <number>');
  ok(first.args.includes('-R') && first.args[first.args.indexOf('-R') + 1] === 'cli/cli', 'repo 经 -R 精确透传');
  for (const f of ['body', 'comments', 'milestone', 'stateReason', 'closedByPullRequestsReferences', 'subIssuesSummary']) {
    ok(fields.split(',').includes(f), `--json 字段集含 ${f}`);
  }
  ok(!fields.includes('parent') && !fields.includes('projectCards'), '不请求未消费的重字段（parent/projectCards）');

  /*
   * 阈值是本次最关键的回归点：默认 24000 字符下，实测含 149 条评论的 Issue
   * JSON 达 117KB，会被截断并跳过 JSON.parse，data 变 undefined，
   * 最终渲染出「元数据全空 + 零评论」的假详情——比报错更糟糕。
   */
  ok((first.opts?.maxOutputChars ?? 0) > 24_000, '显式放宽字符阈值（防长讨论被截断）', String(first.opts?.maxOutputChars));
  ok((first.opts?.maxOutputBytes ?? 0) >= 8 * 1024 * 1024, '显式放宽字节阈值', String(first.opts?.maxOutputBytes));
  ok(first.opts?.timeoutMs >= 15_000, '超时预算不低于 PR 详情同档');

  // ============================================================
  console.log('\n--- 3. 数据归一化 ---');
  // ============================================================
  const d = detail.data;
  ok(d.number === 10030 && d.state === 'CLOSED', '基础字段映射正确');
  ok(d.stateReason === 'COMPLETED', 'stateReason 保留（UI 需要翻译成「已完成」）');
  ok(d.closedAt === '2024-12-10T19:41:48Z', 'closedAt 保留');
  ok(d.author.login === 'bigswede74', '作者归一化');
  ok(d.labels.length === 2 && d.labels[0].name === 'bug' && d.labels[0].color === 'd73a4a', '标签名与颜色全部保留');
  ok(d.labels[0].description === "Something isn't working", '标签描述保留（作为 chip 的 title 提示）');
  ok(d.assignees.length === 1 && d.assignees[0].login === 'kommendorkapten', '指派人归一化');
  ok(d.milestone?.title === 'v1.37' && d.milestone?.number === 70, '里程碑映射');
  ok(d.milestone?.dueOn === '2026-12-01T00:00:00Z', '里程碑截止日保留');
  ok(d.isPinned === true, '置顶标记保留');
  ok(d.issueType === 'Bug', 'issueType 取 name 字段（实测为对象形态）');
  ok(d.subIssues?.completed === 2 && d.subIssues?.total === 5, '子议题摘要映射');

  ok(d.comments.length === 2, '评论全部保留');
  ok(d.comments[0].author.login === 'kommendorkapten' && d.comments[0].authorAssociation === 'CONTRIBUTOR', '评论作者与身份映射');
  ok(d.comments[0].includesCreatedEdit === true, 'includesCreatedEdit 保留（UI 显示「已编辑」）');
  ok(d.comments[1].isMinimized === true && d.comments[1].minimizedReason === 'SPAM', '被隐藏评论的 SPAM 标记保留（不得冒充正常讨论）');
  ok(d.comments[0].isMinimized === undefined, '正常评论不带 isMinimized 字段（避免无意义字段膨胀）');

  ok(d.linkedPrs.length === 1, '关联 PR 过滤掉 number=0 的脏数据');
  ok(d.linkedPrs[0].number === 13787 && d.linkedPrs[0].repository === 'cli/cli', '关联 PR 的仓库全名由 owner/name 拼接');
  ok(d.linkedPrs[0].url === 'https://github.com/cli/cli/pull/13787', '关联 PR 链接保留');

  ok(Array.isArray(d.images) && d.images.length === 2, '图片来自正文+评论合并去重', JSON.stringify(d.images));
  ok(d.images.some((u) => u.includes('user-images.githubusercontent.com')), '正文图片被识别');
  ok(d.images.some((u) => u.includes('github.com/user-attachments/')), '评论图片被识别');
  ok(d.fieldsDegraded === undefined, '正常路径不带 fieldsDegraded 标记');

  // 缺字段的极简响应也要能渲染（GH 老版本 / 仓库配置差异）
  const minimalExec = new GhExecutor({});
  minimalExec.run = async () => ({ ok: true, data: { number: 7, title: 't', state: 'open' } });
  const minimal = await minimalExec.getIssueDetail(repoDir, 7);
  ok(minimal.ok === true, '极简响应仍成功');
  ok(minimal.data.state === 'OPEN', 'state 小写归一为大写');
  ok(minimal.data.author.login === 'ghost', '缺作者时兜底 ghost');
  ok(Array.isArray(minimal.data.comments) && minimal.data.comments.length === 0, '缺评论时为数组而非 undefined');
  ok(Array.isArray(minimal.data.labels) && Array.isArray(minimal.data.assignees), '缺标签/指派人时为数组');
  ok(minimal.data.images.length === 0, '无图片时为嵌套空数组');
  ok(!('milestone' in minimal.data) && !('subIssues' in minimal.data), '缺里程碑/子议题时不产生空对象字段');

  // ============================================================
  console.log('\n--- 4. 字段降级链（老版本 gh 的 Unknown JSON field）---');
  // ============================================================
  const degradeExec = new GhExecutor({});
  const degradeCalls = [];
  degradeExec.run = async (args) => {
    const f = args[args.indexOf('--json') + 1];
    degradeCalls.push(f);
    if (degradeCalls.length === 1) {
      return { ok: false, error: 'Unknown JSON field: "closedAt"\nAvailable fields:\n  assignees\n  author' };
    }
    return { ok: true, data: { number: 8, title: 'legacy', state: 'OPEN', comments: [] } };
  };
  const degraded = await degradeExec.getIssueDetail(repoDir, 8, 'o/r');
  ok(degraded.ok === true, '未知字段失败后降级重试成功');
  ok(degraded.data.fieldsDegraded === true, '降级标记透出（供排查缺少里程碑等原因）');
  ok(degradeCalls.length === 2, '只重试一次，不进入重试风暴', String(degradeCalls.length));
  ok(degradeCalls[1].length < degradeCalls[0].length, '降级字段集更短（BASE ⊂ FULL）');
  ok(!degradeCalls[1].includes('closedByPullRequestsReferences'), '降级字段集剔除较新字段');
  ok(degradeCalls[1].includes('body') && degradeCalls[1].includes('comments'), '降级字段集仍保留正文与评论（核心内容不丢）');

  // 非字段类失败不做降级重试（否则一次网络故障要打两次）
  const permExec = new GhExecutor({});
  let permCalls = 0;
  permExec.run = async () => { permCalls++; return { ok: false, error: 'HTTP 403: Resource not accessible' }; };
  const permFail = await permExec.getIssueDetail(repoDir, 9, 'o/r');
  ok(permFail.ok === false && permCalls === 1, '非字段类失败不重试（避免重复空烧）');
  ok(String(permFail.error).includes('403'), '失败原因原样透出');

  // ============================================================
  console.log('\n--- 5. 截断必须显式失败，不得伪造空评论 ---');
  // ============================================================
  const truncExec = new GhExecutor({});
  truncExec.run = async () => ({ ok: true, truncated: true, rawOutput: 'partial', data: undefined });
  const trunc = await truncExec.getIssueDetail(repoDir, 10, 'cli/cli');
  ok(trunc.ok === false, '截断时返回失败而不是空详情');
  ok(String(trunc.error).includes('#10'), '错误文案带 Issue 编号');
  ok(String(trunc.error).includes('浏览器'), '错误文案给出浏览器查看看法');
  ok(String(trunc.error).includes('cli/cli/issues/10'), '错误文案带可直达的具体链接');

  const noDataExec = new GhExecutor({});
  noDataExec.run = async () => ({ ok: true, rawOutput: 'not json at all' });
  const noData = await noDataExec.getIssueDetail(repoDir, 11);
  ok(noData.ok === false, 'JSON 解析缺失时同样显式失败');

  // ============================================================
  console.log('\n--- 6. 路由：注册与 HTTP 语义 ---');
  // ============================================================
  const captured2 = {};
  const fakeDeps = { bindRoute: (route) => { captured2[route.path] = route.handler; }, sendJson: () => {}, readJsonBody: async () => ({}) };
  const routeExec = new GhExecutor({});
  routeExec.getIssueDetail = async (cwd, number, repo) => ({ ok: true, data: { number, repo } });
  registerActionRoutes(fakeDeps, routeExec, noopCache, noopCache);

  ok(typeof captured2['/api/github/issue-detail'] === 'function', 'issue-detail 路由通过 bindRoute 注册（Cordis effect 纳管）');

  const okRes = makeRes();
  await captured2['/api/github/issue-detail'](
    { method: 'GET', url: '/api/github/issue-detail?number=10030&repo=cli/cli' },
    okRes
  );
  ok(okRes.status === 200 && okRes.payload?.data?.number === 10030, 'GET 正常路径返回 200 且编号正确');
  ok(okRes.payload?.data?.repo === 'cli/cli', 'repo 参数正确透传给 executor');
  ok(okRes.headers['Content-Type'] === 'application/json; charset=utf-8', '响应头 Content-Type 正确');

  const badMethodRes = makeRes();
  await captured2['/api/github/issue-detail']({ method: 'POST', url: '/api/github/issue-detail?number=1' }, badMethodRes);
  ok(badMethodRes.status === 405, '非 GET 请求返回 405（方法白名单）');

  const captured3 = {};
  const failRouteExec = new GhExecutor({});
  failRouteExec.getIssueDetail = async () => ({ ok: false, error: 'Issue 不存在' });
  registerActionRoutes({ ...fakeDeps, bindRoute: (route) => { captured3[route.path] = route.handler; } }, failRouteExec, noopCache, noopCache);
  const failRes = makeRes();
  await captured3['/api/github/issue-detail']({ method: 'GET', url: '/api/github/issue-detail?number=999' }, failRes);
  ok(failRes.status === 400 && failRes.payload?.error === 'Issue 不存在', 'executor 失败时路由返回 400 并透出原因');

  const captured4 = {};
  const throwRouteExec = new GhExecutor({});
  throwRouteExec.getIssueDetail = async () => { throw new Error('意外崩溃'); };
  registerActionRoutes({ ...fakeDeps, bindRoute: (route) => { captured4[route.path] = route.handler; } }, throwRouteExec, noopCache, noopCache);
  const throwRes = makeRes();
  await captured4['/api/github/issue-detail']({ method: 'GET', url: '/api/github/issue-detail?number=1' }, throwRes);
  ok(throwRes.status === 500, 'handler 内部异常被兜底为 500（不打挂服务）');

  // action 通道（与 pr_detail 对称）
  const { EventEmitter } = await import('node:events');
  const bodyRoutes = {};
  const actionExec = new GhExecutor({});
  let actionArgs = null;
  actionExec.getIssueDetail = async (cwd, number, repo) => { actionArgs = { cwd, number, repo }; return { ok: true, data: { number } }; };
  registerActionRoutes({ ...fakeDeps, bindRoute: (route) => { bodyRoutes[route.path] = route.handler; } }, actionExec, noopCache, noopCache);

  const actionReq = new EventEmitter();
  actionReq.method = 'POST';
  actionReq.url = '/api/github/action';
  actionReq.destroy = () => {};
  const actionRes = makeRes();
  const pendingAction = bodyRoutes['/api/github/action'](actionReq, actionRes);
  actionReq.emit('data', Buffer.from(JSON.stringify({ action: 'issue_detail', number: 42, repo: 'o/r', cwd: repoDir })));
  actionReq.emit('end');
  await pendingAction;
  ok(actionRes.status === 200 && actionRes.payload?.data?.number === 42, 'action 通道 issue_detail 可用');
  ok(actionArgs?.number === 42 && actionArgs?.repo === 'o/r', 'action 参数正确透传');
  ok(actionArgs?.cwd === repoDir, 'action 分支的 cwd 透传（不串到其他工作区）');

  // ============================================================
  console.log('\n--- 7. 前端接线：两处列表与布局纪律 ---');
  // ============================================================
  const panelSrc = fs.readFileSync(path.join(__dirname, '../src/ui/workspace-panel.ts'), 'utf8');
  ok(panelSrc.includes('IssueDetailModal'), '主面板挂载 IssueDetailModal');
  ok(panelSrc.includes('setActiveIssueModal('), '主面板点击 Issue 唤起弹窗');
  const panelIssueStart = panelSrc.indexOf('filteredIssues.map((is: any)');
  const panelIssueBlock = panelIssueStart >= 0 ? panelSrc.slice(panelIssueStart, panelIssueStart + 3200) : '';
  ok(panelIssueBlock.length > 0, '成功定位主面板 Issue 渲染块');
  ok(panelIssueBlock.includes('dsh-github-pr-title-row'), '主面板：标题与徽章/按钮同行');
  ok(panelIssueBlock.includes('GitHub ↗'), '主面板：外跳按钮有明确文字标签');
  ok(/dsh-github-pr-gh-btn[\s\S]{0,400}stopPropagation/.test(panelIssueBlock), '主面板：外跳按钮 stopPropagation（不连带开弹窗）');
  ok(!/h\(\s*"a",\s*\{\s*className:\s*"dsh-github-item-title"/.test(panelIssueBlock), '主面板：标题不再是 <a>（点击进弹窗）');
  const panelCardStyle = panelIssueBlock.slice(0, panelIssueBlock.indexOf('dsh-github-pr-title-row'));
  ok(!/style:\s*\{[^}]*display:\s*"flex"/.test(panelCardStyle), '主面板：Issue 卡片容器不得内联 display:flex（会顶掉 column 布局）');
  ok(!/style:\s*\{[^}]*alignItems/.test(panelCardStyle), '主面板：Issue 卡片容器不得内联 alignItems');

  const clientSrc = fs.readFileSync(path.join(__dirname, '../src/client.ts'), 'utf8');
  ok(clientSrc.includes("from './ui/issue-modal.js'"), '右侧栏导入 IssueDetailModal');
  ok(clientSrc.includes('onSelectIssue'), '右侧栏渲染器接收 onSelectIssue 回调');
  ok(/onSelectPr[^)]*\)[\s\S]{0,200}onSelectIssue/.test(clientSrc), 'onSelectIssue 追加在形参末尾（不打乱既有位置参数）');
  ok(clientSrc.includes('setActiveIssue(target)'), '右侧栏点击接线到 activeIssue 状态');
  // 锚点从 'issues.map(' 改为 'filteredIssues.map(' —— phase32 加了状态筛选，
  // 渲染对象换成过滤后的数组。断言内容不变，仅跟随实现演进。
  const clientIssueStart = clientSrc.indexOf('filteredIssues.map((issue: any) =>');
  const clientIssueBlock = clientIssueStart >= 0 ? clientSrc.slice(clientIssueStart, clientIssueStart + 3200) : '';
  ok(clientIssueBlock.length > 0, '成功定位右侧栏 Issue 渲染块');
  ok(clientIssueBlock.includes('dsh-github-pr-title-row'), '右侧栏：标题与徽章/按钮同行');
  ok(/dsh-github-pr-gh-btn[\s\S]{0,400}stopPropagation/.test(clientIssueBlock), '右侧栏：外跳按钮 stopPropagation');
  ok(!/h\(\s*"a",\s*\{\s*className:\s*"dsh-github-item-title"/.test(clientIssueBlock), '右侧栏：标题不再是 <a>');
  ok(/state \|\| ""\)\.toUpperCase\(\)/.test(clientIssueBlock), '右侧栏：Issue 状态徽章存在（OPEN/CLOSED 可区分）');

  // ============================================================
  console.log('\n--- 8. React Hooks 铁律 + bundle + CSS ---');
  // ============================================================
  const modalSrc = fs.readFileSync(path.join(__dirname, '../src/ui/issue-modal.ts'), 'utf8');
  const fnStart = modalSrc.search(/export function IssueDetailModal/);
  // Hook 必须在本组件体内定位：模块内更早的 IssueImageList 也用了 useState，
  // 从文件头搜第一个 Hook 会误判成「组件没有 Hook」。
  const componentBody = fnStart >= 0 ? modalSrc.slice(fnStart) : '';
  const firstHookRel = componentBody.search(/React\.use(State|Effect|Ref|Memo|Callback)\s*\(/);
  ok(fnStart >= 0 && firstHookRel > 0, 'IssueDetailModal 内存在 Hook');
  const bodyBeforeHook = componentBody.slice(0, firstHookRel);
  ok(!/^\s*if\s*\([^)]*\)\s*return\s+null\s*;/m.test(bodyBeforeHook), '首个 Hook 之前禁止 early return null（Hooks 顺序铁律）');
  /*
   * 更严的约束：early return 必须排在**全部** Hook（含 useEffect）之后。
   * 只挡住 useState 不够——曾经 4 个 useState 在 return 之前、2 个 useEffect 在
   * 之后，首帧与次帧的 Hook 序列长度不同，同样违反 React 的调用顺序铁律。
   */
  const earlyReturnIdx = modalSrc.indexOf('if (!issueNumber) return null;');
  const allHookIdx = [...modalSrc.matchAll(/React\.use(State|Effect|Ref|Memo|Callback)\s*\(/g)].map((m) => m.index);
  const firstHookAfterFn = allHookIdx.filter((i) => i > fnStart);
  ok(earlyReturnIdx > fnStart, 'early return 位于组件体内');
  ok(
    firstHookAfterFn.every((i) => i < earlyReturnIdx),
    'early return 排在全部 Hook 之后（含 useEffect）',
    `hooks=${firstHookAfterFn.length} returnAt=${earlyReturnIdx}`
  );
  ok(/if \(!issueNumber\) return null;/.test(componentBody.slice(firstHookRel)), 'early return 位于全部 Hook 之后');
  ok(modalSrc.includes('IssueCommentCard') && modalSrc.indexOf('function IssueCommentCard') < fnStart, '评论卡片定义在组件外（引用稳定，折叠状态不被重置）');
  ok(modalSrc.includes('CollapsibleBody'), '复用 PR 弹窗的折叠组件');
  ok(/CollapsibleBody,\s*\{\s*text:\s*d\.body/.test(modalSrc), 'Issue 正文经 Markdown 渲染');
  ok(/CollapsibleBody,\s*\{\s*text:\s*c\.body/.test(modalSrc), '评论经 Markdown 渲染');
  ok(modalSrc.includes('role: "dialog"') && modalSrc.includes('"aria-modal": "true"'), '弹窗具备 dialog 无障碍语义');
  ok(modalSrc.includes('aria-label'), '关闭按钮具备 aria-label');
  ok(!modalSrc.includes('dangerouslySetInnerHTML'), '零 innerHTML（免疫 XSS）');
  ok(modalSrc.includes('已隐藏'), '被隐藏评论有显式徽章');

  const bundle = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
  ok(bundle.includes('IssueDetailModal'), 'bundle 内联 IssueDetailModal');
  ok(bundle.includes('/api/github/issue-detail'), 'bundle 请求 issue-detail 端点');
  ok(bundle.includes('dsh-github-issue-modal-dialog'), 'bundle 含 Issue 弹窗样式类');
  ok(!/\bexport\s+(async\s+)?(function|const|var|let|class)\b/.test(bundle), 'bundle 无裸 export 残留（浏览器安全）');

  // 模块顺序：markdown-lite < pr-modal < issue-modal，否则 CollapsibleBody 引用为 undefined
  const mdIdx = bundle.indexOf('[Bundled: markdown-lite.js]');
  const prIdx = bundle.indexOf('[Bundled: pr-modal.js]');
  const issueIdx = bundle.indexOf('[Bundled: issue-modal.js]');
  ok(mdIdx >= 0 && prIdx >= 0 && issueIdx >= 0, '三个模块均已内联');
  ok(mdIdx < prIdx && prIdx < issueIdx, '内联顺序 markdown-lite → pr-modal → issue-modal', `md=${mdIdx} pr=${prIdx} issue=${issueIdx}`);

  const css = fs.readFileSync(path.join(__dirname, '../lib/ui/styles.js'), 'utf8');
  ok(css.includes('.dsh-github-issue-modal-dialog'), 'styles 含 Issue 弹窗尺寸');
  ok(css.includes('.dsh-github-issue-conversation-pane'), 'styles 含会话滚动容器');
  ok(css.includes('body[data-ds-dark-theme] .dsh-github-issue-modal-header'), 'Issue 弹窗适配暗色主题');
  const issuePaneRule = css.slice(css.indexOf('.dsh-github-issue-conversation-pane {'));
  const issuePaneBody = issuePaneRule.slice(0, issuePaneRule.indexOf('}'));
  ok(issuePaneBody.includes('overflow-y: auto'), 'Issue 会话区可纵向滚动');
  ok(issuePaneBody.includes('overscroll-behavior: contain'), '滚动不穿透到弹窗外层');
  const issueCardRule = css.slice(css.indexOf('.dsh-github-issue-comment-card {'));
  ok(issueCardRule.slice(0, issueCardRule.indexOf('}')).includes('flex: 0 0 auto'), '评论卡片禁止 flex 收缩（否则父容器滚不动）');
  ok(css.includes('.dsh-github-issue-chip'), '元数据胶囊样式存在');
  ok(css.includes('.dsh-github-issue-chip-overdue'), '逾期里程碑有独立样式（与正常 milestone 区分）');

  // ============================================================
  console.log('\n--- 9. 里程碑截止日：未来时间不得渲染成「刚刚截止」 ---');
  // ============================================================
  /*
   * 真实 Bug 回归：formatRelativeTime 把所有未来时间归一成「刚刚」
   * （utils.ts: `if (diff < 0) return "刚刚"`，那是给永不为未来的更新时间的）。
   * 里程碑 dueOn 绝大多数在未来，直接套用会把「30 天后到期」渲染成「刚刚截止」。
   */
  ok(!/formatRelativeTime\(d\.milestone\.dueOn\)/.test(modalSrc), '里程碑不再使用 formatRelativeTime（未来时间会被吞成「刚刚」）');
  ok(modalSrc.includes('function formatDueDate'), '新增 formatDueDate 专门处理未来日期');
  // 行为验证：从编译产物里抠出函数实跑，不能只断言源码里存在某个字符串
  const builtModal = fs.readFileSync(path.join(__dirname, '../lib/ui/issue-modal.js'), 'utf8');
  const dueStart = builtModal.indexOf('function formatDueDate');
  const dueFnSrc = builtModal.slice(dueStart, builtModal.indexOf('\n}', dueStart) + 2);
  const dueFn = new Function(dueFnSrc + '\nreturn formatDueDate;')();
  const day = 86400000;
  ok(dueFn(new Date(Date.now() + 30 * day).toISOString()).includes('后到期'), '30 天后 → 未来语义', dueFn(new Date(Date.now() + 30 * day).toISOString()));
  ok(dueFn(new Date(Date.now() + 1 * day).toISOString()) === '明天到期', '1 天后 → 明天到期', dueFn(new Date(Date.now() + 1 * day).toISOString()));
  ok(dueFn(new Date(Date.now() + 400 * day).toISOString()).includes('年后到期'), '400 天后 → 年后到期', dueFn(new Date(Date.now() + 400 * day).toISOString()));
  ok(dueFn(new Date(Date.now() - 5 * day).toISOString()).includes('已逾期 5 天'), '过去 5 天 → 已逾期 5 天', dueFn(new Date(Date.now() - 5 * day).toISOString()));
  ok(dueFn(new Date(Date.now() - 400 * day).toISOString()).includes('已逾期'), '超期一年 → 已逾期（不渲染成「1年前到期」）');
  ok(dueFn('not-a-date') === '', '非法日期返回空串（不渲染垃圾文案）');
  ok(dueFn(null) === '', 'null 返回空串不抛错');
  // 反向守卫：旧实现的关键证据必须消失——未来日期绝不能出现「截止」二字紧跟相对时间
  ok(!dueFn(new Date(Date.now() + 30 * day).toISOString()).includes('刚刚'), '未来日期不再被吞成「刚刚」');

  // 内联 CSS 完整性（沿用 phase29 的防回退口径）
  const cssVarMatch = bundle.match(/(?:var|const) GITHUB_PANEL_CSS = `([\s\S]*?)`;/);
  const inlinedCss = cssVarMatch ? cssVarMatch[1] : '';
  ok(!inlinedCss.includes('/*') && !inlinedCss.includes('*/'), '内联 CSS 无注释残留');
  const openBraces = (inlinedCss.match(/\{/g) || []).length;
  const closeBraces = (inlinedCss.match(/\}/g) || []).length;
  ok(openBraces > 300 && openBraces === closeBraces, `内联 CSS 花括号配平（${openBraces} 对）`);

  cleanup();

  console.log('\n========================================');
  console.log(`Phase 31 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  cleanup();
  process.exit(1);
});
