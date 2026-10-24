import { describe, expect, test } from 'vitest'
import type { Resolver } from '../src'
import { run } from './harness'

const d = (date: string, device: string, value: number) => ({ date, device, value })

describe('dimension values named like prototype members', () => {
  test('are ordinary keys and never touch Object.prototype', async () => {
    const rows = [
      { country: '__proto__', v: 2 },
      { country: 'constructor', v: 3 },
      { country: 'toString', v: 4 },
    ]
    const records = (await run([rows], `query t { fetch { country { v: sum(a: x) } } }`)) as { country: string; v: number }[]
    expect(records).toEqual(rows.map(({ country, v }) => ({ country, v })))
    const out = (await run([rows], `query t { fetch { country(type: Map) { v: sum(a: x) } } }`)) as Record<string, { v: number }>
    expect(Object.keys(out).sort()).toEqual(['__proto__', 'constructor', 'toString'])
    expect(Object.getOwnPropertyDescriptor(out, '__proto__')!.value).toEqual({ v: 2 })
    expect(out.constructor).toEqual({ v: 3 })
    expect(({} as any).v).toBeUndefined()
    const diff = await run([rows, rows], `query t { a: fetch { country(type: Map) { v: sum(a: x) @subtract(by: b) } } b: fetch { country(type: Map) { v: sum(a: x) } } }`)
    expect(Object.getOwnPropertyDescriptor((diff as any).a, '__proto__')!.value).toEqual({ v: 0 })
  })

  test('fetch aliases named like prototype members are ordinary keys', async () => {
    const out = await run([[{ v: 2 }], [{ v: 3 }], [[{ v: 4 }]].flat()], `query t { __proto__: fetch { v: sum(a: x) } constructor: fetch { v: sum(a: x) } toString: fetchPlain { v } }`)
    expect(Object.keys(out as object).sort()).toEqual(['__proto__', 'constructor', 'toString'])
    expect(Object.getOwnPropertyDescriptor(out, '__proto__')!.value).toEqual({ v: 2 })
    expect((out as any).constructor).toEqual({ v: 3 })
    expect((out as any).toString).toEqual([[{ v: 4 }]])
    expect(({} as any).v).toBeUndefined()
  })
})

