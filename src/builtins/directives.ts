/**
 * Built-in directives (SPEC §8.3). Plan-stage hooks validate arguments with
 * v3's messages (tests match on them) and evaluate @include/@skip/@compare;
 * result-stage hooks transform cells while assembling.
 */
import { GritqlError } from '../errors'
import type { Cell, CellResult, Ctx, Fetch, Node, Resolver } from '../model'
import { walkNodes } from '../plan/helpers'
import { groupStart, parseDateValue, toIso, toIsoDate, toIsoTime, toIsoWeekDate, formatDate } from './dates'

// ---------------------------------------------------------------------------
// comparison operators shared by @compare, @filter and @groupOn (v3 semantics)
// ---------------------------------------------------------------------------

const same = (av: any, bv: any): boolean => {
  if (typeof av !== typeof bv) return false
  if (typeof bv === 'object' && bv !== null) return Object.keys(bv).every((k) => av?.[k] === bv[k])
  return av === bv
}
const matchesAny = (av: any, b: any) => (Array.isArray(b) ? b.some((bv) => same(av, bv)) : same(av, b))
const mustBeArray = (a: unknown): any[] => {
  if (!Array.isArray(a)) throw new GritqlError('ARGS', 'Value must be an array')
  return a
}

export const operators: Record<string, (a: any, b: any) => boolean> = {
  eq: (a, b) => a == b,
  neq: (a, b) => a != b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  in: (a, b) => {
    if (!Array.isArray(b) && !Array.isArray(a)) throw new GritqlError('ARGS', 'Argument `in` or value must be an array')
    return Array.isArray(b) ? b.includes(a) : a.includes(b)
  },
  nin: (a, b) => {
    if (!Array.isArray(b) && !Array.isArray(a)) throw new GritqlError('ARGS', 'Argument `nin` or value must be an array')
    return Array.isArray(b) ? !b.includes(a) : !a.includes(b)
  },
  of: (a, b) => mustBeArray(a).every((av) => matchesAny(av, b)),
  nof: (a, b) => !mustBeArray(a).every((av) => matchesAny(av, b)),
  contains: (a, b) => mustBeArray(a).some((av) => matchesAny(av, b)),
  ncontains: (a, b) => !mustBeArray(a).some((av) => matchesAny(av, b)),
  startsWith: (a, b) => {
    const arr = mustBeArray(a)
    return arr.length > 0 && matchesAny(arr[0], b)
  },
  endsWith: (a, b) => {
    const arr = mustBeArray(a)
    return arr.length > 0 && matchesAny(arr[arr.length - 1], b)
  },
  nStartsWith: (a, b) => {
    const arr = mustBeArray(a)
    return arr.length === 0 || !matchesAny(arr[0], b)
  },
  nEndsWith: (a, b) => {
    const arr = mustBeArray(a)
    return arr.length === 0 || !matchesAny(arr[arr.length - 1], b)
  },
}

/** true when `value` fails any of the operator `ops` taken from `args` (metric-level `@filter(gt: 1)`) */
function fails(ops: string[], value: unknown, args: Record<string, unknown>): boolean {
  return ops.some((op) => !(operators[op] ?? operators.eq)(value, args[op]))
}

/**
 * Field conditions of `@filter` / `@groupOn`, grouped by field.
 * Object form: `where: { value: { gt: 1, lt: 9 }, name: "x", country: ["DE", "AT"] }` (scalar = eq, list = in).
 * Legacy suffix form (`value_gt: 1`) is accepted with `strict: false`; strict names the object form.
 */
interface FieldConds {
  field: string
  checks: { fn: (a: unknown, b: unknown) => boolean; value: unknown }[]
}
function fieldConds(ctx: Ctx, ignore: string[]): FieldConds[] {
  const conds: FieldConds[] = []
  const add = (field: string, fn: (a: unknown, b: unknown) => boolean, value: unknown) => {
    let group = conds.find((c) => c.field === field)
    if (!group) conds.push((group = { field, checks: [] }))
    group.checks.push({ fn, value })
  }
  const where = ctx.args.where as Record<string, unknown> | undefined
  if (where !== undefined) {
    if (!where || typeof where !== 'object' || Array.isArray(where)) throw new GritqlError('ARGS', '`where` must be an object of { field: predicate }')
    for (const [field, pred] of Object.entries(where)) {
      if (pred !== null && typeof pred === 'object' && !Array.isArray(pred)) {
        for (const [op, value] of Object.entries(pred as Record<string, unknown>)) {
          if (!operators[op]) throw new GritqlError('ARGS', `Unknown operator '${op}' for ${field}`)
          add(field, operators[op], value)
        }
      } else add(field, Array.isArray(pred) ? operators.in : operators.eq, pred)
    }
  }
  for (const argKey of Object.keys(ctx.args)) {
    if (argKey === 'where' || ignore.includes(argKey)) continue
    const i = argKey.lastIndexOf('_')
    const suffix = i > 0 ? argKey.slice(i + 1) : ''
    const [field, op] = operators[suffix] ? [argKey.slice(0, i), suffix] : [argKey, 'eq']
    if (ctx.strict) {
      throw new GritqlError('ARGS', `'${argKey}' is a field_operator string; write where: { ${field}: { ${op}: ... } } (or set strict: false)`)
    }
    add(field, operators[op], ctx.args[argKey])
  }
  return conds
}

