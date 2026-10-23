/**
 * Built-in metrics (SPEC §8.1). Each returns expressions; the engine owns
 * SELECT / GROUP BY. SQL text follows v3 so generated statements stay
 * recognizable across versions.
 */
import type { Knex } from 'knex'
import { GritqlError } from '../errors'
import type { Ctx, Node, Resolver } from '../model'
import { PropTypes } from '../types'

const partitionByTypes = { by: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]) }

/** `PARTITION BY a, b` or '' */
function partition(node: Node, ctx: Ctx): Knex.Raw | '' {
  const by = node.args.by as string | string[] | undefined
  if (!by) return ''
  const cols = (Array.isArray(by) ? by : [by]).map((b) => ctx.col(b, node.args.from as string | undefined))
  return ctx.knex.raw(`PARTITION BY ${cols.map(() => '??').join(', ')}`, cols)
}

function over(node: Node, ctx: Ctx, orderBy?: { by: string; dir?: 'ASC' | 'DESC' }, cast?: string): Knex.Raw {
  const p = partition(node, ctx)
  if (!p && !orderBy) return ctx.knex.raw('OVER()')
  const order = orderBy ? ctx.knex.raw(`ORDER BY ?? ${orderBy.dir ?? 'DESC'}`, [orderBy.by]) : ''
  return ctx.knex.raw(`OVER(${p}${order})${cast ? `::${cast}` : ''}`)
}

const a = (node: Node, ctx: Ctx, key = 'a') => ctx.col(node.args[key] as string, node.args.from as string | undefined)

function aggregate(fn: string, uppercase = true): Resolver {
  return {
    args: { a: PropTypes.string.isRequired, ...partitionByTypes },
    sql: (node, ctx) => {
      const p = node.args.by ? ` ${over(node, ctx)}` : ''
      return ctx.knex.raw(`${uppercase ? fn.toUpperCase() : fn}(??)${p} AS ??`, [a(node, ctx), node.alias])
    },
  }
}

/** `"fn|col"` → [fn, col]; `"|col"` → ['', col]; plain → [defaultFn, col] */
function split(value: unknown, defaultFn: string): [string, string] {
  if (typeof value !== 'string') return [defaultFn, String(value)]
  const i = value.indexOf('|')
  if (i === -1) return [defaultFn, value]
  return [value.slice(0, i), value.slice(i + 1)]
}

/** `cast(fn(col) as float)` or `cast(col as float)` with bindings */
function castExpr(fn: string, col: string): [string, string[]] {
  return fn === '' ? ['cast(?? as float)', [col]] : ['cast(??(??) as float)', [fn, col]]
}

function arithmetic(build: (A: string, B: string) => string): Resolver {
  return {
    args: { a: PropTypes.string.isRequired, by: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired },
    sql: (node, ctx) => {
      const [fa, ca] = split(node.args.a, 'sum')
      const from = node.args.from as string | undefined
      const [A, aBind] = castExpr(fa, ctx.col(ca, from))
      if (typeof node.args.by === 'number') {
        return ctx.knex.raw(`${build(A, '?::float4')} as ??`, [...aBind, node.args.by, node.alias])
      }
      const [fb, cb] = split(node.args.by, 'sum')
      const [B, bBind] = castExpr(fb, ctx.col(cb, from))
      return ctx.knex.raw(`${build(A, B)} as ??`, [...aBind, ...bBind, node.alias])
    },
  }
}

