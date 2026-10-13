export type UpdateSourceMode = 'official' | 'mirror' | 'off';
/** mode 白名单校验：持久化文件可能被手改成任意串，不能成为绕过校验的后门 */
export declare function isValidUpdateMode(v: unknown): v is UpdateSourceMode;
/**
 * 读取持久化设置。容灾语义：文件不存在/损坏/mode 非法 → 返回默认 'official'，
 * 绝不让设置读取失败阻断插件启动（默认值即官方源，与 UI 默认选中一致）。
 */
export declare function loadUpdateSettings(): UpdateSourceMode;
/**
 * 原子写（tmp + rename）：并发/崩溃不产生半截 JSON。写盘失败不抛出——
 * 内存态已生效，仅丢失重启恢复能力（尽力持久化语义，同 proxy.ts persist）。
 */
export declare function saveUpdateSettings(mode: UpdateSourceMode): {
    ok: boolean;
    error?: string;
};
/** mode → 人类可读名（命令行输出与 UI 共用，避免文案漂移） */
export declare function describeUpdateMode(mode: UpdateSourceMode): string;
