import {
  basicSqlDimensions,
  basicSqlMetrics,
  Instruction,
} from '../Instructions/basic'
import { KnexBasedSQLProvider } from './KnexBasedSQLProvider'

export default class PostgresProvider extends KnexBasedSQLProvider {
  name = 'postgres'

  constructor(configuration, connector?) {
    super(configuration, connector || require('postgres'))
  }
  initiateQuery({ table }) {
    const builder = this.getQueryBuilder()
    return { promise: builder.select().from(table), builder }
  }
  instructions = Instructions
  metrics = basicSqlMetrics
  dimensions = basicSqlDimensions

  getMetric(name) {
    const metric = this.metrics.find((instruction) => instruction.name === name)
    return metric
  }
  getDimension(name) {
    const dimension = this.dimensions.find(
      (instruction) => instruction.name === name,
    )
    if (!dimension) return this.dimensions[0] //return default
    return dimension
  }
  getInstruction(name: string) {
    const instruction = this.instructions.find(
      (instruction) => instruction.name === name,
    )
    if (!instruction) {
      throw new Error(`Instruction ${name} not found in ${this.name} provider`)
    }
    return instruction
  }
}

const apply_filters: Instruction = function apply_filters(
  this,
  { promise, builder },
  { args: filters, advancedFilters },
) {
  // todo: refactor, remove advanced filters. All should be normalised if possible.
  if (advancedFilters) {
    if (advancedFilters?.where) {
      promise = promise.where(builder.raw(advancedFilters.where))
    }

    if (advancedFilters?.having) {
      promise = promise.having(builder.raw(advancedFilters.having))
    }
  }
  return filters.reduce((queryPromise, filter, i) => {
    const selector =
      filter[1] === 'in' ? 'whereIn' : i === 0 ? 'where' : 'andWhere'
    return queryPromise[selector].apply(
      queryPromise,
      filter[1] === 'in'
        ? filter.filter((a) => a !== 'in')
        : filter[1] === 'search'
        ? [
            builder.raw(
              `to_tsvector('simple', ??) @@ (plainto_tsquery('simple', ?)::text || ':*')::tsquery`,
              [filter[0], filter[2]],
            ),
          ]
        : filter,
    )
  }, promise)
}

apply_filters.keywords = ['WHERE', 'IN', 'AND', 'OR', 'LIKE', 'ILIKE']
apply_filters.priority = 0

const Instructions: Instruction[] = [apply_filters].concat(basicSqlMetrics)
