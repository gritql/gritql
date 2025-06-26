import { FilterContext, FilterValue } from './types'

/**
 * Builds a fully qualified field name by prepending the table name if needed.
 * Handles @ prefix which indicates a field reference in another table.
 */
export function buildFieldName(context: FilterContext, field: string): string {
  if (!field?.startsWith('@') && !context.table) {
    return field
  }
  return `${context.table || context.query.table}.${field.replace(/^@/, '')}`
}

/**
 * Prepares a value for SQL insertion, determining if it's a field reference or literal.
 * @ prefix indicates the value should be treated as a field name, not a literal.
 */
export function prepareValue(value: any): FilterValue {
  if (typeof value === 'object' && value.isField !== undefined) {
    return value
  }
  if (typeof value === 'string' && value.startsWith('@')) {
    return { value: value.substring(1), isField: true }
  }
  return { value, isField: false }
}

/**
 * Creates a SQL fragment for simple comparison operators.
 * Returns a SQL string with proper escaping.
 */
function createComparisonOperator(sqlOperator: string) {
  return (ctx: FilterContext, field: string, value: any) => {
    const fieldName = buildFieldName(ctx, field)
    const { value: val, isField } = prepareValue(value)
    
    if (isField) {
      return `"${fieldName}" ${sqlOperator} "${val}"`
    } else {
      // Escape single quotes in string values
      const escapedVal = typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val
      return `"${fieldName}" ${sqlOperator} ${escapedVal}`
    }
  }
}

/**
 * Creates a SQL fragment for IN/NOT IN operators with array values.
 * Validates that the value is an array before processing.
 */
function createInOperator(negate = false) {
  return (ctx: FilterContext, field: string, values: any[]) => {
    if (!Array.isArray(values)) {
      throw new Error(`${negate ? 'NIN' : 'IN'} operator requires an array value`)
    }
    
    const fieldName = buildFieldName(ctx, field)
    const operator = negate ? 'NOT IN' : 'IN'
    const escapedValues = values.map(v => 
      typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
    ).join(',')
    
    return `"${fieldName}" ${operator} (${escapedValues})`
  }
}

// Operator functions map - simplified using factory functions
export const operators: Record<string, (ctx: FilterContext, field: string, value: any) => any> = {
  eq: createComparisonOperator('='),
  ne: createComparisonOperator('<>'),
  gt: createComparisonOperator('>'),
  gte: createComparisonOperator('>='),
  lt: createComparisonOperator('<'),
  lte: createComparisonOperator('<='),
  like: createComparisonOperator('LIKE'),
  ilike: createComparisonOperator('ILIKE'),
  in: createInOperator(false),
  nin: createInOperator(true)
}