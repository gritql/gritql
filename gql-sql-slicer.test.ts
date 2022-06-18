const { gqlToDb, gqlBuild } = require('./gql-sql-slicer')

describe('SQL', () => {
  describe('variables && types', () => {
    test('input type must be traited as exact object type', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(
        `
      input Date {
        gt: String!
        lt: String!
      }

      input Filters {
        brand: String!
        country: String!
        date: Date
      }

      query table($filters: Filters) {
        fetch(filters: $filters) {
          value: sum(a:pageviews)
        }
      }
    `,
        {
          filters: {
            brand: 'Adidas',
            date: {
              gt: '2021-01-01',
              lt: '2022-01-01',
            },
            country: 'US',
          },
        },
      )
    })

    test('list type must be traited as array type', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(
        `
      input Date {
        gt: String!
        lt: String!
      }

      input Filters {
        brand: String!
        country: String!
        date: Date
        categories: [Number!]!
      }

      query table($filters: Filters, $brand: [String!]!) {
        fetch(filters: $filters) {
          value: sum(a:pageviews)
        }
      }
    `,
        {
          filters: {
            brand: 'Adidas',
            date: {
              gt: '2021-01-01',
              lt: '2022-01-01',
            },
            country: 'US',
            categories: [1, 11, 6],
          },
          brand: ['Adidas', 'Nike'],
        },
      )
    })

    test('type must be traited as shape object type', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(
        `
      type Date {
        gt: String!
        lt: String!
      }
  
      type Filters {
        brand: String!
        country: String!
        date: Date
      }
  
      query table($filters: Filters) {
        fetch(filters: $filters) {
          value: sum(a:pageviews)
        }
      }
    `,
        {
          filters: {
            brand: 'Adidas',
            date: {
              gt: '2021-01-01',
              lt: '2022-01-01',
            },
            country: 'US',
          },
        },
      )
    })

    test('Union type', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(
        `
      type Date1 {
        gt: String!
        lt: String!
      }

      type Date2 {
        gte: String!
        lte: String!
      }

      union Date = Date1 | Date2
  
      type Filters {
        brand: String!
        country: String!
        date: Date
      }
  
      query table($filters: Filters) {
        fetch(filters: $filters) {
          value: sum(a:pageviews)
        }
      }
    `,
        {
          filters: {
            brand: 'Adidas',
            date: {
              gt: '2021-01-01',
              lt: '2022-01-01',
            },
            country: 'US',
          },
        },
      )
    })
  })

  describe('fragments', () => {
    test('Simple fragment', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(
        `
      type Date {
        gt: String!
        lt: String!
      }
  
      type Filters {
        brand: String!
        country: String!
        date: Date
      }

      fragment AbsoluteAndShareByDate on Any {
        date(type: Array) {
          value: sum(a:pageviews)
          share: share(a:pageviews)
        }
      }
  
      query table($filters: Filters) {
        fetch(filters: $filters) {
          ...AbsoluteAndShareByDate
        }
      }
    `,
        {
          filters: {
            brand: 'Adidas',
            date: {
              gt: '2021-01-01',
              lt: '2022-01-01',
            },
            country: 'US',
          },
        },
      )
    })

    test('Fragment with arguments', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(
        `
      type Date {
        gt: String!
        lt: String!
      }
  
      type Filters {
        brand: String!
        country: String!
        date: Date
      }

      fragment AbsoluteAndShareByDate($a: String!) on Any {
        date(type: Array) {
          value: sum(a:$a)
          share: share(a:$a)
        }
      }
  
      query table($filters: Filters) {
        fetch(filters: $filters) {
          use(fragment: AbsoluteAndShareByDate, a:pageviews)
        }
      }
    `,
        {
          filters: {
            brand: 'Adidas',
            date: {
              gt: '2021-01-01',
              lt: '2022-01-01',
            },
            country: 'US',
          },
        },
      )
    })
  })

  describe('builder for mulyquery requests', () => {
    test('mixing the object', () => {
      const table = [
        [
          {
            device: 'mobile',
            no_baskets: '1070',
          },
          {
            device: 'desktop',
            no_baskets: '2010',
          },
        ],
        [
          {
            device: 'mobile',
            date: '2020-01-01T23:00:00.000Z',
            no_baskets: '101',
          },
          {
            device: 'mobile',
            date: '2020-01-02T23:00:00.000Z',
            no_baskets: '107',
          },
          {
            device: 'desktop',
            date: '2020-01-01T23:00:00.000Z',
            no_baskets: '201',
          },
          {
            device: 'desktop',
            date: '2020-01-02T23:00:00.000Z',
            no_baskets: '207',
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(({ definitions }) => {
        return table
      })

      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          no_baskets: sum(a: no_baskets)
          date(type: Array){
            no_baskets: sum(a: no_baskets)
          }
        }
      }
    }
    `).then((result) => expect(result).toMatchSnapshot())
    })
    test('two queries to object', () => {
      const table = [
        [
          {
            device: 'mobile',
            date: '2020-01-01T23:00:00.000Z',
            no_baskets: '101',
          },
          {
            device: 'mobile',
            date: '2020-01-02T23:00:00.000Z',
            no_baskets: '107',
          },
          {
            device: 'desktop',
            date: '2020-01-01T23:00:00.000Z',
            no_baskets: '201',
          },
          {
            device: 'desktop',
            date: '2020-01-02T23:00:00.000Z',
            no_baskets: '207',
          },
        ],
        [
          {
            device: 'mobile',
            no_baskets: '1070',
          },
          {
            device: 'desktop',
            no_baskets: '2010',
          },
        ],
      ]

      const querier = gqlToDb().dbFetch(({ definitions }) => {
        return table
      })

      return querier(`query table{
      byDate: fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array){
            no_baskets: sum(a:no_baskets)
          }
        }
      }
    }
    {
      byDevice: fetch(brand: Amd, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          no_baskets: sum(a:no_baskets)
        }
      }
    }
    `).then((result) => expect(result).toMatchSnapshot())
    })

    test('basic example works', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(`query table{
      query1: fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array) {
            no_baskets: sum(a:no_baskets)
            no_all_baskets: sum(a:no_all_baskets)
            no_unique_products: sum(a:no_unique_products)
          }
          ano_no_baskets: sum(a:ano_no_baskets)
          ano_no_all_baskets: sum(a:ano_no_all_baskets)
          ano_no_unique_products: sum(a:ano_no_unique_products) 
        }
      }
      
    }
 
    `)
    })

    test('complex queries using with example works', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(`query table {
        productQuery: with(filters: { date: { gte: "2021-12-13", lte: "2022-01-09" }, price: { gte: 10 }, country: "DE", category: { in: ["Clothes", "Fashion"], nin: ["Bags"] } }) {
              join(table: table_catalog, on: { product: "@product", country: "@country" }) {
                  product (type: Array, from: table, sort_desc: value) {
                      value: sum(a:value)
                      price: unique(a:price, from: table_catalog)
                      brand: unique(a:brand, from: table_catalog)
                  }
              }
      }
      all: fetch(table: productQuery) {
          brand(type: Array, sort_desc: marketShare, limit: 10) {
              price: percentile(a:price)
              brand
              marketShare: share(a:value)
          }
          count: countDistinct(a:brand)
      }
    }
 
    `)
    })

    test('join using by argument', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(`query table {
        productQuery: with(filters: { date: { gte: "2021-12-13", lte: "2022-01-09" }, price: { gte: 10 }, country: "DE", category: { in: ["Clothes", "Fashion"], nin: ["Bags"] } }) {
              join(table: table_catalog, by: "@product:@product", by: "@country:@country") {
                  product (type: Array, from: table, sort_desc: value) {
                      value: sum(a:value)
                      price: unique(a:price, from: table_catalog)
                      brand: unique(a:brand, from: table_catalog)
                  }
              }
      }
    }
 
    `)
    })

    test('two queries', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
    query1: fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
      device {
        date(type: Array) {
          no_baskets: sum(a:no_baskets)
          no_all_baskets: sum(a:no_all_baskets)
          no_unique_products: sum(a:no_unique_products)
        }
        ano_no_baskets: sum(a:ano_no_baskets)
        ano_no_all_baskets: sum(a:ano_no_all_baskets)
        ano_no_unique_products: sum(a:ano_no_unique_products) 
      }
    }
    
  }
  query table{
    fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
      device {
        date(type: Array) {
          no_brand_products: sum(a:no_brand_products)
          no_uniqie_brand_products: sum(a:no_uniqie_brand_products)
          total_revenue: sum(a:total_revenue)
          brand_revenue: sum(a:brand_revenue)
        }
      }
    }
  }
  `)
    })
    test('basic example works', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          avg: divide(a:no_of_baskets, by:no_all_baskets) 
          date(type: Array) {
            avg: divide(a:no_of_baskets, by:no_all_baskets) 
          }
        }
      }
      
    }
 
    `)
    })

    test('combine example', () => {
      const querier = gqlToDb()
        .beforeDbFetch(({ sql }) => {
          expect(sql).toMatchSnapshot()
        })
        .dbFetch(() => {
          return [
            {
              device: 'mobile',
              channel: 'Social',
              avg: 2,
            },
            {
              device: 'desktop',
              channel: 'Social',
              avg: 1.5,
            },
            {
              device: 'mobile',
              channel: 'Organic',
              avg: 1,
            },
          ]
        })
      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        combine(fields: [{ name: "device" }, { name: "channel" }]) {
          avg: divide(a:no_of_baskets, by:no_all_baskets) 
        }
      }
    }
 
    `)
    })

    test('basic example works', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        custom_name: device
      }
    }
    `)
    })
  })

  describe('gqlBuilder single query', () => {
    test('distinct', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
      fetch{
        device: distinct
      }
    }
    `)
    })

    test('Search query example works', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(`query table {
      fetch(filters: { search: { brand: "Adidas", title: "T-shirt" }}) {
          brand(type: Array, sort_desc: marketShare, limit: 10) {
              title: unique(a:title) @omit
              headlineTitle: searchHeadline(a:title)
              rankingTitle: searchRanking(a:title)
              headlineBrand: searchHeadline(a:brand)
              rankingBrand: searchRanking(a:brand)
          }
      }
    }
 
    `)
    })

    test('Search query using basic filters example works', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(`query table {
      fetch(search: { brand: "Adidas", title: "T-shirt" }) {
          brand(type: Array, sort_desc: marketShare, limit: 10) {
              title: unique(a:title) @omit
              headlineTitle: searchHeadline(a:title)
              rankingTitle: searchRanking(a:title)
              headlineBrand: searchHeadline(a:brand)
              rankingBrand: searchRanking(a:brand)
          }
      }
    }
 
    `)
    })

    test('Basic filters example works', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(`query table {
      fetch(brand_like: "adidas%", category_in: "1|11|12", date_lte: "2022-01-01", date_gte: "2021-01-01", price_gt: 126, price_lt: 220) {
          brand(type: Array, sort_desc: marketShare, limit: 10) {
              title: unique(a:title)
          }
      }
    }
 
    `)
    })

    test('Search filter should work only with pg', async () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      try {
        return await querier(
          `query table {
      fetch(filters: { search: { brand: "Adidas", title: "T-shirt" }}) {
          brand(type: Array, sort_desc: marketShare, limit: 10) {
              title: unique(a:title) @omit
              headlineTitle: searchHeadline(a:title)
              rankingTitle: searchRanking(a:title)
              headlineBrand: searchHeadline(a:brand)
              rankingBrand: searchRanking(a:brand)
          }
      }
    }
 
    `,
          {},
          'snowflake',
        )
      } catch (e) {
        expect(e).toMatchSnapshot()
      }
    })

    test('Search metrics should work only with pg', async () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      try {
        return await querier(
          `query table {
      fetch {
          brand(type: Array, sort_desc: marketShare, limit: 10) {
              title: unique(a:title) @omit
              headlineTitle: searchHeadline(a:title)
              rankingTitle: searchRanking(a:title)
              headlineBrand: searchHeadline(a:brand)
              rankingBrand: searchRanking(a:brand)
          }
      }
    }
 
    `,
          {},
          'snowflake',
        )
      } catch (e) {
        expect(e).toMatchSnapshot()
      }
    })

    test('percentile', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
      fetch{
        median: percentile(a:price)
      }
    }
    `)
    })

    test('median', () => {
      const querier = gqlToDb()
        .beforeDbFetch(({ sql }) => {
          expect(sql).toMatchSnapshot()
        })
        .dbFetch(() => {
          return {
            median: 0,
          }
        })
      return querier(
        `query table{
      fetch{
        median: median(a:price)
      }
    }
    `,
        {},
        'snowflake',
      )
    })

    test('percentile shouldn\'t run without "a" parameters', async () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      try {
        return await querier(`query table{
      fetch{
        median: percentile(by: price)
      }
    }
    `)
      } catch (e) {
        expect(e).toMatchSnapshot()
      }
    })

    test('ranking', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
      fetch{
        rank: ranking(a:price)
      }
    }
    `)
    })

    test('basic example works', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array) {
            no_baskets: sum(a:no_baskets)
            no_all_baskets: sum(a:no_all_baskets)
            no_unique_products: sum(a:no_unique_products)
            no_brand_products: sum(a:no_brand_products)
            no_uniqie_brand_products: sum(a:no_uniqie_brand_products) 
            total_revenue: sum(a:total_revenue)
            brand_revenue: sum(a:brand_revenue)
          }
        }
      }
    }
    `)
    })

    test('basic Array with sorting works', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
      fetch(category: whatever, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        channel(type: Array, sort_desc: session_value) {
            session_value: divide(a:revenue, by:sessions)
        }
      }
    }
    `)
    })
    test('metric functions', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array) {
            no_unique_products: sum(a:no_unique_products)
            no_brand_products: sum(a:no_brand_products)
            average: divide(a:no_baskets, by:no_all_baskets)
          }
        }
      }
    }
    `)
    })

    test('dimension functions', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array){
            position: aggrAverage(to:no_baskets, by:no_all_baskets) 
          }
        }
      }
    }
    `)
    })
    test('group date by month', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })
      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date: groupBy(field: date, type: Array, by: month){
            no_unique_products: sum(a:no_unique_products)
            no_brand_products: sum(a:no_brand_products)
          }
        }
      }
    }
    `)
    })
  })

  describe('merge', () => {
    test('basic example works', () => {
      const tables = [
        [
          {
            device: 'mobile',
            date: '2020-01-01T23:00:00.000Z',
            no_baskets: '100',
            no_all_baskets: '101',
            no_unique_products: '102',
            no_brand_products: '103',
            no_uniqie_brand_products: '104',
            total_revenue: '105',
            brand_revenue: '106',
          },
          {
            device: 'mobile',
            date: '2020-01-02T23:00:00.000Z',
            no_baskets: '109',
            no_all_baskets: '107',
            no_unique_products: '108',
            no_brand_products: '110',
            no_uniqie_brand_products: '111',
            total_revenue: '112',
            brand_revenue: '113',
          },
          {
            device: 'desktop',
            date: '2020-01-01T23:00:00.000Z',
            no_baskets: '200',
            no_all_baskets: '201',
            no_unique_products: '202',
            no_brand_products: '203',
            no_uniqie_brand_products: '204',
            total_revenue: '205',
            brand_revenue: '206',
          },
          {
            device: 'desktop',
            date: '2020-01-02T23:00:00.000Z',
            no_baskets: '209',
            no_all_baskets: '207',
            no_unique_products: '208',
            no_brand_products: '210',
            no_uniqie_brand_products: '211',
            total_revenue: '212',
            brand_revenue: '213',
          },
        ],
      ]

      const querier = gqlToDb().dbFetch(() => {
        return tables
      })

      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array) {
            no_baskets
            no_all_baskets
            no_unique_products 
            no_brand_products
            no_uniqie_brand_products 
            total_revenue
            brand_revenue
          }
        }
      }
    }
    `).then((result) => expect(result).toMatchSnapshot())
    })

    test('metric functions', () => {
      const table = [
        [
          {
            device: 'mobile',
            date: '2020-01-01T23:00:00.000Z',
            no_unique_products: '100',
            no_brand_products: '101',
            average: '102',
          },
          {
            device: 'mobile',
            date: '2020-01-02T23:00:00.000Z',
            no_unique_products: '109',
            no_brand_products: '107',
            average: '108',
          },
          {
            device: 'desktop',
            date: '2020-01-01T23:00:00.000Z',
            no_unique_products: '200',
            no_brand_products: '201',
            average: '202',
          },
          {
            device: 'desktop',
            date: '2020-01-02T23:00:00.000Z',
            no_unique_products: '209',
            no_brand_products: '207',
            average: '208',
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(() => {
        return table
      })

      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array) {
            no_unique_products 
            no_brand_products
            average: divide(a:no_baskets, by:no_all_baskets)
          }
        }
      }
    }
    `).then((result) => expect(result).toMatchSnapshot())
    })

    test('dimension functions', () => {
      const table = [
        [
          {
            device: 'mobile',
            date: '2020-01-01T23:00:00.000Z',
            position_aggrAverage: '100',
            no_baskets: '101',
            no_all_baskets: '102',
          },
          {
            device: 'mobile',
            date: '2020-01-02T23:00:00.000Z',
            position_aggrAverage: '109',
            no_baskets: '107',
            no_all_baskets: '108',
          },
          {
            device: 'desktop',
            date: '2020-01-01T23:00:00.000Z',
            position_aggrAverage: '200',
            no_baskets: '201',
            no_all_baskets: '202',
          },
          {
            device: 'desktop',
            date: '2020-01-02T23:00:00.000Z',
            position_aggrAverage: '209',
            no_baskets: '207',
            no_all_baskets: '208',
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(() => {
        return table
      })
      return querier(`query table {
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array){
            position: aggrAverage(to:no_baskets, by:no_all_baskets) 
          }
        }
      }
    }
    `).then((result) => expect(result).toMatchSnapshot())
    })
    test('date formatting', () => {
      const table = [
        {
          device: 'mobile',
          date: '2020-01-01T23:00:00.000Z',
          position_aggrAverage: '100',
          no_baskets: '101',
          no_all_baskets: '102',
        },
        {
          device: 'mobile',
          date: '2020-01-02T23:00:00.000Z',
          position_aggrAverage: '109',
          no_baskets: '107',
          no_all_baskets: '108',
        },
        {
          device: 'desktop',
          date: '2020-01-01T23:00:00.000Z',
          position_aggrAverage: '200',
          no_baskets: '201',
          no_all_baskets: '202',
        },
        {
          device: 'desktop',
          date: '2020-01-02T23:00:00.000Z',
          position_aggrAverage: '209',
          no_baskets: '207',
          no_all_baskets: '208',
        },
      ]
      const querier = gqlToDb().dbFetch(() => {
        return table
      })
      return querier(`query table{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array, format: "Mon yy"){
            position: aggrAverage(to:no_baskets, by:no_all_baskets) {
              no_baskets 
              no_all_baskets
            }
          }
        }
      }
    }
    `).then((result) => expect(result).toMatchSnapshot())
    })

    test('array on top position', () => {
      const table = [
        [
          {
            country: 'FR',
          },
          {
            country: 'MX',
          },
          {
            country: 'PL',
          },
          {
            country: 'ES',
          },
          {
            country: 'PT',
          },
          {
            country: 'US',
          },
          {
            country: 'FR',
          },
          {
            country: 'IT',
          },
          {
            country: 'GB',
          },
          {
            country: 'DE',
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(() => {
        return table
      })
      return querier(`query table{
      fetch{
        country: distinct(type: Array)
      }
    }
    `).then((result) => expect(result).toMatchSnapshot())
    })
  })

  describe('gqlBuilder single query', () => {
    test('handle table name in query', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      return querier(`query some_table_name{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        custom_name {
          device
        }
      }
    }
    query some_other_table_name{
      fetch(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        custom_name_second {
          device_second
        }
      }
    }
    `)
    })
  })

  describe('gqlBuilder function', () => {
    test('share', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      querier(`query ecom_benchmarking {
      fetch(date: "2020-11-27", category: "Finance/Investing") {
          channels {
              share: share(a:sessions)
          }
      }
    }`)
    })
  })

  describe('gqlBuilder request tuning', () => {
    test('sort_desc', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      querier(`  query ecom_benchmarking {
        fetch(category:"Travel_and_Tourism", country:"US", date_gt:"2020-10-13", date_lt:"2021-04-13") {
            channels (type: Array, sort_desc: share) {
                share: share(a: sessions)
            }
        }
    }`)
    })
    test('sort_asc', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      querier(`  query ecom_benchmarking {
        fetch(category:"Travel_and_Tourism", country:"US", date_gt:"2020-10-13", date_lt:"2021-04-13") {
            channels (type: Array, sort_asc: share) {
                share: share(a: sessions)
            }
        }
    }`)
    })

    test('groupByEach', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      querier(`  query ecom_benchmarking {
        fetch(category:"Travel_and_Tourism", country:"US", date_gt:"2020-10-13", date_lt:"2021-04-13") {
            price: groupByEach(field: price, type: Array, sort_asc: share, each: 50) {
                share: share(a: sessions)
            }
        }
    }`)
    })

    test('limit', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      querier(`  query ecom_benchmarking {
        fetch(category:"Travel_and_Tourism", country:"US", date_gt:"2020-10-13", date_lt:"2021-04-13") {
            channels (type: Array, limit: 3) {
                share: share(a: sessions)
            }
        }
    }`)
    })

    test('offset', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      querier(`  query ecom_benchmarking {
        fetch(category:"Travel_and_Tourism", country:"US", date_gt:"2020-10-13", date_lt:"2021-04-13") {
            channels (type: Array, offset: 5) {
                share: share(a: sessions)
            }
        }
    }`)
    })

    test('all together', () => {
      const querier = gqlToDb().beforeDbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
      })

      querier(`  query ecom_benchmarking {
        fetch(category:"Travel_and_Tourism", country:"US", date_gt:"2020-10-13", date_lt:"2021-04-13") {
            channels (type: Array, sort_desc: share, limit: 5, offset: 3) {
                share: share(a: sessions)
            }
        }
    }`)
    })
  })

  describe('gql directives', () => {
    test('@diff directive', () => {
      const tables = [
        [
          {
            channels: 'Social',
            value: 1,
          },
          {
            channels: 'Organic',
            value: 3,
          },
        ],
        [
          {
            channels: 'Social',
            value: 2,
          },
          {
            channels: 'Organic',
            value: 5,
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
        return tables
      })
      querier(`query ecom_benchmarking {

      series: fetch(category:"Adult", country:"DE") {
              channels {
                  value: sum(a: sessions) @diff(by: prevSeries)
              }
      }
      prevSeries: fetch(category:"Adult", country:"DE") {
            channels {
                value: sum(a: sessions) @diff(by: series)
            }
        
       }
    }`).then((result) => {
        expect(result).toMatchSnapshot()
      })
    })

    test('@indexed directive', () => {
      const tables = [
        [
          {
            channels: 'Social',
            value: 1,
          },
          {
            channels: 'Organic',
            value: 3,
          },
        ],
        [
          {
            channels: 'Social',
            value: 2,
          },
          {
            channels: 'Organic',
            value: 5,
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
        return tables
      })
      querier(`query ecom_benchmarking {

      series: fetch(category:"Adult", country:"DE") {
              channels {
                  value: sum(a: sessions) @indexed(to: prevSeries)
              }
      }
      prevSeries: fetch(category:"Adult", country:"DE") {
            channels {
                value: sum(a: sessions) @indexed(to: series)
            }
        
       }
    }`).then((result) => {
        expect(result).toMatchSnapshot()
      })
    })

    test('@indexed directive groups', () => {
      const tables = [
        [
          {
            channels: 'Social',
            value: 1,
          },
          {
            channels: 'Organic',
            value: 3,
          },
        ],
        [
          {
            channels: 'Social',
            value: 2,
          },
          {
            channels: 'Organic',
            value: 5,
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
        return tables
      })
      querier(`query ecom_benchmarking {

      series: fetch(category:"Adult", country:"DE") {
              channels {
                  value: sum(a: sessions) @indexed(group: first)
              }
      }
      prevSeries: fetch(category:"Adult", country:"DE") {
            channels {
                value: sum(a: sessions) @indexed(group: first)
            }
        
       }
    }`).then((result) => {
        expect(result).toMatchSnapshot()
      })
    })

    test('@filter directive', () => {
      const tables = [
        [
          {
            channels: 'Social',
            value: 1,
          },
          {
            channels: 'Organic',
            value: 3,
          },
        ],
        [
          {
            channels: 'Social',
            value: 2,
          },
          {
            channels: 'Organic',
            value: 5,
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
        return tables
      })
      querier(`query ecom_benchmarking {

      series: fetch(category:"Adult", country:"DE") {
              channels @filter(value_gt: 1) {
                  value: sum(a: sessions)
              }
      }
      prevSeries: fetch(category:"Adult", country:"DE") {
            channels @filter(value_lt: 4.99) {
                value: sum(a: sessions)
            }
        
       }
    }`).then((result) => {
        expect(result).toMatchSnapshot()
      })
    })

    test('@filter directive on metrics', () => {
      const tables = [
        [
          {
            channels: 'Social',
            value: 1,
            rank: 1,
          },
          {
            channels: 'Organic',
            value: 3,
            rank: 2,
          },
        ],
        [
          {
            channels: 'Social',
            value: 2,
            rank: 1,
          },
          {
            channels: 'Organic',
            value: 5,
            rank: 2,
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
        return tables
      })
      querier(`query ecom_benchmarking {

      series: fetch(category:"Adult", country:"DE") {
              channels {
                  value: sum(a: sessions) @filter(gt: 1)
                  rank
              }
      }
      prevSeries: fetch(category:"Adult", country:"DE") {
            channels {
                value: sum(a: sessions) @filter(eq: 5)
                rank
            }
        
       }
    }`).then((result) => {
        expect(result).toMatchSnapshot()
      })
    })

    test('@groupOn directive', () => {
      const tables = [
        [
          {
            channels: 'Social',
            value: 1,
          },
          {
            channels: 'Organic',
            value: 3,
          },
        ],
        [
          {
            channels: 'Social',
            value: 2,
          },
          {
            channels: 'Organic',
            value: 5,
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
        return tables
      })
      querier(`query ecom_benchmarking {

      series: fetch(category:"Adult", country:"DE") {
              channels @groupOn(value_gt: 0.5, replacers: { channels: "Other" }) {
                  value: sum(a: sessions)
              }
      }
      prevSeries: fetch(category:"Adult", country:"DE") {
            channels @groupOn(value_lt: 3, replacers: { channels: "Other" }) {
                value: sum(a: sessions)
            }
        
       }
    }`).then((result) => {
        expect(result).toMatchSnapshot()
      })
    })

    test('@omit directive', () => {
      const tables = [
        [
          {
            channels: 'Social',
            value: 1,
            rank: 2,
          },
          {
            channels: 'Organic',
            value: 3,
            rank: 2,
          },
        ],
        [
          {
            channels: 'Social',
            value: 2,
            country: 'DE',
            rank: 1,
          },
          {
            channels: 'Organic',
            value: 5,
            rank: 2,
          },
        ],
      ]
      const querier = gqlToDb().dbFetch(({ sql }) => {
        expect(sql).toMatchSnapshot()
        return tables
      })
      querier(`query ecom_benchmarking {

      series: fetch(category:"Adult", country:"DE") {
              channels {
                  value: sum(a: sessions)
                  rank @omit 
              }
      }
      prevSeries: fetch(category:"Adult", country:"DE") {
            channels {
                value: sum(a: sessions)
                rank @omit
            }
        
       }
    }`).then((result) => {
        expect(result).toMatchSnapshot()
      })
    })
  })
})
