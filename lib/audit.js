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
/**
 * 保留预算：**字节为主闸门、行数作派生上限**，两者先到者触发淘汰（都是丢最早的）。
 *
 * 为什么以字节为主：装载与内存都随**字节**线性（实测 `apply()` 内装载 ≈ 4 ms/MB、
 * 常驻 heap ≈ 1.2 × 字节），行数只影响 `list()` 折叠（≈ 0.3 µs/行，2 万行 <5 ms）。
 * 于是字节既是用户能理解的单位（"给它 8 MB"），也恰好是真实成本单位。
 *
 * 为什么行数不能省：字节管得住磁盘，管不住"全是极短行"的病态（读记录 ≈150 B，
 * 64 MB 预算能攒到 45 万行 → 折叠退化到 130 ms）。因此按预算派生一个上限：
 * `clamp(预算/120B, 1 000, 200 000)`，8 MB 下算出 7 万行，而 8 MB 实际只装得下
 * 3.2 万行 —— 正常永不触发，它只是安全网。
 */
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
/** 极短行的下界（读操作一行 ≈150 B，取更保守的 120 B 作分母） */
const MIN_ROW_BYTES_ESTIMATE = 120;
const MIN_MAX_BYTES = 256 * 1024;
const MAX_MAX_BYTES = 64 * 1024 * 1024;
const MIN_MAX_ROWS = 1_000;
const MAX_MAX_ROWS = 200_000;
/** 由字节预算派生行数上限：只兜"极短行"病态，正常永不触发 */
export function deriveMaxRows(maxBytes) {
    const raw = Math.floor(maxBytes / MIN_ROW_BYTES_ESTIMATE);
    return Math.min(MAX_MAX_ROWS, Math.max(MIN_MAX_ROWS, raw));
}
/** 预算 clamp：下限 256 KB、上限 64 MB。越界钳住而不是报错——配置值不值得让功能失效。 */
export function clampBudget(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return DEFAULT_MAX_BYTES;
    return Math.min(MAX_MAX_BYTES, Math.max(MIN_MAX_BYTES, Math.floor(bytes)));
}
/**
 * 记录与审核的**作用域**：只有 PR 与 Issue。
 *
 * 这是本功能的产品定义（总纲 §一：「Agent 每次写 PR / Issue，本地留一条」），
 * 不是实现取舍——`github_release delete`、`github_secret delete` 之类**不进操作记录、
 * 也不进审核弹窗**，它们本来就有自己的 `confirm: true` 闸门。
 *
 * 为什么用白名单常量而不是"排除法"：新增工具时默认**不进**记录，而不是默认进。
 * 记录面变宽是很容易无声发生的，而它一旦变宽，用户的"操作记录"里就会混进
 * 一堆他没预期的条目。
 */
export const AUDITED_TOOLS = ['github_pr', 'github_issue'];
/** 该工具是否在记录/审核作用域内 */
export function isAuditedTool(tool) {
    return typeof tool === 'string' && AUDITED_TOOLS.includes(tool);
}
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
/** 审核档位合法值（存档前校验；非法值一律回落默认） */
export const APPROVAL_MODES = ['off', 'destructive', 'all-writes'];
function normalizeApprovalMode(v) {
    return v === 'off' || v === 'destructive' || v === 'all-writes' ? v : 'destructive';
}
export function auditSettingsPath(dir = auditDataDir()) {
    return path.join(dir, 'audit-settings.json');
}
/**
 * 读设置。任何异常都回落到默认值——设置文件坏掉不该让记录功能消失，更不该让 `apply()` 抛错。
 * `enabled` 缺省 true（产品口径：默认全开）。
 */
