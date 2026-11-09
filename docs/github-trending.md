# GitHub 热点看板

在插件原有 GitHub 主页面顶部点击 **🔥 热点看板**，进入每日 / 每周 / 每月榜单；点击 **← 返回工作台** 返回原页面。原页面正在加载、未登录 GitHub 或数据获取失败时，入口仍可使用。

## 配置

推荐直接打开原插件页面的 **⚙️ 设置 → 🔥 Firecrawl**，粘贴 API Key 并点击“保存 API Key”。保存后立即生效，无需重启；热点看板会重新加载。未配置时也可以从看板点击“配置 Firecrawl”直达该分区。

- 密码输入框不回显已保存值；留空不会覆盖，填写新值可替换。
- “清除已保存 Key”删除界面保存的凭证，如果环境变量仍有 Key 则回退到环境变量。
- Key 仅保存在 DSH 服务端 `~/.dsh/data/dsh-github-flow/firecrawl-settings.json`，不写入浏览器 localStorage。文件以 0600 权限原子保存（POSIX）；它是本地明文凭证文件，不是系统密钥链，Windows 文件访问由用户目录 ACL 控制。
- 配置接口只返回是否已配置及来源，不返回 Key。保存操作不额外调用 Firecrawl、不消耗抓取额度，也不等于已经验证 Key 有效。

也可以继续使用环境变量方式：在**启动 DSH 的进程环境**中设置 `FIRECRAWL_API_KEY`，然后重启 DSH。界面保存值的优先级更高。

macOS / Linux（当前终端启动 DSH 时继承）：

```bash
export FIRECRAWL_API_KEY='你的 Firecrawl API Key'
```

Windows PowerShell（当前终端启动 DSH 时继承）：

```powershell
$env:FIRECRAWL_API_KEY = '你的 Firecrawl API Key'
```

如果使用桌面应用、服务或容器启动 DSH，需要在对应启动环境配置变量，而不是仅在无关终端设置。容器可通过 Compose 的 `environment` / `env_file` 注入。

可选插件配置（合并到现有插件的 `config` 中）：

```yaml
config:
  firecrawlBaseUrl: 'https://api.firecrawl.dev'
  trendingCacheTtlMs: 10800000
  trendingTimeoutMs: 60000
```

`firecrawlBaseUrl` 是服务根地址，不带 `/v2/scrape`；也可用 `FIRECRAWL_BASE_URL` 环境变量指定，插件配置优先。自托管服务须兼容 Firecrawl v2 的 JSON schema 提取，纯 HTML 抓取部署还需要配置其结构化提取所需的模型。自托管允许不带 API Key，若服务要求认证则仍设置 `FIRECRAWL_API_KEY`。

未配置云服务 Key 时显示配置入口，不影响原来的 GitHub 工作流。配置状态接口不返回密钥。热点使用 Node fetch，遵循宿主进程当前的 fetch dispatcher；原插件的代理可用性限制同样适用。

## 六字段契约

Firecrawl 使用 `/v2/scrape` 的 `formats: [{ type: 'json', schema, prompt }]`，从 `data.json.repositories` 读取项目数组。每个项目固定只有以下六个字段，HTTP、Agent 工具和看板共用同一契约。

| 字段 | 类型 | 含义 |
|---|---|---|
| name | string | owner/repo |
| url | string | GitHub 项目 HTTPS 链接 |
| description | string | 原始简介，无简介为空字符串 |
| language | string 或 null | 主语言 |
| stars | 非负整数或 null | 总 Star |
| starsToday | 非负整数或 null | **当前所选周期新增** |

`starsToday` 在日榜代表今日新增、周榜代表本周新增、月榜代表本月新增，字段名固定不变；UI 表头随周期变化。统计周期沿用 GitHub Trending，不做自然日/周/月的重新计算。页面缺失的数值显示 `—`，不会伪造为零。

列表按上述六字段顺序展示，保留 GitHub 原榜顺序。数据默认缓存三小时；面板挂载、切换周期和 Agent 工具调用（`refresh` 为 false）**都先过缓存**，只有缓存过期（或为空）才会真正请求 Firecrawl；点“刷新榜单”是唯一跳过缓存、立即重抓并消耗额度的入口。每周期独立缓存，并发请求合并。刷新失败继续显示上次成功数据并标注时间与警告。缓存同时落盘到 `~/.dsh/data/dsh-github-flow/trending-cache/<period>.json`（0600），因此热重载或重启应用后仍按剩余 TTL 复用；落盘内容每次读取都会重新走六字段校验，损坏或版本不符的文件按“无缓存”丢弃。不后台定时抓取。

## Firecrawl Agent 趋势洞察

三个周期的榜单右侧各有一个独立的 **AI 趋势洞察** 卡片。点击“生成趋势洞察”后，插件通过服务端 `POST /v2/agent` 发起 Firecrawl Agent 任务；浏览器通过本地 `/api/github/trending-agent` 的 `status` 操作轮询服务端，由服务端查询 `GET /v2/agent/{jobId}`。页面不暴露 Firecrawl Key 或任意远端任务 ID。

