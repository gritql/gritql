import { Filter, FilterContext } from './types'
import { operators } from './operators'
import { combinators } from './combinators'
import { buildSearchExpression } from './search'
import { logger, LogModules } from '../utils/logger'

// Define supported operators as constants for type safety
const LOGICAL_OPS = ['and', 'or', 'not', 'nor'] as const
const COMPARISON_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'like', 'ilike'] as const
const SPECIAL_KEYS = ['table', 'inherited', 'search', 'having'] as const

type LogicalOp = typeof LOGICAL_OPS[number]
type ComparisonOp = typeof COMPARISON_OPS[number]

/**
 * Type guards for checking operator types
 */
const isLogicalOp = (key: string): key is LogicalOp => 
  LOGICAL_OPS.includes(key as LogicalOp)

const isComparisonOp = (key: string): key is ComparisonOp => 
  COMPARISON_OPS.includes(key as ComparisonOp)

const isSpecialKey = (key: string): boolean => 
  SPECIAL_KEYS.includes(key as any)

/**
 * Builds SQL expression for a field with comparison operators.
 * Example: { age: { eq: 30, ne: 40 } } -> "(age = 30 AND age <> 40)"
 */
function buildFieldFilter(field: string, conditions: any, context: FilterContext): string {
  logger.trace(LogModules.FILTER_PARSER, 'Building field filter', { field, conditions });
  
  const expressions = Object.entries(conditions)
    .filter(([op]) => isComparisonOp(op))
    .map(([op, value]) => {
      const result = operators[op](context, field, value).toString();
      logger.trace(LogModules.FILTER_PARSER, 'Applied operator', { field, operator: op, value, result });
      return result;
    })
    .filter(Boolean)

  return expressions.length > 1 
    ? `(${expressions.join(' AND ')})` 
    : expressions[0] || ''
}

/**
 * Main recursive function that builds SQL expressions from filter objects.
 * Handles logical operators, field conditions, and special keys.
 */
export function buildFilterExpression(filter: Filter, context: FilterContext): string {
  logger.debug(LogModules.FILTER_PARSER, 'Building filter expression', { 
    filterKeys: Object.keys(filter),
    contextTable: context.table 
  });
  
  const expressions: string[] = []

  for (const [key, value] of Object.entries(filter)) {
    // Handle context modifications
    if (key === 'table') {
      context = { ...context, table: value }
      continue
    }
    
    if (key === 'inherited') {
      context = { ...context, inherited: value }
      continue
    }

    // Handle logical operators (and, or, not, nor)
    if (isLogicalOp(key)) {
      const result = combinators[key](context, value)
      if (result) expressions.push(result)
      continue
    }

    // Handle full-text search
    if (key === 'search') {
      logger.trace(LogModules.FILTER_PARSER, 'Building search expression', { searchValue: value });
      const searchExpr = buildSearchExpression(context, value)
      if (searchExpr) expressions.push(searchExpr)
      continue
    }

    // Skip special keys that are handled elsewhere
    if (isSpecialKey(key)) continue

    // Handle field conditions
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Object value: check for operators like { eq: 5, ne: 10 }
      const hasOperators = Object.keys(value).some(isComparisonOp)
      
      if (hasOperators) {
        const fieldExpr = buildFieldFilter(key, value, context)
        if (fieldExpr) expressions.push(fieldExpr)
      } else {
        // Nested filter object without operators
        const nestedExpr = buildFilterExpression(value, context)
        if (nestedExpr) expressions.push(nestedExpr)
      }
    } else {
      // Direct value: treat as equality condition
      const expr = operators.eq(context, key, value).toString()
      if (expr) expressions.push(expr)
    }
  }

  return expressions.join(' AND ')
}

/**
 * Entry point for building filter SQL.
 * Separates WHERE and HAVING clauses and returns both.
 */
export function buildFilter(
  filter: Filter,
  context: FilterContext
): { where: string; having: string } {
  logger.info(LogModules.FILTER_PARSER, 'Building filter', { 
    hasFilter: !!filter,
    hasHaving: !!(filter as any)?.having 
  });
  
  if (!filter) return { where: '', having: '' }

  const { having, ...whereFilter } = filter as any
  
  const result = {
    where: buildFilterExpression(whereFilter, context),
    having: having ? buildFilterExpression(having, context) : ''
  }
  
  logger.debug(LogModules.FILTER_PARSER, 'Filter build complete', { 
    whereLength: result.where.length,
    havingLength: result.having.length 
  });
  
  return result;
}