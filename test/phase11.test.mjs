// test/phase11.test.mjs - Phase 11 · 面板信息增强断言
// （相对时间/CI 聚合归约/git 状态解析/端点契约/白名单安全）
//
// client.ts 是经典脚本语义产物（build.mjs 剥 export），纯函数不可直接 import——
// 因此组 1/2（formatRelativeTime/rollupCiStatus）经正则从源码提取函数体后 eval
// 执行（与 lib 产物同源文本），组 3-5 走 lib/executor.js 正常导入。

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

async function runTests() {
  let passed = 0;
  let total = 0;
  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
    }
  }

  // client 纯函数提取：lib/client.js 是构建产物（类型已剥除的经典脚本），
  // 但整文件 require 会执行 DOM 相关副作用——只提取四个函数体（纯 JS 文本）
  // 经 Function 沙箱执行，与产物逐字符同源（比从 TS 源转译更真实）。
  const builtClient = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  function extractFnJs(name) {
    const start = builtClient.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`${name} not found in lib/client.js`);
    let depth = 0, i = builtClient.indexOf('{', start);
    for (let j = i; j < builtClient.length; j++) {
      if (builtClient[j] === '{') depth++;
      if (builtClient[j] === '}') { depth--; if (depth === 0) return builtClient.slice(start, j + 1); }
    }
    throw new Error(`${name} unbalanced`);
  }
  const clientFns = new Function(
    ['formatRelativeTime', 'rollupCiStatus', 'reviewDecisionBadge', 'eventLabel'].map(extractFnJs).join('\n') +
    '\nreturn { formatRelativeTime, rollupCiStatus, reviewDecisionBadge, eventLabel };'
  )();

  // --- 1. 相对时间 ---
  console.log('\n--- 1. relative time ---');
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  assert(clientFns.formatRelativeTime(iso(30 * 1000)) === '刚刚', '30s → 刚刚');
  assert(clientFns.formatRelativeTime(iso(5 * 60 * 1000)) === '5分钟前', '5min → N分钟前');
  assert(clientFns.formatRelativeTime(iso(3 * 3600 * 1000)) === '3小时前', '3h → N小时前');
  assert(clientFns.formatRelativeTime(iso(2 * 24 * 3600 * 1000)) === '2天前', '2d → N天前');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(clientFns.formatRelativeTime(iso(30 * 24 * 3600 * 1000))), '30d → 日期回退');
  assert(clientFns.formatRelativeTime(iso(-60 * 1000)) === '刚刚', '时钟漂移（未来时间）容错为刚刚');
  assert(clientFns.formatRelativeTime('') === '' && clientFns.formatRelativeTime(null) === '' && clientFns.formatRelativeTime('garbage') === '', '空值/非法值返回空串');

  // --- 2. CI 聚合归约（fail > pending > pass 顺序钉死）---
  console.log('\n--- 2. CI rollup ---');
  const mk = (arr) => arr.map(([status, conclusion]) => ({ status, conclusion }));
  assert(clientFns.rollupCiStatus(mk([['completed', 'success'], ['completed', 'success']])) === 'pass', 'all success → pass');
  assert(clientFns.rollupCiStatus(mk([['completed', 'success'], ['completed', 'failure']])) === 'fail', 'one failure dominates');
  assert(clientFns.rollupCiStatus(mk([['completed', 'success'], ['in_progress', '']])) === 'pending', 'in_progress → pending');
  assert(clientFns.rollupCiStatus(mk([['in_progress', ''], ['completed', 'failure']])) === 'fail', 'fail beats pending (order D1)');
  assert(clientFns.rollupCiStatus(mk([['completed', 'skipped']])) === 'pass', 'skipped counts as pass-family');
  assert(clientFns.rollupCiStatus([]) === null && clientFns.rollupCiStatus(undefined) === null, 'empty → null (no badge)');
  const rv1 = clientFns.reviewDecisionBadge('APPROVED');
  const rv2 = clientFns.reviewDecisionBadge('CHANGES_REQUESTED');
  const rv3 = clientFns.reviewDecisionBadge('REVIEW_REQUIRED');
  assert(rv1 && rv1.kind === 'green' && rv2 && rv2.kind === 'red' && rv3 && rv3.kind === 'yellow', 'review decision badges mapped');
  assert(clientFns.reviewDecisionBadge('') === null && clientFns.reviewDecisionBadge(undefined) === null, 'no review decision → null');
  assert(clientFns.eventLabel('push') === '⇡ push' && clientFns.eventLabel('schedule') === '⏰ 定时' && clientFns.eventLabel('workflow_dispatch') === '▶ 手动', 'event labels mapped');

  // --- 3. parseGitStatusOutput（git status -sb --porcelain 三形态）---
  console.log('\n--- 3. parseGitStatusOutput ---');
  const { GhExecutor, parseGitStatusOutput } = await import('../lib/executor.js');

  const s1 = parseGitStatusOutput('## master...origin/master [ahead 2, behind 1]\n M src/a.ts\n?? new file.ts\nA  docs/b.md');
  assert(s1 && s1.branch === 'master' && s1.ahead === 2 && s1.behind === 1 && s1.hasUpstream === true, 'ahead+behind 形态解析');
  assert(s1.dirtyCount === 3 && s1.dirtyFiles.length === 3 && s1.dirtyFiles[1].status === '??', 'porcelain 计数与 ?? 状态');
  assert(s1.dirtyFiles[0].path === 'src/a.ts', 'porcelain 路径（含前导空格偏移）');

  const s2 = parseGitStatusOutput('## main...origin/main');
  assert(s2 && s2.ahead === 0 && s2.behind === 0 && s2.dirtyCount === 0, '同步形态（无箭头段 → 0/0）');

  const s3 = parseGitStatusOutput('## feature-x\n M a.ts');
  assert(s3 && s3.hasUpstream === false && s3.ahead === -1 && s3.behind === -1, '无 upstream → -1 未知');

  const s4 = parseGitStatusOutput('## HEAD (no branch)\n');
  assert(s4 && s4.branch === 'HEAD' && s4.hasUpstream === false, 'detached HEAD 形态');

  const s5 = parseGitStatusOutput('## dev...origin/dev #12 [ahead 1]\nR  old.ts -> new.ts');
  assert(s5 && s5.ahead === 1 && s5.behind === 0 && s5.dirtyFiles[0].path === 'new.ts', 'PR 标记共存 + rename 箭头取 new');

  const s6 = parseGitStatusOutput('');
  assert(s6 === null, '空输出 → null');
  const s7 = parseGitStatusOutput(' M no-branch-line.ts');
  assert(s7 === null, '缺 ## 头行 → null（非 status 输出防误解析）');
  // 截断 20 条
  const manyLines = ['## m...o/m'].concat(Array.from({ length: 30 }, (_, i) => ` M f${i}.ts`)).join('\n');
  const s8 = parseGitStatusOutput(manyLines);
  assert(s8.dirtyCount === 30 && s8.dirtyFiles.length === 20, 'dirtyFiles 截断 20 条（dirtyCount 保留全量）');

  // --- 4. 端点契约（mock executor：新字段并入响应）---
  console.log('\n--- 4. endpoint contracts ---');
  {
    // search prs 字段集含 isDraft（源码断言——端点在 routes-overview.ts）
    const routeSrc = readFileSync(new URL('../src/api/routes-overview.ts', import.meta.url), 'utf8');
    assert(routeSrc.includes("'search', 'prs', '--author=@me', '--state=open', '--limit', '10', '--json', 'number,title,repository,url,updatedAt,isDraft'"), 'global myPrs field set includes isDraft');
    assert(routeSrc.includes("['release', 'view', '--json', 'tagName,isPrerelease,isDraft,publishedAt,url'"), 'release view 5-field conservative set');
    assert(routeSrc.includes("['pr', 'status', '-c', '--json', 'number,title,state,url,isDraft'"), 'pr status -c 5-field set');
    // 实测键集钉死：createdBy/needsReview（臆断的 currentBranch 不存在——e2e 抓到）
    assert(routeSrc.includes('r.data?.createdBy') && routeSrc.includes('r.data?.needsReview') && !routeSrc.includes('currentBranch'), 'branchPr reads real gh keys (createdBy/needsReview), never rawText');
    assert(routeSrc.includes('getLocalGitStatus'), 'both endpoints wired to git channel');
    // types 契约：新字段全部可选（向后兼容——旧快照零破坏）
    const typesSrc = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
    assert(typesSrc.includes('gitStatus?: GitLocalStatus | null') && typesSrc.includes('releaseInfo?') && typesSrc.includes('branchPr?'), 'overview extras are optional fields');
  }

  // --- 5. 白名单安全（spawn 参数恰为形态常量）---
  console.log('\n--- 5. git whitelist safety ---');
  {
    // ESM 模块命名空间冻结不可 monkey-patch——改拦 executor 内部使用的
    // promisify(execFile) 包装不了类方法的事实：executor.js 的 execFileAsync
    // 是模块加载时固化的。换思路：子类覆写不需要——getLocalGitStatus 直接
    // spawn 常量，真实 spawn 在沙箱会 EPERM（phase5/10 同况），恰好让
    // catch 分支的 null 降级被真实覆盖；参数白名单的静态断言经源码字面量钉死。
    const exec = new GhExecutor();
    const r = await exec.getLocalGitStatus('D:/definitely/not/a/repo');
    assert(r === null, 'failed probe degrades to null, no throw (catch branch real-covered)');

    const execSrc = readFileSync(new URL('../src/executor.ts', import.meta.url), 'utf8');
    const m = /execFileAsync\('git',\s*\[([^\]]+)\]/.exec(execSrc);
    assert(!!m, 'git channel uses execFileAsync with array literal');
    const argStr = m ? m[1].replace(/['"\s]/g, '') : '';
    assert(argStr === 'status,-sb,--porcelain', `args are exactly the whitelist literal (got: ${argStr})`);
    assert(!/execFileAsync\('git',\s*\[\s*\.\.\./.test(execSrc), 'no spread of user input into git args (physical write-barrier)');
  }

  // --- 6. Tab 化改造（结构/默认态/降级/多宿主隔离）---
  console.log('\n--- 6. rightbar tabs restructure ---');
  {
    const clientSrc = readFileSync(new URL('../src/client.ts', import.meta.url), 'utf8');
    const builtClient2 = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

    // 6.1 五 Tab 定义 + 计数徽章
    assert(clientSrc.includes('key: "prs"') && clientSrc.includes('key: "issues"') && clientSrc.includes('key: "runs"') && clientSrc.includes('key: "git"') && clientSrc.includes('key: "dirty"'), 'five tab keys defined');
    assert(clientSrc.includes('t.count !== null ? `${t.label} (${t.count})` : t.label'), 'tab labels carry counts');

    // 6.2 DOM 级互斥：data-tab-page hidden + data-tab-btn active（无 React state）
    assert(clientSrc.includes('"data-tab-page"') && clientSrc.includes('"data-tab-btn"') && clientSrc.includes('data-active-tab'), 'DOM-level tab state via data-* attributes');
    assert(clientSrc.includes('.hidden = page.getAttribute("data-tab-page") !== tabKey'), 'switchTab toggles hidden by page key');

    // 6.3 默认 Tab：Git 优先（Git 工作区），非 Git 降级 PR / 空 PR 降 Issues
    assert(clientSrc.includes('var defaultTab = gitSt ? "git" : (prs.length === 0 && issues.length > 0 ? "issues" : "prs")'), 'default tab is Git first, degrades to PR/Issues');
    const defOrder = clientSrc.indexOf('key: "git"') < clientSrc.indexOf('key: "dirty"') && clientSrc.indexOf('key: "dirty"') < clientSrc.indexOf('key: "prs"');
    assert(defOrder, 'tab order: git → dirty → prs → issues → runs');

    // 6.4 降级：无 gitStatus 时 git/dirty 两 Tab 过滤
    assert(/t\.key === "git" \|\| t\.key === "dirty"/.test(clientSrc) && clientSrc.includes('&& !gitSt) return false'), 'git/dirty tabs hidden when no gitStatus');

    // 6.5 无模块级可变 Tab 状态（多宿主隔离）
    assert(!/^ {4}var activeTab/m.test(clientSrc), 'no module-level mutable activeTab (per-instance DOM state only)');

    // 6.6 产物结构：两新页存在；Git 记录页聚合分支PR与Release；原三区块包裹保留
    assert(builtClient2.includes('Git 记录') && builtClient2.includes('未提交清单'), 'two new tab pages present in built client');
    assert(clientSrc.includes('PR #${branchPr.number}') && clientSrc.includes('relInfo.tagName'), 'git page aggregates branch PR + release anchor');
    assert(clientSrc.includes('{ "data-tab-page": "prs", hidden: defaultTab !== "prs" }, prSectionEl'), 'prSection preserved inside tab page wrapper');

    // 6.7 SWR 重渲染校正：宿主组件 effect 按容器 data-active-tab 重新应用（用户选择不丢）
    assert(clientSrc.includes('data-active-tab")') && clientSrc.includes('applyTabState(container, active)') && clientSrc.includes('[data]'), 'SWR re-render re-applies user tab choice via effect');
    assert(clientSrc.includes('function applyTabState('), 'applyTabState is module-level (shared by click path and effect path)');
  }

  // --- 7. Git 提交记录三段视图（getGitCommitLog / parseGitLogLines）---
  console.log('\n--- 7. git commit log ---');
  {
    const { parseGitLogLines } = await import('../lib/executor.js');

    // 7.1 解析纯函数
    const lines = parseGitLogLines('941f26f|newany|2 hours ago|docs: README 同步\n2578e15|newany|3 hours ago|feat: a|b|c 主题含竖线');
    assert(lines.length === 2 && lines[0].sha === '941f26f' && lines[0].author === 'newany' && lines[0].relative === '2 hours ago', 'entry fields parsed');
    assert(lines[1].subject === 'feat: a|b|c 主题含竖线', 'subject preserves pipe chars (rejoined after split)');
    assert(parseGitLogLines('').length === 0 && parseGitLogLines(null).length === 0, 'empty input → []');

    // 7.2 白名单：git log 命令形态常量（无用户输入拼接）
    const execSrc = readFileSync(new URL('../src/executor.ts', import.meta.url), 'utf8');
    assert(execSrc.includes("['log', `-${Math.max(1, limit)}`, logFmt, '--stat', '--no-decorate']"), 'recent log is hardcoded literal with limit');
    assert(execSrc.includes("['log', '@{u}..HEAD', logFmt, '--stat', '--no-decorate']") && execSrc.includes("['log', 'HEAD..@{u}', logFmt, '--stat', '--no-decorate']"), 'ahead/behind ranges are two fixed literals');

    // 7.3 端点接线：overview 含 commitLog 可选字段（在 gitStatus 之后串行）
    const routeSrc = readFileSync(new URL('../src/api/routes-overview.ts', import.meta.url), 'utf8');
    assert(routeSrc.includes('getGitCommitLog(cwd, gitStatus ? gitStatus.hasUpstream : false)'), 'overview wires commitLog after gitStatus (hasUpstream guard)');
    const typesSrc = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
    assert(typesSrc.includes('commitLog?: GitCommitLog | null'), 'commitLog optional in contract');

    // 7.4 前端三段渲染存在
    const builtC = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
    assert(builtC.includes('本地领先远程') && builtC.includes('远程领先本地') && builtC.includes('最近提交'), 'three sections rendered in git tab');
  }

  // --- 8. 提交详情弹窗与接口（getGitCommitDetail / commit-detail 路由）---
  console.log('\n--- 8. commit detail modal & route ---');
  {
    const { GhExecutor } = await import('../lib/executor.js');
    const exec = new GhExecutor();

    // 8.1 安全校验：非十六进制 sha 物理拦截（防命令注入）
    const bad1 = await exec.getGitCommitDetail(process.cwd(), 'invalid;rm -rf /');
    assert(bad1 === null, 'non-hex sha rejected by regex (returns null)');
    const bad2 = await exec.getGitCommitDetail(process.cwd(), '12'); // 过短
    assert(bad2 === null, 'too short sha (<4 chars) rejected');

    // 8.2 真实读取本仓库 commit 详情（941f26f 必定存在）
    const detail = await exec.getGitCommitDetail(process.cwd(), '941f26f');
    assert(typeof detail === 'string' && detail.includes('941f26f') && detail.includes('README'), 'real commit detail fetched with stat output');

    // 8.3 路由契约（mock webServer 检验 HTTP 语义）
    const registered = {};
    const fakeCtx = {
      webServer: { exact: new Map(), prefixes: new Map(), register: (r) => { registered[r.path] = r.handler; return () => {}; } },
      effect: (fn) => { fn(); return () => {}; },
    };
    const { registerOverviewRoutes } = await import('../lib/api/routes-overview.js');
    const { TtlCache } = await import('../lib/cache.js');
    const deps = {
      bindRoute: (r) => { registered[r.path] = r.handler; },
      sendJson: (res, code, data) => { res.statusCode = code; res.body = JSON.stringify(data); },
      readJsonBody: async () => ({}),
    };
    registerOverviewRoutes(deps, exec, new TtlCache(1000), new TtlCache(1000), { getQuickStatus: () => null });

    const handler = registered['/api/github/commit-detail'];
    assert(typeof handler === 'function', 'commit-detail route registered');

    function makeMockRes() {
      let status = 0;
      let body = '';
      return {
        setHeader() {},
        end(d) { body = d; },
        get statusCode() { return status; },
        set statusCode(v) { status = v; },
        get body() { return body; },
      };
    }

    // POST 请求被拒
    let res1 = makeMockRes();
    await handler({ method: 'POST', url: '/api/github/commit-detail' }, res1);
    assert(res1.statusCode === 405, 'non-GET rejected with 405');

    // 非法 sha 返回 400
    let res2 = makeMockRes();
    await handler({ method: 'GET', url: '/api/github/commit-detail?sha=not-a-sha!!' }, res2);
    assert(res2.statusCode === 400, 'malformed sha rejected with 400');

    // 合法但在当前仓库不存在的 sha 返回 404
    let res3 = makeMockRes();
    await handler({ method: 'GET', url: '/api/github/commit-detail?sha=0000000000000000000000000000000000000000' }, res3);
    assert(res3.statusCode === 404, 'non-existent commit returns 404');

    // 真实存在的 sha 返回 200 + detail
    let res4 = makeMockRes();
    const query = `/api/github/commit-detail?sha=941f26f&cwd=${encodeURIComponent(process.cwd())}`;
    await handler({ method: 'GET', url: query }, res4);
    assert(res4.statusCode === 200, 'valid commit returns 200');
    const parsed = JSON.parse(res4.body);
    assert(parsed.ok === true && typeof parsed.detail === 'string' && parsed.detail.includes('941f26f'), 'response body contains detail');

    // 8.4 客户端产物断言：CommitDetailModal 模态弹窗与行级类名存在
    const builtClient = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
    assert(builtClient.includes('CommitDetailModal') && builtClient.includes('dsh-github-commit-row'), 'client contains CommitDetailModal and row class');
    assert(builtClient.includes('fullSha') && builtClient.includes('c.body'), 'modal renders full commit body and sha from memory (zero-network)');
  }

  // --- 9. 提交记录分页与下滚加载（getGitRecentLog / git-log 路由）---
  console.log('\n--- 9. commit pagination & scroll loading ---');
  {
    const { GhExecutor } = await import('../lib/executor.js');
    const exec = new GhExecutor();

    // 9.1 getGitRecentLog 默认拉取 15 条并返回 totalCount
    const page1 = await exec.getGitRecentLog(process.cwd(), 15, 0);
    assert(page1.commits.length === 15, 'recent log page 1 fetches exactly 15 commits');
    assert(typeof page1.totalCount === 'number' && page1.totalCount >= 15, 'totalCount returned correctly');
    assert(page1.commits[0].sha && page1.commits[0].subject, 'commits have sha and subject');

    // 9.2 分页 skip 偏移测试（第 2 页第一条不同于第 1 页第一条）
    const page2 = await exec.getGitRecentLog(process.cwd(), 15, 15);
    assert(page2.commits.length === 15, 'recent log page 2 fetches 15 commits');
    assert(page2.commits[0].sha !== page1.commits[0].sha, 'page 2 is shifted by skip offset');

    // 9.3 路由契约 /api/github/git-log
    const registered = {};
    const { registerOverviewRoutes } = await import('../lib/api/routes-overview.js');
    const { TtlCache } = await import('../lib/cache.js');
    const deps = {
      bindRoute: (r) => { registered[r.path] = r.handler; },
      sendJson: (res, code, data) => { res.statusCode = code; res.body = JSON.stringify(data); },
      readJsonBody: async () => ({}),
    };
    registerOverviewRoutes(deps, exec, new TtlCache(1000), new TtlCache(1000), { getQuickStatus: () => null });
    const logHandler = registered['/api/github/git-log'];
    assert(typeof logHandler === 'function', 'git-log route registered');

    // mock GET 请求
    function makeMockRes() {
      let status = 0, body = '';
      return {
        setHeader() {},
        end(d) { body = d; },
        get statusCode() { return status; },
        set statusCode(v) { status = v; },
        get body() { return body; },
      };
    }
    let res = makeMockRes();
    await logHandler({ method: 'GET', url: `/api/github/git-log?limit=15&skip=0&cwd=${encodeURIComponent(process.cwd())}` }, res);
    assert(res.statusCode === 200, 'git-log endpoint returns 200');
    const json = JSON.parse(res.body);
    assert(json.ok === true && json.data.commits.length === 15, 'git-log response data contains 15 commits');

    // 9.4 客户端产物断言：支持下滚与点击加载更多
    const builtClient = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
    assert(builtClient.includes('loadMoreCommits') && builtClient.includes('extraCommits'), 'client contains pagination state and loadMoreCommits');
    assert(builtClient.includes('下滑或点击加载更多') && builtClient.includes('git-log'), 'client renders load-more trigger and git-log URL');
  }

  console.log('\n========================================');
  console.log(`Phase 11 Test Result: ${passed}/${total} assertions PASSED!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
