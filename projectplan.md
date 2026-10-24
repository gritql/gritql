# gritql v4 — greenfield rebuild plan

Branch `v4` in worktree `/Users/edjafarov/work/gritql4`. v3 reference: `/Users/edjafarov/work/gritql` (497 tests, 129 snapshots, all green).
Only real consumer: `peekd-sp/lib/frontend` (ClickHouse via knex dialect plugin, pg; GA dropped for now).

## Decisions taken in discussion
- Intent = plan tree; knex only prints SQL. No Proxy recorder, no priority queues.
- One `Resolver` shape for metrics, dimensions, directives, middleware; stages `plan → sql → execute → result`.
- Metrics/dimensions return expressions; engine owns SELECT/GROUP BY/ORDER/LIMIT/OFFSET/HAVING.
- `sql` may be a function or a per-dialect map (`{ clickhouse, '*' }`) — replaces keyword lists and `clickhouseOnly`.
- `@omit` is a `result` hook (skip in pass 2); `@diff` reads the reference fetch through `ctx.at`; mirroring is left to consumers (example in `test/extensions.test.ts`).
- Baseline = pass-1 assembled output of all fetches (read-only by contract, not frozen, for throughput); cross-fetch reads baseline; same-node directives chain in document order.
- `@filter` stays post-query (v3 semantics). Pushdown only as later opt-in.
- Cache identity = caller namespace + adapter name + request hash.
- GA dropped. `Adapter` stays generic over `Req` so it can come back.
- Per-occurrence `ctx.state`; middleware = root-scoped Resolver; `compile()` async and never connects.

## Decisions confirmed at check-in (2026-10-23)
1. Parser: `@0no-co/graphql.web` + small parser for `input X { f: T! }` blocks (peekd-sp uses them in 91 files).
2. Test runner: vitest.
3. Untracked `gritql_ai/` archived to session scratchpad tarball, then deleted.
4. Runtime deps: `knex`, `@0no-co/graphql.web`. No DB drivers: adapters receive a knex instance or an `execute` function from the caller.

## Phase 1 — clean the v4 branch
- [x] Archive `gritql_ai/` to scratchpad, delete it and old `node_modules`.
- [x] Remove everything tracked except `LICENSE`, `.gitignore`, `.claude/settings.local.json`.
- [x] New `package.json` (`4.0.0-alpha.0`, npm, CJS `dist/` via tsc), `tsconfig.json`, `vitest.config.ts`, `.npmignore`.
- [x] Commit "v4: clean slate".

## Phase 2 — SPEC.md and review loop
- [x] Write `SPEC.md`: query language (fetch/with/fetchPlain/unionall, dimension args `type|sort_asc|sort_desc|limit|offset|having`, variables + `input` types, fragments), plan model (`Plan/Fetch/Node`), lowering rules (grain split, DAG → CTE, per-parent limit via window, joins, unionall), stage contracts (`Resolver`, `Ctx`, `Adapter`), ordering + baseline semantics, error semantics, built-in catalogue with one-line semantics (metrics, dimensions, directives, filter operators), extension API with examples, v3 compatibility notes.
- [x] Review round with Fable + Codex subagents (round 1: both reported blocking items, all folded; round 2: Codex SATISFIED, Fable one blocking item (join `on` sides) folded with its nits) (brief: pragmatic, block only on real defects/ambiguities). Fix. Repeat until both report no blocking issues (cap 3 rounds; residual nits listed in SPEC appendix).

