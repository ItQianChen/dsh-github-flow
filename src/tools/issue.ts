import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { GhExecutor } from '../executor.js';
import { renderIssueMarkdown } from '../renderers/markdown.js';

function normalizeOutput(data: any): Record<string, any> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return { items: data, count: data.length };
  }
  return { result: data !== undefined && data !== null ? data : '' };
}

/**
 * 从 Issue 正文提取图片 URL（用户拖拽上传 / 旧版上传 / 仓库引用 / camo 代理 / 带扩展名外链）。
 * 为什么域名白名单 + 扩展名兜底双条件：GitHub 会把外链图片代理成 camo 域名，
 * 用户上传走 user-attachments；仓库内图片是 raw 域名——三类是最常见可信来源。
 * 任意公网 URL 必须带图片扩展名才纳入，避免把截图里的按钮链接误当图片下载。
 */
export function extractIssueImageUrls(body: unknown): string[] {
  if (typeof body !== 'string' || !body) return [];
  const urls = new Set<string>();
  // HTML <img src="..."> 与 Markdown ![alt](url) 两种形态
  const pattern = /(?:<img[^>]+src="([^"]+)"|!\[[^\]]*\]\(([^)\s]+)[^)]*\))/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    const url = m[1] || m[2];
    if (!url) continue;
    const isGithubAsset =
      url.startsWith('https://github.com/user-attachments/') ||
      url.startsWith('https://user-images.githubusercontent.com/') ||
      url.startsWith('https://raw.githubusercontent.com/') ||
      url.startsWith('https://camo.githubusercontent.com/');
    // 仅 https 的图片扩展名外链可放行：http:// 明文与 file:/// 等协议不仅不安全，
    // 且是 SSRF 面——恶意 issue 可诱导插件访问云元数据端点（169.254.169.254）或
    // 内网服务。https 强制 + 扩展名双条件把下载目标限定在加密公网图片。
    const looksLikeImage = url.startsWith('https://') &&
      /\.(png|jpe?g|gif|webp|bmp|svg)([?#]|$)/i.test(url);
    if (isGithubAsset || looksLikeImage) urls.add(url);
  }
  return Array.from(urls);
}

/** 从魔数推断图片 MIME（下载内容才是事实源——URL 扩展名可伪造） */
function sniffMime(buf: Buffer): string | null {
  // 长度下限只挡二进制格式（PNG/JPEG/GIF/WEBP 均有 ≥12 字节头）；SVG 是文本，
  // 无固定头长度——短到 4 字节的 '<svg' 也合法，必须在长度检查之前判定
  if (buf.slice(0, 4).toString('ascii').toLowerCase() === '<svg') return 'image/svg+xml';
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';                     // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'; // JPEG
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';  // GIF
  if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'; // RIFF....WEBP
  return null;
}

/** 图片下载护栏：与 Token 防溢出同哲学——单图/单次数量/总量三重上限 */
const IMG_MAX_BYTES = 5 * 1024 * 1024;   // 单图 5MB
const IMG_MAX_COUNT = 5;                  // 单次最多 5 张
const IMG_DIR_MAX_BYTES = 15 * 1024 * 1024; // 图片缓存目录总量 15MB

/** 图片落盘目录（按内容寻址命名，重复下载天然去重） */
function imageStoreDir(): string {
  return path.join(os.homedir(), '.dsh', 'data', 'dsh-github-flow', 'images');
}

/** 粗略统计图片目录现有总量（遍历一次，文件数有护栏上限不会失控） */
function imageDirSize(dir: string): number {
  let total = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      try { total += fs.statSync(path.join(dir, f)).size; } catch {}
    }
  } catch {}
  return total;
}

