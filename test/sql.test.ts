import { describe, expect, test } from 'vitest'
import { run, sqlOf } from './harness'

describe('SQL shapes not covered by the v3 suites', () => {
  test('nested limit/offset is per parent through a ranked derived table', async () => {
    const [sql] = await sqlOf(`query t { fetch { date { device(limit: 3, offset: 1, sort_desc: value) { value: sum(a: x) } } } }`)
    expect(sql).toBe(
      'select "date", "device", "value" from (select *, row_number() over (partition by "date" order by "value" desc) as "__rn" from (select "date", "device", SUM("x") AS "value" from "t" group by "date", "device") as "__g") as "__r" where "__rn" > 1 and "__rn" <= 4 order by "value" desc',
    )
  })

  test('nested limit without sort ranks in group order', async () => {
    const [sql] = await sqlOf(`query t { fetch { country { device(limit: 2) { value: sum(a: x) } } } }`)
    expect(sql).toContain('row_number() over (partition by "country") as "__rn"')
    expect(sql).toContain('where "__rn" <= 2')
    expect(sql).not.toContain('order by')
  })

  test('root limit stays a plain LIMIT', async () => {
    const [sql] = await sqlOf(`query t { fetch { device(limit: 3, sort_desc: value) { value: sum(a: x) } } }`)
    expect(sql).toBe('select "device", SUM("x") AS "value" from "t" group by "device" order by "value" desc limit 3')
  })

  test('nested limit rows assemble per parent', async () => {
    const rows = [
      { date: 'd1', device: 'a', value: 3 },
      { date: 'd1', device: 'b', value: 2 },
      { date: 'd2', device: 'c', value: 9 },
    ]
    await expect(run([rows], `query t { fetch { date { device(limit: 2, sort_desc: value) { value: sum(a: x) } } } }`)).resolves.toEqual({
      d1: { a: { value: 3 }, b: { value: 2 } },
      d2: { c: { value: 9 } },
    })
  })

  test('having addresses aggregate aliases unqualified', async () => {
    const [sql] = await sqlOf(
      `query t { fetch(filters: { brand: "x", having: { value: { gt: 1 } } }) { device(having: { other: { lt: 5 } }) { value: sum(a: x) other: sum(a: y) } } }`,
    )
    expect(sql).toBe(
      `select "device", SUM("x") AS "value", SUM("y") AS "other" from "t" where ("t"."brand" = 'x') group by "device" having (("other" < 5)) and (("value" > 1))`,
    )
  })

  test('with + unionall + join dependencies are emitted in order', async () => {
    const sql = await sqlOf(`query t {
      a: with(table: src) { product { v: sum(a: x) } }
      b: with(table: src2) { product { v: sum(a: x) } }
      u: unionall(table: a, table: b) { product { total: sum(a: v) } }
      j: fetch(table: a) { join(table: b, by: "product:product") { product { v: sum(a: v) w: sum(a: v, from: b) } } }
    }`)
    expect(sql).toHaveLength(2)
    expect(sql[0].indexOf('with "a" as')).toBeLessThan(sql[0].indexOf('"b" as'))
    expect(sql[0]).toContain('from (select * from "a" union all select * from "b") as "unionall_a_b"')
    expect(sql[1]).toContain('with "a" as')
    expect(sql[1]).toContain('JOIN "b" ON ("b"."product" = "a"."product")')
  })

  test('a with referenced but not defined is a PLAN error', async () => {
    await expect(sqlOf(`query t { x: fetch(table: nowhere) { device { v: sum(a: x) } } }`)).resolves.toHaveLength(1)
    await expect(
      sqlOf(`query t { a: with(table: src) { device { v: sum(a: x) } } x: fetch(table: a) { join(table: zz, by: "d:d") { device { v: sum(a: x) } } } }`),
    ).resolves.toHaveLength(1)
  })

  test('circular with dependencies fail', async () => {
    await expect(sqlOf(`query t { a: with(table: b) { d { v: sum(a: x) } } b: with(table: a) { d { v: sum(a: x) } } c: fetch(table: a) { d { v: sum(a: x) } } }`)).rejects.toThrow(
      /Circular with dependency/,
    )
  })

  test('two surviving with fetches under one alias are rejected', async () => {
    await expect(sqlOf(`query t { a: with(table: s) { d { v: sum(a: x) } } a: with(table: s2) { d { v: sum(a: x) } } c: fetch(table: a) { d { v: sum(a: x) } } }`)).rejects.toThrow(
      /defined more than once/,
    )
    await expect(
      sqlOf(`query t($f: Bool) { a: with(table: s) @include(if: $f) { d { v: sum(a: x) } } a: with(table: s2) @skip(if: $f) { d { v: sum(a: x) } } c: fetch(table: a) { d { v: sum(a: x) } } }`, { f: true }),
    ).resolves.toHaveLength(1)
  })

  test('from: "@" and @column qualify with the fetch table', async () => {
    const [sql] = await sqlOf(`query t { fetch { device { a: sum(a: "@x") b: sum(a: y, from: "@") } } }`)
    expect(sql).toContain('SUM("t"."x") AS "a"')
    expect(sql).toContain('SUM("t"."y") AS "b"')
  })
})
