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
| no options | `strict` (default `true`) and `output` (default `'records'`); `gritql({ adapters, strict: false, output: 'keyed' })` runs v3 documents as v3 did (that is how `test/v3compat.ts` runs the ported suites) |
| Google Analytics provider | removed |
| `@map` / `@tuple` type directives | removed (no known usage) |

Dependencies: `graphql`, `graphql-tag`, `lodash`, `luxon`, `deepmerge`, `tiny-emitter`, `prop-types`, `postgres`, `snowflake-sdk` are gone. Runtime dependencies are `knex` and `@0no-co/graphql.web`.

## Query semantics

- **Nested `limit`/`offset` are per parent.** `country { device(limit: 3) }` returns three devices per country through `row_number() over (partition by country ...)`. v3 applied `limit 3` to the whole statement.
- **A selection set holding only dimensions emits no statement.** v3 emitted a `select * from table` for sibling dimensions without metrics; test harnesses that fed a row set for it drop that entry.
- **An anonymous operation has no default table.** `{ fetch { ... } }` without `table:` is a `PLAN` error; v3 printed `from null`. The ported `two queries to object` test names the table.
- **Undeclared `$variables`** are a `TYPE` error in strict mode (`$country is not declared by operation 't'`, or `by fragment 'F'`); `strict: false` substitutes them from `variables` without type checking as v3 did.

## Strict mode (default) and the v3 forms it rejects

Every rejection is an `ARGS` (or `TYPE`) error whose message spells out the replacement. `strict: false` accepts the v3 form.

| v3 form | strict error names | v4 form |
|---|---|---|
| `fetch(brand: Adidas, date_gt: "2020")`, `fetch(limt: 10)` | `Unknown fetch argument 'brand'`, with "did you mean 'limit'?" within two edits, else where it belongs | `fetch(where: { brand: "Adidas", date: { gt: "2020" } })`; `limit` on a dimension |
| `filters: { having: {...} }` together with `having:` | `both` | one of them |
| `divide(a: "sum|revenue", by: "|orders")` | `write { sum: revenue }` / `write { field: orders }` | `divide(a: { sum: revenue }, by: { field: orders })` |
| `join(table: t, by: "@a:@b")`, `by_gt: ...` | `write on: { b: "@a" }` | `join(table: t, on: { b: "@a" })` (`on: { b: { gt: "@a" } }` for the comparisons) |
| `@filter(value_gt: 1)`, `@groupOn(value_gt: 1, replacers)` | `'value_gt' is a field_operator string; write where: { value: { gt: ... } }` | `@filter(where: { value: { gt: 1 } })`; `@groupOn(where: {...}, replacers)` |
| `@parse(as: "int:16")`, `"float:2"`, `"date:format:yyyy"` | `write as: { int: 16 }` etc. | `@parse(as: { int: 16 })`, `{ float: 2 }`, `{ date: { format: "yyyy" } }`, bare `int` / `float` / `date` |
| `$var` not declared | `$var is not declared by operation 'name'` | declare it on the operation or fragment |

Metric-level `@filter(gt: 1)` (bare operators compare the value) is unchanged in both modes. A bare leaf (`title`) is still a column.

## Output shape

A dimension without `type:` is an array of records (`[{ date: '2022-01-01', value: 3, device: [...] }]`) instead of a keyed object (`{ '2022-01-01': { value: 3, device: {...} } }`). `type: Map` on a dimension or `output: 'keyed'` on the instance gives the v3 shape; `type: Array` is unchanged. Nested dimensions and `combine` under a record are stored under their alias. The v3 harness tests run with `output: 'keyed'`; the v4 suites were rewritten to records. Cost: records assemble about 1.6× slower than keyed objects on three nested levels (bench/RESULTS.md).

## Generated SQL (snapshot differences)

All differences below were reviewed against the v3 snapshots; the semantics are the same unless marked *fixed*.

