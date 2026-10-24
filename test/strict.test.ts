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
      expect(sql).toBe(`select "d", "v" from (select "d", SUM("x") AS "v" from "t" group by "d") as "__h" where (("v" > 10))`)
      await expect(sqlOf(`query t { fetch(having: { v: { gt: 10 } }, filters: { having: { v: { lt: 1 } } }) { d { v: sum(a: x) } } }`)).rejects.toMatchObject({
        code: 'ARGS',
        message: expect.stringContaining('both'),
      })
    })
  })

  describe('object forms replace the string grammars', () => {
    test('arithmetic operands: { fn: column } and { field: column }; "fn|column" is legacy', async () => {
      const [sql] = await sqlOf(`query t { fetch { d { r: divide(a: { sum: revenue }, by: { count: orders }) p: diff(a: { field: price }, by: { field: prev_price }) q: subtract(a: revenue, by: 2) } } }`)
      expect(sql).toContain('cast("sum"("revenue") as float)/NULLIF(cast("count"("orders") as float) + 1e-10, 0)::float4 as "r"')
      expect(sql).toContain('cast("price" as float)/NULLIF(cast("prev_price" as float) + 1e-10, 0)::float4 - 1  as "p"')
      expect(sql).toContain('cast("sum"("revenue") as float)-2::float4 as "q"')
      await expect(sqlOf(`query t { fetch { d { r: divide(a: "sum|revenue", by: "|orders") } } }`)).rejects.toMatchObject({
        code: 'ARGS',
        message: expect.stringContaining('write { sum: revenue }'),
      })
      await expect(sqlOf(`query t { fetch { d { r: divide(a: revenue, by: "|orders") } } }`)).rejects.toThrow(/write \{ field: orders \}/)
      const [legacy] = await loose(`query t { fetch { d { r: divide(a: "sum|revenue", by: "|orders") } } }`)
      expect(legacy).toContain('cast("sum"("revenue") as float)/NULLIF(cast("orders" as float) + 1e-10, 0)::float4 as "r"')
      await expect(sqlOf(`query t { fetch { d { r: divide(a: { sum: revenue, count: x }, by: 1) } } }`)).rejects.toThrow(/exactly one key/)
    })

    test('@filter / @groupOn take where: {}; field_op keys are legacy', async () => {
      const rows = [
        { channels: 'Social', value: 1 },
        { channels: 'Organic', value: 3 },
        { channels: 'Direct', value: 4 },
      ]
      const g = (strict: boolean) => gritql({ adapters: { pg: fixtureAdapter([rows]) }, strict })
      await expect(g(true).run(`query t { fetch { channels @filter(where: { value: { gt: 1, lt: 4 } }) { value: sum(a: x) } } }`)).resolves.toEqual([{ channels: 'Organic', value: 3 }])
      await expect(g(true).run(`query t { fetch { channels @filter(where: { channels: ["Social", "Direct"] }) { value: sum(a: x) } } }`)).resolves.toEqual([
        { channels: 'Social', value: 1 },
        { channels: 'Direct', value: 4 },
      ])
      await expect(g(true).run(`query t { fetch { channels @filter(value_gt: 1) { value: sum(a: x) } } }`)).rejects.toMatchObject({
        code: 'ARGS',
        message: expect.stringContaining('write where: { value: { gt: ... } }'),
      })
      await expect(g(true).run(`query t { fetch { channels @filter(where: { value: { between: 1 } }) { value: sum(a: x) } } }`)).rejects.toThrow(/Unknown operator 'between'/)
      await expect(g(false).run(`query t { fetch { channels @filter(value_gt: 1) { value: sum(a: x) } } }`)).resolves.toEqual([
        { channels: 'Organic', value: 3 },
        { channels: 'Direct', value: 4 },
      ])
      // metric-level @filter compares the value with bare operators in both modes
      await expect(g(true).run(`query t { fetch { channels { value: sum(a: x) @filter(gte: 3) } } }`)).resolves.toEqual([
        { channels: 'Organic', value: 3 },
        { channels: 'Direct', value: 4 },
      ])
    })

    test('@parse takes an enum or an object; colon strings are legacy', async () => {
      const g = (strict: boolean) => gritql({ adapters: { pg: fixtureAdapter([[{ d: 'mobile', a: 'ff' }]]) }, strict })
      await expect(g(true).run(`query t { fetch { d { a: sum(a: x) @parse(as: { int: 16 }) } } }`)).resolves.toEqual([{ d: 'mobile', a: 255 }])
      await expect(g(true).run(`query t { fetch { d { a: sum(a: x) @parse(as: "int:16") } } }`)).rejects.toThrow(/write as: \{ int: 16 \}/)
      await expect(g(true).run(`query t { fetch { d { a: sum(a: x) @parse(as: "date:format:yyyy") } } }`)).rejects.toThrow(/write as: \{ date: \{ format: "yyyy" \} \}/)
      await expect(g(true).run(`query t { fetch { d { a: sum(a: x) @parse(as: { date: { nope: 1 } }) } } }`)).rejects.toThrow(/only \{ date: \{ format/)
      await expect(g(false).run(`query t { fetch { d { a: sum(a: x) @parse(as: "int:16") } } }`)).resolves.toEqual([{ d: 'mobile', a: 255 }])
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
