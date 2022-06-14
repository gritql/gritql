import { transformFilters } from './filters'

export function parseMetric(tree, query, knex) {
  if (query.metricResolvers[tree.name?.value])
    return query.metricResolvers[tree.name?.value](tree, query, knex)
  else return query.metricResolvers.default(tree, query, knex)
}

export function parseDimension(tree, query, knex) {
  if (query.dimensionResolvers[tree.name?.value])
    return query.dimensionResolvers[tree.name?.value](tree, query, knex)
  else return query.dimensionResolvers.default(tree, query, knex)
}

export function parseFilters(tree, query, knex) {
  const { arguments: args } = tree
  return transformFilters(
    args.concat({ name: { value: 'from' }, value: { value: query.table } }),
    query,
    knex,
  )
}