describe('merge', () => {
  describe('plain shapes', () => {
    const rows = [d('2022-01-01', 'mobile', 1), d('2022-01-01', 'desktop', 2), d('2022-01-02', 'mobile', 10)]

    test('nested dimensions are arrays of records in row order', async () => {
      await expect(run([rows], `query t { fetch { date { device { value: sum(a: x) } } } }`)).resolves.toEqual([
        {
          date: '2022-01-01',
          device: [
            { device: 'mobile', value: 1 },
            { device: 'desktop', value: 2 },
          ],
        },
        { date: '2022-01-02', device: [{ device: 'mobile', value: 10 }] },
      ])
    })

    test('type: Map opts a dimension back into an object keyed by value', async () => {
      await expect(run([rows], `query t { fetch { date(type: Map) { device(type: Map) { value: sum(a: x) } } } }`)).resolves.toEqual({
        '2022-01-01': { mobile: { value: 1 }, desktop: { value: 2 } },
        '2022-01-02': { mobile: { value: 10 } },
      })
      await expect(run([rows], `query t { fetch { date { device(type: Map) { value: sum(a: x) } } } }`)).resolves.toEqual([
        { date: '2022-01-01', mobile: { value: 1 }, desktop: { value: 2 } },
        { date: '2022-01-02', mobile: { value: 10 } },
      ])
      await expect(run([rows], `query t { fetch { date(type: Map) { device { value: sum(a: x) } } } }`)).resolves.toEqual({
        '2022-01-01': [
          { device: 'mobile', value: 1 },
          { device: 'desktop', value: 2 },
        ],
        '2022-01-02': [{ device: 'mobile', value: 10 }],
      })
    })

    test('metric and dimension as siblings', async () => {
      const totals = [
        { date: '2022-01-01', total: 3 },
        { date: '2022-01-02', total: 10 },
      ]
      await expect(run([totals, rows], `query t { fetch { date { total: sum(a: x) device { value: sum(a: x) } } } }`)).resolves.toEqual([
        {
          date: '2022-01-01',
          total: 3,
          device: [
            { device: 'mobile', value: 1 },
            { device: 'desktop', value: 2 },
          ],
        },
        { date: '2022-01-02', total: 10, device: [{ device: 'mobile', value: 10 }] },
      ])
    })

    test('combine as Array at the root', async () => {
      await expect(run([rows], `query t { fetch { combine(fields: [date, device], type: Array) { value: sum(a: x) } } }`)).resolves.toEqual([
        { date: '2022-01-01', device: 'mobile', value: 1 },
        { date: '2022-01-01', device: 'desktop', value: 2 },
        { date: '2022-01-02', device: 'mobile', value: 10 },
      ])
    })

    test('combine under a dimension that shares a field hangs off its alias', async () => {
      await expect(run([rows], `query t { fetch { date(type: Map) { combine(fields: [date, device]) { value: sum(a: x) } } } }`)).resolves.toEqual({
        '2022-01-01': [
          { date: '2022-01-01', device: 'mobile', value: 1 },
          { date: '2022-01-01', device: 'desktop', value: 2 },
        ],
        '2022-01-02': [{ date: '2022-01-02', device: 'mobile', value: 10 }],
      })
      await expect(run([rows], `query t { fetch { date { pairs: combine(fields: [date, device]) { value: sum(a: x) } } } }`)).resolves.toEqual([
        {
          date: '2022-01-01',
          pairs: [
            { date: '2022-01-01', device: 'mobile', value: 1 },
            { date: '2022-01-01', device: 'desktop', value: 2 },
          ],
        },
        { date: '2022-01-02', pairs: [{ date: '2022-01-02', device: 'mobile', value: 10 }] },
      ])
    })

    test('a metric column missing from a row is not written', async () => {
      await expect(run([[{ device: 'mobile', a: 1 }]], `query t { fetch { device { a: sum(a: x) b: sum(a: y) } } }`)).resolves.toEqual([{ device: 'mobile', a: 1 }])
    })

    test('aliased and unaliased fetches share the output root', async () => {
      await expect(
        run([[{ device: 'mobile', a: 1 }], [{ device: 'mobile', b: 2 }]], `query t { fetch { device { a: sum(a: x) } } other: fetch { device { b: sum(a: y) } } }`),
      ).resolves.toEqual({ '': [{ device: 'mobile', a: 1 }], other: [{ device: 'mobile', b: 2 }] })
    })

    test('fetchPlain returns the raw row sets', async () => {
      const rows = [{ device: 'mobile', a: 1 }]
      await expect(run([rows], `query t { raw: fetchPlain { device { a: sum(a: x) } } }`)).resolves.toEqual({ raw: [rows] })
    })

    test('metric with type: Array becomes a deduplicated root array', async () => {
      const rows = ['FR', 'MX', 'FR', 'DE'].map((country) => ({ country }))
      await expect(run([rows], `query t { fetch { country: distinct(type: Array) } }`)).resolves.toEqual([
        { country: 'FR' },
        { country: 'MX' },
        { country: 'DE' },
      ])
    })
  })

  describe('dimension values with special characters', () => {
    const values = ['a=b;c', 'x[1]', '@at', '12:30:00', 'with.dot', '$&', 'plain']
    const rows = values.map((domain, i) => ({ domain, value: i + 1 }))

    test('as Map keys', async () => {
      const result = await run([rows], `query t { fetch { domain(type: Map) { value: sum(a: x) } } }`)
      expect(Object.keys(result)).toEqual(values)
      values.forEach((v, i) => expect(result[v]).toEqual({ value: i + 1 }))
    })

    test('as record values', async () => {
      const result = await run([rows], `query t { fetch { domain { value: sum(a: x) } } }`)
      expect(result).toEqual(values.map((domain, i) => ({ domain, value: i + 1 })))
    })
  })

  describe('@filter on a dimension', () => {
    const query = `query t { fetch { channels @filter(where: { value: { gt: 1 } }) { value: sum(a: x) } } }`
    const row = (channels: string, value: number) => ({ channels, value })

    test.each([
      ['drop, keep, keep', [row('Social', 1), row('Organic', 3), row('Direct', 4)]],
      ['keep, drop, keep', [row('Organic', 3), row('Social', 1), row('Direct', 4)]],
      ['keep, keep, drop', [row('Organic', 3), row('Direct', 4), row('Social', 1)]],
    ])('%s keeps every passing row', async (_, rows) => {
      await expect(run([rows], query)).resolves.toEqual([
        { channels: 'Organic', value: 3 },
        { channels: 'Direct', value: 4 },
      ])
    })

    test('dropping the whole first element', async () => {
      const rows = [d('2022-01-01', 'mobile', 1), d('2022-01-01', 'desktop', 1), d('2022-01-02', 'mobile', 10), d('2022-01-02', 'desktop', 20), d('2022-01-03', 'mobile', 100)]
      await expect(run([rows], `query t { fetch { date { device @filter(where: { value: { gt: 1 } }) { value: sum(a: x) } } } }`)).resolves.toEqual([
        {
          date: '2022-01-02',
          device: [
            { device: 'mobile', value: 10 },
            { device: 'desktop', value: 20 },
          ],
        },
        { date: '2022-01-03', device: [{ device: 'mobile', value: 100 }] },
      ])
    })

    test('a late row for an earlier key lands in its own element', async () => {
      const rows = [d('2022-01-01', 'mobile', 1), d('2022-01-02', 'mobile', 10), d('2022-01-03', 'mobile', 100), d('2022-01-01', 'tablet', 3)]
      await expect(run([rows], `query t { fetch { date { device @filter(where: { value: { gt: 1 } }) { value: sum(a: x) } } } }`)).resolves.toEqual([
        { date: '2022-01-02', device: [{ device: 'mobile', value: 10 }] },
        { date: '2022-01-03', device: [{ device: 'mobile', value: 100 }] },
        { date: '2022-01-01', device: [{ device: 'tablet', value: 3 }] },
      ])
    })

    test('on a metric drops only that value', async () => {
      const rows = [d('2022-01-01', 'mobile', 1), d('2022-01-01', 'desktop', 2)]
      await expect(run([rows], `query t { fetch { date { device { value: sum(a: x) @filter(gt: 1) } } } }`)).resolves.toEqual([
        { date: '2022-01-01', device: [{ device: 'desktop', value: 2 }] },
      ])
    })
  })

  describe('directives reading another query', () => {
    const series = [
      { date: '2022-01-01', value: 2 },
      { date: '2022-01-02', value: 3 },
    ]
    // Different row order on purpose: lookups must go by key, not position.
    const prev = [
      { date: '2022-01-02', value: 2 },
      { date: '2022-01-01', value: 1 },
    ]

    test('@diff across Array dimensions', async () => {
      await expect(
        run(
          [series, prev],
          `query t {
            series: fetch { date(type: Array) { value: sum(a: x) @diff(by: prev) } }
            prev: fetch { date(type: Array) { value: sum(a: x) } }
          }`,
        ),
      ).resolves.toEqual({
        series: [
          { date: '2022-01-01', value: 1 },
          { date: '2022-01-02', value: 0.5 },
        ],
        prev: [
          { date: '2022-01-02', value: 2 },
          { date: '2022-01-01', value: 1 },
        ],
      })
    })

    test('@subtract across Array dimensions', async () => {
      await expect(
        run(
          [series, prev],
          `query t {
            series: fetch { date(type: Array) { value: sum(a: x) @subtract(by: prev) } }
            prev: fetch { date(type: Array) { value: sum(a: x) } }
          }`,
        ),
      ).resolves.toMatchObject({
        series: [
          { date: '2022-01-01', value: 1 },
          { date: '2022-01-02', value: 1 },
        ],
      })
    })

    test('@diff with a filtered first element in the other query', async () => {
      const filteredPrev = [
        { date: '2022-01-01', value: 0 },
        { date: '2022-01-02', value: 2 },
      ]
      // Directives read the other query's pre-directive data (baseline), so
      // the filtered-out 0 is still what series is compared against.
      await expect(
        run(
          [series, filteredPrev],
          `query t {
            series: fetch { date(type: Array) { value: sum(a: x) @diff(by: prev) } }
            prev: fetch { date(type: Array) @filter(where: { value: { gt: 0 } }) { value: sum(a: x) } }
          }`,
        ),
      ).resolves.toEqual({
        series: [
          { date: '2022-01-01', value: Infinity },
          { date: '2022-01-02', value: 0.5 },
        ],
        prev: [{ date: '2022-01-02', value: 2 }],
      })
    })
  })

  describe('custom result directives', () => {
    test('relocate with keys and write siblings with set', async () => {
      const rename: Resolver = {
        result: (cell, ctx) => (ctx.baseline ? { keys: { ...cell.keys, device: 'all' }, set: { marker: (cell.value as number) * 10 } } : undefined),
      }
      const rows = [d('2022-01-01', 'test.com', 1), d('2022-01-02', 'mobile', 2)]
      await expect(run([rows], `query t { fetch { date { device { value: sum(a: x) @rename } } } }`, {}, { directives: { rename } })).resolves.toEqual([
        { date: '2022-01-01', device: [{ device: 'all', value: 1, marker: 10 }] },
        { date: '2022-01-02', device: [{ device: 'all', value: 2, marker: 20 }] },
      ])
    })

    test('a hook sees the cell path and the dimension keys', async () => {
      const seen: unknown[] = []
      const spy: Resolver = {
        result: (cell, ctx) => {
          if (ctx.baseline) seen.push({ path: cell.path, keys: cell.keys, ctxPath: ctx.path })
          return undefined
        },
      }
      await run([[d('2022-01-01', 'mobile', 1)]], `query t { fetch { date(type: Array) { device { value: sum(a: x) @spy } } } }`, {}, { directives: { spy } })
      expect(seen).toEqual([{ path: ['date', 'device', 'value'], keys: { date: '2022-01-01', device: 'mobile' }, ctxPath: ['date', 'device', 'value'] }])
    })
  })

  describe('@divide', () => {
    const rows = [
      { device: 'mobile', a: 10, b: 2 },
      { device: 'desktop', a: 9, b: 3 },
    ]

    test('byField divides by a sibling metric of the same query', async () => {
      await expect(run([rows], `query t { fetch { device { a: sum(a: x) @divide(byField: b) b: sum(a: y) } } }`)).resolves.toEqual([
        { device: 'mobile', a: 5, b: 2 },
        { device: 'desktop', a: 3, b: 3 },
      ])
    })

    test('by another query', async () => {
      await expect(
        run(
          [rows, rows],
          `query t {
            cur: fetch { device { a: sum(a: x) @divide(by: prev) } }
            prev: fetch { device { a: sum(a: y) } }
          }`,
        ),
      ).resolves.toEqual({
        cur: [
          { device: 'mobile', a: 1 },
          { device: 'desktop', a: 1 },
        ],
        prev: [
          { device: 'mobile', a: 10 },
          { device: 'desktop', a: 9 },
        ],
      })
    })
  })

  describe('@groupBy on an Array dimension', () => {
    test('sums rows into their month and keeps other dates apart', async () => {
      const rows = [d('2022-01-05', 'mobile', 1), d('2022-01-20', 'mobile', 2), d('2022-02-03', 'mobile', 4), d('2022-01-05', 'desktop', 8)]
      await expect(run([rows], `query t { fetch { date @groupBy(by: month) { device { value: sum(a: x) } } } }`)).resolves.toEqual([
        {
          date: '2022-01-01',
          device: [
            { device: 'mobile', value: 3 },
            { device: 'desktop', value: 8 },
          ],
        },
        { date: '2022-02-01', device: [{ device: 'mobile', value: 4 }] },
      ])
    })

    test('writes the grouped key when the metric is a direct child', async () => {
      const rows = [
        { date: '2022-01-05', value: 1 },
        { date: '2022-01-20', value: 2 },
        { date: '2022-02-03', value: 4 },
      ]
      await expect(run([rows], `query t { fetch { date(type: Array) @groupBy(by: month) { value: sum(a: x) } } }`)).resolves.toEqual([
        { date: '2022-01-01', value: 3 },
        { date: '2022-02-01', value: 4 },
      ])
    })
  })
})
