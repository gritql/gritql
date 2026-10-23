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

/** true when `value` fails any of the `ops` taken from `args` (optionally prefixed `name_`) */
function fails(ops: string[], value: unknown, args: Record<string, unknown>, name?: string): boolean {
  return ops.some((op) => {
    const fn = operators[op] ?? operators.eq
    const argKey = operators[op] && name ? `${name}_${op}` : op
    return !fn(value, args[argKey])
  })
}

/** ops in `argKeys` that address `key`: `value_gt` → gt, `value` → value (eq) */
function opsFor(argKeys: string[], key: string): string[] {
  return argKeys.filter((k) => k === key || k.startsWith(key + '_')).map((k) => k.split('_').slice(-1)[0])
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
    plan: (_t, ctx) => need(Object.keys(ctx.args).length, 'Filter directive requires arguments'),
    result: (cell, ctx) => {
      if (!ctx.baseline) return undefined
      const argKeys = Object.keys(ctx.args)
      if (ctx.node?.kind === 'metric') return { skip: fails(argKeys, cell.value, ctx.args) }
      const obj = ownerOf(cell, ctx)
      if (!obj) return { skip: true, skipAll: true }
      const skip = Object.keys(obj).some((key) => {
        const ops = opsFor(argKeys, key)
        return ops.length > 0 && fails(ops, obj[key], ctx.args, key)
      })
      return { skip, skipAll: skip }
    },
  },

  groupOn: {
    plan: (_t, ctx) => {
      need(Object.keys(ctx.args).length, 'GroupOn directive requires arguments')
      need(Object.keys(ctx.args).some((k) => k !== 'replacers'), 'GroupOn directive requires at least one grouping condition')
    },
    result: (cell, ctx) => {
      if (!ctx.baseline) return undefined
      const argKeys = Object.keys(ctx.args).filter((k) => k !== 'replacers')
      const obj = ownerOf(cell, ctx)
      if (!obj) return undefined
      const matched = Object.keys(obj).some((key) => {
        const ops = opsFor(argKeys, key)
        return ops.length > 0 && !fails(ops, obj[key], ctx.args, key)
      })
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
      need(ctx.args.as, 'Parse directive requires `as` argument')
      ctx.state.transform = parser(String(ctx.args.as))
    },
    result: (cell, ctx) => {
      const transform = ctx.state.transform as (v: unknown) => unknown
      if (ctx.node?.kind === 'metric') return { value: transform(cell.value) }
      const alias = ctx.node!.alias
      return { keys: { ...cell.keys, [alias]: transform(cell.keys[alias]) } }
    },
  },
}

function parser(as: string): (v: unknown) => unknown {
  const [kind, desc, semi] = as.split(':')
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
