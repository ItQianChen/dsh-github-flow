# npm 发布与 GitHub Release 自动化发版指南

本文档详细记录 `dsh-github-flow` 插件在 npm 公共注册表（[https://www.npmjs.com/package/dsh-github-flow](https://www.npmjs.com/package/dsh-github-flow)）以及 GitHub Releases 上的发布流程、鉴权策略、版本规范，以及基于 **GitHub Actions 实现全自动构建、测试、推送 npm 与同步发布 GitHub Release** 的具体触发规则与安全机制。

---

## 1. GitHub Actions 自动化流水线架构与触发规则

本项目已在 [`.github/workflows/npm-publish.yml`](../.github/workflows/npm-publish.yml) 中配置了工业级的自动化 CI/CD 发包流水线（`Release & Publish to npm`）。

### 1.1 触发规则深度剖析 (Trigger Rules)

流水线设计了 **两种触发模式**，兼顾了版本规范性与调试灵活性：

| 触发模式 | 触发条件 | 语法定义 | 自动化执行内容 | 适用场景与安全保障 |
| :--- | :--- | :--- | :--- | :--- |
| **模式 A：Git Tag 语义化标签触发（推荐生产）** | 推送符合 `v*` 规则的版本标签 | `on.push.tags: ['v*.*.*', 'v*']` | **全套发布**：检出源码 ➔ 安装依赖 ➔ 全量构建 ➔ 校验产物 ➔ **带 Provenance 签名发布 npm** ➔ **自动创建并发布 GitHub Release（自动生成 Release Notes）** | **生产标准**：日常分支开发、合并 PR **不会**触发发包，彻底避免因版本号未变导致 npm 403 冲突；仅当打上发布标签时精准触发。 |
| **模式 B：手动调度触发（Workflow Dispatch）** | GitHub 网页 Actions 面板手动点击 | `on.workflow_dispatch` | **按需执行**：支持勾选 `dry_run`（预演模式），在不实际发布到 npm 与 Release 的情况下完整跑通 build 与打包流水线。 | **排错与测试**：用于在合入代码后快速验证 CI 构建与 npm 打包能否顺利通过。 |

#### 为什么不采用「代码 push 到 master 分支就自动发包」？
1. **npm 版本的不可篡改性**：npm 绝对禁止覆盖已发布的相同版本号。若每次 git push master 均发包，一旦开发者忘记递增 `package.json` 中的 `version`，CI 必定直接报错失败；
2. **发布意图明确**：通过 `git tag v0.1.1` 将代码快照、GitHub Release 与 npm 注册表版本三者完全对齐（1:1:1 映射），符合开源软件主流最佳实践。

---

### 1.2 GitHub 仓库密钥配置 (One-Time Setup)

在自动化工作流执行前，只需在 GitHub 仓库中配置一次 npm Token：

1. **获取 npm Granular Access Token**：
   - 登录 npm 访问：[https://www.npmjs.com/settings/~/tokens/create](https://www.npmjs.com/settings/~/tokens/create)；
   - 权限选择：**Packages and scopes** 勾选 `Read and write`；
   - **关键勾选**：勾选 **`Bypass two-factor authentication (2FA) for publishing`**；
   - 复制生成的 `npm_xxxxxxxxxxxx` 密匙。
2. **存入 GitHub Secrets**：
   - 打开 GitHub 仓库页面 ➔ 点击 **Settings** ➔ **Secrets and variables** ➔ **Actions**；
   - 点击 **New repository secret**：
     - **Name**：`NPM_TOKEN`
     - **Secret**：粘贴你刚刚复制的 `npm_` Token；
   - 点击 **Add secret** 保存。

> 注：创建 GitHub Release 使用的是 GitHub 官方内置的 `secrets.GITHUB_TOKEN`，工作流中已声明 `permissions.contents: write`，无需额外配置任何第三方 Personal Access Token。

---

### 1.3 自动发布操作三步走 (发布新版本日常流程)

配置好上述 Secret 后，日常发布新版本只需在本地终端运行：

```bash
# 第一步：递增版本号（自动修改 package.json 并生成对应 git commit 和 git tag）
npm version patch   # 修补 Bug: 0.1.0 -> 0.1.1
# 或者 npm version minor # 新增特性: 0.1.0 -> 0.2.0

# 第二步：将代码与标签推送到 GitHub
git push origin master --tags
```

**推送完成后**：
- GitHub Actions 会在 5 秒内自动感知到 `v0.1.1` 标签被创建；
- 启动 Ubuntu runner，全自动执行：
  `检出代码 ➔ 安装 pnpm ➔ 安装依赖 ➔ pnpm run build (编译 + 清理) ➔ 产物完整性校验 ➔ 带 Provenance 签名发布到 npm ➔ 自动创建并发布对应 GitHub Release`；
- 约 1 分钟后，npm 官网版本与 GitHub 仓库 Releases 页面同步更新！

---

## 2. 安全机制与 Provenance 产物溯源

流水线中配置了 `permissions.id-token: write` 与 `--provenance` 参数：
- **软件供应链安全**：通过 GitHub OIDC 向 npm 提供加密的签名凭据；
- **官方认证徽章**：发布到 npm 后的包页面将自动挂上绿色的 **`Verified`** 徽章，向用户证明此版本由 GitHub Actions 在干净沙箱中从本开源仓库公开构建产出，杜绝后门与供应链投毒。

---

## 3. 本地手动备用发布流程 (Local Fallback)

若遇到 GitHub Actions 宕机或需要紧急本地直发，可按以下流程：

```bash
# 1. 编译
pnpm run build

# 2. 本地绑定 Token
npm config set //registry.npmjs.org/:_authToken=npm_你的Token

# 3. 本地直接发布
npm publish --access public
```

---

## 4. 常见问题排查 (Troubleshooting)

### Q1: GitHub Actions 报错 `npm error code E403: Forbidden - Two-factor authentication...`
- **原因**：GitHub Secrets 中的 `NPM_TOKEN` 未勾选 `Bypass two-factor authentication (2FA) for publishing`。
- **解法**：在 npm 重新生成勾选了 Bypass 2FA 的 Granular Access Token，并更新 GitHub 仓库里的 `NPM_TOKEN` Secret。

### Q2: 报错 `403 You cannot publish over the previously published versions`
- **原因**：当前打 tag 的代码版本在 `package.json` 中的 `version` 已经被发布过了。
- **解法**：本地执行 `npm version patch` 递增版本号后再重新打 tag 推送。
