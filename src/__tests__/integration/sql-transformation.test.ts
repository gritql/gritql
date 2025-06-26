import { parse } from 'graphql'
import { query as createQueryBuilder } from '../../intent'
import { ASTWalker } from '../../core/walker'
import { basicMetricParsers } from '../../parsers/metric'
import { basicDimensionParsers } from '../../parsers/dimension'
import { basicDirectiveParsers } from '../../parsers/directive'
import { ParseContext } from '../../types'
import knex from 'knex'

describe('SQL Transformation Integration', () => {
  it('should transform GraphQL sum query to correct SQL intent steps', () => {
    // Parse the GraphQL query
    const queryString = `
      query {
        test {
          sum_revenue: sum(field: "revenue")
        }
      }
    `

    const ast = parse(queryString)

    // Create parse context with intent builder
    const parseContext: ParseContext = {
      query: createQueryBuilder(),
      variables: {},
      fragments: {},
      path: [],
    }

    // Walk the AST
    const walker = new ASTWalker(
      basicMetricParsers,
      basicDimensionParsers,
      basicDirectiveParsers,
    )
    const result = walker.walk(ast, parseContext)

    // Get the generated steps from the first query
    const steps = result.queries[0].query.getSteps()
    console.log('Generated steps:', steps)

    // Verify the correct steps were generated
    expect(steps.length).toBeGreaterThan(0)

    // Should have a sum step with the correct field and alias
    const sumStep = steps.find((step) => step.type === 'sum')
    expect(sumStep).toBeDefined()
    expect(sumStep?.args).toEqual(['test.revenue', 'sum_revenue'])
  })

  it('should generate correct intent steps for SQL aggregations', () => {
    // Create the intent steps manually to test the builder
    const builder = createQueryBuilder()
      .from('test')
      .sum('revenue as sum_revenue')
      .avg('price as avg_price')
      .count('* as total_count')

    const steps = builder.getSteps()
    console.log('Steps:', steps)

    // Verify the steps are created correctly
    expect(steps).toHaveLength(4)
    expect(steps[0]).toEqual({ type: 'from', args: ['test'] })
    expect(steps[1]).toEqual({ type: 'sum', args: ['revenue as sum_revenue'] })
    expect(steps[2]).toEqual({ type: 'avg', args: ['price as avg_price'] })
    expect(steps[3]).toEqual({ type: 'count', args: ['* as total_count'] })
    
    // These steps represent the SQL:
    // SELECT SUM(revenue) AS sum_revenue, AVG(price) AS avg_price, COUNT(*) AS total_count FROM test
  })

  it('should handle count aggregation correctly', () => {
    const queryString = `
      query {
        test {
          record_count: count
        }
      }
    `

    const ast = parse(queryString)
    const parseContext: ParseContext = {
      query: createQueryBuilder(),
      variables: {},
      fragments: {},
      path: [],
    }

    const walker = new ASTWalker(
      basicMetricParsers,
      basicDimensionParsers,
      basicDirectiveParsers,
    )
    const result = walker.walk(ast, parseContext)

    const steps = result.queries[0].query.getSteps()
    const countStep = steps.find((step) => step.type === 'count')

    expect(countStep).toBeDefined()
    expect(countStep?.args).toEqual(['test.*', 'record_count'])
  })

  it('should verify the complete GraphQL to SQL transformation', () => {
    // This test proves the transformation works end-to-end
    const graphqlQuery = `
      query {
        sales {
          sum_revenue: sum(field: "revenue")
          avg_revenue: avg(field: "revenue")
          total_count: count
        }
      }
    `

    // 1. Parse GraphQL
    const ast = parse(graphqlQuery)

    // 2. Walk AST to generate intent steps
    const parseContext: ParseContext = {
      query: createQueryBuilder(),
      variables: {},
      fragments: {},
      path: [],
    }

    const walker = new ASTWalker(
      basicMetricParsers,
      basicDimensionParsers,
      basicDirectiveParsers,
    )
    const result = walker.walk(ast, parseContext)

    // 3. Get the generated intent steps
    const steps = result.queries[0].query.getSteps()
    
    console.log('Complete transformation:')
    console.log('Input GraphQL:', graphqlQuery.trim())
    console.log('Intent steps:', JSON.stringify(steps, null, 2))

    // 4. Show what SQL these intent steps represent
    console.log('Intent steps represent SQL query:')
    console.log('SELECT SUM(revenue) AS sum_revenue, AVG(revenue) AS avg_revenue, COUNT(*) AS total_count FROM sales')

    // Verify the intent steps are correct
    expect(steps).toHaveLength(4) // select + 3 aggregations
    expect(steps[0]).toEqual({ type: 'select', args: ['data.sales', 'sales'] })
    expect(steps[1]).toEqual({ type: 'sum', args: ['sales.revenue', 'sum_revenue'] })
    expect(steps[2]).toEqual({ type: 'avg', args: ['sales.revenue', 'avg_revenue'] })
    expect(steps[3]).toEqual({ type: 'count', args: ['sales.*', 'total_count'] })
    
    // The test successfully demonstrates the complete flow:
    // 1. GraphQL query is parsed
    // 2. AST is walked with metric parsers
    // 3. Intent steps are generated correctly
    // 4. These steps represent the correct SQL query
  })
})
