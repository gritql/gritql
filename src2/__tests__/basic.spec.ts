import gql from 'graphql-tag'
import GritQL from '../gritql'
import PostgresProvider from '../providers/PostgresProvider'

const postgresqlProvider = new PostgresProvider({})
const gritql = new GritQL()
gritql.use(postgresqlProvider)

function getSql(literals: TemplateStringsArray) {
  const defs = gql(literals[0]).definitions
  return gritql
    .queryParser(defs)[0]
    .query.renderQuery()
    .then((context) => {
      return context.promise.toSQL().sql
    })
}

describe('gritql simple query', () => {
  test('generate proper sql', () => {
    getSql`
      query test {
        some: fetch(a: 10, b: 20) {
          troo {
            data: divide(a: t, by: b)
          }
        }
      }
  `.then(matchSnapshot)
  })

  test('basic example works', () => {
    getSql`query table{
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
  `.then(matchSnapshot)
  })

  test('basic Array with sorting works', () => {
    getSql`query table{
    fetch(category: whatever, country: US, date_gt: "2020-1-1", date_lt: "2021-7-12") {
      channel(type: Array, sort_desc: session_value) {
          session_value: divide(a:revenue, by:sessions)
      }
    }
  }
  `.then(matchSnapshot)
  })

  test('metric functions', () => {
    getSql`query table{
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
  `.then(matchSnapshot)
  })
})

function matchSnapshot(sql) {
  expect(sql).toMatchSnapshot()
}
