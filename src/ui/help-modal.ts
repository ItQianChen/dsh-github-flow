declare const React: any;

/**
 * 独立沉浸式指南大窗口组件 (Dedicated Large Reader Modal)
 *
 * 核心设计理由与交互契约：
 * 1. 彻底从设置小窗口剥离，打造 920px 宽屏、85vh 高度的沉浸式阅读视界；
 * 2. 深度适配 DSH 主题系统，全套样式基于 CSS 类与主题变量，支持深色 (data-ds-dark-theme) 与浅色无缝自适应；
 * 3. 拒绝技术自嗨清单，从用户行动视角组织：3分钟快速上手、Agent实战Prompt、双界面图解与常见排错；
 * 4. 宽屏卡片排列，配备 Prompt 一键复制到剪贴板与短暂反馈气泡；
 * 5. 监听键盘 Esc 键与遮罩点击秒关，复制完指令直接回到聊天输入框发送，零打扰、不中断工作流。
 *
 * 【内容与代码同步的纪律】
 * 本文件里出现的工具数量、action 数量、Tab 名称、按钮文案，全部以当前代码为准：
 * 工具矩阵 = src/main.ts 的 19 处 ctx.tools.register；
 * Tab 布局 = src/client.ts 的 TAB_DEFS 与 src/ui/workspace-panel.ts 的四个标签；
 * 若后续增删工具或 Tab，必须同步改这里，否则用户会照着过时说明去找不存在的入口。
 */
