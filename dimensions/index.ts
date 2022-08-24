import { changeQueryTable, join, JoinType, Kind } from '../cross-table'
import {
  applyFilters,
  buildFullName,
  parseAdvancedFilters,
  withFilters,
} from '../filters'
import { parseDimension } from '../parser'
import { combineQuery } from '../query-combiner'
import { PropTypes } from '../types'
import { dimensionWrapper } from './wrapper'
import type { DocumentNode } from 'graphql'

export const dimensionResolvers = {
  groupBy: dimensionWrapper(
    (alias, args, query, knex) => {
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
        withFilters(query, query.filters)(
          knex
            .select([
              '*',
              knex.raw(`date_trunc(?, ??) as ??`, [
                args.by,
                args.field,
                `${args.field}_${args.by}`,
              ]),
            ])
            .from(args.from || query.table),
          knex,
        ),
        knex,
      )

      const table = args.alias || args.from || query.table
      changeQueryTable(query, knex, table, true)

      if (!query.replaceWith) query.replaceWith = {}
      query.replaceWith[args.field] = {
        value: `${args.field}_${args.by}`,
        index: query.groupIndex,
      }

      return query.promise
        .from(pre_trunc.as(table))
        .select(
          knex.raw(`?? as ??`, [
            `${args.field}_${args.by}`,
            alias || args.field,
          ]),
        )
        .groupBy(knex.raw(`??`, [`${args.field}_${args.by}`]))
    },
    {
      field: PropTypes.string.isRequired,
      by: PropTypes.oneOf([
        'microseconds',
        'milliseconds',
        'second',
        'minute',
        'hour',
        'day',
        'week',
        'month',
        'quarter',
        'year',
        'decade',
        'century',
        'millennium',
      ]),
      alias: PropTypes.string,
    },
    ['DATE_TRUNC', 'GROUP BY'],
    'knex',
  ),
  groupByEach: dimensionWrapper(
    (alias, args, query, knex) => {
      const amount = parseFloat(args.each)
      query.getters = query.getters || []

      query.promise = query.promise
        .select(
          knex.raw(
            `(CAST(FLOOR(CEIL(??)/??) AS INT)*?? || '-' || CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??`,
            [
              buildFullName(args, query, args.field, false),
              amount,
              amount,
              buildFullName(args, query, args.field, false),
              amount,
              amount,
              amount - 1,
              alias || args.field,
            ],
          ),
          knex.raw(`(CAST(FLOOR(CEIL(??)/??) AS INT)*??) AS ??`, [
            buildFullName(args, query, args.field, false),
            amount,
            amount,
            `groupByEach_min_${alias || args.field}`,
          ]),
          knex.raw(`(CAST(FLOOR(CEIL(??)/??) AS INT)*??+??) AS ??`, [
            buildFullName(args, query, args.field, false),
            amount,
            amount,
            amount - 1,
            `groupByEach_max_${alias || args.field}`,
          ]),
        )
        .groupBy(
          knex.raw('CAST(FLOOR(CEIL(??)/??) AS INT)', [
            buildFullName(args, query, args.field, false),
            amount,
          ]),
        )

      query.getters.push(`groupByEach_max_${alias || args.field}`)
      query.getters.push(`groupByEach_min_${alias || args.field}`)

      return query.promise
    },
    {
      field: PropTypes.string.isRequired,
      each: PropTypes.number,
    },
    ['CAST', 'FLOOR', 'CEIL', 'GROUP BY'],
    'knex',
  ),
  combine: dimensionWrapper(
    (_, args, query, knex) => {
      if (!args.fields || !Array.isArray(args.fields))
        throw "Combine function requires 'fields' argument with a list of fields"

      args.fields.forEach((field) => {
        if (typeof field === 'string') {
          const clonedQuery = parseDimension(
            {
              name: {
                value: field,
              },
            },
            query,
            knex,
          )

          query = combineQuery(query, clonedQuery)

          query.promise = clonedQuery.promise
        } else {
          if (!field.name) throw 'Combine by elements must have name'

          const { name, alias, resolver, ...rest } = field

          const tree: any = {
            name: {
              value: name,
            },
            resolver: {
              value: resolver,
            },
          }

          if (alias) {
            tree.alias = {
              value: alias,
            }
          }

          tree.arguments = rest

          const clonedQuery = parseDimension(tree, query, knex)

          query = combineQuery(query, clonedQuery)

          query.promise = clonedQuery.promise
        }
      })

      return query.promise
    },
    {
      fields: PropTypes.arrayOf(
        PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.shape({
            name: PropTypes.string.isRequired,
            alias: PropTypes.string,
            resolver: PropTypes.string,
          }),
        ]),
      ).isRequired,
    },
    [],
    'knex',
  ),
  default: dimensionWrapper((alias, args, query, knex, { tree }) => {
    if (query.provider !== 'ga') {
      const fullName = buildFullName(args, query, tree.name.value, false)

      return query.promise
        .select(alias ? knex.raw(`?? AS ??`, [fullName, alias]) : fullName)
        .groupBy(fullName)
    } else {
      return query.promise
    }
  }, []),
  join: join(JoinType.DEFAULT, Kind.DIMENSION),
  leftJoin: join(JoinType.LEFT, Kind.DIMENSION),
  rightJoin: join(JoinType.RIGHT, Kind.DIMENSION),
  fullJoin: join(JoinType.FULL, Kind.DIMENSION),
  innerJoin: join(JoinType.INNER, Kind.DIMENSION),
  leftOuterJoin: join(JoinType.LEFT_OUTER, Kind.DIMENSION),
  rightOuterJoin: join(JoinType.RIGHT_OUTER, Kind.DIMENSION),
  fullOuterJoin: join(JoinType.FULL_OUTER, Kind.DIMENSION),
}
