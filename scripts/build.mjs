import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  const leadingModules = [
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
    'commit-modal.js',
    'pr-modal.js',
    // issue-modal 依赖 pr-modal 里的 CollapsibleBody（长正文/长评论折叠）与
    // markdown-lite 的解析器，必须排在这两者之后，否则运行时引用为 undefined
    'issue-modal.js',
    'sync-settings-modal.js',
    'help-modal.js',
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
      code = code.replace(/^\s*import\s+[^;]+;\s*$/gm, '');
      code = code.replace(/\bexport\s+(async\s+)?(function|const|var|let|class)\b/g, '$1$2');
      code = code.replace(/\bexport\s*\{[^}]*\}\s*;?/g, '');
      leadingCode += `\n// ---- [Bundled: ${mod}] ----\n` + code.trim() + '\n';
    }
  }

  // 2. 后置子模块（保证 GithubRightbarBody 在前，GithubWorkspacePanel 在后）
  let trailingCode = '';
  const trailingModules = ['workspace-panel.js'];
  for (const mod of trailingModules) {
    const modPath = path.join(uiDir, mod);
    if (fs.existsSync(modPath)) {
      let code = fs.readFileSync(modPath, 'utf8');
      code = code.replace(/^\s*import\s+[^;]+;\s*$/gm, '');
      code = code.replace(/\bexport\s+(async\s+)?(function|const|var|let|class)\b/g, '$1$2');
      code = code.replace(/\bexport\s*\{[^}]*\}\s*;?/g, '');
      trailingCode += `\n// ---- [Bundled: ${mod}] ----\n` + code.trim() + '\n';
    }
  }

  let mainContent = fs.readFileSync(clientPath, 'utf8');
  mainContent = mainContent.replace(/^\s*import\s+[^;]+from\s+['"][^'"]*ui\/[^'"]*['"]\s*;?\s*$/gm, '');
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
