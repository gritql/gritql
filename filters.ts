import * as _ from 'lodash'
import { argumentsToObject } from './arguments'
import { changeQueryTable, join, JoinType } from './cross-table'

export type Model = { [key: string]: unknown }

export type Filter = {
  [Property in Join<NestedPaths<Model>, '.'>]?: Condition<
    PropertyType<Model, Property>
  >
} & RootFilterOperators

export type Join<T extends unknown[], D extends string> = T extends []
  ? ''
  : T extends [string | number]
  ? `${T[0]}`
  : T extends [string | number, ...infer R]
  ? `${T[0]}${D}${Join<R, D>}`
  : string

export type NestedPaths<Type> = Type extends string | number | boolean
  ? []
  : Type extends ReadonlyArray<infer ArrayType>
  ? [number, ...NestedPaths<ArrayType>]
  : Type extends Map<string, any>
  ? [string]
  : Type extends object
  ? {
      [Key in Extract<keyof Type, string>]: [Key, ...NestedPaths<Type[Key]>]
    }[Extract<keyof Type, string>]
  : []

export type PropertyType<
  Type,
  Property extends string,
> = string extends Property
  ? unknown
  : Property extends keyof Type
  ? Type[Property]
  : Property extends `${number}`
  ? Type extends ReadonlyArray<infer ArrayType>
    ? ArrayType
    : unknown
  : Property extends `${infer Key}.${infer Rest}`
  ? Key extends `${number}`
    ? Type extends ReadonlyArray<infer ArrayType>
      ? PropertyType<ArrayType, Rest>
      : unknown
    : Key extends keyof Type
    ? Type[Key] extends Map<string, infer MapType>
      ? MapType
      : PropertyType<Type[Key], Rest>
    : unknown
  : unknown

export interface RootFilterOperators extends Model {
  and?: Filter[]
  nor?: Filter[]
  or?: Filter[]
  not?: Filter[]
  search?: Filter & {
    language?: string
    // caseSensitive?: boolean
    // diacriticSensitive?: boolean
  }
}

export type EnhancedOmit<TRecordOrUnion, KeyUnion> =
  string extends keyof TRecordOrUnion
    ? TRecordOrUnion
    : TRecordOrUnion extends any
    ? Pick<TRecordOrUnion, Exclude<keyof TRecordOrUnion, KeyUnion>>
    : never

export type Condition<T> =
  | AlternativeType<T>
  | FilterOperators<AlternativeType<T>>

export type AlternativeType<T> = T extends ReadonlyArray<infer U>
  ? T | RegExpOrString<U>
  : RegExpOrString<T>

export type RegExpOrString<T> = T extends string ? RegExp | T : T

export interface FilterOperators<TValue = unknown> extends Model {
  eq?: TValue
  gt?: TValue
  gte?: TValue
  in?: ReadonlyArray<TValue>
  lt?: TValue
  lte?: TValue
  ne?: TValue
  nin?: ReadonlyArray<TValue>
  regex?: TValue
  from?: string
  inherited?: boolean
}

export interface BuilderContext<T = string | number | boolean> {
  query: any
  knex: any
  onlyInherited?: boolean
  from?: string
  inherited?: boolean
  ignoreFrom?: boolean
  valueTransformer: <V = T>(
    context: BuilderContext<V>,
    k: string,
    v: V,
  ) =>
    | V
    | string
    | {
        value: V | string
        isField: boolean
      }
}

const filterOperators: Array<
  keyof (FilterOperators & RootFilterOperators) | 'from' | 'inherited'
> = [
  'and',
  'eq',
  'gt',
  'gte',
  'in',
  'lt',
  'lte',
  'ne',
  'nin',
  'nor',
  'not',
  'or',
  'regex',
  'search',
  'from',
  'inherited',
]

export function buildFullName(
  args: any | any[],
  query,
  field: string,
  evaluateOnlyWithLinkSymbol = true,
) {
  args = Array.isArray(args) ? argumentsToObject(args) : args
  const table = args?.from || query.table

  if (!field?.startsWith('@') && (evaluateOnlyWithLinkSymbol || !args?.from)) {
    return field
  } else {
    return `${table}.${field.replace(/^@/, '')}`
  }
}

