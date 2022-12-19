import { Knex } from 'knex'
import { InferProps } from 'prop-types'
import { changeQueryTable, join, JoinType } from '../cross-table'
import { applyFilters, buildFullName, withFilters } from '../filters'
import { PropTypes } from '../types'
import { metricWrapper } from './wrapper'
import type { DocumentNode } from 'graphql'

export const partitionByTypes = {
  by: PropTypes.string,
}

export function partitionBy(
  args: InferProps<typeof partitionByTypes>,
  query,
  knex: Knex,
) {
  let partition: Knex.Raw
  if (!!args.by) {
    let partitionBy = buildFullName(args, query, args.by, false)
    if (query.replaceWith?.[args.by]) {
      partitionBy = query.replaceWith[args.by].value
    }
    partition = knex.raw(`PARTITION BY ??`, [partitionBy])
  }

  return partition || ''
}

export function getOverClosure(
  args: InferProps<typeof partitionByTypes>,
  query,
  knex: Knex,
  options?: {
    orderBy?: { by: string; dir?: 'ASC' | 'DESC' }
    cast?: String
  },
) {
  const partition = partitionBy(args, query, knex)
  const isAnyValidOptionAvailable = options && options.orderBy

  if (!isAnyValidOptionAvailable && !partition) {
    return 'OVER()'
  }

  return knex.raw(
    `OVER(${partition}${
      options?.orderBy
        ? knex.raw(`ORDER BY ?? ${options.orderBy.dir || 'DESC'}`, [
            options.orderBy.by,
          ])
        : ''
    })${options?.cast ? `::${options.cast}` : ''}`,
  )
}

