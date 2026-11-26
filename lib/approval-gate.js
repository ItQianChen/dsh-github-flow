/**
 * 执行前人工审核闸门（s2）：**判定**放在 `tools/pre-execute`，**问答**交给 DSH 官方
 * `ctx.approval`（`@deepseek-ai/dsh-user-approval` + `dsh-client-ui-approval`）。
 *
 * 为什么不再自建弹窗与审批队列：s2 的 v1 把官方接缝与官方 UI 各重写了一遍（约 1,100 行），
 * 结果更弱、且引入一次客户端白屏。官方弹窗是**接管输入区**的 composer takeover，
 * 由宿主负责展示、超时、取消与"asked/decided"审计对；插件只该回答一个问题：
 * **这一次调用要不要问人。**
 *
 * 三条硬约束（每条都有对应断言，见 `test/phase53-approval.test.mjs`）：
 *
 * 1. **`policy === 'never'` 必须短路。** 宿主在派发前就把 ask 判成 `rejected`
 *    （`dsh-user-approval/src/index.ts:301` 的 `decide()`），不短路的话，`danger-full-access`
 *    预设（该预设把 approval 固定写成 `never`，见 `dsh-permission-presets/src/index.ts:182-191`）
 *    下**每一次**合并都会被确定性拒绝，插件从"多一次确认"变成"完全不能用"。
 * 2. **`unavailable` 与 `rejected` 不是一件事。** 前者是"根本没有 answerer"（headless、
 *    未装审核 UI），必须退回工具体既有的 `confirm` 闸门；后者才是"用户说不"。
 *    混为一谈会让无审核能力的部署把全部写操作判死。
 * 3. **不表态时必须调 `next()`。** `tools/pre-execute` 是 waterfall（`events.ts:18`），
 *    返回 `{kind:'allow'}` 会把排在后面的监听器（沙箱、计划模式等）的拒绝权一起吞掉——
 *    那是权限提权，不是"我没意见"。
 *
 * 还有一条与 v1 不同的取舍：**审核不再依附操作记录**。宿主自带 `approval/asked` +
 * `approval/decided` 的 durable 审计对，所以"记录关着就停用审核"这条旧约束作废；
 * 关掉记录只意味着这一次决策不进本插件的 JSONL（`recordDecision` 自带关闭判定）。
 */
import { classifyWrite, isAuditedTool, summarizeOperation } from './audit.js';
import { isDestructiveCall, markApproved } from './destructive.js';
const str = (v) => (typeof v === 'string' ? v : '');
/** 动作名。缺省空串——`github_pr` 之类没有 action 维度的调用自然落到"非写/非高危" */
function actionOf(exec) {
    const action = exec?.arguments?.action;
    return typeof action === 'string' ? action : '';
}
/**
 * 该不该问人（纯函数，离线可测）。
 *
 * 作用域与记录同源：只有 `AUDITED_TOOLS`（PR / Issue）。这条白名单本身就是"只碰
 * `github_*`"的保证——它只含本插件的工具名；其余 17 个工具各有自己的 `confirm` 闸门，
 * 这里再拦一次只会让一次操作问两遍。
 *
 * 档位口径：
 * - `destructive`：用 `isDestructiveCall`（闸门表 + `when` 条件），不是 `classifyRisk`。
 *   差别在 `github_pr checkout`——不带 `force` 时 `classifyRisk` 仍算 destructive
 *   （它只看键存在），而闸门表里 `when` 明确要求 `force === true`。审核要贴合"真的危险"，
 *   否则每次检出 PR 都要弹一次窗。
 * - `all-writes`：用 `classifyWrite`，与只读档位/记录同一个真源（`WRITE_ACTIONS`）。
 *   注意 `confirm: true` **不豁免**审核：否则模型只要每次都带上 `confirm` 就能绕过弹窗。
 */
