import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { gqlToDb } from './v3compat'

const sqlOf = async (query: string) => {
  let sql
  await gqlToDb().beforeDbFetch((def) => {
    sql = def.sql
    return null
  })(query, {})

  return sql
}

const withFilters = (filters: string) =>
  `query t { fetch(filters: ${filters}) { device { value: sum(a: sessions) } } }`

describe('filters', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('operators', () => {
    test.each([
      ['eq', '{ brand: { eq: "Adidas" } }', `"brand" = 'Adidas'`],
      ['ne', '{ brand: { ne: "Adidas" } }', `"brand" <> 'Adidas'`],
      ['gt/lt', '{ price: { gt: 1, lt: 5 } }', `("t"."price" > 1) AND ("t"."price" < 5)`],
      ['gte/lte', '{ price: { gte: 1, lte: 5 } }', `("t"."price" >= 1) AND ("t"."price" <= 5)`],
      ['in', '{ brand: { in: ["a", "b"] } }', `"brand" IN ('a','b')`],
      ['nin', '{ brand: { nin: ["a", "b"] } }', `"brand" NOT IN('a','b')`],
      ['like', '{ brand: { like: "adi%" } }', `"brand" LIKE 'adi%'`],
      ['ilike', '{ brand: { ilike: "adi%" } }', `"brand" ILIKE 'adi%'`],
      ['isNULL true', '{ brand: { isNULL: true } }', `"brand" IS NULL`],
      ['isNULL false', '{ brand: { isNULL: false } }', `"brand" IS NOT NULL`],
      ['shorthand eq', '{ brand: "Adidas" }', `"brand" = 'Adidas'`],
    ])('%s', async (_, filters, fragment) => {
      const sql = await sqlOf(withFilters(filters))

      expect(sql[0]).toContain(fragment)
      expect(sql).toMatchSnapshot()
    })

    // RegExp operators are not valid GraphQL names, so they only work via variables.
    test.each([
      ['RegExp~', `"brand" ~ '^a'`],
      ['RegExp!~', `"brand" !~ '^a'`],
      ['RegExp~*', `"brand" ~* '^a'`],
      ['RegExp!~*', `"brand" !~* '^a'`],
    ])('%s through variables', async (op, fragment) => {
      let sql
      await gqlToDb().beforeDbFetch((def) => {
        sql = def.sql
        return null
      })(
        `query t($filters: Object) { fetch(filters: $filters) { device { value: sum(a: sessions) } } }`,
        { filters: { brand: { [op]: '^a' } } },
      )

      expect(sql[0]).toContain(fragment)
    })
  })

  describe('logical operators', () => {
    test('and', async () => {
      const sql = await sqlOf(
        withFilters('{ and: [{ brand: "a" }, { country: "DE" }] }'),
      )

      expect(sql[0]).toContain(`((("t"."brand" = 'a')) AND (("t"."country" = 'DE')))`)
    })

    test('or', async () => {
      const sql = await sqlOf(
        withFilters('{ or: [{ brand: "a" }, { brand: "b" }] }'),
      )

      expect(sql[0]).toContain(`((("t"."brand" = 'a')) OR (("t"."brand" = 'b')))`)
    })

    test('nor', async () => {
      const sql = await sqlOf(
        withFilters('{ nor: [{ brand: "a" }, { brand: "b" }] }'),
      )

      expect(sql[0]).toContain(`NOT ((("t"."brand" = 'a')) OR (("t"."brand" = 'b')))`)
    })

    test('not', async () => {
      const sql = await sqlOf(withFilters('{ not: { brand: "a" } }'))

      expect(sql[0]).toContain(`NOT (("t"."brand" = 'a'))`)
    })

    test('nested', async () => {
      const sql = await sqlOf(
        withFilters(
          '{ country: "DE", or: [{ brand: "a" }, { and: [{ brand: "b" }, { price: { gt: 1 } }] }] }',
        ),
      )

      expect(sql).toMatchSnapshot()
    })
  })

  describe('having', () => {
    test('filters on aggregated values', async () => {
      const sql = await sqlOf(
        withFilters('{ brand: "a", having: { value: { gt: 10 } } }'),
      )

      expect(sql[0]).toContain('having')
      expect(sql).toMatchSnapshot()
    })

    test('as dimension argument', async () => {
      const sql = await sqlOf(
        `query t { fetch { device(having: { value: { gt: 10 } }) { value: sum(a: sessions) } } }`,
      )

      expect(sql[0]).toContain('having')
      expect(sql).toMatchSnapshot()
    })
  })

  describe('errors', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    test.each([
      ['hasAny on pg', '{ tags: { hasAny: ["a"] } }', /supported only by clickhouse/],
      ['hasAll on pg', '{ tags: { hasAll: ["a"] } }', /supported only by clickhouse/],
      ['in without array', '{ brand: { in: "a" } }', /IN requries array value/],
      ['nin without array', '{ brand: { nin: "a" } }', /NIN requries array value/],
      ['search without object', '{ search: "a" }', /Search filter requires object value/],
    ])('%s', async (_, filters, message) => {
      await expect(sqlOf(withFilters(filters))).rejects.toThrow(message)
    })

    test('search without a field throws', async () => {
      await expect(sqlOf(withFilters('{ search: { eq: "a" } }'))).rejects.toThrow(
        /At least one property of search must be related to field/,
      )
    })

    test('search defined twice for the same field', async () => {
      await expect(
        sqlOf(
          `query t { fetch(search: { brand: "a" }, filters: { search: { brand: "b" } }) { device { value: sum(a: sessions) } } }`,
        ),
      ).rejects.toThrow(/Search for .* already defined/)
    })
  })
})
