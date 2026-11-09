import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Which Firecrawl endpoint produces a board. Persisted so the settings panel and the tool agree. */
export type TrendingSource = 'scrape' | 'agent';

/** Server-only settings store. Never return the key from the settings API. */
export class FirecrawlSettings {
  private savedKey: string | undefined;
  private savedSource: TrendingSource | undefined;
  constructor(private file = path.join(os.homedir(), '.dsh', 'data', 'dsh-github-flow', 'firecrawl-settings.json'),
    private environmentKey = process.env.FIRECRAWL_API_KEY) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof saved.apiKey === 'string') this.savedKey = saved.apiKey;
      if (saved.trendingSource === 'scrape' || saved.trendingSource === 'agent') {
        this.savedSource = saved.trendingSource;
      }
    } catch { /* Missing or unreadable settings fall back to the environment. */ }
  }
  key(): string | undefined { return this.savedKey || this.environmentKey; }
  /** User-chosen mode, or undefined when it has never been set (the config default applies). */
  source(): TrendingSource | undefined { return this.savedSource; }
  snapshot() {
    return {
      hasKey: Boolean(this.key()),
      source: this.savedKey ? 'settings' : this.environmentKey ? 'environment' : 'none',
      trendingSource: this.savedSource ?? null,
    };
  }
  save(input: unknown) {
    if (!input || typeof input !== 'object') throw new Error('设置必须为 JSON 对象');
    const body = input as { apiKey?: unknown; clear?: unknown; source?: unknown };
    if (body.clear === true && body.apiKey !== undefined) throw new Error('不能同时保存和清除 API Key');
    if (body.clear !== true && body.apiKey === undefined && body.source === undefined) {
      throw new Error('没有需要保存的设置');
    }
    let key = this.savedKey;
    if (body.clear === true) key = undefined;
    else if (body.apiKey !== undefined) {
      if (typeof body.apiKey !== 'string' || !body.apiKey.trim() || body.apiKey.length > 512 || /[\s\x00-\x1f\x7f]/.test(body.apiKey.trim())) {
        throw new Error('请输入有效的 API Key（不能为空或包含空白字符）');
      }
      key = body.apiKey.trim();
    }
    let source = this.savedSource;
    if (body.source !== undefined) {
      if (body.source !== 'scrape' && body.source !== 'agent') throw new Error('抓取模式必须为 scrape 或 agent');
      source = body.source;
    }
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(tmp, JSON.stringify({ apiKey: key || '', trendingSource: source || '' }), { mode: 0o600 });
      fs.chmodSync(tmp, 0o600);
      fs.renameSync(tmp, this.file);
    } catch {
      try { fs.unlinkSync(tmp); } catch { /* best effort cleanup */ }
      throw new Error('无法保存 Firecrawl 设置，请检查 DSH 数据目录的写入权限');
    }
    this.savedKey = key;
    this.savedSource = source;
    return this.snapshot();
  }
}