export function shouldAsk(exec, mode) {
    const name = str(exec?.name);
    if (!isAuditedTool(name))
        return false;
    if (mode === 'off')
        return false;
    const action = actionOf(exec);
    if (mode === 'all-writes')
        return classifyWrite(name, action);
    return isDestructiveCall(name, exec?.arguments);
}
/**
 * 读会话的**有效**审批策略。
 *
 * 宿主没暴露 `effectivePolicy()`（它是 private），但两个公开口子够用：
 * `overrideOf(session)`（会话内是否切过，公开方法）→ `config.policy`（public 构造参数）。
 * 与宿主自己的 `derive()`（`dsh-permission-presets/src/index.ts:350`）同序，避免
 * "设置页显示一个档、实际按另一个档执行"。
 *
 * ⚠️ 两处**故意**与宿主不同：
 * 1. 宿主在两处都读不到时用 `'ask'` 兜底，这里返回 `undefined`（"读不出来"）——
 *    因为 `'ask'` 会让 `danger-full-access` 预设下每次合并都被确定性拒绝、且毫无痕迹。
 * 2. **读不到会话覆盖时不许退化成 `config.policy`**：`danger-full-access` 是把 `never`
 *    写成**会话覆盖**（`setApprovalPolicy` → `approval/policy`），而 `config.policy`
 *    恒为部署默认 `'ask'`。一旦 `agent.session` / `overrideOf` 在后续宿主版本变样，
 *    退化就会漏掉那个 `never`，正是本文件头约束 1 要防的死法。
 *
 * @returns `undefined` = 读不出来。调用方应**不判**、直接问，并留一条 warn。
 */
