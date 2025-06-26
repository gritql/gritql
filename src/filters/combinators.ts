import { Filter, FilterContext } from './types'
import { buildFilterExpression } from './builder'

/**
 * Generic combinator that joins multiple filter expressions with a specified operator.
 * Filters out empty expressions and wraps result in parentheses.
 */
function combineFilters(
  context: FilterContext, 
  filters: Filter[], 
  operator: string
): string {
  const expressions = filters
    .map(filter => buildFilterExpression(filter, context))
    .filter(Boolean)
  
  return expressions.length ? `(${expressions.join(` ${operator} `)})` : ''
}

/**
 * Negates a filter expression by wrapping it with NOT.
 */
function negateExpression(context: FilterContext, filter: Filter): string {
  const expression = buildFilterExpression(filter, context)
  return expression ? `NOT (${expression})` : ''
}

/**
 * Combinators map - logical operators for combining filter conditions.
 * Each function transforms filters into SQL boolean expressions.
 */
export const combinators: Record<string, (context: FilterContext, filters: Filter[] | Filter) => string> = {
  // Combines filters with AND - all conditions must be true
  and: (ctx, filters) => combineFilters(ctx, filters as Filter[], 'AND'),
  
  // Combines filters with OR - at least one condition must be true
  or: (ctx, filters) => combineFilters(ctx, filters as Filter[], 'OR'),
  
  // Negates a single filter expression
  not: (ctx, filter) => negateExpression(ctx, filter as Filter),
  
  // NOR = NOT(OR) - none of the conditions should be true
  nor: (ctx, filters) => {
    const orExpression = combineFilters(ctx, filters as Filter[], 'OR')
    return orExpression ? `NOT ${orExpression}` : ''
  }
}