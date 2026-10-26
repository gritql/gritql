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

/**
 * @param asCte      body of a WITH: attaches no CTE list of its own
 * @param reference  the statement another fetch compares against: its grouped values, without its own arithmetic layer
 *                   (v3 compared baselines, so mutual and self references are well defined)
 */
export function compilePhysical(physical: Physical, env: CompileEnv, asCte = false, reference = false): Knex.QueryBuilder {
  const { knex, registry } = env
  const { fetch } = physical
  const table = tableOf(fetch)
  const filterCtx = { table, joins: fetch.joins.map((j) => j.table), dialect: env.dialect }

  // --- WHERE / HAVING (compiled first so filter errors surface before resolver errors) ---
  const where = buildFilter(fetch.filters, filterCtx)
  const whereArg = fetch.where ? buildFilter(fetch.where, { ...filterCtx, where: true }) : null
  // search terms given as the `search` fetch argument (those inside `filters` are compiled with the filters)
  const inFilters = (fetch.filters?.search as Record<string, unknown> | undefined) ?? {}
  const argSearch = Object.fromEntries(Object.entries(fetch.search).filter(([k]) => !(k in inFilters)))
  const searchOnly = Object.keys(argSearch).length ? buildFilter({ search: argSearch }, filterCtx) : null
  /** `having` objects on output names, compiled once the internal names are known; `at` = grain index of the dimension carrying it */
  const havingObjects: { expr: unknown; at?: number }[] = []

  // --- collect parts from resolvers -------------------------------------
  const selects: Knex.Raw[] = []
  const groupBys: Knex.Raw[] = []
  const pre: Knex.Raw[] = []
  /** HAVING predicates written by resolvers (real aggregate expressions) */
  const resolverHavings: Knex.Raw[] = []
  /** predicates on output names: WHERE on the `__h` derived table, since PostgreSQL rejects aliases in HAVING */
  const havingPredicates: Knex.Raw[] = []
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
    resolverHavings.push(...(parts.having ?? []))
    if (resolver.query) queryHooks.push({ resolver, node: dim })

    const a = dim.args
    if (a.sort_desc) orderBys.push({ by: columnName(a.sort_desc as string, table), dir: 'desc' })
    if (a.sort_asc) orderBys.push({ by: columnName(a.sort_asc as string, table), dir: 'asc' })
    if (a.sort && a.field) orderBys.push({ by: columnName(a.field as string, table), dir: a.sort as 'asc' | 'desc' })
    if (a.having) havingObjects.push({ expr: a.having, at: i })
    // a comparison target is read as v3 read baselines: before its @filter ran
    if (dim.loweredHaving && !reference) havingObjects.push({ expr: dim.loweredHaving, at: i })
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
    resolverHavings.push(...(parts.having ?? []))
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
    if (whereArg?.sql) q = q.where(raw(knex, whereArg))
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
  for (const h of resolverHavings) qb = qb.having(h)
  // resolver query hooks rewrite the grouped statement (aggrAverage, weightAvg); the layers below wrap the result
  for (const { resolver, node } of queryHooks) qb = resolver.query!(qb, physical, env.makeCtx(physical, node))

  // an output name that got an internal SQL alias (`date: groupBy(field: date)` → `__d0`) is sorted and filtered by that alias
  const sqlNames: Record<string, string> = Object.assign({}, ...physical.grain.map((d) => d.sqlNames ?? {}))
  const sqlName = (f: string) => sqlNames[f] ?? f
  for (const o of orderBys) {
    const bare = o.by.slice(o.by.lastIndexOf('.') + 1)
    if (sqlNames[bare]) o.by = sqlNames[bare]
  }
  // wrapped statements see output columns only
  const orderCols = orderBys.map((o) => ({ by: o.by.slice(o.by.lastIndexOf('.') + 1), dir: o.dir }))

  const outputs = outputAliases(physical, registry, env)
  const lowered = reference ? [] : physical.metrics.filter((m) => m.lowered)
  let wrapped = false

  if (fetch.filters?.having) havingObjects.push({ expr: fetch.filters.having })
  if (fetch.loweredHaving && !reference) havingObjects.push({ expr: fetch.loweredHaving })
  for (const { expr, at } of havingObjects) {
    const fields = fieldsOf(expr)
    if (fields.every((f) => outputs.includes(sqlName(f)))) {
      const f = buildFilter(renameFields(expr, sqlNames) as any, { ...filterCtx, qualify: false })
      if (f.sql) havingPredicates.push(raw(knex, f))
      continue
    }
    // the predicate names a column this grain does not select (`country @filter(where: { total: ... }) { total device { v } }`):
    // keep the parents that pass, through a semi-join on the statement of the dimension that carries the predicate
    const parents = env.physicals.filter(
      (p) =>
        p.fetch === fetch &&
        p.grain.length >= 1 &&
        p.grain.length < physical.grain.length &&
        (at === undefined || p.grain.length === at + 1) &&
        p.grain.every((d, k) => d === physical.grain[k]) &&
        fields.every((f) => outputAliases(p, registry, env).includes(sqlName(f))),
    )
    const parent = parents[parents.length - 1]
    if (!parent) {
      const owner = at === undefined ? `having on ${fetch.alias ?? fetch.kind}` : `having on '${physical.grain[at].alias}'`
      const missing = fields.find((f) => !outputs.includes(sqlName(f)))
      throw new GritqlError('PLAN', `${owner} names '${missing}', which no statement at that level selects`, { path: [fetch.alias ?? fetch.kind, ...physical.path] })
    }
    const cols = parent.grain.flatMap((d) => dimColumns(d, parent, env))
    const survivors = knex.select(cols).from(compilePhysical(parent, env, true).as('__p'))
    const list = cols.map(() => '??').join(', ')
    havingPredicates.push(knex.raw(`${cols.length > 1 ? `(${list})` : list} in ?`, [...cols, survivors]))
  }

  // --- lowered arithmetic (SPEC §6.7): directly over the grouped rows, so having, ranking and ORDER BY see the computed columns ---
  if (lowered.length) {
    qb = arithmeticLayer(qb, physical, lowered, outputs, env)
    wrapped = true
  }

  // having on output aliases: WHERE on a derived table (PostgreSQL rejects aliases in HAVING, and after the
  // arithmetic join a bare alias would be ambiguous)
  if (havingPredicates.length) {
    qb = knex.select(outputs).from(qb.as('__h'))
    for (const h of havingPredicates) qb = qb.where(h)
    wrapped = true
  }

  if (nestedLimits.length) {
    // per-parent limit: rank the grouped rows inside each outer-dimension partition, then keep a window of ranks.
    // Window and ORDER BY see output columns only, so the grouped statement is wrapped first; one layer per bounded dimension.
    wrapped = true
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
  }

  // --- order / limit / offset -------------------------------------------
  for (const o of wrapped ? orderCols : orderBys) qb = qb.orderBy(o.by, o.dir)
  if (limit !== undefined) qb = qb.limit(limit)
  if (offset !== undefined) qb = qb.offset(offset)

  // a with() is read by name, so its columns carry the output names: an internal name is aliased back on a wrapper
  if (fetch.kind === 'with' && Object.keys(sqlNames).length) {
    const inverse = Object.fromEntries(Object.entries(sqlNames).map(([n, s]) => [s, n]))
    qb = knex.select(outputs.map((c) => (inverse[c] ? knex.raw('?? as ??', [c, inverse[c]]) : c)) as any).from(qb.as('__w'))
  }

  // --- escape hatch -------------------------------------------------------
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

const CUR = '__cur'

const LOGICAL = new Set(['and', 'or', 'nor'])
/** output names a `having` object refers to */
function fieldsOf(expr: unknown, out: string[] = []): string[] {
  if (!expr || typeof expr !== 'object' || Array.isArray(expr)) return out
  for (const [k, v] of Object.entries(expr as Record<string, unknown>)) {
    if (LOGICAL.has(k) && Array.isArray(v)) v.forEach((x) => fieldsOf(x, out))
    else if (k === 'not') fieldsOf(v, out)
    else if (!out.includes(k)) out.push(k)
  }
  return out
}
/** a `having` object with its output names replaced by the internal SQL names the statement selects */
function renameFields(expr: unknown, names: Record<string, string>): unknown {
  if (!expr || typeof expr !== 'object' || Array.isArray(expr)) return expr
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(expr as Record<string, unknown>)) {
    if (LOGICAL.has(k) && Array.isArray(v)) out[k] = v.map((x) => renameFields(x, names))
    else if (k === 'not') out[k] = renameFields(v, names)
    else out[names[k] ?? k] = v
  }
  return out
}

