/**
 * 操作记录（审计）层。
 *
 * 为什么需要：`confirm: true` 是**模型自己填的参数**，`AWAITING_CONFIRMATION` 只被遥测
 * 记成一个内存布尔（`src/telemetry.ts`，环形队列 200 条，进程一退就没了）。于是
 * 「Agent 到底对我的 PR 做了什么」在本机没有任何可查的事实源。本模块补上这一层：
 * 每次 `github_*` 工具调用结束，落一条可筛、可删、可折叠的事件流。
 *
 * 三条设计约束（改本文件前先读）：
 * 1. **Fail-Open 是硬要求**：记录失败绝不允许影响工具结果。构造失败（目录不可写、
 *    JSONL 损坏）一律降级为 no-op 而不是抛错——Cordis 里 `apply()` 抛错会让 Fiber
 *    进 FAILED，代价是 19 个工具全部消失，一个观测功能没资格带走主功能。
 * 2. **append-only + 墓碑**：追加写保证并发不丢记录；用户点「删除」时先追加墓碑
 *    （崩溃也能正确读回），再整体压实（真删磁盘字节）。只追加不压实 = 用户以为删了
 *    其实还在，那是隐私问题不是性能问题。
 * 3. **分类真源分别是 tool-tiers 与 destructive，不在这里另造第二张表**。
 *    历史上「两张表说两件事」是本仓库最贵的漂移源（见 `src/tool-tiers.ts` 头注释）。
 *
 * 事件流形态（一行一个事件，读取时按 id 折叠）：
 *   intent   决定动手（写操作）
 *   decision 人工审核结论（s2 引入；s1 不产生）
 *   result   工具实际结果（ok / fail）
 *   delete   墓碑（被删 id 列表）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WRITE_ACTIONS } from './tool-tiers.js';
import { DESTRUCTIVE_ACTIONS } from './destructive.js';
/** 落盘上限：单文件 5 MB / 2000 行。超限按时间尾部保留最新部分（不是滚动分片）。 */
const MAX_ROWS = 2000;
const MAX_BYTES = 5 * 1024 * 1024;
/** ---------------- 分类 ---------------- */
/**
 * 是否写操作：真源是 `WRITE_ACTIONS`（`src/tool-tiers.ts`），只读档位用的也是它。
 * `'*'`（`github_api`）视为写：端点与 method 都能任意，无法降级。
 */
export function classifyWrite(tool, action) {
    const spec = WRITE_ACTIONS[tool];
    if (spec === undefined)
        return false;
    if (spec === '*')
        return true;
    return spec.includes(action);
}
/** 风险分级：命中闸门表即 destructive，否则按写/读 */
export function classifyRisk(tool, action) {
    const table = DESTRUCTIVE_ACTIONS[tool];
    if (table && Object.prototype.hasOwnProperty.call(table, action))
        return 'destructive';
    return classifyWrite(tool, action) ? 'write' : 'read';
}
/** ---------------- 摘要 ---------------- */
const s = (v) => (v === undefined || v === null ? '' : String(v).trim());
/** 把编号渲染成 `#19`；缺失时给 `#?`——不猜，也不留空让人误以为是别的操作 */
function num(v) {
    const t = s(v);
    return t ? `#${t}` : '#?';
}
const onOff = (v) => (v === true ? '，删源分支' : '');
/**
 * PR / Issue 的人话摘要（本模块唯一手写文案的地方）。
 *
 * 为什么只给这两个工具手写：它们是「Agent 动了什么」的主战场（21 个写 action +
 * 最常用的读 action），其余 15 个工具走结构化兜底即可。兜底刻意保持机器可读
 * （`github_release.delete v0.7.1`），因为那些操作的语义差异不值得 40 行文案。
 */
