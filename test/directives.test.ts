import { describe, expect, test } from 'vitest'
import { run, sqlOf } from './harness'

// Compiles a query whose `a` metric carries the given directives and reports
// whether `a` survived into the generated SQL.
const isIncluded = async (directives: string, variables: Record<string, unknown> = {}) => {
  const sql = await sqlOf(`query t { fetch { device { a: sum(a: x) ${directives} b: sum(a: y) } } }`, variables)
  return sql.join('\n').includes('AS "a"')
}

const pad = (n: number) => String(n).padStart(2, '0')
const localOffset = (d: Date) => {
  const min = -d.getTimezoneOffset()
  return `${min >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`
}

describe('directives', () => {
  describe('@compare operators', () => {
    test.each([
      ['eq', '5', '5', true],
      ['eq', '5', '6', false],
      ['neq', '5', '6', true],
      ['gt', '7', '5', true],
      ['gt', '5', '5', false],
      ['gte', '5', '5', true],
      ['lt', '3', '5', true],
      ['lt', '5', '5', false],
      ['lte', '5', '5', true],
      ['in', '"a"', '["a", "b"]', true],
      ['in', '"c"', '["a", "b"]', false],
      ['in', '["a", "b"]', '"a"', true],
      ['nin', '"c"', '["a", "b"]', true],
      ['nin', '["a", "b"]', '"a"', false],
      ['of', '["x", "y"]', '["x", "y", "z"]', true],
      ['of', '["x", "q"]', '["x", "y", "z"]', false],
      ['of', '["x", "x"]', '"x"', true],
      ['of', '[{ k: 1 }]', '{ k: 1 }', true],
      ['nof', '["x", "q"]', '["x", "y", "z"]', true],
      ['nof', '["x", "y"]', '["x", "y", "z"]', false],
      ['contains', '["x", "y"]', '"y"', true],
      ['contains', '["x", "y"]', '["q", "y"]', true],
      ['contains', '["x", "y"]', '"z"', false],
      ['ncontains', '["x", "y"]', '"z"', true],
      ['ncontains', '["x", "y"]', '["y"]', false],
      ['startsWith', '["x", "y"]', '"x"', true],
      ['startsWith', '["x", "y"]', '["q", "x"]', true],
      ['startsWith', '["x", "y"]', '"y"', false],
      ['startsWith', '[]', '"x"', false],
      ['endsWith', '["x", "y"]', '"y"', true],
      ['endsWith', '["x", "y"]', '"x"', false],
      ['nStartsWith', '["x", "y"]', '"y"', true],
      ['nStartsWith', '["x", "y"]', '"x"', false],
      ['nEndsWith', '["x", "y"]', '"x"', true],
      ['nEndsWith', '["x", "y"]', '"y"', false],
    ])('%s: value %s against %s -> %s', async (op, value, arg, expected) => {
      expect(await isIncluded(`@compare(value: ${value}, ${op}: ${arg}) @include`)).toBe(expected)
    })

    test('chains several operators', async () => {
      expect(await isIncluded('@compare(value: 5, gt: 1, lt: 10) @include')).toBe(true)
      expect(await isIncluded('@compare(value: 5, gt: 1, eq: 6) @include')).toBe(false)
    })

    test('chained operators all compare the original value', async () => {
      expect(await isIncluded('@compare(value: 5, gt: 1, lt: 3) @include')).toBe(false)
    })

    test('result of @compare drives @skip', async () => {
      expect(await isIncluded('@compare(value: 5, eq: 5) @skip')).toBe(false)
      expect(await isIncluded('@compare(value: 5, eq: 6) @skip')).toBe(true)
    })

    test('takes value from variables', async () => {
      const sql = await sqlOf(`query t($v: Number!) { fetch { device { a: sum(a: x) @compare(value: $v, in: [1, 2]) @include b: sum(a: y) } } }`, { v: 3 })
      expect(sql.join('\n')).not.toContain('AS "a"')
    })
  })

  describe('plan-stage directive errors', () => {
    test.each([
      ['@compare(eq: 5)', /requires `value` argument/],
      ['@compare(value: 5)', /at least one argument/],
      ['@compare(value: 5, foo: 1)', /Can't find resolver for 'foo'/],
      ['@compare(value: 5, in: 5)', /Argument `in` or value must be an array/],
      ['@compare(value: 5, nin: 5)', /Argument `nin` or value must be an array/],
      ['@compare(value: 5, of: [5])', /Value must be an array/],
      ['@include(foo: true)', /Include directive requires `if` argument/],
      ['@skip(foo: true)', /Skip directive requires `if` argument/],
      ['@diff', /Diff directive requires 'by' argument/],
      ['@subtract', /Subtract directive requires 'by' argument/],
      ['@indexed', /requires 'to' or 'group' argument/],
      ['@indexed(to: x, group: y)', /only 'to' or 'group' argument at once/],
      ['@divide', /requires 'by' or 'byField' argument/],
      ['@parse', /Parse directive requires `as` argument/],
      ['@nosuch', /Unknown directive @nosuch/],
    ])('%s throws', async (directive, message) => {
      await expect(isIncluded(directive)).rejects.toThrow(message)
    })

    test.each([
      ['@groupOn(replacers: { device: "x" })', /requires at least one grouping condition/],
      ['@groupBy(foo: x)', /GroupBy directive requires 'by' argument/],
    ])('%s on a dimension throws', async (directive, message) => {
      await expect(run([[]], `query t { fetch { device ${directive} { a: sum(a: x) } } }`)).rejects.toThrow(message)
    })
  })

  describe('@parse', () => {
    const parse = (field: string, rows: any[]) => run([rows], `query t { fetch { ${field} } }`)

    test('int on a metric', async () => {
      await expect(parse('device { a: sum(a: x) @parse(as: "int") }', [{ device: 'mobile', a: '42.7' }])).resolves.toEqual([{ device: 'mobile', a: 42 }])
    })

    test('int with radix on a metric', async () => {
      await expect(parse('device { a: sum(a: x) @parse(as: { int: 16 }) }', [{ device: 'mobile', a: 'ff' }])).resolves.toEqual([{ device: 'mobile', a: 255 }])
    })

    test('float with precision on a metric', async () => {
      await expect(parse('device { a: sum(a: x) @parse(as: { float: 2 }) }', [{ device: 'mobile', a: '1.23456' }])).resolves.toEqual([{ device: 'mobile', a: '1.23' }])
    })

    // `iso` and `iso-time` carry the machine's UTC offset, as luxon did in v3.
    const local = new Date(2022, 0, 6, 1, 0, 0)
    const offset = localOffset(local)

    test.each([
      ['date', `2022-01-06T01:00:00.000${offset}`],
      ['{ date: "iso-date" }', '2022-01-06'],
      ['{ date: "iso-time" }', `01:00:00.000${offset}`],
      ['{ date: "iso-week-date" }', '2022-W01-4'],
      ['{ date: { format: "yyyy/MM" } }', '2022/01'],
    ])('%s on a dimension', async (as, expected) => {
      await expect(parse(`date(type: Array) @parse(as: ${as}) { a: sum(a: x) }`, [{ date: '2022-01-06 01:00:00', a: 1 }])).resolves.toEqual([
        { date: expected, a: 1 },
      ])
    })

    test('accepts Date objects and ISO strings', async () => {
      await expect(
        parse(`date(type: Array) @parse(as: { date: "iso-date" }) { a: sum(a: x) }`, [
          { date: new Date(2022, 0, 6, 12), a: 1 },
          { date: '2022-01-07T12:00:00Z', a: 2 },
        ]),
      ).resolves.toEqual([
        { date: '2022-01-06', a: 1 },
        { date: new Date('2022-01-07T12:00:00Z').getDate() === 7 ? '2022-01-07' : '2022-01-08', a: 2 },
      ])
    })

    test('on a dimension with several metrics parses the row once', async () => {
      await expect(
        parse(`date(type: Array) @parse(as: { date: "iso-date" }) { a: sum(a: x) b: sum(a: y) }`, [
          { date: '2022-01-06 01:00:00', a: 1, b: 2 },
          { date: '2022-01-07 01:00:00', a: 3, b: 4 },
        ]),
      ).resolves.toEqual([
        { date: '2022-01-06', a: 1, b: 2 },
        { date: '2022-01-07', a: 3, b: 4 },
      ])
    })
  })

  describe('@groupBy', () => {
    test('groups dates by month and sums metrics', async () => {
      await expect(
        run(
          [
            [
              { date: '2022-01-06', a: 1 },
              { date: '2022-01-20', a: 2 },
              { date: '2022-02-03', a: 4 },
            ],
          ],
          `query t { fetch { date(type: Array) @groupBy(by: month) { a: sum(a: x) } } }`,
        ),
      ).resolves.toEqual([
        { date: '2022-01-01', a: 3 },
        { date: '2022-02-01', a: 4 },
      ])
    })

    test('weeks start on Monday and sibling metrics are summed once', async () => {
      await expect(
        run(
          [
            [
              { value: 1, rank: 2, date: '2022-06-27T10:43:24.088Z' },
              { value: 3, rank: 2, date: '2022-06-27T10:43:20.088Z' },
              { value: 3, rank: 2, date: '2022-06-19T10:43:24.088Z' },
            ],
          ],
          `query t { fetch { date(type: Array) @groupBy(by: week) { value: sum(a: x) rank } } }`,
        ),
      ).resolves.toEqual([
        { date: '2022-06-27', value: 4, rank: 4 },
        { date: '2022-06-13', value: 3, rank: 2 },
      ])
    })
  })

  describe('@groupOn', () => {
    test('merges matching rows under the replacer key and stamps it inside', async () => {
      await expect(
        run(
          [
            [
              { channels: 'Social', value: 1 },
              { channels: 'Organic', value: 3 },
            ],
            [
              { channels: 'Social', value: 2 },
              { channels: 'Organic', value: 5 },
            ],
          ],
          `query t {
            series: fetch { channels @groupOn(where: { value: { gt: 0.5 } }, replacers: { channels: "Other" }) { value: sum(a: x) } }
            prevSeries: fetch { channels @groupOn(where: { value: { lt: 3 } }, replacers: { channels: "Other" }) { value: sum(a: x) } }
          }`,
        ),
      ).resolves.toEqual({
        series: [{ channels: 'Other', value: 4 }],
        prevSeries: [
          { channels: 'Other', value: 2 },
          { channels: 'Organic', value: 5 },
        ],
      })
    })
  })

  describe('@indexed', () => {
    const tables = [
      [
        { channels: 'Social', value: 1 },
        { channels: 'Organic', value: 3 },
      ],
      [
        { channels: 'Social', value: 2 },
        { channels: 'Organic', value: 5 },
      ],
    ]
    const expected = {
      series: [
        { channels: 'Social', value: 0.2 },
        { channels: 'Organic', value: 0.6 },
      ],
      prevSeries: [
        { channels: 'Social', value: 0.4 },
        { channels: 'Organic', value: 1 },
      ],
    }

    test('to: another query', async () => {
      await expect(
        run(
          tables,
          `query t {
            series: fetch { channels { value: sum(a: x) @indexed(to: prevSeries) } }
            prevSeries: fetch { channels { value: sum(a: x) @indexed(to: series) } }
          }`,
        ),
      ).resolves.toEqual(expected)
    })

    test('group: every node tagged with the group', async () => {
      await expect(
        run(
          tables,
          `query t {
            series: fetch { channels { value: sum(a: x) @indexed(group: first) } }
            prevSeries: fetch { channels { value: sum(a: x) @indexed(group: first) } }
          }`,
        ),
      ).resolves.toEqual(expected)
    })
  })

  describe('@omit', () => {
    test('keeps the value in baseline but not in the output', async () => {
      await expect(
        run(
          [
            [
              { channels: 'Social', value: 1, rank: 2 },
              { channels: 'Organic', value: 3, rank: 2 },
            ],
          ],
          `query t { fetch { channels { value: sum(a: x) @divide(byField: rank) rank @omit } } }`,
        ),
      ).resolves.toEqual([
        { channels: 'Social', value: 0.5 },
        { channels: 'Organic', value: 1.5 },
      ])
    })
  })

  describe('@include / @skip on a fetch', () => {
    test('drops the fetch and its statement', async () => {
      const sql = await sqlOf(`query t($flag: Bool) { a: fetch @include(if: $flag) { device { x: sum(a: x) } } b: fetch @skip(if: $flag) { device { y: sum(a: y) } } }`, {
        flag: false,
      })
      expect(sql).toHaveLength(1)
      expect(sql[0]).toContain('"y"')
    })
  })
})
