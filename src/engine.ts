/**
 * The engine: parse → plan → lower → sql → execute → assemble (SPEC §1).
 */
import knexFactory, { Knex } from 'knex'
import { Assembler, RowSet } from './assemble'
import { dimensions } from './builtins/dimensions'
import { directives as builtinDirectives } from './builtins/directives'
import { metrics } from './builtins/metrics'
import { GritqlError, toGritqlError } from './errors'
import { lower } from './lower'
import type { Adapter, Ctx, DirectiveUse, Extension, Fetch, FilterExpr, Node, Output, Physical, Plan, Resolver, Row, SqlReq } from './model'
import { parseDocument } from './parse'
import { buildPlan } from './plan/build'
import { Registry } from './registry'
import { compilePhysical, CompileEnv, tableOf, validateArgs, columnName } from './sql/compile'
import { buildFilter } from './sql/filters'

export interface GritqlOptions {
  adapters: Record<string, Adapter>
  /** adapter used when `run`/`compile` name none; default: the first registered */
  default?: string
  /**
   * `true` (default): unknown fetch arguments, undeclared `$variables` and the v3 string
   * grammars (`by: "@a:@b"`, `"sum|field"`, `field_gt:`, `"date:format:..."`) are errors.
   * `false`: v3 behaviour for old documents.
   */
  strict?: boolean
  /**
   * `'records'` (default): a dimension is an array of records carrying its own value.
   * `'keyed'`: a dimension is an object keyed by its value (v3 shape). `type: Array`/`type: Map` on a dimension overrides either.
   */
  output?: 'records' | 'keyed'
}

export interface RunOptions {
  adapter?: string
}

export interface CompiledQuery {
  physical: Physical
  /** statement with driver placeholders */
  sql: string
  params: unknown[]
  /** statement with inlined values, for logs and snapshots */
  text: string
  /** SQL column → output name, for the columns that differ (`__d0` → `date`); empty when none do */
  columns: Record<string, string>
}

export interface Compiled {
  plan: Plan
  physicals: Physical[]
  queries: CompiledQuery[]
  timings: Record<string, number>
}

export const builtins: Extension = { metrics, dimensions, directives: builtinDirectives }

export class Gritql {
  readonly registry = new Registry()
  private knexByDialect = new Map<string, Knex>()

  readonly strict: boolean

  constructor(private options: GritqlOptions) {
    this.strict = options.strict !== false
    this.registry.use(builtins)
    this.registry.use({ adapters: options.adapters })
  }

  use(ext: Extension): this {
    this.registry.use(ext)
    return this
  }

  adapter(name?: string): Adapter {
    const key = name ?? this.options.default ?? this.registry.adapters.keys().next().value
    const adapter = key ? this.registry.adapters.get(key) : undefined
    if (!adapter) throw new GritqlError('PLAN', `Unknown adapter "${name ?? key}"`)
    return adapter
  }

  private knexFor(adapter: Adapter): Knex {
    if (adapter.knex) return adapter.knex
    let k = this.knexByDialect.get(adapter.dialect)
    if (!k) {
      // dialects knex does not ship (clickhouse, snowflake) print with the pg grammar unless the adapter brings its own builder
      try {
        k = knexFactory({ client: adapter.dialect })
      } catch {
        k = knexFactory({ client: 'pg' })
      }
      this.knexByDialect.set(adapter.dialect, k)
    }
    return k
  }

  /** steps 1–4: no adapter connection is touched */
  async compile(text: string, variables: Record<string, unknown> = {}, opts: RunOptions = {}): Promise<Compiled> {
    const adapter = this.adapter(opts.adapter)
    const knex = this.knexFor(adapter)
    const timings: Record<string, number> = {}
    const t0 = now()
    const doc = parseDocument(text)
    timings.parse = now() - t0

    const t1 = now()
    const plan = buildPlan(doc, variables, { strict: this.strict })
    const base = { plan, adapter, knex, dialect: adapter.dialect, variables: plan.variables, timings, strict: this.strict }
    await this.planStage(plan, base)
    timings.plan = now() - t1

    const t2 = now()
    const physicals = lower(plan)
    timings.lower = now() - t2

    const t3 = now()
    const env: CompileEnv = {
      knex,
      dialect: adapter.dialect,
      registry: this.registry,
      plan,
      physicals,
      makeCtx: (physical, node) => this.makeCtx(base, physical, node),
    }
    const queries: CompiledQuery[] = []
    for (const physical of physicals) {
      if (physical.fetch.kind === 'with') continue
      let qb: Knex.QueryBuilder
      try {
        qb = compilePhysical(physical, env)
      } catch (e) {
        throw withPath(toGritqlError('PLAN', e), [physical.fetch.alias ?? physical.fetch.kind, ...physical.path])
      }
      const req = adapter.compile ? adapter.compile(qb, physical) : native(qb)
      const columns: Record<string, string> = {}
      for (const dim of physical.grain) for (const [name, col] of Object.entries(dim.sqlNames ?? {})) columns[col] = name
      queries.push({ physical, sql: req.sql, params: req.params, text: qb.toString(), columns })
    }
    timings.sql = now() - t3
    return { plan, physicals, queries, timings }
  }

