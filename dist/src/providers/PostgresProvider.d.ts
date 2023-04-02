import { Knex } from 'knex';
import { QueryTransformer } from '../entities/QueryTransformer';
import { ResultTransformer } from '../entities/ResultTransformer';
import { KnexBasedSQLProvider } from './KnexBasedSQLProvider';
export declare class PostgresProvider extends KnexBasedSQLProvider {
    queryTransformer: QueryTransformer;
    resultTransformer: ResultTransformer;
    constructor(configuration: any, connector?: any);
    getQueryBuilder(): Knex<any, unknown[]>;
}
