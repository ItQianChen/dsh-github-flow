/**
 * 解析 `git status -sb --porcelain` 输出为结构化状态。
 * 抽导出纯函数（parseGhVersion 同理）：三形态解析是易错边界区，单测钉死。
 *
 * 输出形态（实测）：
 *   `## master...origin/master [ahead 2, behind 1]`  有 ahead/behind
 *   `## master...origin/master`                       与远程同步
 *   `## master` / `## HEAD (no branch)`               无 upstream（ahead/behind 未知=-1）
 * 后续每行 `<XY> <path>` 为 porcelain 变更项（XY 两字符状态码，?? = untracked）。
 */
export function parseGitStatusOutput(output, maxFiles = 20) {
    const lines = (output || '').split('\n').filter((l) => l.length > 0);
    if (lines.length === 0 || !lines[0].startsWith('## '))
        return null;
    const branchLine = lines[0].slice(3); // 去掉 '## ' 前缀
    const hasUpstream = branchLine.includes('...');
    const branchPart = hasUpstream ? branchLine.split('...')[0] : branchLine.split(' ')[0];
    let ahead = -1;
    let behind = -1;
    if (hasUpstream) {
        // ahead/behind 段在 upstream 之后（可能与 #id 同现：origin/master #12）。
        // git 输出形态实测：`[ahead 2]` / `[behind 1]` / `[ahead 2, behind 1]`——
        // 单括号内逗号分隔，behind 不必然前邻 '['（正则不可锚定 '['，否则
        // `[ahead 2, behind 1]` 形态的 behind 永远漏解析——单测抓到的真实 Bug）
        const trackingPart = branchLine.split('...')[1] || '';
        ahead = 0;
        behind = 0;
        const aheadMatch = /ahead (\d+)/.exec(trackingPart);
        const behindMatch = /behind (\d+)/.exec(trackingPart);
        if (aheadMatch)
            ahead = Number(aheadMatch[1]);
        if (behindMatch)
            behind = Number(behindMatch[1]);
        // 仅 ahead 无 behind 时 behind=0（反之亦然）——git 输出只列非零侧
    }
    const dirtyFiles = [];
    const limit = maxFiles > 0 ? maxFiles : Number.MAX_SAFE_INTEGER;
    for (let i = 1; i < lines.length && dirtyFiles.length < limit; i++) {
        const line = lines[i];
        if (line.length < 4)
            continue;
        const status = line.slice(0, 2).trim() || 'M';
        // 路径可能含空格（git 不加引号场景）；rename 形态 `R  old -> new` 取 new
        let p = line.slice(3).trim();
        const renameArrow = p.indexOf(' -> ');
        if (renameArrow >= 0)
            p = p.slice(renameArrow + 4).trim();
        if (p.startsWith('"') && p.endsWith('"') && p.length >= 2) {
            p = p.slice(1, -1);
        }
        dirtyFiles.push({ status, path: p });
    }
    return {
        branch: branchPart.replace(/\s*\(no branch\)$/, '') || 'HEAD',
        ahead,
        behind,
        dirtyCount: Math.max(0, lines.length - 1),
        hasUpstream,
        dirtyFiles,
    };
}
/**
 * 解析 `git log` 输出为提交条目数组。
 * 支持两种形态：
 * 1. 结构化带详情：%x1e 为 commit 间分隔符，%x1f 为字段间分隔符（含 fullSha/email/date/body/stat）；
 * 2. 简易管道符：%h|%an|%ar|%s 行格式（兼容旧单测输入）。
 * 空输出返回 []。
 */
