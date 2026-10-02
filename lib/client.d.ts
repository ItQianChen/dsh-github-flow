declare global {
    interface Window {
        __ModuleLoader__: {
            load(options: {
                id: string;
                factory: (require: any) => any;
            }): void;
        };
    }
}
export {};
