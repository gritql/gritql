export const combineQuery = (query, clonedQuery) => {
  // Meta information from metric/dimension
  // We are getting it like this to avoid side-effects of metric
  query.table = clonedQuery.table
  query.joins = clonedQuery.joins
  query.advancedFilters = clonedQuery.advancedFilters
  query.preparedAdvancedFilters = clonedQuery.preparedAdvancedFilters
  query.search = clonedQuery.search
  query.getters = clonedQuery.getters

  return query
}
