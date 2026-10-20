/**
 * 仓库卡片徽章推导（纯函数，无 React 依赖，可被单测直接覆盖）。
 *
 * 为什么独立成模块：`client.ts` 是近 2000 行的巨石，其中的 UI 判定逻辑
 * 只能靠「bundle 里有没有这个字符串」这类弱断言覆盖。把判定规则抽成纯函数后，
 * 「什么情况出什么徽章」可以被真实断言，而不是靠人工目测。
 */
/** 只接受 http/https 的绝对 URL；其余（javascript:、data:、相对路径）一律拒收 */
function safeHttpUrl(raw) {
    if (typeof raw !== 'string' || !raw)
        return null;
    try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
    }
    catch {
        return null;
    }
}
/**
 * 依据仓库元数据推导展示信息。
 *
 * 三条规则（与上位方案 S4 展示契约对齐，但**不含上游 star**）：
 *   1. `isFork` 为 true → `⑂ fork` 徽章；有 parent 时附带血缘行
 *   2. `viewerPermission` 为 READ / TRIAGE → `🔒 只读` 徽章
 *   3. 其余一律零徽章（保持现有外观）
 *
 * 为什么权限未知时不显示任何徽章：离线数据没有该字段，此时既不能说
 * 「可写」也不能说「只读」——沉默优于猜测。显示一个可能错误的徽章，
 * 比不显示更糟。
 *
 * 为什么不展示上游 star：`parent` 只返回骨架，拿不到 stargazerCount
 * （`--json` 不支持嵌套子字段，实测）；补一次网络往返实测 3~6 秒，
 * 而 star 数不是决策信息。详见 s4 执行方案 §2.1。
 *
 * @param repo RepoMetadata 或 null/undefined（离线、非 Git 工作区）
 */
export function resolveRepoBadges(repo) {
    const badges = [];
    let forkLine = null;
    if (!repo || typeof repo !== 'object') {
        return { badges, forkLine };
    }
    // ---- 规则 1：fork ----
    // 用 `=== true` 严格比较：字符串 "true" / 数字 1 都不算——
    // 这类来源不明的真值若被接受，会在数据形态漂移时静默产生错误徽章。
    if (repo.isFork === true) {
        const rawName = typeof repo.parent?.nameWithOwner === 'string' ? repo.parent.nameWithOwner.trim() : '';
        if (rawName) {
            // URL 只信 http/https：parent.url 来自 API 响应，直接塞进 href 会承接
            // 任意协议（javascript:/data:）。校验不过就从 nameWithOwner 重建——
            // 拼出来的地址一定是 https://github.com/<owner>/<repo>，天然安全。
            const parentUrl = safeHttpUrl(repo.parent?.url) || `https://github.com/${rawName}`;
            forkLine = { parentNameWithOwner: rawName, parentUrl };
            badges.push({
                text: '⑂ fork',
                tone: 'purple',
                title: `这是 ${rawName} 的 fork。改动默认提交到你的 fork，需要时再向上游发起 PR。`,
            });
        }
        else {
            // 拿不到上游也必须告诉用户「这是 fork」——那是确定事实
            badges.push({
                text: '⑂ fork',
                tone: 'purple',
                title: '这是一个 fork 仓库（未能解析出上游仓库）。',
            });
        }
    }
    // ---- 规则 2：只读 ----
    // 只认 READ / TRIAGE：这两个档位必然无法写代码。MAINTAIN 及以上均可写。
    const perm = typeof repo.viewerPermission === 'string' ? repo.viewerPermission.toUpperCase() : '';
    if (perm === 'READ' || perm === 'TRIAGE') {
        badges.push({
            text: '🔒 只读',
            tone: 'yellow',
            title: '当前账号对该仓库仅有只读权限，写操作（创建 Issue / PR / 合并等）会被 GitHub 拒绝。' +
                '如需提交改动，请先 fork 到自己的账号（gh repo fork --clone）。',
        });
    }
    return { badges, forkLine };
}
