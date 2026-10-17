// test/phase17.test.mjs - Phase 17 · github_skill publish 校验与发布闭环测试套件
// 涵盖：TSV 诊断行解析、Markdown 结构化表格渲染、publish 参数与默认 dry-run 行为、
// 非法目录防御、tag 必填防无头交互挂起、破坏性发布 confirm 拦截、--fix 自动修复及 help 映射更新

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

  console.log('\n--- 1. parseSkillPublishOutput TSV 解析纯函数测试 ---');
  const { parseSkillPublishOutput, renderSkillPublishMarkdown, renderSkillMarkdown } = await import('../lib/renderers/markdown.js');
  const { createSkillTool } = await import('../lib/tools/skill.js');
  const { createHelpTool } = await import('../lib/tools/help.js');

  // 1.1 成功态（无错误，仅建议）
  const sampleSuccessTsv = `warning\tsample-skill\trecommended field missing: license
warning\t\tno active tag protection rulesets found. Consider protecting tags to ensure immutable releases (Settings > Rules > Rulesets)`;
  const sampleSuccessStderr = `\nDry run complete. Use without --dry-run to publish.\n`;

  const reportSuccess = parseSkillPublishOutput(sampleSuccessTsv, sampleSuccessStderr, true, 'dry-run', 'skills');
  assert(reportSuccess.success === true, '无 error 且 exitOk=true 时判定校验通过');
  assert(reportSuccess.mode === 'dry-run', '报告模式为 dry-run');
  assert(reportSuccess.items.length === 1, '解析出 1 项技能级建议');
  assert(reportSuccess.items[0].skillName === 'sample-skill', '解析出技能名称 sample-skill');
  assert(reportSuccess.items[0].type === 'warning', '诊断项类型为 warning');
  assert(reportSuccess.repoWarnings.length === 1, '技能名为空的项正确归入仓库级建议');
  assert(reportSuccess.repoWarnings[0].includes('no active tag protection'), '提取出仓库级策略建议内容');
  assert(reportSuccess.summary.includes('Dry run complete'), '提取出汇总状态 Dry run complete');

  // 1.2 校验失败态（包含多项 error）
  const sampleErrorTsv = `error\tinvalid_name\tname "invalid_name" does not follow agentskills.io naming convention
error\tinvalid_name\tmissing required field: description
warning\tinvalid_name\trecommended field missing: license
warning\t\tno active tag protection rulesets found`;
  const sampleErrorStderr = `validation failed with 2 error(s)`;

  const reportError = parseSkillPublishOutput(sampleErrorTsv, sampleErrorStderr, false, 'dry-run', 'skills');
  assert(reportError.success === false, '包含 error 时判定校验未通过');
  assert(reportError.items.length === 3, '解析出 3 项技能级诊断');
  const errors = reportError.items.filter(i => i.type === 'error');
  assert(errors.length === 2, '包含 2 项 error 诊断');
  assert(errors[0].message.includes('agentskills.io naming convention'), '提取出错误原因 1');
  assert(errors[1].message.includes('missing required field: description'), '提取出错误原因 2');
  assert(reportError.summary === 'validation failed with 2 error(s)', '精准提取 stderr 校验失败汇总');

  // 1.3 自动修复态 (--fix)
  const sampleFixTsv = `fixed\tsample-skill\tstripped install metadata: github-creator
warning\t\tno active tag protection rulesets found`;
  const sampleFixStderr = `\nFixed 1 file(s). Review and commit the changes, then run gh skill publish to publish.\n`;

  const reportFix = parseSkillPublishOutput(sampleFixTsv, sampleFixStderr, true, 'fix', 'skills');
  assert(reportFix.success === true, 'fix 模式正常执行判定为成功');
  assert(reportFix.mode === 'fix', '模式为 fix');
  assert(reportFix.items.length === 1 && reportFix.items[0].type === 'fixed', '解析出 1 项 fixed 记录');
  assert(reportFix.items[0].message.includes('stripped install metadata'), '提取出修复明细');
  assert(reportFix.summary.includes('Fixed 1 file(s)'), '提取出已修复文件数量汇总');

  // 1.4 未检索到 Skills 异常态
  const sampleNoSkillStderr = `no skills found in /path/to/empty\n  Expected SKILL.md in the directory...`;
  const reportNoSkill = parseSkillPublishOutput('', sampleNoSkillStderr, false, 'dry-run', 'empty');
  assert(reportNoSkill.success === false, '未找到技能时判定为失败');
  assert(reportNoSkill.items.length === 1, '自动构建一条说明错误项');
  assert(reportNoSkill.items[0].type === 'error', '构建的项为 error 类型');
  assert(reportNoSkill.items[0].message.includes('no skills found in'), '提示中包含未找到技能的路径信息');

  console.log('\n--- 2. renderSkillPublishMarkdown 渲染器测试 ---');
  // 2.1 成功态渲染
  const successMd = renderSkillPublishMarkdown(reportSuccess);
  assert(successMd.includes('### ✅ Agent Skills 合规校验通过！'), '渲染出绿色成功标题');
  assert(successMd.includes('建议优化项 (1 项)'), '渲染出建议优化项数量');
  assert(successMd.includes('| ⚠️ 建议 | `sample-skill` | recommended field missing: license |'), '渲染出建议表格行');
  assert(successMd.includes('仓库策略提醒:'), '渲染出仓库策略提醒板块');
  assert(successMd.includes('`github_skill(action: "publish", tag: "v1.0.0", dry_run: false, confirm: true)`'), '附带正式发布调用示例');

  // 2.2 失败态渲染
  const errorMd = renderSkillPublishMarkdown(reportError);
  assert(errorMd.includes('### ⚠️ Agent Skills 校验发现问题 (2 项错误，1 项警告)'), '渲染出失败标题与统计');
  assert(errorMd.includes('| ❌ 错误 | `invalid_name` |'), '错误项带有红色叉号徽标');
  assert(errorMd.includes('`github_skill(action: "publish", fix: true)`'), '提供元数据自动修复引导');

  // 2.3 修复态渲染
  const fixMd = renderSkillPublishMarkdown(reportFix);
  assert(fixMd.includes('### 🛠️ Agent Skills 元数据自动修复完成'), '渲染出自动修复标题');
  assert(fixMd.includes('已自动清洗 **1** 处技能文件中的安装残留元数据'), '渲染出清洗统计');
  assert(fixMd.includes('`git diff`'), '提醒审查本地文件变更');

  // 2.4 正式发布成功态渲染
  const reportPublishSuccess = {
    mode: 'publish',
    success: true,
    directory: 'skills',
    items: [],
    repoWarnings: [],
    summary: 'Released https://github.com/owner/repo/releases/tag/v1.0.0',
    tag: 'v1.0.0',
  };
  const publishSuccessMd = renderSkillPublishMarkdown(reportPublishSuccess);
  assert(publishSuccessMd.includes('### 🚀 Agent Skill 发布成功！'), '渲染出发布成功火箭标题');
  assert(publishSuccessMd.includes('`v1.0.0`'), '显示版本 Tag');
  assert(publishSuccessMd.includes('agent-skills'), '提示已附加 agent-skills Topic');

  // 2.5 拦截态渲染
  const blockedReport = {
    status: 'AWAITING_CONFIRMATION',
    warning: '⚠️ 发布确认拦截',
    impact: '即将创建 Release',
    requiredAction: '请附加 confirm: true',
  };
  const blockedMd = renderSkillMarkdown({ action: 'publish' }, blockedReport);
  assert(blockedMd.includes('### ⚠️ 发布确认拦截'), 'renderSkillMarkdown 正确接管拦截渲染');
  assert(blockedMd.includes('即将创建 Release'), '包含影响评估');

  console.log('\n--- 3. github_skill 工具定义与参数路由测试 ---');
  let recordedCmds = [];
  const mockExecutor = {
    async run(cmd, opts) {
      recordedCmds.push({ cmd, opts });
      if (cmd[0] === 'skill' && cmd[1] === 'publish') {
        if (cmd.includes('--dry-run')) {
          return { ok: true, rawOutput: sampleSuccessTsv, error: sampleSuccessStderr };
        }
        if (cmd.includes('--fix')) {
          return { ok: true, rawOutput: sampleFixTsv, error: sampleFixStderr };
        }
        if (cmd.includes('--tag')) {
          return { ok: true, rawOutput: 'Released v1.0.0' };
        }
      }
      return { ok: true, rawOutput: '' };
    },
  };

  const skillTool = createSkillTool(mockExecutor);
  assert(skillTool.name === 'github_skill', '工具名称为 github_skill');
  assert(skillTool.parameters.properties.action.enum.includes('publish'), 'action 枚举包含 publish');
  assert('dry_run' in skillTool.parameters.properties, '声明了 dry_run 参数');
  assert('fix' in skillTool.parameters.properties, '声明了 fix 参数');
  assert('tag' in skillTool.parameters.properties, '声明了 tag 参数');
  assert('directory' in skillTool.parameters.properties, '声明了 directory 参数');

  // 3.1 默认只读自检（缺省 dry_run: true）
  recordedCmds = [];
  const resDefault = await skillTool.execute({ action: 'publish' });
  assert(resDefault.mode === 'dry-run', '缺省行为为 dry-run 模式');
  assert(resDefault.success === true, '默认自检成功返回');
  assert(recordedCmds.length === 1, '调用底层 CLI 一次');
  const defaultCmd = recordedCmds[0].cmd;
  assert(defaultCmd[0] === 'skill' && defaultCmd[1] === 'publish', '调用 gh skill publish');
  assert(defaultCmd.includes('--dry-run'), '未传 dry_run 时默认追加 --dry-run');
  assert(!defaultCmd.includes('--fix'), '默认不带 --fix');
  assert(!defaultCmd.includes('--tag'), '默认不带 --tag');

  // 3.2 显式 directory 校验（存在目录通过，不存在抛错）
  recordedCmds = [];
  const realDir = './src';
  await skillTool.execute({ action: 'publish', directory: realDir });
  assert(recordedCmds[0].cmd.includes(realDir), '显式目录正确传递给 CLI');

  let nonExistDirThrows = false;
  try {
    await skillTool.execute({ action: 'publish', directory: './non-existent-skills-dir-xyz' });
  } catch (err) {
    nonExistDirThrows = err.message.includes('指定的技能目录不存在');
  }
  assert(nonExistDirThrows, '指定不存在的技能目录严格拦截抛错');

  // 3.3 --fix 模式
  recordedCmds = [];
  const resFix = await skillTool.execute({ action: 'publish', fix: true });
  assert(resFix.mode === 'fix', '指定 fix: true 时进入 fix 模式');
  const fixCmd = recordedCmds[0].cmd;
  assert(fixCmd.includes('--fix'), 'CLI 命令中包含 --fix');
  assert(!fixCmd.includes('--dry-run'), 'fix 模式不包含 --dry-run');

  // 3.4 正式发布：缺少 tag 强拦截（防交互式 TTY 挂起）
  let missingTagThrows = false;
  try {
    await skillTool.execute({ action: 'publish', dry_run: false });
  } catch (err) {
    missingTagThrows = err.message.includes('必须提供版本 tag');
  }
  assert(missingTagThrows, '正式发布（dry_run: false）缺少 tag 严格拦截防挂起');

  // 3.5 正式发布：未传 confirm: true 拦截
  recordedCmds = [];
  const resBlockedPublish = await skillTool.execute({ action: 'publish', dry_run: false, tag: 'v1.0.0' });
  assert(resBlockedPublish.status === 'AWAITING_CONFIRMATION', '正式发布未传 confirm 返回 AWAITING_CONFIRMATION');
  assert(resBlockedPublish.warning.includes('v1.0.0'), '拦截警告包含目标 Tag');
  assert(recordedCmds.length === 0, '未确认前绝对不调用底层 CLI 进程');

  // 3.6 正式发布：带 tag 与 confirm: true 执行成功
  recordedCmds = [];
  const resConfirmedPublish = await skillTool.execute({ action: 'publish', dry_run: false, tag: 'v1.0.0', confirm: true });
  assert(resConfirmedPublish.mode === 'publish', '正式发布模式正确');
  assert(resConfirmedPublish.success === true, '正式发布成功');
  const pubCmd = recordedCmds[0].cmd;
  assert(pubCmd.includes('--tag') && pubCmd.includes('v1.0.0'), 'CLI 命令中包含 --tag 与版本号');
  assert(!pubCmd.includes('--dry-run'), '正式发布不带 --dry-run');

  // 3.7 CLI 失败退出且输出 TSV 诊断行场景
  const mockFailExecutor = {
    async run() {
      return {
        ok: false,
        error: sampleErrorStderr,
        rawOutput: sampleErrorTsv,
      };
    },
  };
  const failSkillTool = createSkillTool(mockFailExecutor);
  const resFail = await failSkillTool.execute({ action: 'publish' });
  assert(resFail.success === false, 'CLI 失败退出时正确返回结构化失败状态');
  assert(resFail.items.length === 3, '结构化提取出 3 条诊断明细，未被盲目异常吞没');

  console.log('\n--- 4. github_help 映射与指南更新测试 ---');
  const helpTool = createHelpTool(mockExecutor);
  const mappingRes = await helpTool.execute({ topic: 'mapping' });
  assert(mappingRes.result.includes('gh skill search/preview/install/list/publish'), 'mapping 主题覆盖全部 5 个 skill action');
  assert(mappingRes.result.includes('publish 默认 dry-run 安全自检'), 'mapping 包含 publish 默认行为说明');

  const skillGuideRes = await helpTool.execute({ topic: 'skill' });
  assert(skillGuideRes.result.includes("github_skill(action: 'publish')"), 'skill 详细指南包含 publish 示例');
  assert(skillGuideRes.result.includes('fix: true'), '指南包含 fix 清洗说明');
  assert(skillGuideRes.result.includes('dry_run: false, confirm: true'), '指南包含正式发布示例');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Phase 17 测试结果: ${passed}/${total} 通过`);
  if (passed !== total) {
    console.error(`存在未通过测试: ${total - passed} 项失败`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试异常崩溃:', err);
  process.exit(1);
});
