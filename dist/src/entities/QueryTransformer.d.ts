import { QueryProcessor } from './QueryProcessor';
interface metricResolver {
    (tree: any, query: any, builder: any): void;
}
export declare class QueryTransformer {
    queryProcessors: QueryProcessor[];
    constructor();
    build(table: any, tree: any, queries: Array<any> | undefined, idx: number | undefined, builder: any, options: {
        metricResolvers: Record<string, metricResolver>;
        dimensionResolvers: Record<string, metricResolver>;
        providers: Record<string, any>;
        provider: string;
    }, context?: {
        fragments: {};
        types: {};
        variablesValidator: {};
        variables: {};
        typeDefinitions: {};
    }): Array<any>;
    use(processor: QueryProcessor): void;
}
export {};
