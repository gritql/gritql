import { Knex } from 'knex';
export interface Provider {
    keywords: string[];
    queryBuilder: string;
    getQueryBuilder: () => any;
    getQueryPromise: (query: any, builder: any) => Knex.QueryBuilder | Promise<any>;
    getConnector: () => any;
    getConnection: (conf: any, connector: any) => any;
    execute: (connection: any, sql: any) => any;
    postTransform?: (data: any) => any;
    prepare?: (query: any, promise: any) => Promise<any> | Knex.QueryBuilder;
    getFiltersResolver?: (filters: any) => (queryPromise: Promise<any> | Knex.QueryBuilder, builder: any) => Promise<any> | Knex.QueryBuilder;
    connection?: any;
    configuration?: any;
}
export declare function disableArgumentFor(query: any, argument: string, provider: string): void;
export declare function disableOperationFor(query: any, operation: string, provider: string): void;
export declare const providers: Record<string, Provider>;
