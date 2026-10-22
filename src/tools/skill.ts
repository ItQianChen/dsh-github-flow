import path from 'node:path';
import { wrapWithGate } from '../destructive.js';
import fs from 'node:fs';
import type { GhExecutor } from '../executor.js';
import { renderSkillMarkdown, parseSkillPublishOutput } from '../renderers/markdown.js';

function normalizeOutput(data: any): Record<string, any> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return { items: data, count: data.length };
  }
  return { result: data !== undefined && data !== null ? data : '' };
}

export function createSkillTool(executor: GhExecutor) {
  return wrapWithGate({
    name: 'github_skill',
    description: '通过 GitHub CLI 官方生态发现与管理 Agent Skills：跨仓库检索开源 Skills、预览 SKILL.md 内容、安装到本地 Agent 宿主（Claude Code / Cursor / Copilot 等）、查看已安装列表、合规自检与安全发布（publish）以及检查与同步更新（update）。install 会写入磁盘需 confirm；publish 默认 --dry-run 自检，正式发布需 tag 与 confirm；update 默认 --dry-run 检查。基于 gh CLI preview 特性（需 gh >= 2.9x）。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'preview', 'install', 'list', 'publish', 'update'],
          description: 'Skill 操作类型。search 检索、preview 预览、install 安装、list 查看已安装、publish 校验/发布、update 检查与同步更新。',
        },
        query: {
          type: 'string',
          description: '搜索关键词（search 动作使用，如 "python"、"devops"、"markdown"）。',
        },
        owner: {
          type: 'string',
          description: '限定作者或组织（search 动作可选，映射 --owner）。',
        },
        repository: {
          type: 'string',
          description: '目标仓库全名 [owner/repo]（preview/install 动作使用，如 "github/awesome-copilot"）。',
        },
        skill_name: {
          type: 'string',
          description: 'Skill 名称（preview/install 动作可选）。支持 "name"、"author/name" 命名空间形式或 "name@version" 锁定版本。',
        },
        agent: {
          type: 'string',
          description: '安装到的目标 Agent 宿主（install 动作可选，如 "claude-code"、"cursor"、"github-copilot"；省略时 gh 会按环境探测）。',
        },
        scope: {
          type: 'string',
          enum: ['project', 'user'],
          description: '安装范围（install 动作可选，默认 project：安装进当前 git 仓库；user：安装到用户主目录全局可用）。',
        },
        all: {
          type: 'boolean',
          description: '安装仓库内全部 Skills 而非逐个选择（install 动作可选，映射 --all）。',
        },
        limit: {
          type: 'number',
          description: '搜索返回数量上限（search 动作使用，默认 15）。',
        },
        directory: {
          type: 'string',
          description: '待检查或发布的技能目录（publish 动作使用，缺省为当前工作区根目录）。',
        },
        dry_run: {
          type: 'boolean',
          description: '是否仅进行合规性验证而不发布（publish 动作使用，默认 true，零副作用安全验证模式）。',
        },
        fix: {
          type: 'boolean',
          description: '是否自动修复问题（如剥离残留的安装元数据，publish 动作使用，默认 false）。',
        },
        tag: {
          type: 'string',
          description: '发布的版本 Tag（如 "v1.0.0"），正式发布（dry_run: false）时必填（防交互式挂起）。',
        },
        skill_names: {
          type: 'array',
          items: { type: 'string' },
          description: '要更新的特定 Skill 名称列表（update 动作可选）。',
        },
        confirm: {
          type: 'boolean',
          description: '高危操作确认标志。install 写入本地磁盘、publish 正式创建 Release 时必需。未传 true 时输出影响评估并拦截。',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        return [{ type: 'text', text: renderSkillMarkdown(args, value) }];
      },
    },
    async execute(args: any, execContext: any) {
      const { cwd, sessionId } = executor.resolveExecScope(execContext);
      // skill 工具天然面向跨仓库生态（search/preview 均以显式 repository 为目标），
      // 不做当前工作区仓库自动识别——识别失败反而会误导调用方。

      const runOpts = { cwd, sessionId };

      switch (args.action) {
        case 'search': {
          if (!args.query) throw new Error('search 操作必须提供 query（搜索关键词）');
          // 显式 limit 优先；缺省回退 executor.defaultListLimit（上限 50，gh skill 默认 15）
          const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 50) : Math.min(executor.defaultListLimit ?? 15, 50);
          const searchCmd = [
            'skill', 'search', args.query,
            '-L', String(limit),
            // 字段名以 gh 2.96.0 实测为准；preview 特性字段可能随版本演进，
            // 渲染层已对缺失字段做回退，这里不做多余防御
            '--json', 'skillName,repo,description,namespace,stars',
          ];
          if (args.owner) searchCmd.push('--owner', args.owner);
          const res = await executor.run(searchCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'preview': {
          if (!args.repository) throw new Error('preview 操作必须提供 repository [owner/repo]');
          const previewCmd = ['skill', 'preview', args.repository];
          if (args.skill_name) previewCmd.push(args.skill_name);
          // SKILL.md 是长篇 Markdown 文档，套 JSON 反而破坏可读性
          const res = await executor.run(previewCmd, { ...runOpts, rawText: true, timeoutMs: 60_000 });
          if (!res.ok) throw new Error(res.error);
          return { result: res.rawOutput || '未找到该 Skill 的内容' };
        }

        case 'install': {
          if (!args.repository) throw new Error('install 操作必须提供 repository [owner/repo]');
          const installCmd = ['skill', 'install', args.repository];
          if (args.skill_name) installCmd.push(args.skill_name);
          if (args.agent) installCmd.push('--agent', args.agent);
          if (args.scope) installCmd.push('--scope', args.scope);
          if (args.all === true) installCmd.push('--all');
          const res = await executor.run(installCmd, { ...runOpts, timeoutMs: 120_000 });
          if (!res.ok) throw new Error(res.error);
          return { message: `Skill 安装成功（来源: ${args.repository}）`, output: res.rawOutput };
        }

        case 'list': {
          const listCmd = ['skill', 'list', '--json', 'skillName,sourceURL,scope,version,pinned,path'];
          if (args.scope) listCmd.push('--scope', args.scope);
          const res = await executor.run(listCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'publish': {
          const isFix = args.fix === true;
          const isDryRun = args.dry_run !== false && !isFix;
          const targetDir = typeof args.directory === 'string' && args.directory.trim() ? args.directory.trim() : undefined;

          // 1. 目录存在性 + 工作区包含性前置安全校验
          if (targetDir) {
            const workspaceRoot = path.resolve(cwd);
            const resolvedPath = path.resolve(cwd, targetDir);
            // 只校验存在性是不够的：`directory: "../.."` 可以指向仓库外任意目录，
            // 配合 dry_run:false + confirm:true 就能把仓库外的内容发布成 Release。
            // Windows 文件系统大小写不敏感（D:/Proj/Repo 与 d:/proj/repo 是同一目录），
            // 直接 startsWith 会把合法路径误判为越界，所以先归一再比。
            const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p);
            const rootNorm = norm(workspaceRoot);
            const pathNorm = norm(resolvedPath);
            if (pathNorm !== rootNorm && !pathNorm.startsWith(rootNorm + path.sep)) {
              throw new Error(`技能目录必须位于当前工作区内（工作区: ${workspaceRoot}，解析结果: ${resolvedPath}）。`);
            }
            if (!fs.existsSync(resolvedPath)) {
              throw new Error(`指定的技能目录不存在: ${targetDir}`);
            }
          }

          // 2. 正式发布分支（dry_run 为 false 且非 fix 模式）
          if (!isDryRun && !isFix) {
            // 防线 1: 必须显式指定版本 tag，防止 CLI 弹出交互式向导导致子进程永久挂起
            if (!args.tag || typeof args.tag !== 'string' || !args.tag.trim()) {
              throw new Error('正式发布 Skill（dry_run: false）必须提供版本 tag（如 "v1.0.0"），以防止 CLI 尝试进入交互式向导导致进程挂起');
            }
            const cleanTag = args.tag.trim();

            // 防线 2（破坏性发布的二级确认）已收口到 src/destructive.ts 的 github_skill.publish 条目——
            // 闸门在工厂入口执行，这里只剩 tag 前置校验与 argv 组装。

            const publishCmd = ['skill', 'publish'];
            if (targetDir) publishCmd.push(targetDir);
            publishCmd.push('--tag', cleanTag);

            const res = await executor.run(publishCmd, { ...runOpts, rawText: true, timeoutMs: 120_000 });
            if (!res.ok) {
              if (res.rawOutput) {
                return parseSkillPublishOutput(res.rawOutput, res.error || '', false, 'publish', targetDir, cleanTag);
              }
              throw new Error(res.error || '发布 Skill 失败');
            }
            return parseSkillPublishOutput(res.rawOutput || '', '', true, 'publish', targetDir, cleanTag);
          }

          // 3. 自动剥离安装元数据分支 (--fix)
          if (isFix) {
            const fixCmd = ['skill', 'publish'];
            if (targetDir) fixCmd.push(targetDir);
            fixCmd.push('--fix');

            const res = await executor.run(fixCmd, { ...runOpts, rawText: true, timeoutMs: 60_000 });
            const output = res.rawOutput || (res.ok ? '' : res.error || '');
            return parseSkillPublishOutput(output, res.error || '', res.ok, 'fix', targetDir);
          }

          // 4. 默认只读自检分支 (--dry-run)
          const dryRunCmd = ['skill', 'publish'];
          if (targetDir) dryRunCmd.push(targetDir);
          dryRunCmd.push('--dry-run');

          const res = await executor.run(dryRunCmd, { ...runOpts, rawText: true, timeoutMs: 60_000 });
          const combinedOutput = res.rawOutput || '';
          const stderrText = res.error || '';
          return parseSkillPublishOutput(combinedOutput, stderrText, res.ok, 'dry-run', targetDir);
        }

        case 'update': {
          const isDryRun = args.dry_run !== false;
          const updateCmd = ['skill', 'update'];
          if (isDryRun) updateCmd.push('--dry-run');
          if (args.all === true) updateCmd.push('--all');
          if (Array.isArray(args.skill_names) && args.skill_names.length > 0) {
            args.skill_names.forEach((name: string) => {
              if (name && typeof name === 'string' && name.trim()) {
                updateCmd.push(name.trim());
              }
            });
          } else if (args.skill_name && typeof args.skill_name === 'string') {
            updateCmd.push(args.skill_name.trim());
          }

          const res = await executor.run(updateCmd, { ...runOpts, rawText: true, timeoutMs: 90_000 });
          if (!res.ok) throw new Error(res.error);
          return {
            mode: isDryRun ? 'dry-run' : 'update',
            action: 'update',
            message: isDryRun ? 'Agent Skills 更新检查完成（Dry-run 只读模式）' : 'Agent Skills 已完成更新同步',
            output: res.rawOutput || 'All skills up to date.',
          };
        }

        default:
          throw new Error(`未知的 Skill 操作: ${args.action}`);
      }
    },
  });
}
