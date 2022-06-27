import { dimensionWrapper } from './dimensions/wrapper'
import {
  applyRawJoin,
  buildFullName,
  parseAdvancedFilters,
  transformFilters,
} from './filters'
import { metricWrapper } from './metrics/wrapper'
import { PropTypes } from './types'

export enum JoinType {
  DEFAULT = 'join',
  LEFT = 'leftJoin',
  RIGHT = 'rightJoin',
  FULL = 'fullJoin',
  INNER = 'innerJoin',
  LEFT_OUTER = 'leftOuterJoin',
  RIGHT_OUTER = 'rightOuterJoin',
  FULL_OUTER = 'fullOuterJoin',
}

export function getEnumKeyByValue<T = any>(enumObj: T, value: string) {
  const index = Object.values(enumObj).indexOf(value)

  return Object.keys(enumObj)[index]
}

export enum Kind {
  DIMENSION = 'dimension',
  METRIC = 'metric',
}

export function join(type: JoinType, kind = Kind.METRIC) {
  return (kind === Kind.METRIC ? metricWrapper : dimensionWrapper)(
    function Join(_, args, query, knex, extras) {
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

      let promise

      if (byKeys.length) {
        const filters = transformFilters(
          (extras.tree.arguments || extras.tree.fields)
            .filter(({ name: { value } }) => byKeys.includes(value))
            .concat({ name: { value: 'from' }, value: { value: args.table } }),
          query,
        )

        promise = query.promise[type](args.table, function () {
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
        })
      } else {
        promise = applyRawJoin(query, knex, type, args.table, args.on)
      }

      query.joins = query.joins || []
      query.joins.push(args.table)

      return promise
    },
    {
      table: PropTypes.string.isRequired,
      on: PropTypes.shape({}),
      by: PropTypes.string,
      by_lt: PropTypes.string,
      by_gt: PropTypes.string,
      by_gte: PropTypes.string,
      by_lte: PropTypes.string,
      by_like: PropTypes.string,
      by_in: PropTypes.string,
    },
    Array.from(
      new Set([
        `${getEnumKeyByValue(JoinType, type)
          .replace('DEFAULT', 'JOIN')
          .replace('_', ' ')}`,
        'JOIN',
        'ON',
      ]),
    ),
    'knex',
  )
}

export function changeQueryTable(
  query,
  knex,
  table: string,
  dropJoins: boolean,
) {
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
