import { ciBadge } from "../shared/state-badges.js";
import type { RunLogExcerptData, RunJobItem } from "../types.js";
declare const React: any;
declare function formatRelativeTime(iso: any): string;
declare function eventLabel(event: any): string;

/**
 * 日志请求的客户端超时。
 *
 * 服务端总预算 90s，这里放 100s：让服务端的「超预算」显式错误先到；
 * 而连接卡在代理/DNS 层永远不返回时，客户端的 AbortController 是最后一道闸——
 * 否则按钮会永远停在「正在下载日志…」，用户只能刷新页面。
 */
var LOG_FETCH_TIMEOUT_MS = 100_000;

/**
 * 结论 → 中文文案。
 *
 * ciBadge 只统一了 tone 与英文 label（服务端 Markdown 与右侧栏共用同一份映射），
 * 中文必须在本组件单独补一层；改 ciBadge 会连带改掉 CLI 与服务端输出。
 */
var RUN_CONCLUSION_LABEL: Record<string, string> = {
  success: "成功",
  failure: "失败",
  cancelled: "已取消",
  skipped: "已跳过",
};

/**
 * 未命中中文表时保留 GitHub 原始英文（running / queued / timed_out 等）：
 * 这些取值没有稳定的中文对应，硬翻反而让用户对不上 GitHub 页面。
 */
function zhConclusion(conclusion: any, fallback: string): string {
  var zh = RUN_CONCLUSION_LABEL[String(conclusion || "").toLowerCase()];
  return zh || fallback;
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/**
 * Actions run / job / step 的耗时格式化（导出以便单测直接覆盖）。
 *
 * 为什么不用 formatRelativeTime：那个函数答的是「发生在多久前」，这里是「跑了多久」；
 * 而且 run → job → step 三层共用同一套精度规则（<60s → `12s`、<60m → `3m20s`、
 * 其余 `1h05m`），分钟/秒补零才能让三层的列宽稳定对齐。
 * 任一端缺失或不可解析一律返回空串：排队中/已跳过的 job 没有 startedAt/completedAt，
 * 硬算只会渲染出「0s」这种假精确值，比不显示更误导。
 */
export function formatRunDuration(startISO?: string, endISO?: string): string {
  var startT = typeof startISO === "string" ? Date.parse(startISO) : NaN;
  var endT = typeof endISO === "string" ? Date.parse(endISO) : NaN;
  // endT < startT 视为非法区间（时钟漂移 / 字段错配），同样不显示
  if (isNaN(startT) || isNaN(endT) || endT < startT) return "";
  var totalSec = Math.round((endT - startT) / 1000);
  if (totalSec < 60) return totalSec + "s";
  var totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return totalMin + "m" + pad2(totalSec % 60) + "s";
  return Math.floor(totalMin / 60) + "h" + pad2(totalMin % 60) + "m";
}

/**
 * 初始展开哪一个 job：优先第一个失败的（排障入口就在那里），全绿时展开第一个。
 * 必须在 setData 之后用真实数据计算——写死 {} 会让「默认展开」永远不生效。
 */
function computeInitialExpanded(d: any): Record<number, boolean> {
  var init: Record<number, boolean> = {};
  var jobs: any[] = d && Array.isArray(d.jobs) ? d.jobs : [];
  if (jobs.length === 0) return init;
  var target: any = jobs[0];
  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    if (String(job && job.conclusion ? job.conclusion : "").toLowerCase() === "failure") {
      target = job;
      break;
    }
  }
  if (target && target.databaseId !== undefined && target.databaseId !== null) {
    init[target.databaseId] = true;
  }
  return init;
}

