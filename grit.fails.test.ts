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
