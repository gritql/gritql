import { Merger } from './entities/Merger'
import { QueryProcessor } from './entities/QueryProcessor'
import { QueryTransformer } from './entities/QueryTransformer'
import { ResultProcessor } from './entities/ResultProcessor'
import { ResultTransformer } from './entities/ResultTransformer'
import { SourceProvider } from './entities/SourceProvider'
import { PostgresProvider } from './providers/PostgresProvider'
import { TinyEmitter } from 'tiny-emitter'
import { cloneDeep, isEqual, omit, uniqWith } from 'lodash'
import { parseDirective, parseTypeDirective } from '../directives'
import { applyFilters, withFilters } from '../filters'
import { checkPropTypes } from '../types'
import {
  parseDimension,
  parseFilters,
  parseMetric,
  parseType,
  parseVariableDefinition,
  processSelections,
} from '../parser'
import gql, {
  enableExperimentalFragmentVariables,
  disableFragmentWarnings,
} from 'graphql-tag'

class Runner {}

class GritQL {
  sourceProviders: SourceProvider[]
  public emitter: TinyEmitter

  runner: Runner

  constructor() {
    this.sourceProviders = []
    this.emitter = new TinyEmitter()
  }

  queryParser(
    tree,
    queries: Array<any> | undefined = [],
    idx = 0,
    context = {
      fragments: {},
      types: {},
      variablesValidator: {},
      variables: {},
      typeDefinitions: {},
    },
  ) {
    if (idx !== undefined && !!~idx && !queries[idx])
      queries[idx] = {
        idx,
        name: undefined,
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
          this.queryParser(
            t,
            queries,
            queries.length ? queries.length - 1 : 0,
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

            query.table = tree.name?.value

            //TODO:get provider here
            //specify builder
          }
          return tree.selectionSet.selections
            .reduce((selections, field) => {
              return processSelections(selections, field, { context: ctx }, ctx)
            }, [])
            .filter(Boolean)
            .reduce(
              (queries, t, i) =>
                this.queryParser(t, queries, queries.length - 1, ctx),
              queries,
            )
        }
    }
    //set provider for query as first of source providers
    if (!query.provider && query.provider !== 0) query.provider = 0
    const builder = this.sourceProviders[query.provider].getQueryBuilder()
    if (
      !query.filters &&
      (tree.name.value === 'fetch' ||
        tree.name.value === 'fetchPlain' ||
        tree.name.value === 'with')
    ) {
      query.name = tree.alias?.value || null
      query.promise = this.sourceProviders[query.provider].getQueryPromise(
        query,
        builder,
      )
      query.joins = []
      query.orderBys = []
      query.filters = parseFilters(tree, query, builder)
      query.promise = withFilters(query, query.filters)(query.promise, builder)

      if (tree.name.value === 'with')
        this.sourceProviders[query.provider].enableWith(query)

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

          return this.queryParser(t, queries, newIdx, context)
        }
        return this.queryParser(t, queries, idx, context)
      }, queries)
    }
    parseMetric(tree, query, builder)

    return queries
  }
  //put query parser inside gritql
  //it should have access to all providers
  //providers should have klear ids, that can be used in query definition as argument/directive??

  getRequestBuilder(providerId?: string) {
    //TODO: implement finding provider by id
    //and returning request buildter
    return {}
  }
  fetch(gqlQuery: string, variables: Record<string, any>, providerId?: string) {
    this.emitter.emit('parseStart')
    //const builder = this.getRequestBuilder(providerId)
    try {
      const definitions = cloneDeep(gql(gqlQuery).definitions)

      this.queryParser(definitions)
    } catch (e) {
      console.log(e)
      console.log(e.stack)
      throw Error(e)
    }
  }
  use(provider: SourceProvider | QueryTransformer | ResultTransformer) {
    if (provider instanceof QueryTransformer) {
      //this.queryTransformer = provider
    } else if (provider instanceof ResultTransformer) {
      //this.resultTransformer = provider
    } else {
      //TODO: check if sourceProviders already have signature, replace in the case
      //destroy should force disconnect
      this.sourceProviders.push(provider)
    }
  }
}

const postgresqlProvider = new PostgresProvider({})
const merger = new Merger()
const someProcessor = new QueryProcessor()
const someResProcessor = new ResultProcessor()

const qritQLEngine = () => {
  const gritql = new GritQL()
  gritql.use(postgresqlProvider)

  /*const { queryTransformer, resultTransformer } = gritql

  queryTransformer.use(someProcessor)

  resultTransformer.use(someResProcessor)
  resultTransformer.use(merger)*/

  return gritql
}

const qlEngine = qritQLEngine()
qlEngine.fetch('query { fetch { id } }', {})
/*
preModificator
preModificator
preModificator
getQueryBuilder
<metricResolvers
<dimensionResolver
postModificator
postModificator
postModificator
dbHandler

merger*/
