// test/phase26.test.mjs - Phase 26 · 写操作权限自愈（S5）回归测试套件
//
// 背景：S5 原方案的「前端禁用按钮」被实测证伪——5 个快捷按钮全是 window.open，
// 零写操作，GitHub 网页自己会判断权限。真正的问题是 Agent 调工具撞 403 时
// 只拿到裸错误文本，且 GraphQL 通道的权限错误此前被归为 unknown（会被误当可重试）。
//
// 覆盖：
// 1. GraphQL 权限错误的分类补齐
// 2. permissionRemedy 的档位映射（Triage / Write / Admin / 默认）
// 3. 限流 403 不被误判为权限错误
// 4. executor 把指引拼进 error（模型可见）
// 5. 静态断言：前端按钮保持可用（防回退到被证伪的方案）

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

  const { classifyGhError, describeDeterministicError, isPermissionError, permissionRemedy } =
    await import('../lib/executor/error-classifier.js');

  // ============================================================
  console.log('\n--- 1. GraphQL 权限错误分类补齐 ---');
  // ============================================================
  const GRAPHQL_PERM = 'GraphQL: ItQianChen does not have the correct permissions to execute `AddLabelsToLabelable` (addLabelsToLabelable)';
  ok(classifyGhError(GRAPHQL_PERM) === 'deterministic', 'GraphQL 权限错误归为 deterministic');
  ok(describeDeterministicError(GRAPHQL_PERM) !== null, '有可读说明');
  ok(isPermissionError(GRAPHQL_PERM) === true, 'isPermissionError 命中');

  // 既有形态不回归
  ok(classifyGhError('HTTP 403: Resource not accessible by integration') === 'deterministic', 'HTTP 403 仍为 deterministic');
  ok(isPermissionError('HTTP 403: Resource not accessible') === true, 'HTTP 403 仍是权限错误');

  // ============================================================
  console.log('\n--- 2. 限流 403 不得误判为权限问题 ---');
  // ============================================================
  ok(classifyGhError('API rate limit exceeded for user (HTTP 403)') === 'transient', '限流 403 仍为 transient（可重试）');
  ok(isPermissionError('API rate limit exceeded (HTTP 403)') === false, '限流 403 不是权限错误');
  ok(permissionRemedy('API rate limit exceeded (HTTP 403)') === null, '限流不产生权限指引');
  ok(permissionRemedy('You have exceeded a secondary rate limit') === null, 'secondary rate limit 无指引');

  // ============================================================
  console.log('\n--- 3. permissionRemedy 档位映射 ---');
  // ============================================================
  const triage = permissionRemedy(GRAPHQL_PERM, 'issue edit 1 -R x/y --add-label bug');
  ok(typeof triage === 'string' && triage.includes('Triage'), '标签操作 → Triage 指引', String(triage).slice(0, 30));

  const write = permissionRemedy('HTTP 403: Forbidden', 'pr merge 1 -R x/y');
  ok(typeof write === 'string' && write.includes('Write'), 'merge 操作 → Write 指引', String(write).slice(0, 30));
  ok(typeof write === 'string' && write.includes('fork'), 'Write 指引包含 fork 工作流解法');

  const admin = permissionRemedy('GraphQL: does not have the correct permissions to execute DeleteIssue', 'issue delete 1 -R x/y');
  ok(typeof admin === 'string' && admin.includes('管理员'), '删除操作 → Admin 指引', String(admin).slice(0, 30));
  ok(typeof admin === 'string' && admin.includes('不可逆'), 'Admin 指引警告不可逆');

  const unknown = permissionRemedy('HTTP 403: Forbidden');
  ok(typeof unknown === 'string' && unknown.length > 0, '未知权限场景仍有默认指引');
  ok(typeof unknown === 'string' && !/Triage|Write|Admin/.test(unknown), '默认指引不猜具体档位（猜错比不猜更糟）');
  ok(typeof unknown === 'string' && unknown.includes('gh auth status'), '默认指引给出自检命令');

  // ============================================================
  console.log('\n--- 4. 非权限错误不产生噪音 ---');
  // ============================================================
  const nonPermission = [
    'GitHub CLI 命令执行超时 (8000ms)',
    "the 'a/b' repository has disabled issues",
    'GraphQL: Could not resolve to a Repository',
    'Branch not found',
    'spawn EPERM',
  ];
  for (const e of nonPermission) {
    ok(permissionRemedy(e) === null, `非权限错误无指引：${e.slice(0, 40)}`);
  }
  ok(permissionRemedy(null) === null && permissionRemedy('') === null, '空值返回 null 不抛错');

  // ============================================================
  console.log('\n--- 5. executor 把指引拼进 error（模型可见）---');
  // ============================================================
  const executorSrc = fs.readFileSync(path.join(__dirname, '../src/executor.ts'), 'utf8');
  ok(executorSrc.includes('permissionRemedy(friendlyError'), 'executor 调用了 permissionRemedy');
  ok(/finalError\s*=\s*remedy\s*\?/.test(executorSrc), 'executor 用三元拼装 finalError');
  ok(executorSrc.includes('error: finalError'), '返回结果使用拼装后的 error');

  // 组装逻辑的等价验证：模拟 executor 的拼装
  const simulate = (err, act) => {
    const remedy = permissionRemedy(err, act);
    return remedy ? `${err}\n\n${remedy}` : err;
  };
  const composed = simulate(GRAPHQL_PERM, 'issue edit 1 --add-label bug');
  ok(composed.startsWith(GRAPHQL_PERM), '拼装后保留原始错误文本');
  ok(composed.includes('\n\n'), '拼装用空行分隔原文与指引');
  ok(composed.includes('Triage'), '拼装后模型能看到档位');
  ok(simulate('GitHub CLI 命令执行超时', '') === 'GitHub CLI 命令执行超时', '非权限错误不被拼装（零噪音）');

  // ============================================================
  console.log('\n--- 6. GhResult 契约 ---');
  // ============================================================
  const typesSrc = fs.readFileSync(path.join(__dirname, '../src/types.ts'), 'utf8');
  ok(/permissionRemedy\?:\s*string/.test(typesSrc), 'GhResult 声明了 permissionRemedy 字段');

  // ============================================================
  console.log('\n--- 7. 防回退：前端按钮必须保持可用 ---');
  // ============================================================
  // S5 原方案要「禁用创建类按钮」，实测证明 5 个按钮全是 window.open（零写操作）。
  // 若有人照原方案加 disabled，会让用户白白失去浏览器快捷入口。
  const clientSrc = fs.readFileSync(path.join(__dirname, '../src/client.ts'), 'utf8');
  const start = clientSrc.indexOf('var actionsBarEl');
  const end = clientSrc.indexOf('var prSectionEl');
  const actionsBlock = clientSrc.slice(start, end);
  ok((actionsBlock.match(/window\.open/g) || []).length === 5, '快捷操作栏 5 个按钮全是 window.open');
  ok(!/fetch\(|executor\./.test(actionsBlock), '快捷操作栏零写操作（无需权限拦截）');
  ok(!/disabled/.test(actionsBlock), '快捷操作栏未引入 disabled（原方案已被证伪）');
  ok(!/viewerPermission/.test(actionsBlock), '快捷操作栏不消费 viewerPermission');

  // S4 的徽章行为保持不变
  const badgesSrc = fs.readFileSync(path.join(__dirname, '../src/ui/repo-badges.ts'), 'utf8');
  ok(badgesSrc.includes("perm === 'READ' || perm === 'TRIAGE'"), 'S4 只读徽章规则未被改动');

  // ============================================================
  console.log('\n--- 8. 指引长度约束（不撑爆上下文）---');
  // ============================================================
  const all = [GRAPHQL_PERM, 'HTTP 403'];
  for (const e of all) {
    for (const act of ['pr merge', 'issue edit --add-label', 'issue delete', '']) {
      const r = permissionRemedy(e, act);
      if (r) ok(r.length <= 150, `指引长度 ≤150：${act || '默认'}`, `${r.length} 字符`);
    }
  }

  console.log('\n========================================');
  console.log(`Phase 26 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
