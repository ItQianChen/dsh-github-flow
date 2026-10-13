# 发版必改清单（版本硬编码核对表）

> 用途：每次升级版本号发布时，逐项核对本清单。共 **2 处必改 + 2 处顺手更新 + 4 处禁止改 + 2 处自动派生**。
> 忘改必改项的下场：build 直接失败（硬校验已拦截）；历史上 version.ts 漏改导致
> v0.2.0 全体用户看到"0.1.8→0.2.0"假更新横幅。

---

## 一、必改（2 处，必须严格一致）

| # | 文件 | 位置 | 当前值 | 说明 |
|---|---|---|---|---|
| 1 | [package.json](../package.json) | 第 3 行 `"version": "0.2.0"` | `0.2.0` | npm 发布版本、CI 取版来源 |
| 2 | [src/version.ts](../src/version.ts) | 第 9 行 `CURRENT_PLUGIN_VERSION = '0.2.0'` | `'0.2.0'` | 运行时版本比较基准（假横幅的教训来源） |

**两处必须同值**。`pnpm run build` 会硬校验（[scripts/build.mjs](../scripts/build.mjs) 的
`assertVersionConsistency`），不一致直接构建失败——但不要依赖拦截，发版前手动核对。

`lib/` 下同名编译产物（lib/version.js、lib/version.d.ts）**不用手改**：`pnpm run build`
从 src 重新编译生成。但**必须重新构建**，否则 npm 包里带的还是旧版编译产物（v0.2.0 事故
的另一半原因：发布时 lib/version.js 是 0.1.8 的旧产物）。

## 二、发版前顺手更新（2 处，示例版本号）

| # | 文件 | 位置 | 说明 |
|---|---|---|---|
| 3 | [docs/npm-publish-guide.md](../docs/npm-publish-guide.md) | 第 110 行 `dsh-github-flow@0.1.8` | 24h 供应链锁示例命令中的版本号，改成新版本（纯文档示例，不改不影响功能，但会误导用户复制到旧版本号） |
| 4 | [docs/UPGRADE-NOTES.md](../docs/UPGRADE-NOTES.md)（本文件） | 各表格"当前值"列 | 本清单自身的版本对照，发版后更新 |

## 三、禁止写死版本（4 处，用了占位符/常量——不要往里填具体数字）

| # | 文件 | 位置 | 现状 | 为什么不能填死 |
|---|---|---|---|---|
| 5 | [README.md](../README.md) | 第 67 行 `dsh-github-flow@<最新版本号>` | 占位符 | 每次发版都改会漏；占位符引导用户自己查最新版 |
| 6 | [README.en.md](../README.en.md) | 第 67 行 `dsh-github-flow@<latest-version>` | 占位符 | 同上（英文版） |
| 7 | [src/updater.ts](../src/updater.ts) | 所有 `CURRENT_PLUGIN_VERSION` 引用 | 常量引用 | 全部从 version.ts 导入，无一硬编码——升级只改 version.ts 一处即全局生效 |
| 8 | [src/commands/gh.ts](../src/commands/gh.ts) | `/gh status`、`/gh upgrade` 输出 | 常量引用 | 同上 |

## 四、自动派生（2 处，无需手动改，了解即可）

| # | 机制 | 说明 |
|---|---|---|
| 9 | CI 取版（.github/workflows/npm-publish.yml:62） | `VERSION=$(node -p "require('./package.json').version")`——从 package.json 读，无硬编码 |
| 10 | Git tag | `git tag v0.2.1` 手动打，值必须 = package.json 版本（tag 与 package.json 不一致时：CI 发布的 npm 版本以 package.json 为准，GitHub Release 标题以 tag 为准，出现两者错位） |

## 五、发版完整流程（含版本修改）

```powershell
# 1. 改版本（两处同值）
#    package.json  → "version": "0.2.1"
#    src/version.ts → CURRENT_PLUGIN_VERSION = '0.2.1'

# 2. 更新文档示例（docs/npm-publish-guide.md:110 的 @0.1.8 → @0.2.1）

# 3. 构建（版本一致性校验在此拦截漏改）+ 全量测试
pnpm run build
pnpm test    # 9 阶段全绿

# 4. 本机 e2e（必须先重启 DSH 桌面进程——Node 模块缓存，软链重建不注入运行中进程）
#    重启后验证：GET /api/github/check-update 的 currentVersion = 0.2.1

# 5. 提交 + 打 tag + 推送（tag 值 = package.json 版本）
git add -A
git commit -m "chore(release): v0.2.1"
git tag v0.2.1
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
