import { describe, expect, test, vi } from 'vitest'
import { gritql, knexAdapter, pgAdapter, Resolver } from '../src'

const query = `query t { fetch { device { value: sum(a: sessions) } } }`
const rows = [{ device: 'mobile', value: 1 }]

describe('adapters', () => {
  test('runs statements through the adapter and assembles the rows', async () => {
    const execute = vi.fn(async () => rows)
    const g = gritql({ adapters: { custom: knexAdapter({ dialect: 'pg', execute }) } })

    await expect(g.run(query)).resolves.toEqual({ mobile: { value: 1 } })
    expect(execute).toHaveBeenCalledTimes(1)
    const [req] = execute.mock.calls[0] as unknown as [{ sql: string; params: unknown[] }]
    expect(req.sql).toContain('SUM("sessions")')
    expect(req.params).toEqual([])
  })

  test('binds parameters natively', async () => {
    const execute = vi.fn(async () => rows)
    const g = gritql({ adapters: { pg: knexAdapter({ dialect: 'pg', execute }) } })
    await g.run(`query t { fetch(filters: { brand: "Adidas" }) { device { value: sum(a: sessions) } } }`)
    const [req] = execute.mock.calls[0] as unknown as [{ sql: string; params: unknown[] }]
    expect(req.sql).toContain('$1')
    expect(req.params).toEqual(['Adidas'])
  })

  test('compile hook rewrites the statement', async () => {
    const execute = vi.fn(async () => rows)
    const g = gritql({
      adapters: {
        ch: knexAdapter({
          dialect: 'clickhouse',
          compile: (qb) => ({ sql: qb.toString().replace(/float4/g, 'Nullable(Float32)') + ' FORMAT JSON', params: [] }),
          execute,
        }),
      },
    })
    await g.run(`query t { fetch { device { value: share(a: sessions) } } }`)
    const [req] = execute.mock.calls[0] as unknown as [{ sql: string }]
    expect(req.sql).toContain('Nullable(Float32)')
    expect(req.sql.endsWith('FORMAT JSON')).toBe(true)
  })

  test('picks the adapter by name, defaulting to `default` then the first one', async () => {
    const a = vi.fn(async () => rows)
    const b = vi.fn(async () => rows)
    const g = gritql({ adapters: { a: knexAdapter({ dialect: 'pg', execute: a }), b: knexAdapter({ dialect: 'pg', execute: b }) }, default: 'b' })
    await g.run(query)
    expect(b).toHaveBeenCalledTimes(1)
    await g.run(query, {}, { adapter: 'a' })
    expect(a).toHaveBeenCalledTimes(1)
    await expect(g.run(query, {}, { adapter: 'nope' })).rejects.toThrow(/Unknown adapter "nope"/)
  })

  test('compile() does not touch the adapter', async () => {
    const execute = vi.fn(async () => rows)
    const g = gritql({ adapters: { pg: knexAdapter({ dialect: 'pg', execute }) } })
    const compiled = await g.compile(query)
    expect(compiled.queries).toHaveLength(1)
    expect(compiled.queries[0].text).toBe('select "device", SUM("sessions") AS "value" from "t" group by "device"')
    expect(execute).not.toHaveBeenCalled()
    expect(Object.keys(compiled.timings).sort()).toEqual(['lower', 'parse', 'plan', 'sql'])
  })

  test('adapter errors are wrapped with the fetch path', async () => {
    const g = gritql({
      adapters: {
        pg: knexAdapter({
          dialect: 'pg',
          execute: async () => {
            throw new Error('connection refused')
          },
        }),
      },
    })
    await expect(g.run(`query t { data: fetch { device { value: sum(a: x) } } }`)).rejects.toMatchObject({
      code: 'EXECUTE',
      message: expect.stringContaining('connection refused'),
      path: ['data', 'device'],
    })
  })

  test('a dialect without a resolver entry is rejected at compile time', async () => {
    const g = gritql({ adapters: { sf: knexAdapter({ dialect: 'snowflake', execute: async () => rows }) } })
    await expect(g.compile(`query t { fetch { device { x: searchRanking(a: title) } } }`)).rejects.toThrow(
      /snowflake provider doesn't support searchRanking metric/,
    )
  })

  test('pgAdapter uses knex.raw and returns rows', async () => {
    const raw = vi.fn(async () => ({ rows }))
    const adapter = pgAdapter({ raw } as any)
    await expect(adapter.execute({ sql: 'select 1', params: [] })).resolves.toEqual(rows)
    expect(raw).toHaveBeenCalledWith('select 1', [])
  })

  describe('execute middleware', () => {
    test('wraps the adapter around-style, in registration order', async () => {
      const execute = vi.fn(async () => rows)
      const calls: string[] = []
      const mw = (name: string): Resolver => ({
        async execute(req, next) {
          calls.push(`${name}:before`)
          const out = await next({ ...req, sql: `${req.sql} /* ${name} */` })
          calls.push(`${name}:after`)
          return out
        },
      })
      const g = gritql({ adapters: { pg: knexAdapter({ dialect: 'pg', execute }) } }).use({ middleware: [mw('a'), mw('b')] })
      await g.run(query)
      expect(calls).toEqual(['a:before', 'b:before', 'b:after', 'a:after'])
      const [req] = execute.mock.calls[0] as unknown as [{ sql: string }]
      expect(req.sql.endsWith('/* a */ /* b */')).toBe(true)
    })

    test('can short-circuit (cache)', async () => {
      const execute = vi.fn(async () => rows)
      const store = new Map<string, unknown>()
      const cache: Resolver = {
        async execute(req, next, ctx) {
          const key = `${ctx.adapter.name}:${req.sql}:${JSON.stringify(req.params)}`
          if (!store.has(key)) store.set(key, await next(req))
          return store.get(key) as any
        },
      }
      const g = gritql({ adapters: { pg: knexAdapter({ dialect: 'pg', execute }) } }).use({ middleware: [cache] })
      await g.run(query)
      await g.run(query)
      expect(execute).toHaveBeenCalledTimes(1)
    })
  })
})
