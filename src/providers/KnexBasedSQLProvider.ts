import knexConstructor, { Knex } from 'knex'
import { SourceProvider } from '../entities/SourceProvider'

export class KnexBasedSQLProvider implements SourceProvider {
  configuration: any
  connector: any
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
    'RIGHT',
  ]
  queryBuilder: 'knex'

  constructor(configuration, connector?) {
    this.configuration = configuration
    this.connector = connector
  }

  getQueryPromise(query, builder) {
    return builder.select().from(query.table)
  }
  getQueryBuilder() {
    //implement
  }
  execute(connection: any, sql: any) {
    if (!connection) {
      throw new Error(
        "Provider isn't configured yet, please use #setupProvider() to provide config",
      )
    }
    const native = sql.toSQL().toNative()
    return connection.unsafe(native.sql, native.bindings || [])
  }
  getConnection() {
    let options: Record<string, any> = {
      max: this.configuration.pool?.max || 20,
    }

    if (!this.configuration.connection.connectionString) {
      options = {
        ...this.configuration.connection,
        ...options,
      }
    }

    const connection = this.configuration.connection.connectionString
      ? this.connector(this.configuration.connection.connectionString, options)
      : this.connector(options)

    return connection
  }
}
