import { argumentsToObject, transformLinkedArgs } from '../arguments'
import type { DocumentNode } from 'graphql'
import { omit, cloneDeep } from 'lodash'
import type { InferProps, ValidationMap } from 'prop-types'
import { checkPropTypes, PropTypes } from '../types'
import { Knex } from 'knex'
import { buildFullName } from '../filters'
import { combineQuery } from '../query-combiner'

const defaultPropTypes = {
  sort_desc: PropTypes.string,
  sort_asc: PropTypes.string,
  limit: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  offset: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  type: PropTypes.oneOf(['Array', 'Map']),
}

export const dimensionWrapper = <T = ValidationMap<any>>(
  dimension: (
    alias: string,
    args: InferProps<T> & InferProps<typeof defaultPropTypes>,
    query,
    knex: Knex,
    extras: { tree: DocumentNode },
  ) => void,
  properties?: T,
  keywords?: string[],
  builder?: string,
) => {
  return (tree: DocumentNode, query, knex: Knex) => {
    if (
      keywords &&
      !keywords.every((keyword) =>
        query.providers[query.provider].keywords.includes(keyword),
      )
    ) {
      throw new Error(
        `${query.provider} provider doesn't support ${tree.name.value} dimension`,
      )
    }

    if (builder) {
      if (query.providers[query.provider].queryBuilder !== builder) {
        throw new Error(
          `${query.provider} provider doesn't support ${tree.name.value} dimension`,
        )
      }
    }

    let args: InferProps<T> & InferProps<typeof defaultPropTypes> =
      tree.arguments
        ? transformLinkedArgs(argumentsToObject(tree.arguments), query)
        : null

    if (properties && !args) {
      throw new Error(`${tree.name.value} dimension requires arguments`)
    }

    if (properties) {
      checkPropTypes(properties, args, 'arguments', tree.name.value)
    }

    const { dimensions = [] } = query
    if (!query.groupIndex) query.groupIndex = 0
    query.groupIndex++

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
          },
          ['promise'],
        ),
      ),
      promise: query.promise.clone(),
    }
    // Isolate metric call for plugin system
    const promise = dimension(alias, args, clonedQuery, knex, { tree })

    if (typeof promise === 'undefined') {
      throw new Error(
        "This metric didn't provide any output, looks like you forgot to return #promise",
      )
    }

    query.promise = promise

    query = combineQuery(query, clonedQuery)

    if (query.providers[query.provider].queryBuilder === 'knex') {
      if (!!args?.sort_desc)
        query.promise.orderBy(
          buildFullName(args, query, args?.sort_desc),
          'desc',
        )
      if (!!args?.sort_asc)
        query.promise.orderBy(buildFullName(args, query, args?.sort_asc), 'asc')

      if (!!args?.limit) query.promise.limit(args?.limit)
      if (!!args?.offset) query.promise.offset(args?.offset)
    } else {
      if (!!args?.sort_desc)
        query.orderBys = (query.orderBys || []).concat(`-${args?.sort_desc}`)
      if (!!args?.sort_asc)
        query.orderBys = (query.orderBys || []).concat(args?.sort_asc)
    }

    dimensions.push(tree.alias?.value || tree.name.value)

    query.dimensions = dimensions

    return query
  }
}
