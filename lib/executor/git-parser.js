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
    return parseGitConfig(configText).allUrls;
}
/**
 * 规范化 git 配置值：处理引号包裹与行尾注释。
 *
 * git 的实际规则（全部实测）：
 *   - 未加引号：`;` 或 `#` 之后一律视为注释，**即使前面没有空格**
 *       `url = https://github.com/a/b.git ; note`  → https://github.com/a/b.git
 *       `url = https://github.com/a/b.git;note`    → https://github.com/a/b.git
 *   - 加引号：引号内的 `;` / `#` 是字面值，注释只能出现在闭合引号之后
 *       `url = "https://user:p#ss@github.com/a/b.git"` → 保留 #
 *       `url = "https://github.com/a/b.git" ; note`    → 剥掉引号与注释
 *   - 引号内支持反斜杠转义
 *
 * 为什么必须处理：不剥注释会让 `url = https://github.com/a/b.git ; note`
 * 解析失败（URL 尾部带注释文本），用户手写的 config 里这很常见。
 */
function unquoteValue(raw) {
    const v = raw.trim();
    if (!v)
        return '';
    // 引号形态：取引号内内容（支持 \" 转义），忽略闭合引号之后的一切
    const q = v[0];
    if (q === '"' || q === "'") {
        let out = '';
        for (let i = 1; i < v.length; i++) {
            const ch = v[i];
            if (ch === '\\' && i + 1 < v.length) {
                out += v[i + 1];
                i++;
                continue;
            }
            if (ch === q)
                return out.trim();
            out += ch;
        }
        // 引号未闭合：按未加引号处理（畸形配置，尽力而非报错）
        return out.trim();
    }
    // 未加引号：首个 ; 或 # 起为注释
    const cut = v.search(/[;#]/);
    return (cut >= 0 ? v.slice(0, cut) : v).trim();
}
/**
 * 解析 `.git/config` 与 `HEAD`，产出与 git 语义一致的远程视图。
 *
 * 为什么把 HEAD 一起解析：`branch.<name>.remote` 的 `<name>` 是**当前分支**，
 * 不知道当前分支就无法按 git 的规则选出 remote，只能退化成「取第一个」——
 * 那正是本次要修的错误。
 *
 * @param configText `.git/config` 全文
 * @param headText   HEAD 文件全文。worktree 场景必须传**局部 gitdir** 下的那个，
 *                   传共享目录的会拿到主工作树分支名（实测两者不同）。
 */
export function parseGitConfig(configText, headText) {
    const remotes = [];
    const allUrls = [];
    const branchRemoteByName = new Map();
    if (typeof configText === 'string' && configText) {
        // 当前所处 section：'remote' / 'branch' / null（其他段）
        let section = null;
        let sectionName = '';
        for (const rawLine of configText.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#') || line.startsWith(';'))
                continue;
            if (line.startsWith('[')) {
                // `[remote "origin"]` / `[remote.origin]` 两种段头都认。
                // 前瞻断言排除 `[remote-tracking]` 这类同前缀但语义无关的段
                // （`\b` 做不到——`-` 是非单词字符，会被判为词边界）。
                const quoted = /^\[\s*(remote|branch)\s+"([^"]*)"\s*\]/i.exec(line);
                const dotted = /^\[\s*(remote|branch)\.([^\s\]]+)\s*\]/i.exec(line);
                const m = quoted || dotted;
                if (m) {
                    section = m[1].toLowerCase();
                    sectionName = m[2];
                }
                else {
                    section = null;
                    sectionName = '';
                }
                continue;
            }
            if (!section)
                continue;
            if (section === 'remote') {
                const mu = /^url\s*=\s*(.+)$/i.exec(line);
                if (mu) {
                    const url = unquoteValue(mu[1]);
                    if (url) {
                        // 指纹收集全部 url 行（含同 remote 的第二行）
                        if (!allUrls.includes(url))
                            allUrls.push(url);
                        // 身份映射只保留首个：git 对同名 remote 的多 url 也只认第一个
                        if (!remotes.some((r) => r.name === sectionName)) {
                            remotes.push({ name: sectionName, url });
                        }
                    }
                    continue;
                }
                // upstream 段写在前面时也要能读到——这里不做任何顺序假设
            }
            else if (section === 'branch') {
                const mr = /^remote\s*=\s*(.+)$/i.exec(line);
                if (mr) {
                    const value = unquoteValue(mr[1]);
                    if (value)
                        branchRemoteByName.set(sectionName, value);
                }
            }
        }
    }
    // HEAD 形态：`ref: refs/heads/main` → main；40 位 sha（detached）→ null
    let currentBranch = null;
    if (typeof headText === 'string' && headText) {
        const mh = /^\s*ref:\s*refs\/heads\/(.+?)\s*$/m.exec(headText);
        if (mh)
            currentBranch = mh[1];
    }
    const branchRemote = currentBranch ? branchRemoteByName.get(currentBranch) ?? null : null;
    return { remotes, allUrls, currentBranch, branchRemote };
}
/**
 * 按 git 的规则选出「这个工作区关联的 remote」。
 *
 * 优先级与 git 一致：
 *   1. `branch.<当前分支>.remote` —— 当前分支显式跟踪的 remote
 *   2. `origin`                  —— git 的默认远程
 *   3. 第一个 remote              —— 兜底（保持既有行为）
 *
 * 特殊值 `.` 表示跟踪**本地分支**而非远程（实测可设置），跳过第 1 级——
 * 拿 "." 去查 `[remote "."]` 必然查不到，且语义上它根本不是远程。
 */
