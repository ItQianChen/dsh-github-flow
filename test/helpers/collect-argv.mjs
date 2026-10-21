// test/helpers/collect-argv.mjs
//
// 契约测试与 fixture 生成器共用的「argv 采集器」。
//
// 为什么单独抽出来：phase34 要校验「工具下发的 flag 在 gh 里真实存在」，
// scripts/cache-gh-help.mjs 要生成同样的子命令清单。两处如果各写一份枚举逻辑，
// 迟早漂移成"测试验的是一套 argv，缓存抓的是另一套"。
//
// 设计要点：
// 1. 完全离线：executor.run 换成记录器，绝不真调 gh（零副作用）。
// 2. 每个 action 发一发"全可选参数"请求，最大化 flag 分支；抛错不致命，
//    只记录 error，由调用方决定是覆盖缺口还是真实失败。
// 3. 参数样例集中在这一个 SAMPLE 表里——新增 action 时只需要补样例。

import { readdirSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB_TOOLS = path.resolve(HERE, '../../lib/tools');

/**
 * 参数样例表。
 *
 * 取值原则：既要能过工具自身的形态校验（如 run_id 必须纯数字、cache_id 必须数字、
 * endpoint 必须含 /），又要让「可选 flag 分支」尽量打开（boolean 一律 true）。
 * confirm 恒为 true：破坏性动作只有过了确认闸门才会真正拼 argv。
 */
const SAMPLE = {
  // —— 标识 / 编号 ——
  pr_number: 1, issue_number: 1, discussion_number: 1, project_number: 1,
  run_id: '1', cache_id: '1', ruleset_id: '1', limit: 5, number: 1,
  gist_id: 'abc123', codespace: 'cs-1', task_id: 't1', item_id: 'PVTI_x',
  // —— 仓库 / 分支 / ref ——
  repo: 'owner/repo', repository: 'owner/repo', source_repo: 'owner/src', target_repo: 'owner/dst',
  org: 'my-org', owner: '@me', branch: 'main', base: 'main', head: 'feat/x', ref: 'main',
  base_branch: 'main', branch_name: 'feat/x', exclude: ['owner/noisy'],
  // —— 内容 ——
  title: 'x', body: 'x', content: 'x', description: 'x', notes: 'x', prompt: 'x',
  query: 'repo:owner/repo', search: 'bug', tag: 'v1.0.0', name: 'n1', new_name: 'n2',
  key: 'k1', endpoint: 'repos/owner/repo', directory: 'src', path: 'package.json',
  filename: 'f.txt', workflow: 'ci.yml', category: 'General', agent: 'a', custom_agent: 'a',
  jq: '.name', url: 'https://github.com/owner/repo/issues/1', target: 'x', value: 'x',
  color: 'd73a4a', app: 'actions', source: 'official', scope: 'project',
  kind: 'secret', method: 'GET', pattern: '*', filter: 'all', sort: 'name', order: 'asc',
  state: 'all', status: 'failure', merge_method: 'squash', review_decision: 'APPROVE',
  lock_reason: 'resolved', skill_name: 'a/b', dir: 'x', env: 'x',
  // —— 数组 / 对象 ——
  labels: ['bug'], add_labels: ['bug'], remove_labels: ['bug'], assignees: ['alice'],
  files: ['package.json'], assets: ['icon.svg'], skill_names: ['a/b'],
  inputs: { k: 'v' }, fields: { state: 'closed' },
  // —— 刻意留空：--attach 需要真实文件且受 gh 版本门禁，走 SKIP 白名单 ——
  attach_images: [], image_urls: [],
  // —— 布尔：一律 true 以打开可选分支 ——
  all: true, confirm: true, force: true, clobber: true, cleanup_tag: true, closed: true,
  comments: true, default_branch: false, delete_branch: true, draft: true, dry_run: false,
  fix: false, generate_notes: true, include_badges: true, log: true, no_parents: true,
  paginate: true, prerelease: true, public: false, raw: true, stat_only: true, undo: true,
};

/**
 * 需要多变体才能覆盖全部分支的工具。
 *
 * `github_secret` 是唯一一个：kind=secret 时才有 `--app`，kind=variable 时传 app 会直接报错，
 * 而 `get` 只对 variable 可用。单一样例必然漏掉一半 argv，所以按变体各跑一发再取并集。
 */
const VARIANTS = {
  // stat_only 决定走 pr view 还是 pr diff——单一样例会永远只覆盖其中一条，
  // 另一条的 flag 就没人验了。
  github_pr: [{ stat_only: true }, { stat_only: false }],
  github_secret: [
    { kind: 'secret', app: 'actions', visibility: 'all' },
    { kind: 'variable', app: undefined, visibility: undefined },
  ],
};

/** 兜底：样例表没覆盖到的参数名按类型给个安全值 */
function fallbackValue(spec) {
  switch (spec?.type) {
    case 'number': return 1;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    default: return 'x';
  }
}

/**
 * 构造某个工具的 mock executor。
 * 只实现工具层真正用到的表面（run/runGuarded/getRepoMetadata/getGhVersion/
 * getLocalGitStatus/ensureCleanWorkspace/resolveWorkspaceCwd/defaultListLimit）。
 */
function makeMock(recorded) {
  const mock = {
    defaultListLimit: 20,
    async run(cmd) {
      recorded.push([...cmd]);
      return { ok: true, data: {}, rawOutput: 'ok' };
    },
    async runGuarded(cmd) {
      recorded.push([...cmd]);
      return { ok: true, data: {}, rawOutput: 'ok' };
    },
    async getRepoMetadata() {
      return { nameWithOwner: 'owner/repo' };
    },
    async getGhVersion() {
      return '2.96.0';
    },
    async getLocalGitStatus() {
      return { branch: 'main', ahead: 0, behind: 0, dirtyCount: 0, hasUpstream: true, dirtyFiles: [] };
    },
    async ensureCleanWorkspace() {
      return { ok: true, dirtyCount: 0, samples: [] };
    },
    resolveWorkspaceCwd() {
      return process.cwd();
    },
  };
  return mock;
}

/** 列出全部工具工厂（排除非工具模块） */
function listToolFactories() {
  return readdirSync(LIB_TOOLS)
    .filter((f) => f.endsWith('.js') && !['image-utils.js'].includes(f))
    .sort();
}

/**
 * 采集全部工具 × action 的 argv。
 * @returns {Promise<Array<{tool: string, action: string, argv: string[], error?: string}>>}
 */
export async function collectArgv() {
  const results = [];
  // `github_run download` 会在 os.homedir() 下 mkdir artifact 目录；沙箱里写不进去会 EPERM，
  // 于是该 action 采不到 argv。把 homedir 临时指向系统临时区即可（采完立刻还原）。
  const origUserProfile = process.env.USERPROFILE;
  const origHome = process.env.HOME;
  const fakeHome = path.join(os.tmpdir(), 'dsh-contract-home');
  try {
    mkdirSync(fakeHome, { recursive: true });
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
  } catch {
    /* 临时目录不可写就保持原样，download 会退化成 SKIP */
  }

  try {
    for (const file of listToolFactories()) {
      const mod = await import(`file://${LIB_TOOLS.replace(/\\/g, '/')}/${file}`);
      const factory = Object.entries(mod).find(([k, v]) => k.startsWith('create') && typeof v === 'function')?.[1];
      if (!factory) continue;

      const recorded = [];
      const tool = factory(makeMock(recorded));
      const props = tool?.parameters?.properties ?? {};
      const actions = props.action?.enum ?? [];
      // 没有 action 枚举的工具（github_help / github_api）不参与 action 维度覆盖，
      // 但仍跑一发全参数，让它们的 argv 也进契约校验。
      const actionList = actions.length ? actions : [undefined];
      const variants = VARIANTS[tool.name] ?? [null];

      for (const action of actionList) {
        for (const variant of variants) {
          const variantObj = variant || {};
          // 变体显式声明过的键（含 undefined）不再走兜底——否则兜底会把
          // 变体刻意去掉的参数又补回来（例如 variable 不能带 visibility/app）。
          const variantKeys = new Set(Object.keys(variantObj));
          const params = { ...SAMPLE, ...variantObj };
          if (action !== undefined) params.action = action;
          // 逐参数兜底：样例表没覆盖到的按类型补
          for (const [key, spec] of Object.entries(props)) {
            if (key === 'action') continue;
            if (variantKeys.has(key)) continue;
            if (!(key in params)) params[key] = fallbackValue(spec);
          }
          // 变体里显式置 undefined 的键要真正移除，否则会被当成"传了空值"
          for (const [key, val] of Object.entries(params)) {
            if (val === undefined) delete params[key];
          }
          recorded.length = 0;
          const entry = { tool: tool.name, action: action ?? '(none)', argv: [], error: undefined };
          try {
            await tool.execute(params, { cwd: process.cwd(), sessionId: 'contract-test' });
          } catch (err) {
            entry.error = String(err?.message || err);
          }
          entry.argv = recorded.map((c) => [...c]);
          // 多变体：同一 action 只保留一条记录，argv 取并集（后续变体追加）
          const existing = results.find((r) => r.tool === entry.tool && r.action === entry.action);
          if (existing) {
            existing.argv.push(...entry.argv);
            if (!entry.error) existing.error = undefined;
          } else {
            results.push(entry);
          }
        }
      }
    }
  } finally {
    if (origUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = origUserProfile;
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
  }
  return results;
}

/** 从 argv 里推导可能的 gh 子命令键（先试两段，再试一段） */
export function subcommandCandidates(argv) {
  const head = [];
  for (const tok of argv) {
    if (/^-/.test(tok)) break;
    head.push(tok);
  }
  const out = [];
  if (head.length >= 2) out.push(head.slice(0, 2).join(' '));
  if (head.length >= 1) out.push(head[0]);
  return out;
}
