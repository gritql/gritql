# gritql v4 specification

gritql turns a GraphQL-shaped analytics query into one or more SQL statements, runs them through an adapter, and assembles the flat rows into the nested object the query describes. v4 is a greenfield rewrite of v3 with the same query language and the same output shapes, a plan tree as the single intermediate representation, and one extension shape for metrics, dimensions, directives and middleware.

Normative words: MUST, MUST NOT, SHOULD, MAY.

---

## 1. Pipeline

```
source text + variables
  │ 1 parse        graphql.web for executable definitions; own parser for type blocks
  │ 2 plan         AST → Plan { fetches: Fetch[] }  (variables substituted, args validated, fragments inlined,
  │                 @include/@skip/@compare evaluated, directives attached)
  │   hook plan    resolvers / directives / middleware edit the Plan (async allowed)
  │ 3 lower        Plan → Physical[]  (grain split, CTE ordering, joins, unionall, windows for nested limit)
  │ 4 sql          Physical → knex QueryBuilder → Req { sql, params }   (resolvers contribute expressions)
  │   hook query   optional escape hatch on the finished builder
  │ 5 execute      adapter.execute(req) → Row[]      (around-style middleware)
  │ 6 assemble     Row[] per Physical → one tree per fetch alias (pass 1 = baseline)
  │   hook result  directives / middleware transform the output, reading baseline
  ▼
output
```

`compile()` runs steps 1–4 and returns the requests without touching an adapter connection. `run()` runs all six.

Timings for each step are written to `ctx.timings` (ms) and are available to `result`-stage middleware.

---

## 2. Query language

### 2.1 Document

A document holds zero or more type blocks, zero or more fragments, and one or more operations. All operations run; their results are merged into one output object. The operation name is the default table; a fetch in an anonymous operation MUST name its `table` or planning fails with `PLAN` (v3 silently emitted SQL without a FROM clause).

Fragments may declare variables, `fragment F($a: String!) on Any { ... }`, and are then instantiated with `use(fragment: F, a: pageviews)` inside a selection; plain `...F` spreads a fragment without variables. Fragment variables are validated like operation variables and overlay them while the fragment is inlined. graphql.web does not parse fragment variable lists, so the pre-parser lifts them out the same way it lifts type blocks.

```graphql
input Date { gte: String!  lte: String! }
input Filters { country: String  date: Date!  domain: OrArray }

query ii_transactional($filters: Filters, $limit: Number) {
  matrix: fetch(filters: $filters) {
    domain(type: Array, sort_desc: value, limit: $limit) {
      value: sum(a: transactionrevenue)
    }
  }
}
```

### 2.2 Type blocks and variables

Supported definitions: `input`, `type`, `enum`, `union`. Field types: `Name`, `[Name]`, with `!` on the name or the list. Base types: `Any`, `Number`, `String`, `Bool`, `Object`, `Array`. `type` is validated as an exact shape (no extra keys), `input` as a loose shape. `@inherits(name: Other)` on a type prepends the fields of `Other`. `@map` and `@tuple` from v3 are not supported (no known usage).

Variables are validated against their declared type before planning (`TYPE` error). A `$var` that is undefined removes the innermost argument, object field or list item whose value it is (`limit: $limit` with no value means no limit; `filters: { id: $id, domain: $domain }` with `$domain` undefined becomes `filters: { id: ... }`). Default values in variable definitions apply. A `$var` that is not declared by the operation is substituted from `variables` without type checking (v3 behaviour; consumers rely on it).

### 2.3 Fetch forms

| form | meaning |
|---|---|
| `alias: fetch(args) { tree }` | one output tree under `alias` |
| `fetch(args) { tree }` (no alias) | the tree is the operation result itself |
| `alias: with(args) { tree }` | a CTE named `alias`, not emitted; readable through `table: alias` |
| `alias: fetchPlain(args) { tree }` | raw rows: an array holding one row array per physical query (always nested, as in v3: consumers read `alias[0]`) |
| `alias: unionall(table: a, table: b, ...) { tree }` | source is `select * from a union all select * from b` |

Fetch arguments:

- `table: name` — source table or `with` alias. Default is the operation name.
- `filters: { ... }` — filter object, see 2.6.
- `search: { field: "text" }` — full text search (dialects that support it).
- `join | leftJoin | rightJoin | fullJoin | innerJoin | leftOuterJoin | rightOuterJoin | fullOuterJoin: { table, on | by }` — see 2.7.
- legacy inline filters: `fetch(brand: Adidas, date_gt: "2020-1-1")`. A bare `name: value` is `eq`; suffixes `_gt _gte _lt _lte _like _in` map to the operator; `_in` takes a `|`-separated string (`category_in: "1|11"`). Enum literals are strings.

