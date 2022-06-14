export interface Provider {
  client: string
  keywords: string[]
  getConnector: () => any
  getConnection: (conf, connector) => any
  execute: (connection, sql) => any
  connection?: any
  configuration?: any
}

export const providers = {
  pg: {
    // For knex optimizations for postgres
    client: 'pg',
    // Basic list of keywords, you must provide more for resolvers with specific keywords
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
    ],
    getConnector: () => require('postgres'),
    getConnection: (configuration, connector) => {
      let options: Record<string, any> = { max: configuration.pool?.max || 20 }

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
    },
    execute(connection, sql) {
      if (!connection) {
        throw new Error(
          "Provider isn't configured yet, please use #setupProvider() to provide config",
        )
      }

      const native = sql.toNative()

      return connection.unsafe(native.sql, native.bindings || [])
    },
  },
  snowflake: {
    // simulate pg client
    client: 'pg',
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
    ],
    getConnector: () => {
      return require('snowflake-sdk')
    },
    getConnection: (configuration, connector) => {
      // Always connect trought pool, because snowflake has different interfaces for normal and pool connection
      return connector(
        configuration.connection.connectionString
          ? configuration.connection.connectionString
          : {
              ...configuration.connection,
            },
        configuration.pool || { min: 0, max: 20 },
      )
    },
    execute: (connection, sql) => {
      if (!connection) {
        throw new Error(
          "Provider isn't configured yet, please use #setupProvider() to provide config",
        )
      }

      return connection.use((client) => {
        return client.execute({
          sqlText: sql.sql,
          binds: sql.bindings,
        })
      })
    },
  },
}