export function resolveRemoteTarget(cfg) {
    const remotes = Array.isArray(cfg?.remotes) ? cfg.remotes : [];
    if (remotes.length === 0)
        return null;
    const branchRemote = cfg?.branchRemote;
    if (branchRemote && branchRemote !== '.') {
        const hit = remotes.find((r) => r.name === branchRemote);
        if (hit)
            return hit;
    }
    const origin = remotes.find((r) => r.name === 'origin');
    if (origin)
        return origin;
    return remotes[0];
}
/**
 * 从 remote url 中提取 GitHub 的 owner/repo。
 *
 * 覆盖形态（均实测于真实 clone / hand-written config）：
 *   https://github.com/o/r.git
 *   git@github.com:o/r.git
 *   ssh://git@github.com/o/r.git
 *   https://user:token@github.com/o/r.git
 *   带尾斜杠 / 不带 .git
 *
 * 非 github.com 的 host 一律返回 null（GHE 不在支持范围）。
 * 为什么绝不"猜一个"：错误身份比没有身份更有害——面板会显示一个
 * 用户根本不认识的仓库，且所有后续判断都建立在错误前提上。
 * 正则两端锚定，杜绝 `github.com.evil.com` 这类子串误匹配。
 */
export function parseGithubUrl(url) {
    if (typeof url !== 'string' || !url)
        return null;
    const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/\s]+@)?github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(url.trim());
    if (!m)
        return null;
    const owner = m[1];
    const repo = m[2];
    // 排除 `.` / `..` 这类目录穿越形态被当成仓库名
    if (!owner || !repo || repo === '.' || repo === '..')
        return null;
    return { owner, repo };
}
/**
 * 从 remote url 中提取 host（小写）。
 *
 * 覆盖：https://host/o/r、git@host:o/r、ssh://git@host:2222/o/r、带 token 的 https。
 * 无法解析返回 null。
 *
 * 为什么不直接复用 parseGithubUrl：本函数要处理**任意 host**（GHE / GitLab），
 * 用于判断「这个 remote 是不是 GitHub」，而不是「这个 remote 属于哪个 GitHub 仓库」。
 */
export function parseRemoteHost(url) {
    if (typeof url !== 'string' || !url)
        return null;
    const raw = url.trim();
    // 本地路径形态不是"远程 host"，必须显式排除：
    //   file:///c/Users/me/repo   → 否则会解析出 host "file"
    //   C:\local\repo             → 否则会解析出 host "c"（盘符）
    // 这两类的误判虽不影响 classifyRepoLayout（它只比对 'github.com'），
    // 但违反本函数「无法解析返回 null」的契约，会误导后续调用方。
    if (/^file:/i.test(raw))
        return null;
    if (/^[a-zA-Z]:[\\/]/.test(raw))
        return null;
    const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/\s]+@)?([^/:\s]+)[:/]/i.exec(raw);
    if (!m)
        return null;
    const host = m[1].toLowerCase();
    // 单字母多半是盘符残留；含空格不可能出现在 host 位置
    if (host.length < 2 || host === '.' || host.includes(' '))
        return null;
    return host;
}
/**
 * 判断工作区处于哪种远程布局。
 *
 * 为什么需要分类而不是顺序盲扫：S2 的兜底逻辑按 `.git/config` 的书写顺序
 * 挑第一个能解析出 GitHub 身份的 remote，而用户执行 `git remote rename` /
 * `git remote add` 的先后会改变这个顺序——同一个工作区在两次配置操作后
 * 可能解析出不同仓库。分类后每种布局的处置规则固定，与顺序无关。
 *
 * 分类只看 host 与 git 选中的 remote，不看 URL 的仓库名——后者是身份层的事。
 */
