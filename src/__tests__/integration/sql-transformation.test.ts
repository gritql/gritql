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
    walker.walk(ast, parseContext)

    // Get the generated steps
    const steps = parseContext.query.getSteps()
    console.log('Generated steps:', steps)

    // Verify the correct steps were generated
    expect(steps.length).toBeGreaterThan(0)

    // Should have a sum step with the correct field and alias
    const sumStep = steps.find((step) => step.type === 'sum')
    expect(sumStep).toBeDefined()
    expect(sumStep?.args).toEqual(['test.revenue', 'sum_revenue'])
  })

  it('should generate correct SQL from intent steps', () => {
    // Create a real Knex instance for SQL generation
    const db = knex({
      client: 'pg',
    })

    // Create the intent steps manually to test SQL generation
    const builder = createQueryBuilder()
      .sum('test.revenue as sum_revenue')
      .from('test')

    // Generate the Knex query
    const knexQuery = builder.toKnex(db)
    const sql = knexQuery.toString()

    console.log('Generated SQL:', sql)
    console.log('Steps:', builder.getSteps())

    // Verify the SQL contains the expected elements
    expect(sql.toLowerCase()).toContain('sum')
    expect(sql.toLowerCase()).toContain('revenue')
    expect(sql.toLowerCase()).toContain('sum_revenue')
    expect(sql.toLowerCase()).toContain('from')
    expect(sql.toLowerCase()).toContain('test')
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
    walker.walk(ast, parseContext)

    const steps = parseContext.query.getSteps()
    const countStep = steps.find((step) => step.type === 'count')

    expect(countStep).toBeDefined()
    expect(countStep?.args).toEqual(['test.*', 'record_count'])
  })

  it('should verify the complete GraphQL to SQL transformation', () => {
    // This test proves the transformation works end-to-end
    const graphqlQuery = `
      query {
        test {
          sum_revenue: sum(field: "revenue")
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
    walker.walk(ast, parseContext)

    // 3. Generate SQL from intent steps
    const db = knex({
      client: 'pg',
    })

    const builder = parseContext.query.from('test') // Add table
    const sql = builder.toKnex(db).toString()

    console.log('Complete transformation:')
    console.log('Input GraphQL:', graphqlQuery.trim())
    console.log('Generated SQL:', sql)
    console.log('Intent steps:', parseContext.query.getSteps())

    // Verify the transformation is correct
    expect(sql.toLowerCase()).toMatch(
      /select.*sum.*revenue.*sum_revenue.*from.*test/,
    )
  })
})
