import { describe, expect, test } from 'vitest'
import { fixtureAdapter, gritql } from '../src'
import { run, sqlOf } from './harness'

const period = { f: { date: { gte: '2024-02-01' } }, p: { date: { gte: '2024-01-01' } } }

describe('cross-fetch arithmetic is computed in SQL (SPEC §6.7)', () => {
  test('@diff joins the other fetch at the same grain on an outer layer; order and limit apply last', async () => {
    const sql = await sqlOf(
      `query sales($f: Object, $p: Object) {
        data: fetch(filters: $f) { domain(sort_desc: revenue, limit: 10) { revenue: sum(a: revenue) growth: sum(a: revenue) @diff(by: prev) } }
        prev: fetch(filters: $p) { domain { revenue: sum(a: revenue) growth: sum(a: revenue) @omit } }
      }`,
      period,
    )
    expect(sql).toHaveLength(2)
    const cur = `select "domain", SUM("revenue") AS "revenue", SUM("revenue") AS "growth" from "sales" where (("sales"."date" >= '2024-02-01')) group by "domain"`
    const prev = `select "domain", SUM("revenue") AS "revenue", SUM("revenue") AS "growth" from "sales" where (("sales"."date" >= '2024-01-01')) group by "domain"`
    expect(sql[0]).toBe(
      `select "__cur"."domain", "__cur"."revenue", cast("__cur"."growth" as float) / NULLIF(cast("__ref_0"."growth" as float), 0) - 1 as "growth" from (${cur}) as "__cur" left join (${prev}) as "__ref_0" on "__cur"."domain" = "__ref_0"."domain" order by "revenue" desc limit 10`,
    )
    // the other fetch still runs for its own output (an emitted baseline executes twice; use with() when it is not output)
    expect(sql[1]).toBe(prev)
  })

  test('@subtract and @divide(by:) use the same join; several metrics share it', async () => {
    const [sql] = await sqlOf(`query t {
      cur: fetch { d { a: sum(a: x) @subtract(by: prev) b: sum(a: y) @divide(by: prev) } }
      prev: fetch { d { a: sum(a: x) b: sum(a: y) } }
    }`)
    expect(sql).toContain(`"__cur"."a" - "__ref_0"."a" as "a"`)
    expect(sql).toContain(`cast("__cur"."b" as float) / NULLIF(cast("__ref_0"."b" as float), 0) as "b"`)
    expect(sql.match(/left join/g)).toHaveLength(1)
  })

  test('@divide(byField:) divides by a sibling column on the outer layer', async () => {
    const [sql] = await sqlOf(`query t { fetch { device { a: sum(a: x) @divide(byField: b) b: sum(a: y) } } }`)
    expect(sql).toBe(
      `select "__cur"."device", cast("__cur"."a" as float) / NULLIF(cast("__cur"."b" as float), 0) as "a", "__cur"."b" from (select "device", SUM("x") AS "a", SUM("y") AS "b" from "t" group by "device") as "__cur"`,
    )
  })

  test('a with() baseline is joined by name and listed once in the WITH clause', async () => {
    const [sql] = await sqlOf(`query sales($p: Object) {
      prev: with(filters: $p) { domain { revenue: sum(a: revenue) } }
      data: fetch { domain { revenue: sum(a: revenue) @diff(by: prev) } }
    }`, period)
    expect(sql.startsWith(`with "prev" as (select "domain", SUM("revenue") AS "revenue" from "sales" where (("sales"."date" >= '2024-01-01')) group by "domain") select`)).toBe(true)
    expect(sql).toContain(`left join "prev" as "__ref_0" on "__cur"."domain" = "__ref_0"."domain"`)
    expect(sql.match(/with "prev" as/g)).toHaveLength(1)
  })

  test('nested grains join on every dimension column', async () => {
    const [sql] = await sqlOf(`query t {
      cur: fetch { date { domain { v: sum(a: x) @diff(by: prev) } } }
      prev: fetch { date { domain { v: sum(a: x) } } }
    }`)
    expect(sql).toContain(`on "__cur"."date" = "__ref_0"."date" and "__cur"."domain" = "__ref_0"."domain"`)
    // the root statement of `cur` (no metrics there) and the date level are untouched
    const all = await sqlOf(`query t {
      cur: fetch { date { total: sum(a: x) domain { v: sum(a: x) @diff(by: prev) } } }
      prev: fetch { date { domain { v: sum(a: x) } } }
    }`)
    expect(all[0]).toBe(`select "date", SUM("x") AS "total" from "t" group by "date"`)
  })

  test('a baseline removed from the plan yields NULL', async () => {
    const [sql] = await sqlOf(
      `query t($have: Bool!) {
        cur: fetch { d { v: sum(a: x) @diff(by: prev) } }
        prev: fetch @include(if: $have) { d { v: sum(a: x) } }
      }`,
      { have: false },
    )
    expect(sql).toBe(`select "__cur"."d", NULL as "v" from (select "d", SUM("x") AS "v" from "t" group by "d") as "__cur"`)
  })

  test('a baseline without the grain or the column is a PLAN error', async () => {
    await expect(sqlOf(`query t { cur: fetch { d { v: sum(a: x) @diff(by: prev) } } prev: fetch { e { v: sum(a: x) } } }`)).rejects.toMatchObject({
      code: 'PLAN',
      message: expect.stringContaining("cur.d.v: 'prev' has no 'd' level to compare with"),
    })
    await expect(sqlOf(`query t { cur: fetch { d { v: sum(a: x) @diff(by: prev) } } prev: fetch { d { w: sum(a: x) } } }`)).rejects.toThrow(/'prev' has no 'v' at 'd'/)
  })

  test('among fetches sharing the alias, the one with the matching grain is the baseline', async () => {
    const sql = await sqlOf(`query t {
      cur: fetch { device { v: sum(a: x) @subtract(by: prev) } }
      prev: fetch { country { v: sum(a: x) } }
      prev: fetch { device { v: sum(a: x) } }
    }`)
    expect(sql[0]).toContain(`left join (select "device", SUM("x") AS "v" from "t" group by "device") as "__ref_0" on "__cur"."device" = "__ref_0"."device"`)
  })

  test('mutual and self references compare against grouped values, as v3 compared baselines', async () => {
    const sql = await sqlOf(`query t {
      series: fetch { c { v: sum(a: x) @diff(by: prev) } }
      prev: fetch { c { v: sum(a: x) @diff(by: series) w: sum(a: y) @subtract(by: prev) } }
    }`)
    expect(sql).toHaveLength(2)
    // joined statements carry no arithmetic layer of their own, so there is no recursion
    expect(sql[0]).toBe(
      `select "__cur"."c", cast("__cur"."v" as float) / NULLIF(cast("__ref_0"."v" as float), 0) - 1 as "v" from (select "c", SUM("x") AS "v" from "t" group by "c") as "__cur" left join (select "c", SUM("x") AS "v", SUM("y") AS "w" from "t" group by "c") as "__ref_0" on "__cur"."c" = "__ref_0"."c"`,
    )
    // one join per referenced fetch: series as __ref_0, prev itself as __ref_1
    expect(sql[1]).toContain(`left join (select "c", SUM("x") AS "v" from "t" group by "c") as "__ref_0" on "__cur"."c" = "__ref_0"."c"`)
    expect(sql[1]).toContain(`left join (select "c", SUM("x") AS "v", SUM("y") AS "w" from "t" group by "c") as "__ref_1" on "__cur"."c" = "__ref_1"."c"`)
    expect(sql[1]).toContain(`"__cur"."w" - "__ref_1"."w" as "w"`)
  })

  test('@diff under a regrouping dimension is rejected', async () => {
    await expect(sqlOf(`query t { cur: fetch { date @groupBy(by: month) { v: sum(a: x) @diff(by: prev) } } prev: fetch { date { v: sum(a: x) } } }`)).rejects.toMatchObject({
      code: 'PLAN',
      message: expect.stringMatching(/@diff on 'v'.*'date' @groupBy.*ratio/),
    })
    await expect(sqlOf(`query t { cur: fetch { c @groupOn(where: { v: { gt: 1 } }, replacers: { c: "x" }) { v: sum(a: x) @subtract(by: prev) } } prev: fetch { c { v: sum(a: x) } } }`)).rejects.toThrow(/difference/)
    await expect(sqlOf(`query t { cur: fetch { c { v: sum(a: x) @diff(by: prev) @subtract(by: prev) } } prev: fetch { c { v: sum(a: x) } } }`)).rejects.toThrow(/more than one of/)
  })

  test('rows come back with the computed column and assemble as any other metric', async () => {
    const data = [{ domain: 'a', revenue: 10, growth: 0.25 }, { domain: 'b', revenue: 5, growth: null }]
    const prev = [{ domain: 'a', revenue: 8, growth: 8 }]
    await expect(
      run([data, prev], `query t { data: fetch { domain { revenue: sum(a: x) growth: sum(a: x) @diff(by: prev) } } prev: fetch { domain { revenue: sum(a: x) growth: sum(a: x) } } }`),
    ).resolves.toEqual({ data: data, prev: prev })
  })
})

