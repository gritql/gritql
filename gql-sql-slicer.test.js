const { gqlBuild, merge } = require("./gql-sql-slicer");


describe('new', () => {
  test('distinct', () => {
    expect(gqlBuild(`{
      query{
        device: distinct {
          device
        }
      }
    }
    `).query).toMatchSnapshot();
  })
  test('array on top position', () => {
    const table = [
      {
        "country": "FR"
      },
      {
        "country": "MX"
      },
      {
        "country": "PL"
      },
      {
        "country": "ES"
      },
      {
        "country": "PT"
      },
      {
        "country": "US"
      },
      {
        "country": "FR"
      },
      {
        "country": "IT"
      },
      {
        "country": "GB"
      },
      {
        "country": "DE"
      }
    ]
    const { query, definition } = gqlBuild(`{
      query{
        country: distinct(type: Array) {
            tezt
        }
      }
    }
    `)
    expect(merge(definition, table)).toMatchSnapshot()
  })
})

describe('gqlBuilder', () => {



  test('basic example works', () => {
    expect(gqlBuild(`{
      query: test(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
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
    `).query).toMatchSnapshot();
  })


  test('metric functions', () => {
    expect(gqlBuild(`{
      query: test(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array) {
            no_unique_products 
            no_brand_products
            average: divide(a:no_baskets, by:no_all_baskets)
          }
        }
      }
    }
    `).query).toMatchSnapshot();
  })

  test('dimension functions', () => {
    expect(gqlBuild(`{
      query: test(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array){
            position: aggrAverage(to:no_baskets, by:no_all_baskets) {
              no_baskets 
              no_all_baskets
            }
          }
        }
      }
    }
    `).query).toMatchSnapshot();
  })
  test('group date by month', () => {
    expect(gqlBuild(`{
      query: test(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array, groupBy:month){
            no_unique_products 
            no_brand_products
          }
        }
      }
    }
    `).query).toMatchSnapshot();
  })
})


describe('merge', () => {

  test('basic example works', () => {
    const table = [
      {
        device: 'mobile',
        date: '2020-01-01T23:00:00.000Z',
        no_baskets: '100',
        no_all_baskets: '101',
        no_unique_products: '102',
        no_brand_products: '103',
        no_uniqie_brand_products: '104',
        total_revenue: '105',
        brand_revenue: '106'
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
        brand_revenue: '113'
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
        brand_revenue: '206'
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
        brand_revenue: '213'
      }
    ]
    const { query, definition } = gqlBuild(`{
      query: test(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
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
    `);
    expect(merge(definition, table)).toMatchSnapshot()
  })


  test('metric functions', () => {
    const table = [
      {
        device: 'mobile',
        date: '2020-01-01T23:00:00.000Z',
        no_unique_products: '100',
        no_brand_products: '101',
        average: '102'
      },
      {
        device: 'mobile',
        date: '2020-01-02T23:00:00.000Z',
        no_unique_products: '109',
        no_brand_products: '107',
        average: '108'
      },
      {
        device: 'desktop',
        date: '2020-01-01T23:00:00.000Z',
        no_unique_products: '200',
        no_brand_products: '201',
        average: '202'
      },
      {
        device: 'desktop',
        date: '2020-01-02T23:00:00.000Z',
        no_unique_products: '209',
        no_brand_products: '207',
        average: '208'
      }
    ]
    const { query, definition } = gqlBuild(`{
      query: test(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array) {
            no_unique_products 
            no_brand_products
            average: divide(a:no_baskets, by:no_all_baskets)
          }
        }
      }
    }
    `);
    expect(merge(definition, table)).toMatchSnapshot()
  })

  test('dimension functions', () => {
    const table = [
      {
        device: 'mobile',
        date: '2020-01-01T23:00:00.000Z',
        position_aggrAverage: '100',
        no_baskets: '101',
        no_all_baskets: '102'
      },
      {
        device: 'mobile',
        date: '2020-01-02T23:00:00.000Z',
        position_aggrAverage: '109',
        no_baskets: '107',
        no_all_baskets: '108'
      },
      {
        device: 'desktop',
        date: '2020-01-01T23:00:00.000Z',
        position_aggrAverage: '200',
        no_baskets: '201',
        no_all_baskets: '202'
      },
      {
        device: 'desktop',
        date: '2020-01-02T23:00:00.000Z',
        position_aggrAverage: '209',
        no_baskets: '207',
        no_all_baskets: '208'
      }
    ]
    const { query, definition } = gqlBuild(`{
      query: test(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
        device {
          date(type: Array){
            position: aggrAverage(to:no_baskets, by:no_all_baskets) {
              no_baskets 
              no_all_baskets
            }
          }
        }
      }
    }
    `)
    expect(merge(definition, table)).toMatchSnapshot()
  })
  test('date formatting', () => {
    const table = [
      {
        device: 'mobile',
        date: '2020-01-01T23:00:00.000Z',
        position_aggrAverage: '100',
        no_baskets: '101',
        no_all_baskets: '102'
      },
      {
        device: 'mobile',
        date: '2020-01-02T23:00:00.000Z',
        position_aggrAverage: '109',
        no_baskets: '107',
        no_all_baskets: '108'
      },
      {
        device: 'desktop',
        date: '2020-01-01T23:00:00.000Z',
        position_aggrAverage: '200',
        no_baskets: '201',
        no_all_baskets: '202'
      },
      {
        device: 'desktop',
        date: '2020-01-02T23:00:00.000Z',
        position_aggrAverage: '209',
        no_baskets: '207',
        no_all_baskets: '208'
      }
    ]
    const { query, definition } = gqlBuild(`{
      query: test(brand: Adidas, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
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
    `)
    expect(merge(definition, table)).toMatchSnapshot()
  })



})

