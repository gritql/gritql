import { buildFilter } from './builder'
import { FilterContext } from './types'
import { logger, LogModules } from '../utils/logger'

/**
 * Creates a filter resolver for object-based filters.
 * The resolver applies WHERE and HAVING clauses to a query builder.
 * 
 * @param filters - Filter object with conditions and operators
 * @param query - Query configuration object
 * @returns Function that applies filters to a query promise
 */
export function createFilterResolver(filters: any, query: any) {
  return (queryPromise: any) => {
    logger.debug(LogModules.FILTER_PARSER, 'Creating filter resolver', { 
      filters,
      table: query.table 
    });
    
    const context: FilterContext = {
      query,
      table: query.table
    }

    const { where, having } = buildFilter(filters, context)

    if (where) {
      logger.trace(LogModules.FILTER_PARSER, 'Applying WHERE clause', { where });
      queryPromise = queryPromise.whereRaw(where)
    }

    if (having) {
      logger.trace(LogModules.FILTER_PARSER, 'Applying HAVING clause', { having });
      queryPromise = queryPromise.havingRaw(having)
    }

    return queryPromise
  }
}

/**
 * Creates a resolver for simple array-based filters.
 * Maintains backward compatibility with the original filter format.
 * 
 * @param filters - Array of [field, operator, value] tuples
 * @returns Function that applies filters using Knex methods
 * 
 * @example
 * filters = [
 *   ['name', '=', 'John'],
 *   ['age', '>', 25],
 *   ['status', 'in', ['active', 'pending']]
 * ]
 */
export function createSimpleFilterResolver(filters: any[]) {
  return (queryPromise: any) => {
    logger.debug(LogModules.FILTER_PARSER, 'Creating simple filter resolver', { 
      filterCount: filters.length 
    });
    
    return filters.reduce((qp, filter, index) => {
      const [field, operator, value] = filter
      logger.trace(LogModules.FILTER_PARSER, 'Applying filter', { field, operator, value, index });
      
      // Special handling for IN operator
      if (operator === 'in') {
        return index === 0 
          ? qp.whereIn(field, value)
          : qp.andWhereIn(field, value)
      }
      
      // Special handling for full-text search
      if (operator === 'search') {
        return qp.whereRaw(
          `to_tsvector('simple', ??) @@ (plainto_tsquery('simple', ?)::text || ':*')::tsquery`,
          [field, value]
        )
      }
      
      // Standard WHERE clause with appropriate method
      const method = index === 0 ? 'where' : 'andWhere'
      return qp[method](field, operator, value)
    }, queryPromise)
  }
}

/**
 * Main entry point for the filter system.
 * Determines the appropriate resolver based on filter format.
 * 
 * @param query - Query object
 * @param filters - Either an array of simple filters or an object with DSL filters
 * @returns Filter resolver function
 * 
 * Priority:
 * 1. Simple array resolver (for backward compatibility)
 * 2. Object-based DSL resolver
 */
export function withFilters(query: any, filters: any) {
  logger.info(LogModules.FILTER_PARSER, 'Resolving filter type', { 
    isArray: Array.isArray(filters)
  });
  
  // Use simple resolver for array-based filters
  if (Array.isArray(filters)) {
    logger.debug(LogModules.FILTER_PARSER, 'Using simple array resolver');
    return createSimpleFilterResolver(filters)
  }

  // Use DSL resolver for object-based filters
  logger.debug(LogModules.FILTER_PARSER, 'Using object-based DSL resolver');
  return createFilterResolver(filters, query)
}