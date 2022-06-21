import { Filter } from './filter';
export interface BuilderContext<T = string | number | boolean> {
    query: any;
    knex: any;
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
export declare function parseAdvancedFilters(query: any, knex: any, filters: Filter & {
    having?: Filter;
}, onlyInherited?: boolean, from?: string): {
    where: string;
    having: string;
};
export declare function applyFilters(query: any, knexPipe: any, knex: any): any;
export declare function applyRawJoin(query: any, knex: any, joinType: string, from: string, on: Filter): any;
export declare function withFilters(filters: any): (knexPipe: any, knex: any) => any;
export declare function transformFilters(args: any, query?: any, knex?: any): any;
