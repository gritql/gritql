const gql = require('graphql-tag')
var pg = require('pg')
pg.types.setTypeParser(20, parseInt)
const knexConstructor = require('knex')
import { argumentsToObject } from './arguments'
import { parseDirective } from './directives'
import { gaQueryBuilder, gaMetricResolvers } from './gql-ga-slicer'
import {
  getBatchContext,
  progressiveGet,
  progressiveSet,
  replVars,
} from './progressive'
import { cloneDeep } from 'lodash'
import {
  applyFilters,
  applyRawJoin,
  buildFullName,
  parseAdvancedFilters,
} from './filters'

type TagObject = {
  kind: 'OperationDefinition'
  operation: 'query'
  name: any
  variableDefenitions: any
  derictives: any
  selectionSet: any
}
type GqlQuery = {
  promise: Promise<any>
  name: string
  filters: Array<string>
  postQueryTransform?: Array<Function>
}

type gqlBuildObject = {
  queries: Array<GqlQuery>
  sql: Array<string>
  definitions: Array<TagObject>
}
interface BeforeDbHandler {
  (QueryObject: gqlBuildObject): Promise<gqlBuildObject>
}
interface DbHandler {
  (QueryObject: gqlBuildObject): Promise<any>
}

interface metricResolver {
  (tree, query, knex): void
}

interface metricDataResolver {
  (tree, query): void
}

enum JoinType {
  DEFAULT = 'join',
  LEFT = 'leftJoin',
  RIGHT = 'rightJoin',
  FULL = 'fullJoin',
  INNER = 'innerJoin',
  LEFT_OUTER = 'leftOuterJoin',
  RIGHT_OUTER = 'rightOuterJoin',
  FULL_OUTER = 'fullOuterJoin',
}

function changeQueryTable(query, knex, table: string, dropJoins: boolean) {
  if (table !== query.table) {
    query.table = table
    query.promise.from(query.table)
    if (dropJoins) {
      query.joins = []
    }
    query.search = {}
    query.preparedAdvancedFilters = parseAdvancedFilters(
      query,
      knex,
      query.advancedFilters,
      true,
    )
  }

  return query
}