Several fetches MAY share an alias; their trees merge into one output tree by dimension keys. A fetch dropped by `@include`/`@skip` contributes nothing. Two surviving `with` fetches under one alias are a `PLAN` error (consumers pair them with exclusive `@include`/`@skip`). `fetchPlain` rows are returned as they come: no `result` hook runs on them.

### 2.4 Tree

Every selection inside a fetch is a **node**. A node with a selection set is a **dimension**; a node without one is a **metric**. A node is resolved by the resolver registered under its name; a name with no resolver is the **default** resolver of its kind.

```graphql
device(type: Array, sort_desc: value, limit: 5) {       # dimension: default resolver, column "device"
  value: sum(a: sessions)                                # metric: resolver sum
  share: share(a: sessions, by: device)
  title                                                  # metric: default resolver, plain column
  date: groupBy(field: date, by: month) { value: sum(a: x) }   # dimension: resolver groupBy
}
```

Dimension arguments common to every dimension: `type: Map | Array` (default Map), `sort_asc: name`, `sort_desc: name`, `sort: asc|desc` with `field`, `limit`, `offset`, `having: { ... }`, `from: table`. A metric's `sort` orders by the metric's output alias.

Metric argument conventions: `a` is the measured column, `by` a partition or second operand, `from: table` qualifies the column. A column written `@name` is qualified with the fetch table. Arithmetic metrics accept `"fn|column"` to pick the aggregate (`"count|sessions"`) or `"|column"` for the raw column. Every metric also accepts `sort: asc|desc`, `limit`, `offset`, which apply to the statement that selects it (`distinct(limit: 5)`, `updated(limit: 1, sort: desc)` orders by the metric itself), and `type: Array`, which assembles the metric like an Array dimension keyed by its own value (`country: distinct(type: Array)` → `[{country: 'FR'}, ...]`). `sort` without `field` on a dimension is a no-op, as in v3.

### 2.5 Directives

Directives attach to a node or a fetch. They run in document order on the node. Each directive is a resolver (section 4) and may act in the `plan` stage, the `result` stage, or both.

### 2.6 Filter object

```
Filter      := { (field: Pred | Logical)* }
Pred        := scalar | [scalar] | { Op: value, ... }
Op          := eq ne gt gte lt lte in nin like ilike isNULL search hasAny hasAll RegExp~ RegExp!~ RegExp~* RegExp!~*
Logical     := and: [Filter] | or: [Filter] | nor: [Filter] | not: Filter | having: Filter | from: table
```

A scalar predicate is `eq`; a list is `in` (an empty list matches nothing; an empty `nin` matches everything). An operator key without a field (`or: [{ gte: 1 }]`) is an `ARGS` error. `having` holds predicates on aggregated aliases and is compiled without table qualification; it works where the dialect accepts output aliases in HAVING (ClickHouse, MySQL) and for real columns on PostgreSQL. `from` qualifies the following fields with a table. A value string starting with `@` is a column reference (used in join `on`). Operators with non-GraphQL names (`RegExp~`) are reachable only through variables. `hasAny`/`hasAll` are ClickHouse only; `search` and the search metrics are PostgreSQL only.

### 2.7 Joins

```graphql
pre: with(filters: $f) {
  join(table: table_catalog, on: { product: "@product", country: "@country" }) {
    product(type: Array, from: table) { price: unique(a: price, from: table_catalog) }
  }
}
```

A join node adds a join to its fetch and is transparent in the output (its children are placed as if they were its siblings). `on` is a filter object: each key names a column of the **joined** table and a string value written `@col` names a column of the **fetch** table, so `on: { pid: "@id" }` compiles to `JOIN products ON products.pid = <fetch_table>.id`. `by: "@fetch_col:@joined_col"` (repeatable) is the shorthand for `on: { joined_col: "@fetch_col" }`; `by_gt`, `by_gte`, `by_lt`, `by_lte` read left to right (`by_gt: "@a:@b"` means `fetch.a > joined.b`). v3's `by_in` (column IN column) and `by_like` (not reversible onto the joined column; write it as `on`) are dropped and rejected as `ARGS`. Joins may also be given as fetch arguments.

---

## 3. Plan model

