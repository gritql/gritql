// Make this file a module so test helpers do not clash across files
export {}
//@ts-ignore
const { gqlToDb } = require('../gql-sql-slicer')
//@ts-ignore
const { providers, disableArgumentFor, disableOperationFor } = require('../providers')

const query = `query t { fetch { device { value: sum(a: sessions) } } }`
const rows = [{ device: 'mobile', value: 1 }]

// A knex-backed provider that records what gets executed.
const customProvider = (overrides = {}) => ({
  keywords: [...providers.pg.keywords],
  queryBuilder: 'knex',
  getQueryBuilder: providers.pg.getQueryBuilder,
  getQueryPromise: providers.pg.getQueryPromise,
  getConnector: () => null,
  getConnection: () => null,
  connection: { name: 'conn' },
  execute: jest.fn((..._: any[]) => Promise.resolve(rows)),
  ...overrides,
})

describe('providers', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('default db handler', () => {
    test('pg rejects until setupProvider is called', async () => {
      await expect(gqlToDb()(query, {})).rejects.toThrow(
        /Provider isn't configured yet/,
      )
    })

    test('runs a custom provider through useProvider', async () => {
      const provider = customProvider()
      const querier = gqlToDb()
      querier.useProvider('custom', provider)

      const result = await querier(query, {}, 'custom')

      expect(provider.execute).toHaveBeenCalledTimes(1)
      const [connection, sql] = provider.execute.mock.calls[0]
      expect(connection).toEqual({ name: 'conn' })
      expect(sql.toString()).toContain('SUM("sessions")')
      expect(result).toEqual({ mobile: { value: 1 } })
    })

    test('passes the query through prepare when defined', async () => {
      const provider = customProvider({
        prepare: (q, promise) => ({ prepared: promise.toString() }),
      })
      const querier = gqlToDb()
      querier.useProvider('custom', provider)

      await querier(query, {}, 'custom')

      expect(provider.execute.mock.calls[0][1]).toEqual({
        prepared: expect.stringContaining('SUM("sessions")'),
      })
    })

    test('setupProvider wires connector and connection', async () => {
      const unsafe = jest.fn(() => Promise.resolve(rows))
      const connector = jest.fn(() => ({ unsafe }))
      const querier = gqlToDb()
      querier.useProvider('pg', { getConnector: () => connector })
      querier.setupProvider('pg', {
        connection: { connectionString: 'postgres://x' },
      })

      const result = await querier(query, {})

      expect(connector).toHaveBeenCalledWith('postgres://x', { max: 20 })
      expect(unsafe).toHaveBeenCalledWith(
        expect.stringContaining('SUM("sessions")'),
        [],
      )
      expect(result).toEqual({ mobile: { value: 1 } })
    })

    test('provider without the needed keywords rejects the metric', async () => {
      const querier = gqlToDb()
      querier.useProvider('bare', customProvider({ keywords: [] }))

      await expect(querier(query, {}, 'bare')).rejects.toThrow(
        /bare provider doesn't support sum metric/,
      )
    })
  })

  describe('pg.getConnection', () => {
    test('uses the connection string when given', () => {
      const connector = jest.fn()
      providers.pg.getConnection(
        { connection: { connectionString: 'postgres://x' }, pool: { max: 5 } },
        connector,
      )

      expect(connector).toHaveBeenCalledWith('postgres://x', { max: 5 })
    })

    test('spreads connection options otherwise', () => {
      const connector = jest.fn()
      providers.pg.getConnection(
        { connection: { host: 'h', database: 'd' } },
        connector,
      )

      expect(connector).toHaveBeenCalledWith({ host: 'h', database: 'd', max: 20 })
    })
  })

  describe('snowflake', () => {
    test('getConnection creates a pool', () => {
      const connector = { createPool: jest.fn(() => 'pool') }

      const pool = providers.snowflake.getConnection(
        { connection: { account: 'a' } },
        connector,
      )

      expect(pool).toBe('pool')
      expect(connector.createPool).toHaveBeenCalledWith(
        { account: 'a' },
        { min: 0, max: 20 },
      )
    })

    test('execute resolves rows from the client', async () => {
      const client = {
        execute: ({ complete }) => complete(null, null, rows),
      }
      const connection = { use: (fn) => fn(client) }
      const sql = { toSQL: () => ({ sql: 'select 1', bindings: [] }) }

      await expect(providers.snowflake.execute(connection, sql)).resolves.toEqual(
        rows,
      )
    })

    test('execute rejects on error', async () => {
      const client = {
        execute: ({ complete }) => complete(new Error('boom'), null, null),
      }
      const connection = { use: (fn) => fn(client) }
      const sql = { toSQL: () => ({ sql: 'select 1', bindings: [] }) }

      await expect(providers.snowflake.execute(connection, sql)).rejects.toThrow(
        'boom',
      )
    })

    test('execute requires a configured connection', () => {
      expect(() => providers.snowflake.execute(null, null)).toThrow(
        /Provider isn't configured yet/,
      )
    })
  })

  describe('ga', () => {
    test('prepare formats dimensions, metrics and sort', async () => {
      const prepared = await providers.ga.prepare(
        {
          dimensions: ['date', 'date', 'country'],
          metrics: ['sessions'],
          orderBys: ['-sessions', 'date'],
        },
        Promise.resolve(),
      )

      expect(prepared).toEqual({
        dimensions: 'ga:date,ga:country',
        metrics: 'ga:sessions',
        sort: '-ga:sessions,ga:date',
      })
    })

    test('prepare leaves sort undefined without orderBys', async () => {
      const prepared = await providers.ga.prepare(
        { dimensions: [], metrics: ['sessions'] },
        Promise.resolve(),
      )

      expect(prepared.sort).toBeUndefined()
    })

    test('postTransform maps a report into rows', () => {
      const result = providers.ga.postTransform({
        data: {
          data: {
            gapiReport: {
              columnHeader: {
                dimensions: ['ga:date'],
                metricHeader: { metricHeaderEntries: [{ name: 'ga:sessions' }] },
              },
              data: {
                rows: [{ dimensions: ['20220101'], metrics: [{ values: ['5'] }] }],
              },
            },
          },
        },
      })

      expect(result).toEqual([{ date: '20220101', sessions: '5' }])
    })

    test('postTransform throws the first error', () => {
      expect(() =>
        providers.ga.postTransform({
          data: {
            data: {},
            errors: [
              {
                message: 'outer',
                extensions: {
                  googleAnalyticsError: [{ reason: 'quota', message: 'inner' }],
                },
              },
            ],
          },
        }),
      ).toThrow('quota: inner')
    })

    test('getFiltersResolver merges filters into the payload', async () => {
      const resolve = providers.ga.getFiltersResolver([
        ['start_date', '=', '2022-01-01'],
        ['end_date', '=', '2022-01-31'],
      ])

      await expect(resolve(Promise.resolve({ metrics: 'ga:x' }))).resolves.toEqual({
        metrics: 'ga:x',
        'start-date': '2022-01-01',
        'end-date': '2022-01-31',
      })
    })

    test.each(['getConnector', 'getConnection', 'execute'])(
      '%s must be implemented by the integration',
      (method) => {
        expect(() => providers.ga[method]()).toThrow(/Must be implemented/)
      },
    )
  })

  describe('guards', () => {
    test('disableArgumentFor throws only for the named provider', () => {
      expect(() => disableArgumentFor({ provider: 'ga' }, 'table', 'ga')).toThrow(
        /ga provider doesn't support 'table' argument/,
      )
      expect(() =>
        disableArgumentFor({ provider: 'pg' }, 'table', 'ga'),
      ).not.toThrow()
    })

    test('disableOperationFor throws only for the named provider', () => {
      expect(() => disableOperationFor({ provider: 'ga' }, 'with', 'ga')).toThrow(
        /ga provider doesn't support 'with' operation/,
      )
      expect(() =>
        disableOperationFor({ provider: 'pg' }, 'with', 'ga'),
      ).not.toThrow()
    })
  })
})
