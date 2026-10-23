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
- [~] Review round with Fable + Codex subagents (round 1: both reported blocking items, all folded; round 2: Codex SATISFIED, Fable pending) (brief: pragmatic, block only on real defects/ambiguities). Fix. Repeat until both report no blocking issues (cap 3 rounds; residual nits listed in SPEC appendix).

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
- [ ] Fable + Codex review of the code against SPEC.md and v3 behaviour. Fix findings. Repeat until no blocking issues (cap 2 rounds).
- [ ] `npm run build`, `tsc --noEmit`, full test run, bench rerun.

## Review
(filled at the end)