export function classifyRepoLayout(cfg) {
    const remotes = Array.isArray(cfg?.remotes) ? cfg.remotes : [];
    if (remotes.length === 0)
        return 'no-remote';
    const isGithub = (u) => parseRemoteHost(u) === 'github.com';
    const githubRemotes = remotes.filter((r) => isGithub(r.url));
    if (githubRemotes.length === 0)
        return 'no-github';
    if (githubRemotes.length === remotes.length)
        return 'github-only';
    return 'github-mixed';
}
/**
 * 在混合布局中确定性地选出一个 GitHub remote。
 *
 * 规则（与书写顺序无关）：
 *   1. 名字为 `origin` 的优先
 *   2. 否则按 remote 名字字典序最小的
 *
 * 为什么用字典序而不是「第一个出现的」：后者让同一个工作区的解析结果
 * 依赖用户执行 git remote 命令的先后，属于不可复现的行为。
 * 字典序是可复现、可断言的确定性规则。
 */
export function pickGithubRemote(cfg) {
    const remotes = Array.isArray(cfg?.remotes) ? cfg.remotes : [];
    const github = remotes.filter((r) => parseRemoteHost(r.url) === 'github.com');
    if (github.length === 0)
        return null;
    const origin = github.find((r) => r.name === 'origin');
    if (origin)
        return origin;
    return [...github].sort((a, b) => a.name.localeCompare(b.name))[0];
}
/**
 * 解码 git 的 C 风格路径转义（`core.quotePath=true` 时的输出形态）。
 *
 * 为什么必须解码：git 的 `core.quotePath` **默认就是 true**，此时非 ASCII 路径
 * （中文/日文/emoji）会被输出成 `"\344\270\255\346\226\207.txt"` 这种八进制转义。
 * 而 `gh pr view --json files` 返回的是**真实 UTF-8 路径**——两者不一致会导致
 * 点击文件时按真实路径查不到 diff，界面显示空白，看起来像"这个文件没改动"。
 *
 * 只在后端运行（git-parser 仅被 executor 引用），可安全使用 Buffer 做字节重组。
 */
function unquoteGitPath(raw) {
    const quoted = raw.trim();
    if (!(quoted.startsWith('"') && quoted.endsWith('"')) || quoted.length < 2)
        return quoted;
    const inner = quoted.slice(1, -1);
    const bytes = [];
    const simpleEscapes = {
        n: 10, t: 9, r: 13, '"': 34, '\\': 92, a: 7, b: 8, f: 12, v: 11,
    };
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '\\' && i + 1 < inner.length) {
            const next = inner[i + 1];
            // 八进制转义：\NNN（git 对非 ASCII 字节统一用 3 位八进制）
            if (next >= '0' && next <= '7') {
                const oct = inner.slice(i + 1, i + 4);
                if (/^[0-7]{3}$/.test(oct)) {
                    bytes.push(parseInt(oct, 8));
                    i += 3;
                    continue;
                }
            }
            if (next in simpleEscapes) {
                bytes.push(simpleEscapes[next]);
                i += 1;
                continue;
            }
            bytes.push(ch.charCodeAt(0));
            continue;
        }
        // 普通字符：按其 UTF-8 字节序列入栈（保证与八进制字节混排后可整体还原）
        for (const b of Buffer.from(ch, 'utf8'))
            bytes.push(b);
    }
    return Buffer.from(bytes).toString('utf8');
}
/**
 * 从 `diff --git <src> <dst>` 行中解析出源路径与目标路径。
 *
 * 两种形态都要支持：
 *   1. 未加引号：`diff --git a/src/app.ts b/src/app.ts`
 *   2. 加引号：`diff --git "a/\344\270\255.txt" "b/\344\270\255.txt"`
 *      —— core.quotePath=true（git 默认值）下的非 ASCII 路径形态，需转义还原。
 *
 * 未加引号形态的分割点判定为什么不能用「第一个」或「最后一个 ` b/`」：
 * 路径本身就可能含 ` b/` 子串（如 `diff --git a/x b/y.ts b/x b/y.ts`）。
 *   非贪婪 → 在第一个 ` b/` 截断，得到 src=`x` / dst=`y.ts b/x b/y.ts`（错）
 *   贪婪   → 在最后一个 ` b/` 截断，得到 src=`x b/y.ts b/x` / dst=`y.ts`（也错）
 * 正确做法：**枚举所有 ` b/` 分割点，优先选让两侧路径相等的那个**——
 * 因为除重命名外 git 的 src 与 dst 本就同路径。重命名场景退化为取首个分割点。
 */
