/**
 * Organizations 只读浏览路由（组织列表 / 组织聚合 / 单仓库下钻）。
 *
 * 设计边界（对应 issue #17 的「查看」诉求）：
 * - 只读：本文件不注册任何写操作，不碰 gh 的 create/edit/merge/delete；
 *   组织仓库的写操作仍走既有的 19 大工具（它们本来就带 repo 参数）。
 * - 按需拉取：组织视图与全局概览分开缓存，切组织不会让全局缓存失效。
 * - 组织级与仓库级共用 gh search：`--owner=<org>` 与 `--repo=<owner/name>` 是
 *   同一个命令的两个作用域参数，返回结构一致，前端不需要两套解析。
 */
import type { GhExecutor } from '../executor.js';
import type { OrgItem, OrgOverviewData, OrgPrItem, OrgIssueItem, UserRepoItem } from '../types.js';
import type { TtlCache } from '../cache.js';
import type { RouteDeps } from './route-helpers.js';

const PR_FIELDS = 'number,title,state,repository,url,updatedAt,isDraft,author';
const ISSUE_FIELDS = 'number,title,state,repository,author,labels,url,updatedAt';
const REPO_FIELDS = 'name,nameWithOwner,description,defaultBranchRef,isPrivate,stargazerCount,updatedAt,url';

/** 一次拉取的条数上限（与全局概览的默认分页口径保持一致） */
const DEFAULT_LIMIT = 30;

/**
 * 校验组织名 / 仓库全名。
 * 为什么要显式白名单：这两个参数会直接进入 gh 的 argv（--owner= / --repo=），
 * 放行空格、分号或前导 '-' 会变成参数注入（gh 会把 --owner=-R 当成另一个 flag）。
 * GitHub 的 owner/repo 允许字符集是字母数字与 . _ -，组织名不允许下划线开头。
 */
function isValidOrgName(v: unknown): boolean {
  return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(v) && !v.includes('..');
}
function isValidRepoFullName(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const parts = v.split('/');
  if (parts.length !== 2) return false;
  // 仓库名允许以 . _ - 开头（GitHub 上真实存在 .github、.github-private 这类仓库），
  // 组织名则不允许——两者规则不同，这里只按仓库的宽松口径。
  // 值整体拼进 `--repo=<owner/name>`，前导 '-' 不会变成独立 flag；
  // 真正要挡的是空白、路径穿越与 shell 元字符。
  return parts.every(
    (p) => /^[A-Za-z0-9._-]{1,100}$/.test(p) && p !== '.' && p !== '..' && !p.includes('..')
  );
}

