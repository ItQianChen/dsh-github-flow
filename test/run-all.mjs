// test/run-all.mjs - 全量测试统一编排器（零依赖，延续 phase1-3 原生范式）
//
// 顺序执行而非并发：四个测试文件共享 lib/ 产物与 stdout，串行输出对人类
// 最可读，且总耗时 <5s，没有并发收益。任一阶段失败立即以非零码退出，
// 供 pnpm test / CI 直接消费退出码。

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const phases = ['phase1.test.mjs', 'phase2.test.mjs', 'phase3.test.mjs', 'phase4.test.mjs', 'phase5.test.mjs', 'phase6.test.mjs', 'phase7.test.mjs', 'phase8.test.mjs', 'phase9.test.mjs', 'phase10.test.mjs', 'phase11.test.mjs', 'phase12.test.mjs', 'phase13.test.mjs', 'phase14.test.mjs', 'phase15.test.mjs', 'phase16.test.mjs', 'phase17.test.mjs', 'phase18.test.mjs', 'phase19.test.mjs', 'phase20.test.mjs'];

function runPhase(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(dirname, file)], { stdio: 'inherit' });
    child.on('exit', (code) => resolve({ file, code: code ?? 1 }));
    child.on('error', (err) => {
      console.error(`❌ 无法启动 ${file}: ${err.message}`);
      resolve({ file, code: 1 });
    });
  });
}

console.log('🧪 DSH GitHub Flow 全量测试套件\n');
const results = [];
for (const file of phases) {
  console.log(`\n━━━━━━━━━ ${file} ━━━━━━━━━`);
  results.push(await runPhase(file));
}

const failed = results.filter((r) => r.code !== 0);
console.log('\n━━━━━━━━━ 汇总 ━━━━━━━━━');
for (const r of results) {
  console.log(`${r.code === 0 ? '✅' : '❌'} ${r.file}`);
}
if (failed.length > 0) {
  console.log(`\n${failed.length} 个阶段失败`);
  process.exit(1);
}
console.log('\n🎉 全部阶段通过');
