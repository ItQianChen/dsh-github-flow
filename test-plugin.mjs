import { apply, name, inject } from './lib/index.js';

async function testPlugin() {
  console.log('--- 测试 DSH 插件规范与注册链路 ---');
  console.log('插件名称:', name);
  console.log('服务注入列表:', inject);

  const registeredTools = [];
  const registeredCommands = [];
  const registeredRoutes = [];

  const mockCtx = {
    tools: {
      register: (tool) => {
        registeredTools.push(tool);
        console.log(`[Tool 注册] ${tool.name}: ${tool.description.slice(0, 30)}...`);
      },
    },
    commands: {
      register: (cmd) => {
        registeredCommands.push(cmd);
        console.log(`[Command 注册] /${cmd.name}: ${cmd.description}`);
      },
    },
    webServer: {
      register: (route) => {
        registeredRoutes.push(route);
        console.log(`[WebServer 路由注册] ${route.kind} -> ${route.path}`);
      },
    },
  };

  apply(mockCtx);

  if (registeredTools.length !== 5) {
    throw new Error(`预期注册 5 个 Tool，实际注册 ${registeredTools.length} 个`);
  }
  if (registeredCommands.length !== 1) {
    throw new Error(`预期注册 1 个 Command，实际注册 ${registeredCommands.length} 个`);
  }
  if (registeredRoutes.length !== 4) {
    throw new Error(`预期注册 4 个 API Route，实际注册 ${registeredRoutes.length} 个`);
  }

  console.log('\n--- 测试 Tool 实际执行：github_repo(action: "view") ---');
  const repoTool = registeredTools.find((t) => t.name === 'github_repo');
  const repoResult = await repoTool.execute({ action: 'view', repo: 'cli/cli' });
  console.log('远程仓库 cli/cli 查询成功:', repoResult?.nameWithOwner, '默认分支:', repoResult?.defaultBranchRef?.name);

  console.log('\n--- 测试 Slash 命令实际执行：/gh status ---');
  const ghCmd = registeredCommands.find((c) => c.name === 'gh');
  const cmdResult = await ghCmd.handler({ rawInput: 'status' });
  console.log('Slash 命令输出:\n', cmdResult.text);

  console.log('\n--- 测试 Cordis 规范生命周期与 Web 路由冲突自愈能力 ---');
  const exact = new Map();
  const disposers = [];
  const cordisCtx = {
    webServer: {
      exact,
      register(route) {
        if (route.kind === 'exact') {
          if (exact.has(route.path)) {
            throw new Error(`webserver: duplicate exact route "${route.path}"`);
          }
          exact.set(route.path, route);
          return () => exact.delete(route.path);
        }
      },
    },
    effect(fn) {
      const d = fn();
      disposers.push(d);
      return d;
    },
  };

  // 1. 模拟标准 Cordis 上下文注册
  apply(cordisCtx);
  if (exact.size !== 4) {
    throw new Error(`预期注册 4 个 exact 路由，实际 ${exact.size} 个`);
  }

  // 2. 模拟热重载/未清理历史残留场景下再次激活（必须自愈且不抛 duplicate exact route）
  apply(cordisCtx);
  if (exact.size !== 4) {
    throw new Error(`冲突自愈后应保持 4 个 exact 路由，实际 ${exact.size} 个`);
  }

  // 3. 模拟 Cordis 卸载插件（触发 effect 回卷清理函数）
  while (disposers.length) {
    const d = disposers.pop();
    if (typeof d === 'function') d();
  }
  if (exact.size !== 0) {
    throw new Error(`卸载后路由表应完全清空，实际剩余 ${exact.size} 个`);
  }

  console.log('Cordis 生命周期回卷与冲突自愈断言全部通过！');

  console.log('\n=== 插件集成测试 100% 通过 ===');
}

testPlugin().catch((err) => {
  console.error('插件集成测试失败:', err);
  process.exit(1);
});
