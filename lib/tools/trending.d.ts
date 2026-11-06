import { TrendingService } from '../trending/service.js';
export declare function createTrendingTool(service: TrendingService): {
    name: string;
    description: string;
    parameters: {
        type: string;
        additionalProperties: boolean;
        properties: {
            period: {
                type: string;
                enum: string[];
                description: string;
            };
            refresh: {
                type: string;
                description: string;
            };
        };
    };
    output: {
        schema: {
            type: string;
        };
        render(_args: any, value: any): {
            type: string;
            text: string;
        }[];
    };
    execute(args: any): Promise<{
        items: import("../trending/service.js").TrendingResult[];
        errors: {
            period: "daily" | "monthly" | "weekly";
            message: any;
        }[];
    }>;
};
