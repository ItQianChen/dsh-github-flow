/**
 * 面板公共工具函数（纯函数，可被单元测试直接覆盖）
 */
export function formatRelativeTime(iso) {
    if (!iso || typeof iso !== "string")
        return "";
    var t = Date.parse(iso);
    if (isNaN(t))
        return "";
    var diff = Date.now() - t;
    if (diff < 0)
        return "刚刚";
    var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
    if (diff < MIN)
        return "刚刚";
    if (diff < HOUR)
        return Math.floor(diff / MIN) + "分钟前";
    if (diff < DAY)
        return Math.floor(diff / HOUR) + "小时前";
    if (diff < 7 * DAY)
        return Math.floor(diff / DAY) + "天前";
    var d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function rollupCiStatus(checks) {
    if (!Array.isArray(checks) || checks.length === 0)
        return null;
    var hasFail = false, hasPending = false;
    for (var i = 0; i < checks.length; i++) {
        var c = checks[i] || {};
        var status = String(c.status || "").toLowerCase();
        var conclusion = String(c.conclusion || "").toLowerCase();
        if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "cancelled")
            hasFail = true;
        else if (conclusion === "success" || conclusion === "skipped" || conclusion === "neutral") { }
        else if (status === "in_progress" || status === "queued" || conclusion === "pending" || (!conclusion && status))
            hasPending = true;
    }
    if (hasFail)
        return "fail";
    if (hasPending)
        return "pending";
    return "pass";
}
export function reviewDecisionBadge(decision) {
    var d = String(decision || "").toUpperCase();
    if (d === "APPROVED")
        return { text: "✔ 已批准", kind: "green" };
    if (d === "CHANGES_REQUESTED")
        return { text: "✋ 需修改", kind: "red" };
    if (d === "REVIEW_REQUIRED")
        return { text: "👀 待审查", kind: "yellow" };
    return null;
}
export function eventLabel(event) {
    var e = String(event || "");
    if (e === "push")
        return "⇡ push";
    if (e === "schedule")
        return "⏰ 定时";
    if (e === "workflow_dispatch")
        return "▶ 手动";
    if (e === "pull_request")
        return "🔀 PR";
    return e || "";
}
/**
 * 带有阶梯退避重试（Backoff Retry）的通用异步拉取函数
 *
 * 核心设计理由与约束：
 * 1. 应对代理节点不稳定、TLS 握手卡顿、短时网络抖动（半秒至两秒微断流）；
 * 2. 阶梯退避时序：第 1 次失败等 1s (1000ms)，第 2 次等 2s (2000ms)，第 3 次等 4s (4000ms)，附加 0~200ms Jitter；
 * 3. 智能区分软硬错误：401/403/404/400 确定性错误坚决不重试，仅在网络超时、不可达、或带有 networkError 时重试；
 * 4. 严格响应外部 AbortSignal，组件卸载或用户手动打断时立即退出等待，绝无内存泄漏。
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
    var maxRetries = config.maxRetries !== undefined ? config.maxRetries : 3;
    var baseDelayMs = config.baseDelayMs !== undefined ? config.baseDelayMs : 1000;
    var signal = config.signal || options.signal;
    var attempt = 0;
    while (true) {
        attempt++;
        var currentRes = null;
        var currentJson = null;
        var failureReason = "";
        var shouldRetry = false;
        try {
            if (signal && signal.aborted) {
                throw new Error("Aborted");
            }
            currentRes = await fetch(url, { ...options, signal });
            // 硬错误守卫：客户端确定性错误（如未授权、权限拒绝、不存在、参数错误）坚决不重试
            if (currentRes.status === 401 || currentRes.status === 403 || currentRes.status === 404 || currentRes.status === 400) {
                currentJson = await currentRes.json().catch(() => ({}));
                return { res: currentRes, json: currentJson };
            }
            if (!currentRes.ok) {
                failureReason = "HTTP " + currentRes.status + " " + currentRes.statusText;
                shouldRetry = true;
            }
            else {
                currentJson = await currentRes.json().catch(() => null);
                // 业务层软错误检测（后端返回了 200，但标记了 networkError 或 partialFailure）
                var isNetworkError = Boolean(currentJson && (currentJson.partialFailure ||
                    currentJson.data?.partialFailure ||
                    currentJson.data?.networkError ||
                    currentJson.data?.auth?.networkError));
                if (isNetworkError) {
                    failureReason = currentJson.error || currentJson.data?.networkErrorReason || "云端接口网络抖动";
                    shouldRetry = true;
                }
                else {
                    // 成功获取完整且无网络错误的数据
                    return { res: currentRes, json: currentJson };
                }
            }
        }
        catch (err) {
            if ((signal && signal.aborted) || err.name === "AbortError") {
                throw err;
            }
            failureReason = err.message || "网络连接中断或超时";
            shouldRetry = true;
        }
        // 判断是否已耗尽重试次数
        if (!shouldRetry || attempt > maxRetries) {
            if (currentRes) {
                return { res: currentRes, json: currentJson || {} };
            }
            throw new Error(failureReason || "网络请求失败");
        }
        // 计算阶梯退避等待时间：baseDelayMs * 2^(attempt - 1) + Jitter 自适应微扰
        var exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
        var maxJitter = Math.min(200, Math.floor(exponentialDelay * 0.2));
        var jitter = Math.floor(Math.random() * (maxJitter + 1));
        var totalDelay = exponentialDelay + jitter;
        if (config.onRetry) {
            config.onRetry(attempt, totalDelay, failureReason);
        }
        // 可中断的睡眠等待
        await new Promise((resolve, reject) => {
            var timer = setTimeout(resolve, totalDelay);
            if (signal) {
                signal.addEventListener("abort", () => {
                    clearTimeout(timer);
                    reject(new Error("Aborted"));
                }, { once: true });
            }
        });
    }
}
export function parseGitStatText(statText) {
    if (!statText || typeof statText !== "string")
        return null;
    var lines = statText.split("\n");
    var files = [];
    var summary = null;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line)
            continue;
        var summaryMatch = line.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/i);
        if (summaryMatch) {
            summary = {
                filesChanged: parseInt(summaryMatch[1], 10),
                insertions: parseInt(summaryMatch[2] || "0", 10),
                deletions: parseInt(summaryMatch[3] || "0", 10),
            };
            continue;
        }
        var pipeIdx = line.indexOf("|");
        if (pipeIdx > 0) {
            var left = line.slice(0, pipeIdx).trim();
            var right = line.slice(pipeIdx + 1).trim();
            if (left.startsWith('"') && left.endsWith('"') && left.length >= 2) {
                left = left.slice(1, -1);
            }
            if (/^Bin\b/i.test(right)) {
                files.push({ path: left, total: 0, additions: 0, deletions: 0, isBinary: true, rawRight: right });
            }
            else {
                var numMatch = right.match(/^(\d+)(.*)$/);
                if (numMatch) {
                    var total = parseInt(numMatch[1], 10);
                    var graph = numMatch[2].trim();
                    var plusCount = 0;
                    var minusCount = 0;
                    for (var j = 0; j < graph.length; j++) {
                        if (graph[j] === "+")
                            plusCount++;
                        else if (graph[j] === "-")
                            minusCount++;
                    }
                    var additions = 0;
                    var deletions = 0;
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
                            var addExact = Math.round((total * plusCount) / (plusCount + minusCount));
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
