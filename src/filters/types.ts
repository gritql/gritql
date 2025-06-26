/**
 * Core types for the filter system
 */

/**
 * Context passed through filter building operations.
 * Contains query configuration and current processing state.
 */
export interface FilterContext {
  /** Query configuration object */
  query: any
  
  /** Current table name for field qualification */
  table?: string
  
  /** Whether to include inherited filters */
  inherited?: boolean
  
  /** Whether to only process inherited filters */
  onlyInherited?: boolean
}

/**
 * Represents a value that can be either a literal or field reference.
 * Field references are used for JOIN conditions and field comparisons.
 */
export interface FilterValue {
  /** The actual value or field name */
  value: any
  
  /** True if value should be treated as a field name in SQL */
  isField?: boolean
}

/**
 * Supported filter operators
 */
export type FilterOperator = 
  | 'eq'     // Equals (=)
  | 'ne'     // Not equals (<>)
  | 'in'     // IN (array of values)
  | 'nin'    // NOT IN (array of values)
  | 'like'   // SQL LIKE (pattern matching)
  | 'ilike'  // Case-insensitive LIKE
  | 'and'    // Logical AND
  | 'or'     // Logical OR
  | 'not'    // Logical NOT
  | 'nor'    // Logical NOR (NOT OR)
  | 'search' // Full-text search

/**
 * Main filter interface supporting nested conditions and operators.
 * 
 * @example
 * {
 *   // Direct field equality
 *   name: 'John',
 *   
 *   // Field with operators
 *   age: { eq: 30, ne: 25 },
 *   
 *   // Logical operators
 *   and: [{ status: 'active' }, { verified: true }],
 *   or: [{ role: 'admin' }, { role: 'moderator' }],
 *   
 *   // Full-text search
 *   search: { description: 'product' }
 * }
 */
export interface Filter {
  /** Generic string index for field names */
  [key: string]: any
  
  /** Combines multiple filters with AND logic */
  and?: Filter[]
  
  /** Combines multiple filters with OR logic */
  or?: Filter[]
  
  /** Negates a filter condition */
  not?: Filter
  
  /** Combines filters with NOR logic (none should match) */
  nor?: Filter[]
  
  /** Full-text search fields (PostgreSQL only) */
  search?: Record<string, any>
}