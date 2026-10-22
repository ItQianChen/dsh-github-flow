/**
 * 失败日志的两个共用件：错误语义映射 + 纯文本锚点摘要。
 *
 * 为什么单独成模块而不是各写一遍：
 * 同一份 `gh run view --log-failed` 输出有两个消费方——Agent 工具（`github_run`
 * 的 `log_failed`，渲染成 Markdown 进模型上下文）与人在面板里看的 Run 详情弹窗
 * （渲染成 `<pre>` 纯文本）。两者的**排版**不同，但「什么算失败、哪条是环境故障
 * 不是构建故障、被截断了必须说明」这三条语义必须一致；各写一份的下场是
 * Agent 说「没有失败步骤」而弹窗说「拉取失败」。
 *
 * 约束：本模块只做纯文本变换，零 I/O、零子进程。真正的 gh 调用留在调用方，
 * 方便两边各自决定超时与输出预算。
 */
import { extractFailureAnchors, tailLines } from './failure-anchors.js';
/**
 * 把 gh 的非零退出翻译成给人看的结论；返回 `null` 表示「这是真错误，原样上抛」。
 *
 * 两类必须吸收的错误（实测）：
 * 1. `no failed jobs` —— 工作流本身成功或没有失败步骤，这是确定性答案而非故障；
 * 2. `Access is denied` —— gh 往本机缓存目录写日志 zip 被系统拒绝，属宿主环境
 *    问题。原样透传会让调用方（尤其是模型）误判成构建故障，给出自查路径更可行动。
 *
 * runId 参与文案：同一个弹窗里可能并排看几个 run，不带编号的报错无法定位。
 */
export function interpretRunLogError(error, runId) {
    const err = String(error || '');
    if (err.includes('no failed jobs') || err.includes('not failed')) {
        return `工作流 Run #${runId} 中未检测到任何失败的任务步骤 (状态正常)。`;
    }
    if (err.includes('Access is denied') || err.includes('拒绝访问')) {
        return `无法提取 Run #${runId} 的失败日志：gh CLI 向本机缓存目录写入日志压缩包时被系统拒绝 (${err.trim().slice(0, 200)})。建议检查 gh 缓存目录（如 %LocalAppData%\\GitHub CLI）的写权限后重试，或改用 github_api 拉取日志端点。`;
    }
    return null;
}
/**
 * 把整段日志压成纯文本失败摘要。
 *
 * 为什么要有独立的纯文本渲染：弹窗里用 `<pre>` 显示，Markdown 的代码围栏与
 * 引用块会被当成字面量原样打出来（` ``` ` 出现在日志正文里时更乱）。Markdown 版
 * 留给 Agent 工具，两者共用同一套锚点萃取与尾部回退，只是排版不同。
 *
 * 预算裁剪是**第二道**：gh 侧已按 2MB 截过一次，这里再按 `budget` 裁一次的目的
 * 是别把几万字塞进 DOM（浏览器渲染与滚动都会明显变卡）。两道截断都必须写进
 * 返回文本——「没找到更多失败块」与「更多失败块被裁掉了」是相反结论。
 */
export function buildPlainFailureExcerpt(rawLog, opts = {}) {
    const budget = Number.isFinite(opts.budget) && opts.budget > 0 ? Math.floor(opts.budget) : 120_000;
    const src = typeof rawLog === 'string' ? rawLog : '';
    if (!src.trim()) {
        return { text: '', mode: 'empty', blockCount: 0, droppedBlocks: 0, truncated: Boolean(opts.truncated) };
    }
    const anchored = extractFailureAnchors(src);
    const mode = anchored.blocks.length > 0 ? 'anchors' : 'tail';
    const parts = [];
    if (opts.truncated) {
        parts.push('⚠️ 原始日志体量超出单次读取上限，以下仅基于已获取的部分。');
    }
    if (mode === 'anchors') {
        parts.push(`共命中 ${anchored.totalBlocks} 个失败块，以下为前 ${anchored.blocks.length} 个：`);
        anchored.blocks.forEach((b, i) => {
            parts.push(`\n===== 失败块 ${i + 1}（日志第 ${b.startLine} 行起）=====\n${b.text}`);
        });
        if (anchored.droppedBlocks > 0) {
            parts.push(`\n⚠️ 另有 ${anchored.droppedBlocks} 个失败块未展示（共 ${anchored.totalBlocks} 个），完整日志请在 GitHub 打开。`);
        }
    }
    else {
        parts.push('未匹配到已知框架的失败锚点，以下为日志尾部 200 行：\n');
        parts.push(tailLines(src, 200));
    }
    let text = parts.join('\n');
    let truncated = Boolean(opts.truncated);
    if (text.length > budget) {
        text = `${text.slice(0, budget)}\n\n⚠️ 摘要已按 ${budget} 字符上限截断，上述失败块可能不完整。`;
        truncated = true;
    }
    return { text, mode, blockCount: anchored.totalBlocks, droppedBlocks: anchored.droppedBlocks, truncated };
}
