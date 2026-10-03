# npm 发布与版本维护指南 (npm Publishing Guide)

本文档面向维护者，详细记录了 `dsh-github-flow` 插件在 npm 公共注册表（[https://www.npmjs.com/package/dsh-github-flow](https://www.npmjs.com/package/dsh-github-flow)）上的发布流程、鉴权配置、版本更新与故障排查。

---

## 1. 快速发布三部曲

在项目根目录下，执行以下标准三步即可完成新版本发布：

```bash
# 1. 更新版本号（遵循语义化版本 Semantic Versioning）
# 例如发布补丁版本：0.1.0 -> 0.1.1
npm version patch

# 2. 全量编译与客户端产物净化
pnpm run build

# 3. 推送发布至 npm
npm publish --access public
```

由于 `package.json` 中配置了 `"prepare": "pnpm run build"` 和 `"publishConfig"`，发布过程会自动触发代码校验和编译，并强制发布至 npm 官方源。

---

## 2. 鉴权与 2FA 安全策略配置

npm 官方强制要求所有公开发布包的账号必须具备 **2FA 双重身份验证** 或配置有 **Bypass 2FA 权限的 Granular Access Token**。

### 方案 A：通过 Granular Access Token 实现免密秒发（推荐日常维护）

1. **生成专用发布 Token**：
   - 访问 [npm Token 管理页](https://www.npmjs.com/settings/~/tokens/create)；
   - **Token Name**：填写便于识别的名字，如 `dsh-github-flow-publish`；
   - **Expiration**：选择有效期（如 90 天）；
   - **Packages and scopes**：勾选 `Read and write` 并指定 `dsh-github-flow` 或所有包；
   - **关键选项**：勾选 **`Bypass two-factor authentication (2FA) for publishing`**；
   - 点击 **Generate Token** 并复制生成的字符串（形如 `npm_xxxxxxxxxxxx`）。

2. **本地环境绑定**：
   在本地终端执行一次配置绑定（或写入 `~/.npmrc`）：
   ```bash
   npm config set //registry.npmjs.org/:_authToken=npm_你的Token字符串
   ```
3. **后续发布**：
   配置完成后，后续运行 `npm publish` 无需任何二次验证弹窗或手机动态码，直接自动秒发。

---

### 方案 B：使用 Security Key (WebAuthn / Windows Hello)

如果采用账号交互式登录：
1. 在 [npm Account 设置页](https://www.npmjs.com/settings/~/account) 的 **Two-Factor Authentication** 区域开启 2FA；
2. 选择 **Security Key** 方式，直接绑定电脑的 **Windows Hello 指纹 / 开机 PIN 码**；
3. 发布时终端会提示确认，在系统弹窗中验证 PIN 码即可完成签名发布。

---

## 3. 常见问题排查 (Troubleshooting)

### Q1: 提示 `npm error code E403: Forbidden - Two-factor authentication...`
- **原因**：账号未开启 2FA，或使用的 Token 未勾选 `Bypass two-factor authentication (2FA) for publishing`。
- **解法**：参考上述第 2 节方案 A，重新生成带有 Bypass 2FA 的 Granular Access Token。

### Q2: 提示 `npm notice Log in on https://registry.npmmirror.com/`
- **原因**：本地全局 npm registry 指向了国内只读镜像（如淘宝源），镜像源不支持发布。
- **解法**：`package.json` 内已配置 `publishConfig.registry = "https://registry.npmjs.org/"`。如果仍有异常，执行命令显式指定：
  ```bash
  npm login --registry=https://registry.npmjs.org/
  npm publish --registry=https://registry.npmjs.org/
  ```

### Q3: 为什么版本号必须递增？
- npm 注册表出于安全性考虑，**严禁覆盖已发布的相同版本号**。每次代码修改发布前，必须递增版本号：
  - 修补 Bug：`npm version patch` (0.1.0 -> 0.1.1)
  - 新增特性：`npm version minor` (0.1.0 -> 0.2.0)
  - 重大重构：`npm version major` (0.1.0 -> 1.0.0)

---

## 4. 自动化 CI/CD 发布（可选 GitHub Actions）

若需要实现推送 Git Tag 自动触发 npm 发包，可在仓库创建 `.github/workflows/publish.yml`：

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install
      - run: pnpm run build
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```
*(在 GitHub 仓库 Settings -> Secrets 中添加 `NPM_TOKEN` 即可)*
