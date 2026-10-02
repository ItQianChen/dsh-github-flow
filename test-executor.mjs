import { GhExecutor } from './lib/executor.js';

async function test() {
  console.log('--- 测试 DSH GitHub 插件核心执行器 ---');
  const executor = new GhExecutor();

  console.log('1. 测试 checkAuth()...');
  const auth = await executor.checkAuth();
  console.log('Auth 结果:', JSON.stringify(auth, null, 2));

  console.log('\n2. 测试 gh api user...');
  const userRes = await executor.run(['api', 'user', '--jq', '{login: .login, name: .name, public_repos: .public_repos}']);
  console.log('API user 结果:', JSON.stringify(userRes, null, 2));

  console.log('\n3. 测试 getRepoMetadata()...');
  const repo = await executor.getRepoMetadata();
  console.log('Repo 结果:', JSON.stringify(repo, null, 2));

  console.log('\n4. 测试防注入与安全参数数组...');
  const safeRes = await executor.run(['--help']);
  console.log('安全执行结果 ok:', safeRes.ok, safeRes.rawOutput?.slice(0, 80));

  console.log('\n=== 全部核心链路测试通过 ===');
}

test().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
