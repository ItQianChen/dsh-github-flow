import type { GhExecutor } from '../executor.js';
import { wrapWithGate } from '../destructive.js';
import { compareGhVersions } from '../executor.js';
import { renderIssueMarkdown } from '../renderers/markdown.js';
import { extractImageUrls, downloadImages, buildImageBlocks, filterRequestedUrls, validateAttachPaths } from './image-utils.js';
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

// 共享图片工具链的同名再导出：保持路径与单测稳定
export { extractImageUrls as extractIssueImageUrls, validateAttachPaths } from './image-utils.js';

export function createIssueTool(executor: GhExecutor) {
  return wrapWithGate({
    name: 'github_issue',
    description: '管理 GitHub Issues。支持查看 Issue 列表、详情、创建新 Issue、追加评论、关闭 Issue、编辑 Issue 以及关联创建本地开发分支 (develop)。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'view', 'create', 'comment', 'close', 'reopen', 'edit', 'develop', 'view_images', 'delete', 'transfer', 'pin', 'unpin', 'lock', 'unlock', 'status'],
          description: 'Issue 操作类型。view_images 下载正文内的图片到本地并返回可渲染的图片内容块（Agent 可直接"看"用户报障截图）。delete 物理删除不可恢复、transfer 跨仓库迁移，两者均需 confirm: true。',
        },
        issue_number: {
          type: 'number',
          description: 'Issue 编号（view, comment, close, reopen, edit, develop, delete, transfer, pin/unpin/lock/unlock 时使用）。',
        },
        target_repo: {
          type: 'string',
          description: 'transfer 动作必填：迁移目标仓库 [owner/repo]（迁移后原 URL 301 重定向，归属不可静默撤回）。',
        },
        lock_reason: {
          type: 'string',
          enum: ['off_topic', 'resolved', 'spam', 'too_heated'],
          description: 'lock 动作可选：锁定原因（gh 实测四合法值）。',
        },
        repo: {
          type: 'string',
          description: '目标仓库 [owner/repo]，留空则识别当前仓库。',
        },
        title: {
          type: 'string',
          description: 'Issue 标题（create 或 edit 时使用）。',
        },
        body: {
          type: 'string',
          description: 'Issue 描述正文或追加评论内容（create, comment, edit 时使用）。',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: '标签名称列表（create 或 list 动作筛选使用）。',
        },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: '被指派人的 GitHub 登录名列表（create 或 list 动作筛选使用）。',
        },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Issue 状态过滤（list 动作使用，可选 open, closed, all，默认 open）。',
        },
        limit: {
          type: 'number',
          description: '返回 Issue 数量上限（list 动作使用，默认 20，建议最大不超过 100）。',
        },
        branch_name: {
          type: 'string',
          description: '开发分支名称（develop 动作使用，例如 "fix-auth-bug"）。',
        },
        add_labels: {
          type: 'array',
          items: { type: 'string' },
          description: '要追加的标签列表（edit 动作使用）。',
        },
        remove_labels: {
          type: 'array',
          items: { type: 'string' },
          description: '要移除的标签列表（edit 动作使用）。',
        },
        confirm: {
          type: 'boolean',
          description: '高危破坏性操作确认标志（close/delete/transfer 动作必需）。delete 物理删除不可恢复、transfer 跨仓库迁移，拦截级别高于 close。',
        },
        image_urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'view_images 可选：仅下载指定 URL 的图片（从 view 返回的 images 清单中选取，不在清单内的会被拒绝）。留空下载全部（正文+评论）。',
        },
        attach_images: {
          type: 'array',
          items: { type: 'string' },
          description: '本地图片/附件路径列表（create, edit, comment 动作使用，需 gh ≥ 2.99；禁止 URL，单批上限 50 个）。',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        // view_images 的图片以宿主 image 内容块输出：模型与人类都能直接看到图，
        // base64 会污染上下文（一张截图 ~88KB），引用落盘文件由宿主按需加载
        return [{ type: 'text', text: renderIssueMarkdown(args, value) }, ...buildImageBlocks(value)];
      },
    },
    async execute(args: any, execContext: any) {
      // 位置参数守卫：issue_number 是 `gh issue <cmd> <number>` 的位置参数
      assertPositionArg(args.issue_number, 'Issue 编号');
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
          '未能自动识别当前工作区关联的 GitHub 仓库。请通过 `repo` 参数显式指定目标仓库 [owner/repo]（例如: "ItQianChen/dsh-github-flow"），或在当前工作区目录下关联 Git 远程仓库。'
        );
      }

      const repoArgs = ['-R', repoTarget];
      const runOpts = { cwd, sessionId };

      const appendAttachFlags = async (cmd: string[], attachImages: unknown) => {
        const attachPaths = validateAttachPaths(attachImages, cwd);
        if (attachPaths.length > 0) {
          const version = await executor.getGhVersion();
          if (version && compareGhVersions(version, '2.99.0') < 0) {
            throw new Error(
              `附件上传能力 (\`--attach\`) 需要 GitHub CLI 版本 ≥ 2.99.0，当前版本为: ${version}。\n请升级 gh（Windows: \`winget upgrade GitHub.cli\`，macOS: \`brew upgrade gh\`）后再试。`
            );
          }
          for (const p of attachPaths) {
            cmd.push('--attach', p);
          }
        }
      };

      switch (args.action) {
        case 'list': {
          const listCmd = ['issue', 'list', ...repoArgs, '--json', 'number,title,state,author,labels,updatedAt,url'];
          if (args.state) {
            listCmd.push('--state', args.state);
          }
          if (args.labels && Array.isArray(args.labels) && args.labels.length > 0) {
            for (const l of args.labels) {
              listCmd.push('--label', l);
            }
          }
          if (args.assignees && Array.isArray(args.assignees) && args.assignees.length > 0) {
            // gh issue list 的 --assignee 仅支持单账号或 @me，传逗号连接会导致 GraphQL 报用户未找到
            listCmd.push('--assignee', args.assignees[0]);
          }
          // 显式 limit 优先；缺省回退 executor.defaultListLimit（用户可在插件配置中调整）
          const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : Math.min(executor.defaultListLimit ?? 20, 100);
          listCmd.push('-L', String(limit));

          const res = await executor.run(listCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'view': {
          if (!args.issue_number) throw new Error('view 操作必须提供 issue_number');
          const res = await executor.run(
            ['issue', 'view', String(args.issue_number), ...repoArgs, '--json', 'number,title,body,state,author,labels,assignees,comments,url'],
            runOpts
          );
          if (!res.ok) throw new Error(res.error);
          const out = normalizeOutput(res.data || res.rawOutput);
          // 附带图片 URL 清单（正文+评论，与 view_images 提取范围同源）：
          // Agent 按正文里的原始 URL 决策，需要看图时用 image_urls 精准选取
          const bodies = [typeof out.body === 'string' ? out.body : ''];
          if (Array.isArray(out.comments)) {
            for (const c of out.comments) {
              if (c && typeof c.body === 'string') bodies.push(c.body);
            }
          }
          out.images = Array.from(new Set(bodies.flatMap((b) => extractImageUrls(b))));
          return out;
        }

        case 'view_images': {
          if (!args.issue_number) throw new Error('view_images 操作必须提供 issue_number');
          // 第一步：取正文+评论提取图片 URL（与 view 清单同源）
          const detail = await executor.run(
            ['issue', 'view', String(args.issue_number), ...repoArgs, '--json', 'body,comments'],
            runOpts
          );
          if (!detail.ok) throw new Error(detail.error);
          const d = detail.data && typeof detail.data === 'object' ? detail.data as any : {};
          const bodies = [typeof d.body === 'string' ? d.body : ''];
          if (Array.isArray(d.comments)) {
            for (const c of d.comments) {
              if (c && typeof c.body === 'string') bodies.push(c.body);
            }
          }
          const extracted = Array.from(new Set(bodies.flatMap((b) => extractImageUrls(b))));
          if (extracted.length === 0) {
            return { message: `Issue #${args.issue_number} 正文与评论中未发现图片附件。` };
          }

          // 第二步：目标选择——不传 image_urls 下载全部；传入则与正文清单
          // 严格交集（防幻觉/诱导的任意 URL 下载），空数组视为误传明确报错
          let targets = extracted;
          const rejections: string[] = [];
          if (args.image_urls !== undefined) {
            if (!Array.isArray(args.image_urls) || args.image_urls.length === 0) {
              throw new Error('image_urls 为空数组：如需下载全部请省略该参数，如需指定请传入 view 返回清单中的 URL。');
            }
            const filtered = filterRequestedUrls(args.image_urls, extracted);
            targets = filtered.matched;
            for (const bad of filtered.rejected) {
              rejections.push(`${String(bad).slice(-24)}: 不在本 Issue 图片清单中，已拒绝（防任意下载）`);
            }
          }

          // 第三步：共享下载执行体（gh api 二进制通道 + 魔数校验 + 字节护栏 + 内容寻址落盘）
          const { images, failures: dlFailures, remaining } = await downloadImages(
            targets,
            (url) => executor.run<Buffer>(['api', url], { ...runOpts, binary: true, timeoutMs: 30_000 })
          );

          const failures = [...rejections, ...dlFailures];
          if (images.length === 0 && rejections.length === 0 && !remaining) {
            return { message: `Issue #${args.issue_number} 的图片全部下载失败：`, failures };
          }
          if (images.length === 0) {
            return { message: `Issue #${args.issue_number} 未能获取任何图片（请求 ${targets.length} 张，被拒 ${rejections.length} 张）`, failures, remaining };
          }
          return {
            message: `Issue #${args.issue_number} 成功获取 ${images.length} 张图片${failures.length ? `（${failures.length} 条失败/提示）` : ''}：`,
            images,
            failures: failures.length ? failures : undefined,
            // 续传清单：触顶时 Agent 直接 image_urls: remaining 发起下一批
            remaining,
          };
        }

        case 'create': {
          const cmd = ['issue', 'create', ...repoArgs, '--title', args.title || '', '--body', args.body || ''];
          if (args.labels && Array.isArray(args.labels) && args.labels.length > 0) {
            cmd.push('--label', args.labels.join(','));
          }
          if (args.assignees && Array.isArray(args.assignees) && args.assignees.length > 0) {
            cmd.push('--assignee', args.assignees.join(','));
          }
          await appendAttachFlags(cmd, args.attach_images);
          const res = await executor.run(cmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: 'Issue 创建成功', url: res.rawOutput };
        }

        case 'edit': {
          if (!args.issue_number) throw new Error('edit 操作必须提供 issue_number');
          const editCmd = ['issue', 'edit', String(args.issue_number), ...repoArgs];
          if (args.title) editCmd.push('--title', args.title);
          if (args.body) editCmd.push('--body', args.body);
          if (args.add_labels && Array.isArray(args.add_labels) && args.add_labels.length > 0) {
            for (const l of args.add_labels) editCmd.push('--add-label', l);
          }
          if (args.remove_labels && Array.isArray(args.remove_labels) && args.remove_labels.length > 0) {
            for (const l of args.remove_labels) editCmd.push('--remove-label', l);
          }
          await appendAttachFlags(editCmd, args.attach_images);
          const res = await executor.run(editCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Issue #${args.issue_number} 更新成功`, output: res.rawOutput };
        }

        case 'develop': {
          if (!args.issue_number) throw new Error('develop 操作必须提供 issue_number');

          // `--checkout` 会把工作区切到新分支，脏改动会被一起带走——与界面切分支同源风险，
          // 必须过同一道闸门（executor.ensureCleanWorkspace，唯一实现）。
          const guard = await executor.ensureCleanWorkspace(cwd);
          if (!guard.ok) {
            const sample = guard.samples.length
              ? `\n涉及文件（前 ${guard.samples.length} 条）：\n${guard.samples.map((s) => '  ' + s).join('\n')}`
              : '';
            throw new Error(`${guard.error}${sample}\n请先提交或 stash 后再创建并检出开发分支。`);
          }

          const devCmd = ['issue', 'develop', String(args.issue_number), ...repoArgs, '--checkout'];
          if (args.branch_name) {
            devCmd.push('-n', args.branch_name);
          }
          const res = await executor.run(devCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `已成功为 Issue #${args.issue_number} 创建并检出开发分支`, output: res.rawOutput };
        }

        case 'comment': {
          if (!args.issue_number || !args.body) throw new Error('comment 必须提供 issue_number 和 body');
          const commentCmd = ['issue', 'comment', String(args.issue_number), ...repoArgs, '--body', args.body];
          await appendAttachFlags(commentCmd, args.attach_images);
          const res = await executor.run(commentCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: '评论发布成功', output: res.rawOutput };
        }

        case 'close': {
          if (!args.issue_number) throw new Error('close 操作必须提供 issue_number');
          const res = await executor.run(['issue', 'close', String(args.issue_number), ...repoArgs], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Issue #${args.issue_number} 已成功关闭` };
        }

        case 'reopen': {
          if (!args.issue_number) throw new Error('reopen 操作必须提供 issue_number');
          const res = await executor.run(['issue', 'reopen', String(args.issue_number), ...repoArgs], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Issue #${args.issue_number} 已重新开启` };
        }

        // ---- 变更面新增（S3）----

        case 'pin':
        case 'unpin': {
          if (!args.issue_number) throw new Error(`${args.action} 操作必须提供 issue_number`);
          // 置顶状态位：可逆（pin↔unpin 互逆），按轻变更免 confirm
          const res = await executor.run(['issue', args.action, String(args.issue_number), ...repoArgs], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Issue #${args.issue_number} 已${args.action === 'pin' ? '置顶' : '取消置顶'}` };
        }

        case 'lock':
        case 'unlock': {
          if (!args.issue_number) throw new Error(`${args.action} 操作必须提供 issue_number`);
          // unlock 是 gh 独立命令（非 lock 的 flag，实测 help 已钉）；锁定对话可逆，免 confirm
          const cmd = ['issue', args.action, String(args.issue_number), ...repoArgs];
          if (args.action === 'lock' && args.lock_reason) {
            cmd.push('--reason', args.lock_reason);
          }
          const res = await executor.run(cmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return {
            message: `Issue #${args.issue_number} 对话已${args.action === 'lock' ? '锁定' : '解锁'}`,
            ...(args.action === 'lock' && args.lock_reason ? { reason: args.lock_reason } : {}),
          };
        }

        case 'delete': {
          if (!args.issue_number) throw new Error('delete 操作必须提供 issue_number');
          // 物理删除 > close 的拦截级别：issue 编号永久消失、评论湮灭、GraphQL 无法恢复
          // 非 TTY 下 gh issue delete 会挂起等待 prompt，--yes 是非交互执行的唯一途径
          const res = await executor.run(['issue', 'delete', String(args.issue_number), ...repoArgs, '--yes'], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Issue #${args.issue_number} 已永久删除（不可恢复）` };
        }

        case 'transfer': {
          if (!args.issue_number) throw new Error('transfer 操作必须提供 issue_number');
          if (!args.target_repo) throw new Error('transfer 操作必须提供 target_repo [owner/repo]');
          if (args.target_repo === repoTarget) {
            throw new Error(`transfer 目标仓库 (${args.target_repo}) 与当前仓库相同，迁移无意义。`);
          }
          // 跨仓库迁移：原 URL 301 但归属改变，不可静默撤回——与 delete 同级 confirm
          const res = await executor.run(['issue', 'transfer', String(args.issue_number), args.target_repo, ...repoArgs], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Issue #${args.issue_number} 已迁移至 ${args.target_repo}`, url: res.rawOutput };
        }

        case 'status': {
          // 非 TTY 纯文本分段（Assigned/Mentioning/Pushed），gh 原生已是紧凑格式
          const res = await executor.run(['issue', 'status', ...repoArgs], { ...runOpts, rawText: true, timeoutMs: 20_000 });
          if (!res.ok) throw new Error(res.error);
          return { result: res.rawOutput || '无分配议题' };
        }

        default:
          throw new Error(`未知的 Issue 操作: ${args.action}`);
      }
    },
  });
}
