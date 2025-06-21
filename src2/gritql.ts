import { Merger } from './entities/Merger'

import { SourceProvider } from './entities/SourceProvider'
import PostgresProvider from './providers/PostgresProvider'
import { TinyEmitter } from 'tiny-emitter'
import { cloneDeep, omit } from 'lodash'
import { parseTypeDirective } from '../directives'

import { checkPropTypes, PropTypes } from '../types'
import {
  parseFilters,
  parseType,
  parseVariableDefinition,
  processSelections,
} from '../parser'
import gql from 'graphql-tag'
import Query from './QueryBuilder'
import { InferProps, ValidationMap } from 'prop-types'
import { argumentsToObject, transformLinkedArgs } from '../arguments'

class Runner {}

export default class GritQL {
  sourceProviders: SourceProvider[]
  public emitter: TinyEmitter

  constructor() {
    this.sourceProviders = []
    this.emitter = new TinyEmitter()
  }

  public queryParser(
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
            query.provider = 0
            query.query = new Query(this.sourceProviders[query.provider], () =>
              this.sourceProviders[query.provider].initiateQuery({
                table: query.table,
              }),
            )

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
    //would be good to clean this up
    const builder = this.sourceProviders[query.provider].getQueryBuilder()
    if (
      !query.filters &&
      (tree.name.value === 'fetch' ||
        tree.name.value === 'fetchPlain' ||
        tree.name.value === 'with')
    ) {
      query.name = tree.alias?.value || null
      //need to refactor this for new query builder
      const filters = parseFilters(tree, query, builder)

      query.query.do('apply_filters', {
        args: filters,
        advancedFilters: query.preparedAdvancedFilters,
      })
    }

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
        parseDimension.call(this, tree, query)

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
    parseMetric.call(this, tree, query)
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
    const builder = this.getRequestBuilder(providerId)
    try {
      const definitions = cloneDeep(gql(gqlQuery).definitions)

      this.queryParser(definitions)
    } catch (e) {
      console.log(e)
      console.log(e.stack)
      throw Error(e)
    }
  }
  use(provider: SourceProvider) {
    //TODO: check if sourceProviders already have signature, replace in the case
    //destroy should force disconnect
    this.sourceProviders.push(provider)
  }
}
const defaultPropTypes = {
  sort: PropTypes.oneOf(['asc', 'desc']),
  limit: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  offset: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  from: PropTypes.string,
}

function parseMetric(tree: any, query: any) {
  let args: InferProps<ValidationMap<any>> &
    InferProps<typeof defaultPropTypes> = tree.arguments
    ? argumentsToObject(tree.arguments)
    : null
  const alias = tree.alias?.value
  const name = tree.name?.value
  const metricInstruction = query.query.provider.getMetric(tree.name.value)
  query.query.do(metricInstruction, { alias, args, name })
}

function parseDimension(tree: any, query: any) {
  let args: InferProps<ValidationMap<any>> &
    InferProps<typeof defaultPropTypes> = tree.arguments
    ? transformLinkedArgs(argumentsToObject(tree.arguments), query)
    : null
  const alias = tree.alias?.value
  const name = tree.name?.value
  const dimensionInstruction = query.query.provider.getDimension(
    tree.name.value,
  )
  query.query.do(dimensionInstruction, { alias, args, name })
}
/*
const postgresqlProvider = new PostgresProvider({})
const gritql = new GritQL()
gritql.use(postgresqlProvider)
const defs = gql(`query test {
  some: fetch(a: 10, b: 20) {
    troo {
      data: divide(a: t, by: b)
    }
    
  }

}`).definitions
console.log(defs)

gritql
  .queryParser(defs)[0]
  .query.renderQuery()
  .then((context) => {
    console.log(context.promise.toSQL().sql)
  })

*/
