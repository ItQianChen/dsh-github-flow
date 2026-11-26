/**
 * 审核弹窗 + 守护轮询（命令式 DOM）。
 *
 * 为什么**不用 React 组件**（与本仓其余 18 个 UI 模块不同）：
 * 那些模块都挂在具名 slot 上（`sidebar.right.pane.tab` / `main` / `sidebar.panellist`），
 * 而 slot 只在对应面板被打开时才渲染。审核弹窗恰恰必须在"用户没打开 GitHub 面板"
 * 时也能弹出来——否则一次高危操作会静静等到 180s 超时。命令式挂 `document.body`
 * 是这里唯一能保证"一定看得见"的做法，代价是手写这 200 行 DOM。
 *
 * 三条交互约束：
 * 1. 只在标签页可见时高频轮询（2s），隐藏时降到 15s——审阅弹窗不该烧电池；
 * 2. 一次只展示队首那一条（先到先审），顶部显示"还有 N 条"；
 * 3. 拒绝必须能写留言，且留言原文回传（模型据此改，而不是瞎猜）。
 */
/**
 * 启动审核守护。返回 disposer（挂 `ctx.effect`）。
 *
 * @param win 注入 window（测试用；缺省全局 window）
 */
export declare function startApprovalWatcher(win?: any): () => void;
