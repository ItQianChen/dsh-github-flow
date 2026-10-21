// test/phase34-contract.test.mjs
//
// 契约测试：工具下发的每一条 argv，是否都只用了 gh 真实存在的子命令 / flag / --json 字段。
//
// 为什么需要它：本项目历史上出过两次同类事故——`pr checks` 用了 REST 字段名
// （conclusion/detailsUrl，gh 从未支持）、`pr diff --stat` / `ruleset --no-parents` /
// `pr revert --delete-branch` 用了不存在的 flag。三次都是"照着文档/直觉写，没人对过 gh"。
// 这条测试把 gh 当唯一裁判：期望值不手写，全部来自 `gh <cmd> --help` 的缓存原文。
//
// 离线运行：读 test/fixtures/gh-help.json（由 scripts/cache-gh-help.mjs 生成），
// 不依赖 CI 机器上有 gh，也不会因上游改 flag 而让别人的 PR 变红。
// 想对真 gh 跑：GH_CONTRACT_LIVE=1（nightly 用），缓存缺项时 SKIP 计数。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectArgv, subcommandCandidates } from './helpers/collect-argv.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let passed = 0;
let failed = 0;
function ok(cond, name, extra) {
  if (cond) {
    passed++;
    console.log(`✅ PASS: ${name}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${name}${extra ? '  → ' + extra : ''}`);
  }
}

/**
 * 解析 gh --help 的 FLAGS / INHERITED FLAGS / JSON FIELDS 三个区块。
 *
 * 依赖实测到的行形态（gh 2.96）：`  -L, --limit int         Maximum…`
 * ——类型词前恰好 1 个空格，描述前是 3+ 个空格；没有类型词的布尔 flag 后面直接是描述。
 */
function parseHelp(raw) {
  const flags = new Map();
  const fields = new Set();
  let zone = '';
  for (const line of String(raw || '').split('\n')) {
    const trimmed = line.trim();
    if (/^(FLAGS|INHERITED FLAGS|JSON FIELDS|USAGE|ALIASES|EXAMPLES|LEARN MORE)$/.test(trimmed)) {
      zone = trimmed;
      continue;
    }
    if (zone === 'FLAGS' || zone === 'INHERITED FLAGS') {
      const m = line.match(/^\s+(?:(-[A-Za-z]),\s+)?--([A-Za-z0-9-]+)(?:( +)(\S+))?/);
      if (m) flags.set(m[2], { short: m[1] ? m[1][1] : undefined, takesValue: m[3] === ' ' });
    } else if (zone === 'JSON FIELDS') {
      for (const f of trimmed.split(/,\s*/)) {
        const name = f.trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) fields.add(name);
      }
    }
  }
  return { flags, fields };
}

/** 把 argv 拆成 [子命令前缀, flag 列表]；位置参数（PR 号、路径、query）不参与校验 */
function splitArgv(argv, help) {
  const sub = [];
  const flags = [];
  let i = 0;
  while (i < argv.length && !/^-/.test(argv[i])) sub.push(argv[i++]);
  for (; i < argv.length; i++) {
    const tok = argv[i];
    // 裸 `-` 是 stdin 标记（如 `gh gist create -`），不是 flag
    if (!/^-/.test(tok) || tok === '-') continue;
    const eq = tok.indexOf('=');
    const name = (eq > -1 ? tok.slice(0, eq) : tok).replace(/^-+/, '');
    let value = eq > -1 ? tok.slice(eq + 1) : undefined;
    if (value === undefined && help.flags.get(name)?.takesValue) value = argv[++i];
    flags.push({ raw: tok, name, value });
  }
  return { sub, flags };
}

const fixturePath = path.join(ROOT, 'test/fixtures/gh-help.json');
let fixture;
try {
  fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
} catch (err) {
  console.error(`❌ 读不到契约缓存 ${path.relative(ROOT, fixturePath)}：${err?.message || err}`);
  console.error('   生成方式：node scripts/cache-gh-help.mjs（需要本机有 gh）');
  process.exit(1);
}

const commands = fixture.commands || {};
const parsedCache = new Map();
const helpOf = (key) => {
  if (!parsedCache.has(key)) parsedCache.set(key, parseHelp(commands[key]));
  return parsedCache.get(key);
};

console.log('\n--- 0. 契约缓存基线 ---');
console.log(`gh 版本: ${fixture.ghVersion}   子命令条数: ${Object.keys(commands).length}   生成于: ${fixture.generatedAt}`);
ok(Object.keys(commands).length > 50, '契约缓存非空且规模合理', String(Object.keys(commands).length));

