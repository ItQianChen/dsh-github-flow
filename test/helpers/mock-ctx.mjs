// test/helpers/mock-ctx.mjs
//
// `apply(ctx, config)` 的最小 cordis Context 替身。
//
// 为什么要单独抽出来：main.ts 从「`if (ctx.X)` 逐个探测」改成「`inject` 声明 + `ctx.get`
// 探测」之后，apply 对 ctx 的依赖面固定为 tools/provide/get/on/effect 五个成员。
// 两个测试文件各写一份必然漂移，而 mock 漂移的表现是「测试突然崩溃」而不是「断言失败」，
// 定位成本远高于断言失败。
//
// 刻意不提供 webServer / workspaceRegistry：那正是「可选服务缺席」的真实场景
// （dsh-tui profile 只装 dsh-base，没有 webServer）。`get()` 对它们返回 undefined，
// apply 必须优雅跳过路由注册而不是抛错。
//
// 返回的 registeredTools / registeredCommands / listeners 是观测面，供断言直接消费。

export function createMockContext() {
  const registeredTools = [];
  const registeredCommands = [];
  const listeners = new Map();
  const provided = new Map();
  const services = {
    commands: { register: (command) => registeredCommands.push(command) },
  };

  return {
    // —— 观测面 ——
    registeredTools,
    registeredCommands,
    listeners,
    provided,
    /** 取某个宿主事件的全部监听器（apply 未注册时为空数组） */
    listenersOf(name) {
      return listeners.get(name) ?? [];
    },

    // —— cordis Context 面 ——
    tools: {
      register(tool) {
        registeredTools.push(tool.name);
        return () => {};
      },
    },
    provide(name, value) {
      provided.set(name, value);
      return () => {};
    },
    get(name) {
      return services[name];
    },
    /**
     * 声明式等待可选服务（cordis 语义：服务齐了就补触发回调，不齐就一直挂着）。
     *
     * mock 里必须实现它，否则 apply 直接 TypeError。语义刻意做「齐了立即同步触发」，
     * 让 phase18/19 能在一次调用里观察到命令注册；「服务晚到」的真实时序由
     * phase36 用真 cordis Context 覆盖，不在这里模拟。
     */
    inject(deps, callback) {
      if (deps.every((name) => services[name] !== undefined)) callback(this);
      return { dispose() {} };
    },
    on(name, listener) {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      return () => true;
    },
    effect(callback) {
      const disposer = callback();
      return () => disposer?.();
    },
  };
}
