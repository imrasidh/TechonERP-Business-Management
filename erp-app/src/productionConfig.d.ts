export declare const IS_PRODUCTION: boolean;
export declare function isProductionViteBuild(): boolean;
export declare function enforceProductionStrictPeriodLock(): boolean;
export declare function isSnapshotDeviceHmacAllowed(): boolean;
export declare function validateJsonBackupPayload(bk: unknown): boolean;
export declare function toUserErrorMessage(err: unknown, fallback?: string): string;
export declare function installProductionConsole(): void;