function transformFilters(args, query?, knex?) {
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

function join(type: JoinType) {
  return (tree, query, knex) => {
    if (!tree.arguments && !tree.fields)
      throw 'Join function requires arguments'

    const args = argumentsToObject(tree.arguments || tree.fields)
    if (!args.table) throw "Join function requires 'table' as argument"

    const byKeys = [
      'by',
      'by_gt',
      'by_gte',
      'by_lt',
      'by_lte',
      'by_like',
      'by_in',
    ].filter((key) => args[key] !== undefined)

    if (!byKeys.length && (!args.on || Object.keys(args.on).length === 0))
      throw "Join function requires 'by' or 'on' as argument"

    if (byKeys.length) {
      const filters = transformFilters(
        (tree.arguments || tree.fields)
          .filter(({ name: { value } }) => byKeys.includes(value))
          .concat({ name: { value: 'from' }, value: { value: args.table } }),
        query,
      )

      query.promise[type](args.table, function () {
        //this.on(function () {
        filters.forEach(([_, operator, value], index) => {
          const onFunc = index === 0 ? this.on : this.andOn

          let [leftSide, rightSide] = value.split(':')

          if (!leftSide || !rightSide) {
            throw "'by' argument inside Join function must include two fields (divided with :)"
          }

          leftSide = buildFullName({}, query, leftSide)

          rightSide = buildFullName({ from: args.table }, query, rightSide)

          onFunc.call(this, leftSide, operator, rightSide)
        })
        //})
      })
    } else {
      applyRawJoin(query, knex, type, args.table, args.on)
    }

    query.joins = query.joins || []
    query.joins.push(args.table)
  }
}

export const gqlToDb = (opts: any = { client: 'pg' }) => {
  const knex = knexConstructor(opts)
  let beforeDbHandler: BeforeDbHandler = (r) => Promise.resolve(r)
  let dbHandler: DbHandler = ({ queries }) => {
    return Promise.all(
      queries.map((q) => {
        //todo: remove this bullshit
        //I just need to rethink whole thing
        if (q.postQueryTransform) {
          return q.postQueryTransform.reduce((next, t: any) => {
            return next.then(t)
          }, q.promise)
        }
        return q.promise
      }),
    )
  }
  let afterDbHandler: Function = (r) => Promise.resolve(r)
  let customMetricResolvers = {}
  let customMetricDataResolvers = {}
  const gqlFetch = async (gqlQuery: string): Promise<any> => {
    try {
      const definitions = gql(gqlQuery).definitions

      const queries = queryBuilder(
        null,
        definitions,
        undefined,
        undefined,
        knex,
        { ...metricResolvers, ...customMetricResolvers },
      )
        .filter((q) => !q.skip)
        .map((q) => {
          q.promise = applyFilters(q, q.promise, knex)

          return q
        })
        .map((q) => {
          if (q.postQueryProcessing) q.postQueryProcessing(definitions, q, knex)
          if (q.generatePromise) q.promise = q.generatePromise(q)
          return q
        })

      const sql = queries
        .filter((q) => !q.isWith)
        .map((q) => q.promise.toString())
      const preparedGqlQuery = await beforeDbHandler({
        queries: queries.filter((q) => !q.isWith),
        sql,
        definitions,
      })
      if (!preparedGqlQuery) return null
      const resultFromDb = await dbHandler(preparedGqlQuery)
      if (!resultFromDb) return null
      afterDbHandler(definitions, resultFromDb)
      return await merge(definitions, resultFromDb, {
        ...metricResolversData,
        ...customMetricDataResolvers,
      })
    } catch (e) {
      console.log(e)
      throw Error(e)
      return null
    }
  }
  gqlFetch.beforeDbFetch = (fn: BeforeDbHandler) => {
    beforeDbHandler = fn
    return gqlFetch
  }
  gqlFetch.dbFetch = (fn: DbHandler) => {
    dbHandler = fn
    return gqlFetch
  }
  gqlFetch.afterDbFetch = (fn: Function) => {
    afterDbHandler = fn
    return gqlFetch
  }

  gqlFetch.useResolver = (name: string, fn: metricResolver) => {
    customMetricResolvers = { ...customMetricResolvers, [name]: fn }
  }
  gqlFetch.useDataResolver = (name: string, fn: metricDataResolver) => {
    customMetricDataResolvers = { ...customMetricDataResolvers, [name]: fn }
  }

  return gqlFetch
}

function queryBuilder(
  table,
  tree,
  queries: Array<any> | undefined = [],
  idx: number | undefined = undefined,
  knex,
  metricResolvers,
) {
  //console.log(queries.map(q => q.promise._statements))
  //console.log(tree, idx, queries)
  //console.log(queries, idx, tree.length)
  if (!!~idx && idx !== undefined && !queries[idx])
    queries[idx] = { idx, name: undefined }
  const query = queries[idx]
  if (Array.isArray(tree)) {
    //we replace query with next level
    return tree.reduce(
      (queries, t, i) =>
        queryBuilder(
          table,
          t,
          queries,
          queries.length - 1,
          knex,
          metricResolvers,
        ),
      queries,
    )
  }
  if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
    if (tree.operation === 'query' && !!tree.name?.value) {
      if (
        tree?.variableDefinitions[0]?.variable?.name?.value === 'source' &&
        tree?.variableDefinitions[0]?.type?.name?.value === 'GA'
      ) {
        return gaQueryBuilder(
          table,
          tree,
          queries,
          idx,
          knex,
          gaMetricResolvers,
        )
      }
      table = tree.name?.value
    }
    if (tree.operation === 'mutation') return queries
    return tree.selectionSet.selections.reduce(
      (queries, t, i) =>
        queryBuilder(table, t, queries, queries.length, knex, metricResolvers),
      queries,
    )
  }
  if (
    !query.filters &&
    (tree.name.value === 'fetch' ||
      tree.name.value === 'fetchPlain' ||
      tree.name.value === 'with')
  ) {
    query.name = tree.alias?.value || null
    query.table = table
    query.promise = knex.select().from(table)
    query.joins = []
    query.filters = parseFilters(tree, query, knex)
    query.promise = withFilters(query.filters)(query.promise)

    if (tree.name.value === 'with') {
      query.isWith = true
    }

    if (query.table === undefined) {
      throw 'Table name must be specified trought table argument or query name'
    }

    if (!query.isWith) {
      queries
        .filter((q) => q !== query && q.isWith)
        .forEach((q) => {
          query.promise = query.promise.with(q.name, q.promise)
        })
    }

    if (!tree.selectionSet?.selections)
      throw 'The query is empty, you need specify metrics or dimensions'
  }
  //console.log(JSON.stringify(tree, null, 2))
  if (query.name === undefined) {
    throw 'Builder: Cant find fetch in the payload'
  }

  if (!!tree.selectionSet?.selections) {
    const selections = tree.selectionSet.selections
    const [haveMetric, haveDimension] = selections.reduce(
      (r, s) => {
        //check multiple dimensions we also need to split queries in the case
        if (r[1] && !!s.selectionSet) return [true, true]
        return [r[0] || !s.selectionSet, r[1] || !!s.selectionSet]
      },
      [false, false],
    )

    if (
      tree.name?.value !== 'fetch' &&
      tree.name?.value !== 'fetchPlain' &&
      tree.name?.value !== 'with' &&
      !tree.with
    )
      parseDimension(tree, query, knex)

    selections.sort((a, b) => {
      if (!b.selectionSet === !a.selectionSet) {
        return 0
      } else if (!b.selectionSet) {
        return -1
      } else {
        return 1
      }
    })

    return selections.reduce((queries, t, i) => {
      if (!!t.selectionSet && haveMetric && haveDimension) {
        const newIdx = queries.length
        queries[newIdx] = { ...queries[idx] }
        if (!!query.metrics) queries[newIdx].metrics = cloneDeep(query.metrics)
        if (!!query.dimensions)
          queries[newIdx].dimensions = cloneDeep(query.dimensions)

        queries[newIdx].promise = query.promise.clone()
        queries[newIdx].idx = newIdx
        return queryBuilder(table, t, queries, newIdx, knex, metricResolvers)
      }
      return queryBuilder(table, t, queries, idx, knex, metricResolvers)
    }, queries)
  }
  parseMetric(tree, query, knex, metricResolvers)

  return queries
}
function parseMetric(tree, query, knex, metricResolvers) {
  const args = argumentsToObject(tree.arguments)
  const { metrics = [] } = query
  query.metrics = metrics
  if (tree.alias && metricResolvers[tree.name?.value])
    return metricResolvers[tree.name?.value](tree, query, knex)
  // Getters are needed only for additionaly selected fields by some specific functions
  // example: price(groupByEach: 50) -> price: 0-50 -> groupByEach_min_price: 0 -> groupByEach_max_price: 50
  // would be useful for further grouping && filtering
  const isInGetters = query.getters?.find((name) => name === tree.name?.value)
  if (!isInGetters) {
    if (!tree.alias?.value) {
      query.promise = query.promise.select(
        `${buildFullName(args, query, tree.name.value)}`,
      )
    } else {
      query.promise = query.promise.select(
        `${buildFullName(args, query, tree.name.value)} as ${tree.alias.value}`,
      )
    }
  }

  if (args?.sort == 'desc' || args?.sort == 'asc')
    query.promise.orderBy(
      buildFullName(args, query, tree.name.value),
      args?.sort,
    )
  if (args?.limit) query.promise.limit(args?.limit)

  query.metrics.push(
    isInGetters ? tree.name?.value : tree.alias?.value || tree.name?.value,
  )
}

