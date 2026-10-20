// test/phase25.test.mjs - Phase 25 · 只读仓库与 fork 血缘可视化（S4）回归测试套件
//
// 覆盖：
// 1. resolveRepoBadges 纯函数：fork 徽章、只读徽章、权限未知不猜、组合场景
// 2. bundle 产物断言：函数被内联、文案存在、样式类存在
// 3. 静态约束：未引入新的网络调用（S4 是纯展示层，零新增往返）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTests() {
  let passed = 0, total = 0;
  const ok = (cond, name, extra = '') => {
    total++;
    if (cond) { console.log(`✅ PASS: ${name}${extra ? '  → ' + extra : ''}`); passed++; }
    else console.error(`❌ FAIL: ${name}${extra ? '  → ' + extra : ''}`);
  };

  // lib/ui/repo-badges.js 是独立产物（不经过 bundle 内联），可直接 import
  const { resolveRepoBadges } = await import('../lib/ui/repo-badges.js');

  // ============================================================
  console.log('\n--- 1. fork 徽章 ---');
  // ============================================================
  const forkRepo = {
    nameWithOwner: 'ItQianChen/codebuddy2api',
    isFork: true,
    parent: { nameWithOwner: 'maiphucgiang/codebuddy2api', url: 'https://github.com/maiphucgiang/codebuddy2api' },
    viewerPermission: 'ADMIN',
  };
  const p1 = resolveRepoBadges(forkRepo);
  ok(p1.badges.some((b) => b.text.includes('fork')), 'fork 仓库产生 fork 徽章');
  ok(p1.forkLine?.parentNameWithOwner === 'maiphucgiang/codebuddy2api', '血缘行给出上游全名', p1.forkLine?.parentNameWithOwner);
  ok(p1.forkLine?.parentUrl === 'https://github.com/maiphucgiang/codebuddy2api', '血缘行给出上游 URL');
  ok(p1.badges.every((b) => b.tone === 'purple'), 'fork 徽章为 purple 色调');
  ok(p1.badges[0].title.includes('maiphucgiang/codebuddy2api'), 'fork 徽章 title 说明上游是谁');

  // fork 但拿不到 parent：仍要告诉用户「这是 fork」
  const forkNoParent = { isFork: true, parent: null };
  const p2 = resolveRepoBadges(forkNoParent);
  ok(p2.badges.length === 1 && p2.badges[0].text.includes('fork'), 'fork 但无 parent 仍产生徽章');
  ok(p2.forkLine === null, 'fork 但无 parent 时血缘行为 null');

  // ============================================================
  console.log('\n--- 2. 只读徽章 ---');
  // ============================================================
  const readRepo = { nameWithOwner: 'maiphucgiang/codebuddy2api', isFork: false, viewerPermission: 'READ' };
  const p3 = resolveRepoBadges(readRepo);
  ok(p3.badges.length === 1 && p3.badges[0].text.includes('只读'), 'READ 权限产生只读徽章');
  ok(p3.badges[0].tone === 'yellow', '只读徽章为 yellow 色调');
  ok(p3.badges[0].title.includes('fork'), '只读徽章 title 给出解法（先 fork）');

  const triageRepo = { viewerPermission: 'TRIAGE' };
  ok(resolveRepoBadges(triageRepo).badges.some((b) => b.text.includes('只读')), 'TRIAGE 权限同样产生只读徽章');

  // ============================================================
  console.log('\n--- 3. 可写权限与未知权限：零徽章 ---');
  // ============================================================
  for (const perm of ['ADMIN', 'MAINTAIN', 'WRITE']) {
    const p = resolveRepoBadges({ isFork: false, viewerPermission: perm });
    ok(p.badges.length === 0, `${perm} 权限不产生任何徽章（保持现有外观）`);
  }
  // 权限缺失 = 离线/旧数据，既不能说可写也不能说只读 → 沉默
  ok(resolveRepoBadges({ isFork: false }).badges.length === 0, '权限缺失时不产生徽章（不猜）');
  ok(resolveRepoBadges({ isFork: false, viewerPermission: '' }).badges.length === 0, '空字符串权限不产生徽章');
  ok(resolveRepoBadges({ isFork: false, viewerPermission: 'SOMETHING_NEW' }).badges.length === 0, '未知权限档位不产生徽章');

  // 大小写容错
  ok(resolveRepoBadges({ viewerPermission: 'read' }).badges.some((b) => b.text.includes('只读')), '权限值小写也能识别');

  // ============================================================
  console.log('\n--- 4. 组合场景 ---');
  // ============================================================
  const readOnlyFork = {
    isFork: true,
    parent: { nameWithOwner: 'up/stream' },
    viewerPermission: 'READ',
  };
  const p4 = resolveRepoBadges(readOnlyFork);
  ok(p4.badges.length === 2, '只读 + fork 同时成立产生两个徽章');
  ok(p4.badges.some((b) => b.text.includes('fork')) && p4.badges.some((b) => b.text.includes('只读')), '两个徽章内容正确');
  ok(p4.forkLine !== null, '组合场景血缘行仍在');

  // parent 无 url 时自行拼接
  const noUrl = resolveRepoBadges({ isFork: true, parent: { nameWithOwner: 'a/b' } });
  ok(noUrl.forkLine?.parentUrl === 'https://github.com/a/b', 'parent 无 url 时自行拼接');

  // ============================================================
  console.log('\n--- 4b. parent.url 的协议安全 ---');
  // ============================================================
  // parent.url 来自 API 响应，直接塞进 href 会承接任意协议。
  // 非 http(s) 一律拒收并从 nameWithOwner 重建（拼出的必然是 https://github.com/...）
  const dangerous = [
    ['javascript:alert(1)', 'javascript:'],
    ['data:text/html,<script>', 'data:'],
    ['file:///etc/passwd', 'file:'],
    ['//evil.com/x', '协议相对'],
    ['relative/path', '相对路径'],
  ];
  for (const [url, label] of dangerous) {
    const r = resolveRepoBadges({ isFork: true, parent: { nameWithOwner: 'a/b', url } });
    ok(r.forkLine?.parentUrl === 'https://github.com/a/b', `危险 URL 被拒并重建：${label}`, r.forkLine?.parentUrl);
  }
  const goodUrl = resolveRepoBadges({ isFork: true, parent: { nameWithOwner: 'a/b', url: 'https://github.com/a/b' } });
  ok(goodUrl.forkLine?.parentUrl.startsWith('https://github.com/a/b'), '合法 https URL 被保留');

  // parent.nameWithOwner 纯空白视为无
  ok(resolveRepoBadges({ isFork: true, parent: { nameWithOwner: '   ' } }).forkLine === null, 'parent 名字为空白视为无');
  ok(resolveRepoBadges({ isFork: true, parent: { nameWithOwner: 'a/b ' } }).forkLine?.parentNameWithOwner === 'a/b', 'parent 名字两端空白被裁剪');

  // ============================================================
  console.log('\n--- 5. 异常输入不抛错 ---');
  // ============================================================
  for (const [label, arg] of [['null', null], ['undefined', undefined], ['数字', 42], ['空对象', {}], ['字符串', 'x']]) {
    try {
      const r = resolveRepoBadges(arg);
      ok(r && Array.isArray(r.badges) && r.forkLine === null, `${label} 输入返回空结果不抛错`);
    } catch (e) {
      ok(false, `${label} 输入返回空结果不抛错`, e.message);
    }
  }

  // ============================================================
  console.log('\n--- 6. bundle 产物断言 ---');
  // ============================================================
  const builtClient = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
  ok(builtClient.includes('resolveRepoBadges'), 'bundle 内联了 resolveRepoBadges');
  ok(builtClient.includes('⑂ fork'), 'bundle 含 fork 徽章文案');
  ok(builtClient.includes('🔒 只读'), 'bundle 含只读徽章文案');
  ok(builtClient.includes('dsh-github-fork-line'), 'bundle 含血缘行样式类');
  ok(builtClient.includes('dsh-badge-readonly'), 'bundle 含只读徽章样式类');
  ok(builtClient.includes('fork 自'), 'bundle 含血缘行文案');
  ok(!/\bexport\s+(async\s+)?(function|const|var|let|class)\b/.test(builtClient), 'bundle 无残留 export 关键字');

  const css = fs.readFileSync(path.join(__dirname, '../lib/ui/styles.js'), 'utf8');
  ok(css.includes('.dsh-badge-readonly'), 'styles.js 含只读徽章样式');
  ok(css.includes('.dsh-github-fork-line'), 'styles.js 含血缘行样式');

  // ============================================================
  console.log('\n--- 7. 零新增网络调用的静态约束 ---');
  // ============================================================
  // S4 是纯展示层。若 executor 里出现查 parent star 的调用，说明有人
  // 为了「fork 显示上游 star」加了网络往返——那是被实测否决的方案（+3~6s 首屏）。
  //
  // 检查前先剥掉注释：源码注释里合法地引用了 `parent.stargazerCount`
  // 解释「为什么不用它」，那是文档不是调用。不剥注释会误报。
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const executorSrc = fs.readFileSync(path.join(__dirname, '../src/executor.ts'), 'utf8');
  const executorCode = stripComments(executorSrc);
  ok(!/parent\.stargazerCount/.test(executorCode), 'executor 代码中未尝试取 parent.stargazerCount（gh 不支持该字段）');
  ok(!/'[^']*parent\.stargazerCount[^']*'/.test(executorCode), '--json 字段列表不含 parent.stargazerCount');
  const repoViewBlocks = executorSrc.match(/REPO_VIEW_FIELDS/g) || [];
  ok(repoViewBlocks.length >= 2, 'REPO_VIEW_FIELDS 常量被两处调用复用（未出现第二份字段列表）');

  // ============================================================
  console.log('\n--- 8. 全景面板未被误改 ---');
  // ============================================================
  // 全景面板的数据源是离线解析（无 isFork / viewerPermission），改它也显示不出东西
  const panelSrc = fs.readFileSync(path.join(__dirname, '../src/ui/workspace-panel.ts'), 'utf8');
  ok(!panelSrc.includes('resolveRepoBadges'), '全景面板不消费 resolveRepoBadges（其数据源无这些字段）');

  console.log('\n========================================');
  console.log(`Phase 25 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