export function loadAuditSettings(dir = auditDataDir()) {
    const fallback = { enabled: true, budgetBytes: DEFAULT_MAX_BYTES, approvalMode: 'destructive', source: 'default' };
    try {
        const file = auditSettingsPath(dir);
        if (!fs.existsSync(file))
            return fallback;
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const enabled = typeof raw?.enabled === 'boolean' ? raw.enabled : true;
        return {
            enabled,
            budgetBytes: clampBudget(Number(raw?.budgetBytes) || DEFAULT_MAX_BYTES),
            approvalMode: normalizeApprovalMode(raw?.approvalMode),
            source: 'file',
        };
    }
    catch {
        return fallback;
    }
}
/** 写设置。返回是否成功（调用方据此决定要不要在 UI 上报错，但不抛）。 */
export function saveAuditSettings(dir, settings) {
    try {
        fs.mkdirSync(dir, { recursive: true });
        const body = JSON.stringify({
            enabled: settings.enabled === true,
            budgetBytes: clampBudget(settings.budgetBytes),
            approvalMode: normalizeApprovalMode(settings.approvalMode),
        }, null, 2);
        fs.writeFileSync(auditSettingsPath(dir), body + '\n', 'utf8');
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 事件流存储。
 *
 * 写入路径：`recordCall()` → 内存（查询立即可见）→ 攒批 → 200ms 后一次刷盘。
 * 读路径：`list()` 全量折叠（预算内最多几万行，折叠是 O(n) 的内存操作，不值得做增量索引）。
 *
 * 保留策略：**字节预算为主闸门、行数为其派生上限**（见文件头常量注释）。
 */
export class AuditStore {
    dir;
    file;
    now;
    settingsDir;
    /** 随 `setBudget()` 变化，故非 readonly */
    maxRows;
    maxBytes;
    enabled;
    /** 审核档位：与开关/预算同文件，设置页同屏；`main.ts` 的闸门每次调用现读 */
    mode;
    flushDelayMs;
    repoResolver;
    onEnabledChange;
    rows = [];
    /** 与 `rows` 等长的字节数（含行尾换行）——淘汰时从头部整批减，避免 O(n²) 重算 */
    rowBytes = [];
    totalBytes = 0;
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
        this.settingsDir = options.settingsDir || this.dir;
        this.now = options.now || Date.now;
        this.flushDelayMs = Math.max(0, options.flushDelayMs ?? 200);
        this.repoResolver = options.scopeResolver;
        this.onEnabledChange = options.onEnabledChange;
        // 优先级：设置文件（UI 改的） > 构造参数（cordis 静态配置） > 默认值。
        // 只有文件确实存在（source === 'file'）时它才压过静态配置——文件不存在时
        // 静态配置才是用户的表达，不能反被"默认值"盖掉。
        const settings = loadAuditSettings(this.settingsDir);
        const fromFile = settings.source === 'file';
        this.enabled = fromFile
            ? settings.enabled
            : (options.enabled === undefined ? settings.enabled : options.enabled === true);
        this.maxBytes = clampBudget(fromFile ? settings.budgetBytes : (options.maxBytes ?? settings.budgetBytes));
        this.mode = fromFile
            ? settings.approvalMode
            : normalizeApprovalMode(options.approvalMode ?? settings.approvalMode);
        this.maxRows = options.maxRows !== undefined
            ? Math.min(MAX_MAX_ROWS, Math.max(MIN_MAX_ROWS, options.maxRows))
            : deriveMaxRows(this.maxBytes);
        // 构造期绝不抛错：apply() 抛错会让整个插件 FAILED，19 个工具全丢。
        try {
            fs.mkdirSync(this.dir, { recursive: true });
            // 关闭态不加载：零内存、零启动成本。历史文件仍在，可 clear() 删除。
            if (this.enabled)
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
        const text = fs.readFileSync(this.file, 'utf8');
        const rows = [];
        const bytes = [];
        for (const line of text.split('\n')) {
            const t = line.trim();
            if (!t)
                continue;
            try {
                const row = JSON.parse(t);
                if (row && typeof row === 'object' && typeof row.kind === 'string') {
                    rows.push(row);
                    // 记账用**文件真实字节**（UTF-8），不是字符数：中文 3 字节/字，
                    // 用 String.length 会把 8 MB 当成 2.7 MB，虚拟预算比没有预算更糟。
                    bytes.push(Buffer.byteLength(t, 'utf8') + 1); // +1 = 行尾换行
                }
            }
            catch {
                // 断电留下半行是常态，不是异常：跳过坏行而不是整份报废
            }
        }
        this.rows = rows;
        this.rowBytes = bytes;
        this.totalBytes = bytes.reduce((a, b) => a + b, 0);
        // 装载期就要按预算淘汰：否则文件里堆着几万行、内存里却只剩一部分，两边记账必然错位
        if (this.evict())
            this.needsRewrite = true;
    }
    /**
     * 按预算淘汰最早的若干行（字节与行数先到者生效）。
     *
     * **至少保留最新一行**（`drop < n - 1`）：单行就超过预算的极端情况（比如预算调到
     * 下限而一条记录带了长留言）下，若把刚写的那行也淘汰掉，"刚发生的事"会立刻查不到——
     * 超出预算一行是可以接受的诚实，丢掉正在记录的操作不是。
     *
     * @returns 是否发生了淘汰（调用方据此决定要不要压实文件）
     */
    evict() {
        let drop = 0;
        let bytes = this.totalBytes;
        const n = this.rows.length;
        while (drop < n - 1 && (n - drop > this.maxRows || bytes > this.maxBytes)) {
            bytes -= this.rowBytes[drop];
            drop++;
        }
        if (drop === 0)
            return false;
        // 一次 slice 而不是反复 shift：逐条 shift 是 O(n²)，几万行时肉眼可见
        this.rows = this.rows.slice(drop);
        this.rowBytes = this.rowBytes.slice(drop);
        this.totalBytes = bytes;
        return true;
    }
    append(row) {
        const json = JSON.stringify(row);
        const size = Buffer.byteLength(json, 'utf8') + 1;
        this.rows.push(row);
        this.rowBytes.push(size);
        this.totalBytes += size;
        // 注意：这里**不能**在 needsRewrite 时提前 return——那会连带跳过下面的淘汰，
        // 结果是一旦触发过重写，rows 就会突破上限无界增长（实测 60 条上限 50 只剩 59）。
        if (!this.needsRewrite)
            this.pending.push(json);
        if (this.evict()) {
            this.needsRewrite = true;
            this.pending = [];
        }
        this.scheduleFlush();
    }
    /**
     * 把墓碑真正"兑现"成删除，并同步重算字节记账。
     *
     * 剔除行时必须同时重建 `rowBytes`：只删 `rows` 会让记账与行错位，
     * 之后的淘汰会**删掉不该删的行**——这类错位不会报错，只会让记录莫名消失。
     */
    compactRows() {
        const deleted = new Set();
        for (const row of this.rows) {
            if (row.kind === 'delete')
                for (const id of row.ids)
                    deleted.add(id);
        }
        if (deleted.size === 0)
            return;
        const keepRows = [];
        const keepBytes = [];
        let total = 0;
        for (let i = 0; i < this.rows.length; i++) {
            const row = this.rows[i];
            if (row.kind === 'delete' || deleted.has(row.id))
                continue;
            keepRows.push(row);
            keepBytes.push(this.rowBytes[i]);
            total += this.rowBytes[i];
        }
        this.rows = keepRows;
        this.rowBytes = keepBytes;
        this.totalBytes = total;
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
            this.compactRows(); // 兑现墓碑，同时重算字节记账
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
            if (this.degradedReason || this.disposed || !this.enabled)
                return;
            // 作用域：**只有 PR / Issue**（总纲 §一：每次写 PR / Issue 留一条）。
            // 其它 17 个工具不进记录——它们的审计由各自的 confirm 闸门与遥测负责。
            if (!isAuditedTool(tool))
                return;
            const action = typeof args?.action === 'string' ? args.action : '';
            // 只记写操作：读（list / view / diff / checks）会把列表淹成噪音，
            // 而"Agent 改了什么"才是要追查的事。
            if (!classifyWrite(tool, action))
                return;
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
            // 作用域内只剩写操作，因此固定是 intent（发起了什么）+ result（实际结果）两行。
            // 为什么不留"读操作只落一行"的分支：作用域已经排除了读，留着就是死代码，
            // 而死代码的分支条件一旦被后人误读成"这里也支持读"，就会把作用域重新放宽。
            this.append({ v: 1, kind: 'intent', id: callId, at, ...meta });
            this.append({
                v: 1,
                kind: 'result',
                id: callId,
                at: at + 1,
                ok: outcome.ok,
                ...(outcome.errorType ? { errorType: outcome.errorType } : {}),
                ...(outcome.degraded ? { degraded: true } : {}),
            });
        }
        catch {
            /* Fail-Open：记录失败绝不影响工具结果 */
        }
    }
    /** s2 用：写入人工决策（s1 不调用，但存储形态先留好，避免 s2 改数据模型） */
    recordDecision(id, decision, feedback) {
        try {
            // 与 recordCall 同一条前置：记录关闭时决策也不该落盘。
            // 少了这一条，s2 的 onDisabled() 结算 pending 时会往已关闭的库里写 decision 行。
            if (this.degradedReason || this.disposed || !this.enabled)
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
    /** 清空全部记录（同步压实为空文件）。**关闭态也可用**：直接写空，不需要加载。 */
    async clear() {
        try {
            if (this.disposed)
                return;
            await this.quiesce();
            this.rows = [];
            this.rowBytes = [];
            this.totalBytes = 0;
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
    /**
     * 存储用量与当前口径。UI 与路由的唯一真相。
     *
     * 三个字段必须分开，别再合并：
     * - `enabled`：**用户的意图**（开关位置）。UI 的复选框读它。
     * - `degraded`：存储坏了的原因（目录不可写等）。
     * - `active`：**实际是否在工作** = `enabled && !degraded`。消费方（s2 的审核前置、
     *   弹窗的关闭态）只能读这个。
     *
     * 为什么不能把 `enabled` 直接算成"且未降级"（第一版就是这么写的）：磁盘坏掉时
     * 复选框会显示成"未勾选"，用户以为自己关过；他再点一下"开启"，`enabled` 已经
     * 是 true → `setEnabled` 判定无变化直接返回，界面纹丝不动。**一个怎么点都不动的开关，
     * 比明确的错误提示更糟。**
     */
    usage() {
        return {
            enabled: this.enabled,
            active: this.enabled && !this.degradedReason,
            rows: this.rows.length,
            bytes: this.totalBytes,
            maxRows: this.maxRows,
            maxBytes: this.maxBytes,
            degraded: this.degradedReason,
        };
    }
    /**
     * 当前审核档位。`main.ts` 的闸门**每次调用现读**，因此设置页改完立刻生效（无需重启）。
     */
    approvalMode() {
        return this.mode;
    }
    /** 改审核档位并落盘。运行期立即生效。 */
    setApprovalMode(mode) {
        if (this.disposed)
            return this.usage();
        this.mode = normalizeApprovalMode(mode);
        this.saveSettings();
        return this.usage();
    }
    /** 三个设置项共用一次落盘（失败只 warn：设置写不进去不该让功能失效） */
    saveSettings() {
        saveAuditSettings(this.settingsDir, { enabled: this.enabled, budgetBytes: this.maxBytes, approvalMode: this.mode });
    }
    /**
     * 改预算并**立刻生效**（无需重启）。异步：必须先等在途刷盘收尾再压实。
     *
     * 改小必须当场淘汰 + 同步压实：用户把 8 MB 降到 1 MB 时，"下次写入才缩"等于没缩，
     * 而这一步的代价只是一次顺序写，与 `delete()` 同一条路径。
     */
    async setBudget(bytes) {
        if (this.disposed)
            return this.usage();
        this.maxBytes = clampBudget(bytes);
        this.maxRows = deriveMaxRows(this.maxBytes);
        if (this.enabled && !this.degradedReason) {
            if (this.evict()) {
                // 顺序不能反：在途 append 用的是它自己算好的字符串，抢在它前面落盘的话，
                // 那次 append 会把刚淘汰的行追加回来（与 delete() 同一条竞态）。
                await this.quiesce();
                this.pending = [];
                this.needsRewrite = true;
                this.writeSnapshotSync();
            }
        }
        // 持久化交给 store 自己做：路由只调一个方法，避免"改了运行时忘了写文件"
        this.saveSettings();
        return this.usage();
    }
    /**
     * 开/关记录，运行时生效。
     *
     * 关闭时：先等在途刷盘收尾（否则它会再写一批），再清攒批队列、丢弃已加载的行
     * （释放内存）。历史文件**不删**——那是用户的文件，要删走 `clear()`。
     * 打开时：重新 `load()` 并按当前预算淘汰，随后照常记录。
     */
    async setEnabled(flag) {
        if (this.disposed)
            return this.usage();
        const next = flag === true;
        if (next === this.enabled)
            return this.usage();
        await this.quiesce();
        this.enabled = next;
        if (!next) {
            if (this.flushTimer) {
                try {
                    clearTimeout(this.flushTimer);
                }
                catch { /* 忽略 */ }
                this.flushTimer = null;
            }
            this.pending = [];
            this.rows = [];
            this.rowBytes = [];
            this.totalBytes = 0;
        }
        else {
            try {
                this.load();
            }
            catch {
                /* 加载失败按空库继续：不因为读不出历史就不记录 */
            }
        }
        // 状态应用完再落盘：写文件失败时内存状态仍是对的，反之会留下"文件说开着、实际关着"
        this.saveSettings();
        const after = this.usage();
        try {
            this.onEnabledChange?.(after);
        }
        catch { /* 通知失败不影响开关本身 */ }
        return after;
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
