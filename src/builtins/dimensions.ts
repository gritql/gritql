/**
 * Built-in dimensions (SPEC §8.2). A dimension returns the expressions that
 * select and group its columns; the engine adds them to GROUP BY.
 */
import { GritqlError } from '../errors'
import type { Resolver } from '../model'
import { PropTypes } from '../types'

const DATE_UNITS = [
  'microseconds',
  'milliseconds',
  'second',
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'decade',
  'century',
  'millennium',
]

export const dimensions: Record<string, Resolver> = {
  /** plain column, grouped */
  default: {
    sql: (node, ctx) => {
      const col = ctx.col(node.name, node.args.from as string | undefined)
      const select = node.alias === node.name ? ctx.knex.raw('??', [col]) : ctx.knex.raw('?? AS ??', [col, node.alias])
      return { select: [select], groupBy: [ctx.knex.raw('??', [col])] }
    },
  },

  /** `groupBy(field: date, by: month)` → date_trunc inline */
  groupBy: {
    args: { field: PropTypes.string.isRequired, by: PropTypes.oneOf(DATE_UNITS), alias: PropTypes.string },
    columns: (node) => [(node.args.alias as string) ?? (node.alias !== node.name ? node.alias : (node.args.field as string))],
    sql: (node, ctx) => {
      const col = ctx.col(node.args.field as string, node.args.from as string | undefined)
      const alias = (node.args.alias as string) ?? (node.alias !== node.name ? node.alias : (node.args.field as string))
      const expr = ctx.knex.raw('date_trunc(?, ??)', [String(node.args.by ?? 'day'), col])
      // when the alias shadows the source column (`date: groupBy(field: date)`), ClickHouse reads the inner `date`
      // as the alias (cyclic alias) and wants the alias in GROUP BY; PostgreSQL resolves that name to the input
      // column instead, so every other dialect groups by the expression
      const shadows = ctx.dialect === 'clickhouse' && alias === (node.args.field as string) && !node.args.from
      return {
        select: [ctx.knex.raw(`${expr.toQuery()} as ??`, [alias])],
        groupBy: [shadows ? ctx.knex.raw('??', [alias]) : expr],
      }
    },
  },

  /** `groupByEach(field: price, each: 50)` → "0-49", "50-99", ... */
  groupByEach: {
    args: { field: PropTypes.string.isRequired, each: PropTypes.number },
    columns: (node) => [node.alias !== node.name ? node.alias : (node.args.field as string)],
    sql: (node, ctx) => {
      const col = ctx.col(node.args.field as string, node.args.from as string | undefined)
      const amount = parseFloat(String(node.args.each))
      const alias = node.alias !== node.name ? node.alias : (node.args.field as string)
      return {
        select: [
          ctx.knex.raw(`(CAST(FLOOR(CEIL(??)/??) AS INT)*?? || '-' || CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??`, [
            col,
            amount,
            amount,
            col,
            amount,
            amount,
            amount - 1,
            alias,
          ]),
        ],
        groupBy: [ctx.knex.raw('CAST(FLOOR(CEIL(??)/??) AS INT)', [col, amount])],
      }
    },
  },

  /** `combine(fields: [date, device])` → several identity columns on one node */
  combine: {
    args: {
      fields: PropTypes.arrayOf(
        PropTypes.oneOfType([PropTypes.string, PropTypes.shape({ name: PropTypes.string.isRequired, alias: PropTypes.string })]),
      ).isRequired,
    },
    columns: (node) => combineFields(node.args.fields).map((f) => f.alias),
    sql: (node, ctx) => {
      const fields = combineFields(node.args.fields)
      const from = node.args.from as string | undefined
      return {
        select: fields.map((f) => {
          const col = ctx.col(f.name, from)
          return f.alias === f.name ? ctx.knex.raw('??', [col]) : ctx.knex.raw('?? AS ??', [col, f.alias])
        }),
        groupBy: fields.map((f) => ctx.knex.raw('??', [ctx.col(f.name, from)])),
      }
    },
  },
}

export function combineFields(fields: unknown): { name: string; alias: string }[] {
  if (!Array.isArray(fields)) throw new GritqlError('ARGS', "Combine function requires 'fields' argument with a list of fields")
  return fields.map((f) => {
    if (typeof f === 'string') return { name: f, alias: f }
    if (f && typeof f === 'object' && typeof (f as any).name === 'string') {
      return { name: (f as any).name, alias: (f as any).alias ?? (f as any).name }
    }
    throw new GritqlError('ARGS', 'Combine by elements must have name')
  })
}
