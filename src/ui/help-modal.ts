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
            actionText: "无需每次告诉 Agent 仓库叫什么名字，插件底层已自动完成 CWD 工作区绑定，提单与审查均精准面向当前项目。",
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
        })
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
          title: "💬 场景五：团队方案提案与开源 RFC 研讨",
          desc: "需要和团队讨论架构思路或征集想法时，直接将讨论沉淀在 GitHub Discussions 知识库中。",
          prompt: "在当前仓库发起一个关于 '优化前端构建性能' 的 RFC 讨论方案",
          aiAction: "Agent 自动调用 Discussions 工具在指定分类下发起主题，格式化排版技术方案正文，并返回可供团队直达探讨的链接。",
        },
      ];

      return h("div", null,
        h("div", { className: "dsh-github-help-desc", style: { fontSize: "13px", marginBottom: "14px" } },
          "以下精选了开发者日常研发中最高频的 5 大真实协作场景。点击卡片右侧的「📋 一键复制」按钮，直接粘贴到聊天输入框发给 Agent 即可："
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
            title: "1. 全景驾驶舱 (Main Dashboard) —— 掌控全局资产",
            items: [
              "打开入口：点击 DSH 最左侧主导航栏的 Octocat 猫咪徽标，瞬间全屏展开；",
              "SWR 0ms 瞬间秒开：采用本地持久化快照体系，打开界面零转圈、零等待；",
              "名下仓库一览：一屏透视名下所有 GitHub 仓库、默认分支与 Star 状态，支持一键切换工作区；",
              "三维待办 Issue 矩阵：智能划分「📥 用户提单（反馈到我名下仓库）」、「🎯 指派待办（分配给我）」与「✍️ 我发起的」，一键药丸筛选；",
              "全局配置中心：右上方提供数据同步节奏、网络代理与更新源的集中配置弹窗。",
            ],
          },
          {
            title: "2. 会话右侧栏面板 (Sidebar Panel) —— 深度协同当前工作区",
            items: [
              "打开入口：位于每个会话工作区的右侧抽屉栏，深度锁定当前会话的物理 Git 仓库；",
              "未提交改动 (Dirty Tab)：实时监听本地未提交文件列表与改动数量，开发改代码一目了然；",
              "分支查看与安全切换：点击分支名称下拉秒级搜索本地/远程分支；具备未提交变更安全拦截，杜绝代码被冲掉；",
              "Git 提交时间线 (Git Tab)：清晰三段式呈现待推送（领先）、待拉取（落后）与最近提交，点击任意提交行可弹出 Commit 完整详情弹窗；",
              "动静解耦架构：修改本地代码只定向查询本地 .git 核心元数据（耗时仅 5ms），绝对不发起远端网络请求，杜绝网络风暴。",
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

    if (activeTab === "faq") {
      var faqs = [
        {
          q: "Q1: 界面提示「未登录 GitHub」或「Authentication Required」怎么办？",
          a: "插件直接复用宿主系统的 GitHub CLI 登录态。请打开系统终端运行命令 `gh auth login`，依次选择 GitHub.com ➔ HTTPS ➔ 网页回车授权，一分钟内即可完成登录。登录完成后刷新界面即可自动识别。",
        },
        {
          q: "Q2: 提示「缺少权限 (Scope)」或「SCOPE_REQUIRED」怎么办？",
          a: "当调用项目看板（Projects v2）或云端开发机（Codespaces）时，GitHub 要求专有的 Token Scope。在系统终端执行对应的一键自愈命令完成增量授权即可（无需重新登录）：\n- 项目看板：`gh auth refresh -s read:project`\n- 云端开发机：`gh auth refresh -h github.com -s codespace`",
        },
        {
          q: "Q3: 点击一键升级提示「处于 24h 安全保护期 (防投毒策略)」怎么办？",
          a: "这是 DSH 官方内置包管理器针对刚发布未满 24 小时新版本的供应链防投毒安全锁机制。\n- 立即体验：请先【完全退出关闭 DSH 应用程序】，然后在系统终端执行复制的手动安装命令；\n- 稍后升级：无需任何操作，新版本发版满 24 小时后，再次点击一键升级即可自动安装。",
        },
        {
          q: "Q4: 使用代理节点时偶尔出现网络波动怎么办？",
          a: "插件内置了 1s ➔ 2s ➔ 4s 的阶梯指数退避重试机制。代理节点若发生短时抖动断流，系统会自动在后台静默发起自愈重试，在节点恢复后瞬间平滑拉取最新数据，不会立刻亮出大红横幅打扰你。同时电脑联网恢复瞬间也会自动触发静默更新。",
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
          title: "关闭 (Esc)",
        }, "✕")
      ),
      // 顶部四分类 Segment 导航栏
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
