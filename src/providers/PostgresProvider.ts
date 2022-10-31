import knexConstructor, { Knex } from 'knex'
import { QueryTransformer } from '../entities/QueryTransformer'
import { ResultTransformer } from '../entities/ResultTransformer'
import { KnexBasedSQLProvider } from './KnexBasedSQLProvider'

export class PostgresProvider extends KnexBasedSQLProvider {
  public queryTransformer: QueryTransformer
  public resultTransformer: ResultTransformer
  constructor(configuration, connector?) {
    super(configuration, connector || require('postgres'))
  }
  getQueryBuilder() {
    return knexConstructor({ client: 'pg' })
  }
}
