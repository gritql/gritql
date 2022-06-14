import { Knex } from 'knex'
import { changeQueryTable, join, JoinType } from '../cross-table'
import { applyFilters, buildFullName, withFilters } from '../filters'
import { PropTypes } from '../types'
import { metricWrapper } from './wrapper'

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
      from: PropTypes.string,
    },
    ['PERCENTILE_CONT', 'WITHIN GROUP'],
  ),
  median: metricWrapper(
    (alias, args, query, knex) => {
      let partition: Knex.Raw
      if (!!args.by) {
        let partitionBy = buildFullName(args, query, args.by, false)
        if (query.replaceWith?.[args.by]) {
          partitionBy = query.replaceWith[args.by].value
        }
        partition = knex.raw(`PARTITION BY ??`, [partitionBy])
      }

      return query.promise.select(
        knex.raw(`MEDIAN(??) OVER (${partition || ''}) AS ??`, [args.a, alias]),
      )
    },
    {
      from: PropTypes.string,
      a: PropTypes.string.isRequired,
      by: PropTypes.string,
    },
    ['MEDIAN', 'PARTITION BY', 'ORDER BY'],
  ),
  sum: metricWrapper(
    (alias, args, query) => {
      return query.promise.sum(
        `${buildFullName(args, query, args.a, false)} as ${alias}`,
      )
    },
    {
      a: PropTypes.string,
      from: PropTypes.string,
    },
    ['SUM'],
  ),
  min: metricWrapper(
    (alias, args, query) => {
      return query.promise.min(
        `${buildFullName(args, query, args.a, false)} as ${alias}`,
      )
    },
    {
      a: PropTypes.string.isRequired,
      from: PropTypes.string,
    },
    ['MIN'],
  ),
  max: metricWrapper(
    (alias, args, query) => {
      return query.promise.max(
        `${buildFullName(args, query, args.a, false)} as ${alias}`,
      )
    },
    {
      a: PropTypes.string.isRequired,
      from: PropTypes.string,
    },
    ['MAX'],
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
      from: PropTypes.string,
    },
    ['COUNT'],
  ),
  countDistinct: metricWrapper(
    (alias, args, query) => {
      return query.promise.countDistinct(
        `${buildFullName(args, query, args.a, false)} as ${alias}`,
      )
    },
    {
      a: PropTypes.string.isRequired,
      from: PropTypes.string,
    },
    ['COUNT', 'DISTINCT'],
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
      let partition: Knex.Raw
      if (!!args.by) {
        let partitionBy = buildFullName(args, query, args.by, false)
        if (query.replaceWith?.[args.by]) {
          partitionBy = query.replaceWith[args.by].value
        }
        partition = knex.raw(`partition by ??`, [partitionBy])
      }

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
        withFilters(query.filters)(
          knex
            .select('*')
            .select(
              knex.raw(
                `${alg}() over (${partition || ''} ORDER BY ?? desc) as ??`,
                [buildFullName(args, query, args.a, false), alias],
              ),
            )
            .from(query.table || args.from),
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
      from: PropTypes.string,
      tableAlias: PropTypes.string,
    },
    ['DENSE_RANK', 'RANK', 'ROW_NUMBER', 'OVER', 'PARTITION BY'],
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
    { a: PropTypes.string.isRequired, from: PropTypes.string },
    ['PLAINTO_TSQUERY', 'TO_TSVECTOR', 'TS_RANK'],
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
      from: PropTypes.string,
    },
    ['PLAINTO_TSQUERY', 'TS_HEADLINE'],
  ),
  unique: metricWrapper(
    (alias, args, query) => {
      const field = buildFullName(args, query, args?.a || alias, false)

      return query.promise.select(`${field} as ${alias}`).groupBy(field)
    },
    {
      a: PropTypes.string,
      from: PropTypes.string,
    },
    ['GROUP BY'],
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
  ),
  avg: metricWrapper(
    (alias, args, query, knex) => {
      //TODO: test
      if (!!args.by) {
        return query.promise.select(
          knex.raw(`avg(??) over (partition by ??)::float4 as ??`, [
            buildFullName(args, query, args.a, false),
            buildFullName(args, query, args.by, false),
            alias,
          ]),
        )
      } else {
        return query.promise.avg(
          `${buildFullName(args, query, args.a, false)} as ${alias}`,
        )
      }
    },
    {
      a: PropTypes.string.isRequired,
      by: PropTypes.string,
      from: PropTypes.string,
    },
    ['AVG', 'PARTITION BY'],
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
      from: PropTypes.string,
    },
    ['SUM', 'COUNT', 'DISTINCT'],
  ),
  share: metricWrapper(
    (alias, args, query, knex) => {
      let partition: Knex.Raw
      if (!!args.by) {
        let partitionBy = buildFullName(args, query, args.by, false)
        if (query.replaceWith?.[args.by]) {
          partitionBy = query.replaceWith[args.by].value
        }
        partition = knex.raw(`partition by ??`, [partitionBy])
      }

      return query.promise.select(
        knex.raw(
          `sum(??)/NULLIF(sum(sum(??)) over (${
            partition || ''
          }), 0)::float4 as ??`,
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
      from: PropTypes.string,
    },
    ['SUM', 'NULLIF', 'OVER', 'PARTITION BY'],
  ),
  indexed: metricWrapper(
    (alias, args, query, knex) => {
      let partition: Knex.Raw
      if (!!args.by)
        partition = knex.raw(`partition by ??`, [
          buildFullName(args, query, args.by, false),
        ])
      return query.promise.select(
        knex.raw(
          `sum(??)/NULLIF(max(sum(??)::float) over (${
            partition || ''
          }), 0)::float4 as ??`,
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
      from: PropTypes.string,
    },
    ['MAX', 'SUM', 'NULLIF', 'OVER', 'PARTITION BY'],
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
      from: PropTypes.string,
    },
    ['CAST', 'NULLIF'],
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
      from: PropTypes.string,
    },
    ['SUM', 'MAX', 'GROUP BY'],
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
      from: PropTypes.string,
    },
    ['SUM', 'GROUP BY'],
  ),
  distinct: metricWrapper(
    (alias, args, query) => {
      return query.promise.distinct(buildFullName(args, query, alias, false))
    },
    {
      from: PropTypes.string,
    },
    ['DISTINCT'],
  ),
  default: metricWrapper((alias, args, query, _, { tree }) => {
    // Getters are needed only for additionaly selected fields by some specific functions
    // example: price(groupByEach: 50) -> price: 0-50 -> groupByEach_min_price: 0 -> groupByEach_max_price: 50
    // would be useful for further grouping && filtering
    const isInGetters = query.getters?.find((name) => name === tree.name.value)
    if (!isInGetters) {
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

    return query.promise
  }),
}
