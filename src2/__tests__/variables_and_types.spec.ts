import gql from 'graphql-tag'
import { defaultTypes } from '../../parser'
import GritQL from '../gritql'
import PostgresProvider from '../providers/PostgresProvider'

const postgresqlProvider = new PostgresProvider({})
const gritql = new GritQL()
gritql.use(postgresqlProvider)

function getSql(query, variables: any) {
  const defs = gql(query).definitions
  return gritql
    .queryParser(defs, undefined, 0, {
      fragments: {},
      types: { ...defaultTypes },
      variablesValidator: {},
      variables,
      typeDefinitions: {},
    })[0]
    .query.renderQuery()
    .then((context) => {
      return context.promise.toSQL().sql
    })
}

describe('gritql variables && types', () => {
  test('input type must be traited as exact object type', () => {
    getSql(
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
    ).then(matchSnapshot)
  })

  test('list type must be traited as array type', () => {
    getSql(
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
    ).then(matchSnapshot)
  })

  test('type must be traited as shape object type', () => {
    getSql(
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
    ).then(matchSnapshot)
  })

  test('Union type', () => {
    getSql(
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
    ).then(matchSnapshot)
  })
  //TODO: fix this one, seems doesn't work properly
  test('Custom types directives', () => {
    getSql(
      `
    type YearDate {
      year: Number!
    }

    type MonthDate @inherits(name: YearDate) {
      month: Number!
    }

    type DayDate @inherits(name: MonthDate) {
      day: Number!
    }

    type TupleDate @tuple(definitions: [DayDate, DayDate], isRequired: true)

    enum Operators {
      eq
      ilike
      like
    }

    enum NumOperators {
      lt
      gt
      gte
      lte
    }

    type BrandOps @map(key: Operators, value: String) @map(key: NumOperators, value: Number)

    type BrandFilter @inherits(name: BrandOps) @map(key: String, value: BrandOps)

    input DateEqFilter {
      eq: TupleDate
    }

    type Filters {
      or: [BrandFilter!]!
      country: String!
      date: DateEqFilter
    }

    query table($filters: Filters) {
      fetch(filters: $filters) {
        value: sum(a:pageviews)
      }
    }
  `,
      {
        filters: {
          or: [{ brand: { eq: 'Adidas' }, price: { lt: 2 } }],
          date: {
            eq: [
              { year: 2021, month: 12, day: 31 },
              { year: 2022, month: 9, day: 1 },
            ],
          },
          country: 'US',
        },
      },
    ).then(matchSnapshot)
  })
})

function matchSnapshot(sql) {
  expect(sql).toMatchSnapshot()
}
