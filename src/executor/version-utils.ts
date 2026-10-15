/**
 * 从 `gh --version` 输出中解析语义化版本号。
 * 抽成导出纯函数的原因与 truncateOutput 相同：解析逻辑是「看似简单实则易错」的边界区，
 * 必须能用单元测试钉死（不匹配输入返回 null 而非抛错，调用方据此走 fail-open）。
 */
export function parseGhVersion(output: string): string | null {
  const m = /gh version (\d+\.\d+\.\d+)/.exec(output || '');
  return m ? m[1] : null;
}

/**
 * 数值分段比较两个 gh 版本：a>b 返回 1、a<b 返回 -1、相等返回 0。
 * 为什么不能用字符串比较：`'2.96.0' < '2.100.0'` 在字典序下为 false（'1'<'9'），
 * 这会把 2.100 误判为低于 2.96，导致可用命令被错误降级。逐段 Number 比较是唯一正确姿势。
 */
export function compareGhVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}
