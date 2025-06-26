import { parse } from 'graphql'
import { ASTWalker } from '../../core/walker'
import { query } from '../../intent'

describe('Nested Dimensions Query Splitting', () => {
  it('should handle deeply nested dimensions with metrics at multiple levels', () => {
    const gqlQuery = `
      query {
        fetch(table: "sales") {
          totalAmount: sum(field: "amount")
          avgAmount: avg(field: "amount")
          byRegion {
            region
            regionTotal: sum(field: "amount")
            byProduct {
              product
              productTotal: sum(field: "amount")
            }
            byStore {
              store
              storeTotal: sum(field: "amount")
            }
          }
        }
      }
    `

    const walker = new ASTWalker()
    const ast = parse(gqlQuery)
    
    const initialContext = {
      query: query(),
      variables: {},
      fragments: {},
      path: []
    }
    
    const result = walker.walk(ast, initialContext)
    
    // Should create multiple queries: metrics + byRegion split into byProduct and byStore
    expect(result.queries.length).toBeGreaterThan(1)
  })

  it('should handle multiple dimensions at different nesting levels', () => {
    const gqlQuery = `
      query {
        fetch(table: "sales") {
          byRegion {
            region
            total: sum(field: "amount")
            byProduct {
              product
              productTotal: sum(field: "amount")
            }
            byCategory {
              category
              categoryTotal: sum(field: "amount")
            }
          }
          byDepartment {
            department
            departmentTotal: sum(field: "amount")
          }
        }
      }
    `

    const walker = new ASTWalker()
    const ast = parse(gqlQuery)
    
    const initialContext = {
      query: query(),
      variables: {},
      fragments: {},
      path: []
    }
    
    const result = walker.walk(ast, initialContext)
    
    // Should create separate queries for each dimension branch
    expect(result.queries.length).toBeGreaterThan(2)
  })

  it('should handle mixed metrics and dimensions at multiple levels', () => {
    const gqlQuery = `
      query {
        fetch(table: "orders") {
          totalOrders: count
          avgOrderValue: avg(field: "total")
          byStatus {
            status
            statusCount: count
            statusTotal: sum(field: "total")
            byCustomer {
              customerId
              customerOrders: count
              customerTotal: sum(field: "total")
              avgOrderValue: avg(field: "total")
            }
          }
          byMonth {
            month
            monthlyOrders: count
            monthlyTotal: sum(field: "total")
          }
        }
      }
    `

    const walker = new ASTWalker()
    const ast = parse(gqlQuery)
    
    const initialContext = {
      query: query(),
      variables: {},
      fragments: {},
      path: []
    }
    
    const result = walker.walk(ast, initialContext)
    
    // Should create separate queries for each dimension path
    expect(result.queries.length).toBeGreaterThanOrEqual(2)
  })

  it('should preserve context when no splitting is needed in nested levels', () => {
    const gqlQuery = `
      query {
        fetch(table: "sales") {
          byRegion {
            region
            total: sum(field: "amount")
            avgAmount: avg(field: "amount")
            minAmount: min(field: "amount")
            maxAmount: max(field: "amount")
          }
        }
      }
    `

    const walker = new ASTWalker()
    const ast = parse(gqlQuery)
    
    const initialContext = {
      query: query(),
      variables: {},
      fragments: {},
      path: []
    }
    
    const result = walker.walk(ast, initialContext)
    
    // Should only have one query since there's only one dimension path
    expect(result.queries.length).toBe(1)
  })
})