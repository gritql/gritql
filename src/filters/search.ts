import { FilterContext } from './types'
import { buildFieldName, prepareValue } from './operators'

/**
 * Builds PostgreSQL full-text search expressions using to_tsvector and plainto_tsquery.
 * 
 * The search uses 'simple' configuration for language-agnostic searching and
 * appends ':*' for prefix matching (e.g., 'prod' matches 'product', 'production').
 * 
 * @param context - The filter context containing query and builder info
 * @param searchFields - Object mapping field names to search terms
 * @returns SQL expression string for full-text search or empty string
 * 
 * @example
 * searchFields = { title: 'hello', description: 'world' }
 * Returns: "to_tsvector('simple', title) @@ ... AND to_tsvector('simple', description) @@ ..."
 */
export function buildSearchExpression(
  context: FilterContext,
  searchFields: Record<string, any>
): string {

  const searchExpressions: string[] = []

  for (const [field, value] of Object.entries(searchFields)) {
    const fieldName = buildFieldName(context, field)
    const { value: val, isField } = prepareValue(value)
    
    // Prevent duplicate search definitions for the same field
    if (context.query.search?.[fieldName]) {
      throw new Error(`Search for ${fieldName} already defined`)
    }
    
    // Store search configuration for query tracking
    context.query.search = {
      ...context.query.search,
      [fieldName]: value
    }
    
    // Build the PostgreSQL full-text search query
    // to_tsvector converts the field to searchable tokens
    // plainto_tsquery converts the search term to a query
    // ::text || ':*' adds prefix matching capability
    const searchExpr = `to_tsvector('simple', "${fieldName}") @@ (plainto_tsquery('simple', ${
      isField ? `"${val}"` : `'${String(val).replace(/'/g, "''")}'`
    })::text || ':*')::tsquery`
    
    searchExpressions.push(searchExpr)
  }
  
  return searchExpressions.join(' AND ')
}