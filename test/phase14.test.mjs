// test/phase14.test.mjs - Phase 14 · github_label 与 github_ruleset 新领域工具测试套件
// 涵盖：颜色归一化、删除 confirm 拦截、clone 语义、ruleset 纯文本解析、渲染器及 help 映射

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

  console.log('\n--- 1. normalizeHexColor 纯函数测试 ---');
  const { normalizeHexColor, createLabelTool } = await import('../lib/tools/label.js');
  const { parseRulesetCheckOutput, createRulesetTool } = await import('../lib/tools/ruleset.js');
  const { renderLabelMarkdown, renderRulesetMarkdown } = await import('../lib/renderers/markdown.js');
  const { createHelpTool } = await import('../lib/tools/help.js');

  assert(normalizeHexColor('d73a4a') === 'd73a4a', '6位十六进制正常处理');
  assert(normalizeHexColor('#d73a4a') === 'd73a4a', '带前导 # 自动去除');
  assert(normalizeHexColor('  #0075CA  ') === '0075CA', '带空格与大写正常处理');
  assert(normalizeHexColor('') === undefined, '空串返回 undefined');
  assert(normalizeHexColor(undefined) === undefined, 'undefined 返回 undefined');

  let invalidColorError = false;
  try {
    normalizeHexColor('red');
  } catch (e) {
    invalidColorError = true;
  }
  assert(invalidColorError, '非6位hex抛出异常');

  let invalidCharError = false;
  try {
    normalizeHexColor('#zzzzzz');
  } catch (e) {
    invalidCharError = true;
  }
  assert(invalidCharError, '非法字符抛出异常');

  console.log('\n--- 2. parseRulesetCheckOutput 纯函数测试 ---');
  const zeroRuleText = '0 rules apply to branch master in repo ItQianChen/dsh-github-flow';
  const p0 = parseRulesetCheckOutput(zeroRuleText);
  assert(p0.ruleCount === 0 && p0.branch === 'master' && p0.repo === 'ItQianChen/dsh-github-flow', '0条规则精准解析分支与仓库');
  assert(Array.isArray(p0.rules) && p0.rules.length === 0, '0条规则 rules 为空数组');

  const oneRuleText = `1 rules apply to branch trunk in repo cli/cli

- copilot_code_review: [review_draft_pull_requests: true] [review_on_push: false] 
  (configured in ruleset 4898070 from repository cli/cli)`;
  const p1 = parseRulesetCheckOutput(oneRuleText);
  assert(p1.ruleCount === 1 && p1.branch === 'trunk' && p1.repo === 'cli/cli', '1条规则首行精准解析');
  assert(p1.rules.length === 1, '解析出1条规则明细');
  assert(p1.rules[0].name === 'copilot_code_review', '规则名解析正确');
  assert(p1.rules[0].params.includes('review_draft_pull_requests: true'), '规则参数解析正确');
  assert(p1.rules[0].source.includes('ruleset 4898070'), '规则来源解析正确');

  const multiRuleText = `2 rules apply to branch main in repo org/repo

- pull_request: [required_approving_review_count: 2] 
  (configured in ruleset 100 from organization org)
- required_status_checks: [strict: true] 
  (configured in ruleset 101 from repository org/repo)`;
  const p2 = parseRulesetCheckOutput(multiRuleText);
  assert(p2.ruleCount === 2 && p2.rules.length === 2, '多条规则数量解析正确');
  assert(p2.rules[0].name === 'pull_request' && p2.rules[1].name === 'required_status_checks', '多条规则名称解析正确');

  const emptyParse = parseRulesetCheckOutput('');
  assert(emptyParse.ruleCount === 0 && emptyParse.rules.length === 0, '空文本容错解析');

  console.log('\n--- 3. github_label 工具定义与执行 ---');
  let recordedCmds = [];
  const mockExecutor = {
    async run(cmd, opts) {
      recordedCmds.push({ cmd, opts });
      if (cmd[0] === 'label' && cmd[1] === 'list') {
        const labels = [
          { name: 'bug', color: 'd73a4a', description: 'Something is broken' },
          { name: 'enhancement', color: 'a2eeef', description: 'New feature' },
        ];
        return {
          ok: true,
          data: labels,
          rawOutput: JSON.stringify(labels),
        };
      }
      return { ok: true, rawOutput: 'mock success output' };
    },
    async getRepoMetadata() {
      return { nameWithOwner: 'owner/test-repo' };
    },
  };

  const labelTool = createLabelTool(mockExecutor);
  assert(labelTool.name === 'github_label', '工具名称为 github_label');
  assert(labelTool.parameters.required.includes('action'), 'action 为必填字段');
  assert(labelTool.parameters.properties.action.enum.length === 5, '支持 5 大 action');

  // 3.1 list action
  recordedCmds = [];
  const listRes = await labelTool.execute({ action: 'list', search: 'bug', sort: 'name', order: 'desc', limit: 10 });
  assert(listRes.items.length === 2, 'label list 返回 items');
  const lastListCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastListCmd[0] === 'label' && lastListCmd[1] === 'list', '调用 gh label list');
  assert(lastListCmd.includes('-R') && lastListCmd.includes('owner/test-repo'), '传递目标仓库 -R');
  assert(lastListCmd.includes('-S') && lastListCmd.includes('bug'), '传递 -S 检索词');
  assert(lastListCmd.includes('--sort') && lastListCmd.includes('name'), '传递 --sort');
  assert(lastListCmd.includes('--order') && lastListCmd.includes('desc'), '传递 --order');
  assert(lastListCmd.includes('-L') && lastListCmd.includes('10'), '传递 -L limit');

  // 3.2 create action
  recordedCmds = [];
  const createRes = await labelTool.execute({
    action: 'create',
    name: 'area/ui',
    color: '#0075ca',
    description: 'UI 相关',
    force: true,
  });
  assert(createRes.success === true && createRes.name === 'area/ui', 'create 返回成功状态');
  const lastCreateCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastCreateCmd[0] === 'label' && lastCreateCmd[1] === 'create' && lastCreateCmd[2] === 'area/ui', '调用 gh label create');
  assert(lastCreateCmd.includes('-c') && lastCreateCmd.includes('0075ca'), '颜色去除 # 后作为 -c 传递');
  assert(lastCreateCmd.includes('-d') && lastCreateCmd.includes('UI 相关'), '传递 -d 描述');
  assert(lastCreateCmd.includes('-f'), 'force 为 true 时传递 -f');

  // 3.3 edit action
  recordedCmds = [];
  const editRes = await labelTool.execute({
    action: 'edit',
    name: 'area/ui',
    new_name: 'area/frontend',
    color: '112233',
    description: 'Frontend update',
  });
  assert(editRes.success === true && editRes.name === 'area/frontend', 'edit 返回重命名后名称');
  const lastEditCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastEditCmd[0] === 'label' && lastEditCmd[1] === 'edit' && lastEditCmd[2] === 'area/ui', '调用 gh label edit');
  assert(lastEditCmd.includes('-n') && lastEditCmd.includes('area/frontend'), '传递 -n 新名称');
  assert(lastEditCmd.includes('-c') && lastEditCmd.includes('112233'), '传递 -c 颜色');
  assert(lastEditCmd.includes('-d') && lastEditCmd.includes('Frontend update'), '传递 -d 描述');

  // 3.4 delete action - confirm 拦截防线
  recordedCmds = [];
  const deleteBlocked = await labelTool.execute({ action: 'delete', name: 'deprecated-tag' });
  assert(deleteBlocked.status === 'AWAITING_CONFIRMATION', 'delete 未传 confirm 返回拦截状态');
  assert(deleteBlocked.warning.includes('高危破坏性操作'), '拦截警告说明破坏性');
  assert(deleteBlocked.requiredAction.includes('confirm: true'), '提示附加 confirm: true');
  assert(recordedCmds.length === 0, '未确认时绝对不调用底层 CLI 进程');

  // 3.5 delete action - confirm 通过
  recordedCmds = [];
  const deleteConfirmed = await labelTool.execute({ action: 'delete', name: 'deprecated-tag', confirm: true });
  assert(deleteConfirmed.success === true, 'delete confirm 为 true 执行成功');
  const lastDeleteCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastDeleteCmd[0] === 'label' && lastDeleteCmd[1] === 'delete' && lastDeleteCmd[2] === 'deprecated-tag', '调用 gh label delete');
  assert(lastDeleteCmd.includes('--yes'), '强制传递 --yes 防止无头挂起');

  // 3.6 clone action
  recordedCmds = [];
  const cloneRes = await labelTool.execute({ action: 'clone', source_repo: 'cli/cli', force: true });
  assert(cloneRes.success === true && cloneRes.source === 'cli/cli', 'clone 返回成功状态');
  const lastCloneCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastCloneCmd[0] === 'label' && lastCloneCmd[1] === 'clone' && lastCloneCmd[2] === 'cli/cli', '调用 gh label clone <source>');
  assert(lastCloneCmd.includes('-R') && lastCloneCmd.includes('owner/test-repo'), '目标仓库通过 -R 传递');
  assert(lastCloneCmd.includes('-f'), 'force 为 true 时传递 -f 覆盖');

  // 3.7 参数校验异常拦截
  let createMissingName = false;
  try {
    await labelTool.execute({ action: 'create' });
  } catch {
    createMissingName = true;
  }
  assert(createMissingName, 'create 缺少 name 抛错');

  let cloneMissingSource = false;
  try {
    await labelTool.execute({ action: 'clone' });
  } catch {
    cloneMissingSource = true;
  }
  assert(cloneMissingSource, 'clone 缺少 source_repo 抛错');

  console.log('\n--- 4. github_ruleset 工具定义与执行 ---');
  const rulesetTool = createRulesetTool(mockExecutor);
  assert(rulesetTool.name === 'github_ruleset', '工具名称为 github_ruleset');
  assert(rulesetTool.parameters.properties.action.enum.length === 3, '支持 check, list, view');

  // 4.1 check action
  recordedCmds = [];
  const checkRes = await rulesetTool.execute({ action: 'check', branch: 'feature/login' });
  assert(checkRes.branch === 'feature/login', 'check 返回目标分支');
  const lastCheckCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastCheckCmd[0] === 'ruleset' && lastCheckCmd[1] === 'check' && lastCheckCmd[2] === 'feature/login', '调用 gh ruleset check <branch>');
  assert(lastCheckCmd.includes('-R') && lastCheckCmd.includes('owner/test-repo'), '传递 -R 仓库');

  // 4.2 check default branch
  recordedCmds = [];
  await rulesetTool.execute({ action: 'check', default_branch: true });
  const defaultCheckCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(defaultCheckCmd.includes('--default'), 'default_branch 映射为 --default');

  // 4.3 list action (repo vs org)
  recordedCmds = [];
  await rulesetTool.execute({ action: 'list', no_parents: true, limit: 15 });
  const lastListRsCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastListRsCmd[0] === 'ruleset' && lastListRsCmd[1] === 'list', '调用 gh ruleset list');
  assert(lastListRsCmd.includes('-R') && lastListRsCmd.includes('owner/test-repo'), '仓库级传递 -R');
  // gh 只有 -p/--parents（默认 true），没有 --no-parents；排除继承必须写 --parents=false
  assert(lastListRsCmd.includes('--parents=false'), 'no_parents 映射为 --parents=false');
  assert(!lastListRsCmd.includes('--no-parents'), '不再下发不存在的 --no-parents');
  assert(lastListRsCmd.includes('-L') && lastListRsCmd.includes('15'), '传递 -L limit');

  recordedCmds = [];
  await rulesetTool.execute({ action: 'list', org: 'my-org' });
  const orgListCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(orgListCmd.includes('--org') && orgListCmd.includes('my-org'), '组织级传递 --org');
  assert(!orgListCmd.includes('-R'), '组织级不传递仓库 -R');

  // 4.4 view action
  recordedCmds = [];
  await rulesetTool.execute({ action: 'view', ruleset_id: '4898070' });
  const lastViewCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastViewCmd[0] === 'ruleset' && lastViewCmd[1] === 'view' && lastViewCmd[2] === '4898070', '调用 gh ruleset view <id>');

  // view 侧同款：原测试对此零覆盖，导致同一处假 flag 在本通道长期失守
  recordedCmds = [];
  await rulesetTool.execute({ action: 'view', ruleset_id: '4898070', no_parents: true });
  const viewNoParentsCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(viewNoParentsCmd.includes('--parents=false'), 'view 的 no_parents 映射为 --parents=false');
  assert(!viewNoParentsCmd.includes('--no-parents'), 'view 不下发不存在的 --no-parents');

  let viewMissingId = false;
  try {
    await rulesetTool.execute({ action: 'view' });
  } catch {
    viewMissingId = true;
  }
  assert(viewMissingId, 'view 缺少 ruleset_id 抛错防挂起');

  console.log('\n--- 5. Markdown 渲染层测试 ---');
  // 5.1 renderLabelMarkdown
  const labelMd = renderLabelMarkdown({ action: 'list' }, {
    items: [{ name: 'bug', color: 'd73a4a', description: 'defect' }],
  });
  assert(labelMd.includes('| 标签 | 颜色 | 描述 |'), 'label 表头渲染');
  assert(labelMd.includes('`#d73a4a`'), '渲染带有 # 的十六进制颜色');

  const labelEmptyMd = renderLabelMarkdown({ action: 'list', search: 'not-exist' }, { items: [] });
  assert(labelEmptyMd.includes('未检索到匹配关键词'), '空搜索提示渲染');

  const labelConfirmMd = renderLabelMarkdown({ action: 'delete' }, deleteBlocked);
  assert(labelConfirmMd.includes('⚠️ 高危破坏性操作'), '拦截提示块渲染');

  // 5.2 renderRulesetMarkdown
  const rulesetZeroMd = renderRulesetMarkdown({ action: 'check', branch: 'master', repo: 'o/r' }, {
    ruleCount: 0,
    branch: 'master',
    repo: 'o/r',
    rules: [],
  });
  assert(rulesetZeroMd.includes('未受任何 Ruleset 规则保护'), '0 规则提示渲染');
  assert(rulesetZeroMd.includes("github_pr(action: 'checks')"), '排障联动指引包含 PR checks');

  const rulesetProtectedMd = renderRulesetMarkdown({ action: 'check', branch: 'main', repo: 'o/r' }, {
    ruleCount: 1,
    branch: 'main',
    repo: 'o/r',
    rules: [{ name: 'pull_request', params: 'required_reviews: 2', source: 'ruleset 10' }],
  });
  assert(rulesetProtectedMd.includes('受到 **1** 项策略规则保护'), '受保护规则数量提示');
  assert(rulesetProtectedMd.includes('🔒 **pull_request**'), '规则名称渲染加锁徽标');

  console.log('\n--- 6. github_help 映射与指南覆盖测试 ---');
  const helpTool = createHelpTool(mockExecutor);

  const overviewRes = await helpTool.execute({ topic: 'overview' });
  assert(overviewRes.result.includes('`github_label`') && overviewRes.result.includes('`github_ruleset`'), 'overview 表格包含两大新工具');

  const labelHelp = await helpTool.execute({ topic: 'label' });
  assert(labelHelp.result.includes('github_label(action:'), 'label 主题包含调用指引');

  const rulesetHelp = await helpTool.execute({ topic: 'ruleset' });
  assert(rulesetHelp.result.includes('github_ruleset(action:'), 'ruleset 主题包含调用指引');

  const mappingHelp = await helpTool.execute({ topic: 'mapping' });
  assert(mappingHelp.result.includes('gh label list/create/edit/delete/clone') || mappingHelp.result.includes('gh label list'), 'mapping 包含 label 映射');
  assert(mappingHelp.result.includes('gh ruleset check') || mappingHelp.result.includes('github_ruleset'), 'mapping 包含 ruleset 映射');
  assert(!mappingHelp.result.includes('`gh label` | 标签管理 | `repos/{o}/{r}/labels`'), '未覆盖域中不再包含 gh label');
  assert(!mappingHelp.result.includes('`gh ruleset` | 分支保护规则 | `repos/{o}/{r}/rulesets`'), '未覆盖域中不再包含 gh ruleset');

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Phase 14 测试结果: ${passed}/${total} 通过`);
  if (passed !== total) {
    throw new Error(`Phase 14 测试未全量通过: ${total - passed} 项失败`);
  }
}

await runTests();