- **Parenthesization and keyword case.** Predicates are parenthesized per operator and joined with `AND`/`OR` in upper case (`("t"."a" = 1) AND (("t"."b" > 1) AND ("t"."b" < 5))`). v3 inlined top-level predicates with lower-case `and`.
- **`groupBy(field, by)` dimension** emits `date_trunc(by, field) as alias` inline and groups by the expression. When the alias shadows the source column (`date: groupBy(field: date, by: month)`, or `groupByEach`) the expression is selected as `__d<i>` (`i` = position in the grain) on every dialect and the assembler writes it back under `date`; `CompiledQuery.columns` carries the mapping. The ClickHouse-only alias-group-by branch is gone. v3 wrapped the source in a subquery that repeated the WHERE clause.
- **`groupByEach`** no longer selects the hidden `groupByEach_min_*` / `groupByEach_max_*` columns.
- **Reverse rankings** (`ranking(alg: reverseRank)` and friends) compute `max(x) over () - x + 1` on the derived table instead of a `reverse_<alias>` CTE with a scalar subquery. The window column is named `reverse_<alias>`.
- **`unique(a, from: t)`** groups by `t.col`, as v3 did; `unique` without `from` groups by the bare column.
- **Numeric literals stay numeric.** `price_gt: 126` compiles to `> 126`; v3 stringified it to `> '126'`.
- **List values in filters are `IN`.** `categories: [1, 11, 6]` compiles to `IN (1,11,6)`; v3 produced `= 1 AND = 11 AND = 6` (*fixed*).
- **`count` / `countDistinct` without an alias** are aliased by their name; v3 produced `as "undefined"` (*fixed*).
- **`having` on output aliases** (fetch `filters.having`, the `having:` fetch argument, dimension `having:`, lowered `@filter`) compiles to `select <outputs> from (<grouped>) as "__h" where (("value" > 1))` on every dialect; v3 emitted `HAVING "t"."value" > 1`, which PostgreSQL rejects for aliases. Every `having` object goes through this wrapper; only HAVING fragments returned by a resolver's `sql` stay in HAVING. A `having` whose column a child grain does not select becomes a semi-join on the parent statement (`country @filter(where: { total: ... }) { total device { v } }` keeps the passing countries in the `country, device` statement); one that no statement at that level selects is a `PLAN` error where v3 ignored it. A `with` whose dimension alias shadows its column is wrapped so its columns keep the output names.
- **`@diff` / `@subtract` / `@divide` are in the statement** (SPEC §6.7): `select "__cur".<grain>, cast("__cur"."v" as float) / NULLIF(cast("__ref_0"."v" as float), 0) - 1 as "v" from (<grouped>) as "__cur" left join (<grouped reference>) as "__ref_0" on <grain columns>`. v3 ran the grouped statements and did the arithmetic in JS. Consequences: an emitted `fetch` used as a baseline executes twice (once for its output, once embedded in the join; a `with` executes once and is joined by name); the reference is the other fetch's grouped result **before** its own arithmetic (v3 compared against baselines, so this is the same reading; it also lets `series`/`prev` reference each other); a missing reference row or a zero divisor gives `NULL` where v3 gave `NaN`/`Infinity`; division casts both sides to float; the referenced fetch must have the same grain and the same column (`PLAN` error otherwise), a reference dropped by `@include`/`@skip` gives `NULL as alias`, and a lowered metric under `@groupBy`/`@groupOn` is a `PLAN` error.
- **`@filter` with `eq neq gt gte lt lte in nin`** becomes `having:` on its dimension (the `__h` wrapper above), so `limit` counts survivors; v3 filtered after assembly and after `limit`. Array operators (`contains`, `of`, `startsWith`, ...) still filter at result time.
- **Search metrics** read the search term by the bare column name (`title`), whether it came from `search: {}` or `filters: { search: {} }`. Defining the same field in both is an `ARGS` error, as in v3.
- **Empty lists**: `country: []` compiles to `1 = 0`, `nin: []` to `1 = 1` (v3 emitted invalid `IN ()`, *fixed*). An operator without a field (`or: [{ gte: 1 }]`) is an `ARGS` error.
- **`avg` / `median` without `by` are plain aggregates** (`avg("x")::float4`). v3 emitted `avg(x) OVER()`, which PostgreSQL rejects inside a grouped statement (*fixed*; snapshot `avg 1` regenerated).
- **Join shorthands `by_gt`/`by_gte`/`by_lt`/`by_lte`** read left to right as in v3 (`by_gt: "@a:@b"` → `fetch.a > joined.b`). `by_in` (column IN column was never meaningful) and `by_like` (cannot be mirrored onto the joined column; use `on`) are dropped and rejected as `ARGS`. Several shorthands on one joined column are ANDed; repeating the same operator on one column is an `ARGS` error (v3 silently kept the last).
- **CTE bodies carry no nested `WITH`**: the outer statement lists every transitive `with` once, in dependency order.
- **`limit: 0` / `offset: 0`** are emitted; v3 ignored falsy values.
- **Unknown fetch arguments** (`fetch(limit: 5)`) are an `ARGS` error in strict mode; with `strict: false` they become equality filters on that column, as in v3.
- **Identical select expressions are emitted once** (`brand { brand }`), as v3 did through statement deduplication.