export function createIssueTool(executor: GhExecutor) {
  return {
    name: 'github_issue',
    description: '管理 GitHub Issues。支持查看 Issue 列表、详情、创建新 Issue、追加评论、关闭 Issue、编辑 Issue 以及关联创建本地开发分支 (develop)。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'view', 'create', 'comment', 'close', 'reopen', 'edit', 'develop', 'view_images'],
          description: 'Issue 操作类型。view_images 下载正文内的图片到本地并返回可渲染的图片内容块（Agent 可直接"看"用户报障截图）。',
        },
        issue_number: {
          type: 'number',
          description: 'Issue 编号（view, comment, close, reopen, edit, develop 时使用）。',
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
          description: '高危破坏性操作确认标志（close 动作必需）。若为 false 则仅输出待关闭警告。',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object' },
      render(args: any, value: any) {
        const blocks: any[] = [{ type: 'text', text: renderIssueMarkdown(args, value) }];
        // view_images 的图片以宿主 image 内容块输出：模型与人类都能直接看到图，
        // base64 会污染上下文（一张截图 ~88KB），引用落盘文件由宿主按需加载
        if (Array.isArray(value?.images)) {
          for (const img of value.images) {
            if (img && typeof img.file === 'string' && typeof img.mimeType === 'string') {
              blocks.push({ type: 'image', path: img.file, mimeType: img.mimeType });
            }
          }
        }
        return blocks;
      },
    },
    async execute(args: any, execContext: any) {
      const cwd = execContext?.cwd || process.cwd();
      const sessionId = execContext?.sessionId || execContext?.session?.id || process.env.DSH_SESSION_ID;
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
          // 附带图片 URL 清单：Agent 先知道有哪些图（零下载成本），
          // 需要看图时再显式 view_images 按需拉取——默认不把二进制预算花在可能不需要的图上
          if (typeof out.body === 'string') {
            out.images = extractIssueImageUrls(out.body);
          }
          return out;
        }

        case 'view_images': {
          if (!args.issue_number) throw new Error('view_images 操作必须提供 issue_number');
          // 第一步：取正文提取图片 URL（与 view 同源，不重复拉取详情）
          const detail = await executor.run(
            ['issue', 'view', String(args.issue_number), ...repoArgs, '--json', 'body'],
            runOpts
          );
          if (!detail.ok) throw new Error(detail.error);
          const bodyText = detail.data && typeof detail.data === 'object' ? String((detail.data as any).body ?? '') : String(detail.rawOutput || '');
          const urls = extractIssueImageUrls(bodyText);
          if (urls.length === 0) {
            return { message: `Issue #${args.issue_number} 正文中未发现图片附件。` };
          }

          // 第二步：逐张经 gh api 下载（gh 的网络栈穿过直连被拦的环境），
          // 魔数校验 + 护栏 + 内容寻址落盘。落盘失败（目录权限受限）降级系统
          // 临时目录——只损失跨会话去重，不让整个功能在受限环境不可用。
          let dir = imageStoreDir();
          try {
            fs.mkdirSync(dir, { recursive: true });
          } catch {
            dir = path.join(os.tmpdir(), 'dsh-github-flow-images');
            fs.mkdirSync(dir, { recursive: true });
          }
          let dirSize = imageDirSize(dir);
          const images: Array<{ file: string; mimeType: string; url: string; bytes: number }> = [];
          const failures: string[] = [];

          for (const url of urls.slice(0, IMG_MAX_COUNT)) {
            const res = await executor.run<Buffer>(['api', url], { ...runOpts, binary: true, timeoutMs: 30_000 });
            if (!res.ok || !Buffer.isBuffer(res.data)) {
              failures.push(`${url.slice(-24)}: ${res.error || '非二进制响应'}`);
              continue;
            }
            const buf = res.data;
            if (buf.length > IMG_MAX_BYTES) {
              failures.push(`${url.slice(-24)}: 超过单图 5MB 上限（${(buf.length / 1024 / 1024).toFixed(1)}MB）`);
              continue;
            }
            const mime = sniffMime(buf);
            if (!mime) {
              failures.push(`${url.slice(-24)}: 内容不是图片（魔数校验失败）`);
              continue;
            }
            if (dirSize + buf.length > IMG_DIR_MAX_BYTES) {
              failures.push(`${url.slice(-24)}: 图片缓存目录超过 15MB 总量上限，请清理后重试`);
              continue;
            }
            // 内容寻址（sha256 前 16 位）+ 扩展名：重复下载同一图去重，文件名可读
            const ext = mime.includes('svg') ? 'svg' : mime.split('/')[1].replace('jpeg', 'jpg');
            const file = path.join(dir, `${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}.${ext}`);
            fs.writeFileSync(file, buf);
            // 累计已写入量：下张图的总量护栏判定必须基于最新值（否则多图可突破上限）
            dirSize += buf.length;
            images.push({ file, mimeType: mime, url, bytes: buf.length });
          }

          if (images.length === 0) {
            return { message: `Issue #${args.issue_number} 的图片全部下载失败：`, failures };
          }
          return {
            message: `Issue #${args.issue_number} 成功获取 ${images.length} 张图片${failures.length ? `（${failures.length} 张失败）` : ''}：`,
            images,
            failures: failures.length ? failures : undefined,
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
          const res = await executor.run(editCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `Issue #${args.issue_number} 更新成功`, output: res.rawOutput };
        }

        case 'develop': {
          if (!args.issue_number) throw new Error('develop 操作必须提供 issue_number');
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
          const res = await executor.run(['issue', 'comment', String(args.issue_number), ...repoArgs, '--body', args.body], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: '评论发布成功', output: res.rawOutput };
        }

        case 'close': {
          if (!args.issue_number) throw new Error('close 操作必须提供 issue_number');
          if (args.confirm !== true) {
            return {
              status: 'AWAITING_CONFIRMATION',
              warning: `⚠️ 高危操作拦截：你即将关闭 Issue #${args.issue_number}。`,
              impact: '关闭后该议题状态将变更为 CLOSED，请与用户确认是否确实已解决或需要关闭。',
              requiredAction: '如确认关闭，请在参数中附加 `confirm: true` 重新调用。',
            };
          }
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

        default:
          throw new Error(`未知的 Issue 操作: ${args.action}`);
      }
    },
  };
}