export interface RunDetailModalProps {
  runId: number;
  repoNameWithOwner?: string;
  cwd?: string | null;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

/**
 * 慢链路日志请求的状态机。
 * 只由用户点按钮驱动、只有用户点「重试」才会再次发起：这条链路实测 4~40 秒后可能
 * 被重置，自动重试会把等待时间叠加成几十秒，还会把一次点击放大成多次 GitHub 调用。
 */
interface RunLogState {
  status: "idle" | "loading" | "ok" | "error";
  data?: RunLogExcerptData;
  error?: string;
}

/**
 * Actions Run 详情弹窗（只读：run 元信息 + job/step 树 + 失败日志片段）。
 *
 * 单列纵向：run 的信息天然是「job 列表 + 一条日志流」的阅读顺序，没有需要并排
 * 对照的第二个信息源（PR 才有 diff 双栏）。
 * 日志刻意渲染成 <pre> 原文而不是 markdown-lite：原始日志里的 `#`、`|`、`---`
 * 是 shell 注释、表格与 diff 分隔符，交给 Markdown 解析会把堆栈与 diff 撕碎。
 */
export function RunDetailModal(props: RunDetailModalProps) {
  var runId = props.runId;
  var repoNameWithOwner = props.repoNameWithOwner || "";
  var cwd = props.cwd;
  var onClose = props.onClose;
  var showToast = props.showToast || (function () {});

  // Hooks 必须先于任何 early return 无条件执行（见 issue-modal 的同类注释）：
  // runId 由空变有值时两次渲染的 Hook 数量必须一致，否则 React 直接抛错。
  // 因此 useState 与两个 useEffect 全部集中在这里，`if (!runId) return null`
  // 只能出现在它们之后。
  var [data, setData] = React.useState(null as any);
  var [loading, setLoading] = React.useState(true);
  var [error, setError] = React.useState(null as string | null);
  var [expanded, setExpanded] = React.useState({} as Record<number, boolean>);
  var [logState, setLogState] = React.useState({ status: "idle" } as RunLogState);

  React.useEffect(function () {
    var onKeyDown = function (e: any) {
      if (e.key === "Escape" || e.keyCode === 27) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    // 必须成对移除：弹窗在面板里会被反复开关，漏掉会累积监听器（Esc 一次关多个）
    return function () { window.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  React.useEffect(function () {
    if (!runId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // 换了 run 就是全新上下文：展开态与日志结果都不能沿用上一个 run 的
    setExpanded({});
    setLogState({ status: "idle" });
    var url =
      "/api/github/run-detail?run_id=" +
      encodeURIComponent(String(runId)) +
      (repoNameWithOwner ? "&repo=" + encodeURIComponent(repoNameWithOwner) : "") +
      (cwd ? "&cwd=" + encodeURIComponent(cwd) : "");

    fetch(url)
      .then(async function (res) {
        if (!res.ok) {
          // 非 2xx 时 body 里可能带一段很长的 gh 原始报错，优先原样透出给用户
          var errText = await res.text().catch(function () { return ""; });
          var j: any = null;
          try { j = JSON.parse(errText); } catch (e) {}
          throw new Error((j && j.error) || errText || ("服务响应异常 (" + res.status + ")"));
        }
        return res.json();
      })
      .then(function (json) {
        setLoading(false);
        if (json && json.ok && json.data) {
          setData(json.data);
          // 默认展开必须基于刚拿到的数据算，不能预设 {}
          setExpanded(computeInitialExpanded(json.data));
        } else {
          setError((json && json.error) || "获取 Actions Run 详情失败");
        }
      })
      .catch(function (err) {
        setLoading(false);
        setError((err && err.message) || "网络请求异常");
      });
  }, [runId, repoNameWithOwner, cwd]);

  if (!runId) return null;

  var h = React.createElement;

  var toggleJob = function (jobId: any) {
    setExpanded(function (prev: any) {
      // 必须新建对象：原地改 prev 引用不变，React 判定状态未变，不会重渲染
      var next: any = {};
      for (var k in prev) {
        if (Object.prototype.hasOwnProperty.call(prev, k)) next[k] = prev[k];
      }
      next[jobId] = !next[jobId];
      return next;
    });
  };

  /** 结论徽章：tone 来自 shared/state-badges，文案走中文表 */
  var badgeEl = function (conclusion: any, status: any) {
    var b = ciBadge(status, conclusion);
    if (!b) return null;
    return h(
      "span",
      {
        className: "dsh-github-badge dsh-badge-" + b.tone,
        style: { fontSize: "10px", padding: "1px 6px", flexShrink: 0 },
      },
      zhConclusion(conclusion, b.label)
    );
  };

  var renderMeta = function (d: any) {
    var parts: any[] = [];
    var ev = eventLabel(d.event);
    if (ev) parts.push(h("span", { key: "ev" }, ev));
    if (d.headBranch) {
      parts.push(h("span", { key: "br", className: "dsh-github-run-mono", title: "分支 " + d.headBranch }, d.headBranch));
    }
    if (d.headSha) {
      // 短 SHA 只留 7 位（GitHub 约定长度），完整值放 title，方便核对而不是复制错
      parts.push(h("span", { key: "sha", className: "dsh-github-run-mono", title: "完整 SHA: " + d.headSha }, String(d.headSha).slice(0, 7)));
    }
    if (d.createdAt) parts.push(h("span", { key: "created" }, formatRelativeTime(d.createdAt)));
    // run 没有 completedAt 字段，用 updatedAt 作终点：运行结束后它就是完成时间
    var dur = formatRunDuration(d.startedAt, d.updatedAt);
    if (dur) parts.push(h("span", { key: "dur" }, "耗时 " + dur));
    if (d.fieldsDegraded) {
      parts.push(
        h("span", { key: "degraded", className: "dsh-github-run-degraded", title: "部分字段未取到（job 列表或结论缺失），服务端已降级返回" }, "⚠️ 部分字段降级")
      );
    }
    if (parts.length === 0) return null;
    return h("div", { className: "dsh-github-run-meta" }, ...parts);
  };

  var renderSteps = function (job: any) {
    var steps: any[] = job && Array.isArray(job.steps) ? job.steps : [];
    if (steps.length === 0) {
      return h("div", { className: "dsh-github-run-steps" },
        h("div", { className: "dsh-github-run-empty" }, "该 job 没有可读步骤（可能仍在排队）"));
    }
    return h(
      "div",
      { className: "dsh-github-run-steps" },
      steps.map(function (s: any, i: number) {
        var failed = String((s && s.conclusion) || "").toLowerCase() === "failure";
        return h(
          "div",
          {
            key: "step-" + (s && s.number !== undefined ? s.number : i),
            className: "dsh-github-run-step" + (failed ? " dsh-github-run-step-failed" : ""),
          },
          h("span", null, String(s && s.number !== undefined ? s.number : i + 1)),
          h("span", { title: (s && s.name) || "" }, (s && s.name) || "未命名步骤"),
          // 徽章外层固定包一个 span：徽章为空时若不占位，grid 第 3 列消失，
          // 后面的耗时列会左移到徽章列，四列对不齐
          h("span", null, badgeEl(s && s.conclusion, s && s.status)),
          h("span", { className: "dsh-github-run-duration" }, formatRunDuration(s && s.startedAt, s && s.completedAt))
        );
      })
    );
  };

  var renderJob = function (job: any, idx: number) {
    var steps: any[] = job && Array.isArray(job.steps) ? job.steps : [];
    var failedSteps = 0;
    steps.forEach(function (s: any) {
      if (String((s && s.conclusion) || "").toLowerCase() === "failure") failedSteps++;
    });
    var jobId = job && job.databaseId;
    var isOpen = Boolean(expanded[jobId]);
    var jobDur = formatRunDuration(job && job.startedAt, job && job.completedAt);

    return h(
      "div",
      { key: "job-" + (jobId !== undefined && jobId !== null ? jobId : idx), className: "dsh-github-run-job" },
      h(
        "button",
        {
          type: "button",
          className: "dsh-github-run-job-header",
          "aria-expanded": isOpen ? "true" : "false",
          onClick: function () { toggleJob(jobId); },
          title: isOpen ? "收起该 job 的步骤" : "展开该 job 的步骤",
        },
        h("span", { className: "dsh-github-run-caret", "aria-hidden": "true" }, isOpen ? "▾" : "▸"),
        h("span", { className: "dsh-github-run-job-name", title: (job && job.name) || "" }, (job && job.name) || "未命名 job"),
        badgeEl(job && job.conclusion, job && job.status),
        jobDur ? h("span", { className: "dsh-github-run-duration" }, jobDur) : null,
        steps.length > 0
          ? h(
              "span",
              { className: "dsh-github-run-failed-count" + (failedSteps > 0 ? " is-hit" : "") },
              failedSteps + "/" + steps.length + " 步失败"
            )
          : null
      ),
      isOpen ? renderSteps(job) : null
    );
  };

  /**
   * 选出该拉日志的 job。
   *
   * 为什么不能只看 `job.conclusion === 'failure'`：按钮的出现条件是「有失败 step
   * 或失败 job」，而 `timed_out` / `cancelled` 的 job 完全可能带着失败 step
   * （`gh run view --help` 对 `--log-failed` 的定义是 "any failed steps"）。
   * 两处口径不一致，用户就会看到「按钮在、点下去说没有失败的 job」。
   */
  var pickLogJobIds = function (jobs: RunJobItem[]) {
    var ids: number[] = [];
    for (var i = 0; i < jobs.length; i++) {
      var job = jobs[i];
      var jobId = job && job.databaseId;
      // databaseId 缺失或为 0 的 job 无法定向拉取（服务端 requirement 是正整数）
      if (typeof jobId !== "number" || jobId <= 0) continue;
      var jobFailed = String((job && job.conclusion) || "").toLowerCase() === "failure";
      var stepFailed =
        Array.isArray(job && job.steps) &&
        job.steps.some(function (s: any) {
          return String((s && s.conclusion) || "").toLowerCase() === "failure";
        });
      if (jobFailed || stepFailed) ids.push(jobId);
    }
    return ids;
  };

  var loadLogs = function () {
    if (!data || logState.status === "loading") return;
    var jobs: any[] = Array.isArray(data.jobs) ? data.jobs : [];
    var allIds = pickLogJobIds(jobs);
    if (allIds.length === 0) {
      showToast("⚠️ 没有失败的 job 可提取日志");
      return;
    }
    // 服务端上限 3 个（超标直接 400）。这里先按上限请求，并在界面上明示「只取了前 3 个」，
    // 不让人以为这次把全部失败 job 都拉完了。
    var jobIds = allIds.slice(0, 3);
    setLogState({ status: "loading" });
    showToast("⏳ 正在下载失败日志（最长 90 秒）");
    var url =
      "/api/github/run-logs?run_id=" +
      encodeURIComponent(String(runId)) +
      // job_id 是逗号分隔的数字列表：数字与逗号都是 URL 安全字符，不再编码，
      // 免得某些服务端实现按未解码的原始串切分
      "&job_id=" + jobIds.join(",") +
      (repoNameWithOwner ? "&repo=" + encodeURIComponent(repoNameWithOwner) : "") +
      (cwd ? "&cwd=" + encodeURIComponent(cwd) : "");

    /*
     * 客户端超时不是可选项：服务端总预算 90s，但连接可能停在 DNS/代理层永远不返回。
     * 不设闸门的话按钮会永远停在「正在下载日志…」，用户只能刷新页面。
     * 100s 比服务端预算略长，让服务端的显式错误优先到达。
     */
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    // 闭包里不能再依赖可空收窄（TS 对捕获变量不做 narrow），在 if 内绑一个非空引用
    var timer: any = null;
    if (controller) {
      var ctrl = controller;
      timer = setTimeout(function () { ctrl.abort(); }, LOG_FETCH_TIMEOUT_MS);
    }
    var clearTimer = function () {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    fetch(url, controller ? { signal: controller.signal } : undefined)
      .then(async function (res) {
        if (!res.ok) {
          var errText = await res.text().catch(function () { return ""; });
          var j: any = null;
          try { j = JSON.parse(errText); } catch (e) {}
          throw new Error((j && j.error) || errText || ("日志接口响应异常 (" + res.status + ")"));
        }
        return res.json();
      })
      .then(function (json) {
        clearTimer();
        if (json && json.ok && json.data) {
          setLogState({ status: "ok", data: json.data });
        } else {
          setLogState({ status: "error", error: (json && json.error) || "获取运行日志失败" });
        }
      })
      .catch(function (err) {
        clearTimer();
        var aborted = err && (err.name === "AbortError" || err.code === 20);
        setLogState({
          status: "error",
          error: aborted
            ? "日志拉取超时（100 秒）已中止。GitHub 日志接口在代理下常常长时间无响应，请稍后重试或直接点右上角「GitHub ↗」查看。"
            : (err && err.message) || "网络请求异常（日志链路较慢，可直接重试）",
        });
      });
  };

  var renderLogSection = function () {
    if (!data) return null;
    // failedSteps 只覆盖「step 级失败」；job 级失败但零失败 step 是真实形态
    // （setup 阶段失败、被 cancellation 打断），此时日志按钮同样必须出现。
    var hasFailed = Number(data.failedSteps) > 0 || Number(data.failedJobs) > 0;
    if (!hasFailed && logState.status === "idle") return null;

    var loadingLog = logState.status === "loading";
    var children: any[] = [];

    if (hasFailed) {
      children.push(
        h(
          "button",
          {
            key: "log-btn",
            type: "button",
            className: "dsh-github-run-log-btn",
            onClick: loadLogs,
            disabled: loadingLog,
            title: "从 GitHub 拉取失败 job 的原始日志片段（较慢，最长 90 秒）",
          },
          loadingLog ? "正在下载日志…" : logState.status === "ok" ? "📄 重新提取失败日志" : "📄 提取失败日志"
        )
      );
      // 服务端一次最多 3 个 job：超出的必须说出来，否则用户以为全拉完了
      var failedJobTotal = pickLogJobIds(Array.isArray(data.jobs) ? data.jobs : []).length;
      if (failedJobTotal > 3) {
        children.push(
          h(
            "div",
            { key: "log-cap", className: "dsh-github-run-log-hint" },
            "本次仅提取前 3 个失败 job 的日志（共 " + failedJobTotal + " 个），其余请到 GitHub 查看。"
          )
        );
      }
    }

    if (loadingLog) {
      children.push(
        h(
          "div",
          { key: "log-hint", className: "dsh-github-run-log-hint" },
          "⏳ 正在拉取失败日志——GitHub 日志接口较慢（最长 90 秒），请不要关闭弹窗。"
        )
      );
    }

    if (logState.status === "error") {
      children.push(
        h(
          "div",
          { key: "log-error", className: "dsh-github-run-error" },
          h("div", { className: "dsh-github-run-error-title" }, "⚠️ 提取失败日志失败"),
          h("div", { className: "dsh-github-run-error-text" }, logState.error || "未知错误"),
          // 只有显式点击才重试：慢链路不能自动重试（见 RunLogState 注释）
          h("button", { key: "retry", type: "button", className: "dsh-github-run-log-btn", onClick: loadLogs }, "🔁 重试")
        )
      );
    }

    if (logState.status === "ok" && logState.data) {
      var logData = logState.data;
      var logJobs: any[] = Array.isArray(logData.jobs) ? logData.jobs : [];
      var logErrors: any[] = Array.isArray(logData.errors) ? logData.errors : [];

      if (logJobs.length === 0 && logErrors.length === 0) {
        children.push(
          h("div", { key: "log-none", className: "dsh-github-run-empty" }, "GitHub 未返回可读日志（可能日志已过期或权限不足）")
        );
      }

      logJobs.forEach(function (block: any, i: number) {
        children.push(
          h(
            "div",
            { key: "log-block-" + i, className: "dsh-github-run-log-block" },
            h("div", { className: "dsh-github-run-log-title" }, "📄 " + (block.jobName || ("job " + block.jobId))),
            block.truncated
              ? h("div", { className: "dsh-github-run-log-truncated" }, "⚠️ 原始日志超出上限，仅显示已获取部分")
              : null,
            // <pre> 原文直出：日志里的 #、|、--- 不能进 markdown-lite
            h("pre", { className: "dsh-github-run-log" }, block.excerpt || "（该 job 无日志输出）")
          )
        );
      });

      logErrors.forEach(function (e: any, i: number) {
        children.push(
          h(
            "div",
            { key: "log-err-" + i, className: "dsh-github-run-error" },
            h("div", { className: "dsh-github-run-error-title" }, "⚠️ " + (e.jobName || "job") + " 日志获取失败"),
            h("div", { className: "dsh-github-run-error-text" }, e.error || "未知错误")
          )
        );
      });

      if (logData.fetchedAt) {
        children.push(
          h("div", { key: "log-at", className: "dsh-github-run-log-hint" }, "日志获取于 " + formatRelativeTime(logData.fetchedAt))
        );
      }
      // 名称降级必须可见（服务端 details 降级时 jobName 会退化成 job #<id>）
      if (logData.namesUnavailable) {
        children.push(
          h("div", { key: "log-names", className: "dsh-github-run-log-hint" }, "⚠️ job 名称未取到（详情字段降级），以 job #编号 显示。")
        );
      }
    }

    return h("div", { key: "logs", className: "dsh-github-run-log-section" }, ...children);
  };

  var headerTitle = data
    ? data.workflowName || data.name || "Actions Run"
    : "Actions Run";
  var ghHref = (data && data.url) || (repoNameWithOwner ? "https://github.com/" + repoNameWithOwner + "/actions/runs/" + runId : "");

  var header = h(
    "div",
    { className: "dsh-github-modal-header dsh-github-run-modal-header" },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 } },
      h("span", { style: { fontSize: "16px", lineHeight: 1, flexShrink: 0 }, "aria-hidden": "true" }, "⚡"),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
          h(
            "h3",
            {
              style: {
                margin: 0,
                fontSize: "14px",
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "520px",
              },
              title: headerTitle + " #" + runId,
            },
            headerTitle + " #" + runId
          ),
          badgeEl(data ? data.conclusion : undefined, data ? data.status : undefined),
          data && Number(data.attempt) > 1
            ? h(
                "span",
                { className: "dsh-github-badge dsh-badge-yellow", style: { fontSize: "10px", padding: "1px 6px", flexShrink: 0 } },
                "第 " + data.attempt + " 次尝试"
              )
            : null
        ),
        data && (data.displayTitle || repoNameWithOwner)
          ? h(
              "div",
              {
                style: {
                  fontSize: "11px",
                  color: "var(--dsw-alias-label-secondary, #656d76)",
                  display: "flex",
                  gap: "6px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  minWidth: 0,
                },
              },
              data.displayTitle
                ? h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: data.displayTitle }, data.displayTitle)
                : null,
              repoNameWithOwner
                ? h("span", { style: { fontFamily: "monospace", opacity: 0.85, flexShrink: 0 } }, repoNameWithOwner)
                : null
            )
          : null
      )
    ),
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } },
      ghHref
        ? h(
            "a",
            {
              href: ghHref,
              target: "_blank",
              rel: "noopener noreferrer",
              className: "dsh-github-pr-gh-btn",
              title: "在 GitHub 中打开该次运行",
            },
            "GitHub ↗"
          )
        : null,
      h(
        "button",
        {
          type: "button",
          "aria-label": "关闭",
          title: "关闭 (Esc)",
          style: {
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            color: "var(--dsw-alias-label-secondary, #656d76)",
            padding: "0 6px",
          },
          onClick: onClose,
        },
        "✕"
      )
    )
  );

  var jobs: any[] = data && Array.isArray(data.jobs) ? data.jobs : [];
  var bodyChildren: any[] = [];
  if (data) {
    if (jobs.length === 0) {
      bodyChildren.push(
        h("div", { key: "empty", className: "dsh-github-run-empty" }, "暂无可读 job（可能仍在排队或已跳过）")
      );
    } else {
      jobs.forEach(function (job: any, i: number) {
        bodyChildren.push(renderJob(job, i));
      });
    }
    var logSection = renderLogSection();
    if (logSection) bodyChildren.push(logSection);
  }

  var bodyNode = loading
    ? h("div", { style: { padding: "64px 0", textAlign: "center", fontSize: "13px", opacity: 0.7 } }, "⏳ 正在加载 Actions Run 详情…")
    : error
    ? h(
        "div",
        { className: "dsh-github-run-error" },
        h("div", { className: "dsh-github-run-error-title" }, "⚠️ 读取 Actions Run 详情失败"),
        // 服务端会把 gh 的原始报错透传上来，可能很长，交给 .dsh-github-run-error-text 滚动
        h("div", { className: "dsh-github-run-error-text" }, error),
        // 不给「重试」按钮：详情 effect 只依赖 [runId, repoNameWithOwner, cwd]，
        // 三者不变时重建同一份 effect 不会重新发起 fetch，按钮只会空转。
        // 需要重试的用户可直接用头部的 GitHub 外链核对。
        h("div", { className: "dsh-github-run-log-hint" }, "可关闭本弹窗后重新打开，或点击右上角「GitHub ↗」直接查看。")
      )
    : bodyChildren;

  return h(
    "div",
    { className: "dsh-github-modal-overlay", onClick: onClose, style: { zIndex: 100000 } },
    h(
      "div",
      {
        className: "dsh-github-modal-dialog dsh-github-run-modal-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Actions Run #" + runId + " 详情",
        onClick: function (e: any) { e.stopPropagation(); },
      },
      header,
      data ? renderMeta(data) : null,
      h("div", { className: "dsh-github-run-body" }, bodyNode)
    )
  );
}
