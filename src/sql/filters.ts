/**
 * Filter object (SPEC §2.6) → parameterized SQL fragment.
 *
 * The algorithm mirrors v3's `buildFilter` so predicate nesting and
 * parenthesization stay recognizable: every entry of a filter object is
 * wrapped in parentheses and joined with AND; `and`/`or`/`nor`/`not` nest.
 * Output is a `Frag` (`sql` with `??`/`?` placeholders plus bindings) so
 * nothing is inlined before the adapter sees it.
 */
import type { Knex } from 'knex'
import { GritqlError } from '../errors'
import type { FilterExpr } from '../model'

export interface Frag {
  sql: string
  bindings: Knex.RawBinding[]
}

export const EMPTY: Frag = { sql: '', bindings: [] }

export interface FilterContext {
  /** fetch table; qualifies every column unless `from` says otherwise */
  table: string
  /** joined tables; predicates marked `inherited: false` on other tables are skipped */
  joins: string[]
  dialect: string
  /** table qualifier set by a `from` key */
  from?: string
  inherited?: boolean
  /** when true, a string value starting with `@` is a column of `table` (join `on` clauses) */
  fieldRefs?: boolean
  /** false for HAVING: aggregate aliases are not table-qualified */
  qualify?: boolean
  /** collects `search: { col: text }` so search metrics can find their query */
  search?: Record<string, string>
  /** `where:` object: top-level `from`, `having`, `search`, `inherited` are columns, not keywords */
  where?: boolean
}

const WHERE_COLUMNS = new Set(['from', 'having', 'search', 'inherited'])

const OPERATORS = new Set([
  'and',
  'eq',
  'gt',
  'gte',
  'hasAny',
  'hasAll',
  'in',
  'lt',
  'lte',
  'ne',
  'nin',
  'nor',
  'not',
  'or',
  'ilike',
  'like',
  'search',
  'from',
  'inherited',
  'isNULL',
  'RegExp~',
  'RegExp!~',
  'RegExp~*',
  'RegExp!~*',
])

const isOp = (k: string) => OPERATORS.has(k)

function qualify(ctx: FilterContext, field: string): string {
  if (ctx.qualify === false && !ctx.from) return field.replace(/^@/, '')
  const table = ctx.from && ctx.from !== '@' ? ctx.from : ctx.table
  return `${table}.${field.replace(/^@/, '')}`
}

function combine(accum: Frag, next: Frag, joiner = 'AND'): Frag {
  if (!next.sql) return accum
  if (!accum.sql) return { sql: `(${next.sql})`, bindings: next.bindings }
  return { sql: `${accum.sql} ${joiner} (${next.sql})`, bindings: [...accum.bindings, ...next.bindings] }
}

/** value → `?` placeholder, or `??` when it names a column in a join `on` */
function operand(ctx: FilterContext, value: unknown): Frag {
  if (ctx.fieldRefs && typeof value === 'string' && value.startsWith('@')) {
    return { sql: '??', bindings: [`${ctx.table}.${value.slice(1)}`] }
  }
  return { sql: '?', bindings: [value as Knex.RawBinding] }
}

function skipForeign(ctx: FilterContext): boolean {
  const from = ctx.from && ctx.from !== '@' ? ctx.from : ctx.table
  return ctx.inherited === false && from !== ctx.table && !ctx.joins.includes(from)
}

function compare(ctx: FilterContext, field: string, op: string, value: unknown): Frag {
  if (skipForeign(ctx)) return EMPTY
  const key = qualify(ctx, field)
  const v = operand(ctx, value)
  if (ctx.dialect === 'clickhouse') {
    const ch: Record<string, string> = { '~': 'match(??, ?)', '~*': 'ilike(??, ?)', '!~': 'NOT match(??, ?)', '!~*': 'NOT ilike(??, ?)' }
    if (ch[op]) return { sql: ch[op], bindings: [key, ...v.bindings] }
  }
  return { sql: `?? ${op} ${v.sql}`, bindings: [key, ...v.bindings] }
}

function list(ctx: FilterContext, field: string, keyword: string, values: unknown, name: string): Frag {
  if (!Array.isArray(values)) throw new GritqlError('ARGS', `${name} requries array value`)
  if (skipForeign(ctx)) return EMPTY
  // `IN ()` is invalid SQL: an empty list matches nothing, an empty NOT IN matches everything
  if (values.length === 0) return { sql: keyword.trim() === 'IN' ? '1 = 0' : '1 = 1', bindings: [] }
  return { sql: `?? ${keyword}(${values.map(() => '?').join(',')})`, bindings: [qualify(ctx, field), ...values] }
}

function logical(ctx: FilterContext, items: unknown, joiner: string, prefix = ''): Frag {
  if (!Array.isArray(items)) throw new GritqlError('ARGS', `${joiner === 'AND' ? 'and' : 'or'} requires an array of filters`)
  let acc = EMPTY
  for (const item of items) acc = combine(acc, buildFilter(item as FilterExpr, { ...ctx }), joiner)
  return acc.sql ? { sql: `${prefix}(${acc.sql})`, bindings: acc.bindings } : EMPTY
}

