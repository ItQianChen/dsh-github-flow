#!/usr/bin/env node
// scripts/cache-gh-help.mjs
//
// 把 `gh <子命令> --help` 的原文抓下来存进 test/fixtures/gh-help.json，
// 供 test/phase34-contract.test.mjs 离线校验 argv 与 gh 契约是否一致。
//
// 为什么要缓存而不是让 CI 直接跑真 gh：
//   1) CI runner 的 gh 版本与本机不同 → 契约测试会随环境抖动，变成"谁的机器谁的真相"；
//   2) 上游 gh 改了 flag 不该让别人的 PR 变红（那是 nightly 的 GH_CONTRACT_LIVE 作业）。
// 缓存里带 ghVersion，升级 gh 时单独一个 PR 只更新这个文件，diff 就是"契约变更清单"。
//
// 用法（有 gh 的机器上手工跑，产物入库）：
//   node scripts/cache-gh-help.mjs
//   node scripts/cache-gh-help.mjs --check   # 只打印将要抓取的子命令，不写文件

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectArgv, subcommandCandidates } from '../test/helpers/collect-argv.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'test/fixtures/gh-help.json');
const CHECK_ONLY = process.argv.includes('--check');

function ghVersion() {
  try {
    return execFileSync('gh', ['--version'], { encoding: 'utf8' }).split('\n')[0].trim();
  } catch (err) {
    console.error('❌ 找不到可用的 gh，无法生成契约缓存:', err?.message || err);
    process.exit(1);
  }
}

/** `gh <sub> --help` 成功则返回原文，失败返回 null */
function tryHelp(sub) {
  try {
    return execFileSync('gh', sub.split(' ').concat(['--help']), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

const rows = await collectArgv();
const argvList = rows.flatMap((r) => r.argv);

// 收集候选：两段优先（pr list / run view / workflow run …），一段兜底（api / help / status）
const candidates = new Set();
for (const argv of argvList) for (const c of subcommandCandidates(argv)) candidates.add(c);

const commands = {};
const unresolved = [];
const resolvedSubs = new Set();

for (const cand of [...candidates].sort()) {
  // 已经由更长的候选覆盖过就不重复抓（`pr` 被 `pr list` 覆盖后仍然要抓：
  // `gh pr --help` 与 `gh pr list --help` 是两份不同的 FLAGS 表，都要留）
  if (resolvedSubs.has(cand)) continue;
  const raw = tryHelp(cand);
  if (raw === null) {
    unresolved.push(cand);
    continue;
  }
  commands[cand] = raw;
  resolvedSubs.add(cand);
}

// 一段候选如果本身只是"命令组"（如 pr / repo），它的 --help 没有 FLAGS 只有子命令列表，
// 抓下来也无害——phase34 只会拿它校验"子命令存在"，flag 校验会退化到更长的键。
const payload = {
  ghVersion: ghVersion(),
  generatedAt: new Date().toISOString().slice(0, 10),
  note: '由 scripts/cache-gh-help.mjs 生成。升级 gh 时单独一个 PR 只更新本文件。',
  commands,
};

console.log(`候选子命令 ${candidates.size} 个，抓到 ${Object.keys(commands).length} 个`);
if (unresolved.length) console.log(`未解析（不是 gh 子命令，属正常）: ${unresolved.join(', ')}`);

if (CHECK_ONLY) {
  console.log('--check 模式：不写文件');
  process.exit(0);
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`✅ 已写入 ${path.relative(ROOT, OUT)}（${Object.keys(commands).length} 条帮助文本）`);
if (!existsSync(OUT)) process.exit(1);