export function registerOrgRoutes(deps: RouteDeps, executor: GhExecutor, orgCache?: TtlCache<any>): void {
  // sendJson 走 deps 注入而非直接 import：与 RouteDeps 的设计一致，也让单元测试
  // 可以注入一个纯内存的 res 收集器，无需伪造 http.ServerResponse 的整套方法。
  const { bindRoute, sendJson } = deps;

  // 1. 当前账号加入的组织列表（只读）
  bindRoute({
    kind: 'exact',
    path: '/api/github/orgs',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      try {
        /*
         * 一次性拉满 100 条，而不是走 --paginate。
         *
         * 为什么不用 --paginate：gh 的 --paginate 会把 jq 应用到**每一页**并把结果
         * 首尾相接输出（`[...][...]`），不再是合法 JSON，executor 的 JSON.parse 直接失败；
         * 想配合 --slurp 又要求 gh ≥ 2.26，等于给组织列表凭空加一个版本门槛。
         * 100 是 GitHub per_page 上限，人类账号加入 100 个组织已属极端，
         * 触顶则如实置 truncated 交给 UI 提示，比静默截断诚实。
         */
        const result = await executor.run<any[]>(
          ['api', 'user/orgs?per_page=100', '--jq', '[.[] | {login: .login, description: (.description // ""), avatarUrl: (.avatar_url // "")}]'],
          { timeoutMs: 8_000 }
        );
        if (!result.ok) {
          sendJson(res, 200, { ok: false, message: result.error || '读取组织列表失败', data: { orgs: [] } });
          return;
        }
        const orgs: OrgItem[] = (Array.isArray(result.data) ? result.data : [])
          .filter((o: any) => o && typeof o.login === 'string')
          .map((o: any) => ({
            login: o.login,
            description: o.description || '',
            avatarUrl: o.avatarUrl || '',
          }));
        sendJson(res, 200, { ok: true, data: { orgs, truncated: orgs.length >= 100 } });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, message: err?.message || '读取组织列表异常', data: { orgs: [] } });
      }
    },
  });

  // 2. 组织聚合视图 / 单仓库下钻（org 必填，repo 可选）
  bindRoute({
    kind: 'exact',
    path: '/api/github/org-overview',
    handler: async (req: any, res: any) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, message: '仅支持 GET 请求' });
        return;
      }
      const u = new URL(req.url || '/', 'http://127.0.0.1');
      const org = u.searchParams.get('org') || '';
      const repo = u.searchParams.get('repo') || '';
      if (!isValidOrgName(org)) {
        sendJson(res, 400, { ok: false, message: '非法组织名（仅允许字母数字与 . _ -）' });
        return;
      }
      if (repo && !isValidRepoFullName(repo)) {
        sendJson(res, 400, { ok: false, message: '非法仓库全名（应形如 owner/repo）' });
        return;
      }

      const limit = Math.min(Math.max(Number(u.searchParams.get('limit')) || DEFAULT_LIMIT, 1), 100);
      // 与 search 返回结构对齐：owner 作用域用于组织聚合，repo 作用域用于下钻
      const scope = repo ? `--repo=${repo}` : `--owner=${org}`;

      /*
       * 缓存键含 org + repo + limit 三段：limit 不同即不同数据集，混用会把
       * 「下钻时用 10 条」的结果当成「聚合时 30 条」返回。
       * 命中直接回，避免「切组织-下钻-退回」的来回操作每次都重跑 2~3 个 gh 子进程。
       */
      const cacheKey = `${org}|${repo}|${limit}`;
      if (orgCache) {
        const hit = orgCache.get(cacheKey, Date.now());
        if (hit) {
          sendJson(res, 200, { ok: true, fromCache: true, data: hit });
          return;
        }
      }

      try {
        const tasks: Array<Promise<any>> = [
          executor.run<any[]>(
            ['search', 'prs', scope, '--sort=updated', '--limit', String(limit), '--json', PR_FIELDS],
            { timeoutMs: 10_000 }
          ),
          executor.run<any[]>(
            ['search', 'issues', scope, '--sort=updated', '--limit', String(limit), '--json', ISSUE_FIELDS],
            { timeoutMs: 10_000 }
          ),
        ];
        // 仓库列表只在组织聚合视图需要（下钻时仓库已确定，不必再拉一遍）
        if (!repo) {
          tasks.push(
            executor.run<any[]>(
              ['repo', 'list', org, '--limit', String(limit), '--json', REPO_FIELDS],
              { timeoutMs: 10_000 }
            )
          );
        }

        const settled = await Promise.allSettled(tasks);
        const pick = (i: number) => (settled[i].status === 'fulfilled' ? (settled[i] as any).value : { ok: false, error: '查询失败' });
        const prsRes = pick(0);
        const issuesRes = pick(1);
        const reposRes = repo ? { ok: true, data: [] } : pick(2);

        const prs: OrgPrItem[] = prsRes.ok && Array.isArray(prsRes.data)
          ? prsRes.data.map((p: any) => ({
              number: p.number,
              title: p.title || '',
              state: p.state,
              repository: p.repository || { nameWithOwner: '' },
              url: p.url || '',
              updatedAt: p.updatedAt || '',
              isDraft: Boolean(p.isDraft),
              author: p.author ? { login: p.author.login || p.author } : undefined,
            }))
          : [];
        const issues: OrgIssueItem[] = issuesRes.ok && Array.isArray(issuesRes.data)
          ? issuesRes.data.map((i: any) => ({
              number: i.number,
              title: i.title || '',
              state: i.state,
              repository: i.repository || { nameWithOwner: '' },
              author: i.author ? { login: i.author.login || i.author } : undefined,
              labels: Array.isArray(i.labels) ? i.labels : [],
              url: i.url || '',
              updatedAt: i.updatedAt || '',
            }))
          : [];
        const repos: UserRepoItem[] = reposRes.ok && Array.isArray(reposRes.data)
          ? reposRes.data.map((r: any) => ({
              name: r.name || '',
              nameWithOwner: r.nameWithOwner || '',
              description: r.description || '',
              defaultBranch: r.defaultBranchRef?.name || 'main',
              isPrivate: Boolean(r.isPrivate),
              stargazerCount: r.stargazerCount || 0,
              updatedAt: r.updatedAt || '',
              url: r.url || `https://github.com/${r.nameWithOwner}`,
            }))
          : [];

        // 触及上限即可能还有更多：如实标记，前端据此提示「还有更多」
        const data: OrgOverviewData = {
          org: { login: org },
          repos,
          prs,
          issues,
          prsTruncated: prs.length >= limit,
          issuesTruncated: issues.length >= limit,
          reposTruncated: repos.length >= limit,
          ...(repo ? { repo } : {}),
        };
        // 三路全失败才整体判失败；部分成功照常返回（组织里某个仓库权限不足很常见）
        const allFailed = !prsRes.ok && !issuesRes.ok && (repo ? true : !reposRes.ok);
        if (allFailed) {
          sendJson(res, 200, { ok: false, message: prsRes.error || issuesRes.error || '查询失败', data });
          return;
        }
        // 只缓存成功结果：失败数据进缓存会让一次瞬时故障在 TTL 内持续复现
        if (orgCache) orgCache.set(cacheKey, data, Date.now());
        sendJson(res, 200, { ok: true, data });
      } catch (err: any) {
        sendJson(res, 500, { ok: false, message: err?.message || '组织视图查询异常' });
      }
    },
  });
}
