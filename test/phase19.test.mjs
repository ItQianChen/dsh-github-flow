// test/phase19.test.mjs - Phase 19 · github_project、github_codespace 与 skill update 闭环测试套件
// 涵盖：Scope 权限自愈卡片、project --format json 映射与看板条目管理、codespace 名称必填防挂起与销毁拦截、
// skill update 检查与同步、main.ts 18 大核心工具装配与 help 全景映射

import path from 'node:path';
import fs from 'node:fs';
import { createMockContext } from './helpers/mock-ctx.mjs';

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

  console.log('\n--- 1. Scope 权限缺失自愈纯函数测试 ---');
  const {
    renderScopeRequiredMarkdown,
    renderProjectList,
    renderProjectView,
    renderProjectItemList,
    renderProjectMarkdown,
    formatCodespaceStateBadge,
    renderCodespaceList,
    renderCodespaceView,
    renderCodespaceMarkdown,
    renderSkillMarkdown,
  } = await import('../lib/renderers/markdown.js');
  const { createProjectTool, checkScopeRequired } = await import('../lib/tools/project.js');
  const { createCodespaceTool } = await import('../lib/tools/codespace.js');
  const { createSkillTool } = await import('../lib/tools/skill.js');
  const { createHelpTool } = await import('../lib/tools/help.js');

  // 1.1 checkScopeRequired
  const scopeReport = checkScopeRequired('error: your authentication token is missing required scopes [read:project]', 'read:project', 'gh auth refresh -s read:project', 'github_project');
  assert(scopeReport !== null, '成功识别缺少 scope 报错');
  assert(scopeReport.status === 'SCOPE_REQUIRED', '状态标识为 SCOPE_REQUIRED');
  assert(scopeReport.command.includes('gh auth refresh -s read:project'), '提供单行自愈命令');

  const nonScopeReport = checkScopeRequired('command failed with code 1', 'read:project', 'cmd', 'tool');
  assert(nonScopeReport === null, '非权限错误返回 null');

  // 1.2 renderScopeRequiredMarkdown
  const scopeCardMd = renderScopeRequiredMarkdown(scopeReport);
  assert(scopeCardMd.includes('### 🔑 需要补充 GitHub 权限授权'), '渲染出钥匙徽标授权大标题');
  assert(scopeCardMd.includes('`read:project`'), '标明缺少具体权限');
  assert(scopeCardMd.includes('gh auth refresh -s read:project'), '包含单行自愈代码块');

  console.log('\n--- 2. github_project 工具与渲染器测试 ---');
  // 2.1 列表与详情卡片渲染
  const sampleProjects = [
    {
      number: 1,
      title: 'DSH 核心重构路线图',
      closed: false,
      public: false,
      url: 'https://github.com/users/monalisa/projects/1',
      shortDescription: '2026年架构重构路线',
    },
  ];
  const projListMd = renderProjectList(sampleProjects);
  assert(projListMd.includes('[#1](https://github.com/users/monalisa/projects/1)'), '包含项目链接');
  assert(projListMd.includes('DSH 核心重构路线图'), '包含项目标题');
  assert(projListMd.includes('🔵 OPEN'), '包含开放状态徽标');
  assert(projListMd.includes('🔒 Private'), '包含可见性徽标');

  const sampleItems = [
    {
      id: 'PVTI_1234567890',
      title: '完成 Phase 19 测试套件',
      type: 'DraftIssue',
      status: 'In Progress',
    },
  ];
  const projItemsMd = renderProjectItemList(sampleItems);
  assert(projItemsMd.includes('`PVTI_123...`'), '条目 ID 做短截取呈现');
  assert(projItemsMd.includes('完成 Phase 19 测试套件'), '包含条目标题');
  assert(projItemsMd.includes('`DraftIssue`'), '包含条目类型');

  // 2.2 mockExecutor 与命令断言
  let recordedCmds = [];
  const mockExecutor = {
    // 18 个工具统一经 resolveExecScope 归一工作区；测试替身必须实现同一接口
    resolveExecScope(execContext) {
      return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId || execContext?.session?.id };
    },
    async run(cmd, opts) {
      recordedCmds.push({ cmd, opts });
      if (cmd[0] === 'project' && cmd[1] === 'list') {
        return { ok: true, data: sampleProjects };
      }
      if (cmd[0] === 'project' && cmd[1] === 'item-list') {
        return { ok: true, data: sampleItems };
      }
      if (cmd[0] === 'codespace' && cmd[1] === 'list') {
        return { ok: true, data: [] };
      }
      return { ok: true, rawOutput: 'Success' };
    },
  };

  const projectTool = createProjectTool(mockExecutor);
  assert(projectTool.name === 'github_project', '工具名称为 github_project');
  assert(projectTool.parameters.properties.action.enum.length === 6, '支持 6 大 action');

  // list: 必须用 --format json，严禁 --json
  recordedCmds = [];
  await projectTool.execute({ action: 'list', closed: true, limit: 10 });
  const listCmd = recordedCmds[0].cmd;
  assert(listCmd.includes('--format') && listCmd.includes('json'), 'project list 拼接 --format json');
  assert(!listCmd.includes('--json'), 'project list 严禁出现 --json 避免 CLI 报错');
  assert(listCmd.includes('--owner') && listCmd.includes('@me'), '未传 owner 时缺省使用 @me');
  assert(listCmd.includes('--closed'), 'closed 为 true 时传递 --closed');
  assert(listCmd.includes('-L') && listCmd.includes('10'), '传递 limit');

  // view: 校验 project_number 必填
  let missingProjNumThrows = false;
  try {
    await projectTool.execute({ action: 'view' });
  } catch (err) {
    missingProjNumThrows = err.message.includes('必须提供 project_number');
  }
  assert(missingProjNumThrows, 'view 操作缺少 project_number 抛错');

  // item-list
  recordedCmds = [];
  await projectTool.execute({ action: 'item-list', project_number: 1, query: 'is:open' });
  assert(recordedCmds[0].cmd.includes('item-list') && recordedCmds[0].cmd.includes('1'), 'item-list 传递编号');
  assert(recordedCmds[0].cmd.includes('--query') && recordedCmds[0].cmd.includes('is:open'), 'item-list 传递 --query');

  // item-add
  let missingAddUrlThrows = false;
  try {
    await projectTool.execute({ action: 'item-add', project_number: 1 });
  } catch (err) {
    missingAddUrlThrows = err.message.includes('必须提供 url');
  }
  assert(missingAddUrlThrows, 'item-add 缺少 url 抛错');

  // item-delete: confirm 拦截与确认执行
  const blockedDelete = await projectTool.execute({ action: 'item-delete', item_id: 'PVTI_123' });
  assert(blockedDelete.status === 'AWAITING_CONFIRMATION', 'item-delete 未带 confirm 拦截');
  assert(blockedDelete.warning.includes('PVTI_123'), '拦截提示包含条目 ID');

  recordedCmds = [];
  await projectTool.execute({ action: 'item-delete', item_id: 'PVTI_123', confirm: true });
  assert(recordedCmds[0].cmd.includes('item-delete') && recordedCmds[0].cmd.includes('PVTI_123'), '确认后执行底层删除');

  // Scope 拦截自愈
  const mockScopeFailExecutor = {
    // 18 个工具统一经 resolveExecScope 归一工作区；测试替身必须实现同一接口
    resolveExecScope(execContext) {
      return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId || execContext?.session?.id };
    },
    async run() {
      return { ok: false, error: 'error: your authentication token is missing required scopes [read:project]' };
    },
  };
  const failProjTool = createProjectTool(mockScopeFailExecutor);
  const scopeAutoFix = await failProjTool.execute({ action: 'list' });
  assert(scopeAutoFix.status === 'SCOPE_REQUIRED', '检测到权限不足自动返回 SCOPE_REQUIRED 报告');
  assert(scopeAutoFix.scope === 'read:project', '正确提取缺少的 scope 名称');

  console.log('\n--- 3. github_codespace 工具与渲染器测试 ---');
  // 3.1 状态徽标与列表渲染
  assert(formatCodespaceStateBadge('Available').includes('🟢 AVAILABLE'), 'Available 映射为绿色徽标');
  assert(formatCodespaceStateBadge('Shutdown').includes('⚪ SHUTDOWN'), 'Shutdown 映射为白色徽标');
  assert(formatCodespaceStateBadge('Starting').includes('🟡 STARTING'), 'Starting 映射为黄色徽标');

  const sampleCodespaces = [
    {
      name: 'fuzzy-spoon-69vj',
      displayName: 'my-feature-env',
      repository: 'owner/repo',
      state: 'Available',
      machineName: 'standardLinux32gb',
      machineDisplayName: '4-core, 16GB RAM',
      lastUsedAt: '2026-10-17T15:00:00Z',
    },
  ];
  const csListMd = renderCodespaceList(sampleCodespaces);
  assert(csListMd.includes('`fuzzy-spoon-69vj`'), '包含实例标识');
  assert(csListMd.includes('my-feature-env'), '包含显示名称');
  assert(csListMd.includes('🟢 AVAILABLE'), '包含运行状态徽标');
  assert(csListMd.includes('4-core, 16GB RAM'), '包含机器配置规格');

  // 3.2 命令组装与防挂起断言
  const codespaceTool = createCodespaceTool(mockExecutor);
  assert(codespaceTool.name === 'github_codespace', '工具名称为 github_codespace');
  assert(codespaceTool.parameters.properties.action.enum.length === 4, '支持 list, view, stop, delete 4 大 action');

  // list
  recordedCmds = [];
  await codespaceTool.execute({ action: 'list', limit: 20, repo: 'owner/repo', org: 'my-org' });
  const csCmd = recordedCmds[0].cmd;
  assert(csCmd[0] === 'codespace' && csCmd[1] === 'list', '调用 gh codespace list');
  assert(csCmd.includes('--json'), '声明了 --json');
  assert(csCmd.includes('-R') && csCmd.includes('owner/repo'), '传递 -R repo');
  assert(csCmd.includes('-o') && csCmd.includes('my-org'), '传递 -o org');

  // view 缺失 codespace 名称强拦截防挂起
  let missingCsNameThrows = false;
  try {
    await codespaceTool.execute({ action: 'view' });
  } catch (err) {
    missingCsNameThrows = err.message.includes('必须提供 codespace 名称');
  }
  assert(missingCsNameThrows, 'view 缺失 codespace 名称严格抛错防止 CLI 交互挂起');

  // stop
  recordedCmds = [];
  const stopRes = await codespaceTool.execute({ action: 'stop', codespace: 'fuzzy-spoon-69vj' });
  assert(stopRes.message.includes('已成功发送停止指令'), '返回成功停机提示');
  assert(recordedCmds[0].cmd.includes('stop') && recordedCmds[0].cmd.includes('fuzzy-spoon-69vj'), '传递 stop -c 参数');

  // delete confirm 拦截与强制 -f 保证幂等执行
  const blockedCsDelete = await codespaceTool.execute({ action: 'delete', codespace: 'fuzzy-spoon-69vj' });
  assert(blockedCsDelete.status === 'AWAITING_CONFIRMATION', 'delete 未带 confirm 拦截');
  assert(blockedCsDelete.warning.includes('fuzzy-spoon-69vj'), '警告中说明目标实例名称');

  recordedCmds = [];
  await codespaceTool.execute({ action: 'delete', codespace: 'fuzzy-spoon-69vj', confirm: true });
  const delCmd = recordedCmds[0].cmd;
  assert(delCmd.includes('delete') && delCmd.includes('fuzzy-spoon-69vj'), '传递 delete -c');
  assert(delCmd.includes('-f'), '底层强制注入 -f 保证无交互幂等删除');

  console.log('\n--- 4. github_skill update 扩展动作测试 ---');
  const skillTool = createSkillTool(mockExecutor);
  assert(skillTool.parameters.properties.action.enum.includes('update'), 'action 枚举包含 update');
  assert('skill_names' in skillTool.parameters.properties, '声明了 skill_names 参数');

  // 默认 dry-run 行为
  recordedCmds = [];
  const updateRes = await skillTool.execute({ action: 'update', all: true });
  assert(updateRes.mode === 'dry-run', '未传 dry_run 时默认进入 dry-run 模式');
  assert(recordedCmds[0].cmd.includes('skill') && recordedCmds[0].cmd.includes('update'), '调用 gh skill update');
  assert(recordedCmds[0].cmd.includes('--dry-run'), '默认追加 --dry-run 标志');
  assert(recordedCmds[0].cmd.includes('--all'), '传递 --all');

  // 指定具体 skill 列表与正式更新
  recordedCmds = [];
  await skillTool.execute({ action: 'update', skill_names: ['code-review', 'commit-helper'], dry_run: false });
  const updSpecificCmd = recordedCmds[0].cmd;
  assert(!updSpecificCmd.includes('--dry-run'), 'dry_run: false 不追加 --dry-run');
  assert(updSpecificCmd.includes('code-review') && updSpecificCmd.includes('commit-helper'), '正确传递指定技能名称');

  // 渲染
  const updateMd = renderSkillMarkdown({ action: 'update' }, updateRes);
  assert(updateMd.includes('### 🔄'), '渲染出更新标题');
  assert(updateMd.includes('Dry-run 只读模式'), '说明 Dry-run 模式');

  console.log('\n--- 5. main.ts 18 工具全量装配与 help 映射覆盖测试 ---');
  const mainModule = await import('../lib/main.js');
  const mockCtx = createMockContext();
  // 配置必须过 Schema：apply 的入参是 Schemastery 的输出形态（volatile 字段是稳定引用），
  // 直接喂裸对象会让 .get() 落空。这里与 cordis loader 的做法保持一致。
  mainModule.apply(mockCtx, mainModule.Config({ checkUpdate: false }));
  const registeredTools = mockCtx.registeredTools;
  assert(registeredTools.length === 19, `main.ts 成功装配 19 大核心工具 (实际: ${registeredTools.length})`);
  assert(registeredTools.includes('github_project'), '装配中包含 github_project');
  assert(registeredTools.includes('github_codespace'), '装配中包含 github_codespace');

  const helpTool = createHelpTool(mockExecutor);
  const overviewRes = await helpTool.execute({ topic: 'overview' });
  assert(overviewRes.result.includes('github_project'), 'overview 包含 github_project');
  assert(overviewRes.result.includes('github_codespace'), 'overview 包含 github_codespace');

  const projHelp = await helpTool.execute({ topic: 'project' });
  assert(projHelp.result.includes('github_project(action: \'list\''), 'project 指南可用');

  const csHelp = await helpTool.execute({ topic: 'codespace' });
  assert(csHelp.result.includes('github_codespace(action: \'list\''), 'codespace 指南可用');

  const mappingRes = await helpTool.execute({ topic: 'mapping' });
  assert(mappingRes.result.includes('Project（github_project，6 action）'), 'mapping 包含 project 核心映射');
  assert(mappingRes.result.includes('Codespace（github_codespace，4 action）'), 'mapping 包含 codespace 核心映射');
  assert(!mappingRes.result.includes('`gh project` | Projects v2 | `graphql`'), '未覆盖域中彻底移除 gh project 降级引导');
  assert(!mappingRes.result.includes('`gh codespace` | 云端开发环境 | `user/codespaces`'), '未覆盖域中彻底移除 gh codespace 降级引导');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Phase 19 测试结果: ${passed}/${total} 通过`);
  if (passed !== total) {
    console.error(`存在未通过测试: ${total - passed} 项失败`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Phase 19 测试崩溃:', err);
  process.exit(1);
});
