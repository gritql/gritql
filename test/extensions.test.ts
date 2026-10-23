import { describe, expect, test } from 'vitest'
import { PropTypes, Resolver, Node, fetchOf, nodeAt, insertNode, cloneNode, builtins } from '../src'
import { run, sqlOf } from './harness'

describe('extensions', () => {
  describe('metrics', () => {
    test('a metric returns an expression; the engine owns SELECT and GROUP BY', async () => {
      const sumIf: Resolver = {
        args: { a: PropTypes.string.isRequired, case: PropTypes.object.isRequired },
        sql: (n, c) => c.knex.raw(`sum(case when ${c.where(n.args.case as any).toQuery()} then ?? else 0 end) as ??`, [c.col(n.args.a as string), n.alias]),
      }
      const [sql] = await sqlOf(`query t { fetch { device { paid: sumIf(a: revenue, case: { channel: "paid" }) } } }`, {}, { metrics: { sumIf } })
      expect(sql).toBe(`select "device", sum(case when ("t"."channel" = 'paid') then "revenue" else 0 end) as "paid" from "t" group by "device"`)
    })

    test('argument schemas are validated with the resolver name', async () => {
      const m: Resolver = { args: { a: PropTypes.string.isRequired }, sql: (n, c) => c.knex.raw('1 as ??', [n.alias]) }
      await expect(sqlOf(`query t { fetch { device { x: m } } }`, {}, { metrics: { m } })).rejects.toThrow(/`a` is marked as required in `m`/)
      await expect(sqlOf(`query t { fetch { device { x: m(a: 1) } } }`, {}, { metrics: { m } })).rejects.toThrow(/Failed arguments type/)
    })

    test('strict resolvers reject unknown arguments', async () => {
      const m: Resolver = { args: { a: PropTypes.string }, strict: true, sql: (n, c) => c.knex.raw('1 as ??', [n.alias]) }
      await expect(sqlOf(`query t { fetch { device { x: m(b: 1) } } }`, {}, { metrics: { m } })).rejects.toThrow(/Unknown argument `b` for `m`/)
    })

    test('dialect map picks the active dialect or the wildcard', async () => {
      const m: Resolver = {
        sql: {
          clickhouse: (n, c) => c.knex.raw('uniq(??) as ??', [c.col('x'), n.alias]),
          '*': (n, c) => c.knex.raw('count(distinct ??) as ??', [c.col('x'), n.alias]),
        },
      }
      const [sql] = await sqlOf(`query t { fetch { device { x: m } } }`, {}, { metrics: { m } })
      expect(sql).toContain('count(distinct "x")')
    })

    test('several output columns through columns()', async () => {
      const groupArray: Resolver = {
        args: { fields: PropTypes.arrayOf(PropTypes.string).isRequired },
        columns: (n) => n.args.fields as string[],
        sql: (n, c) => (n.args.fields as string[]).map((f) => c.knex.raw('array_agg(distinct ??) as ??', [c.col(f), f])),
      }
      const result = await run(
        [[{ device: 'mobile', a: [1, 2], b: ['x'] }]],
        `query t { fetch { device { g: groupArray(fields: [a, b]) } } }`,
        {},
        { metrics: { groupArray } },
      )
      expect(result).toEqual({ mobile: { a: [1, 2], b: ['x'] } })
    })

    test('overriding a built-in for one dialect keeps the built-in elsewhere', async () => {
      const divide: Resolver = {
        args: builtins.metrics!.divide.args,
        sql: { clickhouse: (n, c) => c.knex.raw('divide(??, ??) as ??', [c.col(n.args.a as string), c.col(n.args.by as string), n.alias]), '*': builtins.metrics!.divide.sql as any },
      }
      const [sql] = await sqlOf(`query t { fetch { device { x: divide(a: s, by: u) } } }`, {}, { metrics: { divide } })
      expect(sql).toContain('cast("sum"("s") as float)/NULLIF(')
    })
  })

  describe('dimensions', () => {
    test('a dimension returns select and group expressions and is assembled by its columns', async () => {
      const bucket: Resolver = {
        args: { field: PropTypes.string.isRequired, size: PropTypes.number.isRequired },
        sql: (n, c) => {
          const expr = c.knex.raw('floor(?? / ?) * ?', [c.col(n.args.field as string), n.args.size, n.args.size])
          return { select: [c.knex.raw(`${expr.toQuery()} as ??`, [n.alias])], groupBy: [expr] }
        },
      }
      const [sql] = await sqlOf(`query t { fetch { price: bucket(field: price, size: 10) { value: sum(a: x) } } }`, {}, { dimensions: { bucket } })
      expect(sql).toBe('select floor("price" / 10) * 10 as "price", SUM("x") AS "value" from "t" group by floor("price" / 10) * 10')

      const result = await run(
        [
          [
            { price: 10, value: 1 },
            { price: 20, value: 2 },
          ],
        ],
        `query t { fetch { price: bucket(field: price, size: 10, type: Array) { value: sum(a: x) } } }`,
        {},
        { dimensions: { bucket } },
      )
      expect(result).toEqual([
        { price: 10, value: 1 },
        { price: 20, value: 2 },
      ])
    })
  })

  describe('directives', () => {
    test('plan hook edits the plan: mirror the node into another fetch', async () => {
      const mirror: Resolver = {
        args: { by: PropTypes.string.isRequired },
        plan(node, { plan, path, args }) {
          const ref = fetchOf(plan, args.by as string)
          if (ref && !nodeAt(ref, path)) insertNode(ref, path.slice(0, -1), { ...cloneNode(node as any), directives: [] })
        },
        result: (cell, ctx) => (ctx.baseline ? { value: (cell.value as number) - (ctx.at(ctx.args.by as string, cell.keys, cell.path) as number) } : undefined),
      }
      const sql = await sqlOf(
        `query t { cur: fetch { device { a: sum(a: x) @mirror(by: prev) } } prev: fetch { device { b: sum(a: y) } } }`,
        {},
        { directives: { mirror } },
      )
      expect(sql[1]).toContain('SUM("x") AS "a"')
      const result = await run(
        [[{ device: 'm', a: 5 }], [{ device: 'm', b: 1, a: 2 }]],
        `query t { cur: fetch { device { a: sum(a: x) @mirror(by: prev) } } prev: fetch { device { b: sum(a: y) } } }`,
        {},
        { directives: { mirror } },
      )
      expect(result).toEqual({ cur: { m: { a: 3 } }, prev: { m: { b: 1, a: 2 } } })
    })

    test('plan hook can remove the node it sits on', async () => {
      const onlyWhen: Resolver = {
        plan(_n, ctx) {
          if (!ctx.variables[ctx.args.flag as string]) ctx.remove()
        },
      }
      const sql = await sqlOf(`query t { fetch { device { a: sum(a: x) @onlyWhen(flag: "f") b: sum(a: y) } } }`, { f: false }, { directives: { onlyWhen } })
      expect(sql[0]).not.toContain('"a"')
    })

    test('directive args are validated against the schema', async () => {
      const d: Resolver = { args: { n: PropTypes.number.isRequired }, result: () => undefined }
      await expect(sqlOf(`query t { fetch { device { a: sum(a: x) @d } } }`, {}, { directives: { d } })).rejects.toThrow(/`n` is marked as required in `@d`/)
    })

    test('state is per occurrence and shared between plan and result hooks', async () => {
      const seen: unknown[] = []
      const counter: Resolver = {
        plan: (_n, ctx) => {
          ctx.state.tag = ctx.args.tag
        },
        result: (cell, ctx) => {
          if (ctx.baseline) seen.push([ctx.state.tag, cell.value])
          return undefined
        },
      }
      await run([[{ device: 'm', a: 1, b: 2 }]], `query t { fetch { device { a: sum(a: x) @counter(tag: "A") b: sum(a: y) @counter(tag: "B") } } }`, {}, {
        directives: { counter },
      })
      expect(seen).toEqual([['A', 1], ['B', 2]])
    })

    test('a result hook on a dimension runs once per row', async () => {
      let calls = 0
      const once: Resolver = {
        result: (_c, ctx) => {
          if (ctx.baseline) calls++
          return undefined
        },
      }
      await run([[{ device: 'm', a: 1, b: 2 }, { device: 'd', a: 3, b: 4 }]], `query t { fetch { device @once { a: sum(a: x) b: sum(a: y) } } }`, {}, { directives: { once } })
      expect(calls).toBe(2)
    })
  })

  describe('middleware', () => {
    test('plan middleware sees and edits the whole plan before SQL exists', async () => {
      const addFilter: Resolver = {
        async plan(_t, { plan }) {
          for (const f of plan.fetches) f.filters = { ...(f.filters ?? {}), tenant: 'acme' }
        },
      }
      const [sql] = await sqlOf(`query t { fetch { device { a: sum(a: x) } } }`, {}, { middleware: [addFilter] })
      expect(sql).toContain(`"t"."tenant" = 'acme'`)
    })

    test('result middleware sees every cell and the timings', async () => {
      const cells: string[] = []
      let timings: Record<string, number> | undefined
      const audit: Resolver = {
        result: (cell, ctx) => {
          if (ctx.baseline) {
            cells.push(cell.path.join('.'))
            timings = ctx.timings
          }
          return undefined
        },
      }
      await run([[{ device: 'm', a: 1 }]], `query t { fetch { device { a: sum(a: x) } } }`, {}, { middleware: [audit] })
      expect(cells).toEqual(['device.a'])
      expect(timings).toMatchObject({ parse: expect.any(Number), execute: expect.any(Number) })
    })
  })
})

