# 发版必改清单（版本硬编码核对表）

> 用途：每次升级版本号发布时，逐项核对本清单。共 **2 处必改 + 2 处顺手更新 + 4 处禁止改 + 2 处自动派生**。
> 忘改必改项的下场：build 直接失败（硬校验已拦截）；历史上 version.ts 漏改导致
> v0.2.0 全体用户看到"0.1.8→0.2.0"假更新横幅。

---

## 一、必改（2 处，必须严格一致）

| # | 文件 | 位置 | 当前值 | 说明 |
|---|---|---|---|---|
| 1 | [package.json](../package.json) | 第 3 行 `"version": "0.7.1"` | `0.7.1` | npm 发布版本、CI 取版来源 |
| 2 | [src/version.ts](../src/version.ts) | 第 9 行 `CURRENT_PLUGIN_VERSION = '0.7.1'` | `'0.7.1'` | 运行时版本比较基准（假横幅的教训来源） |

**两处必须同值**。`pnpm run build` 会硬校验（[scripts/build.mjs](../scripts/build.mjs) 的
`assertVersionConsistency`），不一致直接构建失败——但不要依赖拦截，发版前手动核对。

`lib/` 下同名编译产物（lib/version.js、lib/version.d.ts）**不用手改**：`pnpm run build`
从 src 重新编译生成。但**必须重新构建**，否则 npm 包里带的还是旧版编译产物（v0.2.0 事故
的另一半原因：发布时 lib/version.js 是 0.1.8 的旧产物）。

## 二、发版前顺手更新（2 处，示例版本号）

| # | 文件 | 位置 | 说明 |
|---|---|---|---|
| 3 | [docs/npm-publish-guide.md](../docs/npm-publish-guide.md) | Q3 示例命令 | 已改为 `<最新版本号>` 占位符（与 README 同策略，发版无需再改） |
| 4 | [docs/UPGRADE-NOTES.md](../docs/UPGRADE-NOTES.md)（本文件） | 各表格"当前值"列 | 本清单自身的版本对照，发版后更新 |

## 三、禁止写死版本（4 处，用了占位符/常量——不要往里填具体数字）

| # | 文件 | 位置 | 现状 | 为什么不能填死 |
|---|---|---|---|---|
| 5 | [README.md](../README.md) | 第 68 行 `dsh-github-flow@<最新版本号>` | 占位符 | 每次发版都改会漏；占位符引导用户自己查最新版 |
| 6 | [README.en.md](../README.en.md) | 第 68 行 `dsh-github-flow@<latest-version>` | 占位符 | 同上（英文版） |
| 7 | [src/updater.ts](../src/updater.ts) | 所有 `CURRENT_PLUGIN_VERSION` 引用 | 常量引用 | 全部从 version.ts 导入，无一硬编码——升级只改 version.ts 一处即全局生效 |
| 8 | [src/commands/gh.ts](../src/commands/gh.ts) | `/gh status`、`/gh upgrade` 输出 | 常量引用 | 同上 |

## 四、自动派生（2 处，无需手动改，了解即可）

| # | 机制 | 说明 |
|---|---|---|
| 9 | CI 取版（.github/workflows/npm-publish.yml:74） | `VERSION=$(node -p "require('./package.json').version")`——从 package.json 读，无硬编码 |
| 10 | Git tag | `git tag v0.7.1` 手动打，值必须 = package.json 版本（tag 与 package.json 不一致时：CI 发布的 npm 版本以 package.json 为准，GitHub Release 标题以 tag 为准，出现两者错位） |

## 五、发版完整流程（含版本修改）

```powershell
# 1. 改版本（两处同值）
#    package.json  → "version": "0.7.1"
#    src/version.ts → CURRENT_PLUGIN_VERSION = '0.7.1'

# 2. 文档已用占位符（npm-publish-guide 示例、README 安装命令），发版无需改文档版本号

# 3. 构建（版本一致性校验在此拦截漏改）+ 全量测试
pnpm run build
pnpm test    # 全量测试全绿

# 4. 本机 e2e（必须先重启 DSH 桌面进程——Node 模块缓存，软链重建不注入运行中进程）
#    重启后验证：GET /api/github/check-update 的 currentVersion = 0.7.1

# 5. 提交 + 打 tag + 推送（tag 值 = package.json 版本）
git add -A
git commit -m "chore(release): v0.7.1"
git tag v0.7.1
git push origin master --tags
#    CI（npm-publish.yml）自动：构建→发布 npm→创建 GitHub Release

# 6. 发布后 24h 内：用户裸名安装会被 pnpm 供应链锁降级到上一版，
#    README 占位符已引导显式指定版本，无需额外动作
```

## 六、历史事故对照（为什么有本清单）

