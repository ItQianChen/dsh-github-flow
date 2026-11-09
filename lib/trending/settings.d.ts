/** Which Firecrawl endpoint produces a board. Persisted so the settings panel and the tool agree. */
export type TrendingSource = 'scrape' | 'agent';
/** Server-only settings store. Never return the key from the settings API. */
export declare class FirecrawlSettings {
    private file;
    private environmentKey;
    private savedKey;
    private savedSource;
    constructor(file?: string, environmentKey?: string | undefined);
    key(): string | undefined;
    /** User-chosen mode, or undefined when it has never been set (the config default applies). */
    source(): TrendingSource | undefined;
    snapshot(): {
        hasKey: boolean;
        source: string;
        trendingSource: TrendingSource | null;
    };
    save(input: unknown): {
        hasKey: boolean;
        source: string;
        trendingSource: TrendingSource | null;
    };
}
