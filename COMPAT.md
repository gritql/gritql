# Compatibility with gritql v3

The query language, output shapes, built-in names and arguments are unchanged. This file lists what differs, why, and how the v3 test suite was ported. SPEC.md §11 is the summary.

## API

| v3 | v4 |
|---|---|
| `gqlToDb()` returning a function with `.beforeDbFetch/.dbFetch/.afterDbFetch` | `gritql({ adapters, default })` with `run(text, variables, { adapter })` and `compile(text, variables, { adapter })` |
| `useResolver(name, fn)`, `useDimensionResolver`, `useDataResolver` | `use({ metrics: { name: resolver } })`, `use({ dimensions })`; the data-resolver hook is `columns()` on the same resolver |
| `useProvider` / `setupProvider`, providers with keywords and `getQueryBuilder` | `use({ adapters })` or the `adapters` option; `knexAdapter`, `pgAdapter`, `clickhouseAdapter` helpers; no driver dependency |
| `beforeDbFetch` returning `null` to abort | `compile()` returns the statements without executing |
| `afterDbFetch` | an `execute` middleware (`{ execute(req, next, ctx) }`) |
| `emitter` events | `ctx.timings` (ms per stage), readable from a middleware `result` hook or from `compile()` |
| Metric resolvers mutate the knex builder (`query.promise.select(...)`) | Metric resolvers return expressions (`Knex.Raw` or `{ select, pre, groupBy, having }`); `query(qb)` is the escape hatch |
| Post-executed directive transformers with string paths (`replacedPath`, `globalReplacedPath`, `path:`) | `result(cell, ctx)` returning `{ value, skip, skipAll, keys, set }`; `ctx.at(alias, keys, path)` for cross-fetch reads |
| Google Analytics provider | removed |
| `@map` / `@tuple` type directives | removed (no known usage) |

Dependencies: `graphql`, `graphql-tag`, `lodash`, `luxon`, `deepmerge`, `tiny-emitter`, `prop-types`, `postgres`, `snowflake-sdk` are gone. Runtime dependencies are `knex` and `@0no-co/graphql.web`.

## Query semantics

- **Nested `limit`/`offset` are per parent.** `country { device(limit: 3) }` returns three devices per country through `row_number() over (partition by country ...)`. v3 applied `limit 3` to the whole statement.
- **A selection set holding only dimensions emits no statement.** v3 emitted a `select * from table` for sibling dimensions without metrics; test harnesses that fed a row set for it drop that entry.
- **An anonymous operation has no default table.** `{ fetch { ... } }` without `table:` is a `PLAN` error; v3 printed `from null`. The ported `two queries to object` test names the table.
- **Undeclared `$variables`** are still substituted from `variables` without type checking (unchanged from v3; now written down).

## Generated SQL (snapshot differences)

All differences below were reviewed against the v3 snapshots; the semantics are the same unless marked *fixed*.

