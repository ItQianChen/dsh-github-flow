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
 * 轻量 CSS 压缩：去除多行注释与冗余换行，保留关键样式选择器。
 */
function compressCss(code) {
  return code.replace(/const GITHUB_PANEL_CSS = `([\s\S]*?)`;/, (_, css) => {
    const minified = css
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('/*'))
      .join('\n');
    return `const GITHUB_PANEL_CSS = \`\n${minified}\n\`;`;
  });
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
  const leadingModules = [
    'styles.js',
    'utils.js',
    'icons.js',
    'storage.js',
    'branch-selector.js',
    'auth-guide-card.js',
    'upgrade-card.js',
    'network-banner.js',
    'sync-status-badge.js',
    'commit-modal.js',
    'sync-settings-modal.js',
  ];

  let leadingCode = '';
  for (const mod of leadingModules) {
    const modPath = path.join(uiDir, mod);
    if (fs.existsSync(modPath)) {
      let code = fs.readFileSync(modPath, 'utf8');
      if (mod === 'styles.js') {
        code = compressCss(code);
      }
      code = code.replace(/^\s*import\s+[^;]+;\s*$/gm, '');
      code = code.replace(/\bexport\s+(function|const|var|let)\b/g, '$1');
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
      code = code.replace(/\bexport\s+(function|const|var|let)\b/g, '$1');
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
  fs.writeFileSync(clientPath, mainContent, 'utf8');
  console.log('[build] ✅ 已成功聚合前端子模块并完成 CSS 压缩瘦身');
}

bundleClient();
assertVersionConsistency();
