/**
 * v3's `gqlToDb()` chaining API over the v4 engine, so v3 behavioural tests
 * run with minimal edits. `beforeDbFetch` sees `{ sql, queries, plan }`,
 * `dbFetch` returns one row set per statement in execution order.
 */
import { fixtureAdapter, gritql, Extension, Row } from '../src'

type Before = (def: any) => any
type Db = (def: any) => Row[][] | Promise<Row[][]>

export const gqlToDb = () => {
  let before: Before = (d) => d
  let db: Db | null = null
  let after: (plan: any, tables: Row[][]) => void = () => {}
  const exts: Extension[] = []
  const make = (tables: Row[][], dialect: string) => {
    const g = gritql({ adapters: { [dialect]: fixtureAdapter(tables, dialect) } })
    for (const e of exts) g.use(e)
    return g
  }

  const fn: any = async (query: string, variables: Record<string, unknown> = {}, dialect = 'pg') => {
    const compiled = await make([], dialect).compile(query, variables)
    const def = { sql: compiled.queries.map((q) => q.text), queries: compiled.queries, plan: compiled.plan }
    const prepared = await before(def)
    if (!prepared) return null
    if (!db) throw new Error("Provider isn't configured yet")
    const tables = await db(prepared)
    if (!tables) return null
    after(compiled.plan, tables)
    return make(tables, dialect).run(query, variables)
  }
  fn.beforeDbFetch = (f: Before) => ((before = f), fn)
  fn.dbFetch = (f: Db) => ((db = f), fn)
  fn.afterDbFetch = (f: typeof after) => ((after = f), fn)
  fn.use = (e: Extension) => (exts.push(e), fn)
  return fn
}