const need = (cond: unknown, message: string) => {
  if (!cond) throw new GritqlError('ARGS', message)
}

function conditionalTarget(ctx: Ctx, kind: 'Include' | 'Skip'): boolean {
  if (ctx.chain.value !== undefined) return !!ctx.chain.value
  need(Object.keys(ctx.args).length, `${kind} directive requires arguments or result of previous directive`)
  need(ctx.args.if !== undefined, `${kind} directive requires \`if\` argument`)
  return !!ctx.args.if
}

/** baseline object of the dimension (or fetch) the directive sits on, for the row's keys */
const ownerOf = (cell: Cell, ctx: Ctx) => ctx.at(ctx.fetch!.alias, cell.keys, ctx.path) as Record<string, unknown> | undefined

const isDirectChild = (cell: Cell, ctx: Ctx) => cell.path.length === ctx.path.length + 1

export const directives: Record<string, Resolver> = {
  include: {
    plan: (_t, ctx) => {
      if (!conditionalTarget(ctx, 'Include')) ctx.remove()
    },
  },
  skip: {
    plan: (_t, ctx) => {
      if (conditionalTarget(ctx, 'Skip')) ctx.remove()
    },
  },
  compare: {
    plan: (_t, ctx) => {
      need(Object.keys(ctx.args).length, 'Compare directive requires arguments')
      const { value: own, ...rest } = ctx.args
      const value = own ?? ctx.chain.value
      need(value !== undefined, 'Compare directive requires `value` argument or result of previous directive')
      const ops = Object.keys(rest)
      need(
        ops.length,
        'Compare directive requires at least one argument ([`eq`, `in`, `neq`, `lt`, `gt`, `lte`, `gte`, `of`, `nof`]) to compare with value',
      )
      for (const op of ops) need(operators[op], `Can't find resolver for '${op}'`)
      ctx.chain.value = ops.every((op) => operators[op](value, rest[op]))
    },
  },

  omit: {
    result: (_cell, ctx) => ({ skip: !!ctx.args.full || ctx.baseline !== undefined }),
  },

  diff: {
    plan: (_t, ctx) => need(ctx.args.by, "Diff directive requires 'by' argument"),
    result: (cell, ctx) =>
      ctx.baseline ? { value: (cell.value as number) / (ctx.at(ctx.args.by as string, cell.keys, cell.path) as number) - 1 } : undefined,
  },

  subtract: {
    plan: (_t, ctx) => need(ctx.args.by, "Subtract directive requires 'by' argument"),
    result: (cell, ctx) =>
      ctx.baseline ? { value: (cell.value as number) - (ctx.at(ctx.args.by as string, cell.keys, cell.path) as number) } : undefined,
  },

  divide: {
    plan: (_t, ctx) => need(ctx.args.by || ctx.args.byField, "Diff directive requires 'by' or 'byField' argument"),
    result: (cell, ctx) => {
      if (!ctx.baseline) return undefined
      const ref = ctx.args.by
        ? ctx.at(ctx.args.by as string, cell.keys, cell.path)
        : ctx.at(ctx.fetch!.alias, cell.keys, [...cell.path.slice(0, -1), ctx.args.byField as string])
      return { value: (cell.value as number) / (ref as number) }
    },
  },

  indexed: {
    plan: (_t, ctx) => {
      need(ctx.args.to || ctx.args.group, "Indexed directive requires 'to' or 'group' argument")
      need(!(ctx.args.to && ctx.args.group), "Indexed directive can handle only 'to' or 'group' argument at once")
    },
    result: (cell, ctx) => {
      if (!ctx.baseline) return undefined
      if (ctx.state.max === undefined) {
        const members: { alias: string | null; path: string[] }[] = []
        if (ctx.args.group) {
          for (const fetch of ctx.plan.fetches) {
            for (const { node, path } of walkNodes(fetch.tree)) {
              if (node.directives.some((d) => d.name === 'indexed' && d.args.group === ctx.args.group)) members.push({ alias: fetch.alias, path })
            }
          }
        } else {
          members.push({ alias: ctx.fetch!.alias, path: cell.path }, { alias: ctx.args.to as string, path: cell.path })
        }
        let max = 0
        for (const m of members) {
          for (const v of ctx.values!(ctx.baseline[m.alias ?? ''], m.alias, m.path)) if (typeof v === 'number') max = Math.max(max, v)
        }
        ctx.state.max = max
      }
      return { value: (cell.value as number) / (ctx.state.max as number) }
    },
  },

  filter: {
    plan: (_t, ctx) => {
      need(Object.keys(ctx.args).length, 'Filter directive requires arguments')
      // metric-level `@filter(gt: 1)` compares the cell value; dimension-level conditions name fields
      if (ctx.node?.kind === 'metric') {
        for (const op of Object.keys(ctx.args)) need(operators[op], `Filter directive on a metric takes operators (gt, in, ...); unknown '${op}'`)
      } else ctx.state.conds = fieldConds(ctx, [])
    },
    result: (cell, ctx) => {
      if (!ctx.baseline) return undefined
      if (ctx.node?.kind === 'metric') return { skip: fails(Object.keys(ctx.args), cell.value, ctx.args) }
      const obj = ownerOf(cell, ctx)
      if (!obj) return { skip: true, skipAll: true }
      const skip = (ctx.state.conds as FieldConds[]).some((c) => c.field in obj && c.checks.some((k) => !k.fn(obj[c.field], k.value)))
      return { skip, skipAll: skip }
    },
  },

  groupOn: {
    plan: (_t, ctx) => {
      need(Object.keys(ctx.args).length, 'GroupOn directive requires arguments')
      const conds = fieldConds(ctx, ['replacers'])
      need(conds.length, 'GroupOn directive requires at least one grouping condition')
      ctx.state.conds = conds
    },
    result: (cell, ctx) => {
      if (!ctx.baseline) return undefined
      const obj = ownerOf(cell, ctx)
      if (!obj) return undefined
      const matched = (ctx.state.conds as FieldConds[]).some((c) => c.field in obj && c.checks.every((k) => k.fn(obj[c.field], k.value)))
      if (!matched) return undefined
      const replacers = (ctx.args.replacers as Record<string, unknown>) ?? {}
      const res: CellResult = { keys: { ...cell.keys, ...replacers } }
      if (isDirectChild(cell, ctx)) res.set = replacers
      return res
    },
  },

  groupBy: {
    plan: (_t, ctx) => {
      need(Object.keys(ctx.args).length, 'GroupBy directive requires arguments')
      need(ctx.args.by, "GroupBy directive requires 'by' argument")
    },
    result: (cell, ctx) => {
      if (!ctx.baseline) return undefined
      const alias = ctx.node!.alias
      return { keys: { ...cell.keys, [alias]: groupStart(cell.keys[alias], String(ctx.args.by)) } }
    },
  },

  parse: {
    plan: (_t, ctx) => {
      need(ctx.args.as !== undefined, 'Parse directive requires `as` argument')
      ctx.state.transform = parser(parseSpec(ctx.args.as, ctx.strict))
    },
    result: (cell, ctx) => {
      const transform = ctx.state.transform as (v: unknown) => unknown
      if (ctx.node?.kind === 'metric') return { value: transform(cell.value) }
      const alias = ctx.node!.alias
      return { keys: { ...cell.keys, [alias]: transform(cell.keys[alias]) } }
    },
  },
}

