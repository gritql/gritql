import knexConstructor, { Knex } from 'knex'
import { SourceProvider } from '../entities/SourceProvider'

export class SnowflakeProvider implements SourceProvider {
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
    'RANK',
    'DENSE_RANK',
    'ROW_NUMBER',
    'MEDIAN',
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
    this.connector = connector || require('snowflake-sdk')
  }

  getQueryBuilder() {
    return knexConstructor({ client: 'pg' })
  }
  getQueryPromise(query, builder) {
    return builder.select().from(query.table)
  }

  getConnection() {
    // Always connect trought pool, because snowflake has different interfaces for normal and pool connection
    return this.connector.createPool(
      this.configuration.connection.connectionString
        ? this.configuration.connection.connectionString
        : {
            ...this.configuration.connection,
          },
      this.configuration.pool || { min: 0, max: 20 },
    )
  }
  execute(connection, sql) {
    if (!connection) {
      throw new Error(
        "Provider isn't configured yet, please use #setupProvider() to provide config",
      )
    }

    return connection.use(async (client) => {
      return await new Promise((resolve, reject) =>
        client.execute({
          sqlText: sql.toSQL().sql,
          binds: sql.toSQL().bindings,
          complete(err, stmt, rows) {
            if (err) {
              reject(err)
            }
            resolve(rows)
          },
        }),
      )
    })
  }
}
