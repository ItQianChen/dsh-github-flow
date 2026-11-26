import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 把 `import { A as B }` 中的别名落成 `var B = A;`，供内联前调用。
 *
 * 为什么必须有它：内联后所有模块共享同一个闭包作用域，`import` 行会被删除，
 * 非别名符号靠声明本身可见——但 `as B` 里的 `B` 是**新名字**，闭包里根本不存在，
 * 删掉 import 就等于它永远是 undefined。
 * 这类错误 tsc 抓不到、build 不报错、内联块也「没有残留 import」，
 * 只在真的用到那个符号时抛 ReferenceError（2026-11-26 操作记录白屏事故：
 * 列表为空时根本不调用 renderRow，一旦有记录就整棵 React 树卸载）。
 */
function rewriteAliasedImports(code) {
  return code.replace(
    /^[ \t]*import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]\s*;?[ \t]*$/gm,
    (_m, names) => {
      const assigns = [];
      for (const raw of String(names).split(',')) {
        const parts = raw.trim().split(/\s+as\s+/);
        if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
          assigns.push(`var ${parts[1].trim()} = ${parts[0].trim()};`);
        }
      }
      return assigns.join('\n');
    },
  );
}
const clientPath = path.resolve(__dirname, '../lib/client.js');

/**
 * 版本一致性校验：package.json 与 src/version.ts 必须同版。
 */
function assertVersionConsistency() {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const versionTsPath = path.resolve(__dirname, '../src/version.ts');
  const pkgVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  const m = fs.readFileSync(versionTsPath, 'utf8').match(/CURRENT_PLUGIN_VERSION\s*=\s*'([^']+)'/);
  const srcVersion = m ? m[1] : null;
  if (!srcVersion || pkgVersion !== srcVersion) {
    console.error(`[build] ❌ 版本号不一致: package.json=${pkgVersion}, src/version.ts=${srcVersion}`);
    console.error('[build]    请同步后重新构建（假更新横幅的根源，见 npm-publish.yml 取版逻辑）');
    process.exit(1);
  }
  console.log(`[build] ✅ 版本一致性校验通过: v${pkgVersion}`);
}

/**
 * 轻量 CSS 压缩：去除注释与冗余空行，保留所有样式规则。
 *
 * 历史 Bug（务必不要退回按行过滤的写法）：
 * 旧实现是 `.filter(l => !l.startsWith('/*'))`，只能丢掉「以 /* 开头」的行。
 * CSS 多行注释的中间行形如 `* 说明文字`，不以 /* 开头，于是被原样保留，
 * 而首行 `/*` 与末行 `*\/` 被丢弃——结果在 CSS 里留下一段
 * `* margin-left: auto 是双保险…` 的非法文本。
 * 浏览器解析到它就判定该规则无效并整条丢弃，
 * 表现为「写了按钮样式却渲染成裸链接」「标题行 flex 完全不生效」，
 * 排查时极易误判为选择器优先级问题。
 *
 * 正确做法：用正则整体剥除注释块（跨行匹配），而不是逐行判断。
 */
function compressCss(code) {
  return code.replace(/const GITHUB_PANEL_CSS = `([\s\S]*?)`;/, (_, css) => {
    const minified = css
      // 整体剥除跨行注释：/* 到 */ 之间的任意内容
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join('\n');
    return `const GITHUB_PANEL_CSS = \`\n${minified}\n\`;`;
  });
}

/**
 * 构建期 CSS 完整性校验：压缩后的 CSS 必须语法自洽，否则直接失败。
 *
 * 为什么必须有这道校验：上面那个「注释中间行残留」的 Bug 之所以能流到用户界面
 * 并连续误导三轮排查，根本原因就是**压缩坏了但构建仍然成功**。
 * 浏览器遇到非法 CSS 只会静默丢弃整条规则，不报错、不警告，
 * 表现成「样式没生效」，排查时极易误判为选择器优先级或 flex 属性问题。
 *
 * 检查项都是「一旦违反必然导致规则被丢弃」的硬性条件：
 *   1. 不能残留任何注释片段（/* 或 *\/）
 *   2. 不能有「行首 *」的悬空注释中间行
 *   3. 花括号必须配平（决定后续所有规则是否被正确切分）
 */