function search(ctx: FilterContext, value: unknown): Frag {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GritqlError('ARGS', 'Search filter requires object value')
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.every(([k]) => isOp(k))) {
    throw new GritqlError('ARGS', 'At least one property of search must be related to field')
  }
  if (ctx.dialect !== 'pg') {
    throw new GritqlError('DIALECT', `Full text search is not supported by ${ctx.dialect} provider`)
  }
  let sql = ''
  const bindings: Knex.RawBinding[] = []
  for (const [k, v] of entries) {
    if (isOp(k)) continue
    const key = qualify(ctx, k)
    const pred = `to_tsvector('simple', ??) @@ (plainto_tsquery('simple', ?)::text || ':*')::tsquery`
    sql = sql ? `${sql} AND ${pred}` : pred
    bindings.push(key, v as Knex.RawBinding)
  }
  return { sql, bindings }
}

const LOGICAL = new Set(['and', 'or', 'nor', 'not', 'having', 'from', 'search'])

function predicate(ctx: FilterContext, field: string | null, op: string | null, value: unknown): Frag {
  if (field === null && op !== null && !LOGICAL.has(op)) {
    throw new GritqlError('ARGS', `Operator \`${op}\` needs a field: write { field: { ${op}: value } }`)
  }
  switch (op) {
    case 'isNULL':
      if (skipForeign(ctx)) return EMPTY
      return { sql: value ? '?? IS NULL' : '?? IS NOT NULL', bindings: [qualify(ctx, field!)] }
    case 'and':
      return logical(ctx, value, 'AND')
    case 'or':
      return logical(ctx, value, 'OR')
    case 'nor':
      return logical(ctx, value, 'OR', 'NOT ')
    case 'not': {
      const inner = buildFilter(value as FilterExpr, { ...ctx })
      return inner.sql ? { sql: `NOT (${inner.sql})`, bindings: inner.bindings } : EMPTY
    }
    case 'hasAny':
    case 'hasAll': {
      if (ctx.dialect !== 'clickhouse') throw new GritqlError('DIALECT', `${op} operator is supported only by clickhouse provider`)
      if (skipForeign(ctx)) return EMPTY
      const key = qualify(ctx, field!)
      if (ctx.fieldRefs && typeof value === 'string' && value.startsWith('@')) {
        return { sql: `${op}(??, ??)`, bindings: [key, `${ctx.table}.${value.slice(1)}`] }
      }
      if (!Array.isArray(value)) throw new GritqlError('ARGS', `${op === 'hasAny' ? 'HAS_ANY' : 'HAS_ALL'} requires array value`)
      return { sql: `${op}(??, [${value.map(() => '?').join(',')}])`, bindings: [key, ...value] }
    }
    case 'in':
      return list(ctx, field!, 'IN ', value, 'IN')
    case 'nin':
      return list(ctx, field!, 'NOT IN', value, 'NIN')
    case 'eq':
      return compare(ctx, field!, '=', value)
    case 'ne':
      return compare(ctx, field!, '<>', value)
    case 'gt':
      return compare(ctx, field!, '>', value)
    case 'gte':
      return compare(ctx, field!, '>=', value)
    case 'lt':
      return compare(ctx, field!, '<', value)
    case 'lte':
      return compare(ctx, field!, '<=', value)
    case 'like':
      return compare(ctx, field!, 'LIKE', value)
    case 'ilike':
      return compare(ctx, field!, 'ILIKE', value)
    case 'RegExp~':
      return compare(ctx, field!, '~', value)
    case 'RegExp!~':
      return compare(ctx, field!, '!~', value)
    case 'RegExp~*':
      return compare(ctx, field!, '~*', value)
    case 'RegExp!~*':
      return compare(ctx, field!, '!~*', value)
    case 'search':
      return search(ctx, value)
    default: {
      // `field: value` or `field: { op: value, ... }`
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const mods = value as Record<string, unknown>
        // `from` / `inherited` modify every operator of this field, wherever they are written
        if ('from' in mods) ctx = { ...ctx, from: mods.from as string }
        if ('inherited' in mods) ctx = { ...ctx, inherited: mods.inherited as boolean }
        let acc = EMPTY
        for (const [k, v] of Object.entries(mods)) {
          if (k === 'from' || k === 'inherited') continue
          if (!isOp(k)) throw new GritqlError('ARGS', `Unknown filter operator '${k}' for ${field}`)
          acc = combine(acc, predicate(ctx, field, k, v))
        }
        return acc
      }
      if (Array.isArray(value)) return list(ctx, field!, 'IN ', value, 'IN')
      return compare(ctx, field!, '=', value)
    }
  }
}

export function buildFilter(filter: FilterExpr | null | undefined, ctx: FilterContext): Frag {
  if (!filter) return EMPTY
  let acc = EMPTY
  for (const [key, value] of Object.entries(filter)) {
    const column = ctx.where && WHERE_COLUMNS.has(key)
    if (!column) {
      if (key === 'from') {
        ctx = { ...ctx, from: value as string }
        continue
      }
      if (key === 'inherited') {
        ctx = { ...ctx, inherited: value as boolean }
        continue
      }
      if (key === 'having') continue // compiled separately by the caller
    }
    const op = !column && isOp(key) ? key : null
    const field = op ? null : key
    acc = combine(acc, predicate(ctx, field, op, value))
  }
  return acc
}
