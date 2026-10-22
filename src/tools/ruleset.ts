import type { GhExecutor } from '../executor.js';
import { wrapWithGate } from '../destructive.js';
import { renderRulesetMarkdown } from '../renderers/markdown.js';

export interface ParsedRule {
  name: string;
  params: string;
  source: string;
}

export interface ParsedRulesetCheck {
  ruleCount: number;
  branch: string;
  repo: string;
  rules: ParsedRule[];
  rawText: string;
}

/**
 * 解析 gh ruleset check 的纯文本输出，提取适用规则数、分支、仓库以及具体规则详情
 */
export function parseRulesetCheckOutput(output: string): ParsedRulesetCheck {
  const trimmed = (output || '').trim();
  const result: ParsedRulesetCheck = {
    ruleCount: 0,
    branch: '',
    repo: '',
    rules: [],
    rawText: trimmed,
  };

  if (!trimmed) return result;

  // 1. 匹配首行: "N rules apply to branch <branch> in repo <repo>"
  const firstLineMatch = trimmed.match(/^(\d+)\s+rules?\s+apply\s+to\s+branch\s+(\S+)\s+in\s+repo\s+(\S+)/i);
  if (firstLineMatch) {
    result.ruleCount = parseInt(firstLineMatch[1], 10);
    result.branch = firstLineMatch[2];
    result.repo = firstLineMatch[3];
  }

  // 2. 匹配具体规则明细项：形如 "- <name>: <params>\n    (configured in <source>)"
  const rulePattern = /-\s*([a-zA-Z0-9_-]+):\s*([^\n\r]+)(?:[\r\n]+\s*\((configured in [^)]+)\))?/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(trimmed)) !== null) {
    result.rules.push({
      name: match[1],
      params: (match[2] || '').trim(),
      source: (match[3] || '').trim(),
    });
  }

  // 若首行未声明数量但解析到了规则列表，自动校正
  if (result.rules.length > 0 && result.ruleCount === 0) {
    result.ruleCount = result.rules.length;
  }

  return result;
}

export function createRulesetTool(executor: GhExecutor) {
  return wrapWithGate({
    name: 'github_ruleset',
    description: '查看与诊断 GitHub 仓库/组织规则集 (Rulesets)：检查分支适用的合并策略规则 (check)、查看规则集列表 (list) 与详情 (view)。是诊断“PR 为什么不能合并”的权威规则策略视角。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'view', 'check'],
          description: 'Ruleset 操作类型。check 检查分支规则约束（策略排障核心）、list 查看规则集列表、view 查看规则集详情。',
        },
        repo: {
          type: 'string',
          description: '目标仓库 [owner/repo]，留空则识别当前工作区仓库。',
        },
        branch: {
          type: 'string',
          description: '要检查的分支名称（check 动作使用，缺省为当前分支）。',
        },
        default_branch: {
          type: 'boolean',
          description: '是否直接检查目标仓库默认分支的规则约束（check 动作可选，映射 --default）。',
        },
        ruleset_id: {
          type: 'string',
          description: '规则集 ID（view 动作必需，避免交互式选择挂起）。',
        },
        org: {
          type: 'string',
          description: '组织名称（list, view 动作可选，查看组织级规则集；需 admin:org 权限）。',
        },
        no_parents: {
          type: 'boolean',
          description: '是否排除上级组织配置的继承规则集（list, view 动作可选，默认包含上级继承；true 时仅看当前层级）。',
        },
        limit: {
          type: 'number',
          description: '返回规则集数量上限（list 动作使用，默认 30）。',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        return [{ type: 'text', text: renderRulesetMarkdown(args, value) }];
      },
    },
    async execute(args: any, execContext: any) {
      const { cwd, sessionId } = executor.resolveExecScope(execContext);

      // 解析当前工作区仓库（若未传 org 且需要 repo 维度）
      const resolveRepoTarget = async (): Promise<string> => {
        if (args.repo) return args.repo;
        const meta = await executor.getRepoMetadata(cwd, sessionId);
        if (meta?.nameWithOwner) return meta.nameWithOwner;
        throw new Error(
          '未能自动识别当前工作区关联的 GitHub 仓库。请通过 `repo` 参数显式指定目标仓库 [owner/repo]（例如: "ItQianChen/dsh-github-flow"），或在当前工作区目录下关联 Git 远程仓库。'
        );
      };

      const runOpts = { cwd, sessionId };

      switch (args.action) {
        case 'check': {
          const repoTarget = await resolveRepoTarget();
          const checkCmd = ['ruleset', 'check'];
          if (args.branch) {
            checkCmd.push(args.branch);
          }
          if (args.default_branch) {
            checkCmd.push('--default');
          }
          checkCmd.push('-R', repoTarget);

          const res = await executor.run(checkCmd, { ...runOpts, rawText: true });
          if (!res.ok) throw new Error(res.error);
          const parsed = parseRulesetCheckOutput(res.rawOutput || '');
          if (!parsed.repo) parsed.repo = repoTarget;
          if (!parsed.branch && args.branch) parsed.branch = args.branch;
          return parsed;
        }

        case 'list': {
          const listCmd = ['ruleset', 'list'];
          let repoTarget = '';
          if (args.org) {
            listCmd.push('--org', args.org);
          } else {
            repoTarget = await resolveRepoTarget();
            listCmd.push('-R', repoTarget);
          }

          if (args.no_parents) {
            // gh 只有 -p/--parents（默认 true），没有 --no-parents（实测 2.96.0 unknown flag）。
            // 排除继承的语义等价写法是显式关掉 --parents。
            listCmd.push('--parents=false');
          }
          const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 30;
          listCmd.push('-L', String(limit));

          const res = await executor.run(listCmd, { ...runOpts, rawText: true });
          if (!res.ok) throw new Error(res.error);
          return {
            rawText: (res.rawOutput || '').trim(),
            org: args.org,
            repo: repoTarget,
          };
        }

        case 'view': {
          if (args.ruleset_id === undefined || args.ruleset_id === null || String(args.ruleset_id).trim() === '') {
            throw new Error('查看规则集详情时 `ruleset_id` 参数为必填项（输入规则集数字 ID，如 "4898070"）。');
          }

          const viewCmd = ['ruleset', 'view', String(args.ruleset_id)];
          let repoTarget = '';
          if (args.org) {
            viewCmd.push('--org', args.org);
          } else {
            repoTarget = await resolveRepoTarget();
            viewCmd.push('-R', repoTarget);
          }

          if (args.no_parents) {
            // 同 list：排除继承用 --parents=false，不存在 --no-parents。
            viewCmd.push('--parents=false');
          }

          const res = await executor.run(viewCmd, { ...runOpts, rawText: true });
          if (!res.ok) throw new Error(res.error);
          return {
            ruleset_id: String(args.ruleset_id),
            rawText: (res.rawOutput || '').trim(),
            org: args.org,
            repo: repoTarget,
          };
        }

        default:
          throw new Error(`不支持的 ruleset 操作: "${args.action}"。可选值: check, list, view。`);
      }
    },
  });
}
