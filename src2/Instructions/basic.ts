import { Knex } from 'knex'
import { PropTypes } from '../../types'

export type Instruction = ((this, ctx: any, args: any) => any) & {
  name: string
  priority?: number
  argsTypeSpecs?: Object
  keywords?: Array<string>
}

export const sum: Instruction = function sum(
  this,
  { promise },
  { alias, args },
) {
  promise.sum(args.a).as(alias)
  return promise
}
sum.keywords = ['SUM']
sum.argsTypeSpecs = {
  a: PropTypes.string,
}

export const min: Instruction = function min(
  this,
  { promise },
  { alias, args },
) {
  promise.min(args.a).as(alias)
  return promise
}
min.keywords = ['MIN']
min.argsTypeSpecs = {
  a: PropTypes.string,
}

export const max: Instruction = function max(
  this,
  { promise },
  { alias, args },
) {
  promise.max(args.a).as(alias)
  return promise
}
max.keywords = ['MAX']
max.argsTypeSpecs = {
  a: PropTypes.string,
}

export const median: Instruction = function median(
  this,
  { promise, builder },
  { alias, args },
) {
  let over: Knex.Raw = undefined
  if (args.by) over = builder.raw(`OVER(??)`, [`PARTITION BY ${args.by}`])
  promise.select(builder.raw(`MEDIAN(??) ${over || ''} AS ??`, [args.a, alias]))
  return promise
}
median.keywords = ['MEDIAN', 'PARTITION BY', 'ORDER BY']
median.argsTypeSpecs = {
  a: PropTypes.string.isRequired,
  by: PropTypes.string,
}

export const count: Instruction = function count(
  this,
  { promise, builder },
  { alias, args },
) {
  return promise.count(args.a ? `${args.a} as ${alias}` : '1')
}

count.keywords = ['COUNT']
count.argsTypeSpecs = {
  a: PropTypes.string,
}

export const share: Instruction = function share(
  this,
  { promise, builder },
  { alias, args },
) {
  let over: Knex.Raw = undefined
  if (args.by) over = builder.raw(`OVER(??)`, [`PARTITION BY ${args.by}`])
  promise.select(
    builder.raw(`SUM(??)/NULLIF(SUM(SUM(??)) ${over || ''}, 0)::float4 AS ??`, [
      args.a,
      args.a,
      alias,
    ]),
  )
  return promise
}
share.keywords = ['SUM', 'NULLIF', 'PARTITION BY']
share.argsTypeSpecs = {
  a: PropTypes.string.isRequired,
  by: PropTypes.string,
}

export const indexed: Instruction = function indexed(
  this,
  { promise, builder },
  { alias, args },
) {
  let over: Knex.Raw = undefined
  if (args.by) over = builder.raw(`OVER(??)`, [`PARTITION BY ${args.by}`])
  promise.select(
    builder.raw(
      `SUM(??)/NULLIF(MAX(SUM(??)::float) ${over || ''}, 0)::float4 AS ??`,
      [args.a, args.a, alias],
    ),
  )
  return promise
}
indexed.keywords = ['SUM', 'NULLIF', 'MAX', 'PARTITION BY']

indexed.argsTypeSpecs = {
  a: PropTypes.string.isRequired,
  by: PropTypes.string,
}

export const divide: Instruction = function divide(
  this,
  { promise, builder },
  { alias, args },
) {
  promise.select(
    builder.raw(`SUM(??)::float4//NULLIF(SUM(??)::float4, 0) AS ??`, [
      args.a,
      args.by,
      alias,
    ]),
  )
  return promise
}
divide.keywords = ['SUM', 'NULLIF']
divide.argsTypeSpecs = {
  a: PropTypes.string.isRequired,
  by: PropTypes.string.isRequired,
}

export const defaultDimension: Instruction = function defaultDimension(
  this,
  { promise },
  { alias, args, name },
) {
  promise
    .select(name)
    .as(alias || name)
    .groupBy(name)
  return promise
}

export const basicSqlMetrics: Instruction[] = [
  sum,
  min,
  max,
  median,
  count,
  share,
  indexed,
  divide,
]

export const basicSqlDimensions: Instruction[] = [defaultDimension]