export const metricResolvers = {
  percentile: metricWrapper(
    (alias, args, query, knex) => {
      return query.promise.select(
        knex.raw(`PERCENTILE_CONT(??) WITHIN GROUP(ORDER BY ??) AS ??`, [
          parseFloat(args.factor) || 0.5,
          buildFullName(args, query, args.a, false),
          alias,
        ]),
      )
    },
    {
      a: PropTypes.string.isRequired,
      factor: PropTypes.number,
    },
    ['PERCENTILE_CONT', 'WITHIN GROUP'],
    'knex',
  ),
  median: metricWrapper(
    (alias, args, query, knex) => {
      return query.promise.select(
        knex.raw(`MEDIAN(??) ${getOverClosure(args, query, knex)} AS ??`, [
          args.a,
          alias,
        ]),
      )
    },
    {
      a: PropTypes.string.isRequired,
      by: PropTypes.string,
    },
    ['MEDIAN', 'PARTITION BY', 'ORDER BY'],
    'knex',
  ),
  sum: metricWrapper(
    (alias, args, query) => {
      return query.promise.sum(
        `${buildFullName(args, query, args.a, false)} as ${alias}`,
      )
    },
    {
      a: PropTypes.string,
    },
    ['SUM'],
    'knex',
  ),
  min: metricWrapper(
    (alias, args, query) => {
      return query.promise.min(
        `${buildFullName(args, query, args.a, false)} as ${alias}`,
      )
    },
    {
      a: PropTypes.string.isRequired,
    },
    ['MIN'],
    'knex',
  ),
  max: metricWrapper(
    (alias, args, query) => {
      return query.promise.max(
        `${buildFullName(args, query, args.a, false)} as ${alias}`,
      )
    },
    {
      a: PropTypes.string.isRequired,
    },
    ['MAX'],
    'knex',
  ),
  count: metricWrapper(
    (alias, args, query) => {
      return query.promise.count(
        args.a
          ? `${buildFullName(args, query, args.a, false)} as ${alias}`
          : '1',
      )
    },
    {
      a: PropTypes.string,
    },
    ['COUNT'],
    'knex',
  ),
  countDistinct: metricWrapper(
    (alias, args, query) => {
      return query.promise.countDistinct(
        `${buildFullName(args, query, args.a, false)} as ${alias}`,
      )
    },
    {
      a: PropTypes.string.isRequired,
    },
    ['COUNT', 'DISTINCT'],
    'knex',
  ),
  join: join(JoinType.DEFAULT),
  leftJoin: join(JoinType.LEFT),
  rightJoin: join(JoinType.RIGHT),
  fullJoin: join(JoinType.FULL),
  innerJoin: join(JoinType.INNER),
  leftOuterJoin: join(JoinType.LEFT_OUTER),
  rightOuterJoin: join(JoinType.RIGHT_OUTER),
  fullOuterJoin: join(JoinType.FULL_OUTER),
  ranking: metricWrapper(
    (alias, args, query, knex) => {
      let alg = 'DENSE_RANK'

      if (args.alg === 'denseRank') {
        alg = 'DENSE_RANK'
      } else if (args.alg === 'rank') {
        alg = 'RANK'
      } else if (args.alg === 'rowNumber') {
        alg = 'ROW_NUMBER'
      }

      const promise = applyFilters(
        query,
        withFilters(query, query.filters)(
          knex
            .select('*')
            .select(
              knex.raw(
                `${alg}() ${getOverClosure(args, query, knex, {
                  orderBy: { by: buildFullName(args, query, args.a, false) },
                })} as ??`,
                [alias],
              ),
            )
            .from(query.table || args.from),
          knex,
        ),
        knex,
      )

      const table = args.tableAlias || args.from || query.table

      const finalPromise = query.promise
        .select(buildFullName({ from: table }, query, alias, false))
        .from(promise.as(args.tableAlias || query.table))

      changeQueryTable(query, knex, table, true)

      finalPromise.groupBy(buildFullName({ from: table }, query, alias, false))

      return finalPromise
    },
    {
      a: PropTypes.string.isRequired,
      by: PropTypes.string,
      alg: PropTypes.oneOf(['denseRank', 'rank', 'rowNumber']),
      tableAlias: PropTypes.string,
    },
    ['DENSE_RANK', 'RANK', 'ROW_NUMBER', 'OVER', 'PARTITION BY'],
    'knex',
  ),
  searchRanking: metricWrapper(
    (alias, args, query, knex) => {
      const key = buildFullName(
        { from: args.from || query.table },
        query,
        args.a,
        false,
      )

      if (!query.search[key])
        throw `SearchRanking requires search query for ${key} field`

      return query.promise.select(
        knex.raw(
          "ts_rank(to_tsvector('simple', ??), (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??",
          [key, query.search[key], alias],
        ),
      )
    },
    { a: PropTypes.string.isRequired },
    ['PLAINTO_TSQUERY', 'TO_TSVECTOR', 'TS_RANK'],
    'knex',
  ),
  searchHeadline: metricWrapper(
    (alias, args, query, knex) => {
      const key = buildFullName(
        { from: args.from || query.table },
        query,
        args.a,
        false,
      )

      if (!query.search[key])
        throw `SearchHeadline requires search query for ${key} field`

      return query.promise.select(
        knex.raw(
          "ts_headline('simple', ??, (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??",
          [key, query.search[key], alias],
        ),
      )
    },
    {
      a: PropTypes.string.isRequired,
    },
    ['PLAINTO_TSQUERY', 'TS_HEADLINE'],
    'knex',
  ),
  unique: metricWrapper(
    (alias, args, query) => {
      const field = buildFullName(args, query, args?.a || alias, false)

      return query.promise.select(`${field} as ${alias}`).groupBy(field)
    },
    {
      a: PropTypes.string,
    },
    ['GROUP BY'],
    'knex',
  ),
  from: metricWrapper(
    (alias, args, query) => {
      const field = buildFullName(args, query, args?.a || alias, false)

      return query.promise.select(`${field} as ${alias}`)
    },
    {
      a: PropTypes.string,
      from: PropTypes.string.isRequired,
    },
    [],
    'knex',
  ),
  avg: metricWrapper(
    (alias, args, query, knex) => {
      return query.promise.select(
        knex.raw(
          `avg(??) ${getOverClosure(args, query, knex, {
            cast: 'float4',
          })} as ??`,
          [buildFullName(args, query, args.a, false), alias],
        ),
      )
    },
    {
      a: PropTypes.string.isRequired,
      by: PropTypes.string,
    },
    ['AVG', 'PARTITION BY'],
    'knex',
  ),
  avgPerDimension: metricWrapper(
    (alias, args, query, knex) => {
      return query.promise.select(
        knex.raw(`sum(??)::float/COUNT(DISTINCT ??)::float4 as ??`, [
          buildFullName(args, query, args.a, false),
          buildFullName(args, query, args.per, false),
          alias,
        ]),
      )
    },
    {
      a: PropTypes.string.isRequired,
      per: PropTypes.string.isRequired,
    },
    ['SUM', 'COUNT', 'DISTINCT'],
    'knex',
  ),
  share: metricWrapper(
    (alias, args, query, knex) => {
      return query.promise.select(
        knex.raw(
          `sum(??)/NULLIF(sum(sum(??)) ${getOverClosure(
            args,
            query,
            knex,
          )}, 0)::float4 as ??`,
          [
            buildFullName(args, query, args.a, false),
            buildFullName(args, query, args.a, false),
            alias,
          ],
        ),
      )
    },
    {
      a: PropTypes.string.isRequired,
      by: PropTypes.string,
    },
    ['SUM', 'NULLIF', 'OVER', 'PARTITION BY'],
    'knex',
  ),
  indexed: metricWrapper(
    (alias, args, query, knex) => {
      return query.promise.select(
        knex.raw(
          `sum(??)/NULLIF(max(sum(??)::float) ${getOverClosure(
            args,
            query,
            knex,
          )}, 0)::float4 as ??`,
          [
            buildFullName(args, query, args.a, false),
            buildFullName(args, query, args.a, false),
            alias,
          ],
        ),
      )
    },
    {
      a: PropTypes.string.isRequired,
      by: PropTypes.string,
    },
    ['MAX', 'SUM', 'NULLIF', 'OVER', 'PARTITION BY'],
    'knex',
  ),
  divide: metricWrapper(
    (alias, args, query, knex) => {
      const functions = Object.keys(args).reduce(
        (r, k) => {
          const fns = args[k].split('|')
          if (fns.length === 2) {
            args[k] = fns[1]
            r[k] = fns[0]
          }
          return r
        },
        { a: 'sum', by: 'sum' },
      )

      return query.promise.select(
        knex.raw(
          `cast(??(??) as float)/NULLIF(cast(??(??) as float), 0)::float4 as ??`,
          [
            functions.a,
            buildFullName(args, query, args.a, false),
            functions.by,
            buildFullName(args, query, args.by, false),
            alias,
          ],
        ),
      )
    },
    {
      a: PropTypes.string.isRequired,
      by: PropTypes.string.isRequired,
    },
    ['CAST', 'NULLIF'],
    'knex',
  ),
  multiply: metricWrapper(
    (alias, args, query, knex) => {
      const functions = Object.keys(args).reduce(
        (r, k) => {
          if (typeof args[k] !== 'string') return r
          const fns = args[k].split('|')
          if (fns.length === 2) {
            args[k] = fns[1]
            r[k] = fns[0]
          }
          return r
        },
        { a: 'sum', by: 'sum' },
      )
      let bySql = {
        query: `cast(??(??) as float)`,
        variables: [functions.by, buildFullName(args, query, args.by, false)],
      }
      //if type of args by is number
      if (typeof args.by === 'number') {
        bySql = {
          query: `?`,
          variables: [`${args.by}`],
        }
      }
      return query.promise.select(
        knex.raw(`cast(??(??) as float)*${bySql.query}::float4 as ??`, [
          functions.a,
          buildFullName(args, query, args.a, false),
          ...bySql.variables,
          alias,
        ]),
      )
    },
    {
      a: PropTypes.string.isRequired,
      by: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    },
    ['CAST', 'NULLIF'],
    'knex',
  ),
  aggrAverage: metricWrapper(
    (alias, args, query, knex) => {
      let internal = query.promise
        .select(buildFullName(args, query, alias, false))
        .sum(`${buildFullName(args, query, args.to, false)} as ${args.to}`)
        .sum(`${buildFullName(args, query, args.by, false)} as ${args.by}`)
        .select(
          knex.raw(`?? * sum(??) as "aggrAverage"`, [
            buildFullName(args, query, alias, false),
            buildFullName(args, query, args.to, false),
          ]),
        )
        .groupBy(buildFullName(args, query, alias, false))
      if (args.to !== args.by)
        internal = internal.sum(
          `${buildFullName(args, query, args.by, false)} as ${args.by}`,
        )

      let promise = knex
        .select(query.dimensions)
        .select(
          knex.raw(
            `sum("aggrAverage")/max(??)::float4  as "${alias}_aggrAverage"`,
            [buildFullName(args, query, args.by, false)],
          ),
        )
        .from(internal.as('middleTable'))

      if (!!query.dimensions && query.dimensions.length > 0) {
        promise = promise.groupBy(query.dimensions)
      }

      return promise
    },
    {
      to: PropTypes.string.isRequired,
      by: PropTypes.string.isRequired,
    },
    ['SUM', 'MAX', 'GROUP BY'],
    'knex',
  ),
  weightAvg: metricWrapper(
    (alias, args, query, knex) => {
      let internal = query.promise
        .select(buildFullName(args, query, args.a, false))
        .sum(`${buildFullName(args, query, args.by, false)} as ${args.by}`)
        .select(
          knex.raw(`?? * sum(??)::float4 as "weightAvg"`, [
            buildFullName(args, query, args.a, false),
            buildFullName(args, query, args.by, false),
          ]),
        )
        .groupBy(buildFullName(args, query, args.a, false))

      let promise = knex
        .select(query.dimensions)
        .select(
          knex.raw(`sum("weightAvg")/sum(??)::float4 as "${alias}"`, [
            buildFullName(args, query, args.by, false),
          ]),
        )
        .from(internal.as('middleTable'))

      if (!!query.dimensions && query.dimensions.length > 0) {
        promise = promise.groupBy(query.dimensions)
      }
    },
    {
      a: PropTypes.string.isRequired,
      by: PropTypes.string.isRequired,
    },
    ['SUM', 'GROUP BY'],
    'knex',
  ),
  distinct: metricWrapper(
    (alias, args, query) => {
      return query.promise.distinct(buildFullName(args, query, alias, false))
    },
    {},
    ['DISTINCT'],
    'knex',
  ),
  default: metricWrapper((alias, args, query, _, { tree }) => {
    // Getters are needed only for additionaly selected fields by some specific functions
    // example: price(groupByEach: 50) -> price: 0-50 -> groupByEach_min_price: 0 -> groupByEach_max_price: 50
    // would be useful for further grouping && filtering
    const isInGetters = query.getters?.find((name) => name === tree.name.value)
    if (!isInGetters) {
      if (query.provider === 'ga') {
        if (alias) {
          throw new Error(
            'Aliases for metrics are not supported by GA provider',
          )
        }
      } else {
        if (!alias) {
          return query.promise.select(
            `${buildFullName(args, query, tree.name.value)}`,
          )
        } else {
          return query.promise.select(
            `${buildFullName(args, query, tree.name.value)} as ${alias}`,
          )
        }
      }
    }

    return query.promise
  }),
}
