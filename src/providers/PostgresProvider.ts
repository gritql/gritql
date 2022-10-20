import knexConstructor, { Knex } from 'knex'
import { SourceProvider } from '../entities/SourceProvider'

export class PostgresProvider implements SourceProvider {
  configuration: any
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

  constructor(configuration) {
    this.configuration = configuration
  }

  getQueryBuilder() {
    return knexConstructor({ client: 'pg' })
  }
  getQueryPromise(query, builder) {
    return builder.select().from(query.table)
  }
  getConnector() {
    return require('postgres')
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
  getConnection(configuration, connector) {
    let options: Record<string, any> = {
      max: this.configuration.pool?.max || 20,
    }

    if (!configuration.connection.connectionString) {
      options = {
        ...configuration.connection,
        ...options,
      }
    }

    const connection = configuration.connection.connectionString
      ? connector(configuration.connection.connectionString, options)
      : connector(options)

    return connection
  }
}
