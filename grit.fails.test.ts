//@ts-ignore
const { gqlToDb, gqlBuild } = require('./gql-sql-slicer')
describe('SQL', () => {
  describe('variables && types', () => {
    test('input type must be traited as exact object type', () => {
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
})