## Phase 3 — implementation (TDD, each slice: port v3 tests → make green)
- [x] 3a `parse/`: graphql.web + `input` block parser + variables/args coercion + fragments. Port `test/types.test.ts` (30).
- [x] 3b `plan/` + `lower/` + `sql/`: AST → `Plan`; grain split, DAG, CTE, joins, unionall, limit/offset/sort/having; expression resolvers, filter compiler. Port `gql-sql-slicer.test.ts` (67), `metrics.test.ts` (15), `filters.test.ts` (9). Snapshots regenerated; every changed SQL diffed against v3 and justified in `COMPAT.md`.
- [x] 3c `execute/` + `assemble/`: adapters, around middleware, rows → tree (Map/Array shapes, multi-grain merge). Port `merge.test.ts` (19). `progressive.test.ts` tests v3's string-path writer only; its behaviours are covered by `merge.test.ts` (shapes, special characters, pruning, order).
- [x] 3d `directives/`: include, skip, compare, omit, diff, subtract, divide, indexed, filter, groupOn, groupBy, parse; parse-time @inherits (@map/@tuple dropped, unused). Port `directives.test.ts` (10), `grit.fails.test.ts` (4).
- [x] 3e `adapters/`: knex adapter (any dialect), pg/snowflake/clickhouse presets. `providers.test.ts` is v3-provider specific; replaced by `test/adapters.test.ts` (10).
- [x] 3f New extension-API tests: custom metric, per-dialect map, multi-column metric, pre+post directive, fetch-scoped middleware, `compile()` without connection, async plan middleware.
- [x] `index.ts` public API: `gritql()`, `use`, `run`, `compile`, types, built-ins exported.

## Phase 4 — performance
- [x] Port `bench/merge.bench.js` scenarios; add parse+plan+sql bench. v3 vs v4 same data, same machine; table in `bench/RESULTS.md`.
- [x] Profile and optimise until v4 ≤ v3 on every scenario.

## Phase 5 — implementation review
- [x] Fable + Codex review of the code against SPEC.md and v3 behaviour. Fix findings. Repeat until no blocking issues (cap 2 rounds). Codex round 1: 15 blocking items, all fixed (HAVING-alias on pg documented as limitation). Codex round 2: 13/15 verified fixed, 6 new blocking (groupBy alias on pg, `__proto__` keys, `by_in`, untyped middleware plan errors, `percentile(factor: 0)`, `avg OVER()`), all fixed. Fable round 1: 4 blocking (row-level `value` cached per row, groupBy alias on pg, `avg OVER()`, `by_gt` inverted), all fixed; nits folded (CTE nesting, median `from`, COMPAT lines). Codex rounds 3–4: `by_like` dropped, prototype-safe fetch aliases; round 4 **SATISFIED at 8bca762**. Fable rounds 1–2: four blockers confirmed fixed, one new (no-op row-level result cached) fixed plus join-shorthand AND; **SATISFIED at 779cbc0**. The round cap (2) was exceeded because every round found real defects. Later commits: join same-operator ARGS check, docs.
- [x] `npm run build`, `tsc --noEmit`, full test run (385 tests, 13 files), bench rerun (`bench/RESULTS.md`).

## Review

### What was built
- `src/` (~3.6k lines TypeScript, `dist/` 260 KB): `parse/` (graphql.web + own `input` block parser + variables/fragments), `plan/` (AST → `Plan{fetches,nodes}`, directive/resolver/middleware `plan` hooks), `lower.ts` (grain split, CTE dependency order, cycle detection), `sql/` (knex printing, filter compiler, nested limit via `row_number`), `assemble.ts` (two-pass streaming writer with keyed Array index and row-level hook cache), `engine.ts` (`gritql()` → `compile`/`run`/`use`), `adapters.ts` (knex/pg/clickhouse/fixture), `builtins/` (metrics, dimensions, directives, dates without luxon).
- Runtime dependencies: `knex`, `@0no-co/graphql.web`. v3 had 9 (graphql, graphql-tag, lodash, luxon, deepmerge, tiny-emitter, prop-types, postgres, snowflake-sdk).
- Documents: `SPEC.md` (contract, 2 review rounds each with Fable and Codex), `COMPAT.md` (every v3 difference, SQL snapshot diffs, test-port table), `bench/RESULTS.md`.

### Tests
385 tests in 13 files (vitest). v3 suites ported through a `gqlToDb()` shim (`test/v3compat.ts`): gql-sql-slicer (66 of 67; `@map/@tuple` dropped), metrics (15), filters (9), grit.fails (4), types (30); merge (27) and directives (73) rewritten on the v4 API; new: sql shapes (18), adapters (10), extensions (20), parse/plan/filter units. `progressive.test.ts` was v3-internal (string-path writer) and its behaviours are covered in merge tests (see COMPAT.md).

