// test/phase20.test.mjs - Phase 20 · tools/result 运行时审计、降级率观测与健康度看板测试套件
// 涵盖：TelemetryRingBuffer 环形缓冲容量锁定、TelemetryCollector 指标计算与敏感数据脱敏、
// 降级率与健康分算法、github_status(action: 'health') 看板渲染、/gh status 命令集成与全景闭环

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

  console.log('\n--- 1. TelemetryRingBuffer 环形队列容量与 FIFO 行为测试 ---');
  const { TelemetryRingBuffer, TelemetryCollector } = await import('../lib/telemetry.js');
  const { renderHealthAuditMarkdown, renderStatusMarkdown } = await import('../lib/renderers/markdown.js');
  const { createStatusTool } = await import('../lib/tools/status.js');
  const { createHelpTool } = await import('../lib/tools/help.js');
  const { registerGhCommand } = await import('../lib/commands/gh.js');

  const ring = new TelemetryRingBuffer(3);
  assert(ring.size() === 0, '初始大小为 0');

  ring.push({ id: '1', timestamp: 1, toolName: 't1', success: true, degraded: false, scopeBlocked: false, confirmBlocked: false });
  ring.push({ id: '2', timestamp: 2, toolName: 't2', success: true, degraded: false, scopeBlocked: false, confirmBlocked: false });
  assert(ring.size() === 2, '正常插入 2 条记录');

  ring.push({ id: '3', timestamp: 3, toolName: 't3', success: true, degraded: false, scopeBlocked: false, confirmBlocked: false });
  assert(ring.size() === 3, '达到容量上限 3');

  // 插入第 4 条，应淘汰最旧的 id: '1'
  ring.push({ id: '4', timestamp: 4, toolName: 't4', success: true, degraded: false, scopeBlocked: false, confirmBlocked: false });
  assert(ring.size() === 3, '溢出后严格维持容量上限 3');
  const allRecords = ring.getAll();
  assert(allRecords[0].id === '2' && allRecords[2].id === '4', '先进先出淘汰最旧元素');

  ring.clear();
  assert(ring.size() === 0, 'clear 成功清空队列');

  console.log('\n--- 2. TelemetryCollector 统计分析、降级率与健康分算法测试 ---');
  const collector = new TelemetryCollector(50);

  // 2.1 正常调用打点
  collector.recordCall('github_pr', { action: 'list' }, { ok: true, data: [] }, 120);
  collector.recordCall('github_pr', { action: 'view' }, { ok: true, data: {} }, 85);
  collector.recordCall('github_issue', { action: 'list' }, { ok: true, data: [] }, 90);

  // 2.2 降级链路打点 (degraded: true)
  collector.recordCall('github_repo', { action: 'read_file' }, { ok: true, degraded: true, data: 'content' }, 450);

  // 2.3 权限拦截打点 (SCOPE_REQUIRED)
  collector.recordCall('github_project', { action: 'list' }, { status: 'SCOPE_REQUIRED', scope: 'read:project' });

  // 2.4 确认防线打点 (AWAITING_CONFIRMATION)
  collector.recordCall('github_release', { action: 'delete' }, { status: 'AWAITING_CONFIRMATION' });

  // 2.5 执行失败打点
  collector.recordCall('github_run', { action: 'view' }, { ok: false, error: 'Workflow run not found' }, 300);

  const summary = collector.getSummary();
  assert(summary.totalCalls === 7, `总调用量准确 (期望: 7, 实际: ${summary.totalCalls})`);
  assert(summary.degradedCount === 1, '准确统计 1 次降级调用');
  assert(summary.scopeBlockedCount === 1, '准确统计 1 次 Scope 权限拦截');
  assert(summary.confirmBlockedCount === 1, '准确统计 1 次安全确认防线拦截');
  assert(summary.failureCount === 1, '准确统计 1 次执行失败');

  // 降级率计算：1 / 7 = 14.3%
  assert(summary.degradationRate === 14.3, `降级率计算精准 (实际: ${summary.degradationRate}%)`);
  assert(summary.healthScore >= 70 && summary.healthScore <= 95, `健康分在合理区间 (实际: ${summary.healthScore})`);
  assert(summary.toolStats['github_pr'].total === 2, '工具 github_pr 统计 2 次');
  assert(summary.toolStats['github_repo'].degraded === 1, '工具 github_repo 标记 1 次降级');

  // 自愈建议生成
  assert(summary.recommendations.some(r => r.includes('github_repo') && r.includes('2.95.0+')), '生成 repo 文件读取降级升级建议');
  assert(summary.recommendations.some(r => r.includes('OAuth Scope') && r.includes('gh auth refresh')), '生成权限补全自愈建议');

  // 2.6 异常隔离保护 (Fail-Open)
  let collectorDidNotCrash = true;
  try {
    collector.recordCall(null, undefined, null);
    collector.recordCall('github_test', {}, { get degraded() { throw new Error('Boom'); } });
  } catch {
    collectorDidNotCrash = false;
  }
  assert(collectorDidNotCrash, '面对畸形对象打点时保持 Fail-Open 隔离不崩溃');

  console.log('\n--- 3. renderHealthAuditMarkdown 渲染器测试 ---');
  const healthMd = renderHealthAuditMarkdown(summary);
  assert(healthMd.includes('### 🩺 DSH GitHub 工具链健康度与降级率审计报表'), '包含报表标头');
  assert(healthMd.includes('综合健康分'), '包含综合健康分指标');
  assert(healthMd.includes('`14.3%`'), '包含降级率指标');
  assert(healthMd.includes('| `github_pr` | 2 |'), '包含核心工具调用统计表格行');
  assert(healthMd.includes('💡 **优化与自愈建议:**'), '包含自愈建议小节');

  console.log('\n--- 4. github_status 工具 health 动作测试 ---');
  const mockExecutor = {
    // 18 个工具统一经 resolveExecScope 归一工作区；测试替身必须实现同一接口
    resolveExecScope(execContext) {
      return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId || execContext?.session?.id };
    },
    async run() {
      return { ok: true, rawOutput: 'mock status output' };
    },
    async checkAuth() {
      return { loggedIn: true, user: 'monalisa', scopes: ['repo'] };
    },
    async getRepoMetadata() {
      return { nameWithOwner: 'owner/repo', defaultBranch: 'main', url: 'https://github.com/owner/repo' };
    },
  };

  const statusTool = createStatusTool(mockExecutor, collector);
  assert(statusTool.parameters.properties.action.enum.includes('health'), 'action 枚举包含 health');

  const healthRes = await statusTool.execute({ action: 'health' });
  assert(healthRes.healthScore !== undefined, 'health 动作成功返回健康分指标');
  assert(healthRes.totalCalls === 7, '返回与收集器一致的汇总样本量');

  const renderRes = statusTool.output.render({ action: 'health' }, healthRes);
  assert(renderRes[0].text.includes('DSH GitHub 工具链健康度与降级率审计报表'), 'output.render 成功分流渲染健康度看板');

  console.log('\n--- 5. /gh status 人类命令集成测试 ---');
  const registeredCommands = [];
  const mockCommandsService = {
    register(cmd) {
      registeredCommands.push(cmd);
    },
  };
  registerGhCommand(mockCommandsService, mockExecutor, undefined, collector);
  assert(registeredCommands.length === 3, `成功注册 3 大一级快捷指令 (实际: ${registeredCommands.length})`);

  const ghCmd = registeredCommands.find((c) => c.name === 'gh');
  const ghUpgradeCmd = registeredCommands.find((c) => c.name === 'gh-upgrade');
  const ghHelpCmd = registeredCommands.find((c) => c.name === 'gh-help');
  assert(ghCmd && ghUpgradeCmd && ghHelpCmd, '成功找到 gh, gh-upgrade, gh-help 指令实体');

  // 5.1 /gh 直接无参回车
  const cmdOutputEmpty = await ghCmd.handler({ rawInput: '' });
  assert(cmdOutputEmpty.text.includes('工具链运行时可观测性 (Telemetry)'), '/gh 无参默认挂载遥测小节');
  assert(cmdOutputEmpty.text.includes('/gh-upgrade'), '/gh 无参输出底部附带 /gh-upgrade 快捷指令引导');

  // 5.2 /gh update 别名容错
  const cmdOutputAlias = await ghCmd.handler({ rawInput: 'update' });
  assert(cmdOutputAlias.text.includes('插件升级指南'), '/gh update 智能容错等价于 upgrade');

  // 5.3 /gh-upgrade 一级命令直接回车
  const upgradeOutput = await ghUpgradeCmd.handler();
  assert(upgradeOutput.text.includes('插件升级指南'), '/gh-upgrade 直接输出升级指引');

  // 5.4 /gh-help 一级命令直接回车
  const helpOutput = await ghHelpCmd.handler();
  assert(helpOutput.text.includes('快捷指令帮助'), '/gh-help 直接输出帮助指南');

  console.log('\n--- 6. help 映射与元知识库覆盖测试 ---');
  const helpTool = createHelpTool(mockExecutor);
  const mappingRes = await helpTool.execute({ topic: 'mapping' });
  assert(mappingRes.result.includes('github_status(action:\'health\')'), 'mapping 包含 health 审计 action 对照');

  const statusHelp = await helpTool.execute({ topic: 'status' });
  assert(statusHelp.result.includes('github_status(action: \'health\')'), 'status 详细指南包含 health 调用示例');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Phase 20 测试结果: ${passed}/${total} 通过`);
  if (passed !== total) {
    console.error(`存在未通过测试: ${total - passed} 项失败`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Phase 20 测试崩溃:', err);
  process.exit(1);
});
