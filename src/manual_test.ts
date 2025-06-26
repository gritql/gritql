import { parse } from 'graphql'
import { query as createQueryBuilder } from './intent'
import { ASTWalker } from './core/walker'
import { basicMetricParsers } from './parsers/metric'
import { basicDimensionParsers } from './parsers/dimension'
import { basicDirectiveParsers } from './parsers/directive'
import { ParseContext } from './types'
import knex from 'knex'

const walker = new ASTWalker(
  basicMetricParsers,
  basicDimensionParsers,
  basicDirectiveParsers,
)

const filteredQuery = `
query orders {
  ordersData: fetch(table: "orders", filters:{amount: {gt: 100}}) {
    total: sum(field: "amount")
    count
  }
}
`

console.log('Input GraphQL Query:')
console.log(filteredQuery)

const filteredAst = parse(filteredQuery)
const filteredContext: ParseContext = {
  query: createQueryBuilder(),
  variables: {},
  fragments: {},
}

const filteredResult = walker.walk(filteredAst, filteredContext)

console.log(filteredResult.queries)

filteredResult.queries.forEach((ctx, idx) => {
  console.log(`\nQuery ${idx + 1}:`)
  console.log('Name:', ctx.name)
  console.log('Table:', ctx.table)
  console.log('Query object:', ctx.query)

  const queryToShow = ctx.query
  if (queryToShow && typeof queryToShow.getSteps === 'function') {
    console.log(
      'Intent Steps:',
      JSON.stringify(queryToShow.getSteps(), null, 2),
    )

    const knexInstance = knex({ client: 'postgresql' })
    console.log('Generated SQL:', queryToShow.toSQL(knexInstance))
  } else {
    console.log('Query object is not properly initialized')
  }
})

// // Test with dimensions (query splitting)
// console.log('\n\n=== Example with Dimensions (Query Splitting) ===\n')

// const complexQuery = `
// query sales {
//   fetch {
//     total: sum(field: "amount")
//     byProduct {
//       product_id
//       count
//       revenue: sum(field: "amount")
//     }
//     byRegion {
//       region
//       count
//       revenue: sum(field: "amount")
//     }
//   }
// }
// `

// console.log('Input GraphQL Query:')
// console.log(complexQuery)

// const complexAst = parse(complexQuery)
// const complexContext: ParseContext = {
//   query: createQueryBuilder(),
//   variables: {},
//   fragments: {},
// }

// const complexResult = walker.walk(complexAst, complexContext)

// console.log('\nNumber of queries generated:', complexResult.queries.length)
// console.log(
//   '(Multiple queries are generated when dimensions and metrics exist at the same level)',
// )

// complexResult.queries.forEach((ctx, idx) => {
//   console.log(`\nQuery ${idx + 1}:`)
//   console.log('Name:', ctx.name)
//   console.log('Table:', ctx.table)

//   const queryToShow = ctx.query
//   console.log('Intent Steps:', JSON.stringify(queryToShow.getSteps(), null, 2))

//   const knexInstance = knex({ client: 'postgresql' })
//   console.log('Generated SQL:', queryToShow.toSQL(knexInstance))
// })

// // Test with 'with' clause
// console.log('\n\n=== Example with WITH clause ===\n')

// const withQuery = `
// query orders {
//   recent_orders: with {
//     id
//     created_at
//   }
//   fetch {
//     total: sum(field: "amount")
//     count
//   }
// }
// `

// console.log('Input GraphQL Query:')
// console.log(withQuery)

// const withAst = parse(withQuery)
// const withContext: ParseContext = {
//   query: createQueryBuilder(),
//   variables: {},
//   fragments: {},
// }

// const withResult = walker.walk(withAst, withContext)

// console.log('\nNumber of queries generated:', withResult.queries.length)

// withResult.queries.forEach((ctx, idx) => {
//   console.log(`\nQuery ${idx + 1}:`)
//   console.log('Name:', ctx.name)
//   console.log('Table:', ctx.table)
//   console.log('Is WITH query:', ctx.isWith)

//   const queryToShow = ctx.query
//   console.log('Intent Steps:', JSON.stringify(queryToShow.getSteps(), null, 2))
// })

// console.log('\n=== Demo Complete ===\n')
