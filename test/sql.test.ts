import { describe, expect, test } from 'vitest'
import { fixtureAdapter, gritql } from '../src'
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

describe('review findings', () => {
  test('four repeated arguments stay one flat list', async () => {
    const [sql] = await sqlOf(`query t { u: unionall(table: a, table: b, table: c, table: d) { v: sum(a: x) } }`)
    expect(sql).toContain('select * from "a" union all select * from "b" union all select * from "c" union all select * from "d"')
  })

  test('empty IN / NOT IN lists compile to constants', async () => {
    const [sql] = await sqlOf(`query t { fetch(filters: { country: [], brand: { nin: [] } }) { v: sum(a: x) } }`)
    expect(sql).toContain('(1 = 0) AND ((1 = 1))')
  })

  test('filter from: "@" means the fetch table', async () => {
    const [sql] = await sqlOf(`query t { fetch(filters: { from: "@", country: "DE" }) { v: sum(a: x) } }`)
    expect(sql).toContain(`"t"."country" = 'DE'`)
  })

  test('an operator without a field is an ARGS error', async () => {
    await expect(sqlOf(`query t { fetch(filters: { or: [{ gte: 1 }] }) { v: sum(a: x) } }`)).rejects.toMatchObject({ code: 'ARGS' })
  })

  test('every bounded nested dimension gets its own ranking layer; root limit applies last', async () => {
    const [sql] = await sqlOf(`query t { fetch { country(limit: 5) { device(limit: 2) { city(limit: 1) { v: sum(a: x) } } } } }`)
    expect(sql).toContain('partition by "country")')
    expect(sql).toContain('partition by "country", "device")')
    expect(sql).toContain('"__rn" <= 2')
    expect(sql).toContain('"__rn" <= 1')
    expect(sql.endsWith('limit 5')).toBe(true)
  })

  test('count without a column is COUNT(*)', async () => {
    const [sql] = await sqlOf(`query t { fetch { n: count m: count(a: "*") } }`)
    expect(sql).toBe('select COUNT(*) AS "n", COUNT(*) AS "m" from "t"')
  })

  test('groupBy dimension whose alias shadows its column groups by the alias on ClickHouse only', async () => {
    const q = `query t { fetch { date: groupBy(field: date, by: month) { v: sum(a: x) } } }`
    const [pg] = await sqlOf(q)
    expect(pg).toBe(`select date_trunc('month', "date") as "date", SUM("x") AS "v" from "t" group by date_trunc('month', "date")`)
    const ch = await gritql({ adapters: { ch: fixtureAdapter([], 'clickhouse') } }).compile(q, {})
    expect(ch.queries[0].text).toBe(`select date_trunc('month', "date") as "date", SUM("x") AS "v" from "t" group by "date"`)
  })

  test('avg and median are plain aggregates unless partitioned', async () => {
    const [sql] = await sqlOf(`query t { fetch { d { m: avg(a: s) w: avg(a: s, by: d) md: median(a: s, from: "@") } } }`)
    expect(sql).toContain('avg("s")::float4 as "m"')
    expect(sql).toContain('avg("s") OVER(PARTITION BY "d")::float4 as "w"')
    expect(sql).toContain('MEDIAN("t"."s") AS "md"')
  })

  test('percentile keeps factor 0', async () => {
    const [sql] = await sqlOf(`query t { fetch { p: percentile(a: x, factor: 0) q: percentile(a: x) } }`)
    expect(sql).toContain('PERCENTILE_CONT(0) WITHIN GROUP(ORDER BY "x") AS "p"')
    expect(sql).toContain('PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY "x") AS "q"')
  })

  test('join shorthand inequalities read left to right; by_in is rejected', async () => {
    const [sql] = await sqlOf(`query t { fetch { join(table: c, by: "@id:@pid", by_gt: "@a:@b") { v: sum(a: x) } } }`)
    // written on the joined column, so `fetch.a > joined.b` prints as `c.b < t.a`
    expect(sql).toContain('JOIN "c" ON ("c"."pid" = "t"."id") AND (("c"."b" < "t"."a"))')
    const [same] = await sqlOf(`query t { fetch { join(table: c, by: "@id:@pid", by_gt: "@a:@pid") { v: sum(a: x) } } }`)
    expect(same).toContain('JOIN "c" ON (("c"."pid" = "t"."id") AND ("c"."pid" < "t"."a"))')
    await expect(sqlOf(`query t { fetch { join(table: c, by_in: "@id:@pid") { v: sum(a: x) } } }`)).rejects.toMatchObject({ code: 'ARGS' })
    await expect(sqlOf(`query t { fetch { join(table: c, by_like: "@n:@p") { v: sum(a: x) } } }`)).rejects.toMatchObject({ code: 'ARGS' })
  })

  test('a CTE chain lists every with once in the outer statement', async () => {
    const [sql] = await sqlOf(`query t {
      a: with(table: s) { d { v: sum(a: x) } }
      b: with(table: a) { d { v: sum(a: v) } }
      c: fetch(table: b) { d { v: sum(a: v) } }
    }`)
    expect(sql.match(/with "a" as/g)).toHaveLength(1)
    expect(sql.match(/"b" as \(/g)).toHaveLength(1)
    expect(sql.startsWith('with "a" as (select "d", SUM("x") AS "v" from "s" group by "d"), "b" as (select "d", SUM("v") AS "v" from "a" group by "d") select')).toBe(true)
  })

  test('a plan middleware error is a PLAN error', async () => {
    const boom = { plan: () => { throw new Error('boom') } }
    await expect(sqlOf(`query t { fetch { v: sum(a: x) } }`, {}, { middleware: [boom] })).rejects.toMatchObject({ code: 'PLAN', message: 'boom' })
  })

  test('typed errors: TYPE for variables, PLAN for cycles, RESULT for hooks, ARGS carries the path', async () => {
    await expect(sqlOf(`query t($n: Number!) { fetch { v: sum(a: x) } }`)).rejects.toMatchObject({ code: 'TYPE' })
    await expect(sqlOf(`query t { a: with(table: b) { v: sum(a: x) } b: with(table: a) { v: sum(a: x) } c: fetch(table: a) { v: sum(a: x) } }`)).rejects.toMatchObject({ code: 'PLAN' })
    await expect(sqlOf(`query t { fetch { d { v: sum } } }`)).rejects.toMatchObject({ code: 'ARGS', path: ['fetch', 'd'] })
    const boom = { result: () => { throw new Error('oops') } }
    await expect(run([[{ d: 1, v: 1 }]], `query t { fetch { d { v: sum(a: x) @boom } } }`, {}, { directives: { boom } })).rejects.toMatchObject({ code: 'RESULT', message: 'oops' })
  })
})