describe('review findings', () => {
  test('metric and dimension resolvers may carry plan and result hooks', async () => {
    const doubled: Resolver = {
      args: { a: PropTypes.string.isRequired },
      plan: (node) => {
        ;(node as any).args.a = `${(node as any).args.a}_src`
      },
      sql: (n, c) => c.knex.raw('SUM(??) AS ??', [c.col(n.args.a as string), n.alias]),
      result: (cell) => ({ value: (cell.value as number) * 2 }),
    }
    const upper: Resolver = {
      sql: (n, c) => ({ select: [c.knex.raw('?? AS ??', [c.col(n.name), n.alias])], groupBy: [c.knex.raw('??', [c.col(n.name)])] }),
      result: (cell, ctx) => ({ keys: { ...cell.keys, [ctx.node!.alias]: String(cell.keys[ctx.node!.alias]).toUpperCase() } }),
    }
    const sql = await sqlOf(`query t { fetch { device { v: doubled(a: x) } } }`, {}, { metrics: { doubled } })
    expect(sql[0]).toContain('SUM("x_src") AS "v"')
    const out = await run([[{ device: 'm', v: 2 }]], `query t { fetch { device { v: doubled(a: x) } } }`, {}, { metrics: { doubled }, dimensions: { device: upper } })
    expect(out).toEqual({ M: { v: 4 } })
  })

  test('middleware query hook sees every builder', async () => {
    const cap: Resolver = { query: (qb) => qb.limit(1) }
    const [sql] = await sqlOf(`query t { fetch { device { v: sum(a: x) } } }`, {}, { middleware: [cap] })
    expect(sql.endsWith('limit 1')).toBe(true)
  })

  test('emit: false keeps a node in the baseline but out of the output', async () => {
    const hide: Resolver = {
      plan: (node) => {
        ;(node as Node).emit = false
      },
    }
    const out = await run([[{ device: 'm', a: 10, b: 2 }]], `query t { fetch { device { a: sum(a: x) @divide(byField: b) b: sum(a: y) @hide } } }`, {}, { directives: { hide } })
    expect(out).toEqual({ m: { a: 5 } })
  })

  test('a row-level hook may replace the value of every cell of the row', async () => {
    const zero: Resolver = { result: () => ({ value: 0 }) }
    await expect(run([[{ device: 'm', a: 1, b: 2 }]], `query t { fetch @zero { device { a: sum(a: x) b: sum(a: y) } } }`, {}, { directives: { zero } })).resolves.toEqual({
      m: { a: 0, b: 0 },
    })
  })

  test('ctx.at resolves the shape through every fetch sharing the alias', async () => {
    const out = await run(
      [[{ device: 'm', v: 10 }], [{ country: 'DE', v: 1 }], [{ device: 'm', v: 3 }]],
      `query t {
        cur: fetch { device(type: Array) { v: sum(a: x) @subtract(by: prev) } }
        prev: fetch { country { v: sum(a: x) } }
        prev: fetch { device(type: Array) { v: sum(a: x) } }
      }`,
    )
    expect(out.cur).toEqual([{ device: 'm', v: 7 }])
  })

  test('a relocated type: Array metric keeps its identity value', async () => {
    await expect(run([[{ year: '2026', price: 2 }]], `query t { fetch { year @parse(as: "int") { price: distinct(type: Array) } } }`)).resolves.toEqual({
      '2026': [{ price: 2 }],
    })
  })
})
