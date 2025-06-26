import { withFilters } from './entry'

// Example 1: Simple filters array (backward compatible)
const simpleFilters = [
  ['name', '=', 'John'],
  ['age', '>', 25],
  ['status', 'in', ['active', 'pending']],
]

// Example 2: Object-based filters with DSL
const advancedFilters = {
  // Direct field equality
  status: 'active',

  // Field with operators
  age: {
    eq: 30,
  },

  // Logical operators
  and: [{ name: { like: '%John%' } }, { email: { ilike: '%@company.com' } }],

  // OR condition
  or: [{ department: 'Sales' }, { department: 'Marketing' }],

  // NOT condition
  not: {
    status: 'deleted',
  },

  // Search functionality
  search: {
    description: 'product features',
    title: 'announcement',
  },

  // With having clause
  having: {
    count: { eq: 5 },
  },
}

// Example 3: Nested filters
const nestedFilters = {
  and: [
    {
      or: [{ category: 'electronics' }, { category: 'computers' }],
    },
    {
      not: {
        status: 'discontinued',
      },
    },
  ],
  price: {
    ne: 0,
  },
}

// Usage with mock query object
const mockQuery = {
  table: 'products',
}

// The withFilters function returns a resolver
const simpleResolver = withFilters(mockQuery, simpleFilters)
const advancedResolver = withFilters(mockQuery, advancedFilters)
const nestedResolver = withFilters(mockQuery, nestedFilters)

// Mock Knex query builder for testing
class MockQueryBuilder {
  private conditions: string[] = []
  
  whereRaw(sql: string) {
    this.conditions.push(`WHERE: ${sql}`)
    return this
  }
  
  havingRaw(sql: string) {
    this.conditions.push(`HAVING: ${sql}`)
    return this
  }
  
  where(field: string, op: string, value: any) {
    this.conditions.push(`WHERE: ${field} ${op} ${value}`)
    return this
  }
  
  andWhere(field: string, op: string, value: any) {
    this.conditions.push(`AND WHERE: ${field} ${op} ${value}`)
    return this
  }
  
  whereIn(field: string, values: any[]) {
    this.conditions.push(`WHERE IN: ${field} IN (${values.join(', ')})`)
    return this
  }
  
  andWhereIn(field: string, values: any[]) {
    this.conditions.push(`AND WHERE IN: ${field} IN (${values.join(', ')})`)
    return this
  }
  
  getConditions() {
    return this.conditions
  }
}


// Test simple filters
console.log('=== Simple Filters ===')
const simpleQb = new MockQueryBuilder()
simpleResolver(simpleQb)
console.log(simpleQb.getConditions())

// Test advanced filters
console.log('\n=== Advanced Filters ===')
const advancedQb = new MockQueryBuilder()
advancedResolver(advancedQb)
console.log(advancedQb.getConditions())

// Test nested filters
console.log('\n=== Nested Filters ===')
const nestedQb = new MockQueryBuilder()
nestedResolver(nestedQb)
console.log(nestedQb.getConditions())