  /** all six steps */
  async run(text: string, variables: Record<string, unknown> = {}, opts: RunOptions = {}): Promise<Output> {
    const adapter = this.adapter(opts.adapter)
    const compiled = await this.compile(text, variables, opts)
    const { plan, queries, timings } = compiled
    const knex = this.knexFor(adapter)
    const base = { plan, adapter, knex, dialect: adapter.dialect, variables: plan.variables, timings, strict: this.strict }

    const t4 = now()
    const rowSets: RowSet[] = await Promise.all(
      queries.map(async (q) => {
        const ctx = this.makeCtx(base, q.physical)
        const rows = await this.execute({ sql: q.sql, params: q.params }, adapter, ctx)
        return { physical: q.physical, rows }
      }),
    )
    timings.execute = now() - t4

    const t5 = now()
    const assembler = new Assembler({
      plan,
      registry: this.registry,
      keyed: this.options.output === 'keyed',
      columns: (node, physical) => this.columns(node, physical, base),
      names: (node, physical) => this.names(node, physical, base),
      makeCtx: (physical, node, use, over) => this.makeCtx(base, physical, node, use, over),
    })
    let output: Output
    try {
      output = assembler.assemble(rowSets)
    } catch (e) {
      throw toGritqlError('RESULT', e)
    }
    timings.assemble = now() - t5
    return output
  }

  // --- stages --------------------------------------------------------------

  private async planStage(plan: Plan, base: BaseCtx): Promise<void> {
    for (const mw of this.registry.middleware) {
      if (!mw.plan) continue
      try {
        await mw.plan(undefined, this.makeCtx(base))
      } catch (e) {
        throw toGritqlError('PLAN', e)
      }
    }
    const kept: Fetch[] = []
    for (const fetch of plan.fetches) {
      if (!(await this.runDirectives(fetch, fetch.directives, base, fetch, undefined, []))) continue
      fetch.tree = await this.planNodes(fetch.tree, base, fetch, [])
      kept.push(fetch)
    }
    plan.fetches = kept
    const withAliases = new Map<string, number>()
    for (const f of plan.fetches) {
      if (f.kind !== 'with' || !f.alias) continue
      withAliases.set(f.alias, (withAliases.get(f.alias) ?? 0) + 1)
      if (withAliases.get(f.alias)! > 1) throw new GritqlError('PLAN', `with "${f.alias}" is defined more than once`)
    }
  }

  private async planNodes(nodes: Node[], base: BaseCtx, fetch: Fetch, path: string[]): Promise<Node[]> {
    const kept: Node[] = []
    for (const node of nodes) {
      const p = [...path, node.alias]
      if (!(await this.runDirectives(node, node.directives, base, fetch, node, p))) continue
      const resolver = node.kind === 'metric' ? this.registry.metric(node.name) : this.registry.dimension(node.name)
      if (resolver.plan) {
        let removed = false
        try {
          await resolver.plan(node, this.makeCtx(base, undefined, node, undefined, { fetch, path: p, remove: () => (removed = true) }))
        } catch (e) {
          throw toGritqlError('PLAN', e, p)
        }
        if (removed) continue
      }
      if (node.children.length) node.children = await this.planNodes(node.children, base, fetch, p)
      kept.push(node)
    }
    return kept
  }

