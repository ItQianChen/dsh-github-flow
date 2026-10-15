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
export function parseGitStatusOutput(output) {
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
    for (let i = 1; i < lines.length && dirtyFiles.length < 20; i++) {
        const line = lines[i];
        if (line.length < 4)
            continue;
        const status = line.slice(0, 2).trim() || 'M';
        // 路径可能含空格（git 不加引号场景）；rename 形态 `R  old -> new` 取 new
        let p = line.slice(3);
        const renameArrow = p.indexOf(' -> ');
        if (renameArrow >= 0)
            p = p.slice(renameArrow + 4);
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
