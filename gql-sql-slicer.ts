import { argumentsToObject } from './arguments'
import { parseDirective, parseTypeDirective } from './directives'
import {
  compilePath,
  progressiveSet,
  renderTemplate,
  setByTemplate,
  withKey,
} from './progressive'
import { cloneDeep, isEqual, omit, uniqWith } from 'lodash'
import { applyFilters, withFilters } from './filters'
import { metricResolvers } from './metrics'
import {
  parseDimension,
  parseFilters,
  parseMetric,
  parseType,
  parseVariableDefinition,
  processSelections,
} from './parser'
// graphql's DocumentNode typings are stricter than the loose AST handling here
type DocumentNode = any
import { dimensionResolvers } from './dimensions'
import knexConstructor, { Knex } from 'knex'
import { disableOperationFor, Provider, providers } from './providers'
import gql, {
  enableExperimentalFragmentVariables,
  disableFragmentWarnings,
} from 'graphql-tag'
import { checkPropTypes } from './types'
import mergeDeep from 'deepmerge'
import { defaultTypes } from './parser'
import { TinyEmitter } from 'tiny-emitter'

enableExperimentalFragmentVariables()
disableFragmentWarnings()
interface GqlQuery {
  promise: Knex.QueryBuilder | Promise<any>
  name: string
  filters: Array<string>
  table: string
  joins?: string[]
  metrics?: string[]
  dimensions?: string[]
  providers: Record<string, Provider>
  provider: string
}
interface gqlBuildObject {
  queries: Array<GqlQuery>
  sql: Array<string>
  definitions: DocumentNode
}
interface BeforeDbHandler {
  (QueryObject: gqlBuildObject): Promise<gqlBuildObject>
}
interface DbHandler {
  (QueryObject: gqlBuildObject): Promise<any>
}

interface metricResolver {
  (tree, query, builder): void
}

interface metricDataResolver {
  (tree, query): void
}

export const knex = knexConstructor