const SUMMARY = {
    // ---- PR（15 action）----
    'github_pr:list': (a) => `列出 PR${a.state ? `（${s(a.state)}）` : ''}`,
    'github_pr:view': (a) => `查看 PR ${num(a.pr_number)}`,
    'github_pr:create': (a) => `创建 PR${a.title ? `「${clip(a.title, 40)}」` : ''}${a.base ? ` → ${s(a.base)}` : ''}`,
    'github_pr:diff': (a) => `读取 PR ${num(a.pr_number)} 的 Diff${a.stat_only ? '（仅统计）' : ''}`,
    'github_pr:checks': (a) => `查看 PR ${num(a.pr_number)} 的 CI Checks`,
    'github_pr:review': (a) => {
        const ws = s(a.review_decision);
        const writeMode = a.write === true || a.review_action === 'write';
        return writeMode ? `写回 PR ${num(a.pr_number)} 的评审${ws ? `（${ws}）` : ''}` : `生成 PR ${num(a.pr_number)} 的评审结论`;
    },
    'github_pr:merge': (a) => `合并 PR ${num(a.pr_number)}（${s(a.merge_method) || 'squash'}${onOff(a.delete_branch)}）`,
    'github_pr:checkout': (a) => `检出 PR ${num(a.pr_number)} 到本地${a.force === true ? '（force）' : ''}`,
    'github_pr:status': () => '查看当前分支的 PR 状态',
    'github_pr:view_images': (a) => `下载 PR ${num(a.pr_number)} 正文图片`,
    'github_pr:ready': (a) => `把 PR ${num(a.pr_number)} 标记为可评审${a.undo === true ? '（撤回草稿状态）' : ''}`,
    'github_pr:revert': (a) => `对 PR ${num(a.pr_number)} 创建反向提交`,
    'github_pr:update_branch': (a) => `用基准分支更新 PR ${num(a.pr_number)}`,
    'github_pr:comment': (a) => `在 PR ${num(a.pr_number)} 发表评论`,
    'github_pr:edit': (a) => `修改 PR ${num(a.pr_number)}`,
    // ---- Issue（16 action）----
    'github_issue:list': (a) => `列出 Issue${a.state ? `（${s(a.state)}）` : ''}`,
    'github_issue:view': (a) => `查看 Issue ${num(a.issue_number)}`,
    'github_issue:create': (a) => `创建 Issue${a.title ? `「${clip(a.title, 40)}」` : ''}`,
    'github_issue:comment': (a) => `在 Issue ${num(a.issue_number)} 发表评论`,
    'github_issue:close': (a) => `关闭 Issue ${num(a.issue_number)}${a.reason ? `（${s(a.reason)}）` : ''}`,
    'github_issue:reopen': (a) => `重开 Issue ${num(a.issue_number)}`,
    'github_issue:edit': (a) => `修改 Issue ${num(a.issue_number)}`,
    'github_issue:develop': (a) => `为 Issue ${num(a.issue_number)} 创建并检出开发分支`,
    'github_issue:view_images': (a) => `下载 Issue ${num(a.issue_number)} 正文图片`,
    'github_issue:delete': (a) => `**物理删除** Issue ${num(a.issue_number)}`,
    'github_issue:transfer': (a) => `迁移 Issue ${num(a.issue_number)} → ${s(a.target_repo) || '?'}`,
    'github_issue:pin': (a) => `置顶 Issue ${num(a.issue_number)}`,
    'github_issue:unpin': (a) => `取消置顶 Issue ${num(a.issue_number)}`,
    'github_issue:lock': (a) => `锁定 Issue ${num(a.issue_number)} 的讨论`,
    'github_issue:unlock': (a) => `解锁 Issue ${num(a.issue_number)} 的讨论`,
    'github_issue:status': () => '查看跨仓 Issue 待办',
};
function clip(v, max) {
    const t = s(v).replace(/\s+/g, ' ');
    return t.length > max ? t.slice(0, max) + '…' : t;
}
/**
 * 工作区路径归一：分隔符统一为 `/`、去掉尾斜杠；Windows 下再按大小写不敏感比较。
 *
 * 为什么要归一而不是直接字符串相等：同一个工作区可能以 `D:\repo`、`D:/repo`、
 * `D:/repo/` 三种形态出现（客户端来自 props、记录来自 gh 调用时的 cwd）；
 * 不归一就会出现「右栏明明是这个仓库，却一条记录都查不到」——最难解释的一类空列表。
 * 为什么不在 Linux 上也折大小写：那里两个只差大小写的目录是两个真实存在的工作区。
 */