  /** runs the plan hooks of a node's or fetch's directives; false when one removed the target */
  private async runDirectives(target: Node | Fetch, uses: DirectiveUse[], base: BaseCtx, fetch: Fetch, node: Node | undefined, path: string[]): Promise<boolean> {
    const chain: { value?: unknown } = {}
    for (const use of uses) {
      const resolver = this.registry.directives.get(use.name)
      if (!resolver) throw new GritqlError('UNKNOWN_RESOLVER', `Unknown directive @${use.name}`, { path })
      if (resolver.args) validateArgs(resolver, { ...(node ?? ({} as Node)), name: `@${use.name}`, args: use.args } as Node, {})
      if (!resolver.plan) continue
      let removed = false
      const ctx = this.makeCtx(base, undefined, node, use, { fetch, path, chain, remove: () => (removed = true) })
      try {
        await resolver.plan(target, ctx)
      } catch (e) {
        throw toGritqlError('PLAN', e, path)
      }
      if (removed) return false
    }
    return true
  }

  private async execute(req: SqlReq, adapter: Adapter, ctx: Ctx): Promise<Row[]> {
    const chain = this.registry.middleware.filter((m) => m.execute)
    const call = (i: number, r: SqlReq): Promise<Row[]> => {
      if (i === chain.length) return adapter.execute(r)
      return chain[i].execute!(r, (next) => call(i + 1, next), ctx)
    }
    try {
      return await call(0, req)
    } catch (e) {
      throw toGritqlError('EXECUTE', e, [ctx.fetch?.alias ?? ctx.fetch?.kind ?? '', ...(ctx.physical?.path ?? [])])
    }
  }

  // --- helpers ---------------------------------------------------------------

  /** output names of a node's columns */
  private names(node: Node, physical: Physical, base: BaseCtx): string[] {
    const resolver = node.kind === 'metric' ? this.registry.metric(node.name) : this.registry.dimension(node.name)
    return resolver.columns ? resolver.columns(node, this.makeCtx(base, physical, node)) : [node.alias]
  }

  /** SQL columns of a node, in the order of its output names */
  private columns(node: Node, physical: Physical, base: BaseCtx): string[] {
    const names = this.names(node, physical, base)
    return node.sqlNames ? names.map((n) => node.sqlNames![n] ?? n) : names
  }

  private makeCtx(base: BaseCtx, physical?: Physical, node?: Node, use?: DirectiveUse, over: Partial<Ctx> = {}): Ctx {
    const fetch = over.fetch ?? physical?.fetch
    const table = fetch ? tableOf(fetch) : ''
    const knex = base.knex
    const ctx: Ctx = {
      plan: base.plan,
      fetch,
      node,
      args: use?.args ?? node?.args ?? {},
      state: use?.state ?? {},
      chain: {},
      remove: () => {
        throw new GritqlError('PLAN', 'remove() is only available in plan hooks')
      },
      variables: base.variables,
      strict: base.strict,
      adapter: base.adapter,
      dialect: base.dialect,
      knex,
      physical,
      path: physical?.grain ? physical.grain.map((d) => d.alias) : [],
      col: (name, from) => columnName(name, table, from),
      out: (name, source) => {
        const bare = source.replace(/^@/, '').slice(source.lastIndexOf('.') + 1)
        if (bare !== name || !node) return name
        const i = physical?.grain.indexOf(node) ?? -1
        const internal = `__d${i < 0 ? 0 : i}`
        ;(node.sqlNames ??= {})[name] = internal
        return internal
      },
      where: (filter: FilterExpr) => {
        const frag = buildFilter(filter, { table, joins: fetch?.joins.map((j) => j.table) ?? [], dialect: base.dialect, search: fetch?.search ?? {} })
        return knex.raw(frag.sql, frag.bindings)
      },
      at: () => undefined,
      timings: base.timings,
      ...over,
    }
    return ctx
  }
}

interface BaseCtx {
  plan: Plan
  adapter: Adapter
  knex: Knex
  dialect: string
  variables: Record<string, unknown>
  timings: Record<string, number>
  strict: boolean
}

function withPath(e: GritqlError, path: string[]): GritqlError {
  if (!e.path) e.path = path
  return e
}

function native(qb: Knex.QueryBuilder): SqlReq {
  const q = qb.toSQL().toNative()
  return { sql: q.sql, params: q.bindings as unknown[] }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export function gritql(options: GritqlOptions): Gritql {
  return new Gritql(options)
}

export type { Resolver }
