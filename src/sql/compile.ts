/**
 * Physical → knex QueryBuilder (SPEC §6.3–§6.6).
 *
 * Resolvers hand back expressions; this module owns SELECT, FROM, JOIN,
 * WHERE, GROUP BY, HAVING, ORDER BY, LIMIT/OFFSET, CTEs and the derived
 * table that hosts `pre` (window) expressions.
 */
import type { Knex } from 'knex'
import { GritqlError, toGritqlError } from '../errors'
import type { Ctx, Fetch, Join, Node, Physical, Plan, Resolver, SqlParts } from '../model'
import type { Registry } from '../registry'
import { checkPropTypes, PropTypes } from '../types'
import { buildFilter, Frag } from './filters'

export interface CompileEnv {
  knex: Knex
  dialect: string
  registry: Registry
  plan: Plan
  physicals: Physical[]
  makeCtx(physical: Physical, node?: Node): Ctx
}

export const DIMENSION_COMMON_ARGS = {
  sort_desc: PropTypes.string,
  sort_asc: PropTypes.string,
  sort: PropTypes.oneOf(['asc', 'desc']),
  field: PropTypes.string,
  limit: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  offset: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  type: PropTypes.oneOf(['Array', 'Map']),
  from: PropTypes.string,
  having: PropTypes.object,
}

export const METRIC_COMMON_ARGS = {
  type: PropTypes.oneOf(['Array', 'Map']),
  sort: PropTypes.oneOf(['asc', 'desc']),
  limit: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  offset: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  from: PropTypes.string,
}

const JOIN_KEYWORDS: Record<Join['type'], string> = {
  join: 'JOIN',
  leftJoin: 'LEFT JOIN',
  rightJoin: 'RIGHT JOIN',
  fullJoin: 'FULL JOIN',
  innerJoin: 'INNER JOIN',
  leftOuterJoin: 'LEFT OUTER JOIN',
  rightOuterJoin: 'RIGHT OUTER JOIN',
  fullOuterJoin: 'FULL OUTER JOIN',
}

/** qualified column name: `@x` → `table.x`; `from` → `from.x`; else bare */
export function columnName(name: string, table: string, from?: string): string {
  if (typeof name !== 'string') return name
  if (from === '@') from = table
  if (name.startsWith('@')) return `${from ?? table}.${name.slice(1)}`
  if (from) return `${from}.${name}`
  return name
}

export function tableOf(fetch: Fetch): string {
  return Array.isArray(fetch.source) ? `unionall_${fetch.source.join('_')}` : fetch.source
}

export function validateArgs(resolver: Resolver, node: Node, common: Record<string, any>): void {
  const spec = { ...common, ...(resolver.args ?? {}) }
  try {
    checkPropTypes(spec, node.args, 'arguments', node.name)
  } catch (e) {
    throw toGritqlError('ARGS', e)
  }
  if (resolver.args && resolver.strict) {
    for (const k of Object.keys(node.args)) {
      if (!(k in spec)) throw new GritqlError('ARGS', `Unknown argument \`${k}\` for \`${node.name}\``)
    }
  }
}

/** Runs a resolver's `sql` for the active dialect and normalizes the result. */
export function resolveSql(resolver: Resolver, node: Node, ctx: Ctx): SqlParts {
  const sql = resolver.sql
  if (!sql) return {}
  const fn = typeof sql === 'function' ? sql : sql[ctx.dialect] ?? sql['*']
  if (!fn) {
    throw new GritqlError('DIALECT', `${ctx.dialect} provider doesn't support ${node.name} ${node.kind}`)
  }
  const res = fn(node, ctx)
  if (Array.isArray(res)) return { select: res }
  if (res && typeof (res as any).toSQL === 'function') return { select: [res as Knex.Raw] }
  return (res ?? {}) as SqlParts
}

function dedupe(raws: Knex.Raw[]): Knex.Raw[] {
  if (raws.length < 2) return raws
  const seen = new Set<string>()
  return raws.filter((r) => {
    const text = r.toQuery()
    if (seen.has(text)) return false
    seen.add(text)
    return true
  })
}

function raw(knex: Knex, frag: Frag): Knex.Raw {
  return knex.raw(frag.sql, frag.bindings)
}

