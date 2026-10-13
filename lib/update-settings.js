/**
 * 更新源设置轻量 store（官方源 / 国内镜像 / 关闭检查）。
 *
 * 为什么独立于 Cordis Config：更新源变更若走 Loader 会触发插件全量 reload
 * （工具注销重注册、面板断流），而它是高频试错型设置，必须保存即生效——
 * 与 proxy.json 完全同范式：~/.dsh/data/dsh-github-flow/update-settings.json。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
/** 持久化路径：与 proxy.json 同目录（DSH 用户数据目录规范） */
function resolveStorePath() {
    return path.join(os.homedir(), '.dsh', 'data', 'dsh-github-flow', 'update-settings.json');
}
/** mode 白名单校验：持久化文件可能被手改成任意串，不能成为绕过校验的后门 */
export function isValidUpdateMode(v) {
    return v === 'official' || v === 'mirror' || v === 'off';
}
/**
 * 读取持久化设置。容灾语义：文件不存在/损坏/mode 非法 → 返回默认 'official'，
 * 绝不让设置读取失败阻断插件启动（默认值即官方源，与 UI 默认选中一致）。
 */
export function loadUpdateSettings() {
    try {
        const raw = JSON.parse(fs.readFileSync(resolveStorePath(), 'utf8'));
        const mode = (raw && typeof raw === 'object') ? raw.mode : undefined;
        if (isValidUpdateMode(mode))
            return mode;
    }
    catch { /* 不存在/坏 JSON → 默认值 */ }
    return 'official';
}
/**
 * 原子写（tmp + rename）：并发/崩溃不产生半截 JSON。写盘失败不抛出——
 * 内存态已生效，仅丢失重启恢复能力（尽力持久化语义，同 proxy.ts persist）。
 */
export function saveUpdateSettings(mode) {
    if (!isValidUpdateMode(mode))
        return { ok: false, error: `非法更新源模式: ${String(mode)}` };
    try {
        const storePath = resolveStorePath();
        fs.mkdirSync(path.dirname(storePath), { recursive: true });
        const tmp = `${storePath}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ mode, savedAt: new Date().toISOString() }, null, 2), 'utf8');
        fs.renameSync(tmp, storePath);
        return { ok: true };
    }
    catch (e) {
        console.warn(`[dsh-github-flow] 更新源设置写盘失败（本次会话仍生效）: ${e?.message || e}`);
        return { ok: false, error: e?.message || String(e) };
    }
}
/** mode → 人类可读名（命令行输出与 UI 共用，避免文案漂移） */
export function describeUpdateMode(mode) {
    if (mode === 'mirror')
        return '国内镜像 (npmmirror)';
    if (mode === 'off')
        return '不检查更新';
    return 'npm 官方源';
}
