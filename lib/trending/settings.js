import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
/** Server-only credential store. Never return the key from the settings API. */
export class FirecrawlSettings {
    file;
    environmentKey;
    savedKey;
    constructor(file = path.join(os.homedir(), '.dsh', 'data', 'dsh-github-flow', 'firecrawl-settings.json'), environmentKey = process.env.FIRECRAWL_API_KEY) {
        this.file = file;
        this.environmentKey = environmentKey;
        try {
            const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (typeof saved.apiKey === 'string')
                this.savedKey = saved.apiKey;
        }
        catch { /* Missing or unreadable settings fall back to the environment. */ }
    }
    key() { return this.savedKey || this.environmentKey; }
    snapshot() {
        return { hasKey: Boolean(this.key()), source: this.savedKey ? 'settings' : this.environmentKey ? 'environment' : 'none' };
    }
    save(input) {
        if (!input || typeof input !== 'object')
            throw new Error('设置必须为 JSON 对象');
        const body = input;
        if (body.clear === true && body.apiKey !== undefined)
            throw new Error('不能同时保存和清除 API Key');
        let key;
        if (body.clear === true)
            key = undefined;
        else {
            if (typeof body.apiKey !== 'string' || !body.apiKey.trim() || body.apiKey.length > 512 || /[\s\x00-\x1f\x7f]/.test(body.apiKey.trim())) {
                throw new Error('请输入有效的 API Key（不能为空或包含空白字符）');
            }
            key = body.apiKey.trim();
        }
        const tmp = `${this.file}.${process.pid}.tmp`;
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
            fs.writeFileSync(tmp, JSON.stringify({ apiKey: key || '' }), { mode: 0o600 });
            fs.chmodSync(tmp, 0o600);
            fs.renameSync(tmp, this.file);
        }
        catch {
            try {
                fs.unlinkSync(tmp);
            }
            catch { /* best effort cleanup */ }
            throw new Error('无法保存 Firecrawl 设置，请检查 DSH 数据目录的写入权限');
        }
        this.savedKey = key;
        return this.snapshot();
    }
}
