// test/phase4.test.mjs - 第 4 阶段验证：装配完整性、defaultListLimit 消费、文档一致性

import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

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

  // --- 1. 装配完整性（静态断言 lib/main.js 产物）---
  console.log('\n--- 1. Tool assembly integrity (lib/main.js) ---');
  const mainJs = await readFile('lib/main.js', 'utf8');
  for (const factory of ['createPrTool', 'createIssueTool', 'createRunTool', 'createRepoTool', 'createApiTool', 'createReleaseTool', 'createSecretTool', 'createSkillTool', 'createHelpTool']) {
    assert(mainJs.includes(factory), `main.js registers ${factory}`);
  }

  // --- 2. 构建产物同步 ---
  console.log('\n--- 2. Build artifacts sync ---');
  for (const f of ['lib/tools/release.js', 'lib/tools/secret.js', 'lib/tools/skill.js', 'lib/renderers/markdown.js']) {
    assert(existsSync(f), `build artifact exists: ${f}`);
  }

  // --- 2b. 客户端 Bundle 语法安全防线（杜绝 Uncaught SyntaxError: Unexpected token 'export' 崩溃）---
  console.log('\n--- 2b. Client bundle syntax safety ---');
  const clientJs = await readFile('lib/client.js', 'utf8');
  assert(!/\bexport\s+(async\s+)?(function|const|var|let|class)\b/.test(clientJs), 'lib/client.js 闭包内绝无非法残留的 export 声明');

  // --- 3. defaultListLimit 消费 ---
  console.log('\n--- 3. defaultListLimit consumption ---');
  const { GhExecutor } = await import('../lib/executor.js');

  // 3.1 构造注入
  const exec7 = new GhExecutor({ defaultListLimit: 7 });
  assert(exec7.defaultListLimit === 7, 'constructor injects defaultListLimit=7');

  // 3.2 默认回退 20（零行为破坏）
  const execDefault = new GhExecutor({});
  assert(execDefault.defaultListLimit === 20, 'default falls back to 20 when unconfigured');

  // 3.3 updateConfig 热更新注入
  const execUpd = new GhExecutor({});
  execUpd.updateConfig({ defaultListLimit: 33 });
  assert(execUpd.defaultListLimit === 33, 'updateConfig refreshes defaultListLimit');

  // 3.4 工具真实消费（mock 捕获 argv）
  const recorded = [];
  const mockExec = {
    // 18 个工具统一经 resolveExecScope 归一工作区；测试替身必须实现同一接口
    resolveExecScope(execContext) {
      return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId || execContext?.session?.id };
    },
    defaultListLimit: 7,
    async run(cmd, opts) { recorded.push(cmd); return { ok: true, data: {}, rawOutput: 'ok' }; },
    async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; }
  };
  const { createPrTool } = await import('../lib/tools/pr.js');
  const { createIssueTool } = await import('../lib/tools/issue.js');
  const { createRunTool } = await import('../lib/tools/run.js');
  const { createRepoTool } = await import('../lib/tools/repo.js');
  const { createReleaseTool } = await import('../lib/tools/release.js');
  const { createSkillTool } = await import('../lib/tools/skill.js');

  recorded.length = 0;
  await createPrTool(mockExec).execute({ action: 'list' });
  assert(recorded[0].join(' ').includes('-L 7'), 'pr list consumes defaultListLimit');

  recorded.length = 0;
  await createIssueTool(mockExec).execute({ action: 'list' });
  assert(recorded[0].join(' ').includes('-L 7'), 'issue list consumes defaultListLimit');

  recorded.length = 0;
  await createRunTool(mockExec).execute({ action: 'list' });
  assert(recorded[0].join(' ').includes('-L 7'), 'run list consumes defaultListLimit');

  recorded.length = 0;
  await createRepoTool(mockExec).execute({ action: 'search_code', query: 'foo' });
  assert(recorded[0].join(' ').includes('-L 7'), 'repo search consumes defaultListLimit');

  recorded.length = 0;
  await createReleaseTool(mockExec).execute({ action: 'list' });
  assert(recorded[0].join(' ').includes('-L 7'), 'release list consumes defaultListLimit');

  recorded.length = 0;
  await createSkillTool(mockExec).execute({ action: 'search', query: 'foo' });
  assert(recorded[0].join(' ').includes('-L 7'), 'skill search consumes defaultListLimit');

  // 3.5 显式 limit 覆盖默认值
  recorded.length = 0;
  await createPrTool(mockExec).execute({ action: 'list', limit: 3 });
  assert(recorded[0].join(' ').includes('-L 3'), 'explicit limit overrides defaultListLimit');

  // 3.6 未配置 defaultListLimit 的旧式 executor（无该字段）兜底 20/10
  const legacyMock = {
  resolveExecScope(execContext) {
    return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId };
  },
    async run(cmd) { recorded.push(cmd); return { ok: true, data: {}, rawOutput: 'ok' }; },
    async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; }
  };
  recorded.length = 0;
  await createPrTool(legacyMock).execute({ action: 'list' });
  assert(recorded[0].join(' ').includes('-L 20'), 'legacy executor without field falls back to 20');

  // --- 4. README 一致性（防文档再次漂移）---
  console.log('\n--- 4. README consistency ---');
  const readmeZh = readFileSync('README.md', 'utf8');
  const readmeEn = readFileSync('README.en.md', 'utf8');
  const toolNames = ['`github_pr`', '`github_issue`', '`github_run`', '`github_repo`', '`github_api`', '`github_release`', '`github_secret`', '`github_skill`', '`github_help`'];
  let missingZh = toolNames.filter((t) => !readmeZh.includes(t));
  assert(missingZh.length === 0, `README.md documents all 9 tools (missing: ${missingZh.join(', ') || 'none'})`);

  const toolNamesEn = toolNames.map((t) => t); // 工具名代码格式在英文文档一致
  let missingEn = toolNamesEn.filter((t) => !readmeEn.includes(t));
  assert(missingEn.length === 0, `README.en.md documents all 9 tools (missing: ${missingEn.join(', ') || 'none'})`);

  assert(readmeZh.includes('defaultListLimit'), 'README.md documents defaultListLimit config');
  assert(readmeEn.includes('defaultListLimit'), 'README.en.md documents defaultListLimit config');
  assert(!readmeZh.includes('5 大领域核心工具') && !readmeZh.includes('5 大领域 Agent 核心工具'), 'README.md no longer claims 5 tools');
  assert(!readmeEn.includes('5 core domain tools'), 'README.en.md no longer claims 5 tools');

  // --- 5. package.json 测试入口 ---
  console.log('\n--- 5. Test entry point ---');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert(pkg.scripts && pkg.scripts.test === 'node test/run-all.mjs', 'package.json has test script wired to run-all.mjs');

  // --- 6. 模糊输入回归（审核发现的防护盲区）---
  console.log('\n--- 6. Fuzz-input regression ---');
  const { createHelpTool } = await import('../lib/tools/help.js');
  const { createRunTool: createRunToolForFuzz } = await import('../lib/tools/run.js');
  const helpTool = createHelpTool({ resolveExecScope: (e) => ({ cwd: e?.cwd || process.cwd(), sessionId: e?.sessionId }), async run() { return { ok: true, rawOutput: '' }; } });
  const runTool2 = createRunToolForFuzz({
    resolveExecScope: (e) => ({ cwd: e?.cwd || process.cwd(), sessionId: e?.sessionId }),
    defaultListLimit: 10,
    async getRepoMetadata() { return { nameWithOwner: 'o/r' }; },
    async run(cmd, opts) {
      // 模拟 Windows gh CLI 日志缓存目录无写权限的宿主环境错误
      if (cmd.includes('--log-failed')) {
        return { ok: false, error: 'failed to get run log: creating cache entry: open C:\\Users\\x\\AppData\\Local\\GitHub CLI\\run-log-1-2.zip: Access is denied.' };
      }
      return { ok: true, data: {}, rawOutput: 'ok' };
    },
  });

  // 6.1 help.topic 非字符串（负数真值短路 / 对象 / 数组 / 空串 / null / undefined）
  for (const badTopic of [-1, 0, {}, [], true, null, undefined, '', '   ']) {
    let threw = null;
    try {
      const r = await helpTool.execute({ topic: badTopic }, {});
      assert(typeof r.result === 'string' && r.result.length > 0, `help.topic=${JSON.stringify(badTopic)} degrades gracefully without TypeError`);
    } catch (e) {
      threw = e;
      assert(false, `help.topic=${JSON.stringify(badTopic)} degrades gracefully without TypeError (threw: ${e.message})`);
    }
  }

  // 6.2 help.topic 合法值不受影响（大小写与前后空格）
  const prGuide = await helpTool.execute({ topic: ' PR ' }, {});
  assert(prGuide.result.includes('github_pr'), 'help.topic with case/space normalization still works');

  // 6.3 help.gh_command 畸形输入（防护一致性）
  for (const badCmd of [-1, {}, [], true]) {
    try {
      await helpTool.execute({ gh_command: badCmd }, {});
      assert(true, `help.gh_command=${JSON.stringify(badCmd)} skipped safely`);
    } catch (e) {
      assert(false, `help.gh_command=${JSON.stringify(badCmd)} skipped safely (threw: ${e.message})`);
    }
  }

  // 6.4 run.log_failed 环境权限错误优雅吸收（非构建故障不误报）
  const logPerm = await runTool2.execute({ action: 'log_failed', run_id: '1', repo: 'o/r' }, {});
  assert(
    typeof logPerm.result === 'string' && logPerm.result.includes('写权限') && !logPerm.result.includes('构建'),
    'run.log_failed absorbs Windows cache Access-denied error with actionable hint'
  );

  console.log('\n========================================');
  console.log(`Phase 4 Test Result: ${passed}/${total} assertions PASSED!`);
  console.log('========================================');

  if (passed !== total) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
