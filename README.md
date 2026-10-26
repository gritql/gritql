# gritql

Write analytics queries in a GraphQL-like shape. gritql turns them into SQL, runs them on your database, and gives you back nested JSON instead of flat rows.

```graphql
query sales($from: String!) {
  fetch(where: { date: { gte: $from }, country: "DE" }) {
    device(sort_desc: revenue, limit: 5) {
      revenue: sum(a: revenue)
      orders: count(a: order_id)
    }
  }
}
```

becomes

```sql
select "device", SUM("revenue") AS "revenue", COUNT("order_id") AS "orders"
from "sales"
where (("sales"."date" >= '2024-01-01')) AND ("sales"."country" = 'DE')
group by "device"
order by "revenue" desc
limit 5
```

and returns

```json
[
  { "device": "mobile",  "revenue": 120, "orders": 10 },
  { "device": "desktop", "revenue": 300, "orders": 12 }
]
```

## Install

```sh
npm install gritql knex pg
```

gritql uses [knex](https://knexjs.org) to build SQL and does not ship a database driver. You connect knex to your database and hand it over.

## Hello world

```ts
import knex from 'knex'
import { gritql, pgAdapter } from 'gritql'

const db = knex({ client: 'pg', connection: process.env.DATABASE_URL })
const g = gritql({ adapters: { pg: pgAdapter(db) } })

const result = await g.run(
  `query sales($from: String!) {
    fetch(where: { date: { gte: $from } }) {
      device { revenue: sum(a: revenue) }
    }
  }`,
  { from: '2024-01-01' },
)
```

`g.compile(query, variables)` gives you the SQL without running it. Useful for tests, logging, and for checking what a query does.

## How a query is built

- **The operation name is the table.** `query sales { ... }` reads from `sales`. Use `fetch(table: other)` to read from somewhere else.
- **A field with children is a dimension.** It becomes a `GROUP BY`. `device { ... }` groups by the `device` column.
- **A field without children is a metric.** `revenue: sum(a: revenue)` is `SUM(revenue) AS revenue`. A bare name like `title` selects the column as is.
- **Nest dimensions to nest the output.** `country { device { ... } }` gives one record per country, each holding a list of devices.
- **Filter with `where`.** Every key is a column. A plain value means equals, a list means `IN`, and `{ gt, gte, lt, lte, ne, in, nin, like, ilike }` are the operators. `and`, `or`, `not` nest.
- **Sort and limit on the dimension.** `device(sort_desc: revenue, limit: 5)`. A limit on a nested dimension is per parent: `country { device(limit: 3) }` gives three devices for every country.
- **`having` filters on results.** `device(having: { revenue: { gt: 1000 } })` keeps the groups that pass.

## Output shape

Each dimension is an array of records that carry their own value:

```json
[{ "country": "DE", "device": [{ "device": "mobile", "revenue": 1 }, { "device": "desktop", "revenue": 2 }] }]
```

If you prefer objects keyed by value, say so on the dimension with `type: Map`, or for the whole instance with `gritql({ ..., output: 'keyed' })`:

```json
{ "DE": [{ "device": "mobile", "revenue": 1 }, { "device": "desktop", "revenue": 2 }] }
```

Several fetches in one query are returned under their aliases: `{ data: [...], totals: {...} }`.

## Comparing periods

A common need is "this month against last month". Put the baseline in a `with` (a CTE that is not returned) and compare with `@diff`, `@subtract` or `@divide`:

```graphql
query sales($cur: Object!, $prev: Object!) {
  prev: with(where: $prev) { device { growth: sum(a: revenue) } }
  data: fetch(where: $cur) {
    device(sort_desc: revenue) {
      revenue: sum(a: revenue)
      growth: sum(a: revenue) @diff(by: prev)
    }
  }
}
```

The comparison is done by the database with a `LEFT JOIN` on the dimension columns, so sorting and limits see the computed values and nothing is post-processed in JavaScript. The metric you compare must exist under the same name and the same dimensions in both fetches. A device missing from the baseline gives `null`.

```sql
with "prev" as (select "device", SUM("revenue") AS "growth" from "sales" where (...) group by "device")
select "__cur"."device", "__cur"."revenue",
       cast("__cur"."growth" as float) / NULLIF(cast("__ref_0"."growth" as float), 0) - 1 as "growth"
from (select "device", SUM("revenue") AS "revenue", SUM("revenue") AS "growth" from "sales" where (...) group by "device") as "__cur"
left join "prev" as "__ref_0" on "__cur"."device" = "__ref_0"."device"
order by "revenue" desc
```

## Useful metrics and dimensions

Metrics: `sum`, `count`, `countDistinct`, `avg`, `min`, `max`, `median`, `percentile(a, factor)`, `share(a)` (share of the total), `ranking(a)`, `divide` / `diff` / `subtract` / `multiply` for arithmetic between two columns:

```graphql
aov: divide(a: { sum: revenue }, by: { count: order_id })
```

Dimensions: a plain column, `groupBy(field: date, by: month)` for date truncation, `groupByEach(field: price, each: 10)` for numeric buckets, `combine(fields: [brand, category])` for a composite key, and `join(table: products, on: { id: "@product_id" })` to pull columns from another table.

Directives: `@include(if:)` / `@skip(if:)`, `@filter(where: {...})` to keep groups that pass a condition, `@omit` to use a column in a calculation without returning it, `@parse(as: int)` to convert values, `@groupBy(by: month)` and `@groupOn(...)` to regroup results.

The complete list with the SQL each one produces is in [SPEC.md](SPEC.md), section 8.

## Strict by default

Typos and the old string grammars are errors that tell you what to write instead:

```
Unknown fetch argument 'limt': column predicates go in `where: { limt: ... }`; limit/offset/sort belong on a dimension
"sum|revenue" mixes a function and a column in one string; write { sum: revenue } (or set strict: false)
```

Undeclared `$variables` are errors too. If you are running queries written for gritql v3, start with `gritql({ ..., strict: false, output: 'keyed' })` and tighten later. [COMPAT.md](COMPAT.md) lists every difference.

## Adapters

- `pgAdapter(knexInstance)` for PostgreSQL.
- `clickhouseAdapter(client)` for ClickHouse (pass a client with a `query` method).
- `knexAdapter({ dialect, execute })` for anything knex can print SQL for; you supply the function that runs a statement.
- `fixtureAdapter(rowSets)` for tests: it returns the rows you give it, one row set per statement, in order.

Several adapters can be registered at once. `run(query, variables, { adapter: 'name' })` picks one; otherwise the one named by the `default` option, or the first registered, is used.

## Extending

A metric, dimension or directive is one object. Register it with `g.use({ metrics: { ... } })`:

```ts
import { gritql, PropTypes } from 'gritql'

g.use({
  metrics: {
    sumIf: {
      args: { a: PropTypes.string.isRequired, when: PropTypes.string.isRequired },
      sql: (node, ctx) => ctx.knex.raw('SUM(CASE WHEN ?? THEN ?? END) AS ??', [node.args.when, node.args.a, node.alias]),
    },
  },
})
```

Then `paid: sumIf(a: revenue, when: status_paid)` works like any built-in. Resolvers can also hook the plan, the finished knex builder, execution, and the assembled result. See [SPEC.md](SPEC.md), sections 4 and 9.

## Errors

Everything throws `GritqlError` with a `code` (`PARSE`, `TYPE`, `ARGS`, `PLAN`, `DIALECT`, `EXECUTE`, `RESULT`), a message, and the `path` of the field it refers to. Nothing is logged to the console.

## Development

```sh
npm test          # vitest
npm run typecheck
npm run build     # dist/
npm run bench     # assembly and compile timings on synthetic data, see bench/RESULTS.md
```

## Documents

- [SPEC.md](SPEC.md): the full language and engine specification.
- [MIGRATION.md](MIGRATION.md): step-by-step guide from v3 to v4.
- [COMPAT.md](COMPAT.md): every difference from v3 and why.
- [bench/RESULTS.md](bench/RESULTS.md): performance against v3.

MIT license.
