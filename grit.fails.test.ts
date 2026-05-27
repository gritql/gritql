//@ts-ignore
const { gqlToDb, gqlBuild } = require('./gql-sql-slicer')
describe('SQL', () => {
  describe('failed with $#@# instead of .', () => {
    test('should correctly return names with dots inside like test.com.us', () => {
      const table = [
        [
          {
            domain: 'test.com',
            value: '101',
          },
          {
            domain: 'test2.com',
            value: '107',
          },
          {
            domain: 'test.com.us',
            value: '201',
          },
          {
            domain: 'test.com.ua',
            value: '207',
          },
        ],
      ]

      const querier = gqlToDb()
        .beforeDbFetch(({ sql }) => {
          expect(sql).toMatchSnapshot()
          return { sql }
        })
        .dbFetch(() => {
          return table
        })

      return Promise.resolve(
        querier(
          `input Date {
          gte: String!
          lte: String!
        }
        
        input Date {
          gte: String!
          lte: String!
        }
        
        input OrArray {
          in: [String]
        }
        
        input Filters {
          country: String
          category: OrArray
          domain: OrArray!
          date: Date!
        }
        
        query ii_transactional($filters: Filters) {
          matrix: fetch(filters: $filters) {
            domain(type:Array, sort_desc: revenue, limit: 10){
              value: sum(a:transactionrevenue)
            }
          }
        }`,
          {
            filters: {
              country: 'US',
              domain: {
                in: ['test.com', 'test2.com'],
              },
              date: {
                gte: '2022-01-05',
                lte: '2022-01-08',
              },
            },
          },
        ),
      ).then((result) => {
        expect(result).toMatchSnapshot()
      })
    })
  })
  describe('doesnt merge queries with same id from different queries', () => {
    test('should merge object correctly if id matches', () => {
      const table = [
        [
          {
            date: '1',
            value: '101',
          },
          {
            date: '2',
            value: '107',
          },
          {
            date: '3',
            value: '201',
          },
          {
            date: '4',
            value: '207',
          },
        ],
        [
          {
            date: '1',
            value1: '1011',
          },
          {
            date: '2',
            value1: '1071',
          },
          {
            date: '3',
            value1: '2011',
          },
          {
            date: '4',
            value1: '2071',
          },
        ],
      ]

      const querier = gqlToDb()
        .beforeDbFetch(({ sql }) => {
          expect(sql).toMatchSnapshot()
          return { sql }
        })
        .dbFetch(() => {
          return table
        })

      return Promise.resolve(
        querier(
          `input Date {
          gte: String!
          lte: String!
        }
        
        input Date {
          gte: String!
          lte: String!
        }
        
        input OrArray {
          in: [String]
        }
        
        input Filters {
          country: String
          category: OrArray
          domain: OrArray!
          date: Date!
        }
        
        query ii_transactional($filters: Filters) {
          matrix: fetch(filters: $filters) {
            date(type:Array, sort_desc: revenue, limit: 10){
              value: sum(a:transactionrevenue)
            }
          }

        }
        query ii_transactionalb($filters: Filters) {
          matrix: fetch(filters: $filters) {
            date(type:Array, sort_desc: revenue, limit: 10){
              value1: sum(a:transactionrevenue)
            }
          }
        }`,
          {
            filters: {
              country: 'US',
              domain: {
                in: ['test.com', 'test2.com'],
              },
              date: {
                gte: '2022-01-05',
                lte: '2022-01-08',
              },
            },
          },
        ),
      ).then((result) => {
        expect(result).toMatchSnapshot()
      })
    })
  })

  describe('three queries with shared sales_channel dimension', () => {
    test('CDR online rows must not be aliased into offline group after prior CHR query', () => {
      // Three queries — channelRevenue (CHR), channelDomainRevenue (CDR),
      // channelTimeseries (CHTS) — share a sales_channel dimension.
      //
      // Bug repro from prod: when CDR returns rows sorted by revenue desc
      // (so sales_channel values are interleaved, not grouped), online rows
      // get merged into the offline group instead of forming their own.
      //
      // We feed gritql three flat result arrays, one per query, and assert
      // the structure of the merged response.
      // Order matches prod: CHR returns unsorted from ClickHouse and the
      // channels happen to arrive as [online, amazon, offline]. The bug
      // surfaces only when this order doesn't match CDR's first-arrival
      // order (which, after sort_desc: revenue, starts with offline).
      const chr = [
        { sales_channel: 'online', revenue: '67830000' },
        { sales_channel: 'amazon', revenue: '383000000' },
        { sales_channel: 'offline', revenue: '532000000' },
      ]
      const cdr = [
        { sales_channel: 'offline', domain: 'bestbuy.com', revenue: '518000000' },
        { sales_channel: 'amazon', domain: 'amazon.com', revenue: '383000000' },
        { sales_channel: 'online', domain: 'newegg.com', revenue: '65490000' },
        { sales_channel: 'offline', domain: 'lowes.com', revenue: '13650000' },
        { sales_channel: 'online', domain: 'lowes.com', revenue: '1810000' },
        { sales_channel: 'online', domain: 'homedepot.com', revenue: '530000' },
        { sales_channel: 'offline', domain: 'officedepot.com', revenue: '310000' },
      ]
      const chts = [
        { month: '2026-01-01', sales_channel: 'offline', revenue: '120000000' },
        { month: '2026-01-01', sales_channel: 'amazon', revenue: '90000000' },
        { month: '2026-01-01', sales_channel: 'online', revenue: '15000000' },
      ]

      const querier = gqlToDb().dbFetch(() => [chr, cdr, chts])

      return querier(
        `input DateRange { gte: String! lte: String! }
         input BrandFilters { brand: String! month: DateRange }

         query a($table: String!, $filters: BrandFilters) {
           channelRevenue: fetch(table: $table, filters: $filters) {
             sales_channel(type: Array) {
               revenue: sum(a: total_revenue)
             }
           }
         }
         query b($table: String!, $filters: BrandFilters) {
           channelDomainRevenue: fetch(table: $table, filters: $filters) {
             sales_channel(type: Array) {
               domain(type: Array, sort_desc: revenue) {
                 revenue: sum(a: total_revenue)
               }
             }
           }
         }
         query c($table: String!, $trendFilters: BrandFilters) {
           channelTimeseries: fetch(table: $table, filters: $trendFilters) {
             month(type: Array, sort_asc: month) {
               sales_channel(type: Array) {
                 revenue: sum(a: total_revenue)
               }
             }
           }
         }`,
        {
          table: 'reports.brand_seo_pages_report',
          filters: { brand: 'Samsung', month: { gte: '2026-01-01', lte: '2026-04-30' } },
          trendFilters: { brand: 'Samsung', month: { gte: '2025-12-01', lte: '2026-04-30' } },
        },
      ).then((result) => {
        const channels = result.channelDomainRevenue
          .map((c: any) => c.sales_channel)
          .sort()
        expect(channels).toEqual(['amazon', 'offline', 'online'])

        const online = result.channelDomainRevenue.find(
          (c: any) => c.sales_channel === 'online',
        )
        const onlineDomains = online.domain.map((d: any) => d.domain).sort()
        expect(onlineDomains).toEqual(['homedepot.com', 'lowes.com', 'newegg.com'])

        const offline = result.channelDomainRevenue.find(
          (c: any) => c.sales_channel === 'offline',
        )
        const offlineDomains = offline.domain.map((d: any) => d.domain).sort()
        expect(offlineDomains).toEqual(['bestbuy.com', 'lowes.com', 'officedepot.com'])
      })
    })
  })
})

