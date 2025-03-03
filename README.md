# GritQL - SQL Query Library with GraphQL-like Syntax

GritQL is a powerful TypeScript/JavaScript library that provides a GraphQL-like interface for querying SQL databases. It simplifies complex SQL queries by providing an intuitive, type-safe query language specifically designed for dimensional and metric-based data analysis.

## Features

- 🎯 GraphQL-like syntax for SQL queries
- 📊 Built-in support for metrics and dimensions
- 🔄 Automatic query optimization
- 🔌 Multiple database support (PostgreSQL, Snowflake)
- 🔒 Type-safe queries with TypeScript
- 🧩 Modular and extensible architecture
- 📈 Advanced aggregation functions
- ⏱️ Time-series analysis support

## Installation

```bash
npm install gritql
# or
yarn add gritql
```

## Quick Start

```typescript
import { gqlToDb } from 'gritql'

// Initialize the querier
const querier = gqlToDb()
  .beforeDbFetch(({ sql }) => {
    console.log('Generated SQL:', sql)
    return { sql }
  })
  .dbFetch(async (sql) => {
    // Execute your SQL query here
    return results
  })

// Execute a GritQL query
const result = await querier(
  `
  query customers($filters: Filters) {
    revenue: fetch(filters: $filters) {
      plan(type: Array) {
        total: sum(a: planPrice)
      }
    }
  }
`,
  {
    filters: {
      country: 'US',
      date: {
        gte: '2023-01-01',
        lte: '2023-12-31',
      },
    },
  },
)
```

## Database Support

GritQL currently supports:

- PostgreSQL (via `postgres` driver)
- Snowflake (via `snowflake-sdk`)

### Configuration

```typescript
import { gqlToDb } from 'gritql'

const querier = gqlToDb().setupProvider('pg', {
  connection: {
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    user: 'user',
    password: 'password',
  },
  pool: { max: 20 },
})
```

## Key Concepts

### Metrics and Dimensions

GritQL organizes data into metrics (measurable values) and dimensions (categorical values):

```typescript
query sales {
  fetch(table: "sales") {
    // Dimension
    product_category(type: Array) {
      // Metrics
      total_revenue: sum(a: revenue)
      average_price: divide(a: revenue, by: units_sold)
      unique_customers: unique(a: customer_id)
    }
  }
}
```

### Filters

Apply filters at different levels:

```typescript
query filtered_sales($date: Date!) {
  fetch(filters: {
    date,
    country: "US",
    category: {
      in: ["Electronics", "Books"]
    }
  }) {
    product(type: Array, sort_desc: revenue) {
      sales: sum(a: revenue)
    }
  }
}
```

### Time Series Analysis

Built-in support for time-based grouping and analysis:

```typescript
query time_series {
  daily: fetch(table: "sales") {
    date: groupBy(by: "day", field: "timestamp") {
      revenue: sum(a: amount)
      orders: count(a: order_id)
    }
  }
}
```

## Advanced Features

### Custom Metrics

Define custom metrics using the metric wrapper:

```typescript
import { metricWrapper } from 'gritql'

const customMetrics = {
  averageOrderValue: metricWrapper(
    (alias, args, query, knex) => {
      return query.promise.select(
        knex.raw('SUM(amount) / COUNT(DISTINCT order_id) as ??', [
          alias || 'avg_order_value',
        ]),
      )
    },
    {
      // PropTypes validation for arguments
      table: PropTypes.string,
    },
  ),
}
```

### Query Composition

Use fragments for reusable query parts:

```typescript
fragment RevenueMetrics on Any {
  revenue: sum(a: amount)
  orders: count(a: order_id)
  avg_order: divide(a: revenue, by: orders)
}

query sales {
  daily: fetch(table: "sales") {
    date(type: Array) {
      ...RevenueMetrics
    }
  }
}
```

## Performance Tips

1. Use appropriate indexes on your database tables
2. Apply filters early in your queries
3. Use pagination for large result sets
4. Leverage the built-in query optimization
5. Monitor and analyze query execution plans

## License

MIT License - see the [LICENSE](LICENSE) file for details.
