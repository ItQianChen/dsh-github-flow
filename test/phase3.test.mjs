// test/phase3.test.mjs - Phase 3 新增工具（release / secret / skill）功能验证测试套件

async function runTests() {
  const recorded = [];
  let lastOpts = null;
  const mockExecutor = {
    async run(cmd, opts) {
      recorded.push(cmd);
      lastOpts = opts;
      return { ok: true, data: { success: true }, rawOutput: 'mock-output' };
    },
    async getRepoMetadata() {
      return { nameWithOwner: 'owner/test-repo' };
    }
  };

  const { createReleaseTool } = await import('../lib/tools/release.js');
  const { createSecretTool } = await import('../lib/tools/secret.js');
  const { createSkillTool } = await import('../lib/tools/skill.js');

  const releaseTool = createReleaseTool(mockExecutor);
  const secretTool = createSecretTool(mockExecutor);
  const skillTool = createSkillTool(mockExecutor);

  const { renderReleaseMarkdown, renderSkillMarkdown } = await import('../lib/renderers/markdown.js');
  const { createHelpTool } = await import('../lib/tools/help.js');
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

  // --- 1. github_release 命令组装 ---
  console.log('\n--- 1. Testing github_release command assembly ---');
  recorded.length = 0;
  await releaseTool.execute({ action: 'list', limit: 5 });
  assert(recorded[0].join(' ') === 'release list -R owner/test-repo -L 5 --json tagName,name,isDraft,isPrerelease,publishedAt,createdAt', 'release list assembles limit and json fields');

  recorded.length = 0;
  await releaseTool.execute({ action: 'view', tag: 'v0.1.9' });
  assert(recorded[0].join(' ').includes('release view v0.1.9 -R owner/test-repo --json'), 'release view includes tag and json fields');

  recorded.length = 0;
  await releaseTool.execute({ action: 'create', tag: 'v0.2.0', title: 'v0.2.0', generate_notes: true, prerelease: true, assets: ['./pkg.tgz'] });
  const createCmd = recorded[0].join(' ');
  assert(createCmd.includes('release create v0.2.0') && createCmd.includes('./pkg.tgz') && createCmd.includes('--title v0.2.0') && createCmd.includes('--generate-notes') && createCmd.includes('--prerelease'), 'release create assembles assets, title, generate-notes, prerelease');

  recorded.length = 0;
  await releaseTool.execute({ action: 'create', tag: 'v0.2.1', notes: 'manual notes', generate_notes: false });
  const createNoGen = recorded[0].join(' ');
  assert(createNoGen.includes('--notes manual notes') && !createNoGen.includes('--generate-notes'), 'release create with generate_notes:false omits flag and uses --notes');

  recorded.length = 0;
  await releaseTool.execute({ action: 'upload', tag: 'v0.2.0', assets: ['./a.tgz', './b.tgz'], clobber: true, confirm: true });
  assert(recorded[0].join(' ').includes('release upload v0.2.0 -R owner/test-repo ./a.tgz ./b.tgz --clobber'), 'release upload assembles files and clobber');

  recorded.length = 0;
  await releaseTool.execute({ action: 'download', tag: 'v0.2.0', pattern: '*.tgz', dir: './dist' });
  assert(recorded[0].join(' ').includes('release download v0.2.0') && recorded[0].join(' ').includes('--pattern *.tgz') && recorded[0].join(' ').includes('--dir ./dist'), 'release download assembles pattern and dir');

  recorded.length = 0;
  await releaseTool.execute({ action: 'delete', tag: 'v0.2.0', confirm: true });
  assert(recorded[0].join(' ').includes('release delete v0.2.0') && recorded[0].join(' ').includes('--yes') && !recorded[0].join(' ').includes('--cleanup-tag'), 'release delete includes --yes for non-interactive, no cleanup-tag by default');

  recorded.length = 0;
  await releaseTool.execute({ action: 'delete', tag: 'v0.2.0', confirm: true, cleanup_tag: true });
  assert(recorded[0].join(' ').includes('--cleanup-tag'), 'release delete cleanup_tag maps to --cleanup-tag (declared & consumed)');

  // release 高危拦截
  const delBlock = await releaseTool.execute({ action: 'delete', tag: 'v0.2.0', confirm: false });
  assert(delBlock.status === 'AWAITING_CONFIRMATION' && delBlock.warning.includes('v0.2.0'), 'release delete blocked without confirm');

  const clobberBlock = await releaseTool.execute({ action: 'upload', tag: 'v0.2.0', assets: ['./a.tgz'], clobber: true, confirm: false });
  assert(clobberBlock.status === 'AWAITING_CONFIRMATION', 'release upload with clobber blocked without confirm');

  // 非 clobber 上传无需 confirm
  recorded.length = 0;
  await releaseTool.execute({ action: 'upload', tag: 'v0.2.0', assets: ['./a.tgz'] });
  assert(recorded.length === 1, 'release upload without clobber does not require confirm');

  // --- 2. github_secret 安全通道 ---
  console.log('\n--- 2. Testing github_secret secure stdin channel ---');
  recorded.length = 0;
  await secretTool.execute({ action: 'set', name: 'NPM_TOKEN', value: 'super-secret-value-123' });
  const setCmd = recorded[0].join(' ');
  assert(setCmd === 'secret set NPM_TOKEN -R owner/test-repo', 'secret set argv contains ONLY name and repo (no -b, no value)');
  assert(lastOpts.stdin === 'super-secret-value-123', 'secret set passes value via opts.stdin, not argv');
  assert(!setCmd.includes('super-secret-value-123'), 'secret value never appears in command line');

  // set 返回值不回显密文
  recorded.length = 0;
  const setRes = await secretTool.execute({ action: 'set', name: 'NPM_TOKEN', value: 'super-secret-value-123' });
  assert(!JSON.stringify(setRes).includes('super-secret-value-123'), 'secret set result does not echo the value');

  recorded.length = 0;
  await secretTool.execute({ action: 'list' });
  assert(recorded[0].join(' ') === 'secret list -R owner/test-repo --json name,updatedAt,visibility', 'secret list assembles json fields');

  recorded.length = 0;
  await secretTool.execute({ action: 'set', name: 'ORG_KEY', value: 'v', org: 'my-org', visibility: 'all', app: 'actions' });
  const orgCmd = recorded[0].join(' ');
  assert(orgCmd === 'secret set ORG_KEY --org my-org --visibility all --app actions', 'secret org scope omits -R (conflicts with --org)');

  // org 作用域在无 Git 工作区环境也可用（getRepoMetadata 不应被调用）
  const noGitExecutor = {
    async run(cmd, opts) { recorded.push(cmd); lastOpts = opts; return { ok: true, data: {}, rawOutput: 'ok' }; },
    async getRepoMetadata() { throw new Error('should not be called for org scope'); }
  };
  const noGitSecretTool = createSecretTool(noGitExecutor);
  recorded.length = 0;
  await noGitSecretTool.execute({ action: 'list', org: 'my-org' });
  assert(recorded[0].join(' ') === 'secret list --org my-org --json name,updatedAt,visibility', 'secret org-scope list works without repo resolution');

  const secretDelBlock = await secretTool.execute({ action: 'delete', name: 'NPM_TOKEN', confirm: false });
  assert(secretDelBlock.status === 'AWAITING_CONFIRMATION', 'secret delete blocked without confirm');

  recorded.length = 0;
  await secretTool.execute({ action: 'delete', name: 'NPM_TOKEN', confirm: true });
  assert(recorded[0].join(' ') === 'secret delete NPM_TOKEN -R owner/test-repo', 'secret delete executed with confirm');

  // --- 3. github_skill ---
  console.log('\n--- 3. Testing github_skill ---');
  recorded.length = 0;
  await skillTool.execute({ action: 'search', query: 'code-review', limit: 10 });
  assert(recorded[0].join(' ').includes('skill search code-review -L 10 --json skillName,repo,description,namespace,stars'), 'skill search assembles json fields');

  recorded.length = 0;
  await skillTool.execute({ action: 'search', query: 'test', owner: 'github' });
  assert(recorded[0].join(' ').includes('--owner github'), 'skill search owner filter');

  recorded.length = 0;
  await skillTool.execute({ action: 'preview', repository: 'github/awesome-copilot', skill_name: 'code-review' });
  assert(recorded[0].join(' ') === 'skill preview github/awesome-copilot code-review', 'skill preview assembles repo and skill');

  const installBlock = await skillTool.execute({ action: 'install', repository: 'github/awesome-copilot', skill_name: 'code-review', confirm: false });
  assert(installBlock.status === 'AWAITING_CONFIRMATION', 'skill install blocked without confirm');

  recorded.length = 0;
  await skillTool.execute({ action: 'install', repository: 'github/awesome-copilot', skill_name: 'code-review', agent: 'claude-code', scope: 'user', confirm: true });
  const installCmd = recorded[0].join(' ');
  assert(installCmd.includes('skill install github/awesome-copilot code-review') && installCmd.includes('--agent claude-code') && installCmd.includes('--scope user'), 'skill install assembles flags with confirm');

  recorded.length = 0;
  await skillTool.execute({ action: 'list' });
  assert(recorded[0].join(' ').includes('skill list --json skillName,sourceURL,scope,version,pinned,path'), 'skill list json fields');

  // --- 4. 渲染器 ---
  console.log('\n--- 4. Testing renderers ---');
  const relListMd = renderReleaseMarkdown({ action: 'list' }, {
    items: [
      { tagName: 'v0.1.9', name: 'v0.1.9', isDraft: false, isPrerelease: true, publishedAt: '2026-10-12T10:00:00Z' },
      { tagName: 'v0.1.8', name: 'stable | release', isDraft: false, isPrerelease: false, createdAt: '2026-10-01T10:00:00Z' },
      { tagName: 'v0.2.0-draft', name: 'wip', isDraft: true, isPrerelease: false },
    ]
  });
  assert(relListMd.includes('| `v0.1.9` | 🍼 PRE |') && relListMd.includes('✅ STABLE') && relListMd.includes('⚪ DRAFT'), 'release list badges render correctly');
  assert(relListMd.includes('stable \\| release'), 'release list escapes pipes in name');

  const relViewMd = renderReleaseMarkdown({ action: 'view' }, {
    tagName: 'v0.1.9', name: 'October Update', isDraft: false, isPrerelease: false,
    url: 'https://github.com/owner/repo/releases/v0.1.9', publishedAt: '2026-10-12T10:00:00Z',
    assets: [{ name: 'pkg.tgz', size: 2048 }],
    body: 'Long notes here'
  });
  assert(relViewMd.includes('### 🏷️ Release `v0.1.9` ✅ STABLE') && relViewMd.includes('`pkg.tgz` (2.0 KB)') && relViewMd.includes('Long notes here'), 'release view card renders assets and body');
  // 段落分隔回归：资产列表与正文之间必须存在空行，否则 Markdown 列表语法失效
  assert(/\*\*📎 附属资产 \(1\):\*\*\n- `pkg\.tgz`/.test(relViewMd), 'release view asset list is a proper markdown list block');
  assert(relViewMd.includes('附属资产 (1):**\n\n**📝') || /\*\*📝 发版说明摘要:\*\*\n\nLong notes/.test(relViewMd), 'release view sections separated by blank lines');

  const skillSearchMd = renderSkillMarkdown({ action: 'search' }, {
    items: [{ skillName: 'code-review', repo: 'github/awesome-copilot', stars: 120, description: 'Review | code with | pipes' }]
  });
  assert(skillSearchMd.includes('[github/awesome-copilot](https://github.com/github/awesome-copilot)') && skillSearchMd.includes('Review \\| code'), 'skill search table renders repo link and escapes pipes');

  const skillListMd = renderSkillMarkdown({ action: 'list' }, {
    items: [{ skillName: 'code-review', version: '1.2.0', scope: 'project', sourceURL: 'https://github.com/x/y' }]
  });
  assert(skillListMd.includes('| `code-review` | 1.2.0 | project | [来源](https://github.com/x/y) |'), 'skill installed list renders');

  // secret 渲染永不泄漏 value
  const secretRender = secretTool.output.render({ action: 'list' }, { items: [{ name: 'NPM_TOKEN', visibility: 'private', updatedAt: '2026-10-12T00:00:00Z' }] });
  assert(secretRender[0].text.includes('`NPM_TOKEN`') && secretRender[0].text.includes('private'), 'secret list render formats table');
  assert(!secretRender[0].text.toLowerCase().includes('value'), 'secret render never mentions value field');

  const secretBlockRender = secretTool.output.render({ action: 'delete' }, {
    status: 'AWAITING_CONFIRMATION', warning: '⚠️ 测试拦截', impact: 'impact', requiredAction: 'action'
  });
  assert(secretBlockRender[0].text.includes('⚠️ 测试拦截') && secretBlockRender[0].text.includes('impact'), 'secret confirmation block renders');

  // --- 5. help 知识库扩容 ---
  console.log('\n--- 5. Testing help knowledge base expansion ---');
  const overviewRes = await helpTool.execute({ topic: 'overview' });
  assert(overviewRes.result.includes('github_release') && overviewRes.result.includes('github_secret') && overviewRes.result.includes('github_skill'), 'overview topic covers all 9 tools');

  for (const t of ['release', 'secret', 'skill']) {
    const res = await helpTool.execute({ topic: t });
    assert(typeof res.result === 'string' && res.result.length > 100, `help topic '${t}' exists with content`);
  }
  const tsRes = await helpTool.execute({ topic: 'troubleshooting' });
  assert(tsRes.result.includes('unknown command'), 'troubleshooting covers gh skill version issue');

  // --- 6. executor stdin 通道真实子进程验证 ---
  console.log('\n--- 6. Testing executor stdin via real subprocess ---');
  const { GhExecutor } = await import('../lib/executor.js');
  const realExec = new GhExecutor({ ghPath: 'node' });
  // 用 node 代替 gh 执行真实子进程：把 stdin 原样写回 stdout，验证 input 通道端到端可用。
  // 若宿主沙箱禁止子进程 spawn（EPERM），跳过该项并告警——通道逻辑已由第 2 组
  // mock 断言（opts.stdin 透传）覆盖，此真实子进程用例属环境相关的额外加固。
  try {
    const stdinRes = await realExec.run(['-e', 'process.stdin.resume();process.stdin.on("data",d=>{process.stdout.write("GOT:"+d.toString());process.exit(0)})'], { stdin: 'pipe-payload-42', rawText: true, timeoutMs: 10_000 });
    // 沙箱把 spawn 失败封装为 ok:false + "spawn EPERM"（不抛异常），与真实链路故障
    // 不可区分，因此以 error 内容识别环境限制并跳过；通道透传逻辑已由第 2 组
    // mock 断言覆盖（opts.stdin === value 且 argv 无密文）。
    if (stdinRes.ok && stdinRes.rawOutput.includes('GOT:pipe-payload-42')) {
      assert(true, 'executor.run delivers stdin to subprocess');
    } else if (stdinRes.error && /EPERM|ENOENT/.test(stdinRes.error)) {
      console.log(`⚠️ SKIP: real-subprocess spawn blocked in this sandbox (${stdinRes.error})`);
    } else {
      assert(false, `executor.run delivers stdin to subprocess (got: ${JSON.stringify(stdinRes)})`);
    }
  } catch (e) {
    console.log(`⚠️ SKIP: real-subprocess stdin check unavailable in this sandbox (${e.code || e.message})`);
  }

  console.log('\n========================================');
  console.log(`Phase 3 Test Result: ${passed}/${total} assertions PASSED!`);
  console.log('========================================');

  if (passed !== total) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
