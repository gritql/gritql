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
import { DocumentNode } from 'graphql'
import Query from './QueryBuilder'

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
    tree: DocumentNode,
    queries: Array<Query> | undefined = [],
    idx = 0,
    context = {
      fragments: {},
      types: {},
      variablesValidator: {},
      variables: {},
      typeDefinitions: {},
    },
  ) {
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

    if (Array.isArray(tree) && tree[0].kind === 'OperationDefinition') {
      //we replace query with next level
      return tree.reduce(
        (queries, nextTree, i) =>
          this.queryParser(nextTree, queries, queries.length, context),
        queries,
      )
    }

    if (!queries[idx]) {
      queries[idx] = new Query(this.sourceProviders[0])
      queries[idx].idx = idx //not sure if that is a good idea
    }
    const query = queries[idx]
    query.name = tree.alias?.value
    // TOP LEVEL OPERATIONS
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
            query.setInitiateContext(() => {
              //TODO: properly specify builder based on input or take first
              return this.sourceProviders[0].initiateQuery({
                table: tree.name.value,
              })
            })
          }

          return tree.selectionSet.selections
            .reduce((selections, field) => {
              return processSelections(selections, field, { context: ctx }, ctx)
            }, [])
            .filter(Boolean)
            .reduce(
              (queries, t, i) =>
                this.queryParser(
                  t,
                  queries,
                  i === 0 ? idx : queries.length + 1,
                  ctx,
                ),
              queries,
            )
        }
    }
    //process filters
    if (
      tree.name.value === 'fetch' ||
      tree.name.value === 'fetchPlain' ||
      tree.name.value === 'with'
    ) {
      query.name = tree.alias?.value || null

      // query.joins = []
      // query.orderBys = []
      //TODO: refactor this one to move it out to provider
      const filters = parseFilters(
        tree,
        query,
        this.sourceProviders[0].getQueryBuilder(),
      )
      query.do(this.sourceProviders[0].getInstruction('apply_filters'), {
        args: filters,
      })
      //query.promise = withFilters(query, filters)(query.promise, builder)

      // if (tree.name.value === 'with')
      //   this.sourceProviders[query.provider].enableWith(query)

      // // For GA provider we don't need table name
      // if (query.table === undefined && query.provider !== 'ga') {
      //   throw 'Table name must be specified trought table argument or query name'
      // }

      // if (!query.isWith) {
      //   queries
      //     .filter((q) => q !== query && q.isWith)
      //     .forEach((q) => {
      //       query.promise = query.promise.with(q.name, q.promise)
      //     })
      // }

      if (!tree.selectionSet?.selections)
        throw 'The query is empty, you need specify metrics or dimensions'
    }

    query.name = tree.alias?.value
    return queries
  }

  getRequestBuilder(providerId?: string) {
    //TODO: implement finding provider by id
    //and returning request buildter
    return {}
  }
  fetch(gqlQuery: string, variables: Record<string, any>, providerId?: string) {
    this.emitter.emit('parseStart')
    //const builder = this.getRequestBuilder(providerId)
    try {
      const definitions = cloneDeep(gql(gqlQuery).definitions as DocumentNode)

      return this.queryParser(definitions)
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
  return gritql
}

const qlEngine = qritQLEngine()
console.log(
  qlEngine
    .fetch(
      `
query test
{
  curr: fetch(a: 1, b: 2) {
    super
  }
  prev: fetch(a: 2, b: 3) {
    super2
  }
}

query test1
{
  curr1: fetch(a: 3, b: 4) {
    ignore
  }
}`,
      {},
    )
    .map(
      (q) =>
        q &&
        q.renderQuery().then((context) => {
          console.log(context.promise.toSQL().sql)
        }),
    ),
)

// function tt(k, q, v) {
//   if (!q) q = 0
//   k[q] = v
//   if (v == 'k') {
//     return tt(k, q, 'z')
//   }
//   if (v == 1) {
//     return tt(k, q + 1, 'k')
//   }
//   return k
// }
// var k = []
// console.log([1, 2, 3].reduce((k, q) => tt(k, k.length, q), k))