- **Parenthesization and keyword case.** Predicates are parenthesized per operator and joined with `AND`/`OR` in upper case (`("t"."a" = 1) AND (("t"."b" > 1) AND ("t"."b" < 5))`). v3 inlined top-level predicates with lower-case `and`.
- **`groupBy(field, by)` dimension** emits `date_trunc(by, field) as alias` inline and groups by the expression. On ClickHouse only, when the alias shadows the source column (`date: groupBy(field: date, by: month)`) it groups by the alias, since ClickHouse reads the expression form as a cyclic alias; PostgreSQL resolves a bare `group by "date"` to the input column, so it keeps the expression. v3 wrapped the source in a subquery that repeated the WHERE clause.
- **`groupByEach`** no longer selects the hidden `groupByEach_min_*` / `groupByEach_max_*` columns.
- **Reverse rankings** (`ranking(alg: reverseRank)` and friends) compute `max(x) over () - x + 1` on the derived table instead of a `reverse_<alias>` CTE with a scalar subquery. The window column is named `reverse_<alias>`.
- **`unique(a, from: t)`** groups by `t.col`, as v3 did; `unique` without `from` groups by the bare column.
- **Numeric literals stay numeric.** `price_gt: 126` compiles to `> 126`; v3 stringified it to `> '126'`.
- **List values in filters are `IN`.** `categories: [1, 11, 6]` compiles to `IN (1,11,6)`; v3 produced `= 1 AND = 11 AND = 6` (*fixed*).
- **`count` / `countDistinct` without an alias** are aliased by their name; v3 produced `as "undefined"` (*fixed*).
- **`having`** (fetch `filters.having` and dimension `having:`) compiles with unqualified names (`"value" > 1`), since it addresses aggregate aliases; v3 qualified them with the table. PostgreSQL does not accept output aliases in HAVING, so there `having` works on real columns and aggregate expressions only; ClickHouse and MySQL accept the alias.
- **Search metrics** read the search term by the bare column name (`title`), whether it came from `search: {}` or `filters: { search: {} }`. Defining the same field in both is an `ARGS` error, as in v3.
- **Empty lists**: `country: []` compiles to `1 = 0`, `nin: []` to `1 = 1` (v3 emitted invalid `IN ()`, *fixed*). An operator without a field (`or: [{ gte: 1 }]`) is an `ARGS` error.
- **`avg` / `median` without `by` are plain aggregates** (`avg("x")::float4`). v3 emitted `avg(x) OVER()`, which PostgreSQL rejects inside a grouped statement (*fixed*; snapshot `avg 1` regenerated).
- **Join shorthands `by_gt`/`by_gte`/`by_lt`/`by_lte`** read left to right as in v3 (`by_gt: "@a:@b"` → `fetch.a > joined.b`). `by_in` (column IN column was never meaningful) and `by_like` (cannot be mirrored onto the joined column; use `on`) are dropped and rejected as `ARGS`.
- **CTE bodies carry no nested `WITH`**: the outer statement lists every transitive `with` once, in dependency order.
- **`limit: 0` / `offset: 0`** are emitted; v3 ignored falsy values.
- **Unknown fetch arguments** (`fetch(limit: 5)`) still become equality filters on that column, as in v3.
- **Identical select expressions are emitted once** (`brand { brand }`), as v3 did through statement deduplication.

## Assembly (result differences)

- **`@groupBy` sums each metric once.** v3 double-counted sibling metrics of grouped rows (`rank: 6` where `4` is right); the ported snapshot was regenerated.
- **Array elements are stamped with the raw column value**; v3 stamped `String(value)`. Row sets in the test suites use strings, so no snapshot changed.
- **`fetchPlain`** still returns `Row[][]` (one row array per statement).
- **Mixed aliased and unaliased fetches**: the unaliased tree is under key `''`, as in v3.
- **Baseline is not frozen.** Hooks must treat `ctx.baseline` as read-only.
- **Dimension values and fetch aliases named like prototype members** (`__proto__`, `constructor`) are ordinary keys of the output; v3 lost or mis-stored them.
- **`@parse` collapsing two rows onto one key adds numeric metrics** (relocation rule); v3 kept the last row.

## Test port

| v3 suite | v4 |
|---|---|
| `gql-sql-slicer.test.ts` (67) | ported through `test/v3compat.ts` (a `gqlToDb()` shim over the engine); `Custom types directives` (@map/@tuple) dropped; `two queries to object` names its table. 66 tests, snapshots regenerated. |
| `metrics.test.ts` (15), `filters.test.ts` (9) | ported verbatim through the shim; snapshots regenerated. |
| `grit.fails.test.ts` (4) | ported as `test/regressions.test.ts`. |
| `merge.test.ts` (19) | rewritten on the v4 API (`test/merge.test.ts`); the v3 string-path custom-directive test became a `keys`/`set` test. |
| `directives.test.ts` (10) | rewritten on the v4 API; luxon oracle replaced by local-offset arithmetic; adds @groupOn/@indexed/@omit/fetch-level @include cases. |
| `progressive.test.ts` (53) | tests v3's string-path writer (`progressiveSet`, `[@k=v]` grammar, `$#@#` escaping, `compilePath`), which v4 does not have. Its observable behaviours map to `merge.test.ts`: keyed Array elements → "Array dimension nested under an object dimension" and "@diff across Array dimensions" (lookup by key, not position); `;`-joined keys → the `combine` tests; pruning of empty containers → the "@filter on a dimension" block; dot/special characters in keys → "dimension values with special characters"; sum-on-collision → the `@groupBy` tests. |
| `providers.test.ts` | not applicable (v3 provider objects); replaced by `test/adapters.test.ts`. |
| `types.test.ts` | ported (`test/types.test.ts`). |
