import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(__dirname, '../lib/client.js');

/**
 * 版本一致性校验：package.json 与 src/version.ts 必须同版。
 * 为什么必须构建期硬拦：CI（npm-publish.yml）从 package.json 取版发布，
 * 而 UpdateChecker 的 hasUpdate 比较基于 version.ts——两者漂移会直接产出
 * 「假更新横幅」版本（v0.2.0 用户被 0.1.8→0.2.0 横幅轰炸的教训）。
 * 构建失败比发一个假横幅版本便宜得多。
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

if (fs.existsSync(clientPath)) {
  let content = fs.readFileSync(clientPath, 'utf8');
  content = content.replace(/\bexport\s*\{\s*\}\s*;?/g, '').trim() + '\n';
  fs.writeFileSync(clientPath, content, 'utf8');
  console.log('[build] 已成功净化 lib/client.js: 移除了 export {}; 声明');
} else {
  console.error('[build] 未找到 lib/client.js:', clientPath);
  process.exit(1);
}

assertVersionConsistency();
