/** Public Trending data, independent of gh authentication and the active workspace. */
export declare const TRENDING_PERIODS: readonly ['daily', 'weekly', 'monthly'];
export type TrendingPeriod = typeof TRENDING_PERIODS[number];
/** The six-field contract shared by Firecrawl, HTTP, tools and the dashboard. */
export interface TrendingRepository {
    name: string;
    url: string;
    description: string;
    language: string | null;
    stars: number | null;
    /** Historical field name: the increase in the selected daily/weekly/monthly period. */
    starsToday: number | null;
}
export declare const TRENDING_ITEM_SCHEMA: {
    type: string;
    additionalProperties: boolean;
    required: string[];
    properties: {
        name: {
            type: string;
            description: string;
        };
        url: {
            type: string;
            description: string;
        };
        description: {
            type: string;
            description: string;
        };
        language: {
            type: string[];
            description: string;
        };
        stars: {
            type: string[];
            minimum: number;
            description: string;
        };
        starsToday: {
            type: string[];
            minimum: number;
            description: string;
        };
    };
};
export interface TrendingResult {
    period: TrendingPeriod;
    sourceUrl: string;
    fetchedAt: string;
    stale: boolean;
    warning?: string;
    items: TrendingRepository[];
    /** Present when one Agent task produced the board, its translations and its summary together. */
    insight?: TrendingInsight;
}
export declare function parseTrendingPeriod(value: unknown): TrendingPeriod;
/** Reject malformed extractions rather than silently showing invented zeros or an empty board. */
export declare function validateTrendingItems(value: unknown): TrendingRepository[];
/** Agents often echo counters as display strings such as "7,338" or "—"; normalise before validation. */
export declare function coerceAgentItems(value: unknown): unknown;
export interface TrendingInsight {
    summary: string;
    observations: string[];
    /** Sidecar translations keyed by owner/repo; never added to the six-field row schema. */
    descriptionsZh?: Record<string, string>;
}
export interface TrendingAgentState {
    status: 'idle' | 'processing' | 'completed' | 'failed';
    insight?: TrendingInsight;
    error?: string;
}
export interface TrendingOptions {
    baseUrl?: string;
    apiKey?: string;
    cacheTtlMs?: number;
    timeoutMs?: number;
    /**
     * 'agent' runs a single Firecrawl Agent task that scrapes the Trending page,
     * extracts the six fields, translates descriptions and summarises the board.
     * 'scrape' keeps the deterministic scrape and analyses separately.
     */
    source?: 'agent' | 'scrape';
    /** Whole-task budget for the agent path, polling included. */
    agentTimeoutMs?: number;
    /** Delay between job status polls. */
    agentPollMs?: number;
    /** Hard ceiling for one agent task so a stuck run cannot drain credits. */
    agentMaxCredits?: number;
    /**
     * Optional persistence for the board cache.
     *
     * The service keeps everything in memory so it stays trivial to test; the host passes a
     * file store so the three-hour window survives a reload or an app restart instead of
     * paying for a fresh Agent task every time the process restarts.
     */
    store?: TrendingCacheStore;
}
export interface TrendingCacheStore {
    read(period: TrendingPeriod): TrendingResult | null;
    write(period: TrendingPeriod, result: TrendingResult): void;
    clear(): void;
}
export declare function createFileCacheStore(dir?: string): TrendingCacheStore;
export declare class TrendingService {
    private options;
    private request;
    private now;
    private cache;
    private pending;
    private controllers;
    private disposed;
    private agentJobs;
    private agentStarts;
    private revision;
    private readonly baseUrl;
    private readonly ttl;
    private readonly timeout;
    private readonly source;
    private readonly agentBudget;
    private readonly agentPoll;
    private readonly agentCredits;
    private readonly store?;
    constructor(options?: TrendingOptions, request?: typeof fetch, now?: () => number);
    setApiKey(apiKey: string | undefined): void;
    status(): {
        configured: boolean;
        cacheTtlMs: number;
    };
    dispose(): void;
    get(period: TrendingPeriod, refresh?: boolean): Promise<TrendingResult>;
    /** Write the board to memory and, when configured, to the persistent store. */
    private remember;
    /**
     * Rebuild the memory entry from disk after a reload or a host restart.
     *
     * Whatever is on disk is untrusted input: the six-field contract is re-validated and any
     * entry the current code cannot read is dropped, so an older or corrupted file can only
     * cost one refetch — never a broken board.
     */
    private hydrate;
    /** Automatically run one Agent analysis for each successful leaderboard snapshot. */
    agentStart(period: TrendingPeriod): Promise<TrendingAgentState>;
    agentStatus(period: TrendingPeriod): Promise<TrendingAgentState>;
    /**
     * One Agent task owns scraping, translation and summary, so a single response
     * carries every row together with the insights that describe it.
     */
    private fetchBoard;
    private agentBoard;
    /** Keep only well-formed insight text and translations for repositories actually on the board. */
    private buildInsight;
    private agentFetch;
    private scrape;
}
