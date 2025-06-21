import knexConstructor, { Knex } from 'knex'
import { SourceProvider } from '../entities/SourceProvider'
import { Instruction } from '../Instructions/basic'

export class KnexBasedSQLProvider implements SourceProvider {
  public name = 'SQL'
  public configuration: any
  public instructions: Instruction[]
  public metrics: Instruction[]
  public dimensions: Instruction[]
  public connector: any
  public keywords = [
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
    'WHERE',
    'IN',
    'AND',
    'OR',
    'LIKE',
    'ILIKE',
  ]
  public queryBuilder: 'knex'

  constructor(configuration, connector?) {
    this.configuration = configuration
    this.connector = connector
  }
  getInstruction(name) {
    const instruction = this.instructions.find(
      (instruction) => instruction.name === name,
    )
    if (!instruction) {
      throw new Error(`Instruction ${name} not found in ${this.name} provider`)
    }
    return instruction
  }
  initiateQuery({ table }) {
    const builder = this.getQueryBuilder()
    return { promise: builder.select().from(table) }
  }
  enableWith(query) {
    query.isWith = true
  }
  getQueryBuilder() {
    return knexConstructor({ client: 'pg' })
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
