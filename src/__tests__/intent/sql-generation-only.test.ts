import '@jest/globals'
import { query } from '../../intent'
import knex from 'knex'

// Knex instance for SQL generation only (no database connection)
const sqlOnlyKnex = knex({
  client: 'postgresql',
  // no connection provided - SQL generation only
})

describe('SQL Generation Only (No Database)', () => {
  describe('Basic Queries', () => {
    test('generates basic select SQL', () => {
      const q = query().select('id', 'name').from('users').where('active', true)

      const sql = q.toSQL(sqlOnlyKnex)

      expect(sql).toBe('select "id", "name" from "users" where "active" = true')
    })
  })

  describe('Aggregation Functions', () => {
    test('generates sum aggregation SQL', () => {
      const q = query().sum('test.revenue as sum_revenue').from('test')

      const sql = q.toSQL(sqlOnlyKnex)

      expect(sql).toBe(
        'select sum("test"."revenue") as "sum_revenue" from "test"',
      )
    })

    test('generates count aggregation SQL', () => {
      const q = query().count('* as record_count').from('test')

      const sql = q.toSQL(sqlOnlyKnex)

      expect(sql).toBe('select count(*) as "record_count" from "test"')
    })

    test('two-argument syntax shows Knex limitation', () => {
      const q = query().sum('test.revenue', 'sum_revenue').from('test')

      const sql = q.toSQL(sqlOnlyKnex)

      expect(sql).toBe('select sum("test"."revenue") from "test"')
    })

    test('chained .as() shows Knex limitation', () => {
      const q = query().sum('test.revenue').as('sum_revenue').from('test')

      const sql = q.toSQL(sqlOnlyKnex)

      expect(sql).toBe('select sum("test"."revenue") from "test"')
    })
  })

  describe('Knex Baseline Comparison', () => {
    test('direct Knex sum produces same SQL', () => {
      const directKnex = sqlOnlyKnex('test').sum('revenue as sum_revenue')
      const sql = directKnex.toString()

      expect(sql).toBe('select sum("revenue") as "sum_revenue" from "test"')
    })

    test('direct Knex count produces same SQL', () => {
      const directKnex = sqlOnlyKnex('test').count('* as record_count')
      const sql = directKnex.toString()

      expect(sql).toBe('select count(*) as "record_count" from "test"')
    })
  })

  describe('Advanced SQL Generation', () => {
    test('generates complex query with joins and aggregation', () => {
      const q = query()
        .select('users.id')
        .sum('orders.total as revenue')
        .from('users')
        .leftJoin('orders', 'users.id', 'orders.user_id')
        .where('users.active', true)
        .groupBy('users.id')
        .having('count', '>', 0)
        .orderBy('revenue', 'desc')

      const sql = q.toSQL(sqlOnlyKnex)

      expect(sql).toBe(
        'select "users"."id", sum("orders"."total") as "revenue" from "users" left join "orders" on "users"."id" = "orders"."user_id" where "users"."active" = true group by "users"."id" having "count" > 0 order by "revenue" desc',
      )
    })
  })

  describe('SQL Object Format', () => {
    test('toSQL returns same string as Knex toQuery()', () => {
      const q = query().sum('revenue as total').from('sales')

      const knexQuery = q.toKnex(sqlOnlyKnex)
      const sqlFromToQuery = knexQuery.toQuery()
      const sqlFromOurMethod = q.toSQL(sqlOnlyKnex)

      expect(sqlFromOurMethod).toBe(sqlFromToQuery)
      expect(sqlFromOurMethod).toBe(
        'select sum("revenue") as "total" from "sales"',
      )
    })

    test('generates SQL with bindings correctly', () => {
      const q = query()
        .sum('revenue as total')
        .from('sales')
        .where('date', '>', '2023-01-01')

      const knexQuery = q.toKnex(sqlOnlyKnex)
      const sqlObj = knexQuery.toSQL().toNative()

      expect(sqlObj.sql).toBe(
        'select sum("revenue") as "total" from "sales" where "date" > $1',
      )
      expect(sqlObj.bindings).toEqual(['2023-01-01'])
    })
  })
})