## Assembly (result differences)

- **`@groupBy` sums each metric once.** v3 double-counted sibling metrics of grouped rows (`rank: 6` where `4` is right); the ported snapshot was regenerated.
- **Array elements are stamped with the raw column value**; v3 stamped `String(value)`. Row sets in the test suites use strings, so no snapshot changed.
- **`fetchPlain`** still returns `Row[][]` (one row array per statement).
- **Mixed aliased and unaliased fetches**: the unaliased tree is under key `''`, as in v3.
- **Baseline is not frozen.** Hooks must treat `ctx.baseline` as read-only.
- **Dimension values and fetch aliases named like prototype members** (`__proto__`, `constructor`) are ordinary keys of the output; v3 lost or mis-stored them.
- **`@parse` collapsing two rows onto one key adds numeric metrics** (relocation rule); v3 kept the last row.
- **`@omit`** is `emit: false` on the node (the column is selected, not output); `@omit(full: true)` removes the node from the plan. On a dimension it hides every grain below it.
- **An empty result in records shape is `[]`** (`{ a: [] }` under an alias); v3 and keyed mode give `{}`.
- **A comparison reference carries the target's `limit`/`sort`** (`prev: fetch { d(limit: 5) }` compares against the top five, `NULL` elsewhere), as v3's baseline did; it is read before the target's own `@filter` and arithmetic, after its explicit `having:`.
- **One pass when nothing reads a baseline.** `@diff`, `@subtract`, `@divide`, `@omit` and SQL-expressible `@filter` carry no result hook, so a document using only them assembles once; `@groupBy`, `@groupOn`, `@indexed`, `@parse` and array-operator `@filter` still run the two-pass model.
- **Fixture-fed tests** (rows handed to a fixture adapter) now see the rows as given for `@diff`/`@filter`: the database does that work. The v3 snapshot suite therefore shows the raw fixture values for those tests.

## Test port

| v3 suite | v4 |
|---|---|
| `gql-sql-slicer.test.ts` (67) | ported through `test/v3compat.ts` (a `gqlToDb()` shim over the engine with `strict: false, output: 'keyed'`); `Custom types directives` (@map/@tuple) dropped; `two queries to object` names its table. 66 tests, snapshots regenerated. |
| `metrics.test.ts` (15), `filters.test.ts` (9) | ported verbatim through the shim; snapshots regenerated. |
| `grit.fails.test.ts` (4) | ported as `test/regressions.test.ts`. |
| `merge.test.ts` (19) | rewritten on the v4 API (`test/merge.test.ts`) in records shape; the v3 string-path custom-directive test became a `keys`/`set` test; the `@filter`/`@diff` result-time cases are kept as extension hooks (`@dropLow`, `@ratio`) since the built-ins moved to SQL. |
| — | new: `test/strict.test.ts` (strict vs `strict: false` for every rejected form), `test/lowering.test.ts` (SQL shape of §6.7, PLAN errors, assembly of precomputed rows). |
| `directives.test.ts` (10) | rewritten on the v4 API; luxon oracle replaced by local-offset arithmetic; adds @groupOn/@indexed/@omit/fetch-level @include cases. |
| `progressive.test.ts` (53) | tests v3's string-path writer (`progressiveSet`, `[@k=v]` grammar, `$#@#` escaping, `compilePath`), which v4 does not have. Its observable behaviours map to `merge.test.ts`: keyed Array elements → "Array dimension nested under an object dimension" and "@diff across Array dimensions" (lookup by key, not position); `;`-joined keys → the `combine` tests; pruning of empty containers → the "@filter on a dimension" block; dot/special characters in keys → "dimension values with special characters"; sum-on-collision → the `@groupBy` tests. |
| `providers.test.ts` | not applicable (v3 provider objects); replaced by `test/adapters.test.ts`. |
| `types.test.ts` | ported (`test/types.test.ts`). |