```ts
interface Plan {
  fetches: Fetch[]                 // document order
  variables: Record<string, unknown>
}

interface Fetch {
  alias: string | null             // null = unaliased, merges into the root output
  kind: 'fetch' | 'with' | 'fetchPlain' | 'unionall'
  source: string | string[]        // table name, `with` alias, or tables for unionall
  filters: FilterExpr | null       // normalized filter object (2.6)
  search: Record<string, string>
  joins: Join[]
  tree: Node[]
  directives: DirectiveUse[]
  emit: boolean                    // false for `with` and anything a plan hook hides (present in baseline, absent from output)
  variables: Record<string, unknown>  // every $var after defaults
}

interface Node {
  alias: string                    // output key: alias, else field name
  name: string                     // resolver name (field name when no alias)
  kind: 'metric' | 'dimension'
  args: Record<string, unknown>    // validated, variables substituted
  children: Node[]                 // dimensions only
  directives: DirectiveUse[]
  emit: boolean
}

interface DirectiveUse { name: string; args: Record<string, unknown>; state: Record<string, unknown> }
interface Join { type: JoinType; table: string; on: FilterExpr }

// Helper functions for the `plan` stage (plain data stays plain; exported from the package)
fetchOf(plan, alias): Fetch | undefined           // first fetch with that alias (null = unaliased)
nodeAt(fetch, path: string[]): Node | undefined   // node by output-key path, e.g. ['date', 'value']
insertNode(fetch, path: string[], node: Node)     // insert under the parent named by path; creates missing dimensions
cloneNode(node): Node                             // deep copy with fresh directive state
```

Plan objects are plain data; `args` keeps every argument as written, and an argument name repeated in the document (`unionall(table: a, table: b)`, several `by:` on a join) collects into an array.

A node's `path` is the list of output keys from the fetch root (`['date', 'device', 'value']`); directives receive it as `ctx.path`. Plan hooks may add, remove and reorder fetches and nodes, change args, add joins and filters, and insert hidden nodes (`emit: false`). After the `plan` stage the plan is treated as read-only by the engine.

---

## 4. Resolvers (the one extension shape)

```ts
interface Resolver<A = Record<string, unknown>> {
  args?: ArgsSchema<A>                       // validated once; unknown args are allowed unless `strict: true`
  strict?: boolean
  columns?(node: Node, ctx: Ctx): string[]   // output columns this node produces; default [node.alias]
  group?: boolean                            // metric whose expression also joins GROUP BY (unique, default dimension)
  distinct?: boolean                         // metric that turns the SELECT into SELECT DISTINCT

  plan?(node: Node | Fetch | undefined, ctx: Ctx): void | Promise<void>   // undefined for middleware (use ctx.plan)
  sql?: SqlFn | Partial<Record<Dialect | '*', SqlFn>>
  query?(qb: Knex.QueryBuilder, physical: Physical, ctx: Ctx): Knex.QueryBuilder
  execute?(req: Req, next: (req: Req) => Promise<Row[]>, ctx: Ctx): Promise<Row[]>
  result?(cell: Cell, ctx: Ctx): CellResult | void        // see 7.1
}

interface Cell {
  value: unknown                       // the metric value being written
  row: Row                             // the source row (shared by every cell of that row)
  keys: Record<string, unknown>        // dimension values of the row by output key; a copy directives may rewrite
  node: Node                           // the metric node
  path: string[]                       // output-key path of the metric
  index: number                        // row index within its physical result
}
interface CellResult {
  value?: unknown                      // replace the value
  skip?: boolean                       // do not write this cell
  skipAll?: boolean                    // do not write any further cell of this row
  keys?: Record<string, unknown>       // relocate: write the cell as if the row had these dimension values
  set?: Record<string, unknown>        // also write these sibling keys next to the cell
}

type SqlFn = (node: Node, ctx: Ctx) => Knex.Raw | Knex.Raw[] | SqlParts
interface SqlParts {
  select?: Knex.Raw[]              // aliased expressions; default []
  pre?: Knex.Raw[]                 // columns computed on the source before aggregation (window functions)
  groupBy?: Knex.Raw[]             // extra group expressions
  having?: Knex.Raw[]
}

interface Ctx {
  plan: Plan
  fetch?: Fetch                    // absent for middleware plan hooks
  node?: Node                      // the node a directive is attached to
  args: Record<string, unknown>    // directive args when running a directive
  state: Record<string, unknown>   // per directive occurrence, shared by its plan and result hooks
  chain: { value?: unknown }       // shared by the directives of one node in the plan stage (`@compare` → `@include`)
  remove(): void                   // plan stage: drop the node or fetch the directive sits on
  variables: Record<string, unknown>
  adapter: Adapter
  dialect: string
  knex: Knex                       // builder for the active dialect, no connection
  physical?: Physical              // stage 4 only: grain, table, column helpers
  col(name: string, from?: string): string          // qualified column name honoring `@` and `from`
  where(filter: FilterExpr): Knex.Raw               // compile a filter object to a raw predicate
  baseline?: Output                // stage 6, pass 2 only: output of pass 1 keyed by fetch alias; read-only by contract (not frozen, for throughput)
  output?: Output                  // stage 6 only: the output being written, keyed by fetch alias
  at(fetchAlias: string | null, keys: Record<string, unknown>, path: string[]): unknown
                                   // read baseline: `path` is the output-key path inside the fetch; Array levels are
                                   // resolved by the element's key columns taken from `keys`, never by position;
                                   // the shape comes from every fetch sharing the alias
  values?(tree: unknown, fetchAlias: string | null, path: string[]): unknown[]   // every value at path (@indexed)
  path?: string[]                  // output-key path of the node a directive sits on
  timings: Record<string, number>
}
```