xdescribe('directive', () => {
  describe('parse doesnt work for date field', () => {
    test('should correctly parse date', () => {
      const table = [
        [
          {
            date: 'Thu Jan 06 2022 01:00:00 GMT+0100 (Central European Standard Time)',
            value: '101',
          },
          {
            date: 'Thu Jan 07 2022 01:00:00 GMT+0100 (Central European Standard Time)',
            value: '102',
          },
          {
            date: 'Thu Jan 08 2022 01:00:00 GMT+0100 (Central European Standard Time)',
            value: '103',
          },
        ],
      ]

      const querier = gqlToDb()
        .beforeDbFetch(({ sql }) => {
          expect(sql).toMatchSnapshot()
          return { sql }
        })
        .dbFetch(() => {
          return table
        })

      return Promise.resolve(
        querier(
          `input Date {
          gte: String!
          lte: String!
        }
        
        input Date {
          gte: String!
          lte: String!
        }
        
        input OrArray {
          in: [String]
        }
        
        input Filters {
          country: String
          category: OrArray
          domain: OrArray!
          date: Date!
        }
        
        query ii_transactional($filters: Filters) {
          matrix: fetch(filters: $filters) {
            date(type:Array, sort_desc: date) @parse(as: "date:iso"){
              value: sum(a:transactionrevenue)
            }
          }
        }`,
          {
            filters: {
              country: 'US',
              domain: {
                in: ['test.com', 'test2.com'],
              },
              date: {
                gte: '2022-01-05',
                lte: '2022-01-08',
              },
            },
          },
        ),
      ).then((result) => {
        expect(result).toMatchSnapshot()
      })
    })
  })
})