/**
 * `select cur.*, cur.a <op> other.a as a from (grouped) as __cur left join (other fetch at the same grain) on grain`.
 * A missing other fetch (dropped by @include) yields NULL; divisions cast to float and NULLIF the denominator.
 */
function arithmeticLayer(core: Knex.QueryBuilder, physical: Physical, lowered: Node[], outputs: string[], env: CompileEnv): Knex.QueryBuilder {
  const { knex } = env
  // ClickHouse: non-Nullable casts reject NULL (Code 349), and unmatched join rows are NULL (join_use_nulls)
  const FLOAT = env.dialect === 'clickhouse' ? 'Nullable(Float64)' : 'float'
  const grainCols = physical.grain.flatMap((d) => dimColumns(d, physical, env))
  const joins = new Map<string | null, string | null>()
  const operand = (m: Node): string | null => {
    const { ref, byField } = m.lowered!
    if (byField) {
      if (!outputs.includes(byField)) throw new GritqlError('PLAN', `${place(physical, m.alias)}: no sibling '${byField}' at ${levelOf(physical)}`)
      return `${CUR}.${byField}`
    }
    const name = joins.get(ref!.alias)
    return name ? `${name}.${ref!.column}` : null
  }
  let qb = knex.from(core.as(CUR))
  for (const m of lowered) {
    const ref = m.lowered!.ref
    if (!ref || joins.has(ref.alias)) continue
    const target = refTarget(physical, ref, env)
    if (!target) {
      joins.set(ref.alias, null)
      continue
    }
    const name = `__ref_${joins.size}`
    joins.set(ref.alias, name)
    // compile the target first: its internal column names (`__d0`) exist only once its dimension resolvers ran
    const sub = compilePhysical(target, env, true, true)
    // a with() exposes its output names (its wrapper aliases internal names back); an embedded fetch keeps them
    const targetCols = target.grain.flatMap((d) => (target.fetch.kind === 'with' ? dimNames(d, target, env) : dimColumns(d, target, env)))
    const on = function (this: Knex.JoinClause) {
      if (!grainCols.length) this.on(knex.raw('1') as any, '=', knex.raw('1') as any) // root level: one row each side
      grainCols.forEach((c, i) => this.on(`${CUR}.${c}`, '=', `${name}.${targetCols[i]}`))
    }
    qb = target.fetch.kind === 'with' ? qb.leftJoin({ [name]: target.fetch.alias as string }, on) : qb.leftJoin(sub.as(name), on)
  }
  const byAlias = new Map(lowered.map((m) => [m.alias, m]))
  const selects = outputs.map((c) => {
    const m = byAlias.get(c)
    if (!m) return knex.raw('?? as ??', [`${CUR}.${c}`, c])
    const b = operand(m)
    if (b === null) return knex.raw('NULL as ??', [m.alias])
    const a = `${CUR}.${m.alias}`
    switch (m.lowered!.op) {
      case 'diff':
        return knex.raw(`cast(?? as ${FLOAT}) / NULLIF(cast(?? as ${FLOAT}), 0) - 1 as ??`, [a, b, m.alias])
      case 'divide':
        return knex.raw(`cast(?? as ${FLOAT}) / NULLIF(cast(?? as ${FLOAT}), 0) as ??`, [a, b, m.alias])
      case 'subtract':
        return knex.raw('?? - ?? as ??', [a, b, m.alias])
    }
  })
  return qb.select(selects as any)
}

