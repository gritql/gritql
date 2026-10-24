import { describe, expect, test } from 'vitest'
import { fixtureAdapter, gritql } from '../src'
import { sqlOf } from './harness'

const loose = (q: string, vars: Record<string, unknown> = {}) =>
  gritql({ adapters: { pg: fixtureAdapter([]) }, strict: false })
    .compile(q, vars)
    .then((c) => c.queries.map((x) => x.text))

describe('strict mode (default)', () => {
  describe('fetch arguments', () => {
    test('an unknown argument is an ARGS error with a hint; strict: false keeps the v3 equality filter', async () => {
      await expect(sqlOf(`query t { fetch(limt: 10) { v: sum(a: x) } }`)).rejects.toMatchObject({
        code: 'ARGS',
        message: expect.stringMatching(/Unknown fetch argument 'limt'.*where: \{ limt: \.\.\. \}.*limit\/offset\/sort belong on a dimension/),
        path: ['fetch'],
      })
      const [sql] = await loose(`query t { fetch(limt: 10) { v: sum(a: x) } }`)
      expect(sql).toContain(`"t"."limt" = 10`)
    })

    test('a near miss names the argument it resembles', async () => {
      await expect(sqlOf(`query t { fetch(filter: { a: 1 }) { v: sum(a: x) } }`)).rejects.toThrow(/did you mean 'filters'\?/)
      await expect(sqlOf(`query t { x: fetch(serach: { a: "b" }) { v: sum(a: x) } }`)).rejects.toMatchObject({ path: ['x'], message: expect.stringContaining("'search'") })
    })

    test('legacy inline predicates are rejected in strict mode', async () => {
      await expect(sqlOf(`query t { fetch(brand: Adidas) { v: sum(a: x) } }`)).rejects.toThrow(/Unknown fetch argument 'brand'/)
      await expect(sqlOf(`query t { fetch(date_gt: "2020") { v: sum(a: x) } }`)).rejects.toThrow(/Unknown fetch argument 'date_gt'/)
    })
  })

  describe('where / having / search as fetch arguments', () => {
    test('where treats every top-level key as a column, including the filters keywords', async () => {
      const [sql] = await sqlOf(`query t { fetch(where: { from: "web", having: 1, search: { eq: "x" }, inherited: false }) { v: sum(a: x) } }`)
      expect(sql).toContain(`("t"."from" = 'web')`)
      expect(sql).toContain(`("t"."having" = 1)`)
      expect(sql).toContain(`("t"."search" = 'x')`)
      expect(sql).toContain(`("t"."inherited" = false)`)
      // the same object under `filters:` reads them as keywords: nothing is filtered
      const [legacy] = await sqlOf(`query t { fetch(filters: { from: "web" }) { v: sum(a: x) } }`)
      expect(legacy).not.toContain('where')
    })

    test('per-column from/inherited and logical keys keep their meaning inside where', async () => {
      const [sql] = await sqlOf(`query t { fetch(where: { price: { gt: 1, from: catalog }, or: [{ from: "a" }, { from: "b" }] }) { v: sum(a: x) } }`)
      expect(sql).toContain(`("catalog"."price" > 1)`)
      expect(sql).toMatch(/\("t"\."from" = 'a'\)+ OR \(+"t"\."from" = 'b'\)/)
    })

    test('where and filters combine with AND', async () => {
      const [sql] = await sqlOf(`query t { fetch(filters: { country: "DE" }, where: { brand: "x" }) { v: sum(a: x) } }`)
      expect(sql).toContain(`where ("t"."country" = 'DE') and ("t"."brand" = 'x')`)
    })

    test('having as a fetch argument is the aggregate filter', async () => {
      const [sql] = await sqlOf(`query t { fetch(having: { v: { gt: 10 } }) { d { v: sum(a: x) } } }`)
      expect(sql).toContain(`having (("v" > 10))`)
      await expect(sqlOf(`query t { fetch(having: { v: { gt: 10 } }, filters: { having: { v: { lt: 1 } } }) { d { v: sum(a: x) } } }`)).rejects.toMatchObject({
        code: 'ARGS',
        message: expect.stringContaining('both'),
      })
    })
  })

  describe('variables', () => {
    test('an undeclared variable is a TYPE error; strict: false substitutes it', async () => {
      const q = `query t { fetch(where: { country: $country }) { v: sum(a: x) } }`
      await expect(sqlOf(q, { country: 'DE' })).rejects.toMatchObject({ code: 'TYPE', message: expect.stringMatching(/\$country is not declared by operation 't'/) })
      const [sql] = await loose(q, { country: 'DE' })
      expect(sql).toContain(`"t"."country" = 'DE'`)
    })

    test('variables declared by the operation or by a fragment are fine', async () => {
      const q = `
        fragment F($col: String!) on Any { v: sum(a: $col) }
        query t($c: String!) { fetch(where: { country: $c }) { use(fragment: F, col: x) w: sum(a: $c) } }`
      const [sql] = await sqlOf(q, { c: 'DE' })
      expect(sql).toContain(`SUM("x") AS "v"`)
      expect(sql).toContain(`SUM("DE") AS "w"`)
    })

    test('an undeclared variable inside a fragment names the fragment', async () => {
      const q = `fragment F on Any { v: sum(a: $col) }  query t { fetch { ...F } }`
      await expect(sqlOf(q, { col: 'x' })).rejects.toThrow(/\$col is not declared by fragment 'F'/)
    })
  })
})
