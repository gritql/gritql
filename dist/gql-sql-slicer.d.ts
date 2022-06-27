import type { DocumentNode } from 'graphql';
import { Knex } from 'knex';
import { Provider } from './providers';
interface GqlQuery {
    promise: Knex.QueryBuilder | Promise<any>;
    name: string;
    filters: Array<string>;
    table: string;
    joins?: string[];
    metrics?: string[];
    dimensions?: string[];
    providers: Record<string, Provider>;
    provider: string;
}
interface gqlBuildObject {
    queries: Array<GqlQuery>;
    sql: Array<string>;
    definitions: DocumentNode;
}
interface BeforeDbHandler {
    (QueryObject: gqlBuildObject): Promise<gqlBuildObject>;
}
interface DbHandler {
    (QueryObject: gqlBuildObject): Promise<any>;
}
interface metricResolver {
    (tree: any, query: any, builder: any): void;
}
interface metricDataResolver {
    (tree: any, query: any): void;
}
export declare const gqlToDb: () => {
    (gqlQuery: string, variables: Record<string, any>, provider?: string): Promise<any>;
    beforeDbFetch(fn: BeforeDbHandler): any;
    dbFetch(fn: DbHandler): any;
    afterDbFetch(fn: Function): any;
    useResolver(name: string, fn: metricResolver): void;
    useDimensionResolver(name: string, fn: metricResolver): void;
    useProvider(name: string, provider: Provider): void;
    useDataResolver(name: string, fn: metricDataResolver): void;
    setupProvider(name: string, configuration: any): void;
};
export declare const merge: (tree: Array<DocumentNode>, data: Array<any>, metricResolversData: any) => any;
export {};