function runDefaultRunner(
  context,
  operator: ((options) => string) | string,
  field,
  subQuery,
) {
  return runOrSkip(
    context,
    typeof operator === 'string'
      ? ({ key, value, isField, context }) =>
          context.knex.raw(`?? ${operator} ${isField ? '??' : '?'}`, [
            key,
            value,
          ])
      : operator,
    ({ context }) =>
      buildFullName(
        { ...context, from: context.from || context.query.table },
        context.query,
        field,
        false,
      ),
    '',
    context.valueTransformer(context, field, subQuery),
  )
}

function runOrSkip(context: BuilderContext, runner, key, accum, value) {
  let ctx = context

  if (typeof key === 'function') {
    key = key({ context: ctx })
  }

  if (key === 'from') {
    if (!ctx.ignoreFrom) {
      ctx.from = value
    }

    return accum
  } else if (key === 'inherited') {
    ctx.inherited = value

    return accum
  }

  if (
    ctx.onlyInherited &&
    ctx.inherited === false &&
    ![ctx.query.table, ...ctx.query.joins].includes(ctx.from || ctx.query.table)
  ) {
    return accum
  } else {
    const v = value?.isField ? value.value : value?.value || value

    return runner({ key, value: v, isField: value?.isField, context: ctx })
  }
}

function getCombineRunner(accum, runner, combiner = 'AND') {
  const res = runner()

  if (res) {
    if (accum) {
      return `${accum} ${combiner} (${res})`
    } else {
      return `(${res})`
    }
  } else {
    return accum
  }
}

