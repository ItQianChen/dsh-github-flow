#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * GitHub Release 专业更新日志生成器
 * 参照设计规范：智能解析范围提交、依据 Conventional Commits 归类、自动映射中文 Scope 并注入安装指引
 */
function main() {
  const args = parseArgs(process.argv.slice(2));

  // 1. 读取版本号（优先命令行参数，兜底 package.json）
  let version = args.version;
  if (!version) {
    try {
      const pkgPath = resolve(__dirname, '../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      version = pkg.version;
    } catch {
      version = 'latest';
    }
  }

  const maxCommits = Number.parseInt(args.maxCommits || '50', 10);
  const releaseTag = args.releaseTag || `v${version}`;
  const previousTag = args.previousTag || findPreviousTag(releaseTag);
  const range = previousTag ? `${previousTag}..HEAD` : 'HEAD';

  console.log(`[generate-release-notes] 正在为 ${releaseTag} 生成更新日志 (范围: ${range})...`);

  // 2. 提取并解析 Commit 记录 (支持从文件读取或直接跑 git log)
  let commits = [];
  if (args.commitsFile) {
    try {
      const raw = readFileSync(args.commitsFile, 'utf8');
      commits = parseLogLines(raw);
    } catch (e) {
      console.warn(`[generate-release-notes] 读取 commitsFile 失败: ${e.message}`);
    }
  }
  if (commits.length === 0) {
    commits = readCommits(range, maxCommits);
  }

  // 3. 渲染结构化 Markdown
  const markdown = renderReleaseNotes(version, releaseTag, previousTag, commits);

  // 4. 输出到指定文件或控制台
  if (args.output) {
    mkdirSync(dirname(args.output), { recursive: true });
    writeFileSync(args.output, markdown, 'utf8');
    console.log(`[generate-release-notes] ✅ 发布日志已成功写入: ${args.output}`);
  } else {
    console.log('\n--- 生成结果预览 ---\n');
    console.log(markdown);
  }
}

const changeCategories = [
  { key: 'features', title: '🚀 新增与改进' },
  { key: 'fixes', title: '🐛 问题修复' },
  { key: 'stability', title: '⚡ 稳定性与性能优化' },
  { key: 'docs', title: '📚 文档完善' },
  { key: 'security', title: '🛡️ 安全更新' },
];

const scopeLabels = new Map([
  ['upgrade', '升级引擎'],
  ['updater', '版本检测'],
  ['ui', '界面交互'],
  ['client', 'Web客户端'],
  ['api', 'API服务'],
  ['auth', 'CLI认证'],
  ['tools', 'Agent工具'],
  ['executor', '执行引擎'],
  ['commands', 'Slash指令'],
  ['docs', '文档'],
  ['deps', '依赖'],
  ['config', '配置'],
  ['cache', '本地缓存'],
  ['core', '微内核'],
]);

function findPreviousTag(currentTag) {
  try {
    const tags = runGit(['tag', '--merged', 'HEAD', '--sort=-v:refname'])
      .split(/\r?\n/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag) => /^v\d+\.\d+\.\d+(?:[-+].*)?$/.test(tag))
      .filter((tag) => tag !== currentTag);

    return tags[0] || '';
  } catch {
    return '';
  }
}

function parseLogLines(rawText) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, ...subjectParts] = line.split('\t');
      return {
        hash,
        subject: (subjectParts.join('\t') || '').trim(),
      };
    })
    .filter((commit) => commit.hash && commit.subject)
    .filter((commit) => !isNoiseCommit(commit.subject))
    .map((commit) => ({
      ...commit,
      ...parseConventionalSubject(commit.subject),
    }));
}

function readCommits(range, limit) {
  try {
    const raw = runGit([
      'log',
      '--first-parent',
      `--max-count=${limit}`,
      '--format=%h%x09%s',
      range,
    ]);

    return parseLogLines(raw);
  } catch (err) {
    console.warn(`[generate-release-notes] 读取 git log 失败: ${err.message}`);
    return [];
  }
}

function parseConventionalSubject(subject) {
  const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s+(.+)$/i);
  if (!match) {
    return {
      type: '',
      scope: '',
      description: subject,
    };
  }
  return {
    type: match[1].toLowerCase(),
    scope: (match[2] || '').toLowerCase(),
    description: match[3].trim(),
  };
}

function renderReleaseNotes(version, releaseTag, previousTag, parsedCommits) {
  const grouped = Object.fromEntries(changeCategories.map((item) => [item.key, []]));

  for (const commit of parsedCommits) {
    const category = categorizeCommit(commit);
    if (!category) continue;
    const note = toUserNote(commit);
    if (note && !grouped[category].includes(note)) {
      grouped[category].push(note);
    }
  }

  const lines = [
    `# 🚀 dsh-github-flow ${releaseTag}`,
    '',
    '## 📦 安装与升级',
    '',
    '```bash',
    '# 场景 A: DSH 桌面端 (Desktop Profile)',
    `dsh plugin --profile desktop add dsh-github-flow@${version}`,
    '',
    '# 场景 B: DSH Web / CLI 终端环境（--profile 为官方 CLI 必填参数）',
    `dsh plugin --profile web add dsh-github-flow@${version}`,
    '```',
    '',
    '## 📝 更新内容',
    '',
  ];

  let hasNotes = false;
  for (const category of changeCategories) {
    const items = grouped[category.key];
    if (items.length === 0) continue;
    hasNotes = true;
    lines.push(`### ${category.title}`, '');
    lines.push(...items.map((item) => `- ${item}`), '');
  }

  if (!hasNotes) {
    lines.push('- 本次发版包含常规系统维护、跨平台稳定性增强与细节优化。', '');
  }

  // 原始提交审计追踪
  lines.push('## 🔍 变更详情与原始提交记录', '');
  if (previousTag) {
    lines.push(`- **对比基线**: \`${previousTag}...${releaseTag}\``);
  }
  if (parsedCommits.length > 0) {
    lines.push(...parsedCommits.map((c) => `- \`${c.hash}\` ${c.subject}`), '');
  } else {
    lines.push('- 暂无详细提交记录。', '');
  }

  lines.push('---');
  lines.push(`> 💡 **提示**：Node.js 运行时对已载入模块存在强缓存，升级后**请重启 DSH 服务以完全加载最新后端工具**。`);

  return lines.join('\n').trim() + '\n';
}

function categorizeCommit(commit) {
  if (commit.type === 'feat') return 'features';
  if (commit.type === 'fix') return 'fixes';
  if (commit.type === 'security') return 'security';
  if (commit.type === 'perf' || commit.type === 'refactor') return 'stability';
  if (commit.type === 'docs') return 'docs';
  return '';
}

function toUserNote(commit) {
  const prefix = scopeLabels.get(commit.scope) || commit.scope;
  let text = commit.description;

  if (prefix) {
    return `**${prefix}**：${text}`;
  }
  return text;
}

function isNoiseCommit(subject) {
  return [
    /^merge\b/i,
    /^chore\(release\):\s*(更新版本号|bump version)/i,
    /^chore:\s*(升级版本|更新版本号|bump version)/i,
  ].some((pattern) => pattern.test(subject));
}

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = 'true';
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

main();
