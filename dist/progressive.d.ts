export declare function progressiveGet(object: any, queryPath: any, hashContext?: {}): any;
export declare function progressiveSet(object: any, queryPath: any, value: any, summItUp: any, hashContext?: Record<string, any>): any;
export declare function iterateProgressive(obj: any, key: string, callback: (obj: any, currentKeys: Array<number | string>) => void): void;
export declare function replVars(str: any, obj: any): any;
export declare function getBatchContext(batches: any, by: any): any;