| 事故 | 根因 | 现有防线 |
|---|---|---|
| v0.2.0 假更新横幅（全体用户） | src/version.ts 停留 0.1.8，package.json 已 0.2.0；且发布时 lib/version.js 是旧编译产物 | build.mjs 硬校验两处一致；本清单第一、二节 |
| 0.1.8 幽灵版本（本机 GUI） | DSH 进程模块缓存，重建软链不更新运行中进程 | 流程第 4 步强制重启验证 |
| tag 与 npm 版本错位风险 | CI 以 package.json 为准、Release 标题以 tag 为准 | 第五节流程强调 tag = package.json |
| pr checks 完全不可用（Issue #3） | 字段集混入 REST API 字段名（conclusion/detailsUrl），gh 从未支持 | 测试写死合法九字段基准清单（phase1）；新增 --json 字段时对照 `gh <cmd> --json zzz` 错误提示核对 |
| 无 gh 环境刷新永久卡死 | 前端数据链路 fetch 无 AbortController，代理劫持回环时挂起 | 全部数据 fetch 绑 signal（phase7 第 8 节锚点）；新增前端 fetch 必须带 signal 或显式超时 |
| React Hook 变量提升 undefined 崩溃 | containerRef 写在 useEffect 下方，组件挂载读取 containerRef.current 抛致命 TypeError 白屏 | 必须在组件生命周期最顶部声明所有 useRef；访问点强制加 `containerRef && containerRef.current` 守卫 |
| 前端模块目录命名解析冲突 | 在包内创建同名 `src/client/` 目录导致模块解析器在解析 `exports["./client"]` 时发生歧义报错 | 前端拆分子模块统一下沉至独立命名空间（如 `src/ui/`），杜绝同名文件与目录冲突 |
| 代理「测试连通性」结论与真实可用性相反（2026-11-25） | 移除进程级 `setGlobalDispatcher` 后只给 updater 补了 dispatcher，`probe()` 漏掉 → 裸 fetch 走直连；GFW 下代理正常却报失败、代理写错却报成功 | `probe()` 显式 `getDispatcher()`；phase50 有「mock `globalThis.fetch` 校验 dispatcher」行为断言 + 源码契约双保险；socks5 明确拒绝 Node fetch 探测，改走 `gh api` 子进程 |
| phase50 在 Linux CI 全红（2026-11-25） | `detectSystemProxy` 的平台门禁排在注入 reader 之前，mock 被无视；另有一条断言要求宿主能解析 undici（CI 没有 `~/.dsh` profile） | 平台门禁只约束真实注册表路径（`!reader && 非 win32`）；新增测试断言不得依赖宿主 undici / 运行平台，本地验证用「Linux 平台 + 空 HOME」模拟 CI |
| 审核在切换标签页后会**静默失效**（2026-11-26，交付前发现，未流出） | 前端轮询 `tick()` 在 `visibilityState === 'hidden'` 时直接 return，而 `GET /pending` 同时是服务端在线心跳；隐藏 60s 后 `isClientOnline()` 变 false → `ask()` 返回 `no-client` → 高危操作不经弹窗直接执行。`schedule()` 里那条 `POLL_HIDDEN_MS = 15000` 因此成了死代码 | 心跳类轮询**只准降频、不准停摆**；phase53 §8b 用注入假 window 的离线驱动断言钉死（可见 2s / 隐藏 15s，且隐藏态每轮定时器都真的发出请求）。凡"用同一个请求兼任心跳"的轮询，隐藏标签页一律视为正常使用现场，不是失败场景 |
| 卸载后挂回**僵尸弹窗**（2026-11-26，交付前发现，未流出） | `stopped` 只在 `tick()` 入口查一次；从发出 `GET /pending` 到结算之间若已 `dispose()`（热重载 / 插件卸载），迟到的响应仍会 `render()` 把刚被 `closeOverlay()` 拆掉的弹窗重新挂回 `document.body`——那一刻哨兵位已复位、定时器已清，没有任何人会再来关掉它 | **每个异步环节都要再查一次自身的存活标志**，不能只在发起处查一次。phase53 §8b 用「延迟结算的假 fetch + 卸载后再放响应」钉死，并断言 `render()` 在正常路径上真的把节点挂上、卸载时真的摘掉 |
| 界面上显示「参数指纹」却从不校验（2026-11-26，评审时发现，未流出） | 待审项里算了 `argsHash`、弹窗上也印出来了，但 `POST /decision` 不带它、服务端也不比对。原本的理由是"宿主已 deep-freeze 参数，换参不可达"——理由成立，结论却错：**显示一个从不校验的凭证，等于让人以为校验过了**。同时 `tick()` 既无单飞也无超时，一次悬挂的请求能永久卡死轮询，等于心跳饿死 | 显示即校验：客户端必带 `argsHash`，队列层比对不符即 `mismatch` → 400 且**不消费**待审项；缺参同样按不匹配处理。客户端轮询改为**单飞 + 5 s 超时闸**（`AbortController`），两者成对——只做单飞会被一次悬挂永久卡死，只做超时仍会层层叠请求。phase53 ⑥⑦§8b 共 12 条断言，反向验证分别红 9 / 3 / 2 条 |

