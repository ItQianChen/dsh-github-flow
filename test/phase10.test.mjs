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

  console.log('\n========================================');
  console.log(`Phase 10 Test Result: ${passed}/${total} assertions PASSED!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
