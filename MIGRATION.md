# Migrating from gritql v3 to v4

This guide takes an app that runs on gritql v3 and moves it to v4 in two stages:

1. **Swap the engine, keep the queries.** Change how gritql is created, connected and extended. Run v4 in compatibility mode, so the query documents and the result shapes your UI reads stay as they are.
2. **Modernize the queries when convenient.** Turn strict mode on and switch to records output, one screen at a time.

Stage 1 is a backend-only change. Stage 2 is optional and can happen over months.

Exact semantics are in [SPEC.md](SPEC.md). Every difference from v3, with the reason, is in [COMPAT.md](COMPAT.md).

---

## Stage 1: swap the engine

### Install

```sh
npm install gritql@4
```

v4 does not bundle database drivers. Keep `pg`, `@clickhouse/client` or whatever you already use as your own dependencies. `graphql`, `graphql-tag`, `lodash`, `luxon`, `deepmerge`, `tiny-emitter`, `prop-types`, `postgres` and `snowflake-sdk` are no longer pulled in.

gritql still re-exports the knex factory it builds with: `import { knex } from 'gritql'`. Use it for dialect plugins, so your builder and gritql share one knex version.

### Create the instance

v3 had one querier with providers registered and configured on it. v4 takes adapters when it is created.

```ts
// v3
import { gqlToDb } from 'gritql'
const querier = gqlToDb()
querier.setupProvider('pg', { connection: { connectionString }, pool: { min: 10, max: 30 } })
const data = await querier(query, variables, 'pg')
```

```ts
// v4
import { gritql, pgAdapter, knex } from 'gritql'

const pg = knex({ client: 'pg', connection: { connectionString }, pool: { min: 10, max: 30 } })
const g = gritql({
  adapters: { pg: pgAdapter(pg) },
  strict: false,      // accept v3 query syntax
  output: 'keyed',    // return v3 result shapes
})
const data = await g.run(query, variables, { adapter: 'pg' })
```

`strict: false` and `output: 'keyed'` are what make stage 1 safe: v3 documents compile and results keep their v3 shape. Without them, v4 rejects the v3 string grammars and returns arrays of records.

### Providers become adapters

An adapter is a name, a dialect, an optional knex builder, and a function that runs one statement.

| v3 provider piece | v4 |
|---|---|
| `useProvider(name, provider)` + `setupProvider(name, config)` | `adapters: { name: adapter }` on `gritql()`, or `g.use({ adapters })` later |
| `keywords: [...]` allow list | gone; metrics declare their dialects instead |
| `getQueryBuilder()` | the adapter's `knex` |
| `getConnector()` / `getConnection()` | your own client, created before the adapter |
| `execute(connection, sql)` | `execute({ sql, params })` returning rows |
| post-processing the SQL text before running it | the adapter's `compile(qb)` |

A ClickHouse adapter that keeps v3 behaviour: the community knex dialect for quoting, inlined values, and the `float4` rewrite ClickHouse needs.

```ts
import { knex, knexAdapter } from 'gritql'
import clickhouseDialect from '@dnap/knex-clickhouse-dialect'
import { createClient } from '@clickhouse/client'

const client = createClient({ url, database: 'default' })
const finalize = (sql: string) => sql.replace(/float4/g, 'Nullable(Float32)')

const clickhouse = knexAdapter({
  dialect: 'clickhouse',
  knex: knex({ client: clickhouseDialect }),
  compile: (qb) => {
    const sql = finalize(qb.toString())
    // unmatched LEFT JOIN rows are NULL only when ClickHouse is asked to (gritql's @diff relies on it)
    return { sql: /\bleft join\b/i.test(sql) ? `${sql} SETTINGS join_use_nulls = 1` : sql, params: [] }
  },
  execute: async ({ sql }) => (await (await client.query({ query: sql, format: 'JSON' })).json<any>()).data,
})
```

The bundled `clickhouseAdapter(client, { knex })` does the same without the `float4` rewrite.

### Calling and hooks

| v3 | v4 |
|---|---|
| `querier(query, variables, provider)` | `g.run(query, variables, { adapter })` |
| `beforeDbFetch(fn)` to log SQL | an `execute` middleware (below), or `g.compile()` |
| `beforeDbFetch` returning `null` to get SQL without running it | `g.compile(query, variables, { adapter })`, no connection touched |
| `afterDbFetch(fn)` to transform rows | an `execute` middleware that awaits `next(req)` and returns new rows |
| `emitter.once('fetchStart')` and friends | `ctx.timings` with `parse`, `plan`, `lower`, `sql`, `execute`, `assemble` in ms |
| `useResolver`, `useDimensionResolver`, `useDataResolver` | `g.use({ metrics, dimensions })` with one resolver object (below) |

