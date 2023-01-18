import knexConstructor, { Knex } from 'knex'
import { QueryTransformer } from '../entities/QueryTransformer'
import { ResultTransformer } from '../entities/ResultTransformer'
import { Instruction } from '../QueryBuilder'
import { KnexBasedSQLProvider } from './KnexBasedSQLProvider'

export class PostgresProvider extends KnexBasedSQLProvider {
  name = 'postgres'
  public queryTransformer: QueryTransformer
  public resultTransformer: ResultTransformer
  constructor(configuration, connector?) {
    super(configuration, connector || require('postgres'))
  }
  initiateQuery({ table }) {
    const builder = this.getQueryBuilder()
    return { promise: builder.select().from(table), builder }
  }
  instructions = [apply_filters]
}

const apply_filters: Instruction = function apply_filters(
  this,
  { promise, builder },
  { args: filters },
) {
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
