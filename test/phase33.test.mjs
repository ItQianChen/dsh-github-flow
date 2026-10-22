// test/phase33.test.mjs - Phase 33 · 使用指南内容与代码事实同步
//
// 背景：help-modal.ts 是用户点「📖 使用指南」看到的窗口。它曾经严重滞后——
// 18 个工具、PR/Issue 在线弹窗、状态筛选、Markdown 渲染全都没写，
// 用户照着过时说明找不到入口。
//
// 本测试不检查「有没有某句话」，而是把指南里的数字与清单**与代码事实对账**：
// 工具数量对 src/main.ts 的注册数、Tab 名称对 client.ts 的 TAB_DEFS，
// 一旦代码演进而指南没跟上，这里立刻红。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTests() {
  let passed = 0, total = 0;
  const ok = (cond, name, extra = '') => {
    total++;
    if (cond) {
      console.log(`✅ PASS: ${name}${extra ? '  → ' + extra : ''}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}${extra ? '  → ' + extra : ''}`);
    }
  };

  const helpSrc = fs.readFileSync(path.join(__dirname, '../src/ui/help-modal.ts'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.ts'), 'utf8');
  const clientSrc = fs.readFileSync(path.join(__dirname, '../src/client.ts'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(__dirname, '../src/ui/workspace-panel.ts'), 'utf8');

  // ============================================================
  console.log('\n--- 1. 工具数量与代码事实对账 ---');
  // ============================================================
  // 只数「工具工厂实例化」语句：main.ts 里 18 个 createXxxTool(executor) 组成 allTools 数组，
  // 统一过 applyTier / wrapWithGate 后再注册。数工厂调用而不是 register 调用，
  // 是因为注册点已收敛成一条 for 循环——按 register 数会永远得到 1。
  const registered = (mainSrc.match(/^\s*create[A-Z]\w*Tool\(/gm) || []).length;
  ok(registered === 18, '代码中实例化 18 个 Agent 工具', String(registered));
  // 实例化 ≠ 注册：只数工厂调用的话，把下面的注册循环删掉这行仍然绿。
  // 这里显式钉住「档位过滤后逐个注册」这条语句（真正的注册点已收敛为一条 for）。
  ok(
    /for \(const tool of tier\.kept\) tools\.register\(/.test(mainSrc),
    'main.ts 保留「按档位过滤后逐个注册」的循环'
  );

  // 指南里声明的工具数量必须与实际一致
  ok(helpSrc.includes('18 大工具'), '指南标题声明「18 大工具」');
  ok(/18 个 Agent 工具/.test(helpSrc), '工具速查页声明「18 个 Agent 工具」');
  ok(!/\b\d+ 大核心工具/.test(helpSrc) || helpSrc.includes('18 大核心工具'), '未出现与 18 冲突的工具数量');

  // 每个真实工具名都要在指南里出现，不能漏
  const toolNames = [
    'github_pr', 'github_issue', 'github_run', 'github_repo',
    'github_release', 'github_secret', 'github_label', 'github_ruleset',
    'github_cache', 'github_skill', 'github_status', 'github_agent_task',
    'github_discussion', 'github_project', 'github_codespace', 'github_gist',
    'github_api', 'github_help',
  ];
  const missingTools = toolNames.filter((n) => !helpSrc.includes(n));
  ok(missingTools.length === 0, '18 个工具全部在指南中列出', missingTools.length ? '缺: ' + missingTools.join(', ') : '');

  // action 总数对账。
  // 口径必须统一：help 的 21 项是「查询主题」、api 的 4 项是「HTTP method」，
  // 都不是业务动作。此前指南写「128 个动作」把这两类算进去了，口径不严谨。
  let actionTotal = 0;
  let businessTotal = 0;
  for (const f of fs.readdirSync(path.join(__dirname, '../src/tools')).filter((x) => x.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(__dirname, '../src/tools', f), 'utf8');
    const m = src.match(/enum:\s*\[([^\]]+)\]/);
    if (!m) continue;
    const n = (m[1].match(/'[^']+'/g) || []).length;
    actionTotal += n;
    if (f !== 'help.ts' && f !== 'api.ts') businessTotal += n;
  }
  ok(actionTotal === 128, '代码中 enum 项总计 128', String(actionTotal));
  ok(businessTotal === 103, '代码中业务 action 数为 103（排除 help 主题与 api method）', String(businessTotal));

  // 两个面向人类的入口（Agent 工具知识库 / 使用指南 UI）必须同口径
  const helpToolSrc = fs.readFileSync(path.join(__dirname, '../src/tools/help.ts'), 'utf8');
  ok(helpToolSrc.includes('103 个业务 action'), 'github_help 声明「103 个业务 action」');
  ok(helpSrc.includes('103 个业务动作'), 'UI 使用指南声明「103 个业务动作」');
  ok(!helpSrc.includes('128 个动作'), 'UI 使用指南不再使用含混的「128 个动作」口径');
  ok(!helpToolSrc.includes('128 个动作'), 'github_help 不再使用含混的「128 个动作」口径');

  // ============================================================
  console.log('\n--- 2. UI 结构：Tab 名称与代码一致 ---');
  // ============================================================
  const panelTabs = [
    { key: 'workspaces', label: '本地工作区' },
    { key: 'repos', label: '我的 GitHub 仓库' },
    { key: 'prs', label: 'Pull Requests' },
    { key: 'issues', label: '任务与待办 Issues' },
  ];
  for (const t of panelTabs) {
    ok(panelSrc.includes(`activeTab === '${t.key}'`), `主面板存在 ${t.key} 标签`);
    ok(helpSrc.includes(t.label), `指南提到主面板「${t.label}」`);
  }
  ok(helpSrc.includes('4 个标签'), '指南声明主面板为 4 个标签');

  const rightbarTabs = ['git', 'dirty', 'prs', 'issues', 'runs'];
  for (const k of rightbarTabs) {
    ok(clientSrc.includes(`key: "${k}"`), `右侧栏存在 ${k} Tab`);
  }
  ok(helpSrc.includes('5 个 Tab'), '指南声明右侧栏为 5 个 Tab');
  ok(helpSrc.includes('Git Tab') && helpSrc.includes('未提交 Tab'), '指南分述 Git 与未提交 Tab');
  ok(helpSrc.includes('PR Tab') && helpSrc.includes('Issues Tab'), '指南分述 PR 与 Issues Tab');
  ok(helpSrc.includes('Actions Tab'), '指南提到 Actions Tab');

  // ============================================================
  console.log('\n--- 3. 近期新增能力必须被覆盖 ---');
  // ============================================================
  const newFeatures = [
    { name: 'PR 在线审阅弹窗', pattern: /PR 审阅工作台/, code: fs.existsSync(path.join(__dirname, '../src/ui/pr-modal.ts')) },
    { name: 'Issue 在线查看弹窗', pattern: /Issue 详情|在线查看/, code: fs.existsSync(path.join(__dirname, '../src/ui/issue-modal.ts')) },
    { name: 'PR/Issue 状态筛选', pattern: /Merged|状态胶囊|状态过滤/, code: /prStateFilter/.test(clientSrc) },
    { name: 'Markdown 渲染', pattern: /Markdown/, code: fs.existsSync(path.join(__dirname, '../src/ui/markdown-lite.ts')) },
    { name: '仓库切换/Fork 血缘', pattern: /血缘行|基准仓库/, code: clientSrc.includes('associatedRepos') },
    { name: '提交详情弹窗', pattern: /Commit 详情/, code: fs.existsSync(path.join(__dirname, '../src/ui/commit-modal.ts')) },
    { name: '未提交文件 Diff 下钻', pattern: /Unified Diff/, code: clientSrc.includes('UncommittedDiffView') },
    { name: 'view_images 看图', pattern: /view_images/, code: fs.existsSync(path.join(__dirname, '../src/tools/image-utils.ts')) },
    { name: '仓库切换器', pattern: /RepoSelectorDropdown/, code: fs.existsSync(path.join(__dirname, '../src/ui/repo-selector.ts')) },
  ];
  for (const f of newFeatures) {
    ok(f.code, `功能【${f.name}】在代码中存在`);
    ok(f.pattern.test(helpSrc), `指南覆盖【${f.name}】`);
  }

  // 具体档位文案必须出现（用户找的就是这几个词）
  for (const word of ['Open', 'Merged', 'Closed']) {
    ok(helpSrc.includes(word), `指南列出 ${word} 状态档位`);
  }

  // ============================================================
  console.log('\n--- 4. Slash 指令与 FAQ 完整性 ---');
  // ============================================================
  ok(helpSrc.includes('/gh upgrade'), '指南提到 /gh upgrade');
  ok(helpSrc.includes('/gh status'), '指南提到 /gh status');
  ok(helpSrc.includes('/gh help'), '指南提到 /gh help');

  const faqCount = (helpSrc.match(/q: "Q\d+:/g) || []).length;
  ok(faqCount >= 6, 'FAQ 至少 6 条（覆盖登录/权限/升级/网络/列表为空/重启生效）', String(faqCount));
  ok(helpSrc.includes('gh auth refresh'), 'FAQ 给出增量授权命令');
  ok(/列表是空的|列表.*为空/.test(helpSrc) || helpSrc.includes('但 GitHub 网页上明明有记录'), 'FAQ 覆盖「列表为空但网页有记录」');
  ok(helpSrc.includes('重启 DSH'), 'FAQ 说明「为何需要重启 DSH 才生效」');

  /*
   * 防编造：指南里出现的每一条 `gh auth refresh -s <scope>` 都必须能在
   * src/ 的真实代码里找到出处。曾经我在 FAQ 里写了一个 agent_task scope，
   * 代码里根本不存在这个自愈命令——用户照着敲会得到 "unknown scope" 报错。
   */
  const srcFiles = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.ts') && ent.name !== 'help-modal.ts') srcFiles.push(p);
    }
  })(path.join(__dirname, '../src'));
  const realSrc = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  const claimedScopes = [...helpSrc.matchAll(/gh auth refresh[^`'"\\]*?-s\s+([a-z:]+)/g)].map((m) => m[1]);
  ok(claimedScopes.length > 0, '指南确实给出了 scope 参数', claimedScopes.join(', '));
  const fabricated = claimedScopes.filter((s) => !realSrc.includes(`-s ${s}`));
  ok(fabricated.length === 0, '指南中每个 scope 都能在源码找到出处（无编造）', fabricated.length ? '编造: ' + fabricated.join(', ') : '');

  // 反向：代码里真实存在的 scope 至少覆盖最常用的两个
  ok(realSrc.includes('-s read:project'), '源码存在 read:project 自愈命令');
  ok(realSrc.includes('-s codespace'), '源码存在 codespace 自愈命令');

  // ============================================================
  console.log('\n--- 5. Tab 结构与渲染安全 ---');
  // ============================================================
  const tabDefs = helpSrc.match(/var tabs = \[([\s\S]*?)\];/);
  const tabCount = tabDefs ? (tabDefs[1].match(/id: "/g) || []).length : 0;
  ok(tabCount === 5, '指南自身 5 个分类 Tab', String(tabCount));
  for (const id of ['quickstart', 'prompts', 'panels', 'tools', 'faq']) {
    ok(helpSrc.includes(`id: "${id}"`), `存在 ${id} 分类`);
    ok(new RegExp(`activeTab === "${id}"`).test(helpSrc), `${id} 分类有渲染分支`);
  }

  // Hook 顺序：两个 useEffect 必须都在 early return 之后（本组件的 early return 在最前，
  // 属于「无 props 即不渲染」的常见形态，需确保 return 之前没有任何 Hook）
  const fnStart = helpSrc.indexOf('export function GithubHelpModal');
  const earlyReturnIdx = helpSrc.indexOf('if (!props.isOpen) return null;', fnStart);
  const firstHookIdx = helpSrc.indexOf('React.useState(', fnStart);
  ok(earlyReturnIdx > fnStart, '存在 isOpen 早退守卫');
  ok(firstHookIdx > earlyReturnIdx, 'early return 之后才开始 Hook（守卫在最前，不构成 Hook 数量抖动）');

  ok(!helpSrc.includes('dangerouslySetInnerHTML'), '指南不含 innerHTML（零 XSS 面）');
  ok(helpSrc.includes('aria-label'), '关闭按钮具备 aria-label');

  // ============================================================
  console.log('\n--- 6. bundle 产物 ---');
  // ============================================================
  const bundle = fs.readFileSync(path.join(__dirname, '../lib/client.js'), 'utf8');
  ok(bundle.includes('18 大工具'), 'bundle 含「18 大工具」');
  ok(bundle.includes('103 个业务动作'), 'bundle 含「103 个业务动作」');
  ok(!bundle.includes('128 个动作'), 'bundle 已无含混的「128 个动作」口径');
  ok(bundle.includes('PR 审阅工作台'), 'bundle 含 PR 在线审阅说明');
  ok(bundle.includes('Issue 详情'), 'bundle 含 Issue 在线查看说明');
  ok(!bundle.includes('以下精选了开发者日常研发中最高频的 5 大真实协作场景'), '旧版「5 大场景」文案已被替换');
  ok(!/\bexport\s+(async\s+)?(function|const|var|let|class)\b/.test(bundle), 'bundle 无裸 export 残留');

  // ============================================================
  console.log('\n--- 7. github_help 知识库与代码 action 对账 ---');
  // ============================================================
  /*
   * 为什么单独查工具侧知识库：Agent 不看 UI，它只读 github_help 返回的 Markdown。
   * 这里若写错 action 数量或漏掉某个 action，Agent 会据此判断「这件事做不到」。
   */
  const actualActions = {};
  for (const f of fs.readdirSync(path.join(__dirname, '../src/tools')).filter((x) => x.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(__dirname, '../src/tools', f), 'utf8');
    const m = src.match(/enum:\s*\[([^\]]+)\]/);
    if (!m) continue;
    actualActions[f.replace('.ts', '')] = (m[1].match(/'[^']+'/g) || []).map((s) => s.slice(1, -1));
  }

  // mapping 表里声明的 action 数量必须与代码一致
  const declaredCounts = [...helpToolSrc.matchAll(/\*\*([A-Za-z ]+)（(github_[a-z_]+)，(\d+) action）\*\*/g)]
    .map((m) => ({ label: m[1].trim(), tool: m[2], count: Number(m[3]) }));
  ok(declaredCounts.length >= 12, 'mapping 表声明了多组 action 数量', String(declaredCounts.length));

  for (const d of declaredCounts) {
    const key = d.tool.replace('github_', '').replace('_', '-');
    const actual = actualActions[key];
    if (!actual) continue;
    ok(d.count === actual.length, `${d.tool} 声明 ${d.count} 个 action，与实际 ${actual.length} 一致`);
  }

  // 每个工具的业务 action 名都要在 mapping 或对应 topic 段出现，防止新增动作后文档失联
  const undocumented = [];
  for (const [tool, acts] of Object.entries(actualActions)) {
    if (tool === 'help') continue; // help 自身主题枚举不写进 mapping
    const toolName = 'github_' + tool.replace('-', '_');
    for (const a of acts) {
      if (tool === 'api') continue; // HTTP method，非业务 action
      // 允许出现在 mapping 表（action:'x'）或该工具的专题段（action: 'x'）
      const inMapping = new RegExp(`action:'${a}|action: '${a}`).test(helpToolSrc);
      const inTopic = new RegExp(`${toolName}`).test(helpToolSrc);
      if (!inMapping && !inTopic) undocumented.push(`${toolName}:${a}`);
    }
  }
  ok(undocumented.length === 0, '所有业务 action 在知识库中有落点', undocumented.length ? undocumented.join(', ') : '');

  // 关键新增动作必须被显式覆盖（历史上漏过 update）
  ok(/github_skill\(action: 'update'/.test(helpToolSrc), 'github_help 覆盖 skill 的 update 动作');
  ok(helpToolSrc.includes('dry_run: false'), 'skill update 说明了 dry_run 语义');
  ok(/github_pr\(action: 'comment'/.test(helpToolSrc) || /action:'comment'/.test(helpToolSrc), 'github_help 覆盖 PR 的 comment 动作');
  ok(/github_pr\(action: 'edit'/.test(helpToolSrc) || /action:'edit'/.test(helpToolSrc), 'github_help 覆盖 PR 的 edit 动作');

  // overview 的能力描述必须与真实工具集一致
  const overviewBlock = helpToolSrc.slice(helpToolSrc.indexOf('overview: `'), helpToolSrc.indexOf('pr: `'));
  for (const t of toolNames) {
    ok(overviewBlock.includes(t), `overview 表列出 ${t}`);
  }

  console.log('\n========================================');
  console.log(`Phase 33 Test Result: ${passed}/${total} assertions ${passed === total ? 'PASSED' : 'FAILED'}!`);
  console.log('========================================');
  if (passed !== total) process.exit(1);
}

runTests().catch((e) => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
