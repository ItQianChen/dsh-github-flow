import type { TrendingResult } from '../trending/service.js';
export declare function renderTrendingMarkdown(value: {
    items: TrendingResult[];
    errors?: Array<{
        period: string;
        message: string;
    }>;
}): string;
