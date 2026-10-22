/**
 * gh argv 的「位置参数」守卫。
 *
 * 为什么需要它：`gh` 用 cobra/pflag 解析 argv，"以 - 开头的 token" 一律优先当
 * 选项。工具把用户输入直接 push 成**位置参数**时，`pr_number: "--force"` 会变成
 * `gh pr checkout --force`——破坏性闸门判的是**参数**，而危险在 **argv**，
 * 两者不在同一层（复核报告 C-01 的三条绕过全是这个形状）。
 *
 * 为什么只拒绝 `-` 开头而不是做全量字符白名单：
 * 各工具的位置参数语义差异很大（编号是数字、名字是任意非空串、路径可以有斜杠），
 * 统一白名单会误伤合法输入；而"不能是选项"是所有位置参数**共有**的唯一硬约束。
 * 具体格式（正整数 / owner-repo / 数字 ID）仍由各工具自己的校验负责。
 *
 * 空值不在此处报错：调用方各自的「必须提供 X」文案更准确，这里越俎代庖会把
 * 两个不同原因的错误合并成一个，反而降低可诊断性。
 */
export function assertPositionArg(value: unknown, label: string): string {
  const raw = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (raw.startsWith('-')) {
    throw new Error(
      `${label} 非法：位置参数不能以 "-" 开头（收到 "${raw}"），它会被 gh 当成命令行选项而不是取值。`
    );
  }
  return raw;
}
