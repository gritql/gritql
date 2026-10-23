# Project Plan: Test coverage, test restructure, dependency update

## Current state (baseline)

- `npm test`: 2 suites, 70 passed / 1 skipped, 84 snapshots, all green. `tsc` typechecks clean.
- Line coverage 64% (branch 52%). Weakest files:
  | File | Lines | Branches |
  |---|---|---|
  | providers/index.ts | 17% | 0% |
  | directives/index.ts | 46% | 39% |
  | metrics/index.ts | 48% | 43% |
  | filters.ts | 64% | 58% |
  | types.ts | 64% | 39% |
  | progressive.ts | 68% | 54% |
- Tests live in the repo root (`gql-sql-slicer.test.ts`, 2100 lines; `grit.fails.test.ts`) plus root `__snapshots__/`.
  `.npmignore` excludes only one of them, so `grit.fails.test.ts` currently ships in the npm package.
- Unused dependencies: `koa`, `co-body`, `@koa/cors` (never imported anywhere, not in docs).
- Two lockfiles (`yarn.lock` and `package-lock.json`), both stale; `node_modules` has markers from both.
- `dist/` is tracked in git.

## Order and rationale

Restructure → new tests → bump deps → verify. Tests written against the *current* deps become the
regression net for the upgrades; if deps were bumped first, new snapshots would baseline on new
behavior and catch nothing.

## Todo

### 1. Restructure tests (no behavior change)
- [x] `git mv` both test files + `__snapshots__/` into `test/`; fix the `require('./gql-sql-slicer')` path
- [x] Verify: `npx jest --ci` → 70 passed, 84 snapshots passed, 0 written, 0 obsolete
- [x] `.npmignore`: replace the test/snapshot lines with `test/`
- [~] (Declined) (Optional, only if you want it) split the 2100-line file by top-level `describe` into topic files

### 2. New tests (also added `test/progressive.test.ts`; fixed ~32 existing tests that never returned their promise, so Jest wasn't waiting for their assertions) (in `test/`, using the existing patterns: `beforeDbFetch` SQL snapshots, `dbFetch(() => table)` for result shaping)
- [x] `test/directives.test.ts`: post-executed `@omit @diff @subtract @indexed @filter @groupOn @groupBy @divide @parse`,
      filter comparison helpers (`in/nin/of/contains/startsWith/...`), type directives `@inherits @map @tuple`
- [x] `test/metrics.test.ts`: `subtract/diff/multiply`, `searchRanking/searchHeadline`, `weightAvg/aggrAverage`, `median`, `countDistinct`, partition/ranking variants
- [x] `test/filters.test.ts`: uncovered filter operators/branches
- [x] `test/types.test.ts`: PropTypes/checkPropTypes validation branches (required, oneOf, arrayOf, shape, exact)
- [x] `test/providers.test.ts`: `useProvider()` custom provider path only. Postgres/Snowflake paths need real DB connections and stay uncovered (no SDK mocking)
- [x] Look into the skipped `@parse(as: "date:iso")` test: it's a real bug (dimension @parse transforms the metric value), left skipped and covered by `test.failing` cases in directives.test.ts
- [x] If a new test exposes a real bug: stop and report it instead of fixing silently (6 found, each marked `test.failing` with a BUG comment; see Review)