export const metrics: Record<string, Resolver> = {
  /** bare column */
  default: {
    sql: (node, ctx) => {
      const col = ctx.col(node.name, node.args.from as string | undefined)
      return node.alias === node.name ? ctx.knex.raw('??', [col]) : ctx.knex.raw('?? as ??', [col, node.alias])
    },
  },

  sum: aggregate('sum'),
  min: aggregate('min'),
  max: aggregate('max'),
  count: {
    args: { a: PropTypes.string, ...partitionByTypes },
    sql: (node, ctx) => {
      const p = node.args.by ? ` ${over(node, ctx)}` : ''
      if (node.args.a === undefined || node.args.a === '*') return ctx.knex.raw(`COUNT(*)${p} AS ??`, [node.alias])
      return ctx.knex.raw(`COUNT(??)${p} AS ??`, [a(node, ctx), node.alias])
    },
  },

  countDistinct: {
    args: { a: PropTypes.string.isRequired },
    sql: (node, ctx) => ctx.knex.raw('count(distinct ??) as ??', [a(node, ctx), node.alias]),
  },

  avg: {
    args: { a: PropTypes.string.isRequired, by: PropTypes.string },
    sql: (node, ctx) => ctx.knex.raw(`avg(??)${node.args.by ? ` ${over(node, ctx, undefined, 'float4')}` : '::float4'} as ??`, [a(node, ctx), node.alias]),
  },

  unique: {
    args: { a: PropTypes.string },
    sql: (node, ctx) => {
      const col = ctx.col((node.args.a as string) ?? node.alias, node.args.from as string | undefined)
      return { select: [ctx.knex.raw('?? as ??', [col, node.alias])], groupBy: [ctx.knex.raw('??', [col])] }
    },
  },

  any: {
    args: { a: PropTypes.string },
    sql: (node, ctx) => ctx.knex.raw('any(??) as ??', [ctx.col((node.args.a as string) ?? node.alias, node.args.from as string | undefined), node.alias]),
  },

  from: {
    args: { a: PropTypes.string, from: PropTypes.string.isRequired },
    sql: (node, ctx) => ctx.knex.raw('?? as ??', [ctx.col((node.args.a as string) ?? node.alias, node.args.from as string), node.alias]),
  },

  distinct: {
    distinct: true,
    sql: (node, ctx) => ctx.knex.raw('??', [ctx.col(node.alias, node.args.from as string | undefined)]),
  },

  percentile: {
    args: { a: PropTypes.string.isRequired, factor: PropTypes.number },
    sql: (node, ctx) =>
      ctx.knex.raw('PERCENTILE_CONT(??) WITHIN GROUP(ORDER BY ??) AS ??', [node.args.factor == null ? 0.5 : Number(node.args.factor), a(node, ctx), node.alias]),
  },

  median: {
    args: { a: PropTypes.string.isRequired, ...partitionByTypes },
    sql: (node, ctx) => ctx.knex.raw(`MEDIAN(??)${node.args.by ? ` ${over(node, ctx)}` : ''} AS ??`, [a(node, ctx), node.alias]),
  },

  share: {
    args: { a: PropTypes.string.isRequired, ...partitionByTypes },
    sql: (node, ctx) => {
      const col = a(node, ctx)
      return ctx.knex.raw(`sum(??)/NULLIF(sum(sum(??)) ${over(node, ctx)}, 0)::float4 as ??`, [col, col, node.alias])
    },
  },

  indexed: {
    args: { a: PropTypes.string.isRequired, by: PropTypes.string, alg: PropTypes.oneOf(['first', 'max']) },
    sql: (node, ctx) => {
      const col = a(node, ctx)
      const fn = node.args.alg === 'first' ? 'first_value' : 'max'
      return ctx.knex.raw(`sum(??)/NULLIF(${fn}(sum(??)::float) ${over(node, ctx)}, 0)::float4 as ??`, [col, col, node.alias])
    },
  },

  divide: arithmetic((A, B) => `${A}/NULLIF(${B} + 1e-10, 0)::float4`),
  diff: arithmetic((A, B) => `${A}/NULLIF(${B} + 1e-10, 0)::float4 - 1 `),
  subtract: arithmetic((A, B) => `${A}-${B}`),
  multiply: arithmetic((A, B) => (B === '?::float4' ? `${A}*${B}` : `${A}*${B}::float4`)),

  avgPerDimension: {
    args: { a: PropTypes.string.isRequired, per: PropTypes.string.isRequired },
    sql: (node, ctx) => ctx.knex.raw('sum(??)::float/COUNT(DISTINCT ??)::float4 as ??', [a(node, ctx), a(node, ctx, 'per'), node.alias]),
  },

  ranking: {
    args: {
      a: PropTypes.string.isRequired,
      by: PropTypes.string,
      alg: PropTypes.oneOf(['denseRank', 'rank', 'rowNumber', 'reverseRank', 'reverseRowNumber', 'reverseDenseRank']),
    },
    sql: (node, ctx) => {
      const alg = String(node.args.alg ?? 'denseRank')
      const reversed = alg.startsWith('reverse')
      const base = reversed ? alg.slice(7, 8).toLowerCase() + alg.slice(8) : alg
      const fn = { denseRank: 'DENSE_RANK', rank: 'RANK', rowNumber: 'ROW_NUMBER' }[base] ?? 'DENSE_RANK'
      const table = ctx.physical ? tableName(ctx) : ''
      const windowCol = reversed ? `reverse_${node.alias}` : node.alias
      const pre = ctx.knex.raw(`${fn}() ${over(node, ctx, { by: a(node, ctx) })} as ??`, [windowCol])
      const qualified = `${table}.${node.alias}`
      if (!reversed) {
        return { pre: [pre], select: [ctx.knex.raw('??', [qualified])], groupBy: [ctx.knex.raw('??', [qualified])] }
      }
      const rev = ctx.knex.raw('(max(??) over ()) - ?? + 1 as ??', [`${table}.${windowCol}`, `${table}.${windowCol}`, node.alias])
      return { pre: [pre], select: [rev], groupBy: [ctx.knex.raw('??', [`${table}.${windowCol}`])] }
    },
  },

  searchRanking: {
    args: { a: PropTypes.string.isRequired },
    sql: {
      pg: (node, ctx) => {
        const key = ctx.col(node.args.a as string, (node.args.from as string) ?? tableName(ctx))
        const text = searchFor(ctx, String(node.args.a).replace(/^@/, ''), 'SearchRanking')
        return ctx.knex.raw(`ts_rank(to_tsvector('simple', ??), (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??`, [key, text, node.alias])
      },
    },
  },

  searchHeadline: {
    args: { a: PropTypes.string.isRequired },
    sql: {
      pg: (node, ctx) => {
        const key = ctx.col(node.args.a as string, (node.args.from as string) ?? tableName(ctx))
        const text = searchFor(ctx, String(node.args.a).replace(/^@/, ''), 'SearchHeadline')
        return ctx.knex.raw(`ts_headline('simple', ??, (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??`, [key, text, node.alias])
      },
    },
  },

  /** sum(alias * sum(to)) / max(sum(by)) over a middle table grouped by the grain plus `alias` */
  aggrAverage: {
    args: { to: PropTypes.string.isRequired, by: PropTypes.string.isRequired },
    columns: (node) => [`${node.alias}_aggrAverage`],
    sql: () => ({}),
    query: (qb, physical, ctx) => {
      const node = ctx.node!
      const knex = ctx.knex
      const from = node.args.from as string | undefined
      const alias = ctx.col(node.alias, from)
      const to = ctx.col(node.args.to as string, from)
      const by = ctx.col(node.args.by as string, from)
      const dims = physical.grain.map((d) => d.alias)
      const inner = qb
        .clone()
        .select(alias)
        .sum(`${to} as ${node.args.to}`)
        .sum(`${by} as ${node.args.by}`)
        .select(knex.raw('?? * sum(??) as "aggrAverage"', [alias, to]))
        .groupBy(alias)
      if (node.args.to !== node.args.by) inner.sum(`${by} as ${node.args.by}`)
      let outer = knex
        .select(dims)
        .select(knex.raw(`sum("aggrAverage")/max(??)::float4  as ??`, [node.args.by as string, `${node.alias}_aggrAverage`]))
        .from(inner.as('middleTable'))
      if (dims.length) outer = outer.groupBy(dims)
      return outer
    },
  },

  weightAvg: {
    args: { a: PropTypes.string.isRequired, by: PropTypes.string.isRequired },
    sql: () => ({}),
    query: (qb, physical, ctx) => {
      const node = ctx.node!
      const knex = ctx.knex
      const from = node.args.from as string | undefined
      const col = ctx.col(node.args.a as string, from)
      const by = ctx.col(node.args.by as string, from)
      const dims = physical.grain.map((d) => d.alias)
      const inner = qb
        .clone()
        .select(col)
        .sum(`${by} as ${node.args.by}`)
        .select(knex.raw('?? * sum(??)::float4 as "weightAvg"', [col, by]))
        .groupBy(col)
      let outer = knex
        .select(dims)
        .select(knex.raw('sum("weightAvg")/sum(??)::float4 as ??', [node.args.by as string, node.alias]))
        .from(inner.as('middleTable'))
      if (dims.length) outer = outer.groupBy(dims)
      return outer
    },
  },
}

function tableName(ctx: Ctx): string {
  const src = ctx.fetch!.source
  return Array.isArray(src) ? `unionall_${src.join('_')}` : src
}

function searchFor(ctx: Ctx, key: string, who: string): string {
  const text = ctx.fetch!.search[key]
  if (text === undefined) throw new GritqlError('ARGS', `${who} requires search query for ${key} field`)
  return text
}
