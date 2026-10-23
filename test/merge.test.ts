// Make this file a module so test helpers do not clash across files
export {}
//@ts-ignore
const { gqlToDb } = require('../gql-sql-slicer')

// Runs a query against fixed row sets (one array per generated SQL query).
const run = (tables: any[][], query: string) =>
  gqlToDb().dbFetch(() => tables)(query, {})

const d = (date: string, device: string, value: number) => ({ date, device, value })

describe('merge', () => {
  describe('plain shapes', () => {
    const rows = [d('2022-01-01', 'mobile', 1), d('2022-01-01', 'desktop', 2), d('2022-01-02', 'mobile', 10)]

    test('object dimensions', async () => {
      await expect(
        run([rows], `query t { fetch { date { device { value: sum(a: x) } } } }`),
      ).resolves.toEqual({
        '2022-01-01': { mobile: { value: 1 }, desktop: { value: 2 } },
        '2022-01-02': { mobile: { value: 10 } },
      })
    })

    test('Array dimension at the root', async () => {
      await expect(
        run([rows], `query t { fetch { date(type: Array) { device { value: sum(a: x) } } } }`),
      ).resolves.toEqual([
        { date: '2022-01-01', mobile: { value: 1 }, desktop: { value: 2 } },
        { date: '2022-01-02', mobile: { value: 10 } },
      ])
    })

    test('Array dimension nested under an object dimension', async () => {
      await expect(
        run([rows], `query t { fetch { date { device(type: Array) { value: sum(a: x) } } } }`),
      ).resolves.toEqual({
        '2022-01-01': [
          { device: 'mobile', value: 1 },
          { device: 'desktop', value: 2 },
        ],
        '2022-01-02': [{ device: 'mobile', value: 10 }],
      })
    })

    test('metric and Array dimension as siblings', async () => {
      const totals = [
        { date: '2022-01-01', total: 3 },
        { date: '2022-01-02', total: 10 },
      ]

      await expect(
        run(
          [totals, rows],
          `query t { fetch { date { total: sum(a: x) device(type: Array) { value: sum(a: x) } } } }`,
        ),
      ).resolves.toEqual({
        '2022-01-01': {
          total: 3,
          device: [
            { device: 'mobile', value: 1 },
            { device: 'desktop', value: 2 },
          ],
        },
        '2022-01-02': { total: 10, device: [{ device: 'mobile', value: 10 }] },
      })
    })

    test('combine as Array at the root', async () => {
      await expect(
        run([rows], `query t { fetch { combine(fields: [date, device], type: Array) { value: sum(a: x) } } }`),
      ).resolves.toEqual([
        { date: '2022-01-01', device: 'mobile', value: 1 },
        { date: '2022-01-01', device: 'desktop', value: 2 },
        { date: '2022-01-02', device: 'mobile', value: 10 },
      ])
    })

    test('combine as Array under a dimension that shares a field', async () => {
      await expect(
        run(
          [rows],
          `query t { fetch { date { combine(fields: [date, device], type: Array) { value: sum(a: x) } } } }`,
        ),
      ).resolves.toEqual({
        '2022-01-01': [
          { date: '2022-01-01', device: 'mobile', value: 1 },
          { date: '2022-01-01', device: 'desktop', value: 2 },
        ],
        '2022-01-02': [{ date: '2022-01-02', device: 'mobile', value: 10 }],
      })
    })
  })

  describe('dimension values with special characters', () => {
    const values = ['a=b;c', 'x[1]', '@at', '12:30:00', 'with.dot', '$&', 'plain']
    const rows = values.map((domain, i) => ({ domain, value: i + 1 }))

    test('as object keys', async () => {
      const result = await run([rows], `query t { fetch { domain { value: sum(a: x) } } }`)

      expect(Object.keys(result)).toEqual(values)
      values.forEach((v, i) => expect(result[v]).toEqual({ value: i + 1 }))
    })

    test('as Array keys', async () => {
      const result = await run(
        [rows],
        `query t { fetch { domain(type: Array) { value: sum(a: x) } } }`,
      )

      expect(result).toEqual(values.map((domain, i) => ({ domain, value: i + 1 })))
    })
  })

  describe('@filter on a dimension', () => {
    const query = `query t { fetch { channels @filter(value_gt: 1) { value: sum(a: x) } } }`
    const row = (channels: string, value: number) => ({ channels, value })

    test.each([
      ['drop, keep, keep', [row('Social', 1), row('Organic', 3), row('Direct', 4)]],
      ['keep, drop, keep', [row('Organic', 3), row('Social', 1), row('Direct', 4)]],
      ['keep, keep, drop', [row('Organic', 3), row('Direct', 4), row('Social', 1)]],
    ])('%s keeps every passing row', async (_, rows) => {
      await expect(run([rows], query)).resolves.toEqual({
        Organic: { value: 3 },
        Direct: { value: 4 },
      })
    })

    test('dropping the whole first Array element', async () => {
      const rows = [
        d('2022-01-01', 'mobile', 1),
        d('2022-01-01', 'desktop', 1),
        d('2022-01-02', 'mobile', 10),
        d('2022-01-02', 'desktop', 20),
        d('2022-01-03', 'mobile', 100),
      ]

      await expect(
        run(
          [rows],
          `query t { fetch { date(type: Array) { device @filter(value_gt: 1) { value: sum(a: x) } } } }`,
        ),
      ).resolves.toEqual([
        { date: '2022-01-02', mobile: { value: 10 }, desktop: { value: 20 } },
        { date: '2022-01-03', mobile: { value: 100 } },
      ])
    })

    test('a late row for an earlier key lands in its own element', async () => {
      const rows = [
        d('2022-01-01', 'mobile', 1),
        d('2022-01-02', 'mobile', 10),
        d('2022-01-03', 'mobile', 100),
        d('2022-01-01', 'tablet', 3),
      ]

      await expect(
        run(
          [rows],
          `query t { fetch { date(type: Array) { device @filter(value_gt: 1) { value: sum(a: x) } } } }`,
        ),
      ).resolves.toEqual([
        { date: '2022-01-02', mobile: { value: 10 } },
        { date: '2022-01-03', mobile: { value: 100 } },
        { date: '2022-01-01', tablet: { value: 3 } },
      ])
    })

    test('on a metric drops only that value', async () => {
      const rows = [d('2022-01-01', 'mobile', 1), d('2022-01-01', 'desktop', 2)]

      await expect(
        run(
          [rows],
          `query t { fetch { date(type: Array) { device { value: sum(a: x) @filter(gt: 1) } } } }`,
        ),
      ).resolves.toEqual([{ date: '2022-01-01', desktop: { value: 2 } }])
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

      // Directives read the other query's pre-directive data, so the
      // filtered-out 0 is still what series is compared against.
      await expect(
        run(
          [series, filteredPrev],
          `query t {
            series: fetch { date(type: Array) { value: sum(a: x) @diff(by: prev) } }
            prev: fetch { date(type: Array) @filter(value_gt: 0) { value: sum(a: x) } }
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

  describe('custom directives keep the string-path contract', () => {
    //@ts-ignore
    const { postExecutedDirectives } = require('../directives')
    const seen = []

    beforeAll(() => {
      postExecutedDirectives.legacy = (context) => {
        const transformer = ({ value, path, key, replacedPath, globalReplacedPath, originFullObject }) => {
          if (!originFullObject) return {}
          seen.push({ path, key, replacedPath, globalReplacedPath })
          // Move the value under a renamed key and leave a marker next to it.
          return {
            path: `${globalReplacedPath}.renamed_${key}`,
            replacers: { marker: value * 10 },
          }
        }
        transformer.context = context
        return transformer
      }
    })

    afterAll(() => {
      delete postExecutedDirectives.legacy
    })

    test('reads lazily built paths and may return a new string path', async () => {
      const rows = [d('2022-01-01', 'test.com', 1), d('2022-01-02', 'mobile', 2)]

      await expect(
        run(
          [rows],
          `query t { fetch { date(type: Array) { device { value: sum(a: x) @legacy } } } }`,
        ),
      ).resolves.toEqual([
        { date: '2022-01-01', 'test.com': { renamed_value: 1, marker: 10 } },
        { date: '2022-01-02', mobile: { renamed_value: 2, marker: 20 } },
      ])

      expect(seen[0]).toEqual({
        path: '[@date=:date].:device.value',
        key: 'value',
        replacedPath: '[@date=2022-01-01].test$#@#com.value',
        globalReplacedPath: '[@date=2022-01-01].test$#@#com',
      })
    })
  })

  describe('@divide', () => {
    const rows = [
      { device: 'mobile', a: 10, b: 2 },
      { device: 'desktop', a: 9, b: 3 },
    ]

    test('byField divides by a sibling metric of the same query', async () => {
      await expect(
        run([rows], `query t { fetch { device { a: sum(a: x) @divide(byField: b) b: sum(a: y) } } }`),
      ).resolves.toEqual({
        mobile: { a: 5, b: 2 },
        desktop: { a: 3, b: 3 },
      })
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
        cur: { mobile: { a: 1 }, desktop: { a: 1 } },
        prev: { mobile: { a: 10 }, desktop: { a: 9 } },
      })
    })
  })

  describe('@groupBy on an Array dimension', () => {
    test('sums rows into their month and keeps other dates apart', async () => {
      const rows = [
        d('2022-01-05', 'mobile', 1),
        d('2022-01-20', 'mobile', 2),
        d('2022-02-03', 'mobile', 4),
        d('2022-01-05', 'desktop', 8),
      ]

      await expect(
        run(
          [rows],
          `query t { fetch { date(type: Array) @groupBy(by: month) { device { value: sum(a: x) } } } }`,
        ),
      ).resolves.toEqual([
        { date: '2022-01-01', mobile: { value: 3 }, desktop: { value: 8 } },
        { date: '2022-02-01', mobile: { value: 4 } },
      ])
    })

    test('writes the grouped key when the metric is a direct child', async () => {
      const rows = [
        { date: '2022-01-05', value: 1 },
        { date: '2022-01-20', value: 2 },
        { date: '2022-02-03', value: 4 },
      ]

      await expect(
        run(
          [rows],
          `query t { fetch { date(type: Array) @groupBy(by: month) { value: sum(a: x) } } }`,
        ),
      ).resolves.toEqual([
        { date: '2022-01-01', value: 3 },
        { date: '2022-02-01', value: 4 },
      ])
    })
  })
})