export const gqlToDb = () => {
  let beforeDbHandler: BeforeDbHandler = (r) => Promise.resolve(r)
  let dbHandler: DbHandler = ({ queries }) => {
    return Promise.all(
      queries.map((q) => {
        return q.providers[q.provider].execute(
          q.providers[q.provider].connection,
          q.providers[q.provider].prepare
            ? q.providers[q.provider].prepare(q, q.promise)
            : q.promise,
        )
      }),
    )
  }
  let afterDbHandler: Function = (r) => Promise.resolve(r)
  let customMetricResolvers = {}
  let customMetricDataResolvers = {}
  let customDimensionResolvers = {}
  let definedProviders = { ...providers }
  const emitter = new TinyEmitter()
  const gqlFetch = async (
    gqlQuery: string,
    variables: Record<string, any>,
    provider?: string,
  ): Promise<any> => {
    emitter.emit('parseStart')
    const builder = definedProviders[provider || 'pg'].getQueryBuilder()

    try {
      const definitions = cloneDeep(gql(gqlQuery).definitions)

      const queries = queryBuilder(
        null,
        definitions,
        undefined,
        undefined,
        builder,
        {
          metricResolvers: { ...metricResolvers, ...customMetricResolvers },
          dimensionResolvers: {
            ...dimensionResolvers,
            ...customDimensionResolvers,
          },
          providers: definedProviders,
          provider: provider || 'pg',
        },
        {
          types: { ...defaultTypes },
          fragments: {},
          variablesValidator: {},
          variables,
          typeDefinitions: {},
        },
      )
        .filter((q) => !q.skip)
        .filter((q) => !!q.promise)
        .map((q) => {
          q.promise = applyFilters(q, q.promise, builder)

          return q
        })

      const sql = queries
        .filter((q) => !q.isWith)
        .map((q) => {
          q.promise._statements = uniqWith(q.promise._statements, isEqual)
          return q
        })
        .map((q) => (q.provider !== 'ga' ? q.promise.toString() : q.promise))
      emitter.emit('parseFinished')

      emitter.emit('prepareDBStart')
      const preparedGqlQuery = await beforeDbHandler({
        queries: queries.filter((q) => !q.isWith),
        sql,
        definitions,
      })
      emitter.emit('prepareDBFinished')
      if (!preparedGqlQuery) return null
      emitter.emit('fetchStart')
      const resultFromDb = await dbHandler(preparedGqlQuery)
      emitter.emit('fetchFinished')
      if (!resultFromDb) return null
      emitter.emit('postDBStart')
      afterDbHandler(definitions, resultFromDb)
      emitter.emit('postDBFinished')
      emitter.emit('mergeStart')
      const data = await merge(definitions, resultFromDb, {
        ...metricResolversData,
        ...customMetricDataResolvers,
      })
      emitter.emit('mergeFinished')
      return data
    } catch (e) {
      console.log(e)
      console.log(e.stack)
      throw Error(e)
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
  gqlFetch.useDimensionResolver = (name: string, fn: metricResolver) => {
    customDimensionResolvers = { ...customDimensionResolvers, [name]: fn }
  }
  gqlFetch.useProvider = (name: string, provider: Provider) => {
    definedProviders = mergeDeep(definedProviders, { [name]: provider })
  }
  gqlFetch.useDataResolver = (name: string, fn: metricDataResolver) => {
    customMetricDataResolvers = { ...customMetricDataResolvers, [name]: fn }
  }
  gqlFetch.setupProvider = (name: string, configuration: any) => {
    definedProviders[name] = {
      ...definedProviders[name],
      configuration,
      connection: definedProviders[name].getConnection(
        configuration,
        definedProviders[name].getConnector(),
      ),
    }
  }
  gqlFetch.emitter = emitter

  return gqlFetch
}

function queryBuilder(
  table,
  tree,
  queries: Array<any> | undefined = [],
  idx: number | undefined = undefined,
  builder,
  options: {
    metricResolvers: Record<string, metricResolver>
    dimensionResolvers: Record<string, metricResolver>
    providers: Record<string, Provider>
    provider: string
  },
  context = {
    fragments: {},
    types: {},
    variablesValidator: {},
    variables: {},
    typeDefinitions: {},
  },
) {
  if (!!~idx && idx !== undefined && !queries[idx])
    queries[idx] = {
      idx,
      name: undefined,
      metricResolvers: options.metricResolvers,
      dimensionResolvers: options.dimensionResolvers,
      providers: options.providers,
      provider: options.provider || 'pg',
      context,
    }
  const query = queries[idx]

  switch (tree.kind) {
    case 'EnumTypeDefinition':
    case 'UnionTypeDefinition':
    case 'InputObjectTypeDefinition':
    case 'ObjectTypeDefinition':
    case 'TupleTypeDefinition':
      context.typeDefinitions[tree.name.value] = tree
      tree = parseTypeDirective(tree, context)
      if (Array.isArray(tree)) {
        tree.forEach((tree) => {
          context.typeDefinitions[tree.name.value] = tree
        })
      } else {
        context.typeDefinitions[tree.name.value] = tree
      }
  }

  if (Array.isArray(tree)) {
    //we replace query with next level
    return tree.reduce(
      (queries, t, i) =>
        queryBuilder(
          table,
          t,
          queries,
          queries.length ? queries.length - 1 : 0,
          builder,
          options,
          context,
        ),
      queries,
    )
  }

  switch (tree.kind) {
    case 'EnumTypeDefinition':
    case 'UnionTypeDefinition':
    case 'InputObjectTypeDefinition':
    case 'ObjectTypeDefinition':
    case 'TupleTypeDefinition':
      parseType(tree, context)

      return queries.filter((query) => query.idx === idx)
    case 'FragmentDefinition':
      context.fragments[tree.name.value] = {
        name: tree.name,
        selections: tree.selectionSet.selections,
        variableDefinitions: tree.variableDefinitions || [],
      }

      return queries.filter((query) => query.idx !== idx)
    case 'OperationDefinition':
      if (!!tree.selectionSet) {
        const ctx = {
          ...context,
          variablesValidator: cloneDeep(context.variablesValidator),
          variables: cloneDeep(context.variables),
        }

        if (tree.operation === 'query' && !!tree.name?.value) {
          tree.variableDefinitions.forEach((def) => {
            parseVariableDefinition(def, ctx)
          })

          checkPropTypes(
            ctx.variablesValidator,
            ctx.variables,
            'query',
            tree.name.value,
          )

          table = tree.name?.value
        }
        return tree.selectionSet.selections
          .reduce((selections, field) => {
            return processSelections(selections, field, { context: ctx }, ctx)
          }, [])
          .filter(Boolean)
          .reduce(
            (queries, t, i) =>
              queryBuilder(
                table,
                t,
                queries,
                queries.length,
                builder,
                options,
                ctx,
              ),
            queries,
          )
      }
  }

  if (tree.name.value === 'unionall') {
    query.name = tree.alias?.value || null

    query.joins = []
    query.orderBys = []
    const tables = (tree.arguments || [])
      .filter((arg) => arg.name.value === 'table')
      .map((arg) => arg.value.value)
    if (tables.length === 0) {
      throw 'Table name must be specified trought table argument or query name'
    } else if (tables.length == 1) {
      query.table = builder
        .select('*')
        .from(tables[0])
        .as(tree.arguments[0].name.value)
    } else {
      query.table = builder
        .select('*')
        .from(tables[0])
        .unionAll(
          tables.slice(1).map((table) => builder.select('*').from(table)),
        )
        .as(`unionall_${tables.join('_')}`)
    }
    query.promise = query.providers[query.provider].getQueryPromise(
      query,
      builder,
    )
    //query.filters = parseFilters(tree, query, builder)
    //query.promise = withFilters(query, query.filters)(query.promise, builder)

    // For GA provider we don't need table name

    if (!query.isWith) {
      queries
        .filter((q) => q !== query && q.isWith)
        .forEach((q) => {
          query.promise = query.promise.with(q.name, q.promise)
        })
    }
  }

  if (
    !query.filters &&
    (tree.name.value === 'fetch' ||
      tree.name.value === 'fetchPlain' ||
      tree.name.value === 'with')
  ) {
    query.name = tree.alias?.value || null
    query.table = table
    query.promise = query.providers[query.provider].getQueryPromise(
      query,
      builder,
    )
    query.joins = []
    query.orderBys = []
    query.filters = parseFilters(tree, query, builder)
    query.promise = withFilters(query, query.filters)(query.promise, builder)

    if (tree.name.value === 'with') {
      disableOperationFor(query, 'with', 'ga')
      query.isWith = true
    }

    // For GA provider we don't need table name
    if (query.table === undefined && query.provider !== 'ga') {
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
      tree.name?.value !== 'unionall' &&
      !tree.with
    )
      parseDimension(tree, query, builder)

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
        queries[newIdx] = {
          ...cloneDeep(omit(queries[idx], ['promise'])),
          promise: query.promise.clone(),
          idx: newIdx,
        }

        return queryBuilder(
          table,
          t,
          queries,
          newIdx,
          builder,
          options,
          context,
        )
      }
      return queryBuilder(table, t, queries, idx, builder, options, context)
    }, queries)
  }
  parseMetric(tree, query, builder)

  return queries
}