/**
 * `as` → [kind, descriptor, extra]. Enum form: `int`, `float`, `date`.
 * Object form: `{ int: 16 }`, `{ float: 2 }`, `{ date: "iso-date" }`, `{ date: { format: "yyyy/MM" } }`.
 * Legacy `"int:16"` / `"date:format:yyyy/MM"` strings are accepted with `strict: false`.
 */
function parseSpec(as: unknown, strict: boolean): [string, string | undefined, string | undefined] {
  if (as !== null && typeof as === 'object') {
    const entries = Object.entries(as as Record<string, unknown>)
    if (entries.length !== 1) throw new GritqlError('ARGS', 'Parse directive `as` object has exactly one key: { int: radix } | { float: precision } | { date: format }')
    const [kind, desc] = entries[0]
    if (desc !== null && typeof desc === 'object') {
      const format = (desc as Record<string, unknown>).format
      if (kind !== 'date' || format === undefined) throw new GritqlError('ARGS', 'Parse directive: only { date: { format: "..." } } takes an object')
      return [kind, 'format', String(format)]
    }
    return [kind, desc === undefined ? undefined : String(desc), undefined]
  }
  const text = String(as)
  const [kind, desc, semi] = text.split(':')
  if (strict && desc !== undefined) {
    const object = semi !== undefined ? `{ ${kind}: { ${desc}: "${semi}" } }` : `{ ${kind}: ${/^\d+$/.test(desc) ? desc : `"${desc}"`} }`
    throw new GritqlError('ARGS', `Parse directive: "${text}" is a colon grammar; write as: ${object} (or set strict: false)`)
  }
  return [kind, desc, semi]
}

function parser([kind, desc, semi]: [string, string | undefined, string | undefined]): (v: unknown) => unknown {
  if (kind === 'int') return (v) => parseInt(String(v), desc ? Number(desc) : 10)
  if (kind === 'float') return desc ? (v) => parseFloat(String(v)).toFixed(Number(desc)) : (v) => parseFloat(String(v))
  if (kind === 'date') {
    const fmt: Record<string, (d: Date) => string> = {
      iso: toIso,
      'iso-date': toIsoDate,
      'iso-time': toIsoTime,
      'iso-week-date': toIsoWeekDate,
      format: (d) => formatDate(d, semi ?? ''),
    }
    const f = fmt[desc ?? 'iso']
    if (!f) throw new GritqlError('ARGS', `Parse directive: unsupported date format '${desc}'`)
    return (v) => {
      const d = parseDateValue(v)
      return d ? f(d) : v
    }
  }
  return (v) => v
}

export type { Fetch, Node }
