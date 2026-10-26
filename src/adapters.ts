/**
 * Adapter helpers (SPEC §5). gritql ships no database driver; the caller
 * passes a configured knex instance or client.
 */
import knexFactory, { Knex } from 'knex'
import type { Adapter, Physical, Row, SqlReq } from './model'

export interface KnexAdapterOptions {
  name?: string
  dialect: string
  knex?: Knex
  compile?(qb: Knex.QueryBuilder, physical: Physical): SqlReq
  execute(req: SqlReq): Promise<Row[]>
}

/** an adapter from a dialect name and an execute function */
export function knexAdapter(opts: KnexAdapterOptions): Adapter {
  return { name: opts.name ?? opts.dialect, dialect: opts.dialect, knex: opts.knex, compile: opts.compile, execute: opts.execute }
}

/** PostgreSQL through a connected knex instance (`knex({ client: 'pg', connection })`) */
export function pgAdapter(db: Knex, name = 'pg'): Adapter {
  return {
    name,
    dialect: 'pg',
    knex: db,
    // knex.raw binds `?` placeholders itself, so hand it the un-nativized statement
    compile: (qb) => {
      const q = qb.toSQL()
      return { sql: q.sql, params: q.bindings as unknown[] }
    },
    async execute({ sql, params }) {
      const res = await db.raw(sql, params as Knex.RawBinding[])
      return (res as any).rows ?? res
    },
  }
}

export interface ClickhouseClientLike {
  query(args: { query: string; format: string }): Promise<{ json<T = Row>(): Promise<T[]> }>
}

/**
 * ClickHouse through `@clickhouse/client`. Statements are rendered with
 * inlined values (`qb.toString()`); pass `knex` built with a ClickHouse
 * dialect plugin, or the pg builder is used for printing.
 */
export function clickhouseAdapter(client: ClickhouseClientLike, opts: { knex?: Knex; name?: string } = {}): Adapter {
  return {
    name: opts.name ?? 'clickhouse',
    dialect: 'clickhouse',
    knex: opts.knex ?? knexFactory({ client: 'pg' }),
    compile: (qb) => {
      const sql = qb.toString()
      // unmatched LEFT JOIN rows are type defaults (0, '') on ClickHouse unless asked for NULL, which SPEC §6.7 promises
      return { sql: /\bleft join\b/i.test(sql) ? `${sql} SETTINGS join_use_nulls = 1` : sql, params: [] }
    },
    async execute({ sql }) {
      const rs = await client.query({ query: sql, format: 'JSONEachRow' })
      return rs.json()
    },
  }
}

/** adapter that answers every statement from a fixed list of row sets, in execution order (tests, dry runs) */
export function fixtureAdapter(rowSets: Row[][] | ((req: SqlReq, index: number) => Row[] | Promise<Row[]>), dialect = 'pg'): Adapter {
  let i = 0
  return {
    name: 'fixture',
    dialect,
    async execute(req) {
      const n = i++
      return typeof rowSets === 'function' ? rowSets(req, n) : rowSets[n] ?? []
    },
  }
}
