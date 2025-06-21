import '@jest/globals'
import { query } from '../src/index'

describe('Group Functionality', () => {
  describe('Group Creation', () => {
    test('creates groups with startGroup and endGroup', () => {
      const q = query()
        .select('id')
        .startGroup()
        .from('users')
        .where('active', true)
        .endGroup()
        .orderBy('name')

      const steps = q.getSteps()
      expect(steps).toHaveLength(3)
      expect(steps[0]).toEqual({ type: 'select', args: ['id'] })
      expect(steps[1].type).toBe('__GROUP')
      expect(steps[1].steps).toHaveLength(2)
      expect(steps[1].steps![0]).toEqual({ type: 'from', args: ['users'] })
      expect(steps[1].steps![1]).toEqual({
        type: 'where',
        args: ['active', true],
      })
      expect(steps[2]).toEqual({ type: 'orderBy', args: ['name'] })
    })

    test('handles nested operations within groups', () => {
      const q = query()
        .startGroup()
        .select('id', 'name')
        .from('users')
        .where('status', 'active')
        .where('age', '>', 18)
        .endGroup()

      const steps = q.getSteps()
      expect(steps).toHaveLength(1)
      expect(steps[0].type).toBe('__GROUP')
      expect(steps[0].steps).toHaveLength(4)
    })

    test('handles empty groups', () => {
      const q = query().select('id').startGroup().endGroup().from('users')

      const steps = q.getSteps()
      expect(steps).toHaveLength(3)
      expect(steps[1].type).toBe('__GROUP')
      expect(steps[1].steps).toHaveLength(0)
    })
  })

  describe('Named Groups', () => {
    test('assigns names to groups', () => {
      const q = query()
        .startGroup()
        .from('users')
        .where('active', true)
        .endGroup()
        .name('userFilter')

      const steps = q.getSteps()
      expect(steps[0].name).toBe('userFilter')
      expect(steps[0].type).toBe('__GROUP')
    })

    test('can name groups and manipulate them', () => {
      const q = query()
        .select('id')
        .startGroup()
        .from('users')
        .where('active', true)
        .endGroup()
        .name('userQuery')
        .orderBy('name')

      const steps = q.getSteps()
      expect(steps).toHaveLength(3)
      expect(steps[1].name).toBe('userQuery')
    })
  })

  describe('Group Manipulation', () => {
    test('removes entire groups by name', () => {
      const q = query()
        .select('id')
        .startGroup()
        .from('users')
        .where('active', true)
        .endGroup()
        .name('userFilter')
        .orderBy('name')
        .limit(10)

      const modified = q.remove('userFilter')
      const steps = modified.getSteps()

      expect(steps).toHaveLength(3)
      expect(steps[0]).toEqual({ type: 'select', args: ['id'] })
      expect(steps[1]).toEqual({ type: 'orderBy', args: ['name'] })
      expect(steps[2]).toEqual({ type: 'limit', args: [10] })
    })

    test('removes groups by index', () => {
      const q = query()
        .select('id')
        .startGroup()
        .from('users')
        .where('active', true)
        .endGroup()
        .orderBy('name')

      const modified = q.remove(1) // Remove the group
      const steps = modified.getSteps()

      expect(steps).toHaveLength(2)
      expect(steps[0]).toEqual({ type: 'select', args: ['id'] })
      expect(steps[1]).toEqual({ type: 'orderBy', args: ['name'] })
    })
  })

  describe('Group Execution', () => {
    test('executes all steps within groups when converting to Knex', () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
      }
      const mockKnexLocal = {
        queryBuilder: () => mockQb
      }

      const q = query()
        .startGroup()
        .select('id')
        .from('users')
        .where('active', true)
        .endGroup()

      q.toKnex(mockKnexLocal as any)
      
      expect(mockQb.select).toHaveBeenCalledWith('id')
      expect(mockQb.from).toHaveBeenCalledWith('users')
      expect(mockQb.where).toHaveBeenCalledWith('active', true)
    })

    test('executes mixed regular steps and groups', () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      }
      const mockKnexLocal = {
        queryBuilder: () => mockQb
      }

      const q = query()
        .select('*')
        .startGroup()
        .from('users')
        .where('active', true)
        .endGroup()
        .orderBy('name')

      q.toKnex(mockKnexLocal as any)
      
      expect(mockQb.select).toHaveBeenCalledWith('*')
      expect(mockQb.from).toHaveBeenCalledWith('users')
      expect(mockQb.where).toHaveBeenCalledWith('active', true)
      expect(mockQb.orderBy).toHaveBeenCalledWith('name')
    })

    test('generates SQL with grouped steps included', () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        toQuery: jest.fn().mockReturnValue('SELECT "id" FROM "users" WHERE "active" = true ORDER BY "name" ASC')
      }
      const mockKnexLocal = {
        queryBuilder: () => mockQb
      }

      const q = query()
        .select('id')
        .startGroup()
        .from('users')
        .where('active', true)
        .endGroup()
        .orderBy('name')

      const sql = q.toSQL(mockKnexLocal as any)
      
      expect(sql).toContain('SELECT')
      expect(sql).toContain('FROM "users"')
      expect(sql).toContain('WHERE "active" = true')
      expect(sql).toContain('ORDER BY')
    })

    test('generates SQL without removed groups', () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        toQuery: jest.fn().mockReturnValue('SELECT "id" ORDER BY "name" ASC')
      }
      const mockKnexLocal = {
        queryBuilder: () => mockQb
      }

      const q = query()
        .select('id')
        .startGroup()
        .from('users')
        .where('active', true)
        .endGroup()
        .name('filters')
        .orderBy('name')

      const withoutGroup = q.remove('filters')
      const sql = withoutGroup.toSQL(mockKnexLocal as any)
      
      expect(sql).toContain('SELECT')
      expect(sql).toContain('ORDER BY')
      expect(sql).not.toContain('FROM "users"')
      expect(sql).not.toContain('WHERE "active"')
    })
  })

  describe('Edge Cases', () => {
    test('handles endGroup without startGroup gracefully', () => {
      const q = query().select('id').from('users').endGroup()

      const steps = q.getSteps()
      expect(steps).toHaveLength(2) // No group created
      expect(steps[0]).toEqual({ type: 'select', args: ['id'] })
      expect(steps[1]).toEqual({ type: 'from', args: ['users'] })
    })

    test('handles multiple consecutive groups', () => {
      const q = query()
        .startGroup()
        .select('id')
        .endGroup()
        .name('selectGroup')
        .startGroup()
        .from('users')
        .where('active', true)
        .endGroup()
        .name('filterGroup')

      const steps = q.getSteps()
      expect(steps).toHaveLength(2)
      expect(steps[0].name).toBe('selectGroup')
      expect(steps[1].name).toBe('filterGroup')
    })

    test('maintains immutability with groups', () => {
      const original = query()
        .startGroup()
        .select('id')
        .from('users')
        .endGroup()

      const modified = original.where('active', true)

      expect(original.getSteps()).toHaveLength(1)
      expect(modified.getSteps()).toHaveLength(2)
      expect(original).not.toBe(modified)
    })
  })
})
