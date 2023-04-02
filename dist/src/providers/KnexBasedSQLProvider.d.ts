import { Knex } from 'knex';
import { SourceProvider } from '../entities/SourceProvider';
export declare class KnexBasedSQLProvider implements SourceProvider {
    configuration: any;
    connector: any;
    keywords: [
        'GROUP BY',
        'WITHIN GROUP',
        'DATE_TRUNC',
        'DISTINCT',
        'SUM',
        'MIN',
        'MAX',
        'CAST',
        'FLOOR',
        'CEIL',
        'NULLIF',
        'OVER',
        'PARTITION BY',
        'ORDER BY',
        'COUNT',
        'AVG',
        'PLAINTO_TSQUERY',
        'TO_TSVECTOR',
        'TS_HEADLINE',
        'TS_RANK',
        'PERCENTILE_CONT',
        'RANK',
        'DENSE_RANK',
        'ROW_NUMBER',
        'JOIN',
        'ON',
        'FULL OUTER',
        'FULL',
        'INNER',
        'LEFT OUTER',
        'RIGHT OUTER',
        'LEFT',
        'RIGHT'
    ];
    queryBuilder: 'knex';
    constructor(configuration: any, connector?: any);
    getQueryPromise(query: any, builder: any): any;
    getQueryBuilder(): Knex<any, unknown[]>;
    execute(connection: any, sql: any): any;
    getConnection(): any;
    disableOperationFor(query: any, operation: string): void;
}