function transformLinkedArgs(args, query) {
  if (args?.from === '@') {
    args.from = query.table
  }

  return args
}

function parseDimension(tree, query, knex) {
  if (Object.values(JoinType).includes(tree.name.value)) {
    return join(tree.name.value)(tree, query, knex)
  }

  const { dimensions = [] } = query
  if (!query.groupIndex) query.groupIndex = 0
  query.groupIndex++
  const args = transformLinkedArgs(argumentsToObject(tree.arguments), query)

  if (tree.name.value === 'combine') {
    if (!args.fields || !Array.isArray(args.fields))
      throw "Combine function requires 'fields' argument with a list of fields"

    args.fields.forEach((field) => {
      if (typeof field === 'string') {
        parseDimension(
          {
            name: {
              value: field,
            },
          },
          query,
          knex,
        )
      } else {
        if (!field.name) throw 'Combine by elements must have name'

        const { name, alias, ...rest } = field

        const tree: any = {
          name: {
            value: name,
          },
        }

        if (alias) {
          tree.alias = {
            value: alias,
          }
        }

        tree.arguments = rest

        parseDimension(tree, query, knex)
      }
    })
  } else {
    if (args?.groupByEach) {
      const amount = parseFloat(args.groupByEach)
      query.getters = query.getters || []

      query.promise = query.promise
        .select(
          knex.raw(
            `(CAST(FLOOR(CEIL(??)/??) AS INT)*?? || '-' || CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??`,
            [
              buildFullName(args, query, tree.name.value, false),
              amount,
              amount,
              buildFullName(args, query, tree.name.value, false),
              amount,
              amount,
              amount - 1,
              tree.alias?.value || tree.name.value,
            ],
          ),
          knex.raw(`(CAST(FLOOR(CEIL(??)/??) AS INT)*??) AS ??`, [
            buildFullName(args, query, tree.name.value, false),
            amount,
            amount,
            `groupByEach_min_${tree.alias?.value || tree.name.value}`,
          ]),
          knex.raw(`(CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??`, [
            buildFullName(args, query, tree.name.value, false),
            amount,
            amount,
            amount - 1,
            `groupByEach_max_${tree.alias?.value || tree.name.value}`,
          ]),
        )
        .groupBy(
          knex.raw('CAST(FLOOR(CEIL(??)/??) AS INT)', [
            buildFullName(args, query, tree.name.value, false),
            amount,
          ]),
        )

      query.getters.push(
        `groupByEach_max_${tree.alias?.value || tree.name.value}`,
      )
      query.getters.push(
        `groupByEach_min_${tree.alias?.value || tree.name.value}`,
      )
    } else if (args?.groupBy) {
      if (args.from !== query.table) {
        query.preparedAdvancedFilters = parseAdvancedFilters(
          query,
          knex,
          query.advancedFilters,
          true,
        )
      }

      const pre_trunc = applyFilters(
        query,
        withFilters(query.filters)(
          knex
            .select([
              '*',
              knex.raw(`date_trunc(?, ??) as ??`, [
                args?.groupBy,
                tree.name.value,
                `${tree.name.value}_${args?.groupBy}`,
              ]),
            ])
            .from(args.from || query.table),
        ),
        knex,
      )

      const table = args.groupByAlias || args.from || query.table
      changeQueryTable(query, knex, table, true)

      query.promise = query.promise.from(pre_trunc.as(table))

      query.promise = query.promise.select(
        knex.raw(`?? as ??`, [
          `${tree.name.value}_${args?.groupBy}`,
          tree.alias?.value || tree.name.value,
        ]),
      )
      query.promise = query.promise.groupBy(
        knex.raw(`??`, [`${tree.name.value}_${args?.groupBy}`]),
      )

      if (!query.replaceWith) query.replaceWith = {}
      query.replaceWith[tree.name.value] = {
        value: `${tree.name.value}_${args?.groupBy}`,
        index: query.groupIndex,
      }
    } else {
      query.promise = query.promise.select(
        buildFullName(args, query, tree.name.value, false),
      )
      query.promise = query.promise.groupBy(
        buildFullName(args, query, tree.name.value, false),
      )
    }
  }

  if (!!args?.sort_desc)
    query.promise.orderBy(buildFullName(args, query, args?.sort_desc), 'desc')
  if (!!args?.sort_asc)
    query.promise.orderBy(buildFullName(args, query, args?.sort_asc), 'asc')

  if (!!args?.limit) query.promise.limit(args?.limit)
  if (!!args?.offset) query.promise.offset(args?.offset)
  if (!!args?.cutoff) {
    query.promise.select(
      knex.raw(`sum(??)/sum(sum(??)) over () as cutoff`, [
        args?.cutoff,
        args?.cutoff,
      ]),
    )
  }

  if (!!query.mutation) {
    dimensions.push(tree.name.value)
  } else {
    dimensions.push(tree.alias?.value || tree.name.value)
  }
  query.dimensions = dimensions
}