Middleware wraps every statement. It sees the SQL actually sent, and the shared context:

```ts
g.use({
  middleware: [
    {
      execute: async (req, next, ctx) => {
        logger.debug('gritql sql', req.sql)
        return next(req)
      },
    },
  ],
})
```

v3 hooks were registered on the shared querier, so concurrent requests could overwrite each other's hooks. v4 middleware is registered once. Per-request data belongs in the `run` call, not in a hook.

Compile only, for exports or SQL previews:

```ts
const { queries } = await g.compile(query, variables, { adapter: 'clickhouse' })
const sql = queries.map((q) => q.sql)   // what the adapter would run; q.text has values inlined
```

`compile()` lists only the statements that run. A `with()` appears inside the statement that uses it, not on its own.

### Custom metrics

A v3 `metricWrapper(fn, propTypes, keywords, 'knex')` mutated the query builder. A v4 resolver returns an expression.

```ts
// v3
export const sumIf = metricWrapper(
  (alias, args, query, builder) =>
    query.promise.select(
      builder.raw(`sumIf(??, ${buildFilter(args.case, { query, builder, onlyInherited: true, valueTransformer: (c, k, v) => v })}) AS ??`,
        [buildFullName(args, query, args.a, false), alias]),
    ),
  { a: PropTypes.string, case: PropTypes.object },
  ['sumIf'],
  'knex',
)
querier.useResolver('sumIf', sumIf)
```

```ts
// v4
import type { Resolver } from 'gritql'
import { PropTypes } from 'gritql'

const sumIf: Resolver = {
  args: { a: PropTypes.string, case: PropTypes.object },
  sql: (node, ctx) =>
    ctx.knex.raw('sumIf(??, ?) AS ??', [ctx.col(node.args.a as string, node.args.from as string), ctx.where(node.args.case as any), node.alias]),
}
g.use({ metrics: { sumIf } })
```

| v3 helper | v4 |
|---|---|
| `buildFullName(args, query, field, false)` | `ctx.col(field, args.from)` |
| `buildFilter(filter, { query, builder, onlyInherited: true, valueTransformer })` | `ctx.where(filter)`, a `Knex.Raw` for the current statement; `inherited: false` is always honoured |
| `query.promise.select(raw)` | return `raw`, an array of raws, or `{ select, pre, groupBy, having }` |
| keywords list | gone |
| `useDataResolver(name, fn)` to declare extra output columns | `columns: (node) => [...]` on the same resolver |
| a resolver that differs per provider (`query.provider === 'clickhouse'`) | `sql: { clickhouse: fnA, '*': fnB }` |
| `metricResolvers.divide` (a built-in to fall back to) | `import { metrics } from 'gritql'`, then `metrics.divide` |

A metric with several output columns, like a `groupArray(fields: [...])` that selects one column per field:

```ts
const groupArray: Resolver = {
  args: { a: PropTypes.string, fields: PropTypes.arrayOf(PropTypes.string) },
  columns: (node) => (Array.isArray(node.args.fields) ? (node.args.fields as string[]) : [node.alias]),
  sql: (node, ctx) =>
    Array.isArray(node.args.fields)
      ? (node.args.fields as string[]).map((f) => ctx.knex.raw('groupArray(DISTINCT ??) AS ??', [ctx.col(f, node.args.from as string), f]))
      : ctx.knex.raw('groupArray(DISTINCT ??) AS ??', [ctx.col(node.args.a as string, node.args.from as string), node.alias]),
}
```

Operands written `"sum|revenue"` or `"|revenue"` arrive in `node.args` as those strings when `strict: false`. A resolver that accepts them should also accept the v4 object form `{ sum: revenue }` / `{ field: revenue }`, so the query can move to strict later.

### Using the filter compiler directly

v3's `buildFilter` from `gritql/dist/filters` returned a SQL string with values inlined. v4's `buildFilter` returns `{ sql, bindings }`:

```ts
// v3
import { buildFilter } from 'gritql/dist/filters'
const where = buildFilter(filters, { query: { table }, builder, valueTransformer: (c, k, v) => v })

// v4
import { buildFilter, knex } from 'gritql'
const f = buildFilter(filters, { table, joins: [], dialect: 'clickhouse' })
const where = builder.raw(f.sql, f.bindings).toString()   // same inlined string as v3
```

Deep imports from `gritql/dist/...` are not part of v4's API. Import from `gritql`.

### Removed

- **Google Analytics provider.** Write an adapter if you still need it; nothing in v4 knows about GA.
- **`@map` / `@tuple`** type directives.
- **Join shorthands `by_in` and `by_like`.** Write them as `on:` predicates.
- **The progressive merge API** (string paths, `[@k=v]` grammar, `replacedPath`). Result hooks return `{ value, skip, skipAll, keys, set }` instead.
- **Console logging.** Errors are thrown as `GritqlError` with `code`, `message` and `path`.

