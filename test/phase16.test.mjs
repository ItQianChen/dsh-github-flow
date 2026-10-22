// test/phase16.test.mjs - Phase 16 · github_status 工具与 attach_images 附件上传通道测试套件
// 涵盖：validateAttachPaths 路径安全护栏、gh 2.99 版本守卫、status 纯文本看板解析、issue/pr 双通道对称闭环及 help 14 工具全景映射

import path from 'node:path';
import fs from 'node:fs';

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

  console.log('\n--- 1. validateAttachPaths 路径安全护栏测试 ---');
  const { validateAttachPaths } = await import('../lib/tools/image-utils.js');
  const { parseStatusOutput, renderStatusMarkdown } = await import('../lib/renderers/markdown.js');
  const { createStatusTool } = await import('../lib/tools/status.js');
  const { createIssueTool } = await import('../lib/tools/issue.js');
  const { createPrTool } = await import('../lib/tools/pr.js');
  const { createHelpTool } = await import('../lib/tools/help.js');

  const cwd = process.cwd();
  assert(validateAttachPaths(undefined, cwd).length === 0, 'undefined 返回空数组');
  assert(validateAttachPaths(null, cwd).length === 0, 'null 返回空数组');
  assert(validateAttachPaths([], cwd).length === 0, '空数组返回空数组');

  let nonArrayThrows = false;
  try {
    validateAttachPaths('not-array', cwd);
  } catch {
    nonArrayThrows = true;
  }
  assert(nonArrayThrows, '非数组输入抛出异常');

  // 1.1 50 文件上限拦截
  let overLimitThrows = false;
  try {
    const tooMany = Array.from({ length: 51 }, (_, i) => `file${i}.png`);
    validateAttachPaths(tooMany, cwd);
  } catch (err) {
    overLimitThrows = err.message.includes('上限 50 个文件');
  }
  assert(overLimitThrows, '超出 50 个文件上限严格抛错');

  // 1.2 拒绝网络 URL
  let urlThrows = false;
  try {
    validateAttachPaths(['https://example.com/screenshot.png'], cwd);
  } catch (err) {
    urlThrows = err.message.includes('不支持网络 URL');
  }
  assert(urlThrows, '网络 URL 严格拒绝并提示使用 Markdown 链接');

  let httpThrows = false;
  try {
    validateAttachPaths(['http://insecure.site/pic.jpg'], cwd);
  } catch {
    httpThrows = true;
  }
  assert(httpThrows, 'http URL 同样被拒');

  // 1.3 文件不存在拦截
  let notFoundThrows = false;
  try {
    validateAttachPaths(['./non-existent-test-file-999.png'], cwd);
  } catch (err) {
    notFoundThrows = err.message.includes('指定的附件文件不存在');
  }
  assert(notFoundThrows, '不存在的本地文件路径抛错');

  // 1.4 合法本地文件通过
  const realFile = './package.json';
  const resolved = validateAttachPaths([realFile], cwd);
  assert(resolved.length === 1 && resolved[0] === path.resolve(cwd, realFile), '合法相对路径正确解析为绝对路径');

  console.log('\n--- 2. parseStatusOutput 与 github_status 面板测试 ---');
  const emptyReport = parseStatusOutput('');
  assert(emptyReport.assignedIssues.length === 0 && emptyReport.activity.length === 0, '空字符串解析为空看板');

  const sampleStatusOutput = `Assigned Issues                                           │ Assigned Pull Requests                                    
Nothing here ^_^                                          │ Nothing here ^_^                                          
                                                          │                                                           
Review Requests                                           │ Mentions                                                  
Nothing here ^_^                                          │ Nothing here ^_^                                          
                                                          │                                                           
Repository Activity
org/repo#10\tcomment on feature\tLooks good!
user/tool#5\topened PR\tAdd new module`;

  const parsedStatus = parseStatusOutput(sampleStatusOutput);
  assert(parsedStatus.assignedIssues.length === 0, '过滤 Nothing here 占位符');
  assert(parsedStatus.activity.length === 2, '成功解析出 2 条动态');
  assert(parsedStatus.activity[0].repo === 'org/repo' && parsedStatus.activity[0].number === '10', '提取出 repo 与 number');

  let recordedCmds = [];
  const mockExecutor = {
    // 18 个工具统一经 resolveExecScope 归一工作区；测试替身必须实现同一接口
    resolveExecScope(execContext) {
      return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId || execContext?.session?.id };
    },
    currentVersion: '2.96.0',
    async getGhVersion() {
      return this.currentVersion;
    },
    async run(cmd, opts) {
      recordedCmds.push({ cmd, opts });
      return { ok: true, rawOutput: sampleStatusOutput };
    },
    async getRepoMetadata() {
      return { nameWithOwner: 'owner/test-repo' };
    },
  };

  const statusTool = createStatusTool(mockExecutor);
  assert(statusTool.name === 'github_status', '工具名称为 github_status');

  recordedCmds = [];
  const statusRes = await statusTool.execute({ org: 'my-org', exclude: ['noise/repo1', 'noise/repo2'] }, { cwd });
  assert(statusRes.parsed.activity.length === 2, 'execute 返回结构化看板数据');
  const lastStatusCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastStatusCmd[0] === 'status', '调用 gh status');
  assert(lastStatusCmd.includes('-o') && lastStatusCmd.includes('my-org'), '传递 -o 组织过滤');
  assert(lastStatusCmd.includes('-e') && lastStatusCmd.includes('noise/repo1'), '传递 -e 排除仓库');

  const statusMd = renderStatusMarkdown({}, statusRes);
  assert(statusMd.includes('GitHub 个人待办与跨仓动态聚合看板'), '看板标题渲染');
  assert(statusMd.includes('🟢 暂无分配给你的未决 Issue'), '空版块优雅提示渲染');
  assert(statusMd.includes('`org/repo#10`'), '动态条目渲染引用徽章');

  console.log('\n--- 3. github_issue 的 attach_images 通道与版本守卫 ---');
  const issueTool = createIssueTool(mockExecutor);

  // 3.1 本地 gh 2.96 < 2.99 时触发版本守卫抛错
  mockExecutor.currentVersion = '2.96.0';
  let issueVersionGateFails = false;
  try {
    await issueTool.execute({
      action: 'comment',
      issue_number: 1,
      body: '测试附件',
      attach_images: ['./package.json'],
    }, { cwd });
  } catch (err) {
    issueVersionGateFails = err.message.includes('版本 ≥ 2.99.0');
  }
  assert(issueVersionGateFails, 'gh < 2.99 时调用 attach_images 触发友好版本升级引导');

  // 3.2 本地 gh 模拟升级为 2.100.0 >= 2.99
  mockExecutor.currentVersion = '2.100.0';
  recordedCmds = [];
  await issueTool.execute({
    action: 'comment',
    issue_number: 42,
    body: '有图有真相',
    attach_images: ['./package.json'],
  }, { cwd });
  const lastIssueCommentCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastIssueCommentCmd.includes('--attach'), 'gh ≥ 2.99 时成功追加 --attach 参数');
  assert(lastIssueCommentCmd.includes(path.resolve(cwd, './package.json')), '传递绝对文件路径');

  // 3.3 issue create 附加 attach_images
  recordedCmds = [];
  await issueTool.execute({
    action: 'create',
    title: 'Bug report with log',
    body: 'Attached below',
    attach_images: ['./package.json'],
  }, { cwd });
  const lastIssueCreateCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastIssueCreateCmd[0] === 'issue' && lastIssueCreateCmd[1] === 'create', '调用 gh issue create');
  assert(lastIssueCreateCmd.includes('--attach'), 'issue create 成功追加 --attach');

  // 3.4 issue edit 附加 attach_images
  recordedCmds = [];
  await issueTool.execute({
    action: 'edit',
    issue_number: 42,
    attach_images: ['./package.json'],
  }, { cwd });
  const lastIssueEditCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastIssueEditCmd.includes('--attach'), 'issue edit 成功追加 --attach');

  console.log('\n--- 4. github_pr 的 attach_images 通道与版本守卫 ---');
  const prTool = createPrTool(mockExecutor);

  // 4.1 pr create 带有 attach_images
  recordedCmds = [];
  await prTool.execute({
    action: 'create',
    title: 'Feature PR',
    body: 'UI Screenshots',
    attach_images: ['./package.json'],
  }, { cwd });
  const lastPrCreateCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastPrCreateCmd[0] === 'pr' && lastPrCreateCmd[1] === 'create', '调用 gh pr create');
  assert(lastPrCreateCmd.includes('--attach'), 'pr create 成功追加 --attach');

  // 4.2 pr comment 带有 attach_images
  recordedCmds = [];
  await prTool.execute({
    action: 'comment',
    pr_number: 10,
    body: 'Review screenshots',
    attach_images: ['./package.json'],
  }, { cwd });
  const lastPrCommentCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastPrCommentCmd[0] === 'pr' && lastPrCommentCmd[1] === 'comment', '调用 gh pr comment');
  assert(lastPrCommentCmd.includes('--attach'), 'pr comment 成功追加 --attach');

  // 4.3 pr edit 带有 attach_images
  recordedCmds = [];
  await prTool.execute({
    action: 'edit',
    pr_number: 10,
    title: 'Updated PR Title',
    attach_images: ['./package.json'],
  }, { cwd });
  const lastPrEditCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastPrEditCmd[0] === 'pr' && lastPrEditCmd[1] === 'edit', '调用 gh pr edit');
  assert(lastPrEditCmd.includes('--attach'), 'pr edit 成功追加 --attach');

  // 4.4 pr 低版本拦截
  mockExecutor.currentVersion = '2.96.0';
  let prVersionGateFails = false;
  try {
    await prTool.execute({
      action: 'comment',
      pr_number: 10,
      body: 'fail',
      attach_images: ['./package.json'],
    }, { cwd });
  } catch (err) {
    prVersionGateFails = err.message.includes('版本 ≥ 2.99.0');
  }
  assert(prVersionGateFails, 'pr 在低版本下拦截 attach_images');

  console.log('\n--- 5. github_help 映射与 14 工具全景矩阵覆盖测试 ---');
  const helpTool = createHelpTool(mockExecutor);

  const overviewRes = await helpTool.execute({ topic: 'overview' }, {});
  assert(overviewRes.result.includes('`github_status`'), 'overview 包含第 14 个工具 github_status');

  const statusHelp = await helpTool.execute({ topic: 'status' }, {});
  assert(statusHelp.result.includes('github_status'), 'status 主题包含调用指引');

  const issueHelp = await helpTool.execute({ topic: 'issue' }, {});
  assert(issueHelp.result.includes('attach_images'), 'issue 指南包含 attach_images 说明');

  const prHelp = await helpTool.execute({ topic: 'pr' }, {});
  assert(prHelp.result.includes('attach_images'), 'pr 指南包含 attach_images 说明');

  const mappingHelp = await helpTool.execute({ topic: 'mapping' }, {});
  assert(mappingHelp.result.includes('gh status') && mappingHelp.result.includes('github_status'), 'mapping 包含 status 映射');
  assert(mappingHelp.result.includes('attach_images'), 'mapping 包含 attach_images 说明');

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Phase 16 测试结果: ${passed}/${total} 通过`);
  if (passed !== total) {
    throw new Error(`Phase 16 测试未全量通过: ${total - passed} 项失败`);
  }
}

await runTests();