// Need to thing about same structure of filters as in graphql
// filter: {
//   date: { between: { min: '2020-11-11', max: '2021-11-11' } },
//   age: { gt: 18, lt: 60, or: [{ between: { min: 14, max: 16 } }] },
//   brand: { like: 'Adidas*', and: [{ not: 'Adidas Originals' }, { not: 'Adidas New York'}] },
//   category: [1, 12, 24, 367890]
// }
// We can support it only in filter argument, so it will not affect older code
// Such filters we can combine and build easier
function parseFilters(tree, query, knex) {
  const { arguments: args } = tree
  return transformFilters(
    args.concat({ name: { value: 'from' }, value: { value: query.table } }),
    query,
    knex,
  )
}
const metricResolvers = {
  percentile: (tree, query, knex) => {
    if (!tree.arguments) throw 'Percentile function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "Percentile function requires 'a' as argument"
    query.promise = query.promise.select(
      knex.raw(`PERCENTILE_CONT(??) WITHIN GROUP(ORDER BY ??) AS ??`, [
        parseFloat(args.factor) || 0.5,
        buildFullName(args, query, args.a, false),
        tree.alias.value,
      ]),
    )

    query.metrics.push(tree.alias.value)
  },
  sum: (tree, query, knex) => {
    if (!tree.arguments) throw 'Sum function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "Sum function requires 'a' as argument"
    query.promise = query.promise.sum(
      `${buildFullName(args, query, args.a, false)} as ${tree.alias.value}`,
    )
    query.metrics.push(tree.alias.value)
  },
  min: (tree, query, knex) => {
    if (!tree.arguments) throw 'Min function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "Min function requires 'a' as argument"
    query.promise = query.promise.min(
      `${buildFullName(args, query, args.a, false)} as ${tree.alias.value}`,
    )
    query.metrics.push(tree.alias.value)
  },
  max: (tree, query, knex) => {
    if (!tree.arguments) throw 'Max function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "Max function requires 'a' as argument"
    query.promise = query.promise.max(
      `${buildFullName(args, query, args.a, false)} as ${tree.alias.value}`,
    )
    query.metrics.push(tree.alias.value)
  },
  count: (tree, query, knex) => {
    if (!tree.arguments) throw 'Count function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "Count function requires 'a' as argument"
    query.promise = query.promise.count(
      `${buildFullName(args, query, args.a, false)} as ${tree.alias.value}`,
    )
    query.metrics.push(tree.alias.value)
  },
  countDistinct: (tree, query, knex) => {
    if (!tree.arguments) throw 'CountDistinct function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "CountDistinct function requires 'a' as argument"
    query.promise = query.promise.countDistinct(
      `${buildFullName(args, query, args.a, false)} as ${tree.alias.value}`,
    )
    query.metrics.push(tree.alias.value)
  },
  join: join(JoinType.DEFAULT),
  leftJoin: join(JoinType.LEFT),
  rightJoin: join(JoinType.RIGHT),
  fullJoin: join(JoinType.FULL),
  innerJoin: join(JoinType.INNER),
  leftOuterJoin: join(JoinType.LEFT_OUTER),
  rightOuterJoin: join(JoinType.RIGHT_OUTER),
  fullOuterJoin: join(JoinType.FULL_OUTER),
  ranking: (tree, query, knex) => {
    if (!tree.arguments) throw 'Ranking function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "Ranking function requires 'a' as argument"

    let partition = ''
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
            knex.raw(`${alg}() over (${partition} ORDER BY ?? desc) as ??`, [
              buildFullName(args, query, args.a, false),
              tree.alias.value,
            ]),
          )
          .from(query.table || args.from),
      ),
      knex,
    )

    const table = args.tableAlias || args.from || query.table

    query.promise
      .select(buildFullName({ from: table }, query, tree.alias.value, false))
      .from(promise.as(args.tableAlias || query.table))

    changeQueryTable(query, knex, table, true)

    query.promise.groupBy(
      buildFullName({ from: table }, query, tree.alias.value, false),
    )

    query.metrics.push(tree.alias.value)
  },
  searchRanking: (tree, query, knex) => {
    if (!tree.arguments) throw 'SearchRanking function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "SearchRanking function requires 'a' as argument"

    const key = buildFullName(
      { from: args.from || query.table },
      query,
      args.a,
      false,
    )

    if (!query.search[key])
      throw `SearchRanking requires search query for ${key} field`

    query.promise = query.promise.select(
      knex.raw(
        "ts_rank(to_tsvector('simple', ??), (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??",
        [key, query.search[key], tree.alias.value],
      ),
    )
  },
  searchHeadline: (tree, query, knex) => {
    if (!tree.arguments) throw 'SearchRanking function requires arguments'
    const args = argumentsToObject(tree.arguments)

    if (!args.a) throw "SearchHeadline function requires 'a' as argument"

    const key = buildFullName(
      { from: args.from || query.table },
      query,
      args.a,
      false,
    )

    if (!query.search[key])
      throw `SearchHeadline requires search query for ${key} field`

    query.promise = query.promise.select(
      knex.raw(
        "ts_headline('simple', ??, (plainto_tsquery('simple', ?)::text || ':*')::tsquery) as ??",
        [key, query.search[key], tree.alias.value],
      ),
    )
  },
  unique: (tree, query, knex) => {
    const args = tree.arguments && argumentsToObject(tree.arguments)

    const field = buildFullName(args, query, args?.a || tree.alias.value, false)

    query.promise = query.promise.select(`${field} as ${tree.alias.value}`)
    query.promise = query.promise.groupBy(field)

    query.metrics.push(tree.alias.value)
  },
  from: (tree, query, knex) => {
    if (!tree.arguments) throw 'From function requires arguments'

    const args = argumentsToObject(tree.arguments)

    if (!args.from) throw "From function requires 'from' as argument"

    const field = buildFullName(args, query, args?.a || tree.alias.value, false)

    query.promise = query.promise.select(`${field} as ${tree.alias.value}`)

    query.metrics.push(tree.alias.value)
  },
  avg: (tree, query, knex) => {
    //TODO: test
    if (!tree.arguments) throw 'Avg function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "Avg function requires 'a' as argument"

    if (!!args.by) {
      query.promise.select(
        knex.raw(`avg(??) over (partition by ??)::float4 as ??`, [
          buildFullName(args, query, args.a, false),
          buildFullName(args, query, args.by, false),
          tree.alias.value,
        ]),
      )
    } else {
      query.promise = query.promise.avg(
        `${buildFullName(args, query, args.a, false)} as ${tree.alias.value}`,
      )
    }
    query.metrics.push(tree.alias.value)
  },
  avgPerDimension: (tree, query, knex) => {
    if (!tree.arguments) throw 'avgPerDimension function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "avgPerDimension function requires 'a' as argument"

    if (!args.per) throw "avgPerDimension function requires 'per' as argument"
    query.promise.select(
      knex.raw(`sum(??)::float/COUNT(DISTINCT ??)::float4 as ??`, [
        buildFullName(args, query, args.a, false),
        buildFullName(args, query, args.per, false),
        tree.alias.value,
      ]),
    )
  },
  share: (tree, query, knex) => {
    if (!tree.arguments) throw 'Share function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "Share  function requires 'a' as argument"
    let partition = ''
    if (!!args.by) {
      let partitionBy = buildFullName(args, query, args.by, false)
      if (query.replaceWith?.[args.by]) {
        partitionBy = query.replaceWith[args.by].value
      }
      partition = knex.raw(`partition by ??`, [partitionBy])
    }
    query.promise = query.promise.select(
      knex.raw(
        `sum(??)/NULLIF(sum(sum(??)) over (${partition}), 0)::float4 as ??`,
        [
          buildFullName(args, query, args.a, false),
          buildFullName(args, query, args.a, false),
          tree.alias.value,
        ],
      ),
    )
    query.metrics.push(tree.alias.value)
  },
  indexed: (tree, query, knex) => {
    if (!tree.arguments) throw 'Share function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "Share  function requires 'a' as argument"
    let partition = ''
    if (!!args.by)
      partition = knex.raw(`partition by ??`, [
        buildFullName(args, query, args.by, false),
      ])
    query.promise = query.promise.select(
      knex.raw(
        `sum(??)/NULLIF(max(sum(??)::float) over (${partition}), 0)::float4 as ??`,
        [
          buildFullName(args, query, args.a, false),
          buildFullName(args, query, args.a, false),
          tree.alias.value,
        ],
      ),
    )
    query.metrics.push(tree.alias.value)
  },
  divide: (tree, query, knex) => {
    if (!tree.arguments) throw 'Divide function requires arguments'
    const args = argumentsToObject(tree.arguments)
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

    if (!args.a) throw "Divide function requires 'a' as argument"
    if (!args.by) throw "Divide function requires 'by' as argument"

    query.promise = query.promise.select(
      knex.raw(
        `cast(??(??) as float)/NULLIF(cast(??(??) as float), 0)::float4 as ??`,
        [
          functions.a,
          buildFullName(args, query, args.a, false),
          functions.by,
          buildFullName(args, query, args.by, false),
          tree.alias.value,
        ],
      ),
    )
    query.metrics.push(tree.alias.value)
  },
  aggrAverage: (tree, query, knex) => {
    if (!tree.arguments) throw 'AggrAverage function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.to) throw "aggrAverage function requires 'to' as argument"
    if (!args.by) throw "aggrAverage function requires 'by' as argument"
    let internal = query.promise
      .select(buildFullName(args, query, tree.alias.value, false))
      .sum(`${buildFullName(args, query, args.to, false)} as ${args.to}`)
      .sum(`${buildFullName(args, query, args.by, false)} as ${args.by}`)
      .select(
        knex.raw(`?? * sum(??) as "aggrAverage"`, [
          buildFullName(args, query, tree.alias.value, false),
          buildFullName(args, query, args.to, false),
        ]),
      )
      .groupBy(buildFullName(args, query, tree.alias.value, false))
    if (args.to !== args.by)
      internal = internal.sum(
        `${buildFullName(args, query, args.by, false)} as ${args.by}`,
      )
    query.promise = knex
      .select(query.dimensions)
      .select(
        knex.raw(
          `sum("aggrAverage")/max(??)::float4  as "${tree.alias?.value}_aggrAverage"`,
          [buildFullName(args, query, args.by, false)],
        ),
      )
      .from(internal.as('middleTable'))

    if (!!query.dimensions && query.dimensions.length > 0) {
      query.promise = query.promise.groupBy(query.dimensions)
    }
  },
  weightAvg: (tree, query, knex) => {
    if (!tree.arguments) throw 'weightAvg function requires arguments'
    const args = argumentsToObject(tree.arguments)
    if (!args.a) throw "weightAvg function requires 'a' as argument"
    if (!args.by) throw "weightAvg function requires 'by' as argument"
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

    query.promise = knex
      .select(query.dimensions)
      .select(
        knex.raw(`sum("weightAvg")/sum(??)::float4 as "${tree.alias?.value}"`, [
          buildFullName(args, query, args.by, false),
        ]),
      )
      .from(internal.as('middleTable'))

    if (!!query.dimensions && query.dimensions.length > 0) {
      query.promise = query.promise.groupBy(query.dimensions)
    }
  },
  distinct: (tree, query, knex) => {
    query.promise = query.promise.distinct(
      buildFullName(
        (tree.arguments && argumentsToObject(tree.arguments)) || {},
        query,
        tree.alias.value,
        false,
      ),
    )
  },
}

