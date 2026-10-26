/**
 * The plan model (SPEC §3) and the extension contract (SPEC §4).
 */
import type { Knex } from 'knex'
import type { ArgsSchema } from './types'

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type FilterExpr = Record<string, unknown>

export type JoinType =
  | 'join'
  | 'leftJoin'
  | 'rightJoin'
  | 'fullJoin'
  | 'innerJoin'
  | 'leftOuterJoin'
  | 'rightOuterJoin'
  | 'fullOuterJoin'

export const JOIN_TYPES: readonly JoinType[] = [
  'join',
  'leftJoin',
  'rightJoin',
  'fullJoin',
  'innerJoin',
  'leftOuterJoin',
  'rightOuterJoin',
  'fullOuterJoin',
]

export interface Join {
  type: JoinType
  table: string
  /** filter object whose `@col` values reference the joined table (left) and the fetch table (right) */
  on: FilterExpr
}

export interface DirectiveUse {
  name: string
  args: Record<string, unknown>
  /** per-occurrence, per-request scratch space shared by the directive's hooks */
  state: Record<string, unknown>
}

export type FetchKind = 'fetch' | 'with' | 'fetchPlain' | 'unionall'

export interface Fetch {
  alias: string | null
  kind: FetchKind
  /** table, `with` alias, or the tables of a unionall */
  source: string | string[]
  /** `filters:` (v3 object: `from`, `having`, `search`, `inherited` are keywords) plus legacy inline arguments */
  filters: FilterExpr | null
  /** `where:`: every top-level key is a column, including `from`, `having`, `search`, `inherited` */
  where: FilterExpr | null
  search: Record<string, string>
  joins: Join[]
  tree: Node[]
  directives: DirectiveUse[]
  emit: boolean
  /** every `$var` after defaults, for resolvers that need them */
  variables: Record<string, unknown>
  /** `having` predicates a fetch-level or root-metric `@filter` lowered to SQL; skipped when the fetch is a comparison target (SPEC §6.7) */
  loweredHaving?: FilterExpr
}

export type NodeKind = 'metric' | 'dimension'

export interface Node {
  /** output key: alias when given, else the field name */
  alias: string
  /** resolver name: the field name */
  name: string
  kind: NodeKind
  args: Record<string, unknown>
  children: Node[]
  directives: DirectiveUse[]
  emit: boolean
  /** output name → SQL column, for dimensions whose alias would shadow the source column they compute from (`ctx.out`) */
  sqlNames?: Record<string, string>
  /** metric only: a post-aggregation expression lowered from `@diff` / `@subtract` / `@divide` (SPEC §6.7) */
  lowered?: Lowered
  /** dimension only: `having` predicates `@filter` lowered to SQL (its own, or a child metric's); skipped in reference mode */
  loweredHaving?: FilterExpr
}

/**
 * `alias = f(this statement's column, B)` computed on an outer layer around the grouped statement.
 * B is the same-named column of another fetch joined on the grain (`ref`), or a sibling column (`byField`).
 */
export interface Lowered {
  op: 'diff' | 'subtract' | 'divide'
  ref?: { alias: string | null; column: string }
  byField?: string
}

export interface Plan {
  fetches: Fetch[]
  variables: Record<string, unknown>
  /** aliases of emitted fetches dropped by @include/@skip (compat output keeps them as `{}`) */
  removed?: string[]
}

// ---------------------------------------------------------------------------
// Rows and output
// ---------------------------------------------------------------------------

export type Row = Record<string, unknown>
export type Output = any

// ---------------------------------------------------------------------------
// Physical queries (SPEC §6.2)
// ---------------------------------------------------------------------------

export interface Physical {
  id: string
  fetch: Fetch
  /** dimension nodes from the fetch root to the grain, root first */
  grain: Node[]
  /** metric nodes selected at this grain */
  metrics: Node[]
  /** `with` aliases this statement depends on, dependency order */
  ctes: string[]
  /** output key path of the grain's parent object */
  path: string[]
}

// ---------------------------------------------------------------------------
// Adapter (SPEC §5)
// ---------------------------------------------------------------------------

