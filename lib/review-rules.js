/**
 * 仓库审查规则（AGENTS.md）与严重度前缀：纯函数模块。
 *
 * 为什么单独一个模块：
 * 1. 规则必须来自**仓库自身**（Codex 的做法），不是插件内置偏好——内置偏好等于
 *    把作者的品味强加给每个仓库；
 * 2. 纯函数才能被测试真正覆盖：只有 `readReviewRules` 一处 I/O，截取与归一化全部可单测；
 * 3. 本文件只被服务端工具层消费（不在 `lib/ui/` 里，不参与客户端 bundle 内联），
 *    因此可以正常使用 node 内置模块。
 */
import fs from 'node:fs';
import path from 'node:path';
/** 规则文件单个体积上限（字节）。超过即视为「不是给人看的规则」，只取前 8KB */
const MAX_RULE_FILE_BYTES = 8 * 1024;
/** 多份规则合计上限（字节） */
const MAX_RULES_TOTAL_BYTES = 16 * 1024;
/** 就近查找时向上回溯的目录层数上限，防止在 monorepo 里一路读到根 */
const MAX_WALK_UP = 6;
/**
 * 从 Markdown 里截取指定二级标题下的内容。
 *
 * 边界规则（这是本函数存在的全部理由）：
 * - 标题行必须是 `## <title>` 或 `## <title> ...`（大小写不敏感，允许尾随空格）；
 * - 内容到**下一个同级或更高级标题**（`## ` 或 `# `）为止；
 * - 代码块里的 `## ` 不算标题（``` 围栏内跳过），否则规则里贴一段 diff 就会截断；
 * - 找不到标题返回 null（调用方据此判定「该文件没有规则段」）。
 */
export function extractSection(md, title) {
    if (typeof md !== 'string' || !md)
        return null;
    const want = title.trim().toLowerCase();
    if (!want)
        return null;
    const lines = md.split(/\r?\n/);
    let inFence = false;
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence)
            continue;
        if (start < 0) {
            const m = /^##\s+(.+?)\s*$/.exec(line);
            if (m && m[1].trim().toLowerCase() === want)
                start = i + 1;
            continue;
        }
        // 已进入规则段：遇到同级或更高级标题即结束
        if (/^#{1,2}\s+/.test(line)) {
            return lines.slice(start, i).join('\n').trim();
        }
    }
    return start < 0 ? null : lines.slice(start).join('\n').trim();
}
/**
 * 给审查意见补严重度前缀。
 *
 * 为什么「只补不删」：
 * - 已有 `[P0]/[P1]/[P2]` 原样保留（作者/上游工具的判断优先，插件不覆盖）；
 * - 缺失才前置 `[P2]`；
 * - **绝不降级**：`[P0]` 永远不会被改成 `[P2]`。一条审查意见的优先级是写它的人的
 *   语义判断，插件没有资格改写。
 *
 * 幂等：`normalizeSeverity(normalizeSeverity(x)) === normalizeSeverity(x)`。
 */
export function normalizeSeverity(body) {
    const text = typeof body === 'string' ? body : String(body ?? '');
    const trimmed = text.trim();
    if (!trimmed)
        return trimmed;
    // 前缀判定必须锚在开头，且允许 `[P1]` 后面直接跟正文（无空格）——实测两种写法都有人用
    if (/^\[P[012]\]/i.test(trimmed))
        return trimmed;
    return `[P2] ${trimmed}`;
}
/** 统计一组审查意见的严重度分布（返回给调用方做汇总，不改变内容） */
export function summarizeSeverity(bodies) {
    const out = { P0: 0, P1: 0, P2: 0 };
    for (const b of Array.isArray(bodies) ? bodies : []) {
        const m = /^\[(P[012])\]/i.exec(String(b ?? '').trim());
        const key = (m ? m[1].toUpperCase() : 'P2');
        out[key]++;
    }
    return out;
}
/**
 * 从文件内容里取规则段；整文件没有 `## Code Review Rules` 时，退化为整份文件。
 *
 * 为什么允许退化：多数 AGENTS.md 就是一篇「该怎么干活」的散装文档，强制要求
 * 二级标题会让绝大多数仓库一条规则都注入不了——那等于这个功能对多数人不存在。
 */
