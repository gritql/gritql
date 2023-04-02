import { Knex } from 'knex';
export interface SourceProvider {
    connector: any;
    keywords: string[];
    queryBuilder: string;
    getQueryBuilder: () => any;
    getQueryPromise: (query: any, builder: any) => Knex.QueryBuilder | Promise<any>;
    getConnection: (conf: any, connector: any) => any;
    execute: (connection: any, sql: any) => any;
    postTransform?: (data: any) => any;
    prepare?: (query: any, promise: any) => Promise<any> | Knex.QueryBuilder;
    getFiltersResolver?: (filters: any) => (queryPromise: Promise<any> | Knex.QueryBuilder, builder: any) => Promise<any> | Knex.QueryBuilder;
    connection?: any;
    configuration?: any;
    disableOperationFor: (query: any, operation: string) => void;
}