function normalizeCwd(v) {
    const raw = s(v);
    if (!raw)
        return '';
    const out = raw.replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? out.toLowerCase() : out;
}
/** 定位标识：按工具语义挑第一个有值的字段，全部缺失时返回 undefined（不猜） */
const TARGET_KEYS = [
    'pr_number', 'issue_number', 'discussion_number', 'number', 'run_id', 'tag',
    'gist_id', 'cache_id', 'key', 'codespace', 'item_id', 'skill_name', 'workflow', 'name',
];
export function pickTarget(args) {
    if (!args || typeof args !== 'object')
        return undefined;
    for (const k of TARGET_KEYS) {
        const t = s(args[k]);
        if (t)
            return k === 'pr_number' || k === 'issue_number' || k === 'discussion_number' ? `#${t}` : t;
    }
    return undefined;
}
/** 人话摘要：PR / Issue 走细表，其余工具给机器可读兜底（永不抛错） */
export function summarizeOperation(tool, action, args) {
    try {
        const fn = SUMMARY[`${tool}:${action}`];
        if (fn)
            return fn(args || {});
        // `github_api` 没有 action 维度（端点与 method 都是自由参数），单独给一条可读形态，
        // 否则摘要会退化成 "github_api." ——末尾一个孤零零的点，什么都说明不了。
        if (tool === 'github_api') {
            const method = s(args?.method) || 'GET';
            const endpoint = clip(args?.endpoint, 60) || '?';
            return `github_api ${method} ${endpoint}`;
        }
        const target = pickTarget(args);
        if (!action)
            return target ? `${tool} ${target}` : tool;
        return `${tool}.${action}${target ? ' ' + target : ''}`;
    }
    catch {
        return `${tool}.${action || '?'}`;
    }
}
/**
 * 从 `tools/result` 的第二参里取结果事实，**同时兼容两种形状**。
 *
 * 为什么必须双形状：
 * - 运行时（宿主 `pipeline.ts:381-425`）传的是**归一化后的** `ToolExecutionResult`
 *   `{ isError, content, value, meta }`——工具原始返回值在 `value` 里。直接读
 *   `result.status` 恒为 undefined，这是本仓库遥测长期读错层级的同款坑。
 * - 单元测试（`test/phase20`）直接拿**原始载荷**调 `recordCall`。写死一级会让既有
 *   断言静默失效，所以这里两种都认。
 */
export function extractOutcome(result) {
    const isWrapped = Boolean(result) && typeof result === 'object' && 'isError' in result;
    const payload = isWrapped ? result.value : result;
    const isError = isWrapped ? result.isError === true : false;
    const errInfo = isWrapped ? result.error?.info : undefined;
    const errMsg = isWrapped ? result.error?.message : undefined;
    const okFlag = payload && typeof payload === 'object' ? payload.ok : undefined;
    const failed = isError || okFlag === false || (payload && typeof payload === 'object' && payload.success === false);
    const status = payload && typeof payload === 'object' && typeof payload.status === 'string'
        ? payload.status
        : undefined;
    const degraded = payload && typeof payload === 'object' && payload.degraded === true;
    let errorType;
    if (failed) {
        errorType =
            s(errInfo?.code) ||
                s(payload?.error) ||
                s(errMsg) ||
                'UNKNOWN_ERROR';
        errorType = errorType.slice(0, 60);
    }
    return { ok: !failed, errorType, status, degraded };
}
/**
 * 解析该次调用对应的仓库与工作区（同步、不 spawn `gh`）。
 *
 * 为什么不能用 `getRepoMetadata()`：它会在必要时 spawn `gh repo view`，而本函数位于
 * `tools/result` 的**热路径**上——每次工具调用都多 300ms 是不可接受的。
 * 为什么必须先 `resolveExecScope`：宿主的 `exec.agent` 只有 `{ id }`，既没有 cwd 也没有
 * sessionId（`src/executor.ts:329-334` 记录了这次踩坑），自己拼 sessionId 在桌面端永远落空。
 */
