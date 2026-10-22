/**
 * 任务级原语的纯函数层：提交归类、SemVer 推导、预算裁剪、信封封装。
 *
 * 为什么单独成文件：
 * 1. 这三个原语的价值是「一轮拿到可执行结论」，结论对不对完全取决于归类与裁剪
 *    这些纯逻辑——它们必须能脱离网络单测，否则只能靠"跑一次看看"验证；
 * 2. `cost` 是原语存在的唯一判据（是否真的比手动串步骤省钱），必须由代码计算，
 *    不能手写常量；
 * 3. 工具层只负责取数与编排，不承载判定规则。
 */
const CC_RE = /^(\w+)(?:\([^)]*\))?(!)?:\s*(.+)$/;
/**
 * 按 Conventional Commits 归类提交标题。
 *
 * 判定优先级：`!` 破坏性标记 > 类型关键字。为什么先判 `!`：
 * `feat(api)!: drop v1` 既是 feat 也是 breaking，而它决定的是 **major** 版本，
 * 归到 feat 会让版本号少跳一级——这是发版事故里最常见的一种。
 */
export function classifyCommits(subjects, bodies = []) {
    const out = { breaking: [], feat: [], fix: [], perf: [], refactor: [], docs: [], other: [] };
    const list = Array.isArray(subjects) ? subjects : [];
    list.forEach((raw, i) => {
        const subject = String(raw ?? '').trim();
        if (!subject)
            return;
        const body = String(bodies[i] ?? '');
        const m = CC_RE.exec(subject);
        const type = m ? m[1].toLowerCase() : '';
        const bang = Boolean(m && m[2]);
        const isBreaking = bang || /BREAKING[ -]CHANGE/i.test(body);
        if (isBreaking) {
            out.breaking.push(subject);
            return;
        }
        if (type === 'feat' || type === 'feature')
            out.feat.push(subject);
        else if (type === 'fix' || type === 'bugfix')
            out.fix.push(subject);
        else if (type === 'perf')
            out.perf.push(subject);
        else if (type === 'refactor')
            out.refactor.push(subject);
        else if (type === 'docs' || type === 'doc')
            out.docs.push(subject);
        else
            out.other.push(subject);
    });
    return out;
}
/** 解析 `v1.2.3` / `1.2.3` / `v1.2.3-rc.1` 形式的版本号 */
export function parseSemver(tag) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/i.exec(String(tag ?? '').trim());
    if (!m)
        return null;
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}
/**
 * 推导下一个版本号。
 *
 * 无 tag 时按 `0.1.0` 起步（而不是 1.0.0）：新仓库的第一个版本不该被当成稳定 API。
 * `auto` 的判据：breaking → major，feat → minor，其余 → patch。
 */
export function suggestVersion(currentTag, groups, bump = 'auto') {
    const cur = parseSemver(currentTag) || { major: 0, minor: 0, patch: 0 };
    const hasBreaking = groups.breaking.length > 0;
    const hasFeat = groups.feat.length > 0;
    let kind;
    if (bump !== 'auto')
        kind = bump;
    else if (hasBreaking)
        kind = 'major';
    else if (hasFeat)
        kind = 'minor';
    else
        kind = 'patch';
    let next;
    if (kind === 'major')
        next = { major: cur.major + 1, minor: 0, patch: 0 };
    else if (kind === 'minor')
        next = { major: cur.major, minor: cur.minor + 1, patch: 0 };
    else
        next = { major: cur.major, minor: cur.minor, patch: cur.patch + 1 };
    const reason = bump !== 'auto'
        ? `按显式指定的 ${bump} 规则递增`
        : hasBreaking
            ? `存在 ${groups.breaking.length} 条破坏性变更 → major`
            : hasFeat
                ? `存在 ${groups.feat.length} 条新功能 → minor`
                : `只有修复/其它提交（fix ${groups.fix.length} / perf ${groups.perf.length}）→ patch`;
    return { version: `${next.major}.${next.minor}.${next.patch}`, bump: kind, reason };
}
/**
 * 按字符预算挑选文件，保证「送进上下文的东西一定装得下」。
 *
 * 三条约束：
 * 1. **按变更量降序**取——大改动更可能是问题的所在，小改动先丢；
 * 2. 单个文件即使超预算也不硬塞（否则一个超大 diff 会把预算吃光，剩下的文件
 *    一个都看不到）。超预算的文件只保留 path/增删行数，patch 留空并计入 omitted；
 * 3. **条目数也要封顶**：60 个文件的元信息本身就有 3–4K 字符，只约束 patch 大小
 *    等于把「固定开销」排除在预算之外（实测整包因此超预算 4.8K）。超出条目上限的
 *    文件连元信息都不列，只计入 omitted。
 */