export const merge = (
  tree: Array<TagObject>,
  data: Array<any>,
  metricResolversData,
): any => {
  const queries = getMergeStrings(
    tree,
    undefined,
    undefined,
    metricResolversData,
  )

  const mutations = queries.filter((q) => !!q.mutation)

  const batches = queries
    .filter((q) => !q.mutation && !q.skipBatching)
    .reduce((r, q, i) => {
      const key = q.name || '___query'
      if (!r[key]) r[key] = []
      q.bid = i
      r[key].push(q)
      return r
    }, {})

  function getMergedObject(
    batches,
    quer,
    mutations,
    fullObject,
    originFullObject?,
  ) {
    if (!!quer[0].skipMerge) {
      return quer.reduce((result, q) => {
        result.push(data[q.bid])
        return result
      }, [])
    }

    if (!originFullObject) {
      originFullObject = fullObject
    }

    return quer.reduce((result, q) => {
      const resultData = data[q.bid]
      for (var j = 0; j < resultData.length; j++) {
        const keys = Object.keys(resultData[j])
        for (var key in keys) {
          if (q.metrics[keys[key]]) {
            let replacedPath = replVars(
              q.metrics[keys[key]],
              resultData[j],
            ).replace(/:join\./g, '')

            let value = resultData[j][keys[key]]
            let skip = false
            let skipAll = false

            q.directives
              .filter((directiveFunction) => {
                if (directiveFunction.context.on === 'metric') {
                  return directiveFunction.context.path === q.metrics[keys[key]]
                } else {
                  return q.metrics[keys[key]].startsWith(
                    directiveFunction.context.path,
                  )
                }
              })
              .forEach((directiveFunction) => {
                const path = q.metrics[keys[key]]
                const [globalReplacedPath, globalPath, pathKey] = [
                  replacedPath.slice(0, replacedPath.lastIndexOf('.')),
                  path.slice(0, path.lastIndexOf('.')),
                  replacedPath.slice(replacedPath.lastIndexOf('.') + 1),
                ]

                const directiveResult = directiveFunction({
                  value,
                  originValue: resultData[j][keys[key]],
                  data: resultData[j],
                  path,
                  key: pathKey,
                  globalPath,
                  globalReplacedPath,
                  row: j,
                  replacedPath,
                  result,
                  fullObject,
                  originFullObject,
                  queries: quer,
                  batches,
                  q,
                })

                // Important for directives which will not change value
                if (directiveResult.hasOwnProperty('value')) {
                  value = directiveResult.value
                }

                if (directiveResult.skipAll) {
                  skipAll = directiveResult.skipAll
                }

                if (directiveResult.skip) {
                  skip = directiveResult.skip
                }

                if (directiveResult.path) {
                  replacedPath = directiveResult.path
                }

                if (directiveResult.replacers) {
                  Object.keys(directiveResult.replacers).forEach((k) => {
                    result = progressiveSet(
                      result,
                      replacedPath.slice(0, replacedPath.lastIndexOf('.')) +
                        '.' +
                        k,
                      directiveResult.replacers[k],
                      false,
                      q.hashContext,
                    )
                  })
                }
              })

            if (skipAll) {
              j++
              break
            }

            if (skip) {
              continue
            }

            if (!!mutations) {
              if (mutations.skip) {
                const checks = mutations['skip']
                const skip = Object.keys(checks).some((k) => {
                  //relying on pick by fix that
                  return !checks[k](
                    progressiveGet(
                      fullObject[mutations.filters.by],
                      replVars(k, resultData[j]),
                      getBatchContext(batches, mutations.filters.by),
                    ),
                  )
                })
                if (skip) continue
              }
            }

            result = progressiveSet(
              result,
              replacedPath,
              value,
              false,
              q.hashContext,
            )

            if (!!mutations) {
              if (
                mutations[mutations.mutationFunction] &&
                mutations[mutations.mutationFunction][q.metrics[keys[key]]]
              ) {
                const mutation = mutations[mutations.mutationFunction]
                result = progressiveSet(
                  result,
                  replacedPath,
                  mutation[q.metrics[keys[key]]]({
                    value,
                    replacedPath,
                    result,
                    config: {
                      metrics: q.metrics[keys[key]],
                      resultData: resultData[j],
                    },
                    fullObject,
                  }),
                  false,
                  q.hashContext,
                )
                continue
              }
            }
          }
        }
      }
      return result
    }, {})
  }

  if (Object.keys(batches).length === 1 && !!batches['___query']) {
    const merged = getMergedObject(batches, queries, null, null)

    if (Object.values<any>(batches)[0].some((q) => q.directives?.length > 0)) {
      return getMergedObject(batches, queries, null, merged)
    } else {
      return merged
    }
  }

  const res = Object.keys(batches).reduce((r, k) => {
    r[k.replace('___query', '')] = getMergedObject(
      batches,
      batches[k],
      null,
      null,
    )
    return r
  }, {})

  // When
  if (mutations.length > 0) {
    return mutations.reduce((r, mutation) => {
      if (batches[mutation.name]) {
        r[mutation.name] = getMergedObject(
          batches,
          batches[mutation.name],
          mutation,
          r,
          res,
        )
      }
      return r
    }, cloneDeep(res))
  } else {
    return Object.keys(batches)
      .filter((k) => batches[k].some((q) => q.directives?.length > 0))
      .reduce((r, k) => {
        r[k.replace('___query', '')] = getMergedObject(
          batches,
          batches[k],
          null,
          r,
          res,
        )

        return r
      }, cloneDeep(res))
  }
}

