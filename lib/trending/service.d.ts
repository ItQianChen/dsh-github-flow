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
}
export declare function parseTrendingPeriod(value: unknown): TrendingPeriod;
/** Reject malformed extractions rather than silently showing invented zeros or an empty board. */
export declare function validateTrendingItems(value: unknown): TrendingRepository[];
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
}
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
    constructor(options?: TrendingOptions, request?: typeof fetch, now?: () => number);
    setApiKey(apiKey: string | undefined): void;
    status(): {
        configured: boolean;
        cacheTtlMs: number;
    };
    dispose(): void;
    get(period: TrendingPeriod, refresh?: boolean): Promise<TrendingResult>;
    /** Automatically run one Agent analysis for each successful leaderboard snapshot. */
    agentStart(period: TrendingPeriod): Promise<TrendingAgentState>;
    agentStatus(period: TrendingPeriod): Promise<TrendingAgentState>;
    private agentFetch;
    private scrape;
}
