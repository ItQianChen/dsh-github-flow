// test/phase1.test.mjs - Phase 1 功能自动化验证测试套件

async function runTests() {
  const recorded = [];
  // 工作区干净度闸门：真实 GhExecutor 上由 ensureCleanWorkspace 统一实现，
  // 会切分支的动作（pr checkout / issue develop）都要过它。mock 必须提供。
  let workspaceClean = true;
  const mockExecutor = {
    async run(cmd, opts) {
      recorded.push(cmd);
      return { ok: true, data: { success: true }, rawOutput: 'mock-output' };
    },
    async getRepoMetadata() {
      return { nameWithOwner: 'owner/test-repo' };
    },
    async ensureCleanWorkspace() {
      return workspaceClean
        ? { ok: true, dirtyCount: 0, samples: [] }
        : { ok: false, reason: 'dirty', dirtyCount: 2, samples: [' M src/a.ts', '?? tmp.txt'], error: '工作区有 2 个未提交的文件变更。' };
    }
  };

  const { createIssueTool } = await import('../lib/tools/issue.js');
  const { createRunTool } = await import('../lib/tools/run.js');
  const { createPrTool } = await import('../lib/tools/pr.js');
  const { createRepoTool } = await import('../lib/tools/repo.js');
  const { createApiTool } = await import('../lib/tools/api.js');
  const { createHelpTool } = await import('../lib/tools/help.js');

  const issueTool = createIssueTool(mockExecutor);
  const runTool = createRunTool(mockExecutor);
  const prTool = createPrTool(mockExecutor);
  const repoTool = createRepoTool(mockExecutor);
  const apiTool = createApiTool(mockExecutor);
  const helpTool = createHelpTool(mockExecutor);

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

  // --- 1. issueTool 测试 ---
  console.log('\n--- 1. Testing github_issue ---');
  recorded.length = 0;
  await issueTool.execute({
    action: 'list',
    state: 'closed',
    labels: ['bug', 'ui'],
    assignees: ['alice', 'bob'],
    limit: 15
  });
  const issueListCmd = recorded[0].join(' ');
  assert(issueListCmd.includes('--state closed') && issueListCmd.includes('--label bug') && issueListCmd.includes('--label ui') && issueListCmd.includes('--assignee alice') && issueListCmd.includes('-L 15'), 'issue list respects state, separate labels, single primary assignee, limit');

  // close without confirm
  const closeBlock = await issueTool.execute({ action: 'close', issue_number: 42, confirm: false });
  assert(closeBlock.status === 'AWAITING_CONFIRMATION', 'issue close blocked without confirm');

  // close with confirm
  recorded.length = 0;
  await issueTool.execute({ action: 'close', issue_number: 42, confirm: true });
  assert(recorded[0].join(' ').includes('issue close 42'), 'issue close executed with confirm');

  // develop action
  recorded.length = 0;
  await issueTool.execute({ action: 'develop', issue_number: 42, branch_name: 'fix-login' });
  assert(recorded[0].join(' ').includes('issue develop 42 -R owner/test-repo --checkout -n fix-login'), 'issue develop creates branch');

  // develop 同样会切分支，必须过工作区闸门
  workspaceClean = false;
  recorded.length = 0;
  let developBlocked = false;
  try {
    await issueTool.execute({ action: 'develop', issue_number: 42 });
  } catch (err) {
    developBlocked = /未提交|工作区/.test(String(err?.message || ''));
  }
  assert(developBlocked, 'develop 在脏工作区被阻断');
  assert(recorded.length === 0, 'develop 被阻断时不调用底层 CLI');
  workspaceClean = true;

  // edit action
  recorded.length = 0;
  await issueTool.execute({ action: 'edit', issue_number: 42, title: 'New Title', add_labels: ['p0'] });
  assert(recorded[0].join(' ').includes('issue edit 42 -R owner/test-repo --title New Title --add-label p0'), 'issue edit adds label and updates title');

  // --- 2. runTool 测试 ---
  console.log('\n--- 2. Testing github_run ---');
  recorded.length = 0;
  await runTool.execute({ action: 'list', branch: 'feat/test', status: 'failure', limit: 8 });
  const runListCmd = recorded[0].join(' ');
  assert(runListCmd.includes('--branch feat/test') && runListCmd.includes('--status failure') && runListCmd.includes('-L 8'), 'run list filters branch and status');

  // trigger action
  recorded.length = 0;
  await runTool.execute({ action: 'trigger', workflow: 'ci.yml', ref: 'main', inputs: { target: 'staging' } });
  assert(recorded[0].join(' ').includes('workflow run ci.yml -R owner/test-repo --ref main -f target=staging'), 'run trigger dispatches workflow with inputs');

  // download 的 run_id 必须是纯数字：不校验时 "../../../../windows" 会被 path.join
  // 归一化成沙箱外目录（越界写盘）。
  let runIdRejected = false;
  try {
    await runTool.execute({ action: 'download', run_id: '../../../../windows' });
  } catch (err) {
    runIdRejected = /纯数字/.test(String(err?.message || ''));
  }
  assert(runIdRejected, 'run download 拒绝非数字 run_id（防路径穿越）');

  // log_failed graceful test
  const gracefulExecutor = {
    async run() { return { ok: false, error: 'no failed jobs in run 1234' }; },
    async getRepoMetadata() { return { nameWithOwner: 'owner/test-repo' }; }
  };
  const gracefulRunTool = createRunTool(gracefulExecutor);
  const logRes = await gracefulRunTool.execute({ action: 'log_failed', run_id: '1234' });
  assert(logRes.result.includes('未检测到任何失败的任务步骤'), 'run log_failed gracefully absorbs no-failed-jobs error');

  // --- 3. prTool 测试 ---
  console.log('\n--- 3. Testing github_pr ---');

  // 3.0 checkout 闸门：脏工作区必须硬阻断，且不得调用底层 CLI
  workspaceClean = false;
  recorded.length = 0;
  let checkoutBlocked = false;
  try {
    await prTool.execute({ action: 'checkout', pr_number: 101 });
  } catch (err) {
    checkoutBlocked = /未提交|工作区/.test(String(err?.message || ''));
  }
  assert(checkoutBlocked, 'checkout 在脏工作区被硬阻断（不再静默重置本地分支）');
  assert(recorded.length === 0, 'checkout 被阻断时绝不调用底层 CLI');

  // 3.0b force 需要 confirm 双门
  workspaceClean = true;
  recorded.length = 0;
  const forceBlocked = await prTool.execute({ action: 'checkout', pr_number: 101, force: true });
  assert(forceBlocked.status === 'AWAITING_CONFIRMATION', 'checkout force 未带 confirm 返回拦截态');
  assert(recorded.length === 0, 'force 未确认时不调用 CLI');

  recorded.length = 0;
  await prTool.execute({ action: 'checkout', pr_number: 101, force: true, confirm: true });
  assert(recorded[0].join(' ').includes('pr checkout 101 -R owner/test-repo -f'), 'force + confirm 才追加 -f');

  // 3.1 默认 checkout：不带 -f（本地已有同名分支时让 gh 报错而不是静默重置）
  recorded.length = 0;
  await prTool.execute({ action: 'checkout', pr_number: 101 });
  const plainCheckoutArgv = recorded[0].join(' ');
  assert(plainCheckoutArgv.includes('pr checkout 101 -R owner/test-repo'), 'pr checkout 检出分支');
  assert(!plainCheckoutArgv.includes('-f'), '默认 checkout 不下发 -f（不重置本地分支）');

  recorded.length = 0;
  await prTool.execute({ action: 'status' });
  assert(recorded[0].join(' ').includes('pr status -R owner/test-repo -c'), 'pr status inspects conflict status');

  // Issue #3 回归锁：pr checks 字段集必须 ⊆ gh 合法九字段（bucket,completedAt,
  // description,event,link,name,startedAt,state,workflow）——mock 层测试拦不住
  // 字段集非法（gh 才是唯一裁判），这里以断言基准清单方式锁死。
  recorded.length = 0;
  await prTool.execute({ action: 'checks', pr_number: 101 });
  const checksJsonIdx = recorded[0].indexOf('--json');
  const checksFields = checksJsonIdx > -1 ? recorded[0][checksJsonIdx + 1].split(',') : [];
  const LEGAL_PR_CHECKS_FIELDS = ['bucket', 'completedAt', 'description', 'event', 'link', 'name', 'startedAt', 'state', 'workflow'];
  assert(checksFields.length > 0, 'pr checks 携带 --json 字段集');
  for (const f of checksFields) {
    assert(LEGAL_PR_CHECKS_FIELDS.includes(f), `pr checks 字段 "${f}" 在 gh 合法九字段内`);
  }
  assert(!checksFields.includes('conclusion') && !checksFields.includes('detailsUrl'), '不再使用 gh 从未支持的 conclusion/detailsUrl');

  recorded.length = 0;
  const statOnlyOut = await prTool.execute({ action: 'diff', pr_number: 101, stat_only: true });
  // gh pr diff 没有 --stat（实测 gh 2.96.0 直接 unknown flag / exit 1）。
  // 文件变更概览的合法来源是 pr view --json files；这条断言锁死「走 pr view 而不是 pr diff」。
  const statOnlyArgv = recorded[0].join(' ');
  assert(statOnlyArgv.includes('pr view 101 -R owner/test-repo'), 'stat_only 改走 gh pr view（pr diff 无 --stat）');
  assert(statOnlyArgv.includes('--json files,additions,deletions'), 'stat_only 请求 files/additions/deletions 字段');
  assert(!statOnlyArgv.includes('--stat'), '不再向 gh 下发不存在的 --stat');
  // mock 未返回 files 数组 → 走「解析失败」分支。绝不能把"没解析出来"渲染成 0 个文件
  // （executor 在输出被截断时会跳过 JSON.parse，data 就是空的）。
  assert(!/本次取到 0 个变更文件/.test(String(statOnlyOut?.result ?? '')), '解析不出文件清单时不得谎报 0 个文件');

  const mergeBlock = await prTool.execute({ action: 'merge', pr_number: 101, confirm: false });
  assert(mergeBlock.status === 'AWAITING_CONFIRMATION', 'pr merge blocked without confirm');

  recorded.length = 0;
  await prTool.execute({ action: 'merge', pr_number: 101, confirm: true, merge_method: 'squash' });
  assert(recorded[0].join(' ').includes('pr merge 101 -R owner/test-repo --squash'), 'pr merge executed with confirm');

  // --- 4. repoTool & apiTool 测试 ---
  console.log('\n--- 4. Testing github_repo & github_api ---');
  recorded.length = 0;
  await repoTool.execute({ action: 'sync', branch: 'main', force: true });
  assert(recorded[0].join(' ').includes('repo sync owner/test-repo --branch main --force'), 'repo sync pulls upstream with force');

  recorded.length = 0;
  await repoTool.execute({ action: 'view' });
  assert(recorded[0].join(' ').includes('repositoryTopics,licenseInfo'), 'repo view includes topics and licenseInfo');

  recorded.length = 0;
  await apiTool.execute({ endpoint: 'repos/test/commits', paginate: true });
  assert(recorded[0].join(' ').includes('--paginate'), 'api tool appends --paginate');

  // api 空/畸形 endpoint 必须报错：gh api "" 退出码 0 并返回整个 API 索引，
  // 模型会误以为"查到了数据"。
  let apiEmptyRejected = false;
  try {
    await apiTool.execute({ endpoint: '   ' });
  } catch (err) {
    apiEmptyRejected = /必填/.test(String(err?.message || ''));
  }
  assert(apiEmptyRejected, 'api 空 endpoint 被拒绝');

  // 单段端点（user / rate_limit / notifications）是合法的，不能按"必须含 /"误杀
  // （实测 gh api user --jq .login 正常返回）。真正的注入面是以 - 开头。
  let apiFlagLikeRejected = false;
  try {
    await apiTool.execute({ endpoint: '-X' });
  } catch (err) {
    apiFlagLikeRejected = /不能以 - 开头/.test(String(err?.message || ''));
  }
  assert(apiFlagLikeRejected, 'api endpoint 以 - 开头被拒绝（防被当作 flag）');

  recorded.length = 0;
  await apiTool.execute({ endpoint: 'user' });
  assert(recorded[0].join(' ').includes('api user'), 'api 单段端点 user 正常透传（不误杀）');

  // --- 5. helpTool 测试 ---
  console.log('\n--- 5. Testing github_help ---');
  const helpOverview = await helpTool.execute({});
  assert(helpOverview.result.includes('github_pr') && helpOverview.result.includes('github_run'), 'help overview returns full navigation');

  const helpSyntax = await helpTool.execute({ topic: 'search_syntax' });
  assert(helpSyntax.result.includes('created:2026-10-01..2026-10-12'), 'help search_syntax returns accurate date syntax');

  const helpTrouble = await helpTool.execute({ topic: 'troubleshooting' });
  assert(helpTrouble.result.includes('HTTP 422') && helpTrouble.result.includes('stale fork'), 'help troubleshooting returns self-healing recipes');

  recorded.length = 0;
  await helpTool.execute({ gh_command: 'gh pr checkout' });
  assert(recorded[0].join(' ').includes('help pr checkout'), 'help gh_command strips leading gh and dispatches raw help');

  console.log('\n========================================');
  console.log(`Test Result: ${passed}/${total} assertions PASSED!`);
  console.log('========================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