export function compilePhysical(physical: Physical, env: CompileEnv, asCte = false): Knex.QueryBuilder {
  const { knex, registry } = env
  const { fetch } = physical
  const table = tableOf(fetch)
  const filterCtx = { table, joins: fetch.joins.map((j) => j.table), dialect: env.dialect }

  // --- WHERE / HAVING (compiled first so filter errors surface before resolver errors) ---
  const where = buildFilter(fetch.filters, filterCtx)
  // search terms given as the `search` fetch argument (those inside `filters` are compiled with the filters)
  const inFilters = (fetch.filters?.search as Record<string, unknown> | undefined) ?? {}
  const argSearch = Object.fromEntries(Object.entries(fetch.search).filter(([k]) => !(k in inFilters)))
  const searchOnly = Object.keys(argSearch).length ? buildFilter({ search: argSearch }, filterCtx) : null
  const having = fetch.filters?.having ? buildFilter(fetch.filters.having as any, { ...filterCtx, qualify: false }) : null


  // --- collect parts from resolvers -------------------------------------
  const selects: Knex.Raw[] = []
  const groupBys: Knex.Raw[] = []
  const pre: Knex.Raw[] = []
  const havings: Knex.Raw[] = []
  const orderBys: { by: string; dir: 'asc' | 'desc' }[] = []
  let distinct = false
  let limit: number | undefined
  let offset: number | undefined
  const nestedLimits: Node[] = []
  const queryHooks: { resolver: Resolver; node: Node }[] = []
  /** group expressions per grain dimension, for the per-parent window partition */
  const grainGroups: Knex.Raw[][] = []

  physical.grain.forEach((dim, i) => {
    const resolver = registry.dimension(dim.name)
    validateArgs(resolver, dim, DIMENSION_COMMON_ARGS)
    const ctx = env.makeCtx(physical, dim)
    const parts = resolveSql(resolver, dim, ctx)
    selects.push(...(parts.select ?? []))
    groupBys.push(...(parts.groupBy ?? []))
    grainGroups.push(parts.groupBy ?? [])
    pre.push(...(parts.pre ?? []))
    havings.push(...(parts.having ?? []))
    if (resolver.query) queryHooks.push({ resolver, node: dim })

    const a = dim.args
    if (a.sort_desc) orderBys.push({ by: columnName(a.sort_desc as string, table), dir: 'desc' })
    if (a.sort_asc) orderBys.push({ by: columnName(a.sort_asc as string, table), dir: 'asc' })
    if (a.sort && a.field) orderBys.push({ by: columnName(a.field as string, table), dir: a.sort as 'asc' | 'desc' })
    if (a.having) {
      const h = buildFilter(a.having as any, { ...filterCtx, qualify: false })
      if (h.sql) havings.push(raw(knex, h))
    }
    if (a.limit !== undefined || a.offset !== undefined) {
      if (i === 0 || fetch.kind === 'fetchPlain' || fetch.kind === 'with') {
        if (a.limit !== undefined) limit = Number(a.limit)
        if (a.offset !== undefined) offset = Number(a.offset)
      } else {
        nestedLimits.push(dim)
      }
    }
  })

  for (const metric of physical.metrics) {
    const resolver = registry.metric(metric.name)
    validateArgs(resolver, metric, METRIC_COMMON_ARGS)
    const ctx = env.makeCtx(physical, metric)
    const parts = resolveSql(resolver, metric, ctx)
    selects.push(...(parts.select ?? []))
    groupBys.push(...(parts.groupBy ?? []))
    pre.push(...(parts.pre ?? []))
    havings.push(...(parts.having ?? []))
    if (resolver.group) groupBys.push(...(parts.select ?? []).map(() => knex.raw('??', [metric.alias])))
    if (resolver.distinct) distinct = true
    if (resolver.query) queryHooks.push({ resolver, node: metric })
    const a = metric.args
    if (a.sort) orderBys.push({ by: metric.alias, dir: a.sort as 'asc' | 'desc' })
    if (a.limit !== undefined) limit = Number(a.limit)
    if (a.offset !== undefined) offset = Number(a.offset)
  }

  let source: Knex.QueryBuilder | string
  if (Array.isArray(fetch.source)) {
    const [first, ...rest] = fetch.source
    let union = knex.select('*').from(first)
    if (rest.length) union = union.unionAll(rest.map((t) => knex.select('*').from(t)))
    source = union.as(table)
  } else {
    source = fetch.source
  }

  let qb: Knex.QueryBuilder
  const applyJoinsAndWhere = (q: Knex.QueryBuilder) => {
    for (const join of fetch.joins) {
      const on = buildFilter(join.on, { table, joins: filterCtx.joins, dialect: env.dialect, from: join.table, fieldRefs: true })
      q = q.joinRaw(`${JOIN_KEYWORDS[join.type]} ?? ON ${on.sql}`, [join.table, ...on.bindings] as Knex.Value[])
    }
    if (where.sql) q = q.where(raw(knex, where))
    if (searchOnly?.sql) q = q.where(raw(knex, searchOnly))
    return q
  }

  if (pre.length) {
    const inner = applyJoinsAndWhere(knex.select('*').select(...pre).from(source as any))
    qb = knex.from(inner.as(table))
  } else {
    qb = applyJoinsAndWhere(knex.from(source as any))
  }

  // --- select / group / having / order ----------------------------------
  // a dimension and a metric may name the same column (`brand { brand }`): emit each expression once
  const uniqueSelects = dedupe(selects)
  const uniqueGroupBys = dedupe(groupBys)
  if (distinct) qb = qb.distinct(...uniqueSelects)
  else qb = qb.select(...uniqueSelects)
  if (uniqueGroupBys.length) qb = qb.groupBy(uniqueGroupBys as any)
  for (const h of havings) qb = qb.having(h)
  if (having?.sql) qb = qb.having(raw(knex, having))

  // --- order / limit / offset -------------------------------------------
  if (nestedLimits.length) {
    // per-parent limit: rank the grouped rows inside each outer-dimension partition, then keep a window of ranks.
    // Window and ORDER BY see output columns only, so the grouped statement is wrapped first; one layer per bounded dimension.
    const orderCols = orderBys.map((o) => ({ by: o.by.slice(o.by.lastIndexOf('.') + 1), dir: o.dir }))
    const outputs = outputAliases(physical, registry, env)
    for (const dim of nestedLimits) {
      const idx = physical.grain.indexOf(dim)
      const partition = physical.grain.slice(0, idx).flatMap((d) => dimColumns(d, physical, env))
      const over =
        (partition.length ? `partition by ${partition.map(() => '??').join(', ')}` : '') +
        (orderCols.length ? `${partition.length ? ' ' : ''}order by ${orderCols.map((o) => `?? ${o.dir}`).join(', ')}` : '')
      const rn = knex.raw(`row_number() over (${over}) as ??`, [...partition, ...orderCols.map((o) => o.by), '__rn'])
      const ranked = knex.select('*').select(rn).from(qb.as('__g'))
      let outer = knex.select(outputs).from(ranked.as('__r'))
      const lo = Number(dim.args.offset ?? 0)
      if (lo > 0) outer = outer.where('__rn', '>', lo)
      if (dim.args.limit !== undefined) outer = outer.where('__rn', '<=', lo + Number(dim.args.limit))
      qb = outer
    }
    for (const o of orderCols) qb = qb.orderBy(o.by, o.dir)
    if (limit !== undefined) qb = qb.limit(limit)
    if (offset !== undefined) qb = qb.offset(offset)
  } else {
    for (const o of orderBys) qb = qb.orderBy(o.by, o.dir)
    if (limit !== undefined) qb = qb.limit(limit)
    if (offset !== undefined) qb = qb.offset(offset)
  }

  // --- escape hatch -------------------------------------------------------
  for (const { resolver, node } of queryHooks) qb = resolver.query!(qb, physical, env.makeCtx(physical, node))
  for (const mw of registry.middleware) if (mw.query) qb = mw.query(qb, physical, env.makeCtx(physical))

  // --- CTEs (the outer statement lists every transitive dependency in order; bodies attach none) ---
  if (!asCte) {
    for (const alias of physical.ctes) {
      const cte = env.physicals.find((p) => p.fetch.kind === 'with' && p.fetch.alias === alias)
      if (!cte) throw new GritqlError('PLAN', `with "${alias}" is referenced but not defined`)
      qb = qb.with(alias, compilePhysical(cte, env, true))
    }
  }

  return qb
}

function dimColumns(dim: Node, physical: Physical, env: CompileEnv): string[] {
  const r = env.registry.dimension(dim.name)
  return r.columns ? r.columns(dim, env.makeCtx(physical, dim)) : [dim.alias]
}

/** Every output column alias of a statement (dimension columns, then metric columns). */
export function outputAliases(physical: Physical, registry: Registry, env: CompileEnv): string[] {
  const out: string[] = []
  for (const dim of physical.grain) {
    const r = registry.dimension(dim.name)
    out.push(...(r.columns ? r.columns(dim, env.makeCtx(physical, dim)) : [dim.alias]))
  }
  for (const m of physical.metrics) {
    const r = registry.metric(m.name)
    out.push(...(r.columns ? r.columns(m, env.makeCtx(physical, m)) : [m.alias]))
  }
  return out
}
