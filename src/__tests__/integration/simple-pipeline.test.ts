import { createGritQL } from '../../index'

describe('Simple Pipeline Test', () => {
  it('should handle GraphQL parsing without hanging', async () => {
    const gritql = createGritQL({
      knex: undefined, // No database
      provider: 'test',
    })

    const query = `
      query {
        test {
          count
        }
      }
    `

    try {
      const result = await gritql.query({ query })
      expect(result).toBeDefined()
    } catch (error) {
      // Expected to fail without knex, but shouldn't hang
      expect(error).toBeDefined()
    }
  }, 10000) // 10 second timeout

  it('should parse AST without database', async () => {
    const gritql = createGritQL()

    // Create a proper mock knex that implements thenable interface
    const createMockQueryBuilder = () => {
      const mockQB: any = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        toString: jest.fn().mockReturnValue('SELECT * FROM test'),
        toQuery: jest.fn().mockReturnValue('SELECT * FROM test'),
      }

      // Implement thenable interface
      mockQB.then = jest.fn((resolve?: any) => {
        const result = [{ count: 1 }]
        return resolve
          ? Promise.resolve(result).then(resolve)
          : Promise.resolve(result)
      })

      return mockQB
    }

    const mockKnex = {
      queryBuilder: createMockQueryBuilder,
    }

    const query = `
      query {
        test {
          count
        }
      }
    `

    const result = await gritql.query({
      query,
      context: { knex: mockKnex as any },
    })

    expect(result).toBeDefined()
  }, 10000)
})
