// test/phase15.test.mjs - Phase 15 · github_cache 与 github_gist 新领域工具测试套件
// 涵盖：字节换算纯函数、缓存全量删除 confirm 拦截与幂等参数、TSV 行解析、Gist stdin 管道、view 防挂起及 help 映射

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

  console.log('\n--- 1. formatBytes 纯函数测试 ---');
  const { formatBytes, renderCacheMarkdown } = await import('../lib/renderers/markdown.js');
  const { parseGistListOutput, renderGistMarkdown } = await import('../lib/renderers/markdown.js');
  const { createCacheTool } = await import('../lib/tools/cache.js');
  const { createGistTool } = await import('../lib/tools/gist.js');
  const { createHelpTool } = await import('../lib/tools/help.js');

  assert(formatBytes(0) === '0 B', '0 字节返回 0 B');
  assert(formatBytes(-10) === '0 B', '负数返回 0 B');
  assert(formatBytes(undefined) === '0 B', 'undefined 返回 0 B');
  assert(formatBytes(NaN) === '0 B', 'NaN 返回 0 B');
  assert(formatBytes(500) === '500 B', '500 B 正常格式化');
  assert(formatBytes(1024) === '1 KB', '1024 转换为 1 KB');
  assert(formatBytes(1024 * 1024) === '1 MB', '1048576 转换为 1 MB');
  assert(formatBytes(1024 * 1024 * 1024 * 2.5) === '2.5 GB', '2.5 GB 转换正确');

  console.log('\n--- 2. parseGistListOutput 纯函数测试 ---');
  const emptyGists = parseGistListOutput('');
  assert(Array.isArray(emptyGists) && emptyGists.length === 0, '空字符串解析为空数组');

  const tsvText = `5b0e0062eb8e9654adad7bb1d81cc75f\tCI debug log\t2 files\tsecret\t2026-10-14 10:00:00
a1b2c3d4e5f60718293a4b5c6d7e8f90\tPublic script\t1 file\tpublic\t2026-10-15 12:00:00`;
  const parsedGists = parseGistListOutput(tsvText);
  assert(parsedGists.length === 2, '解析出 2 条 Gist');
  assert(parsedGists[0].id === '5b0e0062eb8e9654adad7bb1d81cc75f', '第1条 ID 提取正确');
  assert(parsedGists[0].description === 'CI debug log', '第1条描述提取正确');
  assert(parsedGists[0].visibility === 'secret', '第1条可见性提取正确');
  assert(parsedGists[1].visibility === 'public', '第2条可见性提取正确');

  const multiSpaceText = `12345678abcdef01    Backup config    3 files    secret    2026-10-16`;
  const spaceParsed = parseGistListOutput(multiSpaceText);
  assert(spaceParsed.length === 1 && spaceParsed[0].id === '12345678abcdef01', '多空格回退解析正确');

  console.log('\n--- 3. github_cache 工具定义与执行 ---');
  let recordedCmds = [];
  const mockExecutor = {
    async run(cmd, opts) {
      recordedCmds.push({ cmd, opts });
      if (cmd[0] === 'cache' && cmd[1] === 'list') {
        const cacheItems = [
          {
            id: 101,
            key: 'Linux-node-20-cache',
            sizeInBytes: 157286400,
            lastAccessedAt: '2026-10-15T08:30:00Z',
            ref: 'refs/heads/main',
            version: 'v1',
          },
          {
            id: 102,
            key: 'npm-cache-dev',
            sizeInBytes: 52428800,
            lastAccessedAt: '2026-10-16T09:00:00Z',
            ref: 'refs/pull/12/merge',
            version: 'v1',
          },
        ];
        return {
          ok: true,
          data: cacheItems,
          rawOutput: JSON.stringify(cacheItems),
        };
      }
      return { ok: true, rawOutput: 'mock success output' };
    },
    async getRepoMetadata() {
      return { nameWithOwner: 'owner/test-repo' };
    },
  };

  const cacheTool = createCacheTool(mockExecutor);
  assert(cacheTool.name === 'github_cache', '工具名称为 github_cache');
  assert(cacheTool.parameters.required.includes('action'), 'action 为必填字段');
  assert(cacheTool.parameters.properties.action.enum.length === 2, '支持 list 和 delete');

  // 3.1 cache list
  recordedCmds = [];
  const listRes = await cacheTool.execute({
    action: 'list',
    key: 'npm',
    ref: 'refs/heads/main',
    sort: 'size_in_bytes',
    order: 'desc',
    limit: 20,
  });
  assert(listRes.items.length === 2, 'cache list 返回 items 数组');
  const lastListCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastListCmd[0] === 'cache' && lastListCmd[1] === 'list', '调用 gh cache list');
  assert(lastListCmd.includes('-R') && lastListCmd.includes('owner/test-repo'), '传递目标仓库 -R');
  assert(lastListCmd.includes('-k') && lastListCmd.includes('npm'), '传递 -k 键前缀过滤');
  assert(lastListCmd.includes('-r') && lastListCmd.includes('refs/heads/main'), '传递 -r ref 过滤');
  assert(lastListCmd.includes('--sort') && lastListCmd.includes('size_in_bytes'), '传递 --sort');
  assert(lastListCmd.includes('--order') && lastListCmd.includes('desc'), '传递 --order');
  assert(lastListCmd.includes('-L') && lastListCmd.includes('20'), '传递 -L limit');

  // 3.2 cache delete --all (未带 confirm 拦截防线)
  recordedCmds = [];
  const delAllBlocked = await cacheTool.execute({ action: 'delete', all: true });
  assert(delAllBlocked.status === 'AWAITING_CONFIRMATION', '全量删除未带 confirm 返回拦截态');
  assert(delAllBlocked.warning.includes('高危破坏性操作'), '拦截提示说明高危属性');
  assert(delAllBlocked.requiredAction.includes('confirm: true'), '拦截指引要求 confirm: true');
  assert(recordedCmds.length === 0, '未确认时绝对不调用底层 CLI 进程');

  // 3.3 cache delete --all (带 confirm: true 执行)
  recordedCmds = [];
  const delAllSuccess = await cacheTool.execute({ action: 'delete', all: true, confirm: true, ref: 'refs/heads/dev' });
  assert(delAllSuccess.success === true && delAllSuccess.all === true, '确认全量删除成功');
  const lastDelAllCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastDelAllCmd[0] === 'cache' && lastDelAllCmd[1] === 'delete' && lastDelAllCmd.includes('--all'), '调用 gh cache delete --all');
  assert(lastDelAllCmd.includes('--succeed-on-no-caches'), '附加 --succeed-on-no-caches 保证幂等执行');
  assert(lastDelAllCmd.includes('-r') && lastDelAllCmd.includes('refs/heads/dev'), '传递 -r ref');

  // 3.4 cache delete 按 ID 删除
  recordedCmds = [];
  const delIdRes = await cacheTool.execute({ action: 'delete', cache_id: '101' });
  assert(delIdRes.success === true && delIdRes.cache_id === '101', '按 cache_id 删除成功');
  const lastDelIdCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastDelIdCmd[0] === 'cache' && lastDelIdCmd[1] === 'delete' && lastDelIdCmd[2] === '101', '调用 gh cache delete <id>');

  // 3.5 cache delete 按 Key 删除
  recordedCmds = [];
  const delKeyRes = await cacheTool.execute({ action: 'delete', key: 'npm-cache-dev' });
  assert(delKeyRes.success === true && delKeyRes.key === 'npm-cache-dev', '按 key 删除成功');
  const lastDelKeyCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastDelKeyCmd[0] === 'cache' && lastDelKeyCmd[1] === 'delete' && lastDelKeyCmd[2] === 'npm-cache-dev', '调用 gh cache delete <key>');

  // 3.6 cache delete 缺少所有参数抛错
  let delMissingParam = false;
  try {
    await cacheTool.execute({ action: 'delete' });
  } catch {
    delMissingParam = true;
  }
  assert(delMissingParam, 'delete 缺少 cache_id/key/all 抛出友好异常');

  console.log('\n--- 4. github_gist 工具定义与执行 ---');
  const gistTool = createGistTool(mockExecutor);
  assert(gistTool.name === 'github_gist', '工具名称为 github_gist');
  assert(gistTool.parameters.properties.action.enum.length === 5, '支持 5 大 action');

  // 4.1 gist list
  recordedCmds = [];
  mockExecutor.run = async (cmd, opts) => {
    recordedCmds.push({ cmd, opts });
    if (cmd[0] === 'gist' && cmd[1] === 'list') {
      return {
        ok: true,
        rawOutput: '5b0e0062eb8e9654adad7bb1d81cc75f\tTest log\t1 file\tsecret\t2026-10-15',
      };
    }
    return { ok: true, rawOutput: 'mock success output' };
  };

  const gistListRes = await gistTool.execute({ action: 'list', public: false, limit: 5, filter: 'Test' });
  assert(gistListRes.items.length === 1 && gistListRes.items[0].id === '5b0e0062eb8e9654adad7bb1d81cc75f', 'gist list 返回 items');
  const lastGistListCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastGistListCmd[0] === 'gist' && lastGistListCmd[1] === 'list', '调用 gh gist list');
  assert(lastGistListCmd.includes('--secret'), 'public: false 传递 --secret');
  assert(lastGistListCmd.includes('-L') && lastGistListCmd.includes('5'), '传递 -L limit');
  assert(lastGistListCmd.includes('--filter') && lastGistListCmd.includes('Test'), '传递 --filter');

  // 4.2 gist view
  recordedCmds = [];
  mockExecutor.run = async (cmd, opts) => {
    recordedCmds.push({ cmd, opts });
    return { ok: true, rawOutput: 'const a = 1;\nconsole.log(a);' };
  };
  const viewRes = await gistTool.execute({ action: 'view', gist_id: '5b0e0062eb8e9654adad7bb1d81cc75f', filename: 'index.ts' });
  assert(viewRes.content.includes('const a = 1;'), 'view 返回代码正文');
  const lastViewCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastViewCmd[0] === 'gist' && lastViewCmd[1] === 'view' && lastViewCmd[2] === '5b0e0062eb8e9654adad7bb1d81cc75f', '调用 gh gist view <id>');
  assert(lastViewCmd.includes('-r'), '传递 -r 获取 raw 内容');
  assert(lastViewCmd.includes('-f') && lastViewCmd.includes('index.ts'), '传递 -f 指定文件');

  let viewMissingId = false;
  try {
    await gistTool.execute({ action: 'view' });
  } catch {
    viewMissingId = true;
  }
  assert(viewMissingId, 'view 缺少 gist_id 抛错防挂起');

  // 4.3 gist create (通过 content + stdin 通道)
  recordedCmds = [];
  mockExecutor.run = async (cmd, opts) => {
    recordedCmds.push({ cmd, opts });
    return { ok: true, rawOutput: 'https://gist.github.com/user/5b0e0062eb8e9654adad7bb1d81cc75f\n' };
  };
  const createRes = await gistTool.execute({
    action: 'create',
    content: 'echo "hello"',
    filename: 'run.sh',
    description: 'Shell test',
    public: false,
  });
  assert(createRes.success === true, 'create 返回成功状态');
  assert(createRes.gist_id === '5b0e0062eb8e9654adad7bb1d81cc75f', '解析出 Gist ID');
  const lastCreateCmdObj = recordedCmds[recordedCmds.length - 1];
  assert(lastCreateCmdObj.cmd[0] === 'gist' && lastCreateCmdObj.cmd[1] === 'create' && lastCreateCmdObj.cmd[2] === '-', '调用 gh gist create - 从标准输入读取');
  assert(lastCreateCmdObj.cmd.includes('-f') && lastCreateCmdObj.cmd.includes('run.sh'), '传递 -f 指定文件名');
  assert(lastCreateCmdObj.cmd.includes('-d') && lastCreateCmdObj.cmd.includes('Shell test'), '传递 -d 描述');
  assert(!lastCreateCmdObj.cmd.includes('--public'), '默认 secret 模式不传递 --public');
  assert(lastCreateCmdObj.opts.stdin === 'echo "hello"', '正文内容通过 opts.stdin 安全通道传递');

  // 4.4 gist edit
  recordedCmds = [];
  await gistTool.execute({ action: 'edit', gist_id: '5b0e0062eb8e9654adad7bb1d81cc75f', description: 'Updated desc' });
  const lastEditCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastEditCmd[0] === 'gist' && lastEditCmd[1] === 'edit' && lastEditCmd[2] === '5b0e0062eb8e9654adad7bb1d81cc75f', '调用 gh gist edit <id>');
  assert(lastEditCmd.includes('-d') && lastEditCmd.includes('Updated desc'), '传递 -d 描述');

  // 4.5 gist delete (未带 confirm 拦截防线)
  recordedCmds = [];
  const delGistBlocked = await gistTool.execute({ action: 'delete', gist_id: '5b0e0062eb8e9654adad7bb1d81cc75f' });
  assert(delGistBlocked.status === 'AWAITING_CONFIRMATION', 'gist delete 未带 confirm 拦截');
  assert(delGistBlocked.warning.includes('高危破坏性操作'), '拦截警告说明物理删除');
  assert(recordedCmds.length === 0, '未确认时绝对不调用底层 CLI 进程');

  // 4.6 gist delete (带 confirm: true 执行)
  recordedCmds = [];
  const delGistSuccess = await gistTool.execute({ action: 'delete', gist_id: '5b0e0062eb8e9654adad7bb1d81cc75f', confirm: true });
  assert(delGistSuccess.success === true, '确认删除成功');
  const lastDelGistCmd = recordedCmds[recordedCmds.length - 1].cmd;
  assert(lastDelGistCmd[0] === 'gist' && lastDelGistCmd[1] === 'delete' && lastDelGistCmd[2] === '5b0e0062eb8e9654adad7bb1d81cc75f', '调用 gh gist delete <id>');
  assert(lastDelGistCmd.includes('--yes'), '强制追加 --yes 防非 TTY 挂起');

  console.log('\n--- 5. Markdown 渲染层测试 ---');
  // 5.1 renderCacheMarkdown
  const cacheMd = renderCacheMarkdown({ action: 'list' }, {
    items: [
      { id: 1, key: 'test-key', sizeInBytes: 1048576, ref: 'main', lastAccessedAt: '2026-10-15T10:00:00Z' },
    ],
  });
  assert(cacheMd.includes('| 缓存 ID | 键名 (Key) | 大小 | 关联 Ref | 最后访问时间 |'), 'cache 表头渲染');
  assert(cacheMd.includes('1 MB'), '大小正确换算为 1 MB');
  assert(cacheMd.includes('`test-key`'), 'key 渲染为代码片段');

  const cacheBlockedMd = renderCacheMarkdown({ action: 'delete' }, delAllBlocked);
  assert(cacheBlockedMd.includes('⚠️') && cacheBlockedMd.includes('影响评估'), 'cache 拦截提示块渲染');

  // 5.2 renderGistMarkdown
  const gistCreateMd = renderGistMarkdown({ action: 'create' }, createRes);
  assert(gistCreateMd.includes('成功创建 Gist 代码片段'), 'gist create 成功提示');
  assert(gistCreateMd.includes('Secret Gist 属于未列出（Unlisted）'), '包含 Unlisted 安全红线警示');

  const gistViewMd = renderGistMarkdown({ action: 'view', gist_id: '123' }, { content: 'console.log("ok");' });
  assert(gistViewMd.includes('### 📄 Gist 代码片段: `123`'), 'gist view 标题渲染');
  assert(gistViewMd.includes('console.log("ok");'), 'gist view 正文包裹在代码块');

  console.log('\n--- 6. github_help 映射与指南覆盖测试 ---');
  const helpTool = createHelpTool(mockExecutor);

  const overviewRes = await helpTool.execute({ topic: 'overview' }, {});
  assert(overviewRes.result.includes('`github_cache`') && overviewRes.result.includes('`github_gist`'), 'overview 包含 github_cache 与 github_gist');

  const cacheHelp = await helpTool.execute({ topic: 'cache' }, {});
  assert(cacheHelp.result.includes('github_cache(action:'), 'cache 主题包含调用指引');

  const gistHelp = await helpTool.execute({ topic: 'gist' }, {});
  assert(gistHelp.result.includes('github_gist(action:'), 'gist 主题包含调用指引');

  const mappingHelp = await helpTool.execute({ topic: 'mapping' }, {});
  assert(mappingHelp.result.includes('gh cache list/delete') || mappingHelp.result.includes('github_cache'), 'mapping 包含 cache 映射');
  assert(mappingHelp.result.includes('gh gist create') || mappingHelp.result.includes('github_gist'), 'mapping 包含 gist 映射');
  assert(!mappingHelp.result.includes('`gh cache` | Actions 缓存 |'), '未覆盖域中不再包含 gh cache');
  assert(!mappingHelp.result.includes('`gh gist` | 代码片段 |'), '未覆盖域中不再包含 gh gist');

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Phase 15 测试结果: ${passed}/${total} 通过`);
  if (passed !== total) {
    throw new Error(`Phase 15 测试未全量通过: ${total - passed} 项失败`);
  }
}

await runTests();