- **自动生成**：榜单抓取成功后自动发起分析；重复查看同一周期快照不重复创建任务。
- **周期隔离**：每日、每周、每月独立保存分析任务与结果，基于各自的榜单抓取快照。重复点击已创建任务不重复消耗 Agent 启动额度。
- **结果展示**：右侧显示中文趋势总结、观察与发现，以及加载中 / 出错状态。Agent 分析失败不会影响榜单本身。
- **数据契约**：项目表格仍只有固定的 `name / url / description / language / stars / starsToday` 六字段。分析位于独立对象，不加入项目行。
- **刷新行为**：抓取到新榜单快照后才允许新任务；同一快照默认沿用已有分析。服务重启后内存中的任务与结果会丢失。
- **服务兼容**：自托管 Firecrawl 需要额外支持 `/v2/agent` 和 `/v2/agent/{jobId}`，仅支持 Scrape 的部署仍可正常显示榜单，但 Agent 分析不可用。

页面风格采用圆角卡片、层级留白、柔和边框、系统字体与 DSH 主题变量，深色模式跟随 `body[data-ds-dark-theme]`；窄屏下洞察卡片移至表格下方。

## 项目简介中英双语

热点看板提供全局的 **中文 / English** 简介切换。默认显示中文；English 显示 GitHub Trending 原始简介，保留完整原文与原有排名。

- Firecrawl Scrape 的 `description` 字段始终保存**原始英文（或 GitHub 原有语言）**，固定六字段 schema 不变。
- 榜单抓取成功后，自动运行的 **同一个 Firecrawl Agent 任务**同时负责趋势总结与简介中文翻译，不额外为每行发起 Agent 任务。
- 翻译以抓取时的原始简介为依据，按 `owner/repo` 映射到独立的 `insight.descriptionsZh`，不会修改列表数据、排序或工具契约。
- 中文翻译尚未返回、Agent 失败、原文为空或个别项目漏译时，**只对对应项目回退原始简介**，不伪造翻译、不影响英文切换。
- 翻译结果与当前周期的 Agent 分析任务共同缓存；刷新获得新榜单后重新生成。

## Agent 工具

```text
github_trending({ period: "daily" })
github_trending({ period: "weekly", refresh: true })
github_trending({ period: "all" })
```

`all` 返回三张表，单周期失败不影响其余结果。默认全量档位包括该工具；精简档位显式加入：

```yaml
toolsets: ['core', 'github_trending']
```

工具兼容 `read_only`，无需 gh 登录或当前工作区仓库。

## 开发与安装 Fork

```bash
git clone https://github.com/ItQianChen/dsh-github-flow.git
cd dsh-github-flow
pnpm install --frozen-lockfile
pnpm run build
pnpm test
```

插件包名与服务名继续使用 `dsh-github-flow`，便于替换现有安装。按 README 的“本地开发与联调热重载”方式，将当前 DSH Profile 中的插件指向此源码目录；后端修改后重启 DSH，前端强制刷新。

在本地源码开发时，注意不要同时加载 npm 版与源码版，否则服务、路由和 UI 槽位会冲突。可设置 `checkUpdate: false` 关闭更新提示，但这不禁用显式升级操作。

## 验证

`pnpm test` 包括六字段校验、三个周期映射、缺失数值、缓存/强制刷新、并发去重、失败保留缓存、密钥不回显、跨站请求拒绝、卸载取消、工具部分失败等测试。真实 Firecrawl 连通与额度需在配置有效 Key 的 DSH 环境验证。

## 抓取模式与额度

两种模式都由**一次请求**产出榜单、中文译文和总结，区别只在用哪个接口，以及条数与丰富度。

| 模式 | 接口 | 实测消耗 | 实测耗时 | 条数 |
| --- | --- | --- | --- | --- |
| `scrape`（默认） | `POST /v2/scrape` + JSON 抽取 | 5 credits | 约 40s | 9 |
| `agent` | `POST /v2/agent` + 轮询 | 24–39 credits | 约 100s | 15 |

**切换方式：插件页面「⚙️ 设置 → 🔥 Firecrawl → 抓取模式」**，选完立即生效并持久化到 `~/.dsh/data/dsh-github-flow/firecrawl-settings.json`，无需重启；切换会清空缓存，因为两种模式产出的榜单不可复用。

未在界面选过时，回落到 plugin config 的 `trendingSource`（默认 `scrape`）：

```yaml
config:
  trendingSource: scrape       # scrape | agent，仅在界面未选过时生效
  trendingAgentTimeoutMs: 180000   # 仅 agent：整个任务预算，含轮询
  trendingAgentMaxCredits: 300     # 仅 agent：单次任务额度上限
```

两种模式互斥：`scrape` 模式下右侧总结也由 scrape 产出，**任何路径都不会调用 Agent**；`agent` 模式下榜单与洞察都由 Agent 任务产出，不会回落到 scrape（除非 Agent 失败自动降级）。

- `scrape` 的译文直接写在每条记录的 `descriptionZh` 里，服务端拆成 sidecar 后再走六字段校验，行数据不会被污染；总结与观察来自同一次抽取，因此**一个周期只花 5 credits**，三个周期共 15。
- 抽取结果不合法或总结为空时，只丢洞察、保留榜单，并用 `insightMode: 'scrape'` 标记「本次已经尝试过总结」，前端不会因此再偷偷起一个付费的 Agent 任务。
- `agent` 模式条数更多、洞察更丰富，适合想要质量而非省额度的场景；它失败（超时 / 402 / 任务失败 / 输出不合法）会**自动回退**到 `/v2/scrape`，榜单照常出来，并在 `warning` 里说明原因。
- 两种模式都会把 `"12,345"` 这类展示串归一化成整数再校验；前端请求超时统一放宽到 300s。
