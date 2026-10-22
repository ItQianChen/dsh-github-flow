// test/phase10.test.mjs - Phase 10 · executor 横切基建断言
// （AI_AGENT 注入 + gh 版本探测缓存 + runGuarded 守卫降级链）
//
// 沙箱约束下的测试策略：真实环境探测（node spawn gh）在本沙箱被 EPERM 拦截，
// 因此 executor 行为断言全部采用「子类覆写注入」——覆写 getGhVersion 返回确定
// 版本、覆写 run 捕获 env 与 args，验证的正是守卫路由与注入逻辑本身（不依赖
// 真实 gh 存在）。纯函数（parseGhVersion/compareGhVersions）直接测真实行为。

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

  const { GhExecutor, parseGhVersion, compareGhVersions } = await import('../lib/executor.js');

  // --- 1. 版本纯函数 ---
  console.log('\n--- 1. version pure functions ---');
  assert(parseGhVersion('gh version 2.96.0 (2026-07-02)\nhttps://github.com/cli/cli/releases/tag/v2.96.0') === '2.96.0', 'parseGhVersion extracts semver from real output');
  assert(parseGhVersion('gh version 2.100.0 (2026-09-30)') === '2.100.0', 'parseGhVersion handles 3-digit minor');
  assert(parseGhVersion('git version 2.47.1') === null, 'parseGhVersion returns null on non-gh output');
  assert(parseGhVersion('') === null && parseGhVersion(undefined) === null, 'parseGhVersion tolerates empty/undefined');

  assert(compareGhVersions('2.96.0', '2.95.0') === 1, 'compare: 2.96.0 > 2.95.0');
  // 字典序回归钉：字符串比较会把 '2.100.0' 判小于 '2.96.0'（'1'<'9'），数值分段必须纠正
  assert(compareGhVersions('2.96.0', '2.100.0') === -1, 'compare lexicographic trap: 2.96.0 < 2.100.0');
  assert(compareGhVersions('2.96.0', '2.96.0') === 0, 'compare: equal versions === 0');
  assert(compareGhVersions('3.0.0', '2.999.999') === 1, 'compare: major wins over minor');

  // --- 2. runGuarded 守卫路由 ---
  console.log('\n--- 2. runGuarded routing ---');
  function makeStubExecutor(version, overrides = {}) {
    const probeCalls = { count: 0 };
    class Stub extends GhExecutor {
      async getGhVersion() {
        probeCalls.count++;
        return version;
      }
      async run(args, options) {
        return { ok: true, data: { args, options }, rawOutput: 'stub-run' };
      }
    }
    const exec = new Stub(overrides);
    return { exec, probeCalls };
  }

  // 2.1 版本达标 → 主命令直通，无 degraded 字段
  {
    const { exec } = makeStubExecutor('2.100.0');
    const res = await exec.runGuarded(['repo', 'read-file'], { minVersion: '2.95.0', capability: 'gh repo read-file' });
    assert(res.ok === true && res.degraded === undefined, 'satisfied version runs main command without degraded flag');
    assert(JSON.stringify(res.data.args) === JSON.stringify(['repo', 'read-file']), 'main command receives args unchanged');
  }

  // 2.2 版本不足 + fallback → 降级链路 + degraded 结构化标注
  {
    const { exec } = makeStubExecutor('2.94.0');
    const res = await exec.runGuarded(['repo', 'read-file'], {
      minVersion: '2.95.0',
      capability: 'gh repo read-file',
      fallback: async () => ({ ok: true, data: { via: 'contents-api' } }),
    });
    assert(res.ok === true && res.degraded === true, 'old version routes to fallback with degraded=true');
    assert(res.data?.via === 'contents-api', 'fallback result data preserved');
    assert(/2\.94\.0/.test(res.degradedReason) && /2\.95\.0/.test(res.degradedReason) && /降级/.test(res.degradedReason), 'degradedReason states both versions and downgrade fact');
  }

  // 2.3 版本不足 + 无 fallback → 明确报错含版本门槛与升级指引
  {
    const { exec } = makeStubExecutor('2.94.0');
    const res = await exec.runGuarded(['run', 'download', '123'], { minVersion: '2.102.0', capability: 'gh run download' });
    assert(res.ok === false, 'old version without fallback fails explicitly');
    assert(/2\.102\.0/.test(res.error) && /2\.94\.0/.test(res.error), 'error states required and current versions');
    assert(/升级/.test(res.error), 'error carries upgrade guidance');
  }

  // 2.4 未传 minVersion → 与 run 直通等价（渐进采用契约）
  {
    const { exec } = makeStubExecutor(null);
    const res = await exec.runGuarded(['pr', 'list']);
    assert(res.ok === true && res.rawOutput === 'stub-run', 'no minVersion passes through to run()');
  }

  // 2.5 探测失败（null）→ fail-open 直通主命令
  {
    const { exec } = makeStubExecutor(null);
    const res = await exec.runGuarded(['repo', 'read-file'], { minVersion: '2.95.0', fallback: async () => ({ ok: true, data: 'fb' }) });
    assert(res.ok === true && res.rawOutput === 'stub-run' && res.degraded === undefined, 'probe failure fails open to main command (guard is not a security boundary)');
  }

  // --- 3. 版本探测缓存 ---
  console.log('\n--- 3. version probe caching ---');
  {
    // 覆写底层探测（protected probeGhVersionRaw）而非 getGhVersion：
    // 缓存逻辑写在 getGhVersion 体内，覆写整个方法等于绕开被测对象本身。
    // 注：probeGhVersionRaw 之上还有 runGuarded 路由断言用的 getGhVersion 覆写（§2 组），
    // 那些断言只关心路由分支，不涉及缓存，故分开两套桩。
    const probeCalls = { count: 0 };
    class ProbeStub extends GhExecutor {
      async probeGhVersionRaw() {
        probeCalls.count++;
        return 'gh version 2.96.0 (2026-07-02)';
      }
    }
    const exec = new ProbeStub();
    const v1 = await exec.getGhVersion();
    const v2 = await exec.getGhVersion();
    const v3 = await exec.getGhVersion();
    assert(v1 === '2.96.0' && v2 === '2.96.0' && v3 === '2.96.0', 'real getGhVersion parses and returns version from probe');
    assert(probeCalls.count === 1, 'three getGhVersion calls trigger exactly one raw probe (TTL cache hit)');
  }

  // --- 4. AI_AGENT 注入（真实子进程行为验证，phase5 先例）---
  console.log('\n--- 4. AI_AGENT env injection (real subprocess) ---');
  // 不复刻 run() 内的 env 组装（复刻品会随源码漂移而假通过），改测真实链路：
  // ghPath='node'，用 -e 脚本回显子进程实际收到的 AI_AGENT。沙箱若禁止 spawn
  // （EPERM，phase5 同况）则整组 SKIP——沙箱外 e2e 冒烟已覆盖真实链路。
  const echoScript = 'process.stdout.write("A:" + (process.env.AI_AGENT === undefined ? "unset" : process.env.AI_AGENT))';
  let spawnBlocked = false;
  async function echoAI_AGENT(exec, options = {}) {
    const res = await exec.run(['-e', echoScript], { ...options, rawText: true, timeoutMs: 8_000 });
    if (!res.ok && res.error && /EPERM|ENOENT/.test(res.error)) {
      spawnBlocked = true;
      return 'BLOCKED';
    }
    return res.ok ? (res.rawOutput || '').trim() : `ERR:${res.error}`;
  }

  {
    const exec = new GhExecutor({ ghPath: 'node' });
    const a = await echoAI_AGENT(exec);
    if (spawnBlocked) {
      console.log('⚠️ SKIP group 4 (real subprocess): spawn blocked in sandbox — covered by e2e smoke outside sandbox');
    } else {
      assert(a === 'A:dsh', 'real subprocess receives AI_AGENT=dsh by default');
    }
  }

  if (!spawnBlocked) {
    {
      const exec = new GhExecutor({ ghPath: 'node', agentEnvInjection: false });
      assert((await echoAI_AGENT(exec)) === 'A:unset', 'agentEnvInjection=false leaves AI_AGENT unset in subprocess');
    }
    {
      const prev = process.env.AI_AGENT;
      process.env.AI_AGENT = 'outer-agent';
      try {
        const exec = new GhExecutor({ ghPath: 'node' });
        assert((await echoAI_AGENT(exec)) === 'A:dsh', 'injection overrides inherited AI_AGENT (DSH is the direct driver)');
        assert((await echoAI_AGENT(exec, { env: { AI_AGENT: 'caller' } })) === 'A:caller', 'caller options.env still wins (same semantics as proxy vars)');
      } finally {
        if (prev === undefined) delete process.env.AI_AGENT; else process.env.AI_AGENT = prev;
      }
    }
    {
      const exec = new GhExecutor({ ghPath: 'node' });
      exec.updateConfig({ agentEnvInjection: false });
      assert((await echoAI_AGENT(exec)) === 'A:unset', 'updateConfig flips injection off at runtime');
      exec.updateConfig({ agentEnvInjection: true });
      assert((await echoAI_AGENT(exec)) === 'A:dsh', 'updateConfig re-enables injection');
    }
  }

  // --- 5. search 三缺口（命令构造钉死字段集——字段漂移即断言失败）---
  console.log('\n--- 5. search actions command construction ---');
  {
    const recorded = [];
    const mock = {
      // 18 个工具统一经 resolveExecScope 归一工作区；测试替身必须实现同一接口
      resolveExecScope(execContext) {
        return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId || execContext?.session?.id };
      },
      defaultListLimit: 20,
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; },
      async run(cmd, opts) { recorded.push(cmd); return { ok: true, data: [], rawOutput: '[]' }; },
      async runGuarded(cmd, opts) { return this.run(cmd, opts); },
    };
    const { createRepoTool } = await import('../lib/tools/repo.js');
    const repoTool = createRepoTool(mock);

    await repoTool.execute({ action: 'search_issues', query: 'is:open label:bug', repo: 'o/r' }, {});
    assert(recorded.at(-1).join(' ').includes('search issues is:open label:bug --repo o/r --json number,title,state,author,labels,updatedAt,url -L 20'), 'search_issues pins 7-field set with query qualifiers inline');

    await repoTool.execute({ action: 'search_prs', query: 'is:pr', repo: 'o/r' }, {});
    assert(recorded.at(-1).join(' ').includes('--json number,title,state,author,labels,isDraft,updatedAt,url'), 'search_prs adds isDraft (8 fields)');

    await repoTool.execute({ action: 'search_commits', query: 'fix', repo: 'o/r' }, {});
    assert(recorded.at(-1).join(' ').includes('search commits fix --repo o/r --json sha,commit,author,repository,url'), 'search_commits pins 5-field set');

    let threw = false;
    try { await repoTool.execute({ action: 'search_issues' }, {}); } catch { threw = true; }
    assert(threw, 'search_issues without query throws');

    await repoTool.execute({ action: 'search_issues', query: 'x' }, {}); // 无 repo 参数
    assert(!recorded.at(-1).includes('--repo'), 'search without repo flag omits --repo (global search)');
  }

  // --- 6. read_file / read_dir（守卫路由 + 降级 + TSV 解析 + 渲染标注）---
  console.log('\n--- 6. read_file/read_dir guarded paths ---');
  {
    const { createRepoTool } = await import('../lib/tools/repo.js');
    const { renderRepoMarkdown, appendDegradedNote } = await import('../lib/renderers/markdown.js');

    // 6.1 主链路：runGuarded 被调且 minVersion 正确、命令数组正确
    const guardCalls = [];
    class GuardRecorder {
    
  resolveExecScope(execContext) { return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId }; }
      defaultListLimit = 20;
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; }
      async run(cmd, opts) { return { ok: true, rawOutput: 'file-body' }; }
      async runGuarded(cmd, opts) { guardCalls.push({ cmd, opts }); return { ok: true, rawOutput: 'file-body' }; }
    }
    const t1 = createRepoTool(new GuardRecorder());
    const r1 = await t1.execute({ action: 'read_file', path: 'package.json' }, {});
    assert(guardCalls.length === 1 && guardCalls[0].opts.minVersion === '2.95.0' && guardCalls[0].opts.capability === 'gh repo read-file', 'read_file routes through runGuarded with 2.95.0 gate');
    assert(guardCalls[0].cmd.join(' ') === 'repo read-file package.json -R owner/test', 'read_file main command array exact');
    assert(r1.content === 'file-body' && r1.size === 'file-body'.length, 'read_file returns content+size from stdout');

    // 6.2 ref 透传
    const t2 = createRepoTool(new GuardRecorder());
    await t2.execute({ action: 'read_file', path: 'a.txt', ref: 'dev' }, {});
    assert(guardCalls.at(-1).cmd.join(' ').endsWith('--ref dev'), 'read_file ref passes through as --ref');

    // 6.3 降级链：版本不足 → fallback 被调 → degraded 标注 + 渲染可见
    const apiCalls = [];
    class OldGhExecutor {
    
  resolveExecScope(execContext) { return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId }; }
      defaultListLimit = 20;
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; }
      async getGhVersion() { return '2.94.0'; }
      async run(cmd, opts) { apiCalls.push(cmd); return { ok: true, rawOutput: 'api-body' }; }
      async runGuarded(cmd, opts) {
        const { minVersion, fallback, capability, ...rest } = opts;
        // 复刻真实守卫的降级分支（真实逻辑已在组 2 钉死，这里只测工具侧 fallback 闭包）
        return { ...(await fallback()), degraded: true, degradedReason: `当前 gh 2.94.0 低于 ${capability} 所需版本 ${minVersion}，已切换 API 降级链路` };
      }
    }
    const t3 = createRepoTool(new OldGhExecutor());
    const r3 = await t3.execute({ action: 'read_file', path: 'src/中文 名.ts' }, {});
    assert(apiCalls.at(-1)[0] === 'api' && apiCalls.at(-1)[1] === 'repos/owner/test/contents/src/%E4%B8%AD%E6%96%87%20%E5%90%8D.ts', 'fallback encodes CJK/space path segments');
    assert(r3.content === 'api-body' && r3.degraded === true, 'degraded result carries content + flag');
    // ref 走 URL query 而非 -f（gh api 带 -f 会把 GET 隐式改写成 POST → contents 端点 404）
    await t3.execute({ action: 'read_file', path: 'a.txt', ref: 'dev' }, {});
    assert(apiCalls.at(-1)[1] === 'repos/owner/test/contents/a.txt?ref=dev' && !apiCalls.at(-1).includes('-f'), 'fallback ref goes via URL query string, never -f (GET→POST rewrite trap)');
    const rendered3 = renderRepoMarkdown({ action: 'read_file' }, r3);
    assert(rendered3.includes('⚠️') && rendered3.includes('降级链路'), 'degraded note visible in render (S1 contract fulfilled)');
    assert(appendDegradedNote({ degraded: false }) === '' && appendDegradedNote(null) === '', 'appendDegradedNote silent when not degraded');

    // 6.4 read_dir 主链路 TSV 解析
    class DirExecutor {
    
  resolveExecScope(execContext) { return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId }; }
      defaultListLimit = 20;
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; }
      async runGuarded(cmd, opts) { return { ok: true, rawOutput: 'dir\t.github\t040000\t0\nfile\tREADME.md\t100644\t25050\nfile\tLICENSE\t100644\t1072' }; }
    }
    const t4 = createRepoTool(new DirExecutor());
    const r4 = await t4.execute({ action: 'read_dir' }, {});
    assert(r4.count === 3 && r4.items[0].type === 'dir' && r4.items[0].name === '.github' && r4.items[2].size === 1072, 'read_dir parses TSV 4-col into items');

    // 6.5 read_dir 降级链：contents JSON 数组归一
    class DirApiExecutor {
    
  resolveExecScope(execContext) { return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId }; }
      defaultListLimit = 20;
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; }
      async run(cmd) { return { ok: true, data: [{ type: 'dir', name: 'src', size: 0 }, { type: 'file', name: 'x.ts', size: 12 }] }; }
      async runGuarded(cmd, opts) { return { ...(await opts.fallback()), degraded: true, degradedReason: 'x' }; }
    }
    const t5 = createRepoTool(new DirApiExecutor());
    const r5 = await t5.execute({ action: 'read_dir', path: 'lib' }, {});
    assert(r5.items.length === 2 && r5.items[1].name === 'x.ts' && r5.items[1].size === 12 && r5.items[0].mode === '-', 'read_dir fallback normalizes contents JSON array');

    // 6.6 二进制防线：NUL 字节拒绝并引导 github_api
    class BinExecutor {
    
  resolveExecScope(execContext) { return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId }; }
      defaultListLimit = 20;
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; }
      async runGuarded() { return { ok: true, rawOutput: 'abc\u0000def' }; }
    }
    const t6 = createRepoTool(new BinExecutor());
    let binThrew = false;
    try { await t6.execute({ action: 'read_file', path: 'logo.png' }, {}); } catch (e) { binThrew = /二进制/.test(String(e.message)); }
    assert(binThrew, 'read_file rejects NUL-byte content with github_api guidance');
  }

  // --- 7. workflow 查询（字段集勘误钉 + 头部抽取）---
  console.log('\n--- 7. workflow query actions ---');
  {
    const recorded = [];
    const mock = {
      // 18 个工具统一经 resolveExecScope 归一工作区；测试替身必须实现同一接口
      resolveExecScope(execContext) {
        return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId || execContext?.session?.id };
      },
      defaultListLimit: 20,
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; },
      async run(cmd, opts) { recorded.push({ cmd, opts }); return { ok: true, data: [], rawOutput: '[]' }; },
      async runGuarded(cmd, opts) { return this.run(cmd, opts); },
    };
    const { createRunTool } = await import('../lib/tools/run.js');
    const runTool = createRunTool(mock);

    await runTool.execute({ action: 'workflow_list', repo: 'o/r' }, {});
    assert(recorded.at(-1).cmd.join(' ') === 'workflow list -R o/r --json id,name,path,state -L 20', 'workflow_list pins exact 4-field set (勘误 E1: no updatedAt)');

    await runTool.execute({ action: 'workflow_list', repo: 'o/r', all: true }, {});
    assert(recorded.at(-1).cmd.at(-1) === '--all', 'workflow_list all:true appends --all');

    // workflow_view：rawText + 头部抽取（实测样本）
    const sample = 'Release & Publish to npm - npm-publish.yml\nID: 374382120\n\nTotal runs 12\nRecent runs\ncompleted\tsuccess\tchore(release): v0.2.1\tRelease & Publish to npm\tv0.2.1\tpush\t31s\t38417584979';
    const viewMock = {
  resolveExecScope(execContext) {
    return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId };
  },
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; },
      async run(cmd, opts) { recorded.push({ cmd, opts }); return { ok: true, rawOutput: sample }; },
    };
    const t7 = createRunTool(viewMock);
    const r7 = await t7.execute({ action: 'workflow_view', workflow: 'npm-publish.yml', repo: 'o/r' }, {});
    assert(recorded.at(-1).opts.rawText === true, 'workflow_view uses rawText (gh has no --json, 勘误 E2)');
    assert(r7.id === '374382120' && r7.totalRuns === '12', 'workflow_view extracts ID and totalRuns');
    assert(r7.workflow.includes('npm-publish.yml') && r7.recentRuns.startsWith('Recent runs'), 'workflow_view keeps first line + recentRuns block');

    let wfThrew = false;
    try { await runTool.execute({ action: 'workflow_view' }, {}); } catch { wfThrew = true; }
    assert(wfThrew, 'workflow_view without workflow throws');

    // 渲染：workflow_list 空态区分 all 与否
    const { renderRunMarkdown } = await import('../lib/renderers/markdown.js');
    const emptyActive = renderRunMarkdown({ action: 'workflow_list' }, { items: [] });
    assert(emptyActive.includes('all: true'), 'empty active list hints at all:true (disabled trap)');
  }

  // --- 8. 轻变更命令构造（S3：pin/unpin/lock/unlock/ready/workflow 开关）---
  console.log('\n--- 8. light mutation command construction ---');
  {
    const rec = [];
    const mkExec = () => ({
      resolveExecScope(execContext) { return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId }; },
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; },
      async run(cmd, opts) { rec.push({ cmd, opts }); return { ok: true, rawOutput: 'done' }; },
      async getGhVersion() { return '2.96.0'; },
      async runGuarded(cmd, opts) { return this.run(cmd, opts); },
    });
    const { createIssueTool } = await import('../lib/tools/issue.js');
    const { createPrTool } = await import('../lib/tools/pr.js');
    const { createRunTool } = await import('../lib/tools/run.js');
    const issueT = createIssueTool(mkExec());
    const prT = createPrTool(mkExec());
    const runT = createRunTool(mkExec());

    await issueT.execute({ action: 'pin', issue_number: 5, repo: 'o/r' }, {});
    assert(rec.at(-1).cmd.join(' ') === 'issue pin 5 -R o/r', 'issue pin command exact');

    await issueT.execute({ action: 'lock', issue_number: 7, repo: 'o/r', lock_reason: 'too_heated' }, {});
    assert(rec.at(-1).cmd.join(' ') === 'issue lock 7 -R o/r --reason too_heated', 'issue lock with reason (实测枚举值 too_heated)');

    await issueT.execute({ action: 'unlock', issue_number: 7, repo: 'o/r' }, {});
    assert(rec.at(-1).cmd.join(' ') === 'issue unlock 7 -R o/r', 'unlock is standalone gh command (not lock flag)');

    await issueT.execute({ action: 'status', repo: 'o/r' }, {});
    assert(rec.at(-1).cmd[1] === 'status' && rec.at(-1).opts.rawText === true, 'issue status rawText passthrough');

    await prT.execute({ action: 'ready', pr_number: 9, repo: 'o/r' }, {});
    assert(rec.at(-1).cmd.join(' ') === 'pr ready 9 -R o/r', 'pr ready command exact (no confirm: reversible state)');
    await prT.execute({ action: 'ready', pr_number: 9, repo: 'o/r', undo: true }, {});
    assert(rec.at(-1).cmd.join(' ') === 'pr ready 9 -R o/r --undo', 'pr ready --undo converts back to draft (gh native reverse)');

    await prT.execute({ action: 'update_branch', pr_number: 9, repo: 'o/r' }, {});
    assert(rec.at(-1).cmd.join(' ') === 'pr update-branch 9 -R o/r', 'pr update-branch no confirm (self-heal action, D6)');

    await runT.execute({ action: 'workflow_enable', workflow: 'ci.yml', repo: 'o/r' }, {});
    assert(rec.at(-1).cmd.join(' ') === 'workflow enable ci.yml -R o/r', 'workflow enable command exact');

    const disRes = await runT.execute({ action: 'workflow_disable', workflow: 'ci.yml', repo: 'o/r' }, {});
    assert(rec.at(-1).cmd.join(' ') === 'workflow disable ci.yml -R o/r', 'workflow disable command exact');
    assert(/trigger 将静默失败/.test(disRes.message), 'disable output warns trigger will silently fail (D4)');
  }

  // --- 9. confirm 分流（S3：delete/transfer/revert 拦截 + variable/secret 渲染红线）---
  console.log('\n--- 9. confirm gates and render redline ---');
  {
    const rec = [];
    const mkExec = () => ({
      resolveExecScope(execContext) { return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId }; },
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; },
      async run(cmd, opts) { rec.push({ cmd, opts }); return { ok: true, rawOutput: 'done' }; },
      async getGhVersion() { return '2.96.0'; },
      async runGuarded(cmd, opts) { return this.run(cmd, opts); },
    });
    const { createIssueTool } = await import('../lib/tools/issue.js');
    const { createPrTool } = await import('../lib/tools/pr.js');
    const { createSecretTool } = await import('../lib/tools/secret.js');
    const issueT = createIssueTool(mkExec());
    const prT = createPrTool(mkExec());
    const secretT = createSecretTool(mkExec());

    // 9.1 issue delete：未 confirm → 拦截卡 + 零 gh 调用
    rec.length = 0;
    const delBlocked = await issueT.execute({ action: 'delete', issue_number: 9, repo: 'o/r' }, {});
    assert(delBlocked.status === 'AWAITING_CONFIRMATION' && rec.length === 0, 'issue delete blocked without confirm AND zero gh calls');
    assert(/永久消失/.test(delBlocked.impact) && /无法恢复/.test(delBlocked.impact) && /物理删除/.test(delBlocked.warning), 'delete impact states physical irreversibility (D2)');

    await issueT.execute({ action: 'delete', issue_number: 9, repo: 'o/r', confirm: true }, {});
    assert(rec.at(-1).cmd.includes('--yes'), 'confirmed delete carries --yes (non-TTY essential)');

    // 9.2 transfer：目标必填 + 同仓库拒绝 + confirm 拦截
    let trThrew = false;
    try { await issueT.execute({ action: 'transfer', issue_number: 9, repo: 'o/r' }, {}); } catch { trThrew = true; }
    assert(trThrew, 'transfer without target_repo throws');
    rec.length = 0;
    const trBlocked = await issueT.execute({ action: 'transfer', issue_number: 9, repo: 'o/r', target_repo: 'o/other' }, {});
    assert(trBlocked.status === 'AWAITING_CONFIRMATION' && rec.length === 0, 'transfer blocked without confirm');
    let sameRepoThrew = false;
    try { await issueT.execute({ action: 'transfer', issue_number: 9, repo: 'o/r', target_repo: 'o/r', confirm: true }, {}); } catch { sameRepoThrew = true; }
    assert(sameRepoThrew, 'transfer to same repo rejected');
    await issueT.execute({ action: 'transfer', issue_number: 9, repo: 'o/r', target_repo: 'o/other', confirm: true }, {});
    assert(rec.at(-1).cmd.join(' ') === 'issue transfer 9 o/other -R o/r', 'confirmed transfer command exact');

    // 9.3 pr revert：confirm 拦截（远端创建实体，merge 级）
    rec.length = 0;
    const rvBlocked = await prT.execute({ action: 'revert', pr_number: 12, repo: 'o/r' }, {});
    assert(rvBlocked.status === 'AWAITING_CONFIRMATION' && rec.length === 0, 'pr revert blocked without confirm (D5)');
    await prT.execute({ action: 'revert', pr_number: 12, repo: 'o/r', confirm: true }, {});
    assert(rec.at(-1).cmd.join(' ') === 'pr revert 12 -R o/r', 'confirmed revert command exact');

    // 9.4 variable/secret 渲染红线（D1：物理分离）
    // variable get 返回值且渲染可见；secret 路径 value 永不出现
    await secretT.execute({ action: 'set', kind: 'variable', name: 'DEPLOY_ENV', value: 'staging', repo: 'o/r' }, {});
    assert(rec.at(-1).cmd.includes('--body') && rec.at(-1).cmd.includes('staging'), 'variable set via -b direct (E2: no stdin redline)');
    assert(!rec.at(-1).opts || rec.at(-1).opts.stdin === undefined, 'variable set never uses stdin channel');

    const got = await secretT.execute({ action: 'get', kind: 'variable', name: 'DEPLOY_ENV', repo: 'o/r' }, {});
    assert(got.value !== undefined, 'variable get returns value (CI plaintext by design)');

    let sgThrew = false;
    try { await secretT.execute({ action: 'get', name: 'NPM_TOKEN', repo: 'o/r' }, {}); } catch (e) { sgThrew = /加密存储|不可读取/.test(String(e.message)); }
    assert(sgThrew, 'secret get explicitly rejected (GitHub-side encryption, physical impossibility)');

    // 渲染分流：secret list 输出永不含 value；variable 渲染可含值
    const tool = secretT;
    const secretRendered = tool.output.render({ action: 'list', kind: 'secret' }, { items: [{ name: 'NPM_TOKEN', updatedAt: '2026-01-01T00:00:00Z', visibility: 'private' }] })[0].text;
    assert(!secretRendered.includes('value'), 'secret render never mentions value field');
    const varSetRendered = tool.output.render({ action: 'set', kind: 'variable' }, { message: 'Variable「E」已更新（值: staging）' })[0].text;
    assert(varSetRendered.includes('staging'), 'variable set render shows plaintext value (by design)');
    // app/visibility 误用于 variable 被拒
    let appThrew = false;
    try { await secretT.execute({ action: 'list', kind: 'variable', repo: 'o/r', app: 'actions' }, {}); } catch { appThrew = true; }
    assert(appThrew, 'variable rejects secret-only app param');

    // 9.5 向后兼容：无 kind 默认 secret（行为与旧版一致）
    rec.length = 0;
    await secretT.execute({ action: 'set', name: 'NPM_TOKEN', value: 'x', repo: 'o/r' }, {});
    assert(rec.at(-1).cmd[0] === 'secret' && rec.at(-1).opts.stdin === 'x', 'default kind=secret keeps stdin channel (backward compat)');
  }

  // --- 10. run download 落盘纪律（GHSA 防线）---
  console.log('\n--- 10. run download GHSA discipline ---');
  {
    const rec = [];
    const dlExec = {
      resolveExecScope(execContext) {
        return { cwd: execContext?.cwd || process.cwd(), sessionId: execContext?.sessionId };
      },
      async getRepoMetadata() { return { nameWithOwner: 'owner/test' }; },
      async run(cmd, opts) { rec.push({ cmd, opts }); return { ok: true, rawOutput: 'downloaded' }; },
      async getGhVersion() { return '2.96.0'; }, // < 2.102 → securityNote 必须出现
      async runGuarded(cmd, opts) { return this.run(cmd, opts); },
    };
    const { createRunTool } = await import('../lib/tools/run.js');
    const runT = createRunTool(dlExec);

    const r = await runT.execute({ action: 'download', run_id: '12345', repo: 'owner/rep' }, {});
    const dirArg = r.directory;
    // 落盘路径恰为插件派生（无 dir 参数可传）
    const expected = ['.dsh', 'data', 'dsh-github-flow', 'artifacts', 'owner', 'rep', '12345'];
    const gotParts = dirArg.split(/[\\/]/);
    assert(expected.every((seg) => gotParts.includes(seg)), 'download dir is plugin-derived (owner/repo/run_id), never user input');
    const dashD = rec.at(-1).cmd[rec.at(-1).cmd.indexOf('-D') + 1];
    assert(dashD === dirArg, '-D receives exactly the plugin-derived path');
    assert(/GHSA-39wj-f2f4-978v/.test(r.securityNote || ''), 'gh<2.102 output carries GHSA security note');
    assert(!('dir' in runT.parameters.properties), 'download exposes no dir param to user (attack surface: one mkdirSync)');

    await runT.execute({ action: 'download', run_id: '12345', repo: 'owner/rep', name: 'build-artifact' }, {});
    assert(rec.at(-1).cmd.includes('-n') && rec.at(-1).cmd[rec.at(-1).cmd.indexOf('-n') + 1] === 'build-artifact', 'name filter passes -n');
  }

  // --- 11. help 映射表防漂移（S4：mapping 主题与工具实际枚举一致性）---
  console.log('\n--- 11. help mapping anti-drift ---');
  {
    const { createHelpTool } = await import('../lib/tools/help.js');
    const mockExec = { resolveExecScope: (e) => ({ cwd: e?.cwd || process.cwd(), sessionId: e?.sessionId }), async run(cmd) { return { ok: true, rawOutput: 'gh-help-text' }; } };
    const helpTool = createHelpTool(mockExec);

    // 11.1 topic 枚举含 mapping，且真实调用返回三段式内容
    const topics = helpTool.parameters.properties.topic.enum;
    assert(topics.includes('mapping'), 'topic enum includes mapping');
    const r = await helpTool.execute({ topic: 'mapping' }, {});
    assert(typeof r.result === 'string' && r.result.includes('已覆盖域映射') && r.result.includes('归属提示') && r.result.includes('未覆盖域引导'), 'mapping topic returns three-section structure');
    assert(r.result.includes('github_api') && r.result.includes('repos/{o}/{r}/labels'), 'uncovered-section carries REST endpoint guidance');

    // 11.2 核心防漂移：9 工具实际 action enum 逐一在 mapping 文本中有对应
    const toolFactories = {
      pr: (await import('../lib/tools/pr.js')).createPrTool,
      issue: (await import('../lib/tools/issue.js')).createIssueTool,
      run: (await import('../lib/tools/run.js')).createRunTool,
      repo: (await import('../lib/tools/repo.js')).createRepoTool,
      release: (await import('../lib/tools/release.js')).createReleaseTool,
      secret: (await import('../lib/tools/secret.js')).createSecretTool,
      skill: (await import('../lib/tools/skill.js')).createSkillTool,
    };
    const text = r.result;
    let missing = [];
    // 匹配两种合法形态：引号式（'ready'）或斜杠压缩链（list/view/create 中的 view）
    const covered = (a) => text.includes(`'${a}'`) || new RegExp(`(^|[^a-z_])${a}(/|$|[^a-z_])`).test(text) && new RegExp(`${a}`).test(text);
    for (const [key, factory] of Object.entries(toolFactories)) {
      const tool = factory(mockExec);
      const actions = tool.parameters.properties.action.enum;
      for (const a of actions) {
        if (!covered(a)) missing.push(`${key}:${a}`);
      }
    }
    assert(missing.length === 0, `every real action appears in mapping text${missing.length ? ' — missing: ' + missing.join(', ') : ''}`);

    // 11.3 五主题刷新抽查：新 action 关键词进主题
    for (const [topic, kw] of [['pr', 'update_branch'], ['issue', 'lock_reason'], ['run', 'workflow_disable'], ['repo', 'read_file'], ['secret', "kind: 'variable'"]]) {
      const t = await helpTool.execute({ topic }, {});
      assert(t.result.includes(kw), `topic '${topic}' mentions ${kw} (refreshed for new actions)`);
    }

    // 11.4 overview 含 mapping 入口
    const ov = await helpTool.execute({ topic: 'overview' }, {});
    assert(ov.result.includes("topic: 'mapping'"), 'overview links to mapping entry');

    // 11.5 静态文本健康：面向 Agent 的运行时文本不携带内部阶段术语
    for (const [topic, content] of Object.entries({ ov: ov.result, map: text })) {
      assert(!/(阶段[一二三S0-9]|S[1-5]\b)/.test(content), `help text '${topic}' free of internal stage jargon`);
    }
  }

  console.log('\n========================================');
  console.log(`Phase 10 Test Result: ${passed}/${total} assertions PASSED!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