/** the other fetch's statement at this statement's grain; undefined when the fetch is not in the plan */
function refTarget(physical: Physical, ref: { alias: string | null; column: string }, env: CompileEnv): Physical | undefined {
  const fetches = env.plan.fetches.filter((f) => f.alias === ref.alias)
  if (!fetches.length) return undefined
  const grain = physical.grain.map((d) => d.alias)
  const where = place(physical, ref.column)
  const level = levelOf(physical)
  const candidates = env.physicals.filter((p) => fetches.includes(p.fetch) && p.grain.length === grain.length && p.grain.every((d, i) => d.alias === grain[i]))
  if (!candidates.length) throw new GritqlError('PLAN', `${where}: '${ref.alias}' has no ${level} level to compare with`)
  const target = candidates.find((p) => outputAliases(p, env.registry, env).includes(ref.column))
  if (!target) throw new GritqlError('PLAN', `${where}: '${ref.alias}' has no '${ref.column}' at ${level}`)
  return target
}

/** `alias.grain.column`, for error messages */
const place = (physical: Physical, column: string) => `${physical.fetch.alias ?? physical.fetch.kind}.${[...physical.grain.map((d) => d.alias), column].join('.')}`
const levelOf = (physical: Physical) => (physical.grain.length ? `'${physical.grain.map((d) => d.alias).join('.')}'` : 'the root')

/** output names of a grain dimension */
function dimNames(dim: Node, physical: Physical, env: CompileEnv): string[] {
  const r = env.registry.dimension(dim.name)
  return r.columns ? r.columns(dim, env.makeCtx(physical, dim)) : [dim.alias]
}

/** SQL columns of a grain dimension (output names mapped through `sqlNames`) */
function dimColumns(dim: Node, physical: Physical, env: CompileEnv): string[] {
  const names = dimNames(dim, physical, env)
  return dim.sqlNames ? names.map((n) => dim.sqlNames![n] ?? n) : names
}

/** Every SQL output column of a statement (dimension columns, then metric columns). */
export function outputAliases(physical: Physical, registry: Registry, env: CompileEnv): string[] {
  const out: string[] = []
  for (const dim of physical.grain) out.push(...dimColumns(dim, physical, env))
  for (const m of physical.metrics) {
    const r = registry.metric(m.name)
    out.push(...(r.columns ? r.columns(m, env.makeCtx(physical, m)) : [m.alias]))
  }
  return out
}