export function GithubHelpModal(props: {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
}) {
  if (!props.isOpen) return null;

  var [activeTab, setActiveTab] = React.useState(props.initialTab || "quickstart");
  var [copiedIdx, setCopiedIdx] = React.useState(-1);

  React.useEffect(function () {
    if (props.isOpen && props.initialTab) {
      setActiveTab(props.initialTab);
    }
  }, [props.isOpen, props.initialTab]);

  React.useEffect(function () {
    var onKeyDown = function (e: any) {
      if (e.key === "Escape" || e.keyCode === 27) {
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return function () { window.removeEventListener("keydown", onKeyDown); };
  }, [props.onClose]);

  var handleCopy = function (text: string, idx: number) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(function () { setCopiedIdx(-1); }, 2000);
    } else {
      prompt("请复制提示词：", text);
    }
  };

  var h = React.createElement;

  // 1. 顶部 Tab 导航项
  var tabs = [
    { id: "quickstart", label: "🚀 3分钟极速上手" },
    { id: "prompts", label: "🤖 Agent 提示词实战" },
    { id: "panels", label: "🖥️ 两大界面操作图解" },
    { id: "tools", label: "🧰 19 大工具速查" },
    { id: "faq", label: "🔑 常见自愈排错" },
  ];

  // 2. 渲染各 Tab 独立视图
  var renderContent = function () {
    if (activeTab === "quickstart") {
      return h("div", null,
        h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "16px" } },
          "欢迎使用 DSH GitHub Flow！本插件让 DeepSeek Harness Agent 具备直接操作 GitHub 仓库的能力，同时为你提供沉浸式的本地与云端协作工作台。跟着下面 3 步即可快速跑通你的第一个人机协作研发闭环："
        ),
        [
          {
            step: "1",
            title: "确认 GitHub CLI 登录状态",
            desc: "本插件直接复用宿主机已有的安全登录态，绝不触碰任何明文 Token。",
            actionText: "操作方式：在 DSH 任意聊天框输入 /gh 直接按回车；或查看右侧栏抽屉顶部的账号徽标。若显示未登录，在系统终端执行单行命令 gh auth login 即可完成授权。",
          },
          {
            step: "2",
            title: "打开你的代码仓库",
            desc: "在 DSH 中打开任何包含 .git 的项目文件夹，插件将自动毫秒级绑定当前仓库上下文。",
            actionText: "无需每次告诉 Agent 仓库叫什么名字，插件底层已自动完成 CWD 工作区绑定，提单与审查均精准面向当前项目。\n若当前是 Fork 仓库，右侧栏顶部会显示血缘行，可一键在「我的复刻」与「上游主干」之间切换基准仓库。",
          },
          {
            step: "3",
            title: "直接向 Agent 下达工作指令",
            desc: "像和资深研发搭档协作一样，在聊天输入框中直接吩咐 Agent 处理日常 GitHub 任务。",
            actionText: "初次体验试一试直接对 Agent 说：\n👉 \"查看当前仓库有哪些开放的 PR，总结下改动要点\"",
          },
        ].map(function (s, i) {
          return h("div", { key: i, className: "dsh-github-help-card", style: { display: "flex", gap: "14px", alignItems: "flex-start" } },
            h("div", { className: "dsh-github-help-step-badge" }, s.step),
            h("div", { style: { flex: 1 } },
              h("div", { className: "dsh-github-help-title", style: { marginBottom: "4px" } }, s.title),
              h("div", { className: "dsh-github-help-desc", style: { marginBottom: "6px" } }, s.desc),
              h("div", { style: { fontSize: "12px", lineHeight: "1.6", whiteSpace: "pre-line", color: "inherit" } }, s.actionText)
            )
          );
        }),
        // 能力总览：让用户三秒钟知道这插件到底能干什么，而不是去翻 README
        h("div", { className: "dsh-github-help-card", style: { marginTop: "4px" } },
          h("div", { className: "dsh-github-help-title", style: { marginBottom: "8px" } }, "📦 能力总览：19 大工具 · 106 个业务动作 · 2 套可视化工作台"),
          h("div", { style: { fontSize: "12px", lineHeight: "1.8", color: "var(--dsw-alias-label-secondary, #8b949e)" } },
            "Agent 侧可直接调用 19 个 github_* 工具（PR 审查合并、Issue 任务流转、Actions 排障、免 clone 读文件、发版交付、Secrets 管理、Skills 生态、标签与规则集、构建缓存、Gist、跨仓待办大盘、Copilot 智能体、Discussions、Projects v2、Codespaces、运行时遥测与元指南）。",
            h("br"),
            "人类侧在每个会话右侧栏拥有 5 个 Tab（Git / 未提交 / PR / Issues / Actions），在最左侧 Octocat 入口拥有 4 个标签的全景驾驶舱。"
          )
        )
      );
    }

    if (activeTab === "prompts") {
      var promptCards = [
        {
          title: "🔀 场景一：自动创建 PR 并发起代码审查",
          desc: "本地写完代码或实现新功能后，无需打开浏览器手动点点点，让 Agent 自主完成端到端提单。",
          prompt: "帮我把当前分支创建一个 PR，标题简明概括改动要点，附带详细描述",
          aiAction: "Agent 自动检查本地当前分支、比对与主干的 diff、推送到远程仓库并创建 GitHub PR，附带优雅的改动说明与关联标记。",
        },
        {
          title: "🚨 场景二：CI / Actions 门禁报错秒级排查与自动修复",
          desc: "构建挂了不用在网页反复翻几十页日志，直接吩咐 Agent 定位报错步骤并就地改代码。",
          prompt: "检查当前仓库最近一次 CI 失败的原因，精确定位报错步骤并帮我尝试修复代码",
          aiAction: "Agent 自动调用失败日志探测工具，秒级提取具体挂掉的构建步骤输出，精准定位语法/单测异常并就地修改本地代码。",
        },
        {
          title: "📌 场景三：早会与每日任务待办盘点",
          desc: "晨会前或开始工作时，一键拉取名下所有关联事项，做到心中有数。",
          prompt: "帮我看看今天在 GitHub 上分配给我的 Issue 待办与等待我评审的 PR，汇总近期动态",
          aiAction: "Agent 自动在账号维度跨仓库聚合所有分配给你的议题、等待评审的拉取请求以及提及你的动态，输出整洁紧凑的待办看板。",
        },
        {
          title: "🛡️ 场景四：代码差异 (Diff) 安全审查与重构建议",
          desc: "合并前把好最后一关，让大模型充当资深 Tech Lead 开展多维度代码走查。",
          prompt: "审查当前分支与主干的代码差异 (diff)，检查是否存在潜在 Bug 或安全隐患并给出重构建议",
          aiAction: "Agent 自动获取改动文件与行级差异，结合工程最佳实践逐项排查边界条件、内存泄漏、空指针与安全漏洞。",
        },
        {
          title: "📝 场景五：从用户报障截图直接定位问题",
          desc: "用户提的 Issue 里贴了崩溃截图，Agent 可以直接「看」图，不用你手抄报错信息。",
          prompt: "查看 Issue #42 的正文与截图，判断是哪个模块出的问题并给出修复方案",
          aiAction: "Agent 调用 github_issue(view_images) 把正文与评论里的图片下载到本地并转为可读图像内容块，结合文字描述一起分析。",
        },
        {
          title: "🏷️ 场景六：批量标签治理与跨仓库同步",
          desc: "新仓库要配一套和主仓库一致的标签体系，手点太慢。",
          prompt: "把 A 仓库的标签体系克隆到当前仓库，然后给所有 open 的 bug Issue 打上 triage 标签",
          aiAction: "Agent 调用 github_label(clone) 复制标签颜色与描述，再按条件批量追加标签；删除类高危操作前会先返回影响评估要求你确认。",
        },
        {
          title: "💬 场景七：团队方案提案与开源 RFC 研讨",
          desc: "需要和团队讨论架构思路或征集想法时，直接将讨论沉淀在 GitHub Discussions 知识库中。",
          prompt: "在当前仓库发起一个关于 '优化前端构建性能' 的 RFC 讨论方案",
          aiAction: "Agent 自动调用 Discussions 工具在指定分类下发起主题，格式化排版技术方案正文，并返回可供团队直达探讨的链接。",
        },
      ];

      return h("div", null,
        h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "14px" } },
          "以下精选了开发者日常研发中最高频的 7 大真实协作场景。点击卡片右侧的「📋 一键复制」按钮，直接粘贴到聊天输入框发给 Agent 即可："
        ),
        promptCards.map(function (c, idx) {
          var isCopied = copiedIdx === idx;
          return h("div", { key: idx, className: "dsh-github-help-card" },
            h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" } },
              h("div", { className: "dsh-github-help-title" }, c.title),
              h("button", {
                className: "dsh-github-btn-sm",
                onClick: function () { handleCopy(c.prompt, idx); },
                style: {
                  padding: "4px 10px",
                  fontSize: "12px",
                  background: isCopied ? "#2ea043" : "var(--dsw-alias-link, #0969da)",
                  color: "#ffffff",
                  borderColor: isCopied ? "#2ea043" : "var(--dsw-alias-link, #0969da)",
                  fontWeight: 600,
                  transition: "all 0.2s ease",
                },
              }, isCopied ? "✅ 已复制到剪贴板！" : "📋 一键复制 Prompt")
            ),
            h("div", { className: "dsh-github-help-desc", style: { marginBottom: "10px" } }, c.desc),
            h("div", { className: "dsh-github-prompt-box" }, `"${c.prompt}"`),
            h("div", { style: { fontSize: "11px", color: "var(--dsw-alias-state-attention-primary, #d29922)", lineHeight: "1.4" } }, "💡 " + c.aiAction)
          );
        })
      );
    }

    if (activeTab === "panels") {
      return h("div", null,
        h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "16px" } },
          "插件为人类开发者量身打造了两套互补的可视化工作台，消灭频繁在 VS Code、终端与浏览器切屏的上下文丢失痛点："
        ),
        [
          {
            title: "1. 全景驾驶舱 (Main Dashboard) —— 掌控全局资产 · 4 个标签",
            items: [
              "打开入口：点击 DSH 最左侧主导航栏的 Octocat 猫咪徽标，瞬间全屏展开；",
              "SWR 0ms 瞬间秒开：采用本地持久化快照体系，打开界面零转圈、零等待；",
              "📂 本地工作区矩阵：一屏透视本机所有项目与远程仓库的关联状态、分支领先/落后、未提交文件数；",
              "☁️ 我的 GitHub 仓库：名下全部仓库、默认分支与 Star 状态，支持关键词搜索；",
              "🔀 Pull Requests：默认展示「全部」，顶部胶囊可切 🟢 Open / 🟣 Merged / ⚪ Closed 并显示各档计数；点击任一卡片在线唤起 PR 审阅工作台；",
              "📝 任务与待办 Issues：三维分类（📥 用户提单 / 🎯 指派待办 / ✍️ 我发起的），点击卡片在线查看 Issue 详情；",
              "右下角长期驻留 使用指南 / ⚙️ 设置 两个入口，设置内含数据同步、网络代理、更新源与关于四个分区。",
            ],
          },
          {
            title: "2. 会话右侧栏面板 (Sidebar Panel) —— 深度协同当前工作区 · 5 个 Tab",
            items: [
              "打开入口：位于每个会话工作区的右侧抽屉栏，深度锁定当前会话的物理 Git 仓库；",
              "仓库身份与切换：顶部展示当前关联仓库、Fork 血缘行与权限徽章（只读/可写）；若配置了多个 remote，可通过 RepoSelectorDropdown 下拉一键切换基准仓库；",              "Git Tab：三段式提交时间线（待推送 / 待拉取 / 最近），默认 15 条、下滑触底自动加载；点任意提交行弹出完整 Commit 详情；",
              "未提交 Tab：实时监听本地未提交文件与状态码（?? 新增 / M 修改 / D 删除 / R 重命名），点击文件可就地下钻查看该文件的 Unified Diff；",
              "PR Tab：展示全部 PR 并按状态过滤；带三态 CI 门禁、冲突检测、审核判定与 Draft 标示；点击卡片在线唤起 PR 审阅工作台（描述 / 评论 / 文件 Diff 双栏比对）；",
              "Issues Tab：展示全部 Issue 并按状态过滤；点击卡片在线查看详情（Markdown 正文 / 评论时间线 / 标签色块 / 里程碑 / 关联 PR / 隐藏评论标注）；",
              "Actions Tab：最近工作流运行记录与触发方式；点击卡片在线查看本次运行的 job / step 树与失败步骤，失败时可按需提取日志片段（慢链路，最长 60 秒）；",
              "动静解耦架构：修改本地代码只定向查询本地 .git 核心元数据（耗时仅 5ms），绝对不发起远端网络请求，杜绝网络风暴。",
            ],
          },
          {
            title: "3. 两个弹窗的通用操作习惯",
            items: [
              "PR / Issue 弹窗都支持：按 Esc 或点击遮罩关闭、右上角「📋 复制链接」、「↗ 浏览器打开」直达 GitHub；",
              "列表卡片上的「GitHub ↗」按钮是独立的浏览器外跳入口，点它不会触发弹窗（已做事件隔离）；",
              "PR 弹窗的文件区可拖拽分隔条调宽、双击或点 ◀ 折叠；布局偏好会记在本地，下次打开保持原样；",
              "长评论默认折叠（显示「⌄ 展开全部」），PR/Issue 正文默认展开——避免一屏被一段超长文字占满。",
            ],
          },
        ].map(function (sec, idx) {
          return h("div", { key: idx, className: "dsh-github-help-card" },
            h("div", { className: "dsh-github-help-title", style: { marginBottom: "8px" } }, sec.title),
            h("ul", { style: { margin: 0, paddingLeft: "18px", fontSize: "12px", lineHeight: "1.7", color: "var(--dsw-alias-label-secondary, #8b949e)" } },
              sec.items.map(function (it, i) { return h("li", { key: i }, it); })
            )
          );
        })
      );
    }

    if (activeTab === "tools") {
      var toolGroups = [
        {
          group: "日常研发主力",
          items: [
            { name: "github_pr", desc: "PR 全生命周期：列表/详情/diff/checks/create/merge/review/ready/update_branch/revert/preview/checkout，含行级评论与附件上传" },
            { name: "github_issue", desc: "Issue 任务流转：list/view/create/comment/edit/close/reopen/develop/transfer/pin/lock/delete/status，含截图查看 view_images" },
            { name: "github_run", desc: "Actions 排障：list/view/log_failed（失败步骤日志秒级提取）/rerun/cancel/trigger/download 与 workflow 启停" },
            { name: "github_repo", desc: "仓库元数据、免 clone 读文件（read_file/read_dir）、跨仓检索（code/issues/prs/commits）、Fork 同步" },
          ],
        },
        {
          group: "交付与配置",
          items: [
            { name: "github_release", desc: "发版历史、自动生成说明、创建 Release、上传/下载构建资产" },
            { name: "github_secret", desc: "Actions Secrets 与 Variables：列表/设置/删除（密文经 stdin 通道，绝不进命令行）" },
            { name: "github_label", desc: "标签体系 CRUD 与跨仓库一键克隆（删除需 confirm）" },
            { name: "github_ruleset", desc: "分支保护规则集查看与「为什么这个 PR 不能合」的策略排障" },
            { name: "github_cache", desc: "Actions 构建缓存盘点、按 Key/ID 删除与全量清空（高危需 confirm）" },
          ],
        },
        {
          group: "生态与协作",
          items: [
            { name: "github_skill", desc: "Agent Skills 生态：跨仓检索/预览/安装/发布自检/批量更新" },
            { name: "github_status", desc: "账号维度跨仓待办大盘 + 运行时健康度与 API 降级率审计" },
            { name: "github_agent_task", desc: "Copilot 云端编码智能体：派活、查状态、拉会话日志" },
            { name: "github_discussion", desc: "社区讨论与 RFC：列表/详情/发起/编辑/评论" },
            { name: "github_project", desc: "Projects v2 看板：项目列表、条目增删与草稿任务" },
            { name: "github_codespace", desc: "云端开发机：列表/详情/停止（防计费）/销毁" },
            { name: "github_gist", desc: "代码片段与排障留痕：创建 Secret Gist、查看、编辑、删除" },
          ],
        },
        {
          group: "兜底与元能力",
          items: [
            { name: "github_api", desc: "REST / GraphQL 逃生门，支持 --jq 过滤与 raw 原文模式" },
            { name: "github_help", desc: "全景命令映射、官方语法速查与 gh 报错自愈指引" },
          ],
        },
      ];

      return h("div", null,
        h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "14px" } },
          "19 个 Agent 工具、合计 106 个业务动作（不含元指南的 22 个查询主题与 api 逃生门的 4 个 HTTP method）。你不必记住工具名——直接用自然语言描述目标，Agent 会自己挑工具。下表用于你了解能力边界，以及排查「为什么 Agent 说做不到」："
        ),
        toolGroups.map(function (g, gi) {
          return h("div", { key: gi, className: "dsh-github-help-card" },
            h("div", { className: "dsh-github-help-title", style: { marginBottom: "8px" } }, g.group),
            g.items.map(function (t, ti) {
              return h("div", { key: ti, style: { display: "flex", gap: "10px", alignItems: "flex-start", padding: "5px 0", borderTop: ti === 0 ? "none" : "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.06))" } },
                h("code", {
                  style: {
                    flexShrink: 0,
                    width: "132px",
                    fontSize: "11px",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    color: "var(--dsw-alias-link, #0969da)",
                  },
                }, t.name),
                h("span", { style: { fontSize: "12px", lineHeight: "1.6", color: "var(--dsw-alias-label-secondary, #8b949e)" } }, t.desc)
              );
            })
          );
        }),
        h("div", { className: "dsh-github-help-card" },
          h("div", { className: "dsh-github-help-title", style: { marginBottom: "8px" } }, "⌨️ 人类 Slash 指令"),
          h("div", { style: { fontSize: "12px", lineHeight: "1.9", color: "var(--dsw-alias-label-secondary, #8b949e)" } },
            h("code", { className: "dsh-github-md-inline-code" }, "/gh"), " 或 ", h("code", { className: "dsh-github-md-inline-code" }, "/gh status"), " —— 账号与仓库健康度诊断（登录态、权限、网络、版本）；", h("br"),
            h("code", { className: "dsh-github-md-inline-code" }, "/gh upgrade"), " —— 一键跨平台自动升级插件；", h("br"),
            h("code", { className: "dsh-github-md-inline-code" }, "/gh help"), " —— 在聊天流中打印精简版指令与范例；", h("br"),
            "想看点状图文说明，就是当前这个窗口：右下角「📖 使用指南」。"
          )
        )
      );
    }

    if (activeTab === "faq") {
      var faqs = [
        {
          q: "Q1: 界面提示「未登录 GitHub」或「Authentication Required」怎么办？",
          a: "插件直接复用宿主系统的 GitHub CLI 登录态。请打开系统终端运行命令 `gh auth login`，依次选择 GitHub.com ➔ HTTPS ➔ 网页回车授权，一分钟内即可完成登录。登录完成后刷新界面即可自动识别。",
        },
        {
          q: "Q2: 提示「缺少权限 (Scope)」或「SCOPE_REQUIRED」怎么办？",
          a: "当调用项目看板（Projects v2）或云端开发机（Codespaces）时，GitHub 要求专有的 Token Scope。在系统终端执行对应的一键自愈命令完成增量授权即可（无需重新登录）：\n- 项目看板（只读）：`gh auth refresh -s read:project`\n- 项目看板（读写）：`gh auth refresh -s project`\n- 云端开发机：`gh auth refresh -h github.com -s codespace`",
        },
        {
          q: "Q3: 点了一键升级提示「处于 24h 安全保护期 (防投毒策略)」怎么办？",
          a: "这是 DSH 官方内置包管理器针对刚发布未满 24 小时新版本的供应链防投毒安全锁机制。\n- 立即体验：请先【完全退出关闭 DSH 应用程序】，然后在系统终端执行复制的手动安装命令；\n- 稍后升级：无需任何操作，新版本发版满 24 小时后，再次点击一键升级即可自动安装。",
        },
        {
          q: "Q4: 使用代理节点时偶尔出现网络波动怎么办？",
          a: "插件内置了 1s ➔ 2s ➔ 4s 的阶梯指数退避重试机制。代理节点若发生短时抖动断流，系统会自动在后台静默发起自愈重试，在节点恢复后瞬间平滑拉取最新数据，不会立刻亮出大红横幅打扰你。同时电脑联网恢复瞬间也会自动触发静默更新。",
        },
        {
          q: "Q5: 右侧栏 PR / Issues 列表是空的，但 GitHub 网页上明明有记录？",
          a: "先看顶部状态胶囊是不是停在某个具体档位（例如「Merged」）而该档确实为零——点「全部」即可看到所有记录。\n若「全部」也是空的，通常是两类原因：\n- 仓库关闭了 Issues 功能：面板会给出「该仓库未开启 Issues」的确定性提示，这不是故障；\n- 当前工作区没绑定对仓库：看右侧栏顶部显示的是哪个仓库，若不对可在仓库下拉里切换基准，或检查 `.git/config` 的 remote 配置。",
        },
        {
          q: "Q6: 为什么改了代码，插件界面要重启 DSH 才生效？",
          a: "如果你是在开发这个插件本身：后端 HTTP 路由是在插件 `apply()` 时一次性注册到宿主的 WebServer 上的，`pnpm run build` 只更新磁盘产物，不会给已运行的进程热注册新路由。改完代码需重启 DSH 才能挂上新端点。\n若只是普通使用，请忽略此条——正常升级走一键升级即可。",
        },
      ];

      return h("div", null,
        h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "14px" } },
          "常见环境、权限与网络问题的排查与自愈指引："
        ),
        faqs.map(function (f, idx) {
          return h("div", { key: idx, className: "dsh-github-help-card" },
            h("div", { className: "dsh-github-help-title", style: { marginBottom: "6px", fontSize: "13px" } }, f.q),
            h("div", { className: "dsh-github-help-desc", style: { lineHeight: "1.6", whiteSpace: "pre-line" } }, f.a)
          );
        })
      );
    }

    return null;
  };

  return h(
    "div",
    { className: "dsh-github-modal-overlay", onClick: props.onClose },
    h(
      "div",
      {
        className: "dsh-github-help-dialog",
        onClick: function (e: any) { e.stopPropagation(); },
      },
      // 顶部标题栏
      h("div", { className: "dsh-github-help-header" },
        h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h("span", { style: { fontSize: "20px" } }, "📖"),
          h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 600, color: "inherit" } }, "DSH GitHub Flow · 使用指南与实战手册")
        ),
        h("button", {
          style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "var(--dsw-alias-label-secondary, #8b949e)", padding: "0 4px" },
          onClick: props.onClose,
          "aria-label": "关闭 (Esc)",
          title: "关闭 (Esc)",
        }, "✕")
      ),
      // 顶部分类 Segment 导航栏
      h("div", { className: "dsh-github-help-nav" },
        tabs.map(function (t) {
          var isActive = activeTab === t.id;
          return h("button", {
            key: t.id,
            className: "dsh-github-help-tab-btn" + (isActive ? " active" : ""),
            onClick: function () { setActiveTab(t.id); },
          }, t.label);
        })
      ),
      // 主内容滚动区
      h("div", { className: "dsh-github-help-scroll-body" }, renderContent()),
      // 底部工具栏
      h("div", { className: "dsh-github-help-footer" },
        h("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #8c959f)" } }, "💡 提示：按键盘 Esc 键可随时快速关闭大窗口返回会话"),
        h("button", {
          className: "dsh-github-btn-sm",
          style: { padding: "6px 16px", fontWeight: 600 },
          onClick: props.onClose,
        }, "关闭窗口")
      )
    )
  );
}
