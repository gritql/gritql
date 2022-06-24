import { argumentsToObject } from '../arguments'
import type { DocumentNode } from 'graphql'
import { omit, cloneDeep } from 'lodash'
import type { InferProps, ValidationMap } from 'prop-types'
import { checkPropTypes, PropTypes } from '../types'
import { Knex } from 'knex'
import { buildFullName } from '../filters'
import { combineQuery } from '../query-combiner'

const defaultPropTypes = {
  sort: PropTypes.oneOf(['asc', 'desc']),
  limit: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  offset: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
}

export const metricWrapper = <T = ValidationMap<any>>(
  metric: (
    alias: string,
    args: InferProps<T> & InferProps<typeof defaultPropTypes>,
    query,
    knex: Knex,
    extras: { tree: DocumentNode },
  ) => void,
  properties?: T,
  keywords?: string[],
) => {
  return (tree: DocumentNode, query, knex: Knex) => {
    const { metrics = [] } = query
    query.metrics = metrics

    if (
      keywords &&
      !keywords.every((keyword) =>
        query.providers[query.provider].keywords.includes(keyword),
      )
    ) {
      throw new Error(
        `${query.provider} provider doesn't support ${tree.name.value} metric`,
      )
    }

    let args: InferProps<T> & InferProps<typeof defaultPropTypes> =
      tree.arguments ? argumentsToObject(tree.arguments) : null

    if (properties && !args) {
      throw new Error(`${tree.name.value} metric requires arguments`)
    }

    if (properties) {
      checkPropTypes(properties, args, 'arguments', tree.name.value)
    }

    const alias = tree.alias?.value
    const clonedQuery = {
      ...cloneDeep(
        omit(
          query as {
            table: string
            joins: string[]
            advancedFilters: any
            search: Record<string, any>
            preparedAdvancedFilters: Knex.Raw
            getters: string[]
          },
          ['promise'],
        ),
      ),
      promise: query.promise.clone(),
    }
    // Isolate metric call for plugin system
    const promise = metric(alias, args, clonedQuery, knex, { tree })

    if (typeof promise === 'undefined') {
      throw new Error(
        "This metric didn't provide any output, looks like you forgot to return #promise",
      )
    }

    query.promise = promise

    query = combineQuery(query, clonedQuery)

    if (args?.sort == 'desc' || args?.sort == 'asc')
      query.promise.orderBy(
        buildFullName(args, query, tree.name.value),
        args.sort,
      )
    if (args?.limit) query.promise.limit(args.limit)
    if (args?.offset) query.promise.offset(args.offset)

    // Getters are needed only for additionaly selected fields by some specific functions
    // example: price(groupByEach: 50) -> price: 0-50 -> groupByEach_min_price: 0 -> groupByEach_max_price: 50
    // would be useful for further grouping && filtering
    const isInGetters = query.getters?.find((name) => name === tree.name?.value)

    query.metrics.push(
      isInGetters ? tree.name?.value : tree.alias?.value || tree.name?.value,
    )
  }
}