export const merge = (
  tree: ReadonlyArray<DocumentNode>,
  data: Array<any>,
  metricResolversData,
): any => {
  const queries = getMergeStrings(
    tree,
    undefined,
    undefined,
    metricResolversData,
  )

  const batches = queries
    .filter((q) => !q.skipBatching)
    .reduce((r, q, i) => {
      const key = q.name || '___query'
      if (!r[key]) r[key] = []
      q.bid = i
      r[key].push(q)
      return r
    }, {})

  function getMergedObject(batches, quer, fullObject, originFullObject?) {
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
      if (!resultData) return result
      const plan = getMergePlan(q)
      for (let j = 0; j < resultData.length; j++) {
        const row = resultData[j]
        const keys = Object.keys(row)
        for (let k = 0; k < keys.length; k++) {
          const metric = plan[keys[k]]
          if (metric) {
            const key = String(k)
            let value = row[keys[key]]

            // No directives: write straight from the compiled template, no
            // path strings are built or parsed for this cell.
            if (metric.directives.length === 0) {
              result = setByTemplate(result, metric.template, row, value)
              continue
            }

            // The template is resolved against `vars` (the row, unless a
            // directive returned new vars). `replacedPath` is only set when
            // a directive returned a string path instead.
            let vars = row
            let replacedPath: string = null
            let skip = false
            let skipAll = false

            for (let d = 0; d < metric.directives.length; d++) {
              const directiveResult = metric.directives[d](
                new DirectiveArgs(
                  metric,
                  value,
                  row,
                  vars,
                  replacedPath,
                  j,
                  result,
                  fullObject,
                  originFullObject,
                  quer,
                  batches,
                  q,
                  keys,
                  key,
                ),
              )

              // Important for directives which will not change value
              if (directiveResult.hasOwnProperty('value')) {
                value = directiveResult.value
              }

              if (directiveResult.skipAll) {
                skipAll = true
              }

              if (directiveResult.skip) {
                skip = true
              }

              if (directiveResult.vars) {
                vars = directiveResult.vars
                replacedPath = null
              }

              if (directiveResult.path) {
                replacedPath = directiveResult.path
              }

              if (directiveResult.replacers) {
                const replacers = directiveResult.replacers
                Object.keys(replacers).forEach((name) => {
                  if (replacedPath) {
                    result = progressiveSet(
                      result,
                      replacedPath.slice(0, replacedPath.lastIndexOf('.')) +
                        '.' +
                        name,
                      replacers[name],
                    )
                  } else {
                    const child =
                      metric.children[name] ||
                      (metric.children[name] = withKey(metric.parentTemplate, name))
                    result = setByTemplate(result, child, vars, replacers[name])
                  }
                })
              }
            }

            // Skip the rest of this row; the for loop moves to the next one.
            if (skipAll) {
              break
            }

            if (skip) {
              continue
            }

            result = replacedPath
              ? progressiveSet(result, replacedPath, value)
              : setByTemplate(result, metric.template, vars, value)
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

  return Object.keys(batches)
    .filter((k) => batches[k].some((q) => q.directives?.length > 0))
    .reduce((r, k) => {
      r[k.replace('___query', '')] = getMergedObject(
        batches,
        batches[k],
        r,
        res,
      )

      return r
    }, cloneDeep(res))
}

// What a post-executed directive receives for one cell. The legacy string
// paths are getters on the prototype, so they cost nothing unless a
// directive reads them.
class DirectiveArgs {
  value: any
  originValue: any
  data: any
  vars: any
  template: any
  parentTemplate: any
  path: string
  key: string
  globalPath: string
  row: number
  result: any
  fullObject: any
  originFullObject: any
  queries: any
  batches: any
  q: any
  keys: string[]
  pathKey: string
  private rendered: string

  constructor(
    metric,
    value,
    row,
    vars,
    replacedPath: string,
    rowIndex: number,
    result,
    fullObject,
    originFullObject,
    queries,
    batches,
    q,
    keys: string[],
    pathKey: string,
  ) {
    this.value = value
    this.originValue = row[keys[pathKey]]
    this.data = row
    this.vars = vars
    this.template = metric.template
    this.parentTemplate = metric.parentTemplate
    this.path = metric.path
    this.key = replacedPath
      ? replacedPath.slice(replacedPath.lastIndexOf('.') + 1)
      : metric.key
    this.globalPath = metric.globalPath
    this.row = rowIndex
    this.result = result
    this.fullObject = fullObject
    this.originFullObject = originFullObject
    this.queries = queries
    this.batches = batches
    this.q = q
    this.keys = keys
    this.pathKey = pathKey
    this.rendered = replacedPath
  }

  get replacedPath(): string {
    return (
      this.rendered ||
      (this.rendered = renderTemplate(this.template, this.vars))
    )
  }

  get globalReplacedPath(): string {
    const path = this.replacedPath
    return path.slice(0, path.lastIndexOf('.'))
  }
}

// Per query: compiled template and applicable directives for every metric
// column, computed once instead of per row.
function getMergePlan(q) {
  if (q.mergePlan) return q.mergePlan

  const plan = {}
  Object.keys(q.metrics).forEach((name) => {
    const path = q.metrics[name]
    const template = compilePath(path)
    plan[name] = {
      path,
      template,
      parentTemplate: template.slice(0, -1),
      // Resolved paths for the legacy directive contract
      key: path.slice(path.lastIndexOf('.') + 1),
      globalPath: path.slice(0, path.lastIndexOf('.')),
      // Templates for replacer keys next to the metric, filled on demand
      children: {},
      directives: (q.directives || []).filter((directiveFunction) =>
        directiveFunction.context.on === 'metric'
          ? directiveFunction.context.path === path
          : path.startsWith(directiveFunction.context.path),
      ),
    }
  })
  q.mergePlan = plan

  return plan
}

function getMergeStrings(
  tree,
  queries = [],
  idx = undefined,
  metricResolversData,
) {
  if (idx !== undefined && !!~idx && !queries[idx])
    queries[idx] = { idx, name: undefined }

  if (
    [
      'EnumTypeDefinition',
      'UnionTypeDefinition',
      'InputObjectTypeDefinition',
      'ObjectTypeDefinition',
      'FragmentDefinition',
    ].includes(tree?.kind)
  ) {
    return queries
  }

  if (Array.isArray(tree)) {
    return tree.reduce(
      (queries, t, i) =>
        getMergeStrings(t, queries, queries.length - 1, metricResolversData),
      queries,
    )
  }

  const query = queries[idx]

  if (tree.kind === 'OperationDefinition' && !!tree.selectionSet) {
    return tree.selectionSet.selections.reduce((queries, t, i) => {
      queries.push({ idx: queries.length, name: undefined })

      return getMergeStrings(
        t,
        queries,
        queries.length - 1,
        metricResolversData,
      )
    }, queries)
  }

  if (tree.name.value === 'with') {
    query.skipBatching = true
    return queries
  }

  if (tree.name.value === 'unionall') {
    query.name = tree.alias?.value || null
    query.metrics = {}
    query.path = ''
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

  if (query.name === undefined) {
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
    if (
      tree.name?.value !== 'fetch' &&
      tree.name.value !== 'fetchPlain' &&
      tree.name.value !== 'unionall'
    )
      mergeDimension(tree, query, metricResolversData)
    selections.sort((a, b) => (!b.selectionSet ? -1 : 1))
    return selections.reduce((queries, t, i) => {
      if (!!t.selectionSet && haveMetric && haveDimension) {
        const newIdx = queries.length
        queries[newIdx] = { ...queries[idx], metrics: {} }
        queries[newIdx].path = query.path + ''
        queries[newIdx].idx = newIdx
        return getMergeStrings(t, queries, newIdx, metricResolversData)
      }

      return getMergeStrings(t, queries, idx, metricResolversData)
    }, queries)
  }
  mergeMetric(tree, query, metricResolversData)
  return queries
}

function getDefaultPath(name: string, path: string, isArray: boolean) {
  if (isArray) {
    return `${path}${!!path ? '.' : ''}[@${name}=:${name}]`
  } else {
    return `${path}${!!path ? '.' : ''}:${name}`
  }
}

function getDefaultMetricPath(name: string, path: string) {
  return `${path}${!!path ? '.' : ''}${name}`
}

function getDefaultFullPath(
  name: string,
  path: string,
  isArray: boolean,
  on: 'metric' | 'dimension',
) {
  path =
    isArray || on === 'dimension' ? getDefaultPath(name, path, isArray) : path

  return {
    path,
    metricPath: getDefaultMetricPath(name, path),
  }
}

function mergeMetric(tree, query, resolversData?) {
  const resolvers = resolversData || metricResolversData
  let name = tree.alias?.value || tree.name.value
  const isInGetters = query.getters?.find((name) => name === tree.name.value)
  const fieldName = isInGetters ? tree.name.value : name
  const args = argumentsToObject(tree.arguments)

  if (resolvers[tree.name?.value])
    resolvers[tree.name?.value](tree, query, {
      on: 'metric',
      isInGetters,
      fieldName,
      name,
      getDefault: getDefaultFullPath,
    })
  else {
    if (args?.type === 'Array') {
      query.path = getDefaultPath(name, query.path, true)
    }

    query.metrics[fieldName] = getDefaultMetricPath(name, query.path)
  }

  return parseDirective(tree, query, 'metric', query.metrics[fieldName])
}

function mergeDimension(tree, query, resolversData?) {
  const resolvers = resolversData || metricResolversData
  const args = argumentsToObject(tree.arguments)
  let name = tree.alias?.value || tree.name.value
  query.getters = query.getters || []

  if (resolvers[tree.name?.value])
    resolvers[tree.name?.value](tree, query, {
      on: 'dimension',
      isInGetters: false,
      fieldName: name,
      name,
      getDefault: getDefaultFullPath,
    })
  else {
    query.path = getDefaultPath(name, query.path, args?.type === 'Array')
  }

  return parseDirective(tree, query, 'dimension')
}

interface metricResolversDataOptions {
  on: 'metric' | 'dimension'
  name: string
  fieldName: string
  isInGetters: boolean
  getDefault: (
    name: string,
    path: string,
    isArray: boolean,
    on: 'metric' | 'dimension',
  ) => { path: string; metricPath: string }
}

const metricResolversData = {
  aggrAverage: (tree, query, options: metricResolversDataOptions) => {
    const name = `${tree.alias?.value}_aggrAverage`
    query.metrics[name] = getDefaultMetricPath(name, query.path)
  },
  weightAvg: (tree, query, options: metricResolversDataOptions) => {
    const name = `${tree.alias?.value}`
    query.metrics[name] = getDefaultMetricPath(name, query.path)
  },
  join: (tree, query, options: metricResolversDataOptions) => {
    query.metrics[options.name] = getDefaultMetricPath(
      options.name,
      query.path,
    ).replace(/:join\./g, '')
  },
  groupByEach: (tree, query, options: metricResolversDataOptions) => {
    const args = argumentsToObject(tree.arguments)
    query.getters.push(`groupByEach_max_${tree.alias.value}`)
    query.getters.push(`groupByEach_min_${tree.alias.value}`)
    const defaultState = options.getDefault(
      options.name,
      query.path,
      args?.type === 'Array',
      options.on,
    )

    query.path = defaultState.path
    query.metrics[options.name] = defaultState.metricPath
  },
  combine: (tree, query, options: metricResolversDataOptions) => {
    const args = argumentsToObject(tree.arguments)

    const names: string[] = []
    let pathPrefix = ''

    if (tree.alias?.value) {
      pathPrefix = `${tree.alias.value}.`
    }

    args?.fields.forEach((field) => {
      if (typeof field === 'string') {
        names.push(field)
      } else {
        names.push(field.alias || field.name)
      }
    })

    if (args?.type === 'Array') {
      query.path += `${!!query.path ? '.' : ''}${pathPrefix}[@${names
        .map((name) => `${name}=:${name}`)
        .join(';')}]`
    } else {
      query.path += `${!!query.path ? '.' : ''}${pathPrefix}${names
        .map((name) => `:${name}`)
        .join(';')}`
    }
  },
}