export function buildFilter(
  query: Filter,
  context: BuilderContext,
  prefix = '',
) {
  const ops = _.mapValues(_.keyBy(filterOperators), (op) => `${prefix}${op}`)
  const isOp = (key) => _.includes(_.values(ops), key)
  const getOp = (key) => (isOp(key) ? key : null)

  const sub = (subQuery, op, field, context: BuilderContext) => {
    switch (op) {
      case ops.and:
        return runOrSkip(
          context,
          ({ context }) =>
            '(' +
            _.reduce(
              subQuery,
              (accum, cur) => {
                return runOrSkip(
                  context,
                  ({ context }) =>
                    getCombineRunner(accum, () =>
                      buildFilter(cur, context, prefix),
                    ),
                  '',
                  accum,
                  cur,
                )
              },
              '',
            ) +
            ')',
          '',
          '',
          subQuery,
        )

      case ops.or:
        return runOrSkip(
          context,
          ({ context }) =>
            '(' +
            _.reduce(
              subQuery,
              (accum, cur) => {
                return runOrSkip(
                  context,
                  ({ context }) =>
                    getCombineRunner(
                      accum,
                      () => buildFilter(cur, context, prefix),
                      'OR',
                    ),
                  '',
                  accum,
                  '',
                )
              },
              '',
            ) +
            ')',
          '',
          '',
          subQuery,
        )

      case ops.nor:
        return runOrSkip(
          context,
          ({ context }) =>
            'NOT (' +
            _.reduce(
              subQuery,
              (accum, cur) => {
                return runOrSkip(
                  context,
                  ({ context }) =>
                    getCombineRunner(
                      accum,
                      () => buildFilter(cur, context, prefix),
                      'OR',
                    ),
                  '',
                  accum,
                  cur,
                )
              },
              '',
            ) +
            ')',
          '',
          '',
          subQuery,
        )

      case ops.in:
        if (!_.isArray(subQuery)) {
          throw 'IN requries array value'
        }

        return runDefaultRunner(
          context,
          ({ key: k, value: v, context }) =>
            context.knex.raw(
              `?? IN (${_.map(subQuery, () => '?').join(',')})`,
              [k, ...v],
            ),
          field,
          subQuery,
        )

      case ops.nin:
        if (!_.isArray(subQuery)) {
          throw 'NIN requries array value'
        }

        return runDefaultRunner(
          context,
          ({ key: k, value: v, context }) =>
            context.knex.raw(
              `?? NOT IN(${_.map(subQuery, () => '?').join(',')})`,
              [k, ...v],
            ),
          field,
          subQuery,
        )

      case ops.eq:
        return runDefaultRunner(context, '=', field, subQuery)

      case ops.gt:
        return runDefaultRunner(context, '>', field, subQuery)

      case ops.gte:
        return runDefaultRunner(context, '>=', field, subQuery)

      case ops.lt:
        return runDefaultRunner(context, '<', field, subQuery)

      case ops.lte:
        return runDefaultRunner(context, '<=', field, subQuery)

      case ops.ne:
        return runDefaultRunner(context, '<>', field, subQuery)

      case ops.not:
        return runOrSkip(
          context,
          () => `NOT (${buildFilter(subQuery, context, prefix)})`,
          '',
          '',
          subQuery,
        )

      case ops.regex:
        return runDefaultRunner(context, 'LIKE', field, subQuery)

      case ops.search:
        if (_.isObject(subQuery)) {
          if (_.every(subQuery, isOp)) {
            throw 'At least one property of search must be related to field'
          }

          if (
            !context.query.providers[context.query.provider].keywords.includes(
              'TO_TSVECTOR',
            )
          ) {
            throw new Error(
              `Full text search is not supported by ${context.query.provider} provider`,
            )
          }

          return _.reduce(
            subQuery,
            (accum, v, k) => {
              if (isOp(k)) {
                return runOrSkip(
                  context,
                  ({ context }) =>
                    getCombineRunner(accum, () =>
                      sub(v, getOp(k), field, { ...context }),
                    ),
                  k,
                  accum,
                  v,
                )
              }

              const key = buildFullName(
                { ...context, from: context.from || context.query.table },
                context.query,
                k,
                false,
              )
              const value = context.valueTransformer(context, k, v) as any

              const transformedValue = value?.isField
                ? value.value
                : value?.value || value

              if (context.query.search?.[key]) {
                throw `Search for ${key} already defined`
              }

              context.query.search = {
                ...context.query.search,
                [key]: context.query.search?.[key] || value,
              }

              const tsQuery = context.knex.raw(
                `to_tsvector('simple', ??) @@ (plainto_tsquery('simple', ${
                  value?.isField ? '??' : '?'
                })::text || ':*')::tsquery`,
                [key, transformedValue],
              )

              return runOrSkip(
                context,
                () => (accum ? `${accum} AND ${tsQuery}` : tsQuery),
                key,
                accum,
                value,
              )
            },
            '',
          )
        } else {
          throw 'Search filter requires object value'
        }
      default:
        return _.isObject(subQuery)
          ? _.reduce(
              subQuery,
              (accum, v, k) => {
                return runOrSkip(
                  context,
                  ({ context }) =>
                    getCombineRunner(accum, () =>
                      sub(v, getOp(k), field, { ...context }),
                    ),
                  k,
                  accum,
                  v,
                )
              },
              '',
            )
          : field
          ? runDefaultRunner(context, '=', field, subQuery)
          : subQuery
    }
  }

  return _.reduce(
    query,
    (accum, subQuery, key) => {
      const field = isOp(key) ? null : key
      const op = isOp(key) ? key : null

      return runOrSkip(
        context,
        ({ context }) =>
          getCombineRunner(accum, () =>
            sub(subQuery, op, field, { ...context }),
          ),
        key,
        accum,
        subQuery,
      )
    },
    '',
  )
}

export function parseAdvancedFilters(
  query,
  knex,
  filters: Filter & { having?: Filter },
  onlyInherited?: boolean,
  from?: string,
) {
  const result = {
    where: '',
    having: '',
  }

  if (filters) {
    let where = _.omit(filters, ['having'])

    if (from) {
      where = { ...where, from }
    }

    result.where = buildFilter(where, {
      query,
      knex,
      onlyInherited,
      valueTransformer(context, k, v) {
        return v
      },
    })

    if (filters.having) {
      let having = filters.having

      if (from) {
        having = { ...having, from }
      }

      result.having = buildFilter(having, {
        query,
        knex,
        onlyInherited,
        valueTransformer(context, k, v) {
          return v
        },
      })
    }
  }

  return result
}

export function applyFilters(query, knexPipe, knex) {
  if (query.preparedAdvancedFilters?.where) {
    knexPipe.where(knex.raw(query.preparedAdvancedFilters.where))
  }

  if (query.preparedAdvancedFilters?.having) {
    knexPipe.having(knex.raw(query.preparedAdvancedFilters.having))
  }

  return knexPipe
}

