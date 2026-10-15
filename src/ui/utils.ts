/**
 * 面板公共工具函数（纯函数，可被单元测试直接覆盖）
 */

export function formatRelativeTime(iso: any): string {
  if (!iso || typeof iso !== "string") return "";
  var t = Date.parse(iso);
  if (isNaN(t)) return "";
  var diff = Date.now() - t;
  if (diff < 0) return "刚刚";
  var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  if (diff < MIN) return "刚刚";
  if (diff < HOUR) return Math.floor(diff / MIN) + "分钟前";
  if (diff < DAY) return Math.floor(diff / HOUR) + "小时前";
  if (diff < 7 * DAY) return Math.floor(diff / DAY) + "天前";
  var d = new Date(t);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function rollupCiStatus(checks: any): "pass" | "fail" | "pending" | null {
  if (!Array.isArray(checks) || checks.length === 0) return null;
  var hasFail = false, hasPending = false;
  for (var i = 0; i < checks.length; i++) {
    var c = checks[i] || {};
    var status = String(c.status || "").toLowerCase();
    var conclusion = String(c.conclusion || "").toLowerCase();
    if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "cancelled") hasFail = true;
    else if (conclusion === "success" || conclusion === "skipped" || conclusion === "neutral") { }
    else if (status === "in_progress" || status === "queued" || conclusion === "pending" || (!conclusion && status)) hasPending = true;
  }
  if (hasFail) return "fail";
  if (hasPending) return "pending";
  return "pass";
}

export function reviewDecisionBadge(decision: any): { text: string; kind: "green" | "red" | "yellow" } | null {
  var d = String(decision || "").toUpperCase();
  if (d === "APPROVED") return { text: "✔ 已批准", kind: "green" };
  if (d === "CHANGES_REQUESTED") return { text: "✋ 需修改", kind: "red" };
  if (d === "REVIEW_REQUIRED") return { text: "👀 待审查", kind: "yellow" };
  return null;
}

export function eventLabel(event: any): string {
  var e = String(event || "");
  if (e === "push") return "⇡ push";
  if (e === "schedule") return "⏰ 定时";
  if (e === "workflow_dispatch") return "▶ 手动";
  if (e === "pull_request") return "🔀 PR";
  return e || "";
}
