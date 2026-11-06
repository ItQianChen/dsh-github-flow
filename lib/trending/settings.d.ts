/** Server-only credential store. Never return the key from the settings API. */
export declare class FirecrawlSettings {
    private file;
    private environmentKey;
    private savedKey;
    constructor(file?: string, environmentKey?: string | undefined);
    key(): string | undefined;
    snapshot(): {
        hasKey: boolean;
        source: string;
    };
    save(input: unknown): {
        hasKey: boolean;
        source: string;
    };
}
