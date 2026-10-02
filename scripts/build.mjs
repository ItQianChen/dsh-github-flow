import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(__dirname, '../lib/client.js');

if (fs.existsSync(clientPath)) {
  let content = fs.readFileSync(clientPath, 'utf8');
  content = content.replace(/\bexport\s*\{\s*\}\s*;?/g, '').trim() + '\n';
  fs.writeFileSync(clientPath, content, 'utf8');
  console.log('[build] 已成功净化 lib/client.js: 移除了 export {}; 声明');
} else {
  console.error('[build] 未找到 lib/client.js:', clientPath);
}