function getMergeStrings(
  tree,
  queries = [],
  idx = undefined,
  metricResolversData,
  hashContext = {},
) {
  if (idx !== undefined && !!~idx && !queries[idx])
    queries[idx] = { idx, name: undefined }

  if (Array.isArray(tree)) {
    return tree.reduce(
      (queries, t, i) =>
        getMergeStrings(t, queries, queries.length - 1, metricResolversData),
      queries,
    )
  }
  if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
    return tree.selectionSet.selections.reduce((queries, t, i) => {
      if (tree.operation === 'mutation') {
        queries.push({
          idx: queries.length,
          name: undefined,
          mutation: true,
          metrics: {},
          path: '',
        })
      } else {
        queries.push({ idx: queries.length, name: undefined })
      }
      return getMergeStrings(
        t,
        queries,
        queries.length - 1,
        metricResolversData,
        !t.alias ? hashContext : {},
      )
    }, queries)
  }

  const query = queries[idx]
  if (query) {
    query.hashContext = hashContext
  }

  if (tree.name.value === 'with') {
    query.skipBatching = true
    return queries
  }

  if (
    !query.filters &&
    (tree.name.value === 'fetch' || tree.name.value === 'fetchPlain')
  ) {
    query.name = tree.alias?.value || null
    query.metrics = {}
    query.path = ''
    if (tree.name.value === 'fetchPlain') {
      query.skipMerge = true
    }
    if (!tree.selectionSet?.selections)
      throw 'The query is empty, you need specify metrics or dimensions'
  }

  if (query.mutation && !query.filters) {
    query.filters = argumentsToObject(tree.arguments)
    query.name = tree.alias?.value || null
    query.mutationFunction = tree.name?.value || null
  }

  if (query.name === undefined && !query.mutation) {
    throw 'Cant find fetch in the payload'
  }

  if (!!tree.selectionSet?.selections) {
    const selections = tree.selectionSet.selections
    const [haveMetric, haveDimension] = selections.reduce(
      (r, s) => {
        return [r[0] || !!s.selectionSet, r[1] || !s.selectionSet]
      },
      [false, false],
    )
    if (tree.name?.value !== 'fetch' && tree.name.value !== 'fetchPlain')
      mergeDimension(tree, query)
    selections.sort((a, b) => (!b.selectionSet ? -1 : 1))
    return selections.reduce((queries, t, i) => {
      if (!!t.selectionSet && haveMetric && haveDimension) {
        const newIdx = queries.length
        queries[newIdx] = { ...queries[idx], metrics: {} }
        queries[newIdx].path = query.path + ''
        queries[newIdx].idx = newIdx
        return getMergeStrings(
          t,
          queries,
          newIdx,
          metricResolversData,
          hashContext,
        )
      }

      return getMergeStrings(t, queries, idx, metricResolversData, hashContext)
    }, queries)
  }
  mergeMetric(tree, query, metricResolversData)
  return queries
}

