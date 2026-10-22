import type { GhExecutor } from '../executor.js';
export declare function createGistTool(executor: GhExecutor): {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            action: {
                type: string;
                enum: string[];
                description: string;
            };
            gist_id: {
                type: string;
                description: string;
            };
            filename: {
                type: string;
                description: string;
            };
            files: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            content: {
                type: string;
                description: string;
            };
            description: {
                type: string;
                description: string;
            };
            public: {
                type: string;
                description: string;
            };
            filter: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            confirm: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
    output: {
        schema: {
            type: string;
        };
        render(args: any, value: any): {
            type: string;
            text: string;
        }[];
    };
    execute(args: any, execContext: any): Promise<{
        items: import("../renderers/gist.js").ParsedGistSummary[];
        count: number;
        rawText: string;
        filename?: undefined;
        content?: undefined;
        url?: undefined;
        public?: undefined;
        description?: undefined;
        success?: undefined;
        gist_id?: undefined;
        message?: undefined;
        detail?: undefined;
    } | {
        items?: undefined;
        count?: undefined;
        rawText?: undefined;
        gist_id: string;
        filename: any;
        content: string;
        url?: undefined;
        public?: undefined;
        description?: undefined;
        success?: undefined;
        message?: undefined;
        detail?: undefined;
    } | {
        items?: undefined;
        count?: undefined;
        rawText?: undefined;
        filename?: undefined;
        content?: undefined;
        success: boolean;
        url: string;
        gist_id: string;
        public: boolean;
        description: any;
        message: string;
        detail?: undefined;
    } | {
        items?: undefined;
        count?: undefined;
        rawText?: undefined;
        filename?: undefined;
        content?: undefined;
        url?: undefined;
        public?: undefined;
        description?: undefined;
        success: boolean;
        gist_id: string;
        message: string;
        detail: string;
    }>;
};