export function selectFilesByBudget(files, budgetChars, maxEntries = 40) {
    const budget = Number.isFinite(budgetChars) && budgetChars > 0 ? Math.floor(budgetChars) : 24_000;
    const limit = Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : 40;
    const list = Array.isArray(files) ? [...files] : [];
    list.sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));
    const selected = [];
    let used = 0;
    let omitted = 0;
    for (const f of list) {
        if (selected.length >= limit) {
            omitted++;
            continue;
        }
        const patch = typeof f.patch === 'string' ? f.patch : '';
        const cost = patch.length + f.path.length + 40;
        if (used + cost > budget) {
            omitted++;
            // 元信息仍保留：让调用方知道"还有这些文件"，只是没给正文
            selected.push({ path: f.path, additions: f.additions, deletions: f.deletions });
            continue;
        }
        used += cost;
        selected.push(patch ? { ...f, patch } : { path: f.path, additions: f.additions, deletions: f.deletions });
    }
    return { selected, omitted, chars: used };
}
/**
 * 封装信封并计算 `cost.chars`。
 *
 * `chars` 的口径是**最终返回给模型的那份 JSON 的字符数**（不含 cost 自身，
 * 否则会自指）。这样「原语是否省钱」才有可比的数字。
 */
export function finalizeEnvelope(summary, facts, nextActions, meta) {
    const payload = {
        summary,
        facts,
        ...(meta.truncated ? { truncated: meta.truncated } : {}),
        nextActions,
    };
    const chars = JSON.stringify(payload).length;
    return {
        ...payload,
        cost: {
            chars,
            ghCalls: Math.max(0, Math.floor(meta.ghCalls || 0)),
            elapsedMs: Math.max(0, Math.floor(meta.elapsedMs || 0)),
        },
    };
}
/** 从日志片段里抽取 `path:line` 形态的定位锚点（供 diagnose_ci 汇总疑似文件） */
export function extractFileAnchors(text) {
    const src = typeof text === 'string' ? text : '';
    const out = [];
    const seen = new Set();
    // 形如 `src/a.ts:12:5` / `app/divide.go:9` / `tests/test_api.py::test_x` 的前两种
    const re = /(?:^|\s)([\w./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|cpp|c|h|swift|vue|svelte)):(\d+)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const file = m[1].replace(/\\/g, '/');
        const line = Number(m[2]);
        const key = `${file}:${line}`;
        if (!Number.isFinite(line) || line <= 0 || seen.has(key))
            continue;
        seen.add(key);
        out.push({ file, line });
        if (out.length >= 20)
            break;
    }
    return out;
}
/** 把归类结果渲染成 Release notes 草稿（按类型分组，breaking 置顶） */
export function renderReleaseNotes(version, groups) {
    const section = (title, items) => items.length > 0 ? `### ${title}\n${items.map((s) => `- ${s}`).join('\n')}` : '';
    const parts = [`## v${version}`];
    const breaking = section('⚠️ Breaking Changes', groups.breaking);
    if (breaking)
        parts.push(breaking);
    const feat = section('Features', groups.feat);
    if (feat)
        parts.push(feat);
    const fix = section('Fixes', groups.fix);
    if (fix)
        parts.push(fix);
    const perf = section('Performance', groups.perf);
    if (perf)
        parts.push(perf);
    const rest = [...groups.refactor, ...groups.docs, ...groups.other];
    const other = section('Others', rest);
    if (other)
        parts.push(other);
    return parts.join('\n\n');
}