function mergeMetric(tree, query, metricResolversData) {
  let name = tree.alias?.value || tree.name.value
  const fieldName = tree.name.value
  const isInGetters = query.getters?.find((name) => name === fieldName)
  const args = argumentsToObject(tree.arguments)
  if (args?.type === 'Array') {
    query.path += `${!!query.path ? '.' : ''}[@${name}=:${name}]`
    query.metrics[`${isInGetters ? fieldName : name}`] = `${query.path}${
      !!query.path ? '.' : ''
    }${name}`
    return parseDirective(tree, query, 'metric', query.metrics[`${name}`])
  } else {
    if (!!query.mutation)
      return metricResolversData[query.mutationFunction](tree, query)
    if (tree.alias && metricResolversData[tree.name?.value])
      return metricResolversData[tree.name?.value](tree, query)
    query.metrics[`${isInGetters ? fieldName : name}`] = `${query.path}${
      !!query.path ? '.' : ''
    }${name}`
    return parseDirective(tree, query, 'metric', query.metrics[`${name}`])
  }
}

function mergeDimension(tree, query) {
  const args = argumentsToObject(tree.arguments)
  query.getters = query.getters || []

  if (args?.groupByEach) {
    query.getters.push(
      `groupByEach_max_${tree.alias?.value || tree.name.value}`,
    )
    query.getters.push(
      `groupByEach_min_${tree.alias?.value || tree.name.value}`,
    )
  }

  let name = !!query.mutation
    ? tree.name.value
    : tree.alias?.value || tree.name.value
  if (args?.type === 'Array') {
    if (!!args?.cutoff) {
      query.cutoff = `${query.path}${
        !!query.path ? '.' : ''
      }[@${name}=:${name}]`
    }

    const names: string[] = []
    let pathPrefix = ''

    if (tree.name.value === 'combine') {
      if (tree.alias?.value) {
        pathPrefix = `${tree.alias.value}.`
      }
      args.fields.forEach((field) => {
        if (field === 'string') {
          names.push(field)
        } else {
          names.push(field.alias || field.name)
        }
      })
    } else {
      names.push(name)
    }

    query.path += `${!!query.path ? '.' : ''}${pathPrefix}[@${names
      .map((name) => `${name}=:${name}`)
      .join(';')}]`
    return parseDirective(tree, query, 'dimension')
  } else {
    const names: string[] = []
    let pathPrefix = ''

    if (tree.name.value === 'combine') {
      if (tree.alias?.value) {
        pathPrefix = `${tree.alias.value}.`
      }
      args.fields.forEach((field) => {
        if (field === 'string') {
          names.push(field)
        } else {
          names.push(field.alias || field.name)
        }
      })
    } else {
      names.push(name)
    }

    query.path += `${!!query.path ? '.' : ''}${pathPrefix}${names
      .map((name) => `:${name}`)
      .join(';')}`
    return parseDirective(tree, query, 'dimension')
  }
}
const comparisonFunction = {
  gt: (v) => (x) => +x > +v,
  lt: (v) => (x) => +x < +v,
  gte: (v) => (x) => +x >= +v,
  lte: (v) => (x) => +x <= +v,
  eq: (v) => (x) => x == v,
}