export function applyRawJoin(
  query,
  knex,
  joinType: string,
  from: string,
  on: Filter,
) {
  query.joins = query.joins || []
  query.joins.push(from)

  return (query.promise = query.promise.joinRaw(
    `${joinType
      .split(/(?=[A-Z])/)
      .join(' ')
      .toUpperCase()} ?? ON ${buildFilter(on, {
      query,
      knex,
      from,
      ignoreFrom: true,
      valueTransformer(context, k, v) {
        if (typeof v === 'string') {
          return {
            value: buildFullName(
              { context, from: context.query.table },
              context.query,
              v,
              true,
            ),
            isField: v?.startsWith('@'),
          }
        } else {
          return v
        }
      },
    })}`,
    [from],
  ))
}

export function withFilters(filters) {
  return (knexPipe) => {
    return filters.reduce((knexNext, filter, i) => {
      const selector =
        filter[1] === 'in' ? 'whereIn' : i === 0 ? 'where' : 'andWhere'
      return knexNext[selector].apply(
        knexNext,
        filter[1] === 'in'
          ? filter.filter((a) => a !== 'in')
          : filter[1] === 'search'
          ? [
              knexNext.raw(
                `to_tsvector('simple', ??) @@ (plainto_tsquery('simple', ?)::text || ':*')::tsquery)`,
                [filter[0], filter[2]],
              ),
            ]
          : filter,
      )
    }, knexPipe)
  }
}

export function transformFilters(args, query?, knex?) {
  return args.reduce((res, arg) => {
    if (arg.name.value === 'from') {
      return res
    }

    // We need to ensure that we are not in join context
    if (!!knex) {
      if (arg.name.value === 'table') {
        changeQueryTable(query, knex, arg.value.value, false)
        return res
      }

      if (arg.name.value === 'filters') {
        query.advancedFilters = argumentsToObject(arg.value.fields)
        query.preparedAdvancedFilters = parseAdvancedFilters(
          query,
          knex,
          query.advancedFilters,
          true,
        )
        return res
      }
    }

    if (Object.values(JoinType).includes(arg.name.value)) {
      if (query && knex) {
        join(arg.name.value)(arg.value, query, knex)
        return res
      } else {
        throw "Join can't be called inside of join"
      }
    }

    if (arg.name.value === 'search') {
      if (!query.providers[query.provider].keywords.includes('TO_TSVECTOR')) {
        throw new Error(
          `Full text search is not supported by ${query.provider} provider`,
        )
      }

      const elements = argumentsToObject(arg.value.value)

      return res.concat([
        Object.keys(elements).reduce((accum, k) => {
          const key = buildFullName(args, query, k, false)
          const v = elements[k]

          if (query.search?.[key]) {
            throw `Search for ${key} already defined`
          }

          query.search = {
            ...query.search,
            [key]: query.search?.[key] || v,
          }

          accum.push([key, 'search', v])

          return accum
        }, []),
      ])
    }

    if (arg.name.value.endsWith('_gt'))
      return res.concat([
        [
          buildFullName(args, query, arg.name.value.replace('_gt', ''), false),
          '>',
          arg.value.value,
        ],
      ])
    if (arg.name.value.endsWith('_gte'))
      return res.concat([
        [
          buildFullName(args, query, arg.name.value.replace('_gte', ''), false),
          '>=',
          arg.value.value,
        ],
      ])
    if (arg.name.value.endsWith('_lt'))
      return res.concat([
        [
          buildFullName(args, query, arg.name.value.replace('_lt', ''), false),
          '<',
          arg.value.value,
        ],
      ])
    if (arg.name.value.endsWith('_lte'))
      return res.concat([
        [
          buildFullName(args, query, arg.name.value.replace('_lte', ''), false),
          '<=',
          arg.value.value,
        ],
      ])
    if (arg.name.value.endsWith('_like'))
      return res.concat([
        [
          buildFullName(
            args,
            query,
            arg.name.value.replace('_like', ''),
            false,
          ),
          'LIKE',
          arg.value.value,
        ],
      ])
    if (arg.name.value.endsWith('_in'))
      return res.concat([
        [
          buildFullName(args, query, arg.name.value.replace('_in', ''), false),
          'in',
          arg.value.value.split('|'),
        ],
      ])
    return res.concat([
      [buildFullName(args, query, arg.name.value, false), '=', arg.value.value],
    ])
  }, [])
}
