/**
 * API 路由共享工具层。
 *
 * 为什么从 routes.ts 拆出：这些工具被全部路由分组文件消费（sendJson/readJsonBody/
 * issue 聚合/TTL 推导），放在任何一个分组文件里都会造成分组之间的横向依赖；
 * 独立成无状态模块后，各分组只依赖它，注册器只装配。
 */
import path from 'node:path';
/**
 * 依据当前登录账号判定 Issue 的归属身份维度 (可多选):
 * - reported: 用户提起的 (属于当前账号名下仓库，但作者不是本人)
 * - assigned: 被分配的 (指派列表中包含当前账号)
 * - created: 我创建的 (作者是当前账号)
 *
 * 为什么这样划分：
 * 在真实工程实践中，Maintainer 不仅要关注自己创建的任务，更要对社区/用户提交的 Bug 反馈负责，
 * 同时还要处理他人指派的待办任务。这三个维度互补且可能重叠。
 */
export function resolveIssueCategories(issue, currentUser, explicitRepoOwner) {
    const categories = [];
    if (!currentUser)
        return categories;
    const currentLower = currentUser.toLowerCase();
    const authorLogin = issue.author?.login?.toLowerCase();
    const isAuthor = Boolean(authorLogin && authorLogin === currentLower);
    const isAssignee = Array.isArray(issue.assignees) &&
        issue.assignees.some((a) => a.login?.toLowerCase() === currentLower);
    // 仓库 owner 判定：优先从 repository.nameWithOwner 提取，兜底使用 explicitRepoOwner
    let repoOwner = explicitRepoOwner?.toLowerCase();
    if (!repoOwner && issue.repository?.nameWithOwner) {
        repoOwner = issue.repository.nameWithOwner.split('/')[0]?.toLowerCase();
    }
    const isOwnerRepo = Boolean(repoOwner && repoOwner === currentLower);
    if (isAuthor)
        categories.push('created');
    if (isAssignee)
        categories.push('assigned');
    // 如果是当前用户维护的仓库，且作者不是本人，则明确归为「用户提起的」
    if (isOwnerRepo && !isAuthor)
        categories.push('reported');
    return categories;
}
export function calculateIssueStats(issues) {
    let reported = 0;
    let assigned = 0;
    let created = 0;
    for (const item of issues) {
        const cats = item.categories || [];
        if (cats.includes('reported'))
            reported++;
        if (cats.includes('assigned'))
            assigned++;
        if (cats.includes('created'))
            created++;
    }
    return {
        total: issues.length,
        reported,
        assigned,
        created,
    };
}
/** path.basename 在空串/异常输入上会抛错，工作区路径来自磁盘文件，必须防御 */
export function basenameSafe(p) {
    try {
        return path.basename(p) || p;
    }
    catch {
        return p;
    }
}
/**
 * 全局驾驶舱的缓存时长下限。
 * 这个端点要 spawn 十几次 gh，比单仓库概览重得多，因此不直接沿用 cacheTtlMs（默认 15s）。
 * 定在 5 分钟的依据：它展示的是「我的仓库 / 待办 PR / Issues」这类分钟级不变的数据，
 * 而每次刷新本机实测要 8-13 秒。缓存太短等于让用户反复等这段延迟——实测 60 秒缓存下，
 * 用户 65 秒后再打开面板仍需等 9.7 秒。仍随 cacheTtlMs 缩放，用户调大时这里同步变长。
 */
const GLOBAL_CACHE_MIN_TTL_MS = 300_000;
/**
 * 由用户配置推导全局驾驶舱的缓存时长。
 * 抽成导出的纯函数：TTL 的推导规则是测试断言的对象，埋在闭包里就只能靠猜。
 */
export function globalCacheTtlMs(cacheTtlMs) {
    const base = Number.isFinite(cacheTtlMs) && cacheTtlMs >= 0 ? cacheTtlMs : 15_000;
    return Math.max(base * 20, GLOBAL_CACHE_MIN_TTL_MS);
}
/** open_browser 只允许 http/https，杜绝 file:// 与自定义协议被当作打开目标 */
export function isSafeExternalUrl(raw) {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048)
        return false;
    try {
        const parsed = new URL(raw);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    }
    catch {
        return false;
    }
}
/** JSON 响应统一出口：no-store 防代理/浏览器缓存干扰面板数据新鲜度语义 */
export function sendJson(res, status, data) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(data));
}
/**
 * 读取并解析请求 JSON body（带默认 256KB 上限防护）。
 * 集中处理超限/畸形 JSON 的错误语义，避免每个 handler 复制流收集样板。
 */
export function readJsonBody(req, maxBytes = 256 * 1024) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(new Error(`请求体超过 ${maxBytes} 字节上限`));
                req.destroy();
                return;
            }
            body += chunk;
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            }
            catch {
                reject(new Error('请求体不是合法 JSON'));
            }
        });
        req.on('error', reject);
    });
}
/**
 * 本地 HTTP 写端点的跨站门禁。
 *
 * 威胁模型（写准，别夸大）：防的是「任意网页用 simple request 打本地端口」这一类
 * CSRF——`Content-Type: text/plain` 的跨站 POST 不触发预检，浏览器会照发。
 * **不防 DNS rebinding**：攻击者页面若与目标同 host 名，`Origin === Host` 就成立。
 * 真正挡住 rebinding 需要校验 Host 白名单或引入 token，属另一件事。
 *
 * 两道门：
 *   1) `Origin` 必须为空（同源导航或非浏览器客户端）或与 `Host` 同源；
 *   2) 需要读 JSON body 的端点额外要求 media type 恰为 `application/json`
 *      ——它不在 simple request 白名单里，浏览器会强制先发预检。
 *
 * 为什么允许 Origin 为空：同源 fetch 在部分场景下不带 Origin，非浏览器客户端
 * （curl / 脚本）也不带。这两类不构成跨站威胁，拦掉只会误伤自家前端。
 */
export function guardLocalWrite(req, res, opts = {}) {
    // 早退前必须把请求体排空：Node 对未被消费的请求体通常直接断连，
    // 客户端 fetch 会拿到网络错误而不是我们刚写好的 403/415。
    const reject = (status, error) => {
        try {
            req.resume?.();
        }
        catch {
            /* 排空失败不影响响应 */
        }
        sendJson(res, status, { ok: false, error });
        return false;
    };
    const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : '';
    const host = String(req.headers?.host || '');
    if (origin) {
        let originHost = '';
        try {
            originHost = new URL(origin).host;
        }
        catch {
            // Origin 形如 "null"（沙箱 iframe / file://）时 URL 解析失败 → 视为不同源
            originHost = '';
        }
        if (!originHost || originHost !== host) {
            return reject(403, '跨站请求已拒绝：Origin 与本地服务不同源');
        }
    }
    if (opts.requireJson) {
        // 精确比对 media type：`text/plain; x=application/json` 这种"看起来带 json"的值
        // 用 includes 会误判通过——那不是校验，是自我安慰。
        const mediaType = String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (mediaType !== 'application/json') {
            return reject(415, '请求必须使用 Content-Type: application/json');
        }
    }
    return true;
}