const rows = await collectArgv();
const withArgv = rows.filter((r) => r.argv.length > 0);

// 明确白名单：这些 action 不产生 gh 调用，或依赖真实文件系统，不参与 argv 校验
const SKIP = new Set([
  'github_status::health', // 纯本地遥测汇总，不调用 gh
]);
const skipHits = [];
for (const r of rows) {
  if (r.argv.length === 0) skipHits.push(`${r.tool}::${r.action}`);
}
const unexpectedSkips = skipHits.filter((s) => !SKIP.has(s));

console.log('\n--- 1. 覆盖完整性：每个 action 都采到了 argv ---');
ok(
  unexpectedSkips.length === 0,
  '除白名单外所有 action 都产生了 argv',
  unexpectedSkips.length ? `未采集到: ${unexpectedSkips.join(', ')}` : undefined
);
ok(skipHits.length <= 3, `SKIP 计数 ≤ 3（实际 ${skipHits.length}）`, skipHits.join(', '));

console.log('\n--- 2. 子命令存在性 ---');
const unknownSubs = new Map();
let argvChecked = 0;
for (const r of rows) {
  for (const argv of r.argv) {
    argvChecked++;
    const cands = subcommandCandidates(argv);
    const key = cands.find((c) => Object.prototype.hasOwnProperty.call(commands, c));
    if (!key) {
      const k = `${r.tool}::${r.action} → ${cands.join(' / ')}`;
      unknownSubs.set(k, argv.join(' '));
    }
  }
}
ok(
  unknownSubs.size === 0,
  `全部 ${argvChecked} 条 argv 的子命令都在 gh 契约缓存内`,
  unknownSubs.size ? [...unknownSubs.keys()].slice(0, 5).join(' ; ') : undefined
);

console.log('\n--- 3. flag 存在性（这是抓假 flag 的那道网）---');
const badFlags = [];
let flagChecked = 0;
for (const r of rows) {
  for (const argv of r.argv) {
    const cands = subcommandCandidates(argv);
    const key = cands.find((c) => Object.prototype.hasOwnProperty.call(commands, c));
    if (!key) continue;
    const help = helpOf(key);
    if (help.flags.size === 0) continue; // 命令组（如 `gh pr`）没有 FLAGS 区块，跳过
    const { flags } = splitArgv(argv, help);
    for (const f of flags) {
      flagChecked++;
      const hit =
        help.flags.has(f.name) ||
        [...help.flags.values()].some((v) => v.short && v.short === f.name);
      if (!hit) badFlags.push(`${r.tool}::${r.action}  ${key}  ${f.raw}`);
    }
  }
}
ok(
  badFlags.length === 0,
  `全部 ${flagChecked} 个 flag 都在 gh 的 FLAGS / INHERITED FLAGS 内`,
  badFlags.length ? [...new Set(badFlags)].slice(0, 8).join(' ; ') : undefined
);

console.log('\n--- 4. --json 字段存在性 ---');
const badFields = [];
let fieldChecked = 0;
for (const r of rows) {
  for (const argv of r.argv) {
    const cands = subcommandCandidates(argv);
    const key = cands.find((c) => Object.prototype.hasOwnProperty.call(commands, c));
    if (!key) continue;
    const help = helpOf(key);
    if (help.fields.size === 0) continue;
    const { flags } = splitArgv(argv, help);
    for (const f of flags) {
      if (f.name !== 'json' || !f.value) continue;
      for (const field of String(f.value).split(',')) {
        const name = field.trim();
        if (!name) continue;
        fieldChecked++;
        if (!help.fields.has(name)) badFields.push(`${r.tool}::${r.action}  ${key}  --json ${name}`);
      }
    }
  }
}
ok(
  badFields.length === 0,
  `全部 ${fieldChecked} 个 --json 字段都在 JSON FIELDS 内`,
  badFields.length ? [...new Set(badFields)].slice(0, 8).join(' ; ') : undefined
);

console.log('\n--- 5. 覆盖规模 ---');
console.log(`工具×action 条目: ${rows.length}   有 argv: ${withArgv.length}   argv 总数: ${argvChecked}`);
ok(withArgv.length >= 100, `采集到的 action 数 ≥ 100（实际 ${withArgv.length}）`);

console.log('\n========================================');
if (failed === 0) {
  console.log(`Phase 34 Contract Result: ${passed}/${passed} assertions PASSED!`);
} else {
  console.error(`Phase 34 Contract Result: ${failed} FAILED, ${passed} passed`);
  process.exitCode = 1;
}
