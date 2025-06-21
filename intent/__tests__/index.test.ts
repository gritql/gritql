import '@jest/globals'
import { query } from '../src/index'

// Mock Knex QueryBuilder for testing without database
const mockKnex = {
  queryBuilder: () => ({
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    orderByRaw: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    with: jest.fn().mockReturnThis(),
    toQuery: jest
      .fn()
      .mockReturnValue('SELECT * FROM users WHERE active = true'),
  }),
} as any

describe('SQL Intent Library', () => {
  describe('Query Building', () => {
    test('builds basic query with steps', () => {
      const q = query().select('id', 'name').from('users').where('active', true)

      const steps = q.getSteps()
      expect(steps).toHaveLength(3)
      expect(steps[0]).toEqual({ type: 'select', args: ['id', 'name'] })
      expect(steps[1]).toEqual({ type: 'from', args: ['users'] })
      expect(steps[2]).toEqual({ type: 'where', args: ['active', true] })
    })

    test('supports all Knex methods via Proxy', () => {
      const q = query()
        .select('*')
        .from('users')
        .leftJoin('posts', 'users.id', 'posts.user_id')
        .whereIn('status', ['active', 'pending'])
        .groupBy('users.id')
        .having('count', '>', 5)
        .orderBy('name', 'desc')
        .limit(10)

      expect(q.getSteps()).toHaveLength(8)
    })
  })

  describe('Named Steps', () => {
    test('adds names to steps', () => {
      const q = query()
        .select('id')
        .name('idField')
        .from('users')
        .name('userTable')

      const steps = q.getSteps()
      expect(steps[0].name).toBe('idField')
      expect(steps[1].name).toBe('userTable')
    })
  })

  describe('Step Manipulation', () => {
    test('removes steps by index', () => {
      const q = query()
        .select('id')
        .from('users')
        .where('active', true)
        .limit(10)

      const modified = q.remove(2) // Remove where clause
      const steps = modified.getSteps()

      expect(steps).toHaveLength(3)
      expect(steps[2]).toEqual({ type: 'limit', args: [10] })
    })

    test('removes steps by name', () => {
      const q = query()
        .select('id')
        .from('users')
        .name('table')
        .where('active', true)
        .limit(10)

      const modified = q.remove('table')
      const steps = modified.getSteps()

      expect(steps).toHaveLength(3)
      expect(steps[1]).toEqual({ type: 'where', args: ['active', true] })
    })
  })

  describe('Knex Integration', () => {
    test('converts to Knex QueryBuilder', () => {
      const q = query().select('id').from('users').where('active', true)

      const knexQuery = q.toKnex(mockKnex)
      expect(knexQuery).toBeDefined()
      expect(typeof knexQuery.toQuery).toBe('function')
    })

    test('generates SQL string', () => {
      const q = query().select('id').from('users').where('active', true)

      const sql = q.toSQL(mockKnex)
      expect(sql).toContain('SELECT')
      expect(sql).toContain('FROM')
      expect(sql).toContain('WHERE')
    })
  })

  describe('Immutability', () => {
    test('operations return new instances', () => {
      const original = query().select('id').from('users')
      const modified = original.where('active', true)

      expect(original.getSteps()).toHaveLength(2)
      expect(modified.getSteps()).toHaveLength(3)
      expect(original).not.toBe(modified)
    })

    test('step removal returns new instance', () => {
      const original = query().select('id').from('users').where('active', true)

      const modified = original.remove(1)

      expect(original.getSteps()).toHaveLength(3)
      expect(modified.getSteps()).toHaveLength(2)
      expect(original).not.toBe(modified)
    })
  })

  describe('Complex Queries', () => {
    test('handles complex query building', () => {
      const q = query()
        .with('cte', 'SELECT * FROM temp')
        .select('users.*')
        .from('users')
        .leftJoin('posts', 'users.id', 'posts.user_id')
        .whereIn('status', ['active', 'pending'])
        .groupBy('users.id')
        .having('count', '>', 5)
        .orderByRaw('RANDOM()')
        .limit(50)

      expect(q.getSteps()).toHaveLength(9)
      expect(q.getSteps()[0].type).toBe('with')
      expect(q.getSteps()[8].type).toBe('limit')
    })
  })
})
