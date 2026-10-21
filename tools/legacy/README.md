# tools/legacy · 历史手工脚本（不参与 CI）

这 5 个脚本是项目早期（phase1~phase3 之前）的手工验证脚本，**不在 `pnpm test` 里，也不被任何代码或文档引用**。

| 脚本 | 行数 | 当时用途 |
| :--- | ---: | :--- |
| `test-all-features.mjs` | 251 | 一次性跑全部工具的手工冒烟 |
| `verify-fixes.mjs` | 638 | 逐条核对修复项的手工清单 |
| `test-plugin.mjs` | 138 | 插件装配冒烟 |
| `test-upgrade-flow.mjs` | 127 | 升级链路手工验证 |
| `test-executor.mjs` | 29 | 执行器最小冒烟 |

## 为什么被移到这里

它们曾经躺在仓库根目录，占了产品第一屏——新人打开仓库会误以为「这就是测试」。而真正的测试是 `test/phase1..phase35`，由 `test/run-all.mjs` 编排，CI 也只跑那一套。

## 现在还能用吗

**不要用**。它们依赖的是当时的 `lib/` 产物形状与 CLI 契约，早已和现状脱节；保留只为留痕（例如想回看某个修复当时是怎么验的）。

需要验证什么，请写进对应的 `test/phaseNN.test.mjs`——那才会被 CI 执行。