### Performance (median of 5, 200k rows/statement, same machine)
| scenario | v3 | v4 |
|---|---|---|
| object dims | 44 ms | 40 ms |
| array date dim | 61 ms | 48 ms |
| array dim + @filter | 239 ms | 151–160 ms |
| two queries + @diff | 117 ms | 84 ms |
| compile | n/a | 0.10 ms |
v4 is faster everywhere; the review-fix commit briefly regressed `@filter` to 294 ms (dimension-level filter scanning every key of its object), caught by the bench rerun and fixed by precomputing field conditions per directive occurrence.

### v3 bugs fixed rather than preserved (all in COMPAT.md)
`@groupBy` double-counting sibling metrics; list filter values compiled to `= a AND = b` instead of `IN`; `count` without alias → `as "undefined"`; numeric literals stringified; empty `IN ()`; nested `limit` applied globally instead of per parent; `from null` for anonymous operations; repeated arguments nested on the third occurrence; `avg`/`median` without `by` emitted `OVER()` (invalid in grouped pg statements); join shorthands silently overwriting each other on one column; dimension values or fetch aliases named `__proto__`/`constructor` lost or written onto the prototype.

### Known limitations
- `having` on output aliases works on ClickHouse/MySQL, not PostgreSQL (documented).
- Baseline is shared by reference, not frozen: hooks must not mutate it.
- Pass 2 re-reads every row set when any fetch has result hooks.

### Follow-ups (not done)
- GA adapter (dropped by decision), `@filter` pushdown (opt-in), skipping pass 2 for hook-free fetches.


## Phase 6 — language proposals 1–5 (2026-10-24)

Source: the proposals page (six conceptual changes, before/after on real peekd-sp queries). Proposal 6 (catalog) is **not** implemented; it is filed as a GitHub issue and listed under follow-ups. Branch `v4`, one commit per proposal, no push.