export interface SqlReq {
  sql: string
  params: unknown[]
}

export interface Adapter<Req = SqlReq> {
  name: string
  /** knex client name used for printing: pg, mysql2, snowflake, clickhouse (plugin) ... */
  dialect: string
  /** builder used for printing; created from `dialect` when absent */
  knex?: Knex
  compile?(qb: Knex.QueryBuilder, physical: Physical): Req
  execute(req: Req): Promise<Row[]>
}

// ---------------------------------------------------------------------------
// Resolver contract (SPEC §4)
// ---------------------------------------------------------------------------

export interface SqlParts {
  select?: Knex.Raw[]
  /** columns computed over the filtered source before aggregation (window functions) */
  pre?: Knex.Raw[]
  groupBy?: Knex.Raw[]
  having?: Knex.Raw[]
}

export type SqlResult = Knex.Raw | Knex.Raw[] | SqlParts
export type SqlFn = (node: Node, ctx: Ctx) => SqlResult

export interface Cell {
  value: unknown
  row: Row
  /** dimension values of the row by output key; directives may return a rewritten copy */
  keys: Record<string, unknown>
  node: Node
  path: string[]
  index: number
}

export interface CellResult {
  value?: unknown
  skip?: boolean
  skipAll?: boolean
  keys?: Record<string, unknown>
  set?: Record<string, unknown>
}

export interface Resolver<A = Record<string, any>> {
  args?: ArgsSchema
  strict?: boolean
  columns?(node: Node, ctx: Ctx): string[]
  /** metric whose expression also joins GROUP BY (`unique`) */
  group?: boolean
  /** metric that turns the statement into SELECT DISTINCT */
  distinct?: boolean
  /** resolver that must see every grain's statement, not only its own (two-level aggregations) */
  plan?(target: Node | Fetch | undefined, ctx: Ctx): void | Promise<void>
  sql?: SqlFn | Partial<Record<string, SqlFn>>
  query?(qb: Knex.QueryBuilder, physical: Physical, ctx: Ctx): Knex.QueryBuilder
  execute?(req: SqlReq, next: (req: SqlReq) => Promise<Row[]>, ctx: Ctx): Promise<Row[]>
  result?(cell: Cell, ctx: Ctx): CellResult | void
  /** phantom for the inferred argument type */
  __args?: A
}

export interface Extension {
  metrics?: Record<string, Resolver>
  dimensions?: Record<string, Resolver>
  directives?: Record<string, Resolver>
  middleware?: Resolver[]
  adapters?: Record<string, Adapter>
}

export interface Ctx {
  plan: Plan
  fetch?: Fetch
  node?: Node
  /** the directive's own arguments when running a directive hook */
  args: Record<string, unknown>
  /** per directive occurrence */
  state: Record<string, unknown>
  /** value handed from one plan-stage directive to the next on the same node (`@compare` → `@include`) */
  chain: { value?: unknown }
  /** plan stage: drop the node or fetch the directive is attached to */
  remove(): void
  variables: Record<string, unknown>
  /** instance `strict` option: legacy string forms and loose arguments are rejected when true */
  strict: boolean
  adapter: Adapter
  dialect: string
  knex: Knex
  physical?: Physical
  /** output-key path of the node the hook runs for */
  path: string[]
  /** qualified column name honoring `@name` and `from` */
  col(name: string, from?: string): string
  /**
   * SQL alias for output column `name` of an expression dimension computed from `source`:
   * `name` itself, or an internal `__dN` when it would shadow `source` (`date: groupBy(field: date)`),
   * so GROUP BY can repeat the expression on every dialect. The assembler maps it back to `name`.
   */
  out(name: string, source: string): string
  /** compile a filter object to a raw predicate for the current statement */
  where(filter: FilterExpr): Knex.Raw
  baseline?: Output
  output?: Output
  /** read baseline by dimension key values */
  at(fetchAlias: string | null, keys: Record<string, unknown>, path: string[]): unknown
  /** every value at `path` inside a tree (result stage; used by @indexed) */
  values?(tree: unknown, fetchAlias: string | null, path: string[]): unknown[]
  timings: Record<string, number>
}
