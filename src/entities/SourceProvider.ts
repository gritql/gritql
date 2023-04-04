import knexConstructor, { Knex } from 'knex'
import { Instruction } from '../Instructions/basic'

export interface SourceProvider {
  name: string
  connector: any
  keywords: string[]
  queryBuilder: string
  instructions: Array<Instruction>
  metrics: Array<Instruction>
  dimensions: Array<Instruction>

  getInstruction: (name: string) => Instruction
  enableWith: (query) => void
  getQueryBuilder: () => any
  initiateQuery: (query) => any
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