export function resolveScopeFromExec(executor, exec, args) {
    try {
        const explicit = s(args?.repo);
        const scope = executor?.resolveExecScope?.(exec);
        const cwd = s(scope?.cwd) || undefined;
        // 只有形如 owner/name 的显式值才算数：`repo: "foo"` 这种脏值不该被当成仓库全名写进记录
        if (explicit.includes('/'))
            return { repo: explicit, cwd };
        if (!cwd)
            return {};
        const meta = executor?.getRepoIdentityFromLocal?.(cwd);
        const repo = s(meta?.nameWithOwner) || undefined;
        return repo ? { repo, cwd } : { cwd };
    }
    catch {
        return {};
    }
}
/** 只取仓库名（保留本入口：多处调用方只关心 repo，不想解构） */
export function resolveRepoFromExec(executor, exec, args) {
    return resolveScopeFromExec(executor, exec, args).repo;
}
/** `~/.dsh/data/dsh-github-flow`（与 proxy.json / update-settings.json 同目录树） */
export function auditDataDir() {
    const home = process.env.DSH_HOME ? process.env.DSH_HOME : path.join(os.homedir(), '.dsh');
    return path.join(home, 'data', 'dsh-github-flow');
}
/**
 * 事件流存储。
 *
 * 写入路径：`recordCall()` → 内存（查询立即可见）→ 攒批 → 200ms 后一次刷盘。
 * 读路径：`list()` 全量折叠（行数上限 2000，折叠是 O(n) 的内存操作，不值得做增量索引）。
 */
