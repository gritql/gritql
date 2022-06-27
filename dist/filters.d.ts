import { Filter } from './filter';
export interface BuilderContext<T = string | number | boolean> {
    query: any;
    builder: any;
    onlyInherited?: boolean;
    from?: string;
    inherited?: boolean;
    ignoreFrom?: boolean;
    valueTransformer: <V = T>(context: BuilderContext<V>, k: string, v: V) => V | string | {
        value: V | string;
        isField: boolean;
    };
}
export declare function buildFullName(args: any | any[], query: any, field: string, evaluateOnlyWithLinkSymbol?: boolean): string;
export declare function buildFilter(query: Filter, context: BuilderContext, prefix?: string): any;
export declare function parseAdvancedFilters(query: any, builder: any, filters: Filter & {
    having?: Filter;
}, onlyInherited?: boolean, from?: string): {
    where: string;
    having: string;
};
export declare function applyFilters(query: any, queryPromise: any, builder: any): any;
export declare function applyRawJoin(query: any, builder: any, joinType: string, from: string, on: Filter): any;
export declare function getDefaultFiltersResolver(filters: any): (queryPromise: any, builder: any) => any;
export declare function withFilters(query: any, filters: any): any;
export declare function transformFilters(args: any, query?: any, builder?: any): any;