function assertCssIntegrity(compressedCode) {
  const m = compressedCode.match(/const GITHUB_PANEL_CSS = `([\s\S]*?)`;/);
  if (!m) {
    console.error('[build] ❌ CSS 完整性校验失败：未能从 styles.js 中定位 GITHUB_PANEL_CSS 模板字符串');
    process.exit(1);
  }
  const css = m[1];

  const problems = [];
  if (css.includes('/*') || css.includes('*/')) {
    problems.push('残留注释定界符（/* 或 */）——说明注释未被整块剥离');
  }
  if (/^\*/m.test(css)) {
    problems.push('存在「行首 *」的悬空注释行——浏览器会因此丢弃整条规则');
  }
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  if (open !== close) {
    problems.push(`花括号不配平（{ ${open} 个 / } ${close} 个）`);
  }

  if (problems.length > 0) {
    console.error('[build] ❌ CSS 完整性校验失败：');
    for (const p of problems) console.error(`[build]    · ${p}`);
    console.error('[build]    非法 CSS 会被浏览器静默丢弃整条规则，表现为「样式不生效」却不报错。');
    process.exit(1);
  }
  console.log(`[build] ✅ CSS 完整性校验通过（${open} 条规则块，零注释残留）`);
}

/**
 * 前端模块化 Bundle 聚合器：
 * 将 lib/ui/ 下各独立子模块按正确的依赖拓扑与切片顺序注入到 lib/client.js。
 */