function extractRulesFromFile(md) {
    const section = extractSection(md, 'Code Review Rules');
    const text = section !== null ? section : md;
    const trimmed = text.trim();
    return trimmed ? trimmed : null;
}
/**
 * 按 UTF-8 字节上限裁剪文本，**保证不切断多字节字符**。
 *
 * 为什么不能用 `Buffer.subarray(0, n).toString('utf8')`：那样会在字符中间切断，
 * 产出 U+FFFD 替换符（中文规则文件 8KB ≈ 2700 字，切在边界上的概率不低）。
 * 规则要原样注入上下文，出现乱码比少几个字更糟。
 */
function truncateToBytes(text, maxBytes) {
    if (Buffer.byteLength(text, 'utf8') <= maxBytes)
        return text;
    let out = '';
    let used = 0;
    for (const ch of text) {
        const size = Buffer.byteLength(ch, 'utf8');
        if (used + size > maxBytes)
            break;
        out += ch;
        used += size;
    }
    return out;
}
/**
 * 读取工作区的审查规则。
 *
 * 查找顺序：仓库根 `AGENTS.md` → 每个变更文件所在目录就近 `AGENTS.md`（向上回溯，
 * 去重）。就近规则排在后（越具体越靠后，便于人按顺序读）。
 *
 * 全部读不到时返回 `null`——调用方据此**不加** `reviewRules` 字段（而不是给个空对象），
 * 这样「没规则」与「规则为空」在输出里可区分。
 */
export function readReviewRules(cwd, changedPaths) {
    if (!cwd || !fs.existsSync(cwd))
        return null;
    const candidates = [];
    const pushCandidate = (rel) => {
        const normalized = rel.replace(/\\/g, '/');
        if (normalized && !candidates.includes(normalized))
            candidates.push(normalized);
    };
    pushCandidate('AGENTS.md');
    for (const p of Array.isArray(changedPaths) ? changedPaths : []) {
        if (typeof p !== 'string' || !p)
            continue;
        let dir = path.dirname(p.replace(/\\/g, '/'));
        let depth = 0;
        while (dir && dir !== '.' && dir !== '/' && depth < MAX_WALK_UP) {
            pushCandidate(`${dir}/AGENTS.md`);
            const next = path.posix.dirname(dir);
            if (next === dir)
                break;
            dir = next;
            depth++;
        }
    }
    const sources = [];
    let total = 0;
    let truncated = false;
    for (const rel of candidates) {
        const abs = path.join(cwd, rel);
        let stat;
        try {
            stat = fs.statSync(abs);
        }
        catch {
            continue;
        }
        if (!stat.isFile())
            continue;
        let raw;
        try {
            raw = fs.readFileSync(abs, 'utf8');
        }
        catch {
            continue;
        }
        if (Buffer.byteLength(raw, 'utf8') > MAX_RULE_FILE_BYTES) {
            raw = truncateToBytes(raw, MAX_RULE_FILE_BYTES);
            truncated = true;
        }
        const content = extractRulesFromFile(raw);
        if (!content)
            continue;
        if (total + Buffer.byteLength(content, 'utf8') > MAX_RULES_TOTAL_BYTES) {
            truncated = true;
            break;
        }
        total += Buffer.byteLength(content, 'utf8');
        sources.push({ path: rel, content });
    }
    return sources.length > 0 ? { sources, truncated } : null;
}
/** 把规则渲染成人类与 Agent 都能读的 Markdown 段落（无规则时返回空串） */
export function renderReviewRules(rules) {
    if (!rules || rules.sources.length === 0)
        return '';
    const parts = ['\n## 仓库审查规则（AGENTS.md）'];
    for (const s of rules.sources) {
        parts.push(`> 源: \`${s.path}\`\n\n${s.content}`);
    }
    if (rules.truncated) {
        parts.push('> ⚠️ 规则文件超出体积上限（单文件 8KB / 合计 16KB），已截断。');
    }
    return parts.join('\n\n');
}