### What changes even in compatibility mode

These are behaviour changes, not syntax. Check the screens that rely on them.

- **Nested `limit` is per parent.** `country { device(limit: 3) }` returns three devices for every country. v3 returned three rows in total.
- **`@diff`, `@subtract`, `@divide` run in SQL.** A missing comparison row or a zero divisor gives `null`, where v3 gave `NaN` or `Infinity`. Sorting and limits now see the computed value.
- **`@filter` runs in SQL** with `eq ne gt gte lt lte in nin`, before `limit`. v3 filtered after the limit, so a top 10 could come back with fewer rows. Filtering on a field the statement does not select is now an error; v3 ignored it.
- **Lists in filters are `IN`.** `category: [1, 11]` matches either value. v3 generated `= 1 AND = 11`, which matched nothing.
- **Numbers stay numbers in SQL**: `price_gt: 126` compiles to `> 126`, not `> '126'`.
- **A selection that only holds dimensions emits no statement.** v3 sent an empty `select * from table`.
- **An anonymous operation needs `table:`** on its fetch.
- **`@groupBy` sums each metric once.** v3 double counted sibling metrics.
- **Undeclared `$variables`** keep working with `strict: false`.

---

## Stage 2: modern queries

Turn on the defaults per instance, or create a second instance for screens you have migrated.

```ts
const g = gritql({ adapters })   // strict: true, output: 'records'
```

### Strict mode

Strict mode rejects the v3 string grammars. Each error names the replacement, so the fastest way through is to compile every query and follow the messages.

| v3 | v4 |
|---|---|
| `fetch(brand: Adidas, date_gt: "2024-01-01")` | `fetch(where: { brand: "Adidas", date: { gt: "2024-01-01" } })` |
| `fetch(filters: $f)` | still fine; `where: $f` when `$f` has a column named `from`, `having` or `search` |
| `divide(a: "sum|revenue", by: "|orders")` | `divide(a: { sum: revenue }, by: { field: orders })` |
| `join(table: t, by: "@id:@pid")` | `join(table: t, on: { pid: "@id" })` |
| `@filter(value_gt: 1)` on a dimension | `@filter(where: { value: { gt: 1 } })` |
| `@groupOn(value_lt: 5, replacers: {...})` | `@groupOn(where: { value: { lt: 5 } }, replacers: {...})` |
| `@parse(as: "int:16")`, `"date:format:yyyy"` | `@parse(as: { int: 16 })`, `@parse(as: { date: { format: "yyyy" } })` |
| `$x` used but not declared | declare it: `query q($x: String)` |

### Records output

Each dimension becomes an array of records that carry their own value:

```json
// output: 'keyed' (v3)
{ "DE": { "mobile": { "revenue": 1 }, "desktop": { "revenue": 2 } } }

// output: 'records' (v4 default)
[{ "country": "DE", "device": [{ "device": "mobile", "revenue": 1 }, { "device": "desktop", "revenue": 2 }] }]
```

Front-end code that did `Object.entries(result.data)` becomes `result.data.map(...)`. A dimension that should stay keyed says `type: Map`; that also lets you migrate one level at a time.

An empty result is `[]` in records mode and `{}` in keyed mode.

### New things worth using

- **`where:`** treats every key as a column, so filters on columns named `from` or `having` work.
- **`having:` on a fetch** filters on aggregated values; it works on PostgreSQL too, where v3's alias `HAVING` failed.
- **Period comparisons in one statement**: put the baseline in `with()` and use `@diff(by: prev)`. An emitted `fetch` used as a baseline runs twice.

---

## Checklist

- [ ] `gqlToDb()` replaced by `gritql({ adapters, strict: false, output: 'keyed' })`.
- [ ] Every `setupProvider` became an adapter; SQL rewrites moved into the adapter's `compile`.
- [ ] `querier(q, v, provider)` calls became `g.run(q, v, { adapter })`.
- [ ] `beforeDbFetch` / `afterDbFetch` / `emitter` replaced by middleware, `compile()` or `ctx.timings`.
- [ ] Custom metrics rewritten as resolvers; `buildFullName` → `ctx.col`, `buildFilter` → `ctx.where`.
- [ ] Deep imports from `gritql/dist/*` replaced by imports from `gritql`.
- [ ] GA, `@map`/`@tuple`, `by_in`/`by_like` usages removed.
- [ ] Every query document compiles: run `g.compile()` over all of them in a test.
- [ ] Screens using nested `limit`, `@diff`/`@divide`, `@filter` or list filters checked by hand.