function bundleClient() {
  if (!fs.existsSync(clientPath)) {
    console.error('[build] 未找到 lib/client.js:', clientPath);
    process.exit(1);
  }

  const uiDir = path.resolve(__dirname, '../lib/ui');
  if (!fs.existsSync(uiDir)) {
    let content = fs.readFileSync(clientPath, 'utf8');
    content = content.replace(/\bexport\s*\{[\s\S]*?\}\s*;?/g, '').trim() + '\n';
    fs.writeFileSync(clientPath, content, 'utf8');
    return;
  }

  // 1. 前置子模块
  // 顺序即依赖顺序：被依赖者必须排在使用者之前（client.js 的 repoCardEl 调
  // resolveRepoBadges，故 repo-badges.js 要在其之前内联）。
  //
  // ../shared/state-badges.js 必须排第一：状态→徽章映射由服务端与 UI 共用，
  // 它是零依赖模块，先内联才能被后面所有模块引用。改这里之前先确认该文件没有
  // 任何 import——构建器会剥掉 import 行，被引用的符号在 bundle 作用域里就会是 undefined（白屏）。
  const leadingModules = [
    '../shared/state-badges.js',
    'styles.js',
    'utils.js',
    'icons.js',
    'storage.js',
    'branch-selector.js',
    'repo-selector.js',
    'auth-guide-card.js',
    'upgrade-card.js',
    'network-banner.js',
    'repo-badges.js',
    'sync-status-badge.js',
    // markdown-lite 必须早于 pr-modal：后者要用 renderMarkdownBlocks 渲染描述与评论
    'markdown-lite.js',
    // diff-utils / file-diff-modal 必须早于 commit-modal：后者要用前者的补丁切分函数与
    // 弹窗组件。漏登记不会报错，只会在浏览器里表现为 undefined（白屏），顺序必须显式维护。
    'diff-utils.js',
    'file-diff-modal.js',
    'commit-modal.js',
    'pr-modal.js',
    // issue-modal 依赖 pr-modal 里的 CollapsibleBody（长正文/长评论折叠）与
    // markdown-lite 的解析器，必须排在这两者之后，否则运行时引用为 undefined
    'issue-modal.js',
    // run-modal 依赖 shared/state-badges 的 ciBadge 与 utils 的 eventLabel，
    // 两者都已在更早位置内联；排在这里是「详情类弹窗」这一族的固定顺序
    'run-modal.js',
    'sync-settings-modal.js',
    'help-modal.js',
    // audit-modal 依赖 utils 的 formatRelativeTime 与既有的 .dsh-github-modal-* 样式，
    // 因此必须排在 utils.js / styles.js 之后。漏登记不会报错，只会在浏览器里表现为
    // undefined（点 🕘 白屏），顺序与登记都必须显式维护。
    'audit-modal.js',
  ];

  let leadingCode = '';
  for (const mod of leadingModules) {
    const modPath = path.join(uiDir, mod);
    if (fs.existsSync(modPath)) {
      let code = fs.readFileSync(modPath, 'utf8');
      if (mod === 'styles.js') {
        code = compressCss(code);
        // 压缩后立即校验：非法 CSS 会被浏览器静默丢弃，必须在构建期拦住
        assertCssIntegrity(code);
      }
      code = rewriteAliasedImports(code);
      code = code.replace(/^\s*import\s+[^;]+;\s*$/gm, '');
      code = code.replace(/\bexport\s+(async\s+)?(function|const|var|let|class)\b/g, '$1$2');
      code = code.replace(/\bexport\s*\{[^}]*\}\s*;?/g, '');
      leadingCode += `\n// ---- [Bundled: ${path.basename(mod)}] ----\n` + code.trim() + '\n';
    }
  }

  // 2. 后置子模块（保证 GithubRightbarBody 在前，GithubWorkspacePanel 在后）
  let trailingCode = '';
  const trailingModules = ['workspace-panel.js'];
  for (const mod of trailingModules) {
    const modPath = path.join(uiDir, mod);
    if (fs.existsSync(modPath)) {
      let code = fs.readFileSync(modPath, 'utf8');
      code = rewriteAliasedImports(code);
      code = code.replace(/^\s*import\s+[^;]+;\s*$/gm, '');
      code = code.replace(/\bexport\s+(async\s+)?(function|const|var|let|class)\b/g, '$1$2');
      code = code.replace(/\bexport\s*\{[^}]*\}\s*;?/g, '');
      trailingCode += `\n// ---- [Bundled: ${mod}] ----\n` + code.trim() + '\n';
    }
  }

  let mainContent = fs.readFileSync(clientPath, 'utf8');
  /*
   * 输入与输出是同一个文件（lib/client.js）：tsc 重编译会把它重置为「未内联」的形态，
   * 之后的聚合才安全。若这里已经能看到内联标记，说明有人跳过了 tsc 直接重跑本脚本，
   * 再聚合一次就会把 22 个模块整份复制进 bundle（体积翻倍、声明重复）。
   * 不静默容错——直接失败，让调用者按正确顺序重来。
   */
  if (mainContent.includes('// ---- [Bundled:')) {
    console.error('[build] ❌ lib/client.js 已是聚合产物：请先运行 tsc 重新生成，再执行本脚本（pnpm run build 会按序执行）');
    process.exit(1);
  }
  // 剥掉 client.js 对「会被内联的模块」的 import：ui/ 与 shared/ 两族都要剥，
  // 否则 shared/state-badges.js 会同时以 import 与内联体存在两份。
  mainContent = rewriteAliasedImports(mainContent);
  mainContent = mainContent.replace(/^\s*import\s+[^;]+from\s+['"][^'"]*(?:ui|shared)\/[^'"]*['"]\s*;?\s*$/gm, '');
  mainContent = mainContent.replace(/\bexport\s*\{[\s\S]*?\}\s*;?/g, '');

  const reactRequireMarker = 'var React = require("react");';
  const markerIdx = mainContent.indexOf(reactRequireMarker);
  if (markerIdx >= 0) {
    const injectPos = markerIdx + reactRequireMarker.length;
    mainContent = mainContent.slice(0, injectPos) + '\n' + leadingCode + '\n' + mainContent.slice(injectPos);
  }

  const applyMarker = 'function apply(ctx)';
  const applyIdx = mainContent.indexOf(applyMarker);
  if (applyIdx >= 0) {
    mainContent = mainContent.slice(0, applyIdx) + trailingCode + '\n\n    ' + mainContent.slice(applyIdx);
  } else {
    mainContent += '\n' + trailingCode;
  }

  mainContent = mainContent.trim() + '\n';

  /*
   * 别名 import 的硬校验：被内联模块里每个 `import { A as B }`，bundle 里都必须
   * 存在 `var B = A;`。少一个就是运行期 ReferenceError，而且**只在真的用到 B 时爆**
   * ——tsc 通过、build 成功、内联块也确实「没有残留 import」，全都拦不住它。
   * 2026-11-26 的「点操作记录白屏」就是这个：列表为空时不调用 renderRow，
   * 一旦有记录就整棵 React 树卸载。
   */
  const missingAliases = [];
  for (const mod of [...leadingModules, ...trailingModules]) {
    const p = path.join(uiDir, mod);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/^[ \t]*import\s*\{([^}]*)\}\s*from/gm)) {
      for (const raw of String(m[1]).split(',')) {
        const parts = raw.trim().split(/\s+as\s+/);
        if (parts.length !== 2) continue;
        const local = parts[1].trim();
        if (!new RegExp('var\\s+' + local + '\\b').test(mainContent)) missingAliases.push(`${local}（来自 ${mod}）`);
      }
    }
  }
  if (missingAliases.length > 0) {
    console.error('[build] ❌ 别名 import 未被绑定，运行期会 ReferenceError：', missingAliases.join(', '));
    process.exit(1);
  }

  // 刚性防线：客户端闭包内绝对不能含有裸 export 语句，防止浏览器触发 Uncaught SyntaxError: Unexpected token 'export' 崩溃
  const illegalExportMatch = mainContent.match(/\bexport\s+(async\s+)?(function|const|var|let|class)\b/);
  if (illegalExportMatch) {
    console.error('[build] ❌ 严重语法错误：lib/client.js 闭包内检测到非法残留的 export 关键字:', illegalExportMatch[0]);
    process.exit(1);
  }

  fs.writeFileSync(clientPath, mainContent, 'utf8');
  console.log('[build] ✅ 已成功聚合前端子模块并完成 CSS 压缩瘦身');
}

bundleClient();
assertVersionConsistency();
