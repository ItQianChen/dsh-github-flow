import type { GhExecutor } from '../executor.js';
import { wrapWithGate } from '../destructive.js';
import { compareGhVersions } from '../executor.js';
import { renderPrMarkdown } from '../renderers/markdown.js';
import { assertPositionArg } from '../executor/args-guard.js';
import { extractImageUrls, downloadImages, buildImageBlocks, filterRequestedUrls, validateAttachPaths } from './image-utils.js';
import { readReviewRules, summarizeSeverity } from '../review-rules.js';

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
export { extractImageUrls as extractPrImageUrls, validateAttachPaths } from './image-utils.js';

export function createPrTool(executor: GhExecutor) {
  return wrapWithGate({
    name: 'github_pr',
    description: '管理与审查 GitHub Pull Request (PR)。支持查看列表、详情、差异比对、CI 检查状态、代码审查、合并操作、本地代码检出 (checkout) 与冲突状态检测 (status)。默认针对当前工作区关联的仓库。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'view', 'create', 'diff', 'checks', 'review', 'merge', 'checkout', 'status', 'view_images', 'ready', 'revert', 'update_branch', 'comment', 'edit'],
          description: 'PR 操作类型。view_images 下载正文与评论中的图片到本地；create/edit/comment 支持 attach_images 附件上传；merge/revert 以及 checkout 的 force 需 confirm: true。',
        },
        pr_number: {
          type: 'number',
          description: 'PR 编号（view, diff, checks, review, merge, checkout 时使用；若在 PR 对应分支可不填，自动识别当前分支 PR）。',
        },
        repo: {
          type: 'string',
          description: '目标仓库 [owner/repo]，留空则自动识别当前本地 Git 仓库。',
        },
        title: {
          type: 'string',
          description: '创建 PR 时的标题。',
        },
        body: {
          type: 'string',
          description: '创建 PR 或提交 Review 时的内容描述。',
        },
        base: {
          type: 'string',
          description: '目标基准分支（默认主分支，如 main）。',
        },
        head: {
          type: 'string',
          description: '源分支，跨 fork 提 PR 时必填，格式 forkOwner:branch（如 ItQianChen:fix-bug）；同仓库分支可直接写分支名。',
        },
        draft: {
          type: 'boolean',
          description: '是否创建为草稿 PR。',
        },
        review_decision: {
          type: 'string',
          enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
          description: '代码审查意见判定（review 操作时使用）。',
        },
        /**
         * 行级评注（review 动作使用）。
         *
         * 为什么必须单独一个参数而不是塞进 body：`gh pr review` 没有行级参数
         * （`gh pr review --help` 里 line/side/path 零命中），只能走
         * `POST /pulls/{n}/reviews` 的 `comments[]`。一次 review 一个请求 =
         * 通知只发一轮，也避开 secondary rate limit 的「创建内容过快」。
         */
        comments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '文件相对路径，必须出现在该 PR 的变动文件清单里。' },
              line: { type: 'number', description: '文件内的行号（新侧）。指向未变更行会被 GitHub 拒绝并自动降级为 body 段落。' },
              side: { type: 'string', enum: ['LEFT', 'RIGHT'], description: '评论所在侧，默认 RIGHT（新代码）。' },
              start_line: { type: 'number', description: '多行评论的起始行（可选，需与 line 同侧）。' },
              body: { type: 'string', description: '评注正文。缺省会被补上 [P2] 严重度前缀。' },
            },
            required: ['path', 'body'],
          },
          description:
            '行级评注列表（review 动作使用，上限 50 条）。传入即走 REST reviews 通道；不传则保持原 gh pr review 行为不变。',
        },
        commit_id: {
          type: 'string',
          description: '可选：把 review 钉在指定 commit SHA 上（默认取 PR 当前 head）。分支会移动，需要精确锚定时传 headRefOid。',
        },
        merge_method: {
          type: 'string',
          enum: ['merge', 'squash', 'rebase'],
          description: '合并策略（merge 操作时使用，默认 squash）。',
        },
        delete_branch: {
          type: 'boolean',
          description: '合并后是否删除源分支（仅 merge 动作生效，默认 false）。gh pr revert 没有该 flag，传了也不会生效。删除分支不可撤销，只在确认该分支已无用后再开启。',
        },
        force: {
          type: 'boolean',
          description: 'checkout 动作可选：是否强制重置已存在的本地同名分支（映射 gh pr checkout -f）。会丢弃本地未推送提交，必须同时传 confirm: true。默认 false——本地分支与 PR 头已分叉时检出会失败，而不是静默重置。',
        },
        undo: {
          type: 'boolean',
          description: 'ready 动作可选：反向操作，把 PR 转回 Draft（gh 原生 --undo）。',
        },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'merged', 'all'],
          description: 'PR 状态过滤（list 操作时使用，可选 open, closed, merged, all，默认 open）。',
        },
        limit: {
          type: 'number',
          description: '返回 PR 数量上限（list 操作时使用，默认 20，建议最大不超过 100）。',
        },
        author: {
          type: 'string',
          description: '按作者筛选（list 动作使用，支持 "@me" 或 GitHub 用户名）。',
        },
        stat_only: {
          type: 'boolean',
          description: '是否仅输出文件变动概览（diff 动作使用，改走 gh pr view --json files，防止大 PR 爆 Token）。',
        },
        confirm: {
          type: 'boolean',
          description: '高危破坏性操作确认标志（merge 动作、delete_branch、或 checkout 且 force: true 时必需）。若为 false 则仅输出影响评估并拦截。',
        },
        dry_run: {
          type: 'boolean',
          description: '是否只预演不真正创建（create 操作时使用，默认 false）。透传 gh --dry-run：打印将要创建的 PR 详情而不落库，用于提交前确认 head/base/title 是否正确。',
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
        return [{ type: 'text', text: renderPrMarkdown(args, value) }, ...buildImageBlocks(value)];
      },
    },
    async execute(args: any, execContext: any) {
      // 位置参数守卫：pr_number 会作为 `gh pr <cmd> <number>` 的位置参数进入 argv，
      // `--force` 这类值会被 gh 当成选项而不是编号（复核报告 C-01b）。
      // 放在入口一次校验即可覆盖全部 action，避免 11 处各自写一份。
      assertPositionArg(args.pr_number, 'PR 编号');
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
          const listCmd = ['pr', 'list', ...repoArgs, '--json', 'number,title,author,headRefName,isDraft,state,updatedAt,mergedAt,url'];
          if (args.state) {
            listCmd.push('--state', args.state);
          }
          if (args.author) {
            listCmd.push('--author', args.author);
          }
          // 显式 limit 优先；缺省回退 executor.defaultListLimit（用户可在插件配置中调整）
          const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : Math.min(executor.defaultListLimit ?? 20, 100);
          listCmd.push('-L', String(limit));

          const res = await executor.run(listCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'view': {
          const target = args.pr_number ? [String(args.pr_number)] : [];
          const res = await executor.run(
            // headRefOid/baseRefOid：分支会移动，Agent 侧也要能「钉在某个 commit 上」审
            // changedFiles + files：清单在 100 条处静默截断，必须成对返回才能判断完整性
            ['pr', 'view', ...target, ...repoArgs, '--json', 'number,title,body,state,author,labels,assignees,reviewDecision,mergeable,statusCheckRollup,url,comments,headRefName,baseRefName,headRefOid,baseRefOid,changedFiles,files'],
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
          /*
           * 仓库审查规则注入（AGENTS.md）。
           *
           * 触发条件明文：仅在 view/review 动作、且工作区确实存在 AGENTS.md 时注入。
           * 读不到就**不加这个键**（不是给个空对象）——这样「没有规则」与「规则为空」
           * 在输出里可区分，Agent 不会误以为仓库定义了空规则。
           */
          const changedPaths = Array.isArray(out.files)
            ? out.files.map((f: any) => (f && typeof f.path === 'string' ? f.path : '')).filter(Boolean)
            : [];
          const rules = readReviewRules(cwd, changedPaths);
          if (rules) out.reviewRules = rules;
          return out;
        }

        case 'view_images': {
          if (!args.pr_number) throw new Error('view_images 操作必须提供 pr_number');
          // PR 与 Issue 图片机制同构；评论走同一 issues-comments API（实测 PR 评论
          // 的 <img> 形态与 issue 完全一致），正文 + 评论合并提取一次覆盖全部
          const detail = await executor.run(
            ['pr', 'view', String(args.pr_number), ...repoArgs, '--json', 'body,comments'],
            runOpts
          );
          if (!detail.ok) throw new Error(detail.error);
          const d = detail.data && typeof detail.data === 'object' ? detail.data as any : {};
          const bodies: string[] = [];
          if (typeof d.body === 'string') bodies.push(d.body);
          if (Array.isArray(d.comments)) {
            for (const c of d.comments) {
              if (c && typeof c.body === 'string') bodies.push(c.body);
            }
          }
          // 多来源合并去重（Set 语义由 extractImageUrls 内部保证）
          const extracted = Array.from(new Set(bodies.flatMap((b) => extractImageUrls(b))));
          if (extracted.length === 0) {
            return { message: `PR #${args.pr_number} 正文与评论中未发现图片附件。` };
          }

          // 目标选择：不传 image_urls 下载全部；传入则与清单严格交集
          //（防幻觉/诱导的任意 URL 下载），空数组视为误传明确报错
          let targets = extracted;
          const rejections: string[] = [];
          if (args.image_urls !== undefined) {
            if (!Array.isArray(args.image_urls) || args.image_urls.length === 0) {
              throw new Error('image_urls 为空数组：如需下载全部请省略该参数，如需指定请传入 view 返回清单中的 URL。');
            }
            const filtered = filterRequestedUrls(args.image_urls, extracted);
            targets = filtered.matched;
            for (const bad of filtered.rejected) {
              rejections.push(`${String(bad).slice(-24)}: 不在本 PR 图片清单中，已拒绝（防任意下载）`);
            }
          }

          const { images, failures: dlFailures, remaining } = await downloadImages(
            targets,
            (url) => executor.run<Buffer>(['api', url], { ...runOpts, binary: true, timeoutMs: 30_000 })
          );

          const failures = [...rejections, ...dlFailures];
          if (images.length === 0 && rejections.length === 0 && !remaining) {
            return { message: `PR #${args.pr_number} 的图片全部下载失败：`, failures };
          }
          if (images.length === 0) {
            return { message: `PR #${args.pr_number} 未能获取任何图片（请求 ${targets.length} 张，被拒 ${rejections.length} 张）`, failures, remaining };
          }
          return {
            message: `PR #${args.pr_number} 成功获取 ${images.length} 张图片（正文+评论）${failures.length ? `（${failures.length} 条失败/提示）` : ''}：`,
            images,
            failures: failures.length ? failures : undefined,
            // 续传清单：触顶时 Agent 直接 image_urls: remaining 发起下一批
            remaining,
          };
        }

        case 'checks': {
          const target = args.pr_number ? [String(args.pr_number)] : [];
          // 字段集为 gh pr checks 的合法九字段子集（v2.50.0 引入 --json 起从未变更）。
          // 旧字段集的 conclusion/detailsUrl 是 REST API 字段名，pr checks 从未支持——
          // 初版误搬导致该 action 在所有 gh 版本上必然报 Unknown JSON field（Issue #3）。
          // bucket 是 state 的分类视图（pass/fail/pending/skipping/cancel），link 即详情页。
          const res = await executor.run(
            ['pr', 'checks', ...target, ...repoArgs, '--json', 'name,state,bucket,link,workflow,startedAt,completedAt'],
            runOpts
          );
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'diff': {
          const target = args.pr_number ? [String(args.pr_number)] : [];

          // gh pr diff 不提供 --stat（实测 gh 2.96.0 直接 unknown flag / exit 1）。
          // 文件变更概览的合法来源是 pr view --json files（字段含 path/additions/deletions）。
          // 返回值保持 { result: string } 形状——renderPrMarkdown 对 result 字符串直出
          // （src/renderers/pr.ts:15），因此这条路渲染层零改动。
          if (args.stat_only === true) {
            const statRes = await executor.run(
              ['pr', 'view', ...target, ...repoArgs, '--json', 'files,additions,deletions'],
              runOpts
            );
            if (!statRes.ok) throw new Error(statRes.error);
            const detail: any = statRes.data || {};
            // executor.run 在输出被 24KB 阈值截断时会跳过 JSON.parse（executor.ts:341），
            // 此时 data 为空、rawOutput 是被切断的半截 JSON。绝不能把「没解析出来」说成「0 个文件」。
            if (!Array.isArray(detail.files)) {
              return {
                result: '未能解析文件变更清单：gh 输出可能被 24KB 截断阈值切断。请改用 github_pr 的完整 diff 动作，或缩小范围后重试。',
              };
            }
            const rows: any[] = detail.files;
            // 只说是"本次取到的文件"：gh 的 --json files 在超过 100 个文件时静默截断
            // （cli/cli#12522），不能对外声称是完整清单。
            const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|');
            const lines = [
              `本次取到 ${rows.length} 个变更文件（+${detail.additions ?? 0} / -${detail.deletions ?? 0}）`,
              '',
              '| 文件 | 增 | 删 |',
              '| :--- | ---: | ---: |',
              ...rows.map((f: any) => `| ${cell(f.path)} | ${f.additions ?? 0} | ${f.deletions ?? 0} |`),
            ];
            return { result: lines.join('\n') };
          }

          const res = await executor.run(['pr', 'diff', ...target, ...repoArgs], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { result: res.rawOutput || '无差异内容' };
        }

        case 'checkout': {
          if (!args.pr_number) throw new Error('checkout 操作必须提供 pr_number');

          // 防线：检出 PR 会切本地分支，与界面切分支同源风险，必须过同一道闸门。
          // 这里用硬阻断而不是 confirm 二次确认——没有哪个参数能让「脏工作区检出」变安全，
          // 给个 confirm 只会变成一个绕不过去的死循环。
          const guard = await executor.ensureCleanWorkspace(cwd);
          if (!guard.ok) {
            const sample = guard.samples.length
              ? `\n涉及文件（前 ${guard.samples.length} 条）：\n${guard.samples.map((s) => '  ' + s).join('\n')}`
              : '';
            throw new Error(`${guard.error}${sample}\n请先提交或 stash 后再检出 PR。`);
          }

          const checkoutCmd = ['pr', 'checkout', String(args.pr_number), ...repoArgs];
          // 默认不带 -f。-f 的语义是 Reset the existing local branch to the latest state
          // of the pull request（等价 reset --hard，丢弃本地未推送提交）。
          // 不带 -f 时，若本地已有同名分支，gh 的行为是 `git checkout <branch>` 再
          // `git merge --ff-only <remote>`——只有「已分叉」才失败，不会静默重置。
          // 跨 fork 且本地无 remote 时走 `git fetch <ref>:<branch>`（不带 --force），
          // 分叉同样会失败。因此默认路径是安全的，真要重置必须 force + confirm 双门。
          if (args.force === true) {
            checkoutCmd.push('-f');
          }
          const res = await executor.run(checkoutCmd, runOpts);
          if (!res.ok) {
            // gh 在这里抛的是裸 git 错误，对用户和模型都没有"下一步"线索。
            // 「PR 被 rebase / force-push 后重新检出」是常见路径，必须给出可操作选项。
            const raw = String(res.error || '');
            if (/fast-forward|non-fast-forward|rejected/i.test(raw)) {
              throw new Error(
                `本地分支与 PR #${args.pr_number} 的头已分叉，无法快进检出。\n${raw}\n` +
                '如确认用 PR 头覆盖本地分支（会丢弃本地未推送提交），请附加 `force: true, confirm: true` 重新调用。'
              );
            }
            throw new Error(raw);
          }
          return { message: `已成功将 PR #${args.pr_number} 检出至本地分支`, output: res.rawOutput || 'Checked out' };
        }

        case 'status': {
          const statusCmd = ['pr', 'status', ...repoArgs, '-c', '--json', 'number,title,state,mergeStateStatus,url'];
          const res = await executor.run(statusCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return normalizeOutput(res.data || res.rawOutput);
        }

        case 'create': {
          const createCmd = ['pr', 'create', ...repoArgs, '--title', args.title || '', '--body', args.body || ''];
          if (args.base) createCmd.push('--base', args.base);
          // 跨 fork 提 PR 必须显式给出 --head（形如 forkOwner:branch）。
          // 为什么不能省：当 -R 指向的仓库不是当前 origin 时，gh 无法推断拿哪个分支开 PR，
          // 会逐级回退去问本地 git，最终报出与真实原因无关的 "not a git repository"。
          if (args.head) createCmd.push('--head', args.head);
          if (args.draft) createCmd.push('--draft');
          const dryRun = args.dry_run === true;
          if (dryRun) createCmd.push('--dry-run');
          await appendAttachFlags(createCmd, args.attach_images);
          const res = await executor.run(createCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return dryRun
            ? { message: 'PR 预演完成（未真正创建）', detail: res.rawOutput }
            : { message: 'PR 创建成功', url: res.rawOutput };
        }

        case 'review': {
          if (!args.pr_number) throw new Error('review 操作必须提供 pr_number');

          /*
           * 行级评注分支：只有显式传了非空 comments 才走 REST reviews 通道。
           * 不传 → 下面的原 gh pr review 路径一字不动（默认行为零变化，这是本改动的
           * 首要约束：老调用方的 argv 必须逐字节一致）。
           */
          const lineComments = Array.isArray(args.comments) ? args.comments : [];
          if (lineComments.length > 0) {
            const res = await executor.createPrReview(cwd, args.repo, args.pr_number, {
              event: args.review_decision,
              body: args.body,
              comments: lineComments,
              commit_id: args.commit_id,
            });
            if (!res.ok) throw new Error(res.error || 'Review 提交失败');
            /*
             * 严重度分布汇总（plan §2.3 item 14）。
             *
             * 为什么在工具层算：`normalizeSeverity` 幂等，这里对**入参**统计与对
             * 已提交正文统计等价；而在工具层算不必让 executor 回传审计字段。
             * 目的是让调用方一眼看到「这轮意见里有没有 P0」，而不是自己数。
             */
            const severity = summarizeSeverity(
              [args.body, ...lineComments.map((c: any) => (c && typeof c.body === 'string' ? c.body : ''))].filter(
                (b: any) => typeof b === 'string' && b.trim()
              )
            );
            const lines = [
              res.degraded
                ? `⚠️ Review 已提交（行级评注降级为正文段落）`
                : `✅ Review 已提交，含 ${lineComments.length} 条行级评注`,
            ];
            if (res.data?.htmlUrl) lines.push(`- 地址: ${res.data.htmlUrl}`);
            if (res.data?.state) lines.push(`- 判定: ${res.data.state}`);
            lines.push(`- 严重度: P0×${severity.P0} / P1×${severity.P1} / P2×${severity.P2}`);
            if (Array.isArray(res.data?.comments) && res.data.comments.length > 0) {
              lines.push('- 已挂载的行级评注:');
              for (const c of res.data.comments) {
                lines.push(`  - \`${c.path}${c.line ? ':' + c.line : ''}\`${c.htmlUrl ? ' → ' + c.htmlUrl : ''}`);
              }
            }
            if (res.degraded && res.degradedReason) lines.push(`\n> ⚠️ ${res.degradedReason}`);
            return {
              result: lines.join('\n'),
              severity,
              degraded: res.degraded === true,
              degradedReason: res.degradedReason,
            };
          }

          const reviewCmd = ['pr', 'review', String(args.pr_number), ...repoArgs];
          if (args.review_decision === 'APPROVE') reviewCmd.push('--approve');
          else if (args.review_decision === 'REQUEST_CHANGES') reviewCmd.push('--request-changes');
          else reviewCmd.push('--comment');
          if (args.body) reviewCmd.push('--body', args.body);
          const res = await executor.run(reviewCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: 'Review 提交成功', detail: res.rawOutput };
        }

        case 'merge': {
          if (!args.pr_number) throw new Error('merge 操作必须提供 pr_number');
          const method = args.merge_method === 'merge' ? '--merge' : (args.merge_method === 'rebase' ? '--rebase' : '--squash');
          const mergeCmd = ['pr', 'merge', String(args.pr_number), ...repoArgs, method];
          // 删分支默认关闭：合并他人仓库的 PR 时删掉源分支是不可撤销的破坏性动作，
          // 而 gh 默认不删。替用户做掉它违背「可撤销的直接做、不可撤销的先问」。
          if (args.delete_branch === true) mergeCmd.push('--delete-branch');
          const res = await executor.run(mergeCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: 'PR 合并完成', output: res.rawOutput };
        }

        // ---- 变更面新增（S3）----

        case 'ready': {
          if (!args.pr_number) throw new Error('ready 操作必须提供 pr_number');
          // Draft→Ready；gh 原生支持 --undo 反向（转回 draft），完整可逆，免 confirm
          const cmd = ['pr', 'ready', String(args.pr_number), ...repoArgs];
          if (args.undo === true) cmd.push('--undo');
          const res = await executor.run(cmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `PR #${args.pr_number} 已${args.undo === true ? '转回 Draft' : '从 Draft 转为 Ready（进入正式评审）'}` };
        }

        case 'revert': {
          if (!args.pr_number) throw new Error('revert 操作必须提供 pr_number');
          // revert 在远端创建反向提交与新 PR——虽不碰原 PR，但产生新实体，按 merge 级 confirm（D5）
          const revertCmd = ['pr', 'revert', String(args.pr_number), ...repoArgs];
          // 注意：gh pr revert 没有 --delete-branch（实测 2.96.0 unknown flag），
          // 不在这里推该 flag；删分支只在 merge 通道支持。
          const res = await executor.run(revertCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `PR #${args.pr_number} 的反向提交已创建`, url: res.rawOutput };
        }

        case 'update_branch': {
          if (!args.pr_number) throw new Error('update_branch 操作必须提供 pr_number');
          // 等价 repo sync 的单 PR 版（push merge commit 到 PR 分支）；恰是「分支落后」
          // 的自愈动作，confirm 摩擦会阻碍 Agent 自愈闭环（D6），输出同步摘要即可
          const res = await executor.run(['pr', 'update-branch', String(args.pr_number), ...repoArgs], runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `PR #${args.pr_number} 分支已从基准分支同步更新`, output: res.rawOutput };
        }

        case 'comment': {
          if (!args.pr_number || !args.body) throw new Error('comment 必须提供 pr_number 和 body');
          const commentCmd = ['pr', 'comment', String(args.pr_number), ...repoArgs, '--body', args.body];
          await appendAttachFlags(commentCmd, args.attach_images);
          const res = await executor.run(commentCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: 'PR 评论发布成功', output: res.rawOutput };
        }

        case 'edit': {
          if (!args.pr_number) throw new Error('edit 操作必须提供 pr_number');
          const editCmd = ['pr', 'edit', String(args.pr_number), ...repoArgs];
          if (args.title) editCmd.push('--title', args.title);
          if (args.body) editCmd.push('--body', args.body);
          await appendAttachFlags(editCmd, args.attach_images);
          const res = await executor.run(editCmd, runOpts);
          if (!res.ok) throw new Error(res.error);
          return { message: `PR #${args.pr_number} 更新成功`, output: res.rawOutput };
        }

        default:
          throw new Error(`未知的 PR 操作: ${args.action}`);
      }
    },
  });
}