Rules:

1. **Buckets decide meaning.** The same shape is registered as a metric, a dimension, a directive or middleware. A metric's `sql` yields its expressions; a dimension's `sql` yields its grouping columns; a directive's hooks run only where its `@name` appears; middleware hooks run for every plan, physical query and output. A metric or dimension resolver's `plan` hook runs for each node it resolves (after the node's directives), its `query` hook on that node's statement, and its `result` hook on every cell of the node (dimension: row-level).
2. **Expressions, not builders.** `sql` returns `Raw` or `SqlParts`. The engine composes SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, OFFSET and CTEs. `query` is the only hook that sees the builder and is meant for two-level aggregations such as `aggrAverage`.
3. **Dialect dispatch.** `sql` as a map picks the entry for the active dialect, else `'*'`. No entry means the node is rejected at compile time with the resolver and dialect named. A plain function serves every SQL dialect.
4. **Ordering.** Middleware runs in registration order. Directives on one node run in document order. Within a stage all middleware runs before any directive. A middleware `result` hook runs for every cell of every fetch (as a row-level hook) and, like a directive's, makes assembly two-pass.
5. **State.** `ctx.state` is created per directive occurrence per request. Nothing else is shared between hooks.
6. **Validation.** `args` schemas are checked after variable substitution; failures throw `GritqlError` with the node path. Required args missing → error. A dimension or metric whose name has no registered resolver uses the default resolver of its kind (so `date { device { ... } }` needs no registration). An unknown directive name is an error.

Registration:

```ts
const gql = gritql({ adapters: { pg: pgAdapter, clickhouse: chAdapter }, default: 'pg' })
gql.use({ metrics: { sumIf }, dimensions: { combine }, directives: { diff }, middleware: [cache] })
await gql.run(text, variables, { adapter: 'clickhouse' })
await gql.compile(text, variables)         // → { plan, physicals, queries: [{ physical, sql, params, text }], timings }  (text = inlined values)
```

Later registrations under the same name replace earlier ones. Built-ins are registered first, so a consumer overrides `divide` by registering its own.

---

## 5. Adapters

```ts
interface Adapter<Req = SqlReq> {
  name: string
  dialect: string                      // knex client name: pg, mysql2, snowflake, clickhouse (plugin), ...
  knex?: Knex                          // builder used for printing; created from `dialect` when absent
  compile?(qb: Knex.QueryBuilder, physical: Physical): Req     // default: toSQL().toNative()
  execute(req: Req): Promise<Row[]>
}
type SqlReq = { sql: string; params: unknown[] }
```

Provided helpers: `knexAdapter({ dialect, execute, compile? })`, `pgAdapter(knexInstance)`, `clickhouseAdapter(client, { knex? })`, `fixtureAdapter(rowSets)` for tests. No database driver is a dependency of gritql; the caller passes a configured knex or client.

`compile` is where whole-statement text rewriting belongs (ClickHouse `float4` → `Nullable(Float32)`, `FINAL`, settings).

---

## 6. Lowering

### 6.1 Grains

For each fetch, walk the tree. A **grain** is the list of dimension nodes on the path from the fetch root to a selection set that holds at least one metric. One **Physical** query is produced per grain. Sibling dimensions produce separate grains. A selection set that ends with no metric and no dimension (emptied by `@include`/`@skip`) still produces a physical query selecting the dimension columns.

```graphql
fetch { date { total: sum(a: x)  device(type: Array) { value: sum(a: x) } } }
# physical 1: select date, sum(x) as total              group by date
# physical 2: select date, device, sum(x) as value      group by date, device
```

Physical queries are ordered by pre-order traversal with the metric grain before child-dimension grains, which is also the order in which `execute` runs them and in which a test harness feeds row sets. A selection set that holds only dimensions (`fetch { date { a } device { b } }`) produces no query of its own; v3 emitted a `select * from table` there, so harness row sets ported from v3 drop that leading empty entry (see COMPAT).

### 6.2 Physical

```ts
interface Physical {
  id: string
  fetch: Fetch                        // its `source` is the table, with alias, or unionall tables
  grain: Node[]                       // dimension nodes, root first
  metrics: Node[]
  ctes: string[]                      // with aliases this query depends on, dependency order
  path: string[]                      // output-key path of the grain
}
```

### 6.3 SELECT / GROUP BY

Each dimension contributes `columns()` (default: its own column aliased to `node.alias`) and the same expressions to GROUP BY. `groupBy(field, by)` contributes `date_trunc(by, field) as alias` inline rather than through a subquery. `groupByEach(field, each)` contributes the bucket label expression and groups by the bucket index. `combine(fields)` contributes each field. Metrics contribute their `select`; a metric with `group: true` (`unique`) is also grouped; one with `distinct: true` sets SELECT DISTINCT.

`pre` expressions are computed in a derived table over the filtered source (`from (select *, <pre> from t where ...) as t`), so window functions see the filtered rows before aggregation. A metric that uses `pre` selects the generated column in the outer statement and adds it to GROUP BY (`ranking`: `select t.rank from (select *, DENSE_RANK() OVER (ORDER BY price DESC) as rank from t where ...) as t group by t.rank`). Reverse rankings add a second level: `max(rank) over () - rank + 1`.

### 6.4 WHERE / HAVING

Fetch `filters` compile to one predicate, legacy inline args compile to `AND`ed predicates, `search` to the dialect's full text predicate. `having` from `filters.having` and from dimension `having` args compile to HAVING. A filter object carrying `inherited: false` drops its predicates whose `from: t` names neither the fetch table nor a joined table (v3 behaviour, kept for filter objects written for a `with` and reused on a fetch reading it). `from: "@"` means the fetch table.

### 6.5 ORDER / LIMIT / OFFSET

`sort_asc`, `sort_desc`, `sort`+`field` on any dimension in the grain, and `sort` on a metric, add ORDER BY on the named alias or column. `limit` and `offset` on the **root** dimension, on a metric, or anywhere inside a `with`/`fetchPlain` (single flattened statement) apply to the statement. `limit`/`offset` on a **nested** dimension are per parent: the grouped statement is wrapped as a derived table and filtered with `row_number() over (partition by <outer dimension columns> order by <sort>)`, one layer per bounded dimension, outermost first; a statement-level limit applies last. v3 applied them globally (`country { device(limit: 3) }` returned three rows in total); see COMPAT.

### 6.6 CTEs, unionall, joins

A `with` fetch is lowered at its finest grain (all its dimensions grouped) into one CTE. A statement lists in `ctes` every `with` alias it depends on, discovered recursively through its source, each `unionall` branch and each join target (a `with` that joins another `with`, then a `unionall` over both, needs all three). Dependencies are emitted in topological order; a cycle is a `PLAN` error. `unionall` sources become a derived table `(select * from a union all select * from b) as unionall_a_b`. Joins become `JOIN table ON <predicate>` with `@` references qualified as described in 2.7; the joined table's columns are selectable with `from: table`.

### 6.7 fetchPlain

Lowered as a single physical query with all dimensions grouped and all metrics selected. Its result is an array of row arrays, one per physical query (so always `[rows]` for the single-statement case), exactly as v3 returned it.

---

## 7. Assembly

Assembly is a streaming write: physical queries are visited in execution order, rows in row order, and each metric cell is written into the tree at the location its dimension path names. Writing is what creates objects and elements, so nothing exists in the output that no cell reached.

Location rules (these are the v3 `progressive` path semantics restated):

- A **Map** dimension (default) steps into the object under the key that is the row's value for that column, creating it when missing. Keys are the raw string form; special characters are not escaped.
- An **Array** dimension steps into the element whose identity columns equal the row's values (compared by string form), creating it when missing with those columns stamped on it under their output keys. Elements appear in the order they were first created. Where the array lives: the array **is** the parent value when the Array dimension is the only thing written there so far (`date { device(type: Array) {...} }` → `'2022-01-01': [...]`; at the fetch root the tree itself becomes the array); when the parent location already holds a non-empty object (a sibling metric wrote first, or the parent is an Array element carrying its own key columns), the array is stored in that object under the dimension's output keys joined with `;` (`total: 3, device: [...]`; `{channels: 'Social', country: [...]}`). Metric grains are executed before child-dimension grains, which is what makes these cases deterministic.
- `combine` is an Array or Map dimension with several identity columns.
- Metrics are written as `alias: value` on the object reached by their dimension path. A metric's `columns()` may name several keys; each is written.
- `type: Array` at the root makes the fetch result an array.
- Several fetches with the same alias, or several unaliased fetches, write into one tree.
- Values are not coerced; database drivers decide the JS type (`@parse` converts).

The output object maps fetch aliases to trees. An unaliased fetch's tree is the output itself when every fetch is unaliased; otherwise the unaliased trees form one tree stored under the key `''`.

### 7.1 Two passes, baseline and result hooks

Assembly runs twice when any fetch carries a directive with a `result` hook.

**Pass 1** assembles every fetch with `ctx.baseline` undefined. `result` hooks run in this pass too; a hook that needs the other fetches returns nothing (or `{ value }`) until `baseline` exists, so a hook such as `@parse` applies in both passes while `@diff` applies only in pass 2. The pass-1 output, keyed by fetch alias, is exposed to pass 2 as `baseline`.

**Pass 2** re-assembles from scratch the alias groups that carry `result` hooks (the others keep their pass-1 tree). For each metric cell, before the write, the engine runs the chain of `result` hooks: the fetch's own directives, then the hooks of each ancestor dimension from the fetch root down, then the metric's own, each in document order. A hook receives a `Cell` and returns a `CellResult`:

- `value` replaces the value for the rest of the chain and for the write.
- `skip` drops this cell. `skipAll` drops this cell and every later cell of the same row in this physical query. Dropping every cell of an element means the element is never created, so pruning is implicit, and the element order follows the first surviving write (a row for an earlier key that survives late lands in a later position, as in v3).
- `keys` relocates: the write uses these dimension values instead of the row's. A relocated write of a number into a key that already holds a number adds to it; anything else replaces. This is how `@groupBy(by: month)` and `@groupOn` merge elements. The relocated element's identity columns are the new keys; nothing is copied into nested objects.
- `set` writes additional `key: value` pairs on the object that receives the cell (used by `@groupOn(replacers)`).

`@filter`, `@groupOn`, `@groupBy`, `@diff`, `@subtract`, `@divide`, `@indexed` and `@omit` act only once `baseline` exists (pass 2); `@parse` acts in both. A hook attached to a fetch or a dimension is **row-level**: the engine runs it once per row (for the row's first cell) and reuses its `CellResult` for the row's other cells, so `@parse` on a dimension rewrites the row once and `@filter` on a dimension decides once per row. Only a result that decides something for the row (`skip`, `keys`, `set`) is reused; a hook that returns `value` or nothing runs again for the row's other cells, since both may depend on the cell. A dimension hook that needs the row's baseline element reads it at its own path (`ctx.at(alias, cell.keys, ctx.path)`), so `country @filter(total_gt: 5) { total device { value } }` drops the country from every grain. A hook attached to a metric runs per cell. Pruning is implicit: a container nobody writes into is never created, so `@filter` on a dimension removes the element from every grain by returning `skipAll` for each of its rows.

Cross-fetch reads go through `ctx.at(alias, keys, path)`, which resolves the location in `baseline` by dimension key values (Array levels by the element's key columns, Map levels by key), never by array index, and returns `undefined` when the fetch or element is missing. `@divide(byField)` reads the sibling metric from `baseline` at the same keys. Arithmetic on a missing reference yields `NaN`, as in v3.

---

## 8. Built-in catalogue

### 8.1 Metrics (`sql` expressions, PostgreSQL text shown; dialect maps where needed)

| name | args | expression |
|---|---|---|
| default (bare name) | — | `col as alias` |
| sum / min / max / count / avg | a, by? | `SUM(a)`; with `by`: `SUM(a) OVER (PARTITION BY by)` (avg casts `::float4`) |
| count | a? | `COUNT(a)`; without `a` or with `a: "*"`: `COUNT(*)` |
| countDistinct | a | `count(distinct a)` |
| unique | a? | `col as alias`, `group: true` |
| any | a? | `any(col)` |
| from | a?, from! | `t.col as alias` |
| distinct | — | `distinct: true`, `col` |
| percentile | a!, factor=0.5 | `PERCENTILE_CONT(f) WITHIN GROUP (ORDER BY a)` |
| median | a!, by? | `MEDIAN(a) OVER(...)` |
| share | a!, by? | `sum(a)/NULLIF(sum(sum(a)) OVER(PARTITION BY by), 0)::float4` |
| indexed | a!, by?, alg=max\|first | `sum(a)/NULLIF(max(sum(a)::float) OVER(...), 0)::float4`; `alg: first` uses `first_value(...)` |
| divide | a!, by! (`fn\|col` syntax) | `cast(fa(a) as float)/NULLIF(cast(fb(by) as float) + 1e-10, 0)::float4` |
| diff | a!, by! | as divide, then `- 1` |
| subtract | a!, by! | `cast(fa(a) as float)-cast(fb(by) as float)` |
| multiply | a!, by! (by may be a number) | `cast(fa(a) as float)*cast(fb(by) as float)::float4`, or `*<number>::float4` |
| avgPerDimension | a!, per! | `sum(a)::float / count(distinct per)::float4` |
| ranking | a!, by?, alg=denseRank\|rank\|rowNumber\|reverse* | `pre`: `DENSE_RANK() OVER (PARTITION BY by ORDER BY a DESC) as alias`; outer selects and groups by `t.alias`; reverse variants compute `max(alias) over () - alias + 1` in a second level |
| searchRanking / searchHeadline | a! | pg `ts_rank` / `ts_headline` against `fetch.search[a]`; error when no search for that column |
| aggrAverage | to!, by! | two-level aggregation through `query`; emits column `${alias}_aggrAverage` (declared via `columns()`, v3 quirk kept) |
| weightAvg | a!, by! | two-level aggregation through `query` |
| join family | table!, on \| by | adds a join; transparent in output |

### 8.2 Dimensions

| name | args | columns / grouping |
|---|---|---|
| default | type, sort_*, limit, offset, having, from | `col` grouped |
| groupBy | field!, by (date_trunc unit), alias | `date_trunc(by, field) as alias` grouped by the expression; on ClickHouse only, grouped by the alias when it shadows the source column (cyclic-alias rule; PostgreSQL would resolve that name to the input column) |
| groupByEach | field!, each | bucket label `"lo-hi"` grouped by bucket index; hidden `_min`/`_max` columns are not emitted |
| combine | fields! (names or `{name, alias, resolver, ...args}`) | each field is a column and a group key; output key per field |
| join family | table!, on \| by | adds a join; children are lifted to the parent |

### 8.3 Directives

| name | stage | semantics |
|---|---|---|
| include(if) / skip(if) | plan | drop the node or fetch when the condition says so; accept the value produced by a preceding `@compare` |
| compare(value?, eq\|neq\|gt\|gte\|lt\|lte\|in\|nin\|of\|nof\|contains\|ncontains\|startsWith\|endsWith\|nStartsWith\|nEndsWith) | plan | computes a boolean passed to the next directive on the node; chained operators all compare the original value |
| omit(full?) | result | `skip` in pass 2, so the value is present in baseline but not in the output; `full` skips in both passes |
| diff(by) | result | `value / at(by, keys, path) - 1` once baseline exists; `NaN` when the reference is missing |
| subtract(by) | result | as diff with `value - ref` |
| divide(by \| byField) | result | `value / ref`, ref from another fetch at the same keys, or the sibling metric `byField` in baseline |
| indexed(to \| group) | result | `value / max` over the members: the node's own fetch plus `to`, or every node in any fetch tagged with the same `group`; max is computed over baseline once per directive occurrence |
| filter(<metric>_<op>: v on a dimension; <op>: v on a metric) | result | on a metric: `skip` when the value fails; on a dimension: `skipAll` for every row whose baseline element fails, so the element disappears from every grain; ops `eq gt gte lt lte in nin of nof contains ncontains startsWith endsWith nStartsWith nEndsWith` |
| groupOn(<metric>_<op>: v, replacers) | result | rows whose baseline element matches are relocated with `keys` = `replacers` merged over the row's keys; numbers add up, strings last-wins; `set: replacers` is written on the grouped element when the metric is its direct child (`channels: "Other"` inside the `Other` entry) |
| groupBy(by: day\|week\|month\|quarter\|year) | result | relocates every row to `keys` with the date truncated to the unit's start (`2022-01-05` → `2022-01-01` for month; weeks start Monday, `2022-06-19` → `2022-06-13`); numbers add up; the truncated date replaces the element's key column and is never copied into nested objects (`{ date: '2022-01-01', mobile: {...} }`). v3 double-counted sibling metrics here; v4 sums each once (COMPAT) |
| parse(as) | result | on a metric replaces the value; on a dimension rewrites the row's dimension value once per row and relocates with it. `int[:radix]`, `float[:precision]` (returns the `toFixed` string, as v3), `date[:iso\|iso-date\|iso-week-date\|iso-time\|format:<pattern>]`; implemented without luxon; `date` accepts `Date` objects, ISO strings and SQL `YYYY-MM-DD HH:mm:ss` strings |

### 8.4 Filter operators

`eq ne gt gte lt lte in nin like ilike isNULL not and or nor having from search hasAny hasAll RegExp~ RegExp!~ RegExp~* RegExp!~*`. ClickHouse maps the RegExp family to `match`/`ilike`.

---

## 9. Extension examples

```ts
// metric, one dialect
const sumIf: Resolver<{ a: string; case: FilterExpr }> = {
  args: { a: PropTypes.string.isRequired, case: PropTypes.object.isRequired },
  sql: { clickhouse: (n, c) => c.knex.raw('sumIf(??, ' + c.where(n.args.case) + ') as ??', [c.col(n.args.a), n.alias]) },
}

// override of a built-in for one dialect, built-in kept elsewhere
const divide: Resolver = {
  args: builtins.metrics.divide.args,
  sql: { clickhouse: (n, c) => c.knex.raw('CAST(sum(??) AS Nullable(Float64)) / NULLIF(sum(??), 0) as ??', [c.col(n.args.a), c.col(n.args.by), n.alias]),
         '*': builtins.metrics.divide.sql },
}

// metric with several output columns
const groupArray: Resolver<{ fields: string[] }> = {
  args: { fields: PropTypes.arrayOf(PropTypes.string).isRequired },
  columns: (n) => n.args.fields,
  sql: (n, c) => n.args.fields.map((f) => c.knex.raw('groupArray(DISTINCT ??) as ??', [c.col(f), f])),
}

// directive with a pre-query and a post-query effect
const diff: Resolver<{ by: string }> = {
  args: { by: PropTypes.string.isRequired },
  plan(node, { plan, path, args }) {
    const ref = fetchOf(plan, args.by)
    if (ref && !nodeAt(ref, path)) insertNode(ref, path.slice(0, -1), { ...cloneNode(node), directives: [] })
  },
  result(cell, { at, args }) {
    const ref = at(args.by, cell.keys, cell.path)
    return typeof ref === 'number' ? { value: (cell.value as number) / ref - 1 } : undefined
  },
}

// result-only directive on a metric
const parseInt10: Resolver = {
  result: (cell) => ({ value: parseInt(String(cell.value), 10) }),
}

// middleware: cache around execute
const cache = (store: KV, ns: string): Resolver => ({
  async execute(req, next, { adapter }) {
    const key = hash(ns, adapter.name, req)
    return (await store.get(key)) ?? store.set(key, await next(req))
  },
})

// middleware: async rewrite of filters before SQL exists
const categoryToDomains: Resolver = {
  async plan(_, { plan }) {
    for (const f of plan.fetches) await rewriteFilter(f.filters, 'category', 'domain', lookupDomains)
  },
}
```

---

## 10. Errors

All failures throw `GritqlError { code, message, path?: string[], cause? }`. Codes: `PARSE`, `TYPE`, `ARGS`, `UNKNOWN_RESOLVER`, `DIALECT`, `PLAN`, `EXECUTE`, `RESULT`. Nothing is logged to the console by the library.

---

## 11. Compatibility with v3 (summary; details in COMPAT.md)

Same: query language, output shapes, built-in names and argument names, filter grammar, baseline semantics for cross-fetch directives, ordering of physical queries.

Changed:

- `gqlToDb()` → `gritql({ adapters })`; `useResolver`/`useDimensionResolver`/`useDataResolver`/`useProvider`/`setupProvider` → `use({ metrics, dimensions, adapters })`; `beforeDbFetch` → `compile()` or a `plan`/`execute` middleware; `afterDbFetch` → `execute` middleware; `emitter` → `ctx.timings`.
- Metrics return expressions instead of mutating the knex builder; keyword allowlists are gone; dialect support is declared through the `sql` map.
- Nested `limit`/`offset` are per parent (v3: global).
- A selection set holding only sibling dimensions no longer emits an empty `select * from table` statement; v3 did, so harness row sets lose that entry.
- A fetch in an anonymous operation without `table` is a `PLAN` error; v3 printed SQL without a FROM clause.
- `fetchPlain` keeps v3's `[rows]` nesting.
- Filter predicates are composed by knex, so parenthesization in SQL text differs from v3 snapshots.
- `groupBy(field, by)` dimension no longer wraps the source in a subquery.
- Google Analytics provider removed. `@map`/`@tuple` type directives removed. `@parse(as: "date:rfc2822|http|locale|locale-preset")` removed (luxon-only formats, unused).
- `@groupBy` directive sums each metric once (v3 double-counted sibling metrics of the grouped rows).
- Array elements are stamped with the raw column value; v3 stamped its string form.
- No console logging; errors are typed.

---

## Appendix A — review notes

Round 1 (Codex, Fable): blocking items folded into §2.2 (undeclared variables), §2.3 (`_in`), §2.4 (metric `type: Array`, `sort` without `field`), §3 (plain-data helpers, repeated argument names), §4 (`chain`, `remove`, `at` path semantics, baseline not frozen), §6 (nested limit, CTE discovery through joins and unionall, pre subquery carries WHERE), §7 (array placement), §7.1 (both passes run hooks, row-level hooks, implicit pruning), §8.3 (@omit, @groupOn, @groupBy wording), §11.

Round 2 (Fable: one blocking item, §2.7 join sides, fixed; nits folded into §2.2, §2.3, §2.4, §2.6, §3, §4, §5, §6.1, §6.4, §6.5, §7, §7.1, §8.1, §8.2, §11. Codex: SATISFIED, nits folded: §9 helper names, §4 middleware `result`, §8.1 `first_value`, §7.1 pass-2 list; COMPAT.md is written with the test port).

Accepted nits: `from: "@"` means the fetch table; two surviving `with` fetches under one alias are a `PLAN` error; redefining an `input` is allowed (last wins); error messages of the v3 directives are kept verbatim where tests match on them.

Declined for v1: `@filter` pushdown to SQL, `@map`/`@tuple`, Google Analytics adapter, luxon `format:` tokens beyond `yyyy yy MM M dd d HH H mm m ss s SSS`.
