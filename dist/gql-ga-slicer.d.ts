export declare function gaQueryBuilder(table: any, tree: any, queries: Array<any> | undefined, idx: number | undefined, knex: any, metricResolvers: any): any;
export declare const gaMetricResolvers: {
    divide: (tree: any, query: any, knex: any) => void;
    indexed: (tree: any, query: any, knex: any) => void;
};