describe('@filter is lowered to HAVING (SPEC §6.7)', () => {
  test('dimension conditions become having: on the dimension', async () => {
    const [sql] = await sqlOf(`query t { fetch { channels(sort_desc: value, limit: 3) @filter(where: { value: { gt: 1, lt: 9 }, channels: ["a", "b"] }) { value: sum(a: x) } } }`)
    expect(sql).toBe(
      `select "channels", "value" from (select "channels", SUM("x") AS "value" from "t" group by "channels") as "__h" where (("value" > 1) AND ("value" < 9)) AND (("channels" IN ('a','b'))) order by "value" desc limit 3`,
    )
  })

  test('a metric condition becomes having: on its parent dimension, or on the fetch at the root', async () => {
    const [sql] = await sqlOf(`query t { fetch { channels { value: sum(a: x) @filter(gt: 1) other: sum(a: y) @filter(neq: 0) } } }`)
    expect(sql).toContain(`as "__h" where (("value" > 1)) AND (("other" <> 0))`)
    const [root] = await sqlOf(`query t { fetch { value: sum(a: x) @filter(gte: 10) } }`)
    expect(root).toBe(`select "value" from (select SUM("x") AS "value" from "t") as "__h" where (("value" >= 10))`)
  })

  test('with an arithmetic layer the predicates apply after the join, so they can name the computed column', async () => {
    const [sql] = await sqlOf(`query t {
      cur: fetch { c @filter(where: { growth: { gt: 0 } }) { v: sum(a: x) growth: sum(a: x) @diff(by: prev) } }
      prev: fetch { c { growth: sum(a: x) } }
    }`)
    expect(sql).not.toContain('__h')
    expect(sql).toMatch(/as "__ref_0" on "__cur"\."c" = "__ref_0"\."c" where \(\("growth" > 0\)\)$/)
  })

  test('explicit having: and @filter conditions on one dimension are merged', async () => {
    const [sql] = await sqlOf(`query t { fetch { c(having: { v: { lt: 100 } }) @filter(where: { v: { gt: 1 } }) { v: sum(a: x) } } }`)
    expect(sql).toContain(`where (("v" < 100) AND ("v" > 1))`)
  })

  test('an operator SQL cannot express keeps the result-time hook', async () => {
    const [sql] = await sqlOf(`query t { fetch { c @filter(where: { tags: { contains: "a" } }) { tags: distinct(type: Array) } } }`)
    expect(sql).not.toContain('__h')
  })

  test('@omit hides the column from the output but keeps it in the statement; full drops it', async () => {
    const [sql] = await sqlOf(`query t { fetch { c { v: sum(a: x) w: sum(a: y) @omit u: sum(a: z) @omit(full: true) } } }`)
    expect(sql).toBe(`select "c", SUM("x") AS "v", SUM("y") AS "w" from "t" group by "c"`)
    await expect(run([[{ c: 'a', v: 1, w: 2 }]], `query t { fetch { c { v: sum(a: x) w: sum(a: y) @omit } } }`)).resolves.toEqual([{ c: 'a', v: 1 }])
    const g = gritql({ adapters: { pg: fixtureAdapter([[{ c: 'a', v: 1, w: 2 }]]) }, output: 'keyed' })
    await expect(g.run(`query t { fetch { c { v: sum(a: x) w: sum(a: y) @omit } } }`)).resolves.toEqual({ a: { v: 1 } })
  })
})
