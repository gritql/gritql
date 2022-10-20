import knexConstructor, { Knex } from 'knex'

export interface SourceProvider {
  keywords: string[]
  queryBuilder: string
  getQueryBuilder: () => any
  getQueryPromise: (query, builder) => Knex.QueryBuilder | Promise<any>
  getConnector: () => any
  getConnection: (conf, connector) => any
  execute: (connection, sql) => any
  postTransform?: (data) => any
  prepare?: (query, promise) => Promise<any> | Knex.QueryBuilder
  getFiltersResolver?: (
    filters,
  ) => (
    queryPromise: Promise<any> | Knex.QueryBuilder,
    builder: any,
  ) => Promise<any> | Knex.QueryBuilder
  connection?: any
  configuration?: any
}
