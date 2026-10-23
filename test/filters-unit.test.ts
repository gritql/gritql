import { describe, test, expect } from 'vitest'
import knex from 'knex'
import { buildFilter, FilterContext } from '../src/sql/filters'

const pg = knex({ client: 'pg' })
const ctx = (over: Partial<FilterContext> = {}): FilterContext => ({ table: 't', joins: [], dialect: 'pg', ...over })
const sql = (filter: any, over: Partial<FilterContext> = {}) => {
  const f = buildFilter(filter, ctx(over))
  return pg.raw(f.sql, f.bindings).toString()
}

describe('buildFilter', () => {
  test.each([
    ['eq', { brand: { eq: 'Adidas' } }, `(("t"."brand" = 'Adidas'))`],
    ['shorthand eq', { brand: 'Adidas' }, `("t"."brand" = 'Adidas')`],
    ['ne', { brand: { ne: 'Adidas' } }, `(("t"."brand" <> 'Adidas'))`],
    ['gt/lt', { price: { gt: 1, lt: 5 } }, `(("t"."price" > 1) AND ("t"."price" < 5))`],
    ['in', { brand: { in: ['a', 'b'] } }, `(("t"."brand" IN ('a','b')))`],
    ['shorthand in', { brand: ['a', 'b'] }, `("t"."brand" IN ('a','b'))`],
    ['nin', { brand: { nin: ['a', 'b'] } }, `(("t"."brand" NOT IN('a','b')))`],
    ['like', { brand: { like: 'adi%' } }, `(("t"."brand" LIKE 'adi%'))`],
    ['ilike', { brand: { ilike: 'adi%' } }, `(("t"."brand" ILIKE 'adi%'))`],
    ['isNULL true', { brand: { isNULL: true } }, `(("t"."brand" IS NULL))`],
    ['isNULL false', { brand: { isNULL: false } }, `(("t"."brand" IS NOT NULL))`],
    ['RegExp', { brand: { 'RegExp~*': '^a' } }, `(("t"."brand" ~* '^a'))`],
    ['two fields', { brand: 'a', country: 'DE' }, `("t"."brand" = 'a') AND ("t"."country" = 'DE')`],
  ])('%s', (_, filter, expected) => {
    expect(sql(filter)).toBe(expected)
  })

  test('logical operators keep the v3 nesting', () => {
    // same substrings the v3 suite asserts
    expect(sql({ and: [{ brand: 'a' }, { country: 'DE' }] })).toContain(`((("t"."brand" = 'a')) AND (("t"."country" = 'DE')))`)
    expect(sql({ or: [{ brand: 'a' }, { brand: 'b' }] })).toContain(`((("t"."brand" = 'a')) OR (("t"."brand" = 'b')))`)
    expect(sql({ nor: [{ brand: 'a' }, { brand: 'b' }] })).toContain(`NOT ((("t"."brand" = 'a')) OR (("t"."brand" = 'b')))`)
    expect(sql({ not: { brand: 'a' } })).toContain(`NOT (("t"."brand" = 'a'))`)
  })

  test('from qualifies following fields; having is left to the caller', () => {
    expect(sql({ brand: 'a', from: 'cat', price: { gt: 1 }, having: { v: { gt: 1 } } })).toBe(
      `("t"."brand" = 'a') AND (("cat"."price" > 1))`,
    )
    expect(sql({ price: { from: 'cat', gt: 1 } })).toBe(`(("cat"."price" > 1))`)
  })

  test('inherited: false on a foreign table skips the predicate', () => {
    expect(sql({ price: { from: 'other', inherited: false, gt: 1 } })).toBe('')
    expect(sql({ price: { from: 'other', inherited: false, gt: 1 } }, { joins: ['other'] })).toBe(`(("other"."price" > 1))`)
  })

  test('join on: @values are columns of the fetch table, keys of the joined table', () => {
    expect(sql({ product: '@product', country: { gt: '@c' } }, { table: 't', from: 'cat', fieldRefs: true })).toBe(
      `("cat"."product" = "t"."product") AND (("cat"."country" > "t"."c"))`,
    )
  })

  test('search builds tsvector predicates', () => {
    expect(sql({ search: { brand: 'Adidas', title: 'T-shirt' } })).toBe(
      `(to_tsvector('simple', "t"."brand") @@ (plainto_tsquery('simple', 'Adidas')::text || ':*')::tsquery AND to_tsvector('simple', "t"."title") @@ (plainto_tsquery('simple', 'T-shirt')::text || ':*')::tsquery)`,
    )
  })

  test('clickhouse specifics', () => {
    expect(sql({ brand: { 'RegExp~': '^a' } }, { dialect: 'clickhouse' })).toBe(`((match("t"."brand", '^a')))`)
    expect(sql({ tags: { hasAny: ['a', 'b'] } }, { dialect: 'clickhouse' })).toBe(`((hasAny("t"."tags", ['a','b'])))`)
  })

  test.each([
    ['hasAny on pg', { tags: { hasAny: ['a'] } }, /supported only by clickhouse/],
    ['in without array', { brand: { in: 'a' } }, /IN requries array value/],
    ['nin without array', { brand: { nin: 'a' } }, /NIN requries array value/],
    ['search without object', { search: 'a' }, /Search filter requires object value/],
    ['search without a field', { search: { eq: 'a' } }, /At least one property of search must be related to field/],
    ['search off pg', { search: { a: 'b' } }, /Full text search is not supported by snowflake/],
    ['unknown operator', { brand: { between: [1, 2] } }, /Unknown filter operator 'between'/],
  ])('%s throws', (_, filter, message) => {
    expect(() => sql(filter, filter.search?.a ? { dialect: 'snowflake' } : {})).toThrow(message)
  })
})
