# Benchmark: v4 vs v3

Same machine, same synthetic rows (`bench/run.js` here, `bench/merge.bench.js` in v3), 200 000 rows per statement, one warm-up run, then the **median of five** timed runs end to end (parse → plan → sql → fixture execute → assemble). v3 numbers are the median of five separate runs of its script. Node 22, Apple Silicon.

| scenario | v3 ms | v4 (4341937) ms | v4 (Phase 6) ms | Phase 6 / v3 |
|---|---|---|---|---|
| object dims (3 Map levels, 2 metrics) | 44 | 45 | 45 | 1.02 |
| array date dim (Array + 2 Map levels) | 61 | 51 | 49 | 0.80 |
| array dim + @filter | 239 | 165 | 50 | 0.21 |
| two queries + @diff | 117 | 91 | 42 | 0.36 |
| records (default shape, 3 array levels) | n/a | n/a | 74 | |
| keyed (`type: Map`, same 3 levels) | n/a | n/a | 46 | |
| compile only (types + 2 fetches + directive), per call | n/a | 0.108 | 0.158 | |
| heap retained after GC (rows + last result) | n/a | 39 MB | 43 MB | |

The "4341937" column is the v4 commit before the Phase 6 language changes, measured on the same day in an interleaved A/B (three alternating runs each; medians shown, spread within ±5%). The v3 column is from the original measurement session and is kept for scale; the first two scenarios moved by at most 2 ms between sessions.

Spread across the five runs was within ±5% for both versions (v4 `@filter`: 149–164 ms; v3: 235–247 ms). v3's script prints heap at the end of the run without a GC (150 MB), which measures uncollected garbage rather than memory held, so the heap rows are not comparable and v4 reports the retained figure instead. Run-to-run medians move by a few ms (object dims measured 34–39 ms across sessions).

Where the time goes in v4 (`ctx.timings`): assembly dominates; parse+plan+sql is ~0.15 ms per query.

## Phase 6 (language proposals 1–5)

- **`@filter` / `@diff` / `@subtract` / `@divide` are computed in SQL** (SPEC §6.7). The two directive scenarios no longer measure directive work: the fixture adapter returns the rows as given, the plan carries no result hooks, and the assembler runs one pass. What remains (50 and 42 ms) is compile + single-pass assembly, i.e. the cost floor of those shapes. On a database the arithmetic and the filter move into the statement (one extra join / derived table); the JS process never sees the dropped rows or the baseline rows.
- **Records are the default shape** (`output: 'records'`). On three nested levels with 200 000 rows, records assemble in 74 ms against 46 ms for the same levels as keyed objects (`type: Map`). The difference is a hash lookup per level per row (keyed-element index: `Map.get` on a string key) against a property read on a plain object, plus one record object per element. Two optimizations were made and kept: the index lives on the array as a non-enumerable symbol property instead of a `WeakMap` (94 → 83 ms), and single-column steps skip the values array and key concatenation (83 → 74 ms). `type: Map` on a dimension, or `output: 'keyed'` on the instance, restores the keyed shape and its timing.
- **Compile is ~0.05 ms slower per call** (0.108 → 0.158 ms): strict-mode checks (unknown-argument scan with edit-distance hints, a `visit` over the document for undeclared variables), the output-name mapping, and the arithmetic/having layers. At ~6 000 compiles per second it is not the bottleneck for any request that touches a database.
- **Heap**: +4 MB retained is the last result in records shape (one object per element instead of a key) and the per-array indexes.

## What was tried

- **Keyed-element index** (WeakMap per array, one bucket per key spec) kept from v3: Array dimensions are O(1) per row.
- **Per-physical templates**: dimension steps, key columns and the hook chain are computed once per statement, not per row; rows only pay for `row[col]` reads and the walk.
- **Row-level hook cache** (`WeakMap<Row, CellResult>`): a dimension directive runs once per row, not once per cell. This is what keeps `@filter` close to the no-directive case (the remaining cost is the baseline lookup per row).
- **No deep clone / no freeze of the baseline**: pass 2 writes into fresh objects; the baseline is shared by reference. v3 `cloneDeep`ed the whole result when several fetches had directives.
- **Directive conditions precomputed per occurrence** (`@filter(value_gt: 100)` → `[{ field: value, checks: [gt] }]`, cached by the args object): the hook checks the fields it names instead of scanning every key of the baseline object, which matters when the directive sits on a dimension whose object holds a nested dimension. This took `@filter` from 214 ms to 160 ms. Baseline steps are also cached by path-array identity, so `ctx.at` does no string building per row.
- **Row-level results that decide nothing are not cached** (`undefined` → the hook runs again for the row's other cells). Caching an empty decision per row was measured at ~12% slower on `@groupOn`/`@filter` (interleaved A/B, 200k rows): a WeakMap write per row costs more than two extra calls of a cheap hook. Hooks that are expensive and row-wide should return `{}` or `{ skip: false }` to be cached.
- **Not done**: pass 2 re-reads every row set. A future optimization could skip pass 2 for fetches whose hooks returned nothing in pass 1, but the two-pass model is what makes relocation/pruning semantics simple, so it stays.

Reproduce: `npm run bench` here, `node bench/merge.bench.js` in the v3 checkout.