export function parseGitLogLines(output) {
    const out = (output || '').trim();
    if (!out)
        return [];
    if (out.includes('\x1e') || out.includes('\x1f')) {
        const records = out.split('\x1e').filter((c) => c.trim().length > 0);
        return records.map((chunk) => {
            const parts = chunk.split('\x1f');
            return {
                sha: (parts[0] || '').trim(),
                fullSha: (parts[1] || '').trim() || undefined,
                author: (parts[2] || '').trim(),
                email: (parts[3] || '').trim() || undefined,
                date: (parts[4] || '').trim() || undefined,
                relative: (parts[5] || '').trim(),
                subject: (parts[6] || '').trim(),
                body: (parts[7] || '').trim() || undefined,
                stat: (parts[8] || '').trim() || undefined,
            };
        });
    }
    return out.split('\n').filter(Boolean).map((line) => {
        const parts = line.split('|');
        return {
            sha: parts[0] || '',
            author: parts[1] || '',
            relative: parts[2] || '',
            subject: parts.slice(3).join('|'),
        };
    });
}
/**
 * 解析 git branch -a --sort=-committerdate 格式化输出。
 * 格式为: %(refname:short)|%(HEAD)|%(upstream:short)|%(committerdate:relative)|%(objectname:short)|%(subject)
 */
export function parseGitBranchLines(output) {
    const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let current = '';
    const branches = [];
    const seenNames = new Set();
    for (const line of lines) {
        const parts = line.split('|');
        if (parts.length < 5)
            continue;
        const rawRef = parts[0].trim();
        // 过滤掉指向 HEAD 的符号引用（如 origin/HEAD）
        if (rawRef.includes('/HEAD') || rawRef === 'HEAD')
            continue;
        const isCurrent = parts[1].trim() === '*';
        const upstream = parts[2].trim() || undefined;
        const relativeTime = parts[3].trim() || '';
        const shortSha = parts[4].trim() || '';
        const subject = parts.slice(5).join('|').trim();
        // 区分远程分支与本地分支
        const isRemote = rawRef.startsWith('origin/') || rawRef.startsWith('remotes/');
        const cleanName = rawRef.replace(/^remotes\//, '');
        if (seenNames.has(cleanName))
            continue;
        seenNames.add(cleanName);
        if (isCurrent) {
            current = cleanName;
        }
        branches.push({
            name: cleanName,
            isCurrent,
            isRemote,
            upstream,
            shortSha,
            subject,
            relativeTime,
        });
    }
    // 若未从 * 解析到当前分支，默认以第一条本地分支兜底
    if (!current && branches.length > 0) {
        const local = branches.find((b) => !b.isRemote);
        current = local ? local.name : branches[0].name;
    }
    return { current, branches };
}
/**
 * 解析 unified diff 输出，统计增删行数与区块数量。
 * 忽略 diff 文件头（--- 和 +++），仅统计真正的改动行（+ 与 -）。
 */
export function parseUncommittedDiff(rawDiff) {
    let additions = 0;
    let deletions = 0;
    let hunksCount = 0;
    if (!rawDiff || typeof rawDiff !== 'string') {
        return { additions, deletions, hunksCount };
    }
    const lines = rawDiff.split('\n');
    for (const line of lines) {
        if (line.startsWith('@@')) {
            hunksCount++;
        }
        else if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++;
        }
        else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
        }
    }
    return { additions, deletions, hunksCount };
}
/**
 * 解析 `git show --stat` 或 `git log --stat` 的统计文本为结构化列表与增删数字。
 * 能够从 `19 ++++++++++++++++++-` 精准推导 additions=18, deletions=1，
 * 提取文件路径与 `X files changed, Y insertions(+), Z deletions(-)` 汇总。
 */