### Decisions beyond what the page showed
- Two instance options carry every behaviour change: `strict` (default `true`) and `output` (`'records'` default, `'keyed'` = today's shape). Check-in decision: harness-based tests are rewritten to the new defaults (records + strict); only `test/v3compat.ts` keeps `strict: false, output: 'keyed'`, since its job is to run v3's suites as v3.
- Check-in decisions: internal SQL names only when shadowing; a `fetch` baseline executes twice (documented); `@diff` under `@groupBy`/`@groupOn` is a PLAN error.
- Bare leaf = column stays in both modes (fetchPlain in peekd-sp is nothing but bare columns; `brand { brand }` is v3-tested). The "revenu is not a metric" rule from the page is dropped.
- `from: "@"` and `@column` sigils stay; they are references, not grammars.
- No `@baseline` directive: `by:` naming a fetch alias is enough to plan the join; the grain is the key.
- Internal SQL column names only where the alias would shadow a source column the expression references (`date: groupBy(field: date)`); plain aliases otherwise, so `compile()` output stays readable and exportable. HAVING on output aliases is always wrapped in a derived table (every dialect).
- A `fetch` used as a baseline is embedded as a derived table and therefore executes twice (once for its own output). Documented; `with` is the recommended form when the baseline is not output.
- Missing baseline (target removed by `@include`) → `NULL AS alias`, not an error (kpisSection pattern).
- `@diff`/`@subtract`/`@divide`/`@filter` lowered to SQL; `@indexed`, `@groupOn`, `@groupBy`, `@parse`, `@omit` stay result-time (`@omit` becomes `emit: false` at plan time). A lowered directive on a metric under a dimension carrying `@groupBy`/`@groupOn` is a PLAN error (summing a ratio after regrouping is wrong).
- Lowered divisions cast to float and `NULLIF(denominator, 0)` (pg integer division, division by zero → NULL where JS gave NaN/Infinity).

### Todo
- [x] 6.0 Options `strict`/`output` on `GritqlOptions`; harness + v3compat set legacy values; GitHub issue for proposal 6
- [x] 6.1 P5 records: `type: Array` is the default dimension shape, `type: Map` opts back in; covered in `merge.test.ts` (rewritten to records) rather than a separate `records.test.ts`; unaliased `''` and fetchPlain unchanged
- [x] 6.2 P4 strict: unknown fetch args → ARGS with suggestion; `where:` (pure columns) + `having:` + `search:` as fetch args, `filters:` kept as legacy; undeclared `$var` → TYPE (op + fragment declarations); `strict.test.ts`
- [x] 6.3 P3 object forms: join `on` only (strict rejects `by`/`by_*`), `{ sum: field }`/`{ field: x }` for `fn|field`, `@filter(where:)`/`@groupOn(where:)` for suffix ops, `@parse(as: { date: { format } })`; strict rejects string forms pointing at the object form; variables allowed in every position
- [x] 6.4 P2 names: HAVING on output aliases via derived-table wrapper on all dialects; dimension internal column when alias shadows its source column; delete the ClickHouse branch in dimensions.ts; Step/MetricCell carry SQL column and output name; `CompiledQuery.columns` map
- [x] 6.5 P1 lowering: `Node.lowered` (op, ref alias/column or byField) instead of `Fetch.refs`, the target physical is resolved at compile time by fetch alias + grain alias sequence; `@diff`/`@subtract`/`@divide(by: alias)` and `diff/subtract/divide(a:, by: alias.col)` compile to an outer `LEFT JOIN` on the grain with order/limit on the outermost layer; CTEs of the target bubble into the current physical; `@filter` on dimension/metric → `having`; `@omit` → `emit:false`; single pass when no fetch has result hooks; `lowering.test.ts`
- [x] 6.6 Bench: rerun all scenarios; add records-vs-keyed A/B on one data set; state that lowered scenarios now measure compile + assemble only (fixture adapter runs no SQL)
- [x] 6.7 SPEC.md (§2 options, `where`, object forms, refs, output shape) and COMPAT.md (strict/legacy table, every rejected string form, twice-executed baselines, NULL baseline, float cast)
- [ ] 6.8 One Fable round + one Codex round on the finished diff; fix real defects; record verdicts

### Review (Phase 6)

Commits on `v4` (not pushed): 6b24953 options + records (P5), c8604ca strict (P4), 78dcd0e object forms (P3), 799c72d output names / having (P2), 3b356c8 SQL lowering (P1), 6a58eed bench + assembler, 73e9948 docs. Suite: 420 tests, 15 files, tsc clean.

What changed against the plan while implementing:
- P1: `lower()` on a target in "reference mode" (grouped statement without its own arithmetic layer) replaced a planned self-reference guard; it is what makes `series`/`prev` mutual references and v3's self-`@subtract` terminate, and it matches v3's baseline reading. Found when the first implementation overflowed the stack on the v3 `@diff` snapshot test.
- P1: `@filter` lowering reads the conditions `fieldConds` parsed, so the legacy suffix form (`strict: false`) lowers too; the first cut lowered only the `where:` object and left v3 documents on the two-pass path.
- Assembler: a plan hook that lowered itself sets `use.state.lowered`; the assembler attaches no result hook for it (otherwise the lowered `@filter` still forced two passes: 118 → 50 ms). The keyed-element index moved from a `WeakMap` to a non-enumerable symbol property and single-column steps skip the values array (records 94 → 74 ms).
- Tests: the former `@filter`/`@diff` result-time cases in `merge.test.ts` and `extensions.test.ts` are kept as extension hooks (`@dropLow`, `@ratio`, `@minus`) so `ctx.at` / `skipAll` / baseline semantics stay covered; the v3 snapshot suite shows raw fixture values where the database now does the work.

Bench (bench/RESULTS.md): `@filter` 165 → 50 ms, `@diff` 91 → 42 ms (compile + single-pass assembly; the directive work is in SQL now), records 74 ms vs keyed 46 ms on three levels, compile 0.108 → 0.158 ms.

Follow-ups:
- Proposal 6 (typed schema / catalog, introspection): gritql/gritql#62.
- peekd-sp migration: `buildFullName` is not exported by v4 (imported from `gritql/dist/filters`); the seven custom ClickHouse metrics use `metricWrapper`; GA provider still registered in `pages/api/v3.ts` / `executeQuery.ts` with no caller found.
- Records assembly is 1.6× keyed; the remaining cost is one hash lookup per level per row. A per-step "last element" cache would help sorted row sets only; not done.
- Review verdicts: see below (6.8).

### 6.8 Review round (Codex adversarial review, `.review/codex-phase6.md`)

Verdict "needs-attention", seven findings, all reproduced and fixed in one commit, each with a regression test:
1. `@filter` on a lowered metric produced `where "v" > 0` directly after the join: ambiguous between `__cur.v` and `__ref_0.v` on PostgreSQL. Alias havings now always wrap the current layer as `__h`.
2. Join keys were read before the target compiled, so a `date: groupBy(field: date)` target joined on `"__ref_0"."date"` while selecting `__d0`; the result depended on fetch order. The target is compiled first.
3. Root-level `@subtract` emitted `left join (...) as "__ref_0"` without ON. Now `on 1 = 1`.
4. `a: with { ... @subtract(by: b) }` consumed by `fetch(table: a)` listed only `a` in WITH. `dependencies()` now follows arithmetic references (with targets as edges, fetch targets recursively) with the existing cycle detection.
5. Nested limits ranked the raw metric before `@divide(byField)`; the arithmetic layer now sits directly over the grouped rows, under having, ranking and ORDER BY.
6. `having: { date: ... }` on a `__d0` dimension addressed the output name inside `__h`; having keys are renamed through `sqlNames` (and/or/not recursed).
7. Records mode lost `__proto__` dimension values (prototype setter). Record and key writes use own-property assignment; reads use own-property lookup.

### 6.8 Review round (Fable, `.review/fable-phase6.md`)

Verdict "NOT SATISFIED": three blocking, nine should-fix, nits. Everything below fixed in one commit with regression tests; suite 434.
- B1 `@filter`/`having` on a column a child grain does not select produced invalid SQL (`where "total" > 5` on the `country, device` statement). Now a semi-join on the parent statement's survivors; a column no statement at that level selects is a PLAN error (also closes S8, where v3 silently ignored the condition).
- B2 fetch-level `@filter` crashed (`owner.args` on a Fetch). Lowered conditions now live in `loweredHaving` on the dimension or the fetch, separate from the user's `having:`.
- B3 a `with` whose alias shadows its column exposed `__d0` to `fetch(table: alias)` readers. The CTE body is wrapped once to alias internal names back; comparisons join such a `with` on its output name.
- S1 empty records result was `{}`; now `[]` when every statement of the tree starts with an array dimension.
- S2 `having:` with `aggrAverage`/`weightAvg` produced invalid SQL; resolver `query` hooks now run on the grouped statement before the wrapping layers (v3 snapshots unchanged).
- S3 `@divide(byField:)` on an unselected column → PLAN error. S5 reference mode skips the target's lowered `@filter` (v3 baseline reading) but keeps its explicit `having:`. S6 ClickHouse: `Nullable(Float64)` casts (first cut used `Float64`, which rejects NULL; found during the peekd migration), `SETTINGS join_use_nulls = 1` appended by `clickhouseAdapter.compile` to statements with a LEFT JOIN. S7 passthrough columns aliased (`"__cur"."c" as "c"`). S9 variables scoped per operation (fragments see their own plus every operation's).
- S4 and the doc nits: SPEC §2.6/§6.4/§6.7/§7, interface listings (Fetch.where/loweredHaving, Node.sqlNames/lowered/loweredHaving, Ctx.strict/out), COMPAT entries for the having wrapper, empty `[]`, `@omit` on a dimension, reference carrying the target's limit.
- Code nits: dead `named` WeakSet removed; `having*` locals renamed (`resolverHavings`, `havingObjects`, `havingPredicates`). Declined: folding `dimColumns`/`outputAliases`/engine `columns()` into one helper (three call sites with different inputs; left as is), a PLAN error for two fetches sharing an alias with different `type:` on one dimension (pre-existing, rare).
