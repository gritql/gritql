import { createGritQL } from '../../index'
import { parse } from 'graphql'
import { ASTWalker } from '../../core/walker'
import { query } from '../../intent'

describe('Multiple Dimensions Query Splitting', () => {

  it('should split queries when multiple dimensions are at the same level', async () => {

    const gqlQuery = `
      query {
        fetch(table: "sales") {
          totalAmount: sum(field: "amount")
          byProduct {
            product
            amount: sum(field: "amount")
          }
          byRegion {
            region
            amount: sum(field: "amount")
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
    
    // Should have created multiple queries due to multiple dimensions
    expect(result.queries.length).toBeGreaterThan(1)
  })

  it('should handle metrics and dimensions together', async () => {
    const gqlQuery = `
      query {
        fetch(table: "sales") {
          totalAmount: sum(field: "amount")
          avgAmount: avg(field: "amount")
          byCategory {
            category
            total: sum(field: "amount")
            count: count
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
    
    // Should have at least 2 queries: one for top-level metrics, one for dimension
    expect(result.queries.length).toBeGreaterThanOrEqual(2)
  })

  it('should not split queries when only metrics are present', async () => {
    const gqlQuery = `
      query {
        fetch(table: "sales") {
          totalAmount: sum(field: "amount")
          avgAmount: avg(field: "amount")
          minAmount: min(field: "amount")
          maxAmount: max(field: "amount")
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
    
    // Should only have one query
    expect(result.queries.length).toBe(1)
  })

  it('should not split queries when only one dimension is present', async () => {
    const gqlQuery = `
      query {
        fetch(table: "sales") {
          byProduct {
            product
            total: sum(field: "amount")
            avg: avg(field: "amount")
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
    
    // Should only have one query
    expect(result.queries.length).toBe(1)
  })
})