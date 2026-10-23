// Make this file a module so test helpers do not clash across files
export {}
//@ts-ignore
const { gqlToDb } = require('../gql-sql-slicer')
//@ts-ignore
const { DateTime } = require('luxon')

// Runs a query whose `a` metric carries the given directives and reports
// whether `a` survived into the generated SQL.
const isIncluded = async (directives: string) => {
  let sql
  const querier = gqlToDb()
    .beforeDbFetch((def) => {
      sql = def.sql.join('\n')
      return def
    })
    .dbFetch(() => [[{ device: 'mobile', a: 1, b: 2 }]])

  await querier(
    `query t { fetch { device { a: sum(a: x) ${directives} b: sum(a: y) } } }`,
    {},
  )

  return sql.includes('AS "a"')
}

const silenceConsole = () => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
}

describe('directives', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

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
      expect(
        await isIncluded(`@compare(value: ${value}, ${op}: ${arg}) @include`),
      ).toBe(expected)
    })

    test('chains several operators', async () => {
      expect(await isIncluded('@compare(value: 5, gt: 1, lt: 10) @include')).toBe(
        true,
      )
      expect(await isIncluded('@compare(value: 5, gt: 1, eq: 6) @include')).toBe(
        false,
      )
    })

    test('chained operators all compare the original value', async () => {
      expect(await isIncluded('@compare(value: 5, gt: 1, lt: 3) @include')).toBe(
        false,
      )
    })

    test('result of @compare drives @skip', async () => {
      expect(await isIncluded('@compare(value: 5, eq: 5) @skip')).toBe(false)
      expect(await isIncluded('@compare(value: 5, eq: 6) @skip')).toBe(true)
    })

    test('takes value from variables', async () => {
      let sql
      const querier = gqlToDb()
        .beforeDbFetch((def) => {
          sql = def.sql.join('\n')
          return def
        })
        .dbFetch(() => [[{ device: 'mobile', b: 2 }]])

      await querier(
        `query t($v: Number!) { fetch { device { a: sum(a: x) @compare(value: $v, in: [1, 2]) @include b: sum(a: y) } } }`,
        { v: 3 },
      )

      expect(sql).not.toContain('AS "a"')
    })
  })

  describe('pre-executed directive errors', () => {
    beforeEach(silenceConsole)

    test.each([
      ['@compare(eq: 5)', /requires `value` argument/],
      ['@compare(value: 5)', /at least one argument/],
      ['@compare(value: 5, foo: 1)', /Can't find resolver for 'foo'/],
      ['@compare(value: 5, in: 5)', /Argument `in` or value must be an array/],
      ['@compare(value: 5, nin: 5)', /Argument `nin` or value must be an array/],
      ['@compare(value: 5, of: [5])', /Value must be an array/],
      ['@include(foo: true)', /Include directive requires `if` argument/],
      ['@skip(foo: true)', /Skip directive requires `if` argument/],
    ])('%s throws', async (directive, message) => {
      await expect(isIncluded(directive)).rejects.toThrow(message)
    })
  })

  describe('post-executed directive errors', () => {
    beforeEach(silenceConsole)

    test.each([
      ['@diff', /Diff directive requires 'by' argument/],
      ['@subtract', /Subtract directive requires 'by' argument/],
      ['@indexed', /requires 'to' or 'group' argument/],
      ['@indexed(to: x, group: y)', /only 'to' or 'group' argument at once/],
      ['@divide', /requires 'by' or 'byField' argument/],
      ['@parse', /Parse directive requires `as` argument/],
    ])('%s throws', async (directive, message) => {
      await expect(isIncluded(directive)).rejects.toThrow(message)
    })

    test.each([
      [
        '@groupOn(replacers: { device: "x" })',
        /requires at least one grouping condition/,
      ],
      ['@groupBy(foo: x)', /GroupBy directive requires 'by' argument/],
    ])('%s on a dimension throws', async (directive, message) => {
      const querier = gqlToDb().dbFetch(() => [[]])

      await expect(
        querier(`query t { fetch { device ${directive} { a: sum(a: x) } } }`, {}),
      ).rejects.toThrow(message)
    })
  })

  describe('@parse', () => {
    const run = (field: string, rows: any[]) =>
      gqlToDb().dbFetch(() => [rows])(`query t { fetch { ${field} } }`, {})

    test('int on a metric', async () => {
      const result = await run(
        'device { a: sum(a: x) @parse(as: "int") }',
        [{ device: 'mobile', a: '42.7' }],
      )

      expect(result).toEqual({ mobile: { a: 42 } })
    })

    test('int with radix on a metric', async () => {
      const result = await run(
        'device { a: sum(a: x) @parse(as: "int:16") }',
        [{ device: 'mobile', a: 'ff' }],
      )

      expect(result).toEqual({ mobile: { a: 255 } })
    })

    test('float with precision on a metric', async () => {
      const result = await run(
        'device { a: sum(a: x) @parse(as: "float:2") }',
        [{ device: 'mobile', a: '1.23456' }],
      )

      expect(result).toEqual({ mobile: { a: '1.23' } })
    })

    // `iso` and `iso-time` carry the machine's UTC offset, so luxon is the oracle.
    const sqlDate = DateTime.fromSQL('2022-01-06 01:00:00')

    test.each([
      ['date', sqlDate.toISO()],
      ['date:iso-date', '2022-01-06'],
      ['date:iso-time', sqlDate.toISOTime()],
      ['date:iso-week-date', '2022-W01-4'],
      ['date:format:yyyy/MM', '2022/01'],
    ])('%s on a dimension', async (as, expected) => {
      const result = await run(
        `date(type: Array) @parse(as: "${as}") { a: sum(a: x) }`,
        [{ date: '2022-01-06 01:00:00', a: 1 }],
      )

      expect(result).toEqual([{ date: expected, a: 1 }])
    })

    test('accepts Date objects and ISO strings', async () => {
      const result = await run(
        `date(type: Array) @parse(as: "date:iso-date") { a: sum(a: x) }`,
        [
          { date: new Date('2022-01-06T12:00:00Z'), a: 1 },
          { date: '2022-01-07T12:00:00Z', a: 2 },
        ],
      )

      expect(result).toEqual([
        { date: '2022-01-06', a: 1 },
        { date: '2022-01-07', a: 2 },
      ])
    })

    test('on a dimension with several metrics parses the row once', async () => {
      const result = await run(
        `date(type: Array) @parse(as: "date:iso-date") { a: sum(a: x) b: sum(a: y) }`,
        [
          { date: '2022-01-06 01:00:00', a: 1, b: 2 },
          { date: '2022-01-07 01:00:00', a: 3, b: 4 },
        ],
      )

      expect(result).toEqual([
        { date: '2022-01-06', a: 1, b: 2 },
        { date: '2022-01-07', a: 3, b: 4 },
      ])
    })
  })

  describe('@groupBy', () => {
    test('groups dates by month and sums metrics', async () => {
      const result = await gqlToDb().dbFetch(() => [
        [
          { date: '2022-01-06', a: 1 },
          { date: '2022-01-20', a: 2 },
          { date: '2022-02-03', a: 4 },
        ],
      ])(
        `query t { fetch { date(type: Array) @groupBy(by: month) { a: sum(a: x) } } }`,
        {},
      )

      expect(result).toEqual([
        { date: '2022-01-01', a: 3 },
        { date: '2022-02-01', a: 4 },
      ])
    })
  })
})