const metricResolversData = {
  aggrAverage: (tree, query) => {
    const name = `${tree.alias?.value}_aggrAverage`
    query.metrics[`${name}`] = `${query.path}${!!query.path ? '.' : ''}${name}`
  },
  weightAvg: (tree, query) => {
    const name = `${tree.alias?.value}`
    query.metrics[`${name}`] = `${query.path}${!!query.path ? '.' : ''}${name}`
  },
  pick: (tree, query) => {
    const name = `${tree.name?.value}`
    const args = argumentsToObject(tree.arguments)
    if (!query.skip) query.skip = {}
    if (query.path === ':pick') query.path = ''
    Object.keys(args).map((key) => {
      const [keyName, operator] = key.split('_')
      query.skip[`${query.path}${!!query.path ? '.' : ''}:${name}.${keyName}`] =
        comparisonFunction[operator || 'eq'](args[key])
    })
  },
  diff: (tree, query) => {
    const name = `${tree.name?.value}`
    if (!query.diff) query.diff = {}
    if (query.path.startsWith(':diff') || query.path.startsWith(':diff.'))
      query.path = query.path.replace(/:diff\.?/, '')

    query.diff[`${query.path}${!!query.path ? '.' : ''}${name}`] = ({
      value,
      replacedPath,
      fullObject,
    }) => {
      return (
        value / progressiveGet(fullObject[query.filters.by], replacedPath) - 1
      )
    }
  },
  subtract: (tree, query) => {
    const name = `${tree.name?.value}`
    if (!query.subtract) query.subtract = {}
    if (
      query.path.startsWith(':subtract') ||
      query.path.startsWith(':subtract.')
    )
      query.path = query.path.replace(/:subtract\.?/, '')

    query.subtract[`${query.path}${!!query.path ? '.' : ''}${name}`] = ({
      value,
      replacedPath,
      fullObject,
    }) => {
      return value - progressiveGet(fullObject[query.filters.by], replacedPath)
    }
  },
  divideBy: (tree, query) => {
    const name = `${tree.name?.value}`
    if (!query.divideBy) query.divideBy = {}
    if (
      query.path.startsWith(':divideBy') ||
      query.path.startsWith(':divideBy.')
    )
      query.path = query.path.replace(/:divideBy\.?/, '')

    query.divideBy[`${query.path}${!!query.path ? '.' : ''}${name}`] = ({
      value,
      replacedPath,
      fullObject,
    }) => {
      return value / progressiveGet(fullObject[query.filters.by], replacedPath)
    }
  },
  blank: (tree, query) => {
    const name = `${tree.name?.value} `
    if (!query.skip) query.skip = {}
    if (query.path.startsWith(':blank.') || query.path.startsWith(':blank'))
      query.path = query.path.replace(/:blank\.?/, '')
    query.skip[`${query.path} ${!!query.path ? '.' : ''}: ${name} `] = (x) =>
      false
  },
}

function withFilters(filters) {
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

/*

query ecom_benchmarking{
    fetch(category: "Adult", countryisocode: US) {
        devicecategory {
            date(type:Array){
                averageSessions:sum(a:sessions)
                averageBounces:sum(a:bounces)
            }

        }
    }
}


query TEMP_BRAND_BASKET_POSITION_TABLE{
  fetch(brand: adidas, country: us){
    ... position1 {
      result: divide(a:position1.POSITION1_BASKETS, by:no_of_baskets)
    }
  }
  position1: fetch(brand: adidas, country: us, position: 1) {
    POSITION1_BASKETS: SUM(a: no_of_baskets)
  }
}

query TEMP_BRAND_BASKET_POSITION_TABLE{
  fetch(brand: adidas, country: us){
    brand_2 {
      ... overal {
        brandIntesections: divide(a:no_of_baskets, by:position1.no_of_all_baskets)
      }
    }
  }
}
query brand1_table{
  overal: fetch(brand: adidas, country: us){
    no_of_all_baskets
  }
}
*/