### 3. Dependencies (each step followed by a full test run)
- [x] Settle on one package manager: npm. `yarn.lock` deleted, `node_modules` reinstalled from `package-lock.json`
- [x] Remove unused `koa`, `co-body`, `@koa/cors`
- [x] Minor/patch bumps within current majors (knex 2.5.1, luxon 2.5.2, postgres 3.4.9, snowflake-sdk 1.15.0, lodash 4.18.1, deepmerge 4.3.1, graphql-tag 2.12.7, @types/lodash, @types/prop-types)
- [x] Test toolchain majors as one set: `jest` 30.5.2, `ts-jest` 29.4.15, `@types/jest` 30.0.0. Jest 29+ changed the default snapshot format (`Object {`→`{`, no escaped quotes); verified with the legacy `snapshotFormat` that all 126 snapshots matched byte-for-byte before regenerating them in the new format
- [x] `typescript` → 5.9.3 (ts-jest supports `<7`, so not 7). Added `skipLibCheck` to tsconfig: a transitive `@types/node@16` doesn't compile under TS 5.9's lib
- [x] `graphql` 16.14.2 — needed a decision (asked and approved): graphql 14.1.1 shipped no typings, so `DocumentNode` had silently been `any`; newer graphql ships typings and ~90 places didn't compile. Replaced the 5 `DocumentNode`/`DirectiveNode` imports with local `type X = any` aliases (what they effectively were) and made `merge()` accept a `ReadonlyArray`
- [x] `knex` 3.3.0 and `luxon` 3.7.2 — bumped one at a time; all 126 snapshots unchanged, tsc clean after each
- [x] Not done, as planned: `snowflake-sdk` 3 (code at 0% coverage, can't verify without a DB)

### 4. Verify
- [x] `npm test -- --ci` (after step 3): 8 suites, 293 passed, 1 skipped, 126 snapshots passed, 0 written/obsolete. The only `-u` run was the Jest-30 format regeneration, after proving the legacy format matched 126/126
- [x] `npx tsc --noEmit` clean; `npm ls` shows no missing/invalid peers; `npm pack --dry-run` ships no test files
- [x] `dist/`: untouched (`git status dist` is empty), as agreed

### 5. Fix the bugs found in step 2 (approved after review)
- [x] `@parse` on a dimension parses the dimension value (idempotent per row), not the metric value; date parsing also accepts JS `Date` objects (what the pg driver returns) and ISO strings, not only SQL strings
- [x] `@compare` evaluates every operator against the original value
- [x] `weightAvg` returns its query
- [x] `searchRanking`/`searchHeadline` guard tolerates a missing `query.search`
- [x] `search` filter guard checks keys, not values
- [x] `progressiveSet` prune path: left as-is (dead code), `test.failing` kept as documentation
- [x] Flip the matching `test.failing` cases to regular tests; un-skip the original `@parse` repro in `grit.fails.test.ts` with `Date` fixtures; full suite green (296 tests, 0 skipped, 129 snapshots)

## Open questions for you
1. Package manager: **npm** or **yarn**? (I'll delete the other lockfile.)
2. Split the big test file into topic files, or just move it?
3. Majors: go for knex 3 / luxon 3 / graphql 16, or stay on current majors for runtime deps?
4. `dist/`: rebuild and leave it modified in the working tree, or don't touch it?

## Out of scope
No commits unless asked; `aiguide.md` untouched; existing console.log noise from the `percentile` test left alone.

## Review

### What changed
- **Tests moved** to `test/` (`git mv`, history preserved); `.npmignore` now excludes the whole folder (previously `grit.fails.test.ts` shipped in the package).
- **~32 existing tests were not actually asserting anything**: they called `querier(...).then(expect...)` without returning the promise, so Jest finished before the assertions ran. Added `return`. All still pass once awaited.
- **6 new test files, 223 new tests** (71 → 294): `directives`, `metrics`, `filters`, `types`, `progressive`, `providers`. Coverage went from **64% → 84% lines / 52% → 71% branches** (directives 46→78%, metrics 48→96%, providers 17→90%, types 64→85%, progressive 68→90%, filters 64→83%).
- **Dependencies**: npm only (yarn.lock removed), unused `koa`/`co-body`/`@koa/cors` dropped, everything else on latest within the agreed limits (graphql 16, knex 3, luxon 3, jest 30, ts-jest 29, TS 5.9). `snowflake-sdk` stays on 1.x as planned. `npm audit` went from 36 to 11 vulnerabilities (9 moderate, 2 high), all transitive under `snowflake-sdk` 1.x — see below.
- **Source changes for the dep bumps (5 files, ~1 line each)**: `DocumentNode`/`DirectiveNode` imports replaced by `type X = any` aliases (graphql 14.1.1 had no typings, so that is what they always were); `merge()` accepts a `ReadonlyArray`; `skipLibCheck` added to tsconfig for a transitive `@types/node@16`.
- **Bug fixes (step 5)**: `directives/index.ts` (@parse, @compare), `metrics/index.ts` (weightAvg, search guards), `filters.ts` (search guard). `npm test -- --ci`: 296 tests, 0 skipped, 129 snapshots green; `tsc --noEmit` clean.
- `dist/` not rebuilt. A throwaway `tsc` build into the scratchpad succeeded and its `.d.ts` output is byte-identical to the tracked `dist/*.d.ts`, so the `any` aliases don't change the published typings (they already emitted as `any`). Run `npm run build` before the next publish.

### Bugs found by the new tests (1–5 fixed in step 5 after review; 6 left as-is with its `test.failing`)
1. **Fixed.** `@parse` on a **dimension** transformed the metric value instead of the dimension value (`directives/index.ts`). Now parses `data[context.name]` once per row (rows are shared between the metrics of a row, tracked with a `WeakSet`) and only rewrites the path. Second half of the same bug: the date transformers only accepted SQL strings, but the pg driver returns `Date` objects for timestamp columns (that's what the old skipped test's `Date.toString()` fixtures were) — a `Date` came out as `"null"`. Dates now go through `fromJSDate` / `fromSQL` / `fromISO`. The original repro in `grit.fails.test.ts` is un-skipped with `Date` fixtures (noon UTC, `date:iso-date`, so the snapshot is time-zone stable); its stale snapshot showed the old wrong output and was regenerated after reading the diff.
2. **Fixed.** `@compare` fed each operator the *boolean* result of the previous one; now every operator compares the original value (unknown operators still throw first).
3. **Fixed.** `weightAvg` never returned its query (`metrics/index.ts`); added the `return`, SQL snapshot added.
4. **Fixed.** `searchRanking`/`searchHeadline` without a search filter threw a TypeError; guard now uses `query.search?.[key]`.
5. **Fixed.** `filters: { search: { eq: "a" } }` wasn't rejected because `_.every(subQuery, isOp)` iterated values; now checks `Object.keys(subQuery)`.
6. **Left as-is.** `progressiveSet(obj, path, undefined)` (the prune path) throws at the root level because `hashContext.$prevHashContext` is undefined (`progressive.ts` ~300). Nothing in the library calls it with `undefined`, so it's dead code; two `test.failing` cases document it.

### Notes
- Remaining `npm audit` findings (`tmp`, `tough-cookie`, `uuid`, `xml2js`) are transitive dependencies of `snowflake-sdk` 1.x / `aws-sdk` and show up in `npm audit --omit=dev` too; a `snowflake-sdk` 3 bump would be needed to clear them.
- OSS IQ (`ossiq`) could not complete: it hit GitHub's unauthenticated rate limit and then crashed internally. Verification relied on `npm audit`, `npm ls` and the test suite instead.
- `@types/jest@30` types `test.failing` but Jest 30 has no `test.failing.each`; the failing cases are plain loops.


---

# Project Plan 2: Make `progressive.ts` (and its use in `merge()`) correct and fast

## What it does today (established by reading + probes, no code changed)
`progressiveSet`/`progressiveGet` build and read the nested result object from flat SQL rows. Path grammar: `a.b` object steps, `[]` push, `[n]` index, `[@k=v;k2=v2]` find-or-create a keyed array element (stamps the keys on the new element), root `[@…]` returns a *new* array, `summItUp` adds numbers, `value === undefined` enters a prune routine. `:name` placeholders are filled per row by `replVars`, which only escapes dots (`$#@#`). `hashContext` is a **positional** index cache (`$date → "2022-01-01" → { index }`, linked by `$prevHashContext`) shared by one query's batches, by both merge passes, and by directive reads.

The library only produces `a.b`, `:name`, `[@k=:k]`, `[@k=:k;k2=:k2]` paths and always passes `summItUp = false`. `[]`, `[n]`, `summItUp` and prune are reachable only by direct callers (prune also by a custom directive returning `{ value: undefined }`).

## Bugs (all reproduced with probes against a scratch build; none fixed yet)
1. **merge drops the row after any filtered row** (`gql-sql-slicer.ts` `skipAll → j++; break`, the `for` then increments `j` again). `channels @filter(value_gt: 1)` on rows drop,keep,keep returns only the third. The snapshot `@filter directive 2` (`series: {}`) has this baked in and will change.
2. **Positional cache misroutes rows in merge pass two.** Pass one caches `01-01 → 0, 01-02 → 1`; pass two starts from an empty result with the same cache, so after a filter drops the first date, reads of `[@date=01-02]` hit `merged[0]` (= `01-01`) and writes of a late `01-01` row land inside the `01-02` element. Same class: `groupBy` reads `result` with a cache built for `originFullObject`; `getBatchContext` shares caches across queries.
3. **Grammar injection**: a dimension value containing `=`, `;`, `[`, `]` or `@` corrupts the path (`domain = "a=b;c"` comes back as `"a"`). Only dots are shielded.
4. **Positional cache corrupts on any outside mutation** of the array, and the linear fallback runs only the first time a key is seen (`firstIndexInput`), so a context that knows `$id` but not this value **duplicates** an existing element.
5. Dead/broken: prune throws at the root (`$prevHashContext` undefined); `[n]` on a missing array throws; `[]` under an object creates a stray `arr` key.
6. `progressiveGet` on an array with a plain step returns the first element having that string as *any* value (`list.b.x`), so a metric value equal to a key can match the wrong element.

## Baseline (scratch build, M-series laptop, `dbFetch` mocked)
| rows | object dims | `date(type: Array)` | array + `@filter` | raw set+replVars |
|---|---|---|---|---|
| 50k | 137 ms | 155 ms | 411 ms | 73 ms |
| 200k | 536 ms | 645 ms | 1734 ms | 301 ms |

Per row+metric ≈ 2.7 µs; the string work (`replVars` → `split` → regex per segment → key strings per step) is most of it, the cache is a minor cost, and `@filter` triples it (second pass + `progressiveGet` per row).

## Design
### Phase 1 — identity-keyed index instead of the positional `hashContext` (correctness)
- Module-level `WeakMap<array, Map<keySpec, Map<valueKey, element>>>`. Built lazily on the first lookup by one scan, updated on every push, hits validated (`el[k] == v`) so outside mutation can only cause a cache miss, never a misroute.
- By construction: pass two has new arrays → no cross-pass bleed; `result` vs `originFullObject` reads cannot collide; sharing a context across queries/batches is harmless; `firstIndexInput` duplicate path disappears; no per-object-step context objects (memory).
- Keep the `hashContext` parameter in `progressiveSet/Get` and `getBatchContext` as accepted-and-ignored so `merge()` and the directives need **no edits** for this phase. Tests that assert the `ctx` shape become behavior tests.
- Fix bug 1 in `merge()` (one line: `break` only).
- Fix the dead paths properly: prune = delete the leaf then walk back removing empty containers (also drops the keyed element and its index entry); `[n]` creates the array; `[]` under an object becomes an error (today's `arr` behavior is nonsense) — *or* remove these features, see question B.

### Phase 2 — compiled path templates (performance)
- `compilePath('[@date=:date].:device.value')` once per `q.metrics` entry → segment list with var slots; per row substitute values as **tokens**, not string concatenation. Removes `replVars`/`split`/unshield/regex per row and fixes bug 3 categorically (values never re-enter the grammar). Expected ≥ 2× on the no-directive path; measure after phase 1 before committing.
- `merge()` must keep accepting string paths because directives return `path` strings (`directives/index.ts` 1114, 1199, 1333); hybrid: compiled fast path for the default case, string parser (with a parse cache) for directive-rewritten paths. `replVars`/`$#@#` stay exported for compatibility.
- Stamped key type: today `[@date=:date]` stamps the **string** form of the value (`Date.toString()` was visible in the old snapshot). Keep `String(value)` by default to stay snapshot-compatible; see question C.

### Phase 3 (later, optional) — `merge()` hot loop
Per row × key × directive filtering and `Object.keys` churn; precompute directive lists per metric key, single pass where no directive needs `originFullObject`. Whole-library hardening beyond progressive/merge is out of scope unless asked.

## Tests
- Keep `test/progressive.test.ts`; rewrite the `ctx`-shape assertions as behavior checks; flip the two `test.failing` prune cases to real tests.
- **Differential/fuzz**: a ~20-line naive reference implementation of the grammar, random path sequences (object/keyed/multi-key steps, special characters, repeated keys) applied to both, deep-equal results and set→get round-trips. Seeded so failures are reproducible.
- **Merge regressions** from the probes: filtered row followed by a kept row; `date(type: Array)` + `@filter` dropping the first element (bugs 1, 2); late row of an earlier key; `@diff`/`@subtract` across queries with Array dims (`getBatchContext`); values with `= ; [ ] @ .`.
- Update the one snapshot that encodes bug 1 after reading the diff.
- Benchmark script (not a test), same scenarios as the baseline table; report before/after in the Review. Question D: commit it under `bench/` or keep it out of the repo.

## Decisions (confirmed)
- Scope: all three phases. Dead paths: fix properly. Stamped key: keep `String(value)`. Benchmark: commit under `bench/` with `npm run bench`.

## Todo
- [x] 1. Tests first: reference impl + differential tests + merge regressions (expected to fail on the known bugs)
- [x] 2. Phase 1: identity index, prune/`[n]`/`[]` fixes (or removal), `break` fix, snapshot update, full suite green, `tsc --noEmit`
- [x] 3. Benchmark phase 1 vs baseline
- [x] 4. Phase 2: compiled templates in `merge()`, string fallback; suite green; benchmark
- [x] 5. Phase 3: merge() hot loop; suite green; benchmark
- [x] 6. Review section

## Note on the "minimal change" rule
Phase 1 is a rewrite of one 380-line module behind an unchanged signature; the safety net is the existing 296 tests plus the new differential tests. `merge()` edits are the one-line `break` fix (phase 1) and template compilation (phase 2).

## Review (plan 2)

### What changed
- **`progressive.ts` rewritten** (same exports, same string grammar). Paths are parsed into segments once; keyed `[@k=v]` lookups go through a per-array index held in a `WeakMap` and keyed by the element's own values, so a lookup can never land on the wrong element: hits are verified (`arr[pos] === el` and the key values) and the index is rebuilt on any mismatch, external appends are indexed lazily. The old positional `hashContext` is gone; the parameter is still accepted and ignored, `getBatchContext` still exported.
- **New API**: `compilePath(template)`, `setByTemplate`, `getByTemplate`, `renderTemplate`, `withKey`. Row values are substituted as tokens, never spliced into a string, so `= ; [ ] @ : .` and `$&` in dimension values are plain data.
- **`merge()`** builds a per-query plan once (compiled template, parent template, applicable directives per metric column). Cells without directives are written straight from the template. Directives receive `template`, `parentTemplate`, `vars` and may return `vars`; the legacy `replacedPath`/`globalReplacedPath` strings are prototype getters on a `DirectiveArgs` class, built only when read, and a returned string `path` is still honoured. The dead `hashContext` plumbing in `getMergeStrings`/batches was removed.
- **Built-in directives** (`@filter`, `@groupOn`, `@groupBy`, `@diff`, `@subtract`, `@divide`, `@parse`) read through `getByTemplate` and return `vars` instead of rendering strings.
- **`replVars`** is a single regex pass: every occurrence is replaced, `:date` no longer eats `:date_x`, substituted values are not re-scanned, and `$&`-style replacement patterns are inert.
- **Tests**: 296 → 497. `test/progressive.test.ts` carries a naive reference implementation of the grammar and 150 seeded differential runs (random shapes, random keyed/pushed/indexed paths, `summItUp`, prune) plus behaviour tests for the index under outside mutation and for the template API. `test/merge.test.ts` holds the merge-level regressions (filter ordering, Array dim + filter, late rows, special characters, `@diff`/`@subtract` across queries, `@divide` byField, sibling metric + Array dim, combine, groupBy) and a custom directive exercising the legacy string contract. All test files now start with `export {}` so helper names cannot clash across files.
- **Benchmark**: `npm run bench [-- rows]` (`bench/merge.bench.js`, compiles into the git-ignored `.bench-build/`).

### Bugs fixed (all reproduced before, covered by tests now)
1. merge dropped the row after any filtered row (`j++; break`). Snapshot `@filter directive 2` updated: `series` now contains `Organic: 3`.
2. Positional cache misrouted writes/reads in merge pass two (and `result` vs `originFullObject`, and across queries). Gone by construction.
3. Grammar injection by dimension values containing `= ; [ ] @ :`; `$&` in a value became `:name`.
4. Positional cache corrupted by outside mutation; `firstIndexInput` duplicated existing elements.
5. Prune on `undefined` threw at the root; `[n]` on a missing array threw; `[]` under an object created a stray `arr` key (now an error); `[@a=1;b=2]` on an object wrote into a detached array (now stored under `a;b`).
6. `replVars` replaced only the first occurrence: `combine(fields: [date, device], type: Array)` under a `date` dimension stamped the literal `":date"`.
7. `@divide(byField: x)` without `by` indexed `originFullObject` with an object and always produced `null`.
8. `progressiveGet` threw a TypeError when a bracket step followed a missing key; now `NaN` like every other miss.

### Behaviour kept on purpose
- Stamped keys are the string form of the value (`String(value)`), as before.
- A missing step in a read yields `NaN` and the walk continues (so `x.[@id=zzz].y` is `undefined`), exactly as the old reducer did; directives rely on falsiness.
- ~~`@groupBy`/`@groupOn` wrote the grouped key / user replacers next to every metric, even ones nested under further dimensions.~~ **Changed after review**: they now write them only when the metric is a direct child of the grouped dimension (`globalPath === context.path`). No existing snapshot changed; two merge tests cover both shapes.
- Directives read the other query's **pre-directive** data (`@diff(by: prev)` sees prev's unfiltered values).
- Element matching compares `String(el[k]) === v` instead of `el[k] == v`; identical for everything merge produces, differs only for externally built arrays holding `true`/`null` keys (which now match their string form).

### Benchmark (200k rows per query, Apple silicon laptop, `dbFetch` mocked, `npm run bench`)
| scenario | before | after |
|---|---|---|
| object dims | 524 ms | 53 ms |
| `date(type: Array)` | 604 ms | 70 ms |
| Array dim + `@filter` | 1682 ms | 254 ms |
| two queries + `@diff` | (phase 2: 314 ms) | 125 ms |
| raw `replVars` + `progressiveSet` | 297 ms | 163 ms |
| raw `setByTemplate` | n/a | 27 ms |

### Verification
`npm test -- --ci`: 9 suites, 497 tests, 129 snapshots green. `npx tsc --noEmit` clean. `dist/` untouched (run `npm run build` before publishing). Nothing committed.