function parseDiffGitHeader(line) {
    const body = line.replace(/^diff --git\s+/, '').trim();
    if (!body)
        return null;
    // 形态 2：两侧均为带引号字符串
    if (body.startsWith('"')) {
        const m = /^("(?:[^"\\]|\\.)*")\s+("(?:[^"\\]|\\.)*")$/.exec(body);
        if (!m)
            return null;
        return { src: unquoteGitPath(m[1]), dst: unquoteGitPath(m[2]) };
    }
    // 形态 1：逐分割点尝试，优先两侧等值
    if (!body.startsWith('a/'))
        return null;
    const rest = body.slice(2);
    const positions = [];
    let idx = rest.indexOf(' b/');
    while (idx >= 0) {
        positions.push(idx);
        idx = rest.indexOf(' b/', idx + 1);
    }
    if (positions.length === 0)
        return null;
    for (const p of positions) {
        const srcPart = rest.slice(0, p);
        const dstPart = rest.slice(p + 1); // 跳过空格，保留 "b/..." 前缀
        if (dstPart.startsWith('b/') && dstPart.slice(2) === srcPart) {
            return { src: `a/${srcPart}`, dst: dstPart };
        }
    }
    // 重命名等两侧路径确实不同的场景：取首个分割点
    const p = positions[0];
    return { src: `a/${rest.slice(0, p)}`, dst: rest.slice(p + 1) };
}
/**
 * 将整段 Git Unified Diff 纯文本按变动文件切分为字典映射。
 *
 * 为什么需要按文件切片：PR 可能会修改数十个文件，前端需要支持「点击某个文件即刻查看该文件改动」。
 * 在内存做切片索引后，切换文件无需发起网络请求（0ms 响应），体验极致流畅。
 *
 * 键必须与 `gh pr view --json files` 返回的 `files[].path` **逐字一致**，
 * 否则点击文件查不到 diff。因此需要处理 core.quotePath 的八进制转义。
 *
 * @param rawDiff gh pr diff 或 git diff 输出的原始文本
 * @returns 映射字典：{ [filePath: string]: string (该文件的完整 diff 文本段) }
 */
export function splitUnifiedDiff(rawDiff) {
    const fileDiffs = {};
    if (typeof rawDiff !== 'string' || !rawDiff)
        return fileDiffs;
    // 使用正向前瞻匹配每一个 `diff --git ` 开头的分界线
    const chunks = rawDiff.split(/(?=^diff --git )/m);
    for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed.startsWith('diff --git'))
            continue;
        const firstLine = trimmed.split(/\r?\n/, 1)[0] || '';
        const parsed = parseDiffGitHeader(firstLine);
        if (!parsed)
            continue;
        const { src, dst } = parsed;
        // 统一剥掉 a/ 与 b/ 前缀，得到仓库内的相对路径
        const srcPath = src.replace(/^[ab]\//, '');
        const dstPath = dst.replace(/^[ab]\//, '');
        // 删除文件时目标侧是 /dev/null，必须回退用源路径作为键，
        // 否则该文件的 diff 会被挂到一个不存在的 "/dev/null" 键上，永远查不到。
        const isDeletion = dstPath === 'dev/null' || dstPath === '/dev/null';
        const targetPath = isDeletion ? srcPath : dstPath;
        if (targetPath) {
            fileDiffs[targetPath] = trimmed;
        }
    }
    return fileDiffs;
}
