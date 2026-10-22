// test/phase2.test.mjs - Phase 2 Native Render & Token 压缩率验证测试套件

async function runTests() {
  const {
    sanitizeCell,
    formatStateBadge,
    formatCiBadge,
    formatConflictBadge,
    renderPrMarkdown,
    renderIssueMarkdown,
    renderRunMarkdown,
    renderRepoMarkdown,
  } = await import('../lib/renderers/markdown.js');

  const { createPrTool } = await import('../lib/tools/pr.js');
  const { createIssueTool } = await import('../lib/tools/issue.js');
  const { createRunTool } = await import('../lib/tools/run.js');
  const { createRepoTool } = await import('../lib/tools/repo.js');

  const mockExecutor = {
    // 18 个工具统一经 resolveExecScope 归一工作区；测试替身必须实现同一接口
    resolveExecScope(execContext) {
      return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId || execContext?.session?.id };
    },
    async run() { return { ok: true, data: {} }; },
    async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; }
  };

  const prTool = createPrTool(mockExecutor);
  const issueTool = createIssueTool(mockExecutor);
  const runTool = createRunTool(mockExecutor);
  const repoTool = createRepoTool(mockExecutor);

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

  // --- 1. 基础管道测试 ---
  console.log('\n--- 1. Testing Sanitization & Badges ---');
  assert(sanitizeCell('Bug | Problem\r\nNewline') === 'Bug \\| Problem Newline', 'sanitizeCell escapes pipes and collapses newlines');
  assert(formatStateBadge('MERGED') === '🟣 MERGED', 'formatStateBadge handles MERGED');
  assert(formatStateBadge('OPEN', true) === '⚪ DRAFT', 'formatStateBadge handles DRAFT');
  assert(formatCiBadge('completed', 'success') === '✅ success', 'formatCiBadge handles success');
  assert(formatConflictBadge('DIRTY') === '⚠️ CONFLICT', 'formatConflictBadge handles CONFLICT');

  // --- 2. PR 渲染与 Token 压缩率实测 ---
  console.log('\n--- 2. Testing PR Render & Token Compression ---');
  // 模拟 20 条标准 GitHub PR 数据
  const samplePrs = Array.from({ length: 20 }, (_, idx) => ({
    number: 6100 + idx,
    title: `Feature/Fix item ${idx + 1}: Support enhanced capability and resolve edge-case with | pipe and \n newline`,
    state: idx % 3 === 0 ? 'MERGED' : (idx % 2 === 0 ? 'OPEN' : 'CLOSED'),
    author: { login: `contributor_${idx}` },
    headRefName: `feature/branch-${idx}`,
    baseRefName: 'main',
    isDraft: false,
    updatedAt: '2026-10-11T16:56:52Z',
    mergedAt: idx % 3 === 0 ? '2026-10-11T16:56:52Z' : null,
    url: `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/${6100 + idx}`,
  }));

  const rawJson = JSON.stringify({ items: samplePrs, count: 20 }, null, 2);
  const renderedMd = renderPrMarkdown({ action: 'list' }, { items: samplePrs, count: 20 });

  assert(renderedMd.includes('| 编号 | 状态 | 标题 | 作者 | 更新日期 |'), 'renderPrMarkdown generates valid markdown table headers');
  assert(renderedMd.includes('[#6100](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6100)'), 'renderPrMarkdown includes clickable hyperlinks');
  assert(!renderedMd.includes('with | pipe'), 'renderPrMarkdown safely escaped pipes in table body');

  const jsonLen = rawJson.length;
  const mdLen = renderedMd.length;
  const reduction = ((1 - mdLen / jsonLen) * 100).toFixed(1);
  console.log(`\n  📊 Token / 字符压缩实测比对 (20 条 PR):`);
  console.log(`     - 原始 JSON 体积: ${jsonLen} 字符 (约 ${Math.round(jsonLen / 3.5)} tokens)`);
  console.log(`     - 紧凑 Markdown:  ${mdLen} 字符 (约 ${Math.round(mdLen / 3.5)} tokens)`);
  console.log(`     - 压缩率降幅:     ${reduction}% 节省`);

  assert(parseFloat(reduction) >= 60.0, `Token/文本压缩率达到显著降本标准 (实际: ${reduction}% >= 60%)`);

  // Checks 测试（字段集与 gh pr checks 合法九字段对齐——Issue #3 修复：
  // 旧 conclusion/detailsUrl 是 REST API 字段名，pr checks 从未支持过）
  const sampleChecks = [
    { name: 'PR check / lint', state: 'SUCCESS', bucket: 'pass', link: 'https://actions/run/1', workflow: 'Lint' },
    { name: 'Submission gate', state: 'FAILURE', bucket: 'fail', link: 'https://actions/run/2', workflow: 'Gate' },
    { name: 'Slow e2e', state: 'SKIPPED', bucket: 'skipping', link: 'https://actions/run/3', workflow: 'E2E' },
  ];
  const checksMd = renderPrMarkdown({ action: 'checks' }, { items: sampleChecks });
  assert(checksMd.includes('✅') && checksMd.includes('❌') && checksMd.includes('⏭️'), 'bucket 值族映射徽章 (pass/fail/skipping)');
  assert(checksMd.includes('[查看详情]') && checksMd.includes('https://actions/run/1'), 'link 字段渲染详情链接');
  assert(checksMd.includes('Lint') && checksMd.includes('Gate'), 'workflow 字段渲染工作流列');
  assert(!checksMd.includes('conclusion') && !checksMd.includes('detailsUrl'), '不再消费不存在的 gh 字段');

  // Status 测试
  const statusMd = renderPrMarkdown({ action: 'status' }, {
    createdBy: [{ number: 6695, state: 'OPEN', mergeStateStatus: 'CLEAN', title: 'Add plugin', url: 'https://pr/6695' }],
    needsReview: []
  });
  assert(statusMd.includes('由我发起的 PR') && statusMd.includes('✅ CLEAN'), 'renderPrMarkdown formats status with conflict badge');

  // --- 3. Issue 渲染测试 ---
  console.log('\n--- 3. Testing Issue Render ---');
  const sampleIssues = [
    { number: 42, title: 'Bug: Crash on startup', state: 'OPEN', labels: [{ name: 'bug' }, { name: 'p0' }], author: { login: 'alice' }, updatedAt: '2026-10-12T10:00:00Z', url: 'https://issue/42' }
  ];
  const issueMd = renderIssueMarkdown({ action: 'list' }, { items: sampleIssues });
  assert(issueMd.includes('| [#42](https://issue/42) | 🟢 OPEN |') && issueMd.includes('`bug` `p0`'), 'renderIssueMarkdown formats table with labels and state');

  const issueViewMd = renderIssueMarkdown({ action: 'view' }, {
    number: 42, title: 'Bug: Crash', state: 'OPEN', author: { login: 'alice' }, labels: ['bug'], body: 'Details here', url: 'https://issue/42'
  });
  assert(issueViewMd.includes('### 🟢 OPEN Bug: Crash') && issueViewMd.includes('议题正文:'), 'renderIssueMarkdown formats view card');

  // --- 4. Run 渲染测试 ---
  console.log('\n--- 4. Testing Workflow Run Render ---');
  const sampleRuns = [
    { databaseId: 987654, name: 'CI Build', status: 'completed', conclusion: 'failure', headBranch: 'main', event: 'push', createdAt: '2026-10-12T11:00:00Z', url: 'https://run/987654' }
  ];
  const runMd = renderRunMarkdown({ action: 'list' }, { items: sampleRuns });
  assert(runMd.includes('| [987654](https://run/987654) | ❌ failure | CI Build | `main` |'), 'renderRunMarkdown formats run diagnosis table');

  // --- 5. Repo 渲染测试 ---
  console.log('\n--- 5. Testing Repo Render ---');
  const repoViewMd = renderRepoMarkdown({ action: 'view' }, {
    nameWithOwner: 'owner/awesome-repo',
    url: 'https://github.com/owner/awesome-repo',
    stargazerCount: 1234,
    forkCount: 56,
    defaultBranchRef: { name: 'main' },
    description: 'An awesome toolkit for AI agents',
    licenseInfo: { name: 'MIT' },
    repositoryTopics: [{ name: 'dsh' }, { name: 'ai' }]
  });
  assert(repoViewMd.includes('⭐ **Stars**: 1234') && repoViewMd.includes('`dsh` `ai`') && repoViewMd.includes('`MIT`'), 'renderRepoMarkdown formats repo card with topics and license');

  // --- 6. 工具集成 output.render 测试 ---
  console.log('\n--- 6. Testing Tool output.render Hook ---');
  const prRenderRes = prTool.output.render({ action: 'list' }, { items: samplePrs });
  assert(Array.isArray(prRenderRes) && prRenderRes[0].type === 'text' && prRenderRes[0].text.includes('| 编号 | 状态 |'), 'prTool output.render returns native text block');

  const issueRenderRes = issueTool.output.render({ action: 'list' }, { items: sampleIssues });
  assert(Array.isArray(issueRenderRes) && issueRenderRes[0].type === 'text' && issueRenderRes[0].text.includes('`bug`'), 'issueTool output.render returns native text block');

  const runRenderRes = runTool.output.render({ action: 'list' }, { items: sampleRuns });
  assert(Array.isArray(runRenderRes) && runRenderRes[0].type === 'text' && runRenderRes[0].text.includes('❌ failure'), 'runTool output.render returns native text block');

  const repoRenderRes = repoTool.output.render({ action: 'view' }, { nameWithOwner: 'owner/test', stargazerCount: 10 });
  assert(Array.isArray(repoRenderRes) && repoRenderRes[0].type === 'text' && repoRenderRes[0].text.includes('⭐ **Stars**: 10'), 'repoTool output.render returns native text block');

  console.log('\n========================================');
  console.log(`Phase 2 Test Result: ${passed}/${total} assertions PASSED!`);
  console.log('========================================');

  if (passed !== total) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