export function resolveEffectivePolicy(approval, agent) {
    try {
        const session = agent?.session;
        if (!session || typeof approval?.overrideOf !== 'function')
            return undefined;
        const override = approval.overrideOf(session);
        if (override === 'ask' || override === 'never')
            return override;
        const configured = approval?.config?.policy;
        return configured === 'ask' || configured === 'never' ? configured : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * 弹窗文案的硬上限（用户定：最高 1000 字）。
 *
 * 依据（2026-11-26 读官方 `dsh-client-ui-approval` 产物）：`reason` 被当作卡片标题渲染，
 * 卡片正文区自带 `max-height` + `overflow-y:auto`，按钮在滚动区**之外** —— 所以再长也
 * 顶不出去，只会在卡片内滚动。1000 字 ≈ 16 行，是"够判断"与"不用翻很久"的折中。
 * 超出就截掉尾部并加省略符，且**总长（含省略符）不超过这个数**。
 */
export const MAX_REASON_CHARS = 1000;
/** 截断标记。用中文省略号而不是单字符 `…`：在 15px 正文里更醒目，一眼看出"后面还有" */
const ELLIPSIS = '……';
/** 截到 `max` 字以内；超限时结尾补省略符，且省略符本身也计入上限 */
function clipWithEllipsis(text, max) {
    if (max <= 0)
        return '';
    if (text.length <= max)
        return text;
    if (max <= ELLIPSIS.length)
        return ELLIPSIS.slice(0, max);
    return text.slice(0, max - ELLIPSIS.length) + ELLIPSIS;
}
const clip = (v, max) => {
    const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
    return t.length > max ? t.slice(0, max) + '…' : t;
};
/** 状态的人话。Issue 的"已关闭"必须带上关闭原因：completed 与 not planned 是相反的语义 */
function stateText(target) {
    if (target.state === 'OPEN')
        return target.isDraft ? '草稿' : '开放';
    if (target.state === 'MERGED')
        return '已合并';
    if (target.state === 'CLOSED') {
        if (target.stateReason === 'COMPLETED')
            return '已关闭（已完成）';
        if (target.stateReason === 'NOT_PLANNED')
            return '已关闭（未计划）';
        if (target.stateReason === 'REOPENED')
            return '已关闭（曾被重开）';
        return '已关闭';
    }
    return target.state ? String(target.state) : '';
}
/** CI 汇总的人话。null/缺失 = 这个提交没有配置检查，要说成"无检查"而不是"通过" */
function checkText(state) {
    if (state === undefined)
        return '';
    if (state === null)
        return '无 CI 检查';
    switch (state) {
        case 'SUCCESS': return 'CI 通过';
        case 'FAILURE': return 'CI 失败';
        case 'PENDING': return 'CI 进行中';
        case 'ERROR': return 'CI 出错';
        case 'EXPECTED': return 'CI 等待中';
        default: return 'CI ' + state;
    }
}
function reviewText(decision) {
    switch (decision) {
        case 'APPROVED': return '已批准';
        case 'CHANGES_REQUESTED': return '被要求修改';
        case 'REVIEW_REQUIRED': return '待评审';
        default: return '';
    }
}
/**
 * 元信息行。为什么它比正文首段更值钱：看一眼「CI 失败 · 改动 38 个文件 · 被要求修改」
 * 就知道不该合，不必读正文。全部按"有才显示"拼，缺任何一项都不留空位。
 */
function metaLine(target, kind) {
    const parts = [];
    const st = stateText(target);
    if (st)
        parts.push('状态：' + st);
    if (target.author)
        parts.push('作者：@' + target.author);
    if (kind === 'pr') {
        if (typeof target.additions === 'number' || typeof target.deletions === 'number') {
            parts.push(`+${target.additions ?? 0} −${target.deletions ?? 0}`);
        }
        if (typeof target.changedFiles === 'number')
            parts.push(`改动 ${target.changedFiles} 个文件`);
        const ci = checkText(target.checkState);
        if (ci)
            parts.push(ci);
        const rv = reviewText(target.reviewDecision);
        if (rv)
            parts.push(rv);
    }
    if (typeof target.commentsCount === 'number')
        parts.push(`${target.commentsCount} 条评论`);
    return parts.join(' · ');
}
/**
 * 把 Markdown 正文压成适合纯文本卡片的形态。
 *
 * 为什么必须压：卡片标题是纯文本节点，不渲染 Markdown —— `## 标题`、`**加粗**`、
 * `![图](url)` 原样露出来就是一堆符号噪音。只做"去掉标记、保留文字"的无损压缩：
 * 代码围栏 / HTML 注释整行丢弃，链接留文字，图片换成［图］。
 *
 * 换行策略（卡片已能保留换行，见 styles.ts 的 white-space 规则）：
 * **列表项各自独占一行**，其余段落用空格衔接。真机截图实证：4 个列表项挤在一行里
 * （"· 自动获取… · 支持查看… · 支持在…"）读起来像流水账，拆开后一眼能扫完要点。
 * 只拆列表项、不拆普通段落，是为了不让卡片被大量短行撑得太高。
 */
export function flattenBody(raw) {
    if (typeof raw !== 'string')
        return '';
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let inFence = false;
    for (let line of lines) {
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) {
            out.push(line.trim());
            continue;
        }
        line = line.replace(/<!--[\s\S]*?-->/g, ' ');
        line = line.replace(/!\[([^\]]*)\]\([^)]*\)/g, '［图］');
        line = line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
        line = line.replace(/(\*\*|__|~~|`+)/g, '');
        line = line.replace(/^\s*#{1,6}\s+/, '');
        line = line.replace(/^\s*>\s?/, '');
        line = line.replace(/^\s*[-*+]\s+/, '· ');
        line = line.replace(/^\s*\d+\.\s+/, '· ');
        // 任务列表：- [ ] / - [x] → 复选框符号（方括号在纯文本里是噪音）
        line = line.replace(/^· \[ \]\s*/, '· ☐ ').replace(/^· \[[xX]\]\s*/, '· ☑ ');
        line = line.replace(/\s+/g, ' ').trim();
        if (line)
            out.push(line);
    }
    let text = '';
    let prevWasItem = false;
    for (const item of out) {
        const isItem = item.startsWith('· ');
        // 列表项独占一行；列表**之后**的第一段普通文字也另起一行（否则会接在最后一个列表项尾巴上）
        const sep = text === '' ? '' : (isItem || prevWasItem) ? '\n' : ' ';
        text += sep + item;
        prevWasItem = isItem;
    }
    return text.trim();
}
/** 本次调用**要提交**的内容（来自参数，不是远端）。按展示顺序返回若干 [标签, 正文] */
function submittedContent(action, args) {
    const body = typeof args?.body === 'string' ? args.body : '';
    // body_file 是"正文来自本地文件"的通道：审核阶段不读文件（门禁里做 IO 是新的失败面），
    // 如实告诉他正文从哪来，比假装"无正文"有用。
    const bodyFile = typeof args?.body_file === 'string' ? args.body_file.trim() : '';
    const bodyEntry = (emptyLabel) => {
        if (bodyFile)
            return { label: '正文', text: `来自本地文件 ${clip(bodyFile, 80)}（审核时不读取文件内容）` };
        const flat = flattenBody(body);
        return { label: '正文', text: flat || emptyLabel };
    };
    if (action === 'comment')
        return [{ label: '将发表的评论', text: bodyEntry('（空评论）').text }];
    if (action === 'create')
        return [{ label: '将提交的正文', text: bodyEntry('（无）').text }];
    if (action === 'edit') {
        const out = [];
        const title = typeof args?.title === 'string' ? args.title.trim() : '';
        if (title)
            out.push({ label: '新标题', text: clip(title, 200) });
        out.push({ label: '将提交的正文', text: bodyEntry(title ? '（不改正文）' : '（无改动）').text });
        return out;
    }
    return [];
}
/**
 * 拼出弹窗文案（可多行）：
 *
 *   即将执行：合并 PR #19（squash）｜「feat(proxy): 支持自动跟随系统代理」
 *   状态：已合并 · 作者：@mrgeda · +2255 −293 · 改动 20 个文件 · 无 CI 检查 · 3 条评论
 *   正文：> 本 PR 是 #19 的修订版……
 *
 * 排列顺序就是"拍板时先看什么"：做什么 → 它是什么状态 → 它说了什么。
 *
 * `create` 不查远端（实体还不存在，参数里自带的标题摘要里已有），只展示**将要提交**的内容；
 * `comment` 先展示将要发表的评论，再有余量才带目标的正文；`edit` 同时给出新标题与新正文。
 *
 * 第二个参数兼容只给标题的字符串（旧调用方 / 测试），等价于只有 `title` 的 `TargetInfo`。
 * 取不到任何远端信息时安静退回纯摘要，绝不拖慢或阻断审核。
 */
export function askReason(exec, target) {
    const name = str(exec?.name);
    const action = actionOf(exec);
    const summary = summarizeOperation(name, action, exec?.arguments);
    const args = exec?.arguments;
    const info = typeof target === 'string' ? { title: target.trim() } : target;
    const kind = name === 'github_pr' ? 'pr' : name === 'github_issue' ? 'issue' : null;
    // 第 1 行：动作 + 对象**当前**标题（edit 也保留：拍板要知道"改的是哪一条"）
    let head = `即将执行：${summary}`;
    const title = (info?.title ?? '').trim();
    if (title && action !== 'create')
        head += `｜「${clip(title, 120)}」`;
    // 第 2 行：对象现状（只有按编号操作既有实体时才有）
    const lines = [head];
    if (info && kind && action !== 'create') {
        const meta = metaLine(info, kind);
        if (meta)
            lines.push(meta);
    }
    /*
     * 正文段：先放"这次要提交的"，再放"对象现在的"。
     * 预算是减去已有行与标签、以及省略符之后剩下的字数 —— 保证总长不超过上限。
     */
    const budgetFor = (label) => {
        const used = lines.join('\n').length + 1 + label.length;
        return MAX_REASON_CHARS - used;
    };
    const pushBody = (label, text) => {
        const flat = text.trim();
        if (!flat)
            return;
        const room = budgetFor(label);
        if (room <= ELLIPSIS.length + 8)
            return; // 连一句话都放不下就不占位
        lines.push(label + clipWithEllipsis(flat, room));
    };
    const isNew = action === 'create' || action === 'edit' || action === 'comment';
    if (isNew) {
        for (const part of submittedContent(action, args))
            pushBody(part.label + '：', part.text);
    }
    if (info && kind && action !== 'create') {
        // comment / edit 已用额度给"要提交的内容"；对象正文排在后面，有余量才显示
        const label = isNew ? `${kind === 'pr' ? '该 PR' : '该 Issue'} 当前正文：` : '正文：';
        pushBody(label, flattenBody(info.body));
    }
    // 兜底：理论上到不了这里（每段都按预算裁），但"总长不超上限"必须是硬保证
    return clipWithEllipsis(lines.join('\n'), MAX_REASON_CHARS);
}
/**
 * 拒绝后回给模型的话。
 *
 * 为什么不是 JSON 载荷：`pre-execute` 的 `deny` 只能给一段 `reason` 文本 + 结构化
 * `info`（`contracts.ts:377`），工具结果的 `content` 由宿主拼装，插件无法塞自定义 JSON。
 * 于是把 v1 里 `requiredAction` 想说的事直接写成句子——模型读的是这段话，不是字段。
 */
export function rejectionMessage(exec) {
    const name = str(exec?.name);
    const summary = summarizeOperation(name, actionOf(exec), exec?.arguments);
    return `用户拒绝了「${summary}」。不要重试同一动作：先向用户确认意图；若只是想核对现状，改用只读接口（view / list / diff）。`;
}
/**
 * 造一个 `tools/pre-execute` 监听器。
 *
 * 返回值语义（对照 `PreToolDecision`）：
 * - 不需要问 / 没有审核能力 / 策略为 `never` → `next()`（交回后续监听器与工具体）
 * - 批准 → `markApproved(callId)` 后 `next()`（旁路工具体的 `confirm`，见 `destructive.ts`）
 * - 拒绝 → `{kind:'deny'}`，带 `ApprovalError`/`APPROVAL_REJECTED` 身份
 * - 取消 → `{kind:'cancel'}`（宿主给出规范的 `ABORTED_BEFORE_DISPATCH`）
 * - `unavailable` → `next()`（见文件头约束 2）
 */
export function createApprovalGate(deps) {
    return async function approvalGate(exec, next) {
        /*
         * forwarded 标记：cordis 的 waterfall 把 `next` 实现成 `(cbs.shift() ?? inner)(...)`，
         * 其中 `cbs` 是**整条链共享的队列**（cordis lib/index.js:317-325）。于是"下游监听器抛错"
         * 会让我们 `await next()` 变成 rejection；此时若无脑再调一次 `next()`，它就从队列里取
         * **下一个**监听器继续，一路落到宿主内置的 `{kind:'allow'}`——把别人的 fail-closed
         * 拒绝降级成放行。这是权限提权，不是"我没意见"。
         *
         * 因此：**已经转发过就必须把错误原样抛回去**（宿主 `pipeline.ts:231-233` 的 try/catch
         * 会把它变成 `toolErrorResult`，即工具不执行，与没有本监听器时一致）；
         * 只有"从未转发"（异常发生在我们自己的判定里）才可以兜底放行。
         */
        let forwarded = false;
        const forward = () => {
            forwarded = true;
            return next();
        };
        try {
            if (!shouldAsk(exec, deps.getMode()))
                return forward();
            const approval = deps.getApproval();
            // 没有 approval 服务（纯 CLI / TUI profile）：让工具体的 confirm 闸门接管
            if (!approval || typeof approval.request !== 'function')
                return forward();
            const policy = resolveEffectivePolicy(approval, exec?.agent);
            if (policy === 'never')
                return forward();
            if (policy === undefined) {
                // 读不出有效策略时的降级：不判、照常问（绝不把"读不到"当 never，见 resolveEffectivePolicy）
                deps.warn('读不出 approval 策略（会话覆盖与 config.policy 都不可用），本次直接发起审核请求');
            }
            const callId = str(exec?.callId);
            /*
             * 目标现状：只在"确定要弹窗"之后才查（上面每条提前返回都不会白打一次 gh），
             * 且整体 try/catch 包住 —— 它只是锦上添花，失败绝不能让审核失败。
             * 查到的标题同时 stash 给记录侧（`tools/result` 是同步切面，只能从暂存表里取）。
             */
            let target;
            if (deps.resolveTarget) {
                try {
                    target = await deps.resolveTarget(exec);
                }
                catch {
                    target = undefined;
                }
                if (target?.title && callId && deps.stashTitle)
                    deps.stashTitle(callId, target.title);
            }
            let outcome;
            try {
                outcome = await approval.request({
                    agent: exec?.agent,
                    toolName: str(exec?.name),
                    ...(callId ? { callId } : {}),
                    reason: askReason(exec, target),
                    // 必须透传：用户按停止 / 宿主中止轮次时，官方接缝自己结算成 cancelled，
                    // 插件不必再写任何定时器（v1 的 180s 超时与 onDisabled 结算全部消失）
                    signal: exec?.signal,
                });
            }
            catch (error) {
                // 典型原因：`request()` 要求轮次开启（`dsh-user-approval/src/index.ts:244`）。
                // 问不出去不等于用户拒绝——绝不因为审核不可用把工具判死。
                deps.warn(`审核请求失败，本次跳过审核：${error instanceof Error ? error.message : String(error)}`);
                return forward();
            }
            switch (outcome) {
                case 'allowed-once':
                    // 批准事实必须传给工具体：否则它自己的 confirm 闸门会再问一遍（一次操作问两遍）
                    markApproved(callId);
                    if (callId)
                        deps.recordDecision(callId, 'approved');
                    return forward();
                case 'rejected':
                    if (callId)
                        deps.recordDecision(callId, 'rejected');
                    return {
                        kind: 'deny',
                        reason: rejectionMessage(exec),
                        info: { name: 'ApprovalError', code: 'APPROVAL_REJECTED' },
                    };
                case 'cancelled':
                    if (callId)
                        deps.recordDecision(callId, 'cancelled');
                    return { kind: 'cancel' };
                case 'unavailable':
                default:
                    // 无 answerer：记一条 no-client（词汇与宿主 Outcomes 一一对应），然后交回工具体
                    if (callId)
                        deps.recordDecision(callId, 'no-client');
                    return forward();
            }
        }
        catch (error) {
            // 已经转发出去了：错误来自下游监听器，原样上抛（fail-closed，见上面的长注释）
            if (forwarded)
                throw error;
            // 从未转发：异常来自本闸门自己的判定。让工具照常跑，总比"审核模块有 bug 就所有写操作不可用"好
            deps.warn(`审核闸门异常，本次跳过审核：${error instanceof Error ? error.message : String(error)}`);
            return next();
        }
    };
}
