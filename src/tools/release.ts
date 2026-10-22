import type { GhExecutor } from '../executor.js';
import { wrapWithGate } from '../destructive.js';
import { renderReleaseMarkdown } from '../renderers/markdown.js';
import { assertPositionArg } from '../executor/args-guard.js';

function normalizeOutput(data: any): Record<string, any> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return { items: data, count: data.length };
  }
  return { result: data !== undefined && data !== null ? data : '' };
}

export function createReleaseTool(executor: GhExecutor) {
  return wrapWithGate({
    name: 'github_release',
    description: '管理 GitHub Releases 版本发布与构建资产：查看发版历史、根据提交自动生成发版说明、创建 Release、上传/下载发布资产（如 npm .tgz 产物）。高危操作（delete、clobber 覆盖上传）需 confirm: true。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'view', 'create', 'upload', 'download', 'delete'],
          description: 'Release 操作类型。',
        },
        repo: {
          type: 'string',
          description: '目标仓库 [owner/repo]，留空则自动识别当前本地 Git 仓库。',
        },
        tag: {
          type: 'string',
          description: '版本 Tag 名称（view/upload/download/delete 动作使用，如 "v0.1.9"；view 留空查看最新 Release）。',
        },
        title: {
          type: 'string',
          description: 'Release 标题（create 动作使用，留空且开启 generate_notes 时由 GitHub 自动生成）。',
        },
        notes: {
          type: 'string',
          description: 'Release 说明正文（create 动作使用）。留空且 generate_notes 为 true 时将自动由 GitHub 根据提交记录生成。',
        },
        generate_notes: {
          type: 'boolean',
          description: '是否自动生成 Release 说明（映射为 --generate-notes）。默认 true。',
        },
        draft: {
          type: 'boolean',
          description: '是否创建为草稿 Release（create 动作使用）。',
        },
        prerelease: {
          type: 'boolean',
          description: '是否标记为预发布版本 Pre-release（create 动作使用）。',
        },
        target: {
          type: 'string',
          description: '自动创建 Tag 时的目标分支或完整 commit SHA（create 动作使用，默认主分支）。',
        },
        assets: {
          type: 'array',
          items: { type: 'string' },
          description: '本地资产文件路径列表（create/upload 动作使用，如 ["./dsh-github-flow-0.1.9.tgz"]）。',
        },
        clobber: {
          type: 'boolean',
          description: '上传时覆盖同名旧资产（upload 动作使用）。破坏性操作：旧资产会先被删除，上传失败时无法恢复，需 confirm: true。',
        },
        pattern: {
          type: 'string',
          description: '仅下载匹配 glob 的资产（download 动作使用，如 "*.tgz"）。',
        },
        dir: {
          type: 'string',
          description: '资产下载目录（download 动作使用，默认当前目录 "."）。',
        },
        limit: {
          type: 'number',
          description: '返回 Release 数量上限（list 动作使用，默认 10，最大 50）。',
        },
        confirm: {
          type: 'boolean',
          description: '高危破坏性操作确认标志（delete 动作或 upload+clobber 时必需）。若为 false 则仅输出影响评估报告。',
        },
        cleanup_tag: {
          type: 'boolean',
          description: '删除 Release 时是否连同删除其 Git Tag（delete 动作可选，映射 --cleanup-tag）。默认 false：仅删 Release 保留 Tag。',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        return [{ type: 'text', text: renderReleaseMarkdown(args, value) }];
      },
    },
    async execute(args: any, execContext: any) {
      // 位置参数守卫：tag 是 `gh release view <tag>` / `upload <tag>` 的位置参数
      assertPositionArg(args.tag, 'Release Tag');
      const { cwd, sessionId } = executor.resolveExecScope(execContext);
      let repoTarget = args.repo;
      if (!repoTarget) {
        const meta = await executor.getRepoMetadata(cwd, sessionId);
        if (meta?.nameWithOwner) {
          repoTarget = meta.nameWithOwner;
        }
      }
      if (!repoTarget) {
        throw new Error(
          '未能自动识别当前工作区关联的 GitHub 仓库。请通过 `repo` 参数显式指定目标仓库 [owner/repo]。'
        );
      }

      const repoArgs = ['-R', repoTarget];
      const runOpts = { cwd, sessionId };

      switch (args.action) {
        case 'list': {
          // 显式 limit 优先；缺省回退 executor.defaultListLimit（上限 50 防止全量 Release 撑爆输出）
          const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 50) : Math.min(executor.defaultListLimit ?? 10, 50);
          const res = await executor.run(
            ['release', 'list', ...repoArgs, '-L', String(limit), '--json', 'tagName,name,isDraft,isPrerelease,publishedAt,createdAt'],
            runOpts
          );
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'view': {
          // gh release view 不带 tag 参数时展示最新 Release，与工具语义一致
          const target = args.tag ? [args.tag] : [];
          const res = await executor.run(
            ['release', 'view', ...target, ...repoArgs, '--json', 'tagName,name,body,publishedAt,isDraft,isPrerelease,assets,url'],
            runOpts
          );
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'create': {
          if (!args.tag) throw new Error('create 操作必须提供 tag（如 "v0.1.9"）');
          const createCmd = ['release', 'create', args.tag, ...repoArgs];
          // 资产文件直接跟在 tag 后（gh release create <tag> <files...>）
          if (Array.isArray(args.assets)) {
            for (const a of args.assets) {
              if (typeof a === 'string' && a.trim()) createCmd.push(assertPositionArg(a.trim(), '资产路径'));
            }
          }
          if (args.title) createCmd.push('--title', args.title);
          // notes 与 generate_notes 可共存：gh 会在自动生成的说明前 prepend 手写正文
          if (args.notes) createCmd.push('--notes', args.notes);
          if (args.generate_notes !== false) createCmd.push('--generate-notes');
          if (args.draft === true) createCmd.push('--draft');
          if (args.prerelease === true) createCmd.push('--prerelease');
          if (args.target) createCmd.push('--target', args.target);
          const res = await executor.run(createCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Release ${args.tag} 创建成功`, url: res.rawOutput };
        }

        case 'upload': {
          if (!args.tag) throw new Error('upload 操作必须提供 tag');
          if (!Array.isArray(args.assets) || args.assets.length === 0) {
            throw new Error('upload 操作必须提供 assets（文件路径列表）');
          }
          const uploadCmd = ['release', 'upload', args.tag, ...repoArgs];
          for (const a of args.assets) {
            // 每个资产都是位置参数：`--clobber` 混进来会绕过 confirm 闸门覆盖删同名资产
            // （复核报告 C-01a 的复现路径），必须在拼 argv 时就拒掉。
            if (typeof a === 'string' && a.trim()) uploadCmd.push(assertPositionArg(a.trim(), '资产路径'));
          }
          if (args.clobber === true) uploadCmd.push('--clobber');
          const res = await executor.run(uploadCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `已上传 ${args.assets.length} 个资产至 Release ${args.tag}`, output: res.rawOutput };
        }

        case 'download': {
          const target = args.tag ? [args.tag] : [];
          if (!args.tag && !args.pattern) {
            throw new Error('download 不带 tag 时（下载最新 Release）必须提供 pattern 过滤资产');
          }
          const dlCmd = ['release', 'download', ...target, ...repoArgs];
          if (args.pattern) dlCmd.push('--pattern', args.pattern);
          if (args.dir) dlCmd.push('--dir', args.dir);
          const res = await executor.run(dlCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Release 资产下载完成（目录: ${args.dir || '.'}）`, output: res.rawOutput };
        }

        case 'delete': {
          if (!args.tag) throw new Error('delete 操作必须提供 tag');
          const delCmd = ['release', 'delete', args.tag, ...repoArgs, '--yes'];
          if (args.cleanup_tag === true) delCmd.push('--cleanup-tag');
          const res = await executor.run(delCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Release ${args.tag} 已删除`, output: res.rawOutput };
        }

        default:
          throw new Error(`未知的 Release 操作: ${args.action}`);
      }
    },
  });
}
