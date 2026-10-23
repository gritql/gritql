import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { gqlToDb } from './v3compat'

// Builds the SQL for a query and stops before any DB call.
const sqlOf = async (query: string) => {
  let sql
  await gqlToDb().beforeDbFetch((def) => {
    sql = def.sql
    return null
  })(query, {})

  return sql
}

const query = (body: string) => `query t { fetch { ${body} } }`

describe('metrics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('ranking', () => {
    test.each([
      ['denseRank', 'DENSE_RANK()'],
      ['rank', 'RANK()'],
      ['rowNumber', 'ROW_NUMBER()'],
    ])('alg %s', async (alg, fn) => {
      const sql = await sqlOf(
        query(`device { rank: ranking(a: sessions, alg: ${alg}) }`),
      )

      expect(sql[0]).toContain(fn)
      expect(sql).toMatchSnapshot()
    })

    test.each(['reverseDenseRank', 'reverseRank', 'reverseRowNumber'])(
      'alg %s builds a reverse CTE',
      async (alg) => {
        const sql = await sqlOf(
          query(`device { rank: ranking(a: sessions, alg: ${alg}) }`),
        )

        expect(sql[0]).toContain('"reverse_rank"')
        expect(sql).toMatchSnapshot()
      },
    )

    test('partitioned by a dimension', async () => {
      const sql = await sqlOf(
        query(`device { rank: ranking(a: sessions, by: device) }`),
      )

      expect(sql[0]).toContain('PARTITION BY "device"')
    })

    test('share partitioned by several dimensions', async () => {
      const sql = await sqlOf(
        query(
          `device { country { x: share(a: sessions, by: [device, country]) } }`,
        ),
      )

      expect(sql[0]).toContain('PARTITION BY "device", "country"')
    })
  })

  describe('full text search', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    test.each(['searchRanking', 'searchHeadline'])(
      '%s without a search filter throws',
      async (metric) => {
        await expect(
          sqlOf(query(`device { x: ${metric}(a: title) }`)),
        ).rejects.toThrow(/requires search query for/)
      },
    )
  })

  describe('plain selectors', () => {
    test('any', async () => {
      const sql = await sqlOf(query(`device { x: any(a: price) }`))

      expect(sql[0]).toContain('any("price") as "x"')
    })

    test('from', async () => {
      const sql = await sqlOf(
        query(`device { x: from(from: other_table, a: price) }`),
      )

      expect(sql[0]).toContain('"other_table"."price" as "x"')
    })

    test('distinct', async () => {
      const sql = await sqlOf(query(`x: distinct(limit: 5)`))

      expect(sql[0]).toContain('distinct "x"')
      expect(sql[0]).toContain('limit 5')
    })
  })

  describe('indexed', () => {
    test('alg first', async () => {
      const sql = await sqlOf(
        query(`device { x: indexed(a: sessions, alg: first) }`),
      )

      expect(sql[0]).toContain('first_value(sum("sessions")::float)')
    })

    test('default alg uses max', async () => {
      const sql = await sqlOf(query(`device { x: indexed(a: sessions) }`))

      expect(sql[0]).toContain('max(sum("sessions")::float)')
    })
  })

  describe('arithmetic metrics with `fn|field` syntax', () => {
    const cases: [string, string, string][] = [
      ['default sums both', 'a: sessions, by: users', '"sum"("sessions")'],
      ['custom functions', 'a: "count|sessions", by: "max|users"', '"count"("sessions")'],
      ['raw a', 'a: "|sessions", by: users', 'cast("sessions" as float)'],
      ['raw by', 'a: sessions, by: "|users"', 'cast("users" as float)'],
      ['raw both', 'a: "|sessions", by: "|users"', 'cast("sessions" as float)'],
    ]

    describe.each(['divide', 'subtract', 'diff'])('%s', (metric) => {
      test.each(cases)('%s', async (_, args, fragment) => {
        const sql = await sqlOf(query(`device { x: ${metric}(${args}) }`))

        expect(sql[0]).toContain(fragment)
        expect(sql).toMatchSnapshot()
      })
    })

    describe('multiply', () => {
      test.each(cases)('%s', async (_, args, fragment) => {
        const sql = await sqlOf(query(`device { x: multiply(${args}) }`))

        expect(sql[0]).toContain(fragment)
        expect(sql).toMatchSnapshot()
      })

      test('by a number', async () => {
        const sql = await sqlOf(query(`device { x: multiply(a: sessions, by: 2) }`))

        expect(sql[0]).toContain('cast("sum"("sessions") as float)*2::float4')
      })

      test('raw a by a number', async () => {
        const sql = await sqlOf(
          query(`device { x: multiply(a: "|sessions", by: 2) }`),
        )

        expect(sql[0]).toContain('cast("sessions" as float)*2::float4')
      })
    })
  })

  describe('averages', () => {
    test('aggrAverage', async () => {
      const sql = await sqlOf(
        query(`device { price: aggrAverage(to: sessions, by: users) }`),
      )

      expect(sql[0]).toContain('"price_aggrAverage"')
      expect(sql).toMatchSnapshot()
    })

    test('aggrAverage with to equal to by', async () => {
      const sql = await sqlOf(
        query(`device { price: aggrAverage(to: users, by: users) }`),
      )

      expect(sql).toMatchSnapshot()
    })

    test('weightAvg', async () => {
      const sql = await sqlOf(
        query(`device { x: weightAvg(a: price, by: users) }`),
      )

      expect(sql[0]).toContain('"weightAvg"')
      expect(sql).toMatchSnapshot()
    })
  })

  describe('argument validation', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    test('metric with required arguments and none given', async () => {
      await expect(sqlOf(query(`device { x: divide }`))).rejects.toThrow(
        /`a` is marked as required in `divide`/,
      )
    })

    test('wrong argument type', async () => {
      await expect(
        sqlOf(query(`device { x: multiply(a: sessions, by: [1]) }`)),
      ).rejects.toThrow(/Failed arguments type/)
    })

    test('unknown enum value', async () => {
      await expect(
        sqlOf(query(`device { x: indexed(a: sessions, alg: nope) }`)),
      ).rejects.toThrow(/Failed arguments type/)
    })
  })
})
