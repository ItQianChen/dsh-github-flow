// test/phase18.test.mjs - Phase 18 · github_agent_task 与 github_discussion 独立领域工具测试套件
// 涵盖：Agent Task 状态徽标与详情日志、Discussion 分类与评论楼层渲染、
// 参数前置校验与防无头交互挂起、execFile 数组组装、main.ts 16 工具装配与 help 全景映射

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

  console.log('\n--- 1. Agent Task 渲染器与工具功能测试 ---');
  const {
    formatAgentTaskStateBadge,
    renderAgentTaskList,
    renderAgentTaskView,
    renderAgentTaskMarkdown,
    formatDiscussionStateBadge,
    renderDiscussionList,
    renderDiscussionView,
    renderDiscussionMarkdown,
  } = await import('../lib/renderers/markdown.js');
  const { createAgentTaskTool } = await import('../lib/tools/agent-task.js');
  const { createDiscussionTool } = await import('../lib/tools/discussion.js');
  const { createHelpTool } = await import('../lib/tools/help.js');

  // 1.1 状态徽标映射
  assert(formatAgentTaskStateBadge('COMPLETED').includes('🟢 COMPLETED'), 'COMPLETED 映射为绿色徽标');
  assert(formatAgentTaskStateBadge('RUNNING').includes('🟡 RUNNING'), 'RUNNING 映射为黄色徽标');
  assert(formatAgentTaskStateBadge('in_progress').includes('🟡 RUNNING'), 'in_progress 容错映射为黄色徽标');
  assert(formatAgentTaskStateBadge('FAILED').includes('🔴 FAILED'), 'FAILED 映射为红色徽标');
  assert(formatAgentTaskStateBadge('CANCELLED').includes('⚪ CANCELLED'), 'CANCELLED 映射为白色徽标');

  // 1.2 列表与详情卡片渲染
  const sampleTasks = [
    {
      id: 'e2fa49d2-f164-4a56-ab99-498090b8fcdf',
      name: '实现用户身份鉴权模块',
      state: 'RUNNING',
      pullRequestNumber: 42,
      pullRequestUrl: 'https://github.com/owner/repo/pull/42',
      createdAt: '2026-10-17T12:00:00Z',
    },
  ];
  const taskListMd = renderAgentTaskList(sampleTasks);
  assert(taskListMd.includes('`e2fa49d2...`'), '长任务 ID 截断为紧凑代码块');
  assert(taskListMd.includes('实现用户身份鉴权模块'), '包含任务描述');
  assert(taskListMd.includes('[#42](https://github.com/owner/repo/pull/42)'), '包含关联 PR 链接');

  const emptyTasksMd = renderAgentTaskList([]);
  assert(emptyTasksMd.includes('📭 暂无智能体任务'), '空任务列表优雅呈现');

  const sampleTaskDetail = {
    id: 'e2fa49d2-f164-4a56-ab99-498090b8fcdf',
    name: '实现用户身份鉴权模块',
    state: 'COMPLETED',
    repository: 'owner/repo',
    user: 'monalisa',
    createdAt: '2026-10-17T12:00:00Z',
    completedAt: '2026-10-17T12:05:00Z',
    pullRequestNumber: 42,
    pullRequestTitle: 'feat: add auth module',
    pullRequestUrl: 'https://github.com/owner/repo/pull/42',
    logs: 'Step 1: Analyzed codebase\nStep 2: Created src/auth.ts',
  };
  const taskDetailMd = renderAgentTaskView(sampleTaskDetail);
  assert(taskDetailMd.includes('### 🤖 Agent Task: 实现用户身份鉴权模块'), '渲染出机器人任务标头');
  assert(taskDetailMd.includes('@monalisa'), '包含分派用户');
  assert(taskDetailMd.includes('Step 1: Analyzed codebase'), '完整呈现会话执行日志');

  // 1.3 github_agent_task 命令组装与防御断言
  let recordedCmds = [];
  const mockExecutor = {
    async run(cmd, opts) {
      recordedCmds.push({ cmd, opts });
      if (cmd[0] === 'agent-task' && cmd[1] === 'list') {
        return { ok: true, data: sampleTasks };
      }
      if (cmd[0] === 'agent-task' && cmd[1] === 'view') {
        if (cmd.includes('--log')) {
          return { ok: true, rawOutput: 'Session log fetched' };
        }
        return { ok: true, data: sampleTaskDetail };
      }
      if (cmd[0] === 'agent-task' && cmd[1] === 'create') {
        return { ok: true, rawOutput: 'Task created: #43' };
      }
      if (cmd[0] === 'discussion' && cmd[1] === 'list') {
        return { ok: true, data: [] };
      }
      if (cmd[0] === 'discussion' && cmd[1] === 'view') {
        return { ok: true, data: { number: 123, title: 'RFC' } };
      }
      if (cmd[0] === 'discussion') {
        return { ok: true, rawOutput: 'Discussion success' };
      }
      return { ok: true, rawOutput: '' };
    },
  };

  const agentTaskTool = createAgentTaskTool(mockExecutor);
  assert(agentTaskTool.name === 'github_agent_task', '工具名称为 github_agent_task');
  assert(agentTaskTool.parameters.properties.action.enum.length === 3, '支持 list, view, create 3 大动作');

  // list
  recordedCmds = [];
  const taskListRes = await agentTaskTool.execute({ action: 'list', limit: 15, repo: 'owner/repo' });
  assert(taskListRes.items.length === 1, 'agent-task list 成功返回 items');
  const lastTaskCmd = recordedCmds[0].cmd;
  assert(lastTaskCmd[0] === 'agent-task' && lastTaskCmd[1] === 'list', '调用 gh agent-task list');
  assert(lastTaskCmd.includes('-L') && lastTaskCmd.includes('15'), '传递 -L limit 参数');
  assert(lastTaskCmd.includes('-R') && lastTaskCmd.includes('owner/repo'), '传递 -R 目标仓库');
  assert(lastTaskCmd.includes('--json'), '声明了 --json 字段');

  // view 缺失 task_id 拦截防挂起
  let missingTaskIdThrows = false;
  try {
    await agentTaskTool.execute({ action: 'view' });
  } catch (err) {
    missingTaskIdThrows = err.message.includes('必须提供 task_id');
  }
  assert(missingTaskIdThrows, 'view 操作缺少 task_id 严格抛错防止 CLI 交互挂起');

  // view 正常查询并拉取日志
  recordedCmds = [];
  const taskViewRes = await agentTaskTool.execute({ action: 'view', task_id: 'e2fa49d2', log: true });
  assert(taskViewRes.name === '实现用户身份鉴权模块', '成功获取任务详情');
  assert(taskViewRes.logs === 'Session log fetched', 'log: true 成功触发会话日志查询并挂载');
  assert(recordedCmds.length === 2, '执行了详情查询与日志查询两条命令');
  assert(recordedCmds[1].cmd.includes('--log'), '第二条命令包含 --log 标志');

  // create
  recordedCmds = [];
  const taskCreateRes = await agentTaskTool.execute({
    action: 'create',
    prompt: '重构网络通信模块',
    base_branch: 'develop',
    custom_agent: 'senior-dev',
  });
  assert(taskCreateRes.message.includes('已成功创建并派发'), '任务派发成功');
  const createCmd = recordedCmds[0].cmd;
  assert(createCmd.includes('重构网络通信模块'), '正文作为位置参数传递');
  assert(createCmd.includes('-b') && createCmd.includes('develop'), '传递 -b 基准分支');
  assert(createCmd.includes('-a') && createCmd.includes('senior-dev'), '传递 -a 自定义 Agent');

  console.log('\n--- 2. Discussion 渲染器与工具功能测试 ---');
  // 2.1 状态徽标映射
  assert(formatDiscussionStateBadge('OPEN', true).includes('🟢 ANSWERED'), 'answered 优先映射为绿色已解答');
  assert(formatDiscussionStateBadge('OPEN', false).includes('🔵 OPEN'), 'OPEN 映射为蓝色徽标');
  assert(formatDiscussionStateBadge('CLOSED', false).includes('🟣 CLOSED'), 'CLOSED 映射为紫色徽标');

  // 2.2 列表与详情卡片渲染
  const sampleDiscussions = [
    {
      number: 101,
      title: '关于统一插件错误处理规范的探讨',
      category: { name: 'RFC' },
      state: 'OPEN',
      answered: false,
      author: 'alice',
      url: 'https://github.com/owner/repo/discussions/101',
      updatedAt: '2026-10-17T10:00:00Z',
    },
  ];
  const discListMd = renderDiscussionList(sampleDiscussions);
  assert(discListMd.includes('[#101](https://github.com/owner/repo/discussions/101)'), '编号包含超链接');
  assert(discListMd.includes('`RFC`'), '包含分类徽标');
  assert(discListMd.includes('@alice'), '包含作者');

  const emptyDiscMd = renderDiscussionList([]);
  assert(emptyDiscMd.includes('📭 暂无讨论主题'), '空讨论列表优雅呈现');

  const sampleDiscDetail = {
    number: 101,
    title: '关于统一插件错误处理规范的探讨',
    category: 'RFC',
    state: 'OPEN',
    author: 'alice',
    createdAt: '2026-10-17T09:00:00Z',
    url: 'https://github.com/owner/repo/discussions/101',
    labels: [{ name: 'architecture' }],
    body: '我们应该在所有工具中引入统一定义的 Safe-by-Default 策略...',
    comments: [
      {
        author: { login: 'bob' },
        createdAt: '2026-10-17T09:30:00Z',
        body: '非常赞同！',
      },
    ],
  };
  const discDetailMd = renderDiscussionView(sampleDiscDetail);
  assert(discDetailMd.includes('### 💬 Discussion #101'), '渲染出讨论大标题');
  assert(discDetailMd.includes('`architecture`'), '渲染出标签徽标');
  assert(discDetailMd.includes('我们应该在所有工具中引入统一定义'), '包含正文内容');
  assert(discDetailMd.includes('#1 楼 @bob'), '包含格式化评论楼层');

  // 2.3 github_discussion 命令组装与防御断言
  const discTool = createDiscussionTool(mockExecutor);
  assert(discTool.name === 'github_discussion', '工具名称为 github_discussion');
  assert(discTool.parameters.properties.action.enum.length === 5, '支持 5 大 action');

  // list
  recordedCmds = [];
  await discTool.execute({
    action: 'list',
    category: 'RFC',
    state: 'open',
    search: 'error handling',
    labels: ['architecture', 'v1'],
    limit: 20,
    repo: 'owner/repo',
  });
  const listCmd = recordedCmds[0].cmd;
  assert(listCmd[0] === 'discussion' && listCmd[1] === 'list', '调用 gh discussion list');
  assert(listCmd.includes('-c') && listCmd.includes('RFC'), '传递 -c category');
  assert(listCmd.includes('-s') && listCmd.includes('open'), '传递 -s state');
  assert(listCmd.includes('-S') && listCmd.includes('error handling'), '传递 -S search');
  assert(listCmd.includes('-l') && listCmd.includes('architecture'), '传递 -l label 1');
  assert(listCmd.includes('-l') && listCmd.includes('v1'), '传递 -l label 2');
  assert(listCmd.includes('-L') && listCmd.includes('20'), '传递 -L limit');

  // view
  let missingDiscNumThrows = false;
  try {
    await discTool.execute({ action: 'view' });
  } catch (err) {
    missingDiscNumThrows = err.message.includes('必须提供 discussion_number');
  }
  assert(missingDiscNumThrows, 'view 缺少 discussion_number 严格抛错防挂起');

  recordedCmds = [];
  await discTool.execute({ action: 'view', discussion_number: 101, comments: true });
  assert(recordedCmds[0].cmd.includes('101'), 'view 传递目标编号');
  assert(recordedCmds[0].cmd.includes('-c'), '默认携带 -c comments 标志');

  // create
  let missingCreateFieldsThrows = false;
  try {
    await discTool.execute({ action: 'create', title: 'test' });
  } catch (err) {
    missingCreateFieldsThrows = err.message.includes('必须提供 body');
  }
  assert(missingCreateFieldsThrows, 'create 缺少必需字段严格校验抛错');

  recordedCmds = [];
  const createDiscRes = await discTool.execute({
    action: 'create',
    title: '新设计',
    body: '正文描述',
    category: 'Ideas',
    repo: 'owner/repo',
  });
  assert(createDiscRes.message.includes('已成功发起'), '讨论创建成功');
  const dCreateCmd = recordedCmds[0].cmd;
  assert(dCreateCmd.includes('-t') && dCreateCmd.includes('新设计'), '传递 -t 标题');
  assert(dCreateCmd.includes('-b') && dCreateCmd.includes('正文描述'), '传递 -b 正文');
  assert(dCreateCmd.includes('-c') && dCreateCmd.includes('Ideas'), '传递 -c 分类');

  // edit
  recordedCmds = [];
  await discTool.execute({ action: 'edit', discussion_number: 101, title: '更新标题' });
  assert(recordedCmds[0].cmd[0] === 'discussion' && recordedCmds[0].cmd[1] === 'edit', '调用 gh discussion edit');
  assert(recordedCmds[0].cmd.includes('-t') && recordedCmds[0].cmd.includes('更新标题'), '传递编辑后的 -t');

  // comment
  recordedCmds = [];
  await discTool.execute({ action: 'comment', discussion_number: 101, body: '追加评论' });
  assert(recordedCmds[0].cmd[0] === 'discussion' && recordedCmds[0].cmd[1] === 'comment', '调用 gh discussion comment');
  assert(recordedCmds[0].cmd.includes('-b') && recordedCmds[0].cmd.includes('追加评论'), '传递评论正文 -b');

  console.log('\n--- 3. main.ts 16 工具装配与 help 映射覆盖测试 ---');
  const mainModule = await import('../lib/main.js');
  let registeredTools = [];
  const mockCtx = {
    tools: {
      register(tool) {
        registeredTools.push(tool.name);
      },
    },
    commands: {
      register() {},
    },
  };
  mainModule.apply(mockCtx, { checkUpdate: false });
  assert(registeredTools.length === 16, `main.ts 成功装配 16 大核心工具 (实际: ${registeredTools.length})`);
  assert(registeredTools.includes('github_agent_task'), '装配中包含 github_agent_task');
  assert(registeredTools.includes('github_discussion'), '装配中包含 github_discussion');

  const helpTool = createHelpTool(mockExecutor);
  const overviewRes = await helpTool.execute({ topic: 'overview' });
  assert(overviewRes.result.includes('github_agent_task'), 'overview 包含 github_agent_task');
  assert(overviewRes.result.includes('github_discussion'), 'overview 包含 github_discussion');

  const agentTaskHelp = await helpTool.execute({ topic: 'agent_task' });
  assert(agentTaskHelp.result.includes('github_agent_task(action: \'list\''), 'agent_task 指南可用');

  const discHelp = await helpTool.execute({ topic: 'discussion' });
  assert(discHelp.result.includes('github_discussion(action: \'create\''), 'discussion 指南可用');

  const mappingRes = await helpTool.execute({ topic: 'mapping' });
  assert(mappingRes.result.includes('Agent Task（github_agent_task，3 action）'), 'mapping 包含 agent-task 核心映射');
  assert(mappingRes.result.includes('Discussion（github_discussion，5 action）'), 'mapping 包含 discussion 核心映射');
  assert(!mappingRes.result.includes('`gh agent-task` | Copilot 会话 | `graphql`'), '未覆盖域中已移除 gh agent-task 降级引导');
  assert(!mappingRes.result.includes('`gh discussion` | 讨论 | `graphql`'), '未覆盖域中已移除 gh discussion 降级引导');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Phase 18 测试结果: ${passed}/${total} 通过`);
  if (passed !== total) {
    console.error(`存在未通过测试: ${total - passed} 项失败`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Phase 18 测试崩溃:', err);
  process.exit(1);
});
