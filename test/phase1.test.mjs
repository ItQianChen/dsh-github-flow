// test/phase1.test.mjs - Phase 1 功能自动化验证测试套件

async function runTests() {
  const recorded = [];
  const mockExecutor = {
    async run(cmd, opts) {
      recorded.push(cmd);
      return { ok: true, data: { success: true }, rawOutput: 'mock-output' };
    },
    async getRepoMetadata() {
      return { nameWithOwner: 'owner/test-repo' };
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
  recorded.length = 0;
  await prTool.execute({ action: 'checkout', pr_number: 101 });
  assert(recorded[0].join(' ').includes('pr checkout 101 -R owner/test-repo -f'), 'pr checkout checkouts branch');

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
  await prTool.execute({ action: 'diff', pr_number: 101, stat_only: true });
  assert(recorded[0].join(' ').includes('pr diff 101 -R owner/test-repo --stat'), 'pr diff adds --stat for stat_only');

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
