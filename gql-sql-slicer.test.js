const gqlBuild = require("./gql-sql-slicer");
const { merge } = gqlBuild;



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
})


describe('merge', () => {

  test('basic example works', () => {
    const table = [
      ['mobile', '2020-1-1', '100', '101', '102', '103', '104', '105', '106'],
      ['mobile', '2020-1-2', '109', '107', '108', '110', '111', '112', '113'],
      ['desktop', '2020-1-1', '200', '201', '202', '203', '204', '205', '206'],
      ['desktop', '2020-1-2', '209', '207', '208', '210', '211', '212', '213'],
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
      ['mobile', '2020-1-1', '100', '101', '102'],
      ['mobile', '2020-1-2', '109', '107', '108'],
      ['desktop', '2020-1-1', '200', '201', '202'],
      ['desktop', '2020-1-2', '209', '207', '208'],
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
      ['mobile', '2020-1-1', '100', '101', '102'],
      ['mobile', '2020-1-2', '109', '107', '108'],
      ['desktop', '2020-1-1', '200', '201', '202'],
      ['desktop', '2020-1-2', '209', '207', '208'],
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
})