export class AuditStore {
    dir;
    file;
    now;
    maxRows;
    maxBytes;
    flushDelayMs;
    repoResolver;
    rows = [];
    pending = [];
    needsRewrite = false;
    flushTimer = null;
    flushing = null;
    disposed = false;
    /** 构造期降级原因（非 null 表示记录功能已关闭，其余功能照常） */
    degradedReason = null;
    constructor(options = {}) {
        this.dir = options.dir || auditDataDir();
        this.file = path.join(this.dir, 'audit.jsonl');
        this.now = options.now || Date.now;
        this.maxRows = Math.max(50, options.maxRows ?? MAX_ROWS);
        this.maxBytes = Math.max(64 * 1024, options.maxBytes ?? MAX_BYTES);
        this.flushDelayMs = Math.max(0, options.flushDelayMs ?? 200);
        this.repoResolver = options.scopeResolver;
        // 构造期绝不抛错：apply() 抛错会让整个插件 FAILED，19 个工具全丢。
        try {
            fs.mkdirSync(this.dir, { recursive: true });
            this.load();
        }
        catch (err) {
            this.degradedReason = err?.message || '审计存储不可用';
            this.rows = [];
            // eslint-disable-next-line no-console
            console.warn(`[dsh-github-flow] 操作记录已降级为只读禁用态（${this.degradedReason}）；` +
                `工具本身不受影响。目录: ${this.dir}`);
        }
    }
    /** 数据文件路径（测试与诊断用） */
    filePath() {
        return this.file;
    }
    load() {
        if (!fs.existsSync(this.file))
            return;
        const stat = fs.statSync(this.file);
        // 超限文件先截断再解析：5MB 的 JSONL 解析会占用几十 MB 堆，而用户只看得到最新部分
        if (stat.size > this.maxBytes) {
            this.needsRewrite = true;
        }
        const text = fs.readFileSync(this.file, 'utf8');
        const parsed = [];
        for (const line of text.split('\n')) {
            const t = line.trim();
            if (!t)
                continue;
            try {
                const row = JSON.parse(t);
                if (row && typeof row === 'object' && typeof row.kind === 'string')
                    parsed.push(row);
            }
            catch {
                // 断电留下半行是常态，不是异常：跳过坏行而不是整份报废
            }
        }
        this.rows = parsed.slice(-this.maxRows);
        if (parsed.length > this.maxRows)
            this.needsRewrite = true;
    }
    append(row) {
        this.rows.push(row);
        // 注意：这里**不能**在 needsRewrite 时提前 return——那会连带跳过下面的容量裁剪，
        // 结果是一旦触发过重写，rows 就会突破 maxRows 无界增长（实测 60 条上限 50 只剩 59）。
        if (!this.needsRewrite)
            this.pending.push(JSON.stringify(row));
        if (this.rows.length > this.maxRows) {
            this.rows = this.rows.slice(-this.maxRows);
            this.needsRewrite = true;
            this.pending = [];
        }
        this.scheduleFlush();
    }
    /**
     * 把墓碑真正"兑现"成删除：既有 compaction 只重写字节，但若仍把被删行写回去，
     * `needsRewrite` 就变成了自欺——用户点删除、文件里却还有那条记录。
     * 重写前必须先折叠，重写后内存 rows 也换成折叠结果（否则下一次重写会把它复活）。
     */
    compactRows() {
        const deleted = new Set();
        for (const row of this.rows) {
            if (row.kind === 'delete')
                for (const id of row.ids)
                    deleted.add(id);
        }
        if (deleted.size === 0)
            return this.rows;
        return this.rows.filter((row) => row.kind !== 'delete' && !deleted.has(row.id));
    }
    scheduleFlush() {
        if (this.disposed || this.flushTimer)
            return;
        try {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = null;
                void this.flush();
            }, this.flushDelayMs);
            // 不让待刷盘的数据阻止进程退出（插件卸载路径会显式 dispose）
            this.flushTimer?.unref?.();
        }
        catch {
            /* 定时器不可用（极端受限环境）：退化为同步写，仍不抛错 */
            void this.flush();
        }
    }
    /**
     * 刷盘：有墓碑/超限时整体重写（真删字节），否则增量追加。
     *
     * 在途时返回同一个 promise（并发调用方共用一趟）——因此**不保证**本次调用
     * 覆盖调用前刚 add 的数据。用户显式动作（删除/清空）不依赖它：那些走
     * `writeSnapshotSync()` 同步落盘；`dispose()` 会在末次刷盘后复查残余。
     */
    async flush() {
        if (this.disposed)
            return;
        if (this.flushing)
            return this.flushing;
        this.flushing = this.doFlush().finally(() => { this.flushing = null; });
        return this.flushing;
    }
    async doFlush() {
        try {
            if (this.degradedReason)
                return;
            if (this.needsRewrite) {
                this.writeSnapshotSync();
                return;
            }
            if (this.pending.length === 0)
                return;
            const body = this.pending.join('\n') + '\n';
            this.pending = [];
            fs.appendFileSync(this.file, body, 'utf8');
        }
        catch (err) {
            // 写盘失败不抛：下一次 flush 会重试（数据仍在内存 rows 里）
            // eslint-disable-next-line no-console
            console.warn(`[dsh-github-flow] 操作记录写盘失败（已忽略）: ${err?.message || err}`);
        }
    }
    /**
     * 把内存快照整体落盘（先折叠墓碑，再 tmp+rename 原子替换）。**同步**。
     *
     * 为什么用户显式动作（删除 / 清空）必须走同步写而不是"排进攒批队列"：
     * 攒批靠定时器，而删除是「我点了，它就该没了」的语义。若只把墓碑塞进队列，
     * 一旦进程在定时器触发前退出，重启后记录会**复活**——用户会认为删除是假的。
     * 这里宁可在一次点击上多花几毫秒（≤5MB 的顺序写），也不留这种不可解释的行为。
     */
    writeSnapshotSync() {
        if (this.degradedReason)
            return;
        try {
            this.rows = this.compactRows();
            const body = this.rows.map((r) => JSON.stringify(r)).join('\n');
            const tmp = this.file + '.tmp';
            fs.writeFileSync(tmp, body ? body + '\n' : '', 'utf8');
            fs.renameSync(tmp, this.file);
            this.needsRewrite = false;
            this.pending = [];
        }
        catch (err) {
            // 失败时保留墓碑 + needsRewrite，让下一次 flush 再试，绝不假装成功
            this.needsRewrite = true;
            // eslint-disable-next-line no-console
            console.warn(`[dsh-github-flow] 操作记录压实失败（已忽略，稍后重试）: ${err?.message || err}`);
        }
    }
    /**
     * 等当前在途刷盘收尾。
     *
     * 为什么必须先等：在途的 append 用的是它自己算好的字符串，若我们的
     * tmp+rename 抢在它前面落盘，随后那次 append 会把刚删掉的行**追加回来**。
     * 顺序错了就复活数据，这种事只在空闲/繁忙切换的瞬间发生，最难复现。
     */
    async quiesce() {
        if (this.flushing) {
            try {
                await this.flushing;
            }
            catch { /* 在途失败由它自己告警 */ }
        }
    }
    /**
     * 记录一次工具调用。**永不抛错**。
     *
     * @param tool   工具名（`github_pr`）
     * @param args   工具原始参数
     * @param result `tools/result` 的第二参（归一化或原始载荷，两种都认）
     * @param exec   `tools/result` 的第一参（冻结快照，含 agent / callId）
     */
    recordCall(tool, args, result, exec) {
        try {
            if (this.degradedReason || this.disposed)
                return;
            if (typeof tool !== 'string' || !tool.startsWith('github_'))
                return;
            const action = typeof args?.action === 'string' ? args.action : '';
            // id 复用宿主的 callId：同一次调用的 intent / result / decision 才能折成一条。
            // 若宿主对重试复用同一个 callId，两次尝试会并成一条（后写的 result 覆盖先写的）——
            // 那正是"同一次操作只该有一条记录"的语义，不是 bug。
            const callId = s(exec?.callId) || randomUUID();
            const at = this.now();
            const outcome = extractOutcome(result);
            const scope = this.repoResolver ? this.repoResolver(exec, args) : resolveScopeFromExec(undefined, exec, args);
            const meta = {
                tool,
                action,
                write: classifyWrite(tool, action),
                risk: classifyRisk(tool, action),
                summary: summarizeOperation(tool, action, args),
            };
            if (scope.repo)
                meta.repo = scope.repo;
            if (scope.cwd)
                meta.cwd = scope.cwd;
            const target = pickTarget(args);
            if (target)
                meta.target = target;
            const sessionId = s(exec?.agent?.id) || s(exec?.sessionId);
            if (sessionId)
                meta.sessionId = sessionId;
            meta.callId = callId;
            // 写操作：intent（发起了什么）+ result（实际结果）两行，崩溃时 intent 仍在；
            // 读操作：一行 result 自带身份（没有"发起但没结果"的语义价值，省一半行数）。
            const resultRow = {
                v: 1,
                kind: 'result',
                id: callId,
                at: meta.write ? at + 1 : at,
                ok: outcome.ok,
                ...(outcome.errorType ? { errorType: outcome.errorType } : {}),
                ...(outcome.degraded ? { degraded: true } : {}),
                ...(meta.write ? {} : meta),
            };
            if (meta.write)
                this.append({ v: 1, kind: 'intent', id: callId, at, ...meta });
            this.append(resultRow);
        }
        catch {
            /* Fail-Open：记录失败绝不影响工具结果 */
        }
    }
    /** s2 用：写入人工决策（s1 不调用，但存储形态先留好，避免 s2 改数据模型） */
    recordDecision(id, decision, feedback) {
        try {
            if (this.degradedReason || this.disposed)
                return;
            const fb = s(feedback).slice(0, 2000);
            this.append({ v: 1, kind: 'decision', id, at: this.now(), decision, ...(fb ? { feedback: fb } : {}) });
        }
        catch {
            /* Fail-Open */
        }
    }
    /**
     * 折叠成记录列表（按时间倒序）。
     *
     * 两遍扫：先收集墓碑集合，再折叠。一遍扫会漏掉「墓碑写在 intent 之前」的极端顺序，
     * 而那种顺序在压实失败重放时是可能出现的。
     */
    list(filter = {}) {
        const deleted = new Set();
        for (const row of this.rows) {
            if (row.kind === 'delete')
                for (const id of row.ids)
                    deleted.add(id);
        }
        const byId = new Map();
        for (const row of this.rows) {
            if (row.kind === 'delete')
                continue;
            if (deleted.has(row.id))
                continue;
            if (row.kind === 'intent') {
                byId.set(row.id, {
                    id: row.id,
                    at: row.at,
                    tool: row.tool,
                    action: row.action,
                    write: row.write,
                    risk: row.risk,
                    summary: row.summary,
                    repo: row.repo,
                    cwd: row.cwd,
                    target: row.target,
                    sessionId: row.sessionId,
                    callId: row.callId,
                    decision: 'auto',
                    result: 'unknown',
                });
                continue;
            }
            if (row.kind === 'decision') {
                const hit = byId.get(row.id);
                if (hit) {
                    hit.decision = row.decision;
                    if (row.feedback)
                        hit.feedback = row.feedback;
                }
                continue;
            }
            // result 行：可能自带身份（读操作）也可能只是结果（写操作）
            const hit = byId.get(row.id);
            const r = row;
            if (hit) {
                hit.result = row.ok ? 'ok' : 'fail';
                if (row.errorType)
                    hit.errorType = row.errorType;
                if (row.degraded)
                    hit.degraded = true;
                continue;
            }
            if (typeof r.tool === 'string') {
                byId.set(row.id, {
                    id: row.id,
                    at: row.at,
                    tool: r.tool,
                    action: r.action || '',
                    write: r.write === true,
                    risk: r.risk || 'read',
                    summary: r.summary || `${r.tool}.${r.action || ''}`,
                    repo: r.repo,
                    cwd: r.cwd,
                    target: r.target,
                    sessionId: r.sessionId,
                    callId: r.callId,
                    decision: 'auto',
                    result: row.ok ? 'ok' : 'fail',
                    errorType: row.errorType,
                    degraded: row.degraded,
                });
            }
        }
        let items = [...byId.values()];
        if (filter.tool)
            items = items.filter((e) => e.tool === filter.tool);
        if (filter.write !== undefined)
            items = items.filter((e) => e.write === filter.write);
        if (filter.risk)
            items = items.filter((e) => e.risk === filter.risk);
        if (filter.cwd) {
            const want = normalizeCwd(filter.cwd);
            items = items.filter((e) => normalizeCwd(e.cwd) === want);
        }
        if (typeof filter.since === 'number' && Number.isFinite(filter.since)) {
            items = items.filter((e) => e.at >= filter.since);
        }
        items.sort((a, b) => b.at - a.at);
        const total = items.length;
        const offset = Math.max(0, filter.offset ?? 0);
        const limit = Math.max(1, filter.limit ?? 50);
        return { items: items.slice(offset, offset + limit), total };
    }
    /**
     * 删除指定记录：先追加墓碑（崩溃也能读回"已删除"），**然后同步压实**。
     *
     * 压实后文件里不再有这些 id 的字节——用户点删除要的就是真删除。
     * 返回真实删除的条数（不存在的 id 不计）。
     */
    async delete(ids) {
        try {
            if (this.degradedReason || this.disposed)
                return 0;
            const wanted = new Set((Array.isArray(ids) ? ids : []).map((v) => s(v)).filter(Boolean));
            if (wanted.size === 0)
                return 0;
            const existing = new Set();
            for (const row of this.rows) {
                if (row.kind !== 'delete' && wanted.has(row.id))
                    existing.add(row.id);
            }
            if (existing.size === 0)
                return 0;
            // 顺序不能反：先等在途 append 收尾，再一次性写快照（否则它会把删掉的行追回来）
            await this.quiesce();
            this.rows.push({ v: 1, kind: 'delete', at: this.now(), ids: [...existing] });
            this.writeSnapshotSync();
            return existing.size;
        }
        catch {
            return 0;
        }
    }
    /** 清空全部记录（同步压实为空文件） */
    async clear() {
        try {
            if (this.disposed)
                return;
            await this.quiesce();
            this.rows = [];
            this.pending = [];
            this.needsRewrite = true;
            this.writeSnapshotSync();
        }
        catch {
            /* Fail-Open */
        }
    }
    /** 当前内存行数（诊断用） */
    rowCount() {
        return this.rows.length;
    }
    /** 卸载：清定时器 + 末次刷盘。幂等。 */
    async dispose() {
        if (this.disposed)
            return;
        if (this.flushTimer) {
            try {
                clearTimeout(this.flushTimer);
            }
            catch { /* 忽略 */ }
            this.flushTimer = null;
        }
        try {
            // 复查残余：若末次 flush 恰好与在途那趟共用（返回值不代表本次已落盘），
            // 再补刷一次，避免卸载时丢掉最后几条记录。
            for (let i = 0; i < 3; i++) {
                await this.flush();
                if (!this.needsRewrite && this.pending.length === 0)
                    break;
            }
        }
        catch {
            /* 卸载期失败不再重试 */
        }
        this.disposed = true;
    }
}