## 七、环境陷阱速查（升级验证时必读）

| 陷阱 | 现象 | 对策 |
|---|---|---|
| DSH 进程模块缓存 | 升级/重建后行为不变（幽灵旧版） | 重启 DSH 桌面进程再验证 |
| execFile input 失效（本机 node 22.18） | stdin 命令挂到超时 | 已用 spawnWithStdin；回归前先跑最小复现 |
| 交互终端管道继承 | open_terminal 响应挂 10s+ | 已用 stdio:'ignore'；勿改回 execFile |
| 系统代理劫持回环 | 前端 fetch 永久挂起 | 所有数据链路 fetch 带 signal；文案引导查代理 bypass |
| 沙箱解除后的测试盲区 | EPERM SKIP 分支掩盖真实缺陷 | CI/真机全绿 ≠ 本机沙箱绿；phase3/5 曾双双漏检 |
| gh --json 字段集漂移 | Unknown JSON field 直接报错 | 新增字段前用 `gh <cmd> --json zzz` 探测合法集；不跨域复制字段名（checks≠run） |
| PowerShell 5.1 默认策略 | 唤起终端报 profile 禁止运行红错 | 唤起命令带 -NoProfile（Windows 自带基线优先） |
| 浏览器单文件脚本环境 | 客户端产物带未剥除的 export/import 导致语法报错白屏 | build.mjs 聚合器自动剔除 export/import 并将子模块内联注入单一闭包 |
| pnpm `file:` 快照与构建拦截 | 本地开发修改代码并重启 DSH，页面和接口依然为旧版本 | DSH 内置 pnpm 对 `file:` 依赖强制做快照缓存并拦截未经批准的构建脚本。本地二次开发必须通过原生 Junction 目录联接直连工作区（见 architecture.md §3.6） |

## 八、升级行为变更告知（用户可见，发版必须核对）

> 这一节不是版本号清单，而是**用户升级后会感到"插件行为变了"的那些改动**。
> 默认值变更必须在发版时同步到这里——不告知就改行为，比默认关更糟。
> 功能细节见 [README.md](../README.md) 的「🕘 操作记录」与「🛡️ 执行前人工审核」两条。

| 变更 | 首个包含它的版本 | 用户会看到什么 | 怎么关 / 怎么调 | 为什么必须告知 |
|---|---|---|---|---|
| 🕘 **操作记录默认开启** | v0.7.1 之后的首个版本 | 无需任何设置，Agent 对 **PR / Issue 的写操作**就会开始落本地 JSONL（人话摘要 + 仓库 + 风险 + 成败），驾驶舱与右栏出现 `🕘` 入口 | 设置 →「🕘 操作记录与审核」→ 关掉「启用操作记录」（关后不再写盘、启动也不加载历史，历史文件仍留在本地可清空）；预算 1–64 MB 可调 | 默认开 = 新的本地磁盘写入。用户有权在第一次写盘前知道文件在哪（`~/.dsh/data/dsh-github-flow/audit.jsonl`）、占多少（默认 8 MB 上限）、记什么（只记写、只记 PR/Issue） |
| 🛡️ **执行前人工审核默认开启** | 同上 | Agent 要对 PR / Issue 做**不可逆或影响远端**的操作（合并 / revert / `checkout --force` / 关闭 / 删除 / 迁移 Issue，共 6 条）时，浏览器会弹窗等你拍板 | 设置 →「🕘 操作记录与审核」→ 三档单选：`关闭` / `仅高危（默认）` / `全部写操作` | **这是行为突变**：同一个 Agent、同一句话，升级前直接执行，升级后开始等一个人点按钮。插件加载时另有一次性 `console.warn` 提示，但控制台不是读文档的地方 |
| 审核**依附于**操作记录 | 同上 | 关掉记录后，设置里审核三档整组置灰并显示「⚠️ 审核已停用：操作记录未开启或存储不可用」 | 想用审核就先开记录（审核是"有据可查的审批"，决策本身是一条要留痕的事实） | 这是刻意的产品口径，不是缺陷。不说明会被当成 bug 反复报 |
| 审核 **fail-open** | 同上 | 浏览器没开 / 弹窗 180 s 无人点 / 记录存储不可用 / 审核自身出错 → **一律不阻塞**，退回原有的 `confirm: true` 流程 | 无需操作 | 默认开的前提就是 fail-open 可靠。用户需要知道"没人看着的时候它不会把 Agent 挂死"，否则会先把这个功能关掉 |
| 记录与审核的**作用域** | 同上 | 只覆盖 `github_pr` / `github_issue` 两个工具；其余 17 个工具的删除仍走各自的 `confirm` 闸门，**不会**在这里弹窗 | 无需操作 | 避免"我明明开了审核，为什么 `release delete` 没弹窗"这类误判 |