export function parseGitStatText(statText) {
    if (!statText || typeof statText !== 'string')
        return null;
    const lines = statText.split('\n');
    const files = [];
    let summary = null;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        // 检查汇总行（如 6 files changed, 62 insertions(+), 6 deletions(-)）
        const summaryMatch = trimmed.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/i);
        if (summaryMatch) {
            summary = {
                filesChanged: parseInt(summaryMatch[1], 10),
                insertions: parseInt(summaryMatch[2] || '0', 10),
                deletions: parseInt(summaryMatch[3] || '0', 10),
            };
            continue;
        }
        // 检查文件变更行（包含 | 分隔符）
        const pipeIdx = trimmed.indexOf('|');
        if (pipeIdx > 0) {
            let left = trimmed.slice(0, pipeIdx).trim();
            const right = trimmed.slice(pipeIdx + 1).trim();
            // 去除文件名两端可能的双引号
            if (left.startsWith('"') && left.endsWith('"') && left.length >= 2) {
                left = left.slice(1, -1);
            }
            if (/^Bin\b/i.test(right)) {
                files.push({ path: left, total: 0, additions: 0, deletions: 0, isBinary: true, rawRight: right });
            }
            else {
                const numMatch = right.match(/^(\d+)(.*)$/);
                if (numMatch) {
                    const total = parseInt(numMatch[1], 10);
                    const graph = numMatch[2].trim();
                    let plusCount = 0;
                    let minusCount = 0;
                    for (let i = 0; i < graph.length; i++) {
                        if (graph[i] === '+')
                            plusCount++;
                        else if (graph[i] === '-')
                            minusCount++;
                    }
                    let additions = 0;
                    let deletions = 0;
                    if (plusCount === 0 && minusCount === 0) {
                        additions = total;
                    }
                    else if (minusCount === 0) {
                        additions = total;
                        deletions = 0;
                    }
                    else if (plusCount === 0) {
                        additions = 0;
                        deletions = total;
                    }
                    else {
                        if (plusCount + minusCount === total) {
                            additions = plusCount;
                            deletions = minusCount;
                        }
                        else {
                            const addExact = Math.round((total * plusCount) / (plusCount + minusCount));
                            additions = addExact;
                            deletions = Math.max(0, total - addExact);
                        }
                    }
                    files.push({ path: left, total, additions, deletions, isBinary: false });
                }
            }
        }
    }
    if (files.length === 0 && !summary)
        return null;
    return { files, summary };
}
/**
 * 提取 `.git/config` 中所有 `[remote "..."]` 段内的 url。
 *
 * 为什么必须按段扫描而不是全文抓 `url = `：`[submodule "..."]` 段同样带 url
 * （实测 `[submodule "lib"] url = https://github.com/x/y.git`）。全文正则会把
 * 子模块的远程算进指纹，导致一次 `git submodule add` 就触发整个面板缓存的
 * 无谓作废。子模块的 url 与本工作区关联哪个 GitHub 仓库毫无关系。
 *
 * 输出语义：保持文件中的出现顺序、已去重、不含空值。
 * 排序交给调用方（指纹需要稳定顺序，但那是调用方的语义，纯函数不该替它决定）。
 */
export function parseRemoteUrls(configText) {
    if (typeof configText !== 'string' || !configText)
        return [];
    const urls = [];
    const seen = new Set();
    // 段头：`[remote "origin"]` / `[remote 'origin']` / 无引号的 `[core]`
    let inRemoteSection = false;
    for (const rawLine of configText.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith(';'))
            continue;
        if (line.startsWith('[')) {
            // 只认 `[remote "<name>"]` / `[remote.<name>]` / `[remote]` 三种真实 git 段头。
            // 前瞻断言限定 remote 之后必须是空白/引号/点/右括号，排除 `[remote-tracking]`
            // 这类同前缀但语义无关的段（`\b` 做不到——`-` 是非单词字符，会被判为词边界）。
            inRemoteSection = /^\[\s*remote(?=[\s."\]])/i.test(line);
            continue;
        }
        if (!inRemoteSection)
            continue;
        const m = /^url\s*=\s*(.+)$/i.exec(line);
        if (m) {
            let url = m[1].trim();
            // git 允许给值加引号并在解析时剥掉（实测 `url = "https://..."` 会得到无引号值）。
            // 不剥离会让「同一个 url 从带引号改成不带引号」被误判成配置变更，
            // 从而触发一次无谓的缓存作废。
            if (url.length >= 2 && ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'")))) {
                url = url.slice(1, -1).trim();
            }
            if (url && !seen.has(url)) {
                seen.add(url);
                urls.push(url);
            }
        }
    }
    return urls;
}
