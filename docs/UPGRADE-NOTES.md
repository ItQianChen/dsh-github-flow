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

| 「点操作记录」白屏（2026-11-26，用户实证，已修） | `audit-modal.ts` 写的是 `import { formatRelativeTime as fmtRelative }`，而构建器内联时**只删 import 行、不落别名** → bundle 里 `fmtRelative` 永远 undefined。列表为空时不调用 `renderRow` 所以看着正常，一旦有记录就抛 ReferenceError，React 整树卸载 = 整页白 | 构建器新增 `rewriteAliasedImports()`（把 `A as B` 落成 `var B = A;`）+ 构建期硬校验（别名没绑定就 exit 1）+ 禁止在已聚合的 `client.js` 上二次内联；`phase52` 第 17 组 3 条断言钉住。教训：**这条路径只在"有数据"时才被执行**，所以 tsc、build、"内联块无残留 import" 全绿也说明不了问题 |
| **应用无法启动**（2026-11-26，做 s2 详情时引入，已回退修好） | 往官方 `conversation.approval.detail` 插槽注册了一条贡献。该插槽是 **`single` 型**且由 `@deepseek-ai/dsh-client-ui-chat`（**required entry**）持有；`single` 插槽在**同优先级重复注册时直接抛错**，而抛错发生在**官方包自己注册的那一刻** —— 于是 `web boot: 1 required entry did not activate`，整个应用起不来，调用方的 `try/catch` 根本拦不到 | `phase36` 新增**插槽贡献白名单**：客户端只许 `slots.inject` 自己声明的 4 个插槽（`sidebar.right.pane.tab(.title)` / `sidebar.panellist` / `main`），产物里出现 `conversation.approval.*` 即红。教训两条：① **`entriesOfSlot` 的去重逻辑不代表 `register` 时不校验** —— 判断"能不能注册"必须读 register 路径，我读错了函数；② 碰官方插槽前先确认它的 **kind 与持有者是否 required**，`single` + `required` 的失败半径是"整个应用" |
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
| 🕘 **操作记录默认开启** | v0.7.1 之后的首个版本 | 无需任何设置，Agent 对 **PR / Issue 的写操作**就会开始落本地 JSONL（人话摘要 + 仓库 + 风险 + 成败），驾驶舱与右栏出现 `🕘` 入口 | 设置 →「🕘 操作记录与审核」→ 关掉「启用操作记录」（关后不再写盘、启动也不加载历史，历史文件仍留在本地可清空）；预算 1–64 MB 可调 | 默认开 = 新的本地磁盘写入。用户有权在第一次写盘前知道文件在哪（`~/.dsh/data/dsh-github-flow/audit/` 目录，每进程一个段文件）、占多少（默认 8 MB 上限，各段合计）、记什么（只记写、只记 PR/Issue） |
| 记录的**作用域** | 同上 | 只覆盖 `github_pr` / `github_issue` 两个工具的**写**操作；其余 17 个工具不记录，它们的删除仍走各自的 `confirm` 闸门 | 无需操作 | 避免"我明明开着记录，为什么 `release delete` 没有记录"这类误判 |
| 🛡️ **审核弹窗默认开启**（`仅高危`档） | v0.7.1 之后的首个版本 | 默认档位下，Agent 要**合并 / 关闭 / 删除 / 迁移** PR 或 Issue 时，会先弹出 **DSH 官方审核弹窗**接管输入区（批准才执行；拒绝则工具当场失败，模型被要求先确认意图）。批准过的调用不会再要 `confirm: true` | 设置 →「🕘 操作记录与审核」→ 改档位：`关闭` / `仅高危` / `全部写操作`（立即生效）。**注意**：DSH 权限预设为 `danger-full-access` 时宿主固定策略为 `never`，审核整体不生效，回退到原来的 `confirm: true` 二次确认 | 这是**新的阻塞式交互**——用户的会话会停下来等人点一下。默认开是因为"高危写操作先问一句"比"事后发现合错了"便宜；但必须让用户知道弹窗来自哪里、去哪关、以及为什么切了预设就不弹 |
| 审核与操作记录的**解耦** | 同上 | 关掉「启用操作记录」后，审核弹窗**仍然会出现**（v1 的设计是"关闭记录即停用审核"，已作废） | 想连审核一起停：改审核档位为 `关闭`，不是关记录 | 旧文案曾写"关闭记录时审核自动停用"。审批的权威审计在宿主的会话日志里（`approval/asked` + `approval/decided`），不依赖本插件的 JSONL，所以两条链路必须能各自独立关闭 |
| 🕘 **记录改为分段落盘**（s3） | v0.7.1 之后的首个版本 | 记录文件从单个 `~/.dsh/data/dsh-github-flow/audit.jsonl` 变成目录 `~/.dsh/data/dsh-github-flow/audit/` 下的**每进程一个段文件**（`audit.<pid>-<时间>-<序号>.jsonl`）。旧文件在升级后**首次启动时自动迁进段文件并删除**，历史不丢；界面上仍是同一条合并列表，只是「已用 x MB」现在按各段合计计算 | 无需操作。想看原始文件就进那个目录；关记录 / 清空的行为完全不变 | 用户可能自己备份或脚本读取过那个固定的 `audit.jsonl` 路径——路径变了必须提前说，否则他的备份脚本会静默读到空 |
| 🛡️ **按仓库 / 按操作覆盖审核档位**（s3） | v0.7.1 之后的首个版本 | 设置 →「🕘 操作记录与审核」多了一个规则框：每行一条 `维度:值=档位`（如 `repo:owner/name=off`）。**默认是空的**，所以不写规则时行为与升级前完全一致 | 清空规则框即可回到纯三档行为；写错的行会被忽略并在框下标出原因 | 这是**新增表达力**而非改默认值。但"规则存在却不生效"是最坏的失效形态，所以解析失败必须显式回显，且规则格式需要一处权威说明（README + 设置页问号 + 使用指南） |
| 🐛 **操作记录只显示 PR / Issue**（记录条数会变少） | v0.7.1 之后的首个版本 | 「🕘 操作记录」的列表与「工具」下拉里，**不再出现 `github_api` 等 PR / Issue 之外的调用**。早期版本（首版到 v0.7.1 之间的某次收窄）只改了写入侧、没改读取侧，那些历史行一直显示在列表里；本次在装载期按作用域过滤，并会在下次压缩时从磁盘清掉 | 无需操作。记录作用域从首版起就是产品定义（总纲 §一），只是读取侧此前漏了过滤 | 用户会看到"记录从 8 条变 7 条"。**不告知就会被当成数据丢失**——而那几条按定义本来就不该存在（它们是早期版本记录过的读操作/其它工具调用） |
| ⬆️ **记录条数的另一处变化**：作用域外的历史行不再计入「共 N 条」与「已用 x MB」 | 同上 | 底部用量与条数会同步变小；清理发生在下次压实（删除 / 清空 / 超预算重写）时 | 无需操作 | 同上：数字变小必须能解释，否则会被当成 bug 上报 |

