# Benchmark: v4 vs v3

Same machine, same synthetic rows (`bench/run.js` here, `bench/merge.bench.js` in v3), 200 000 rows per statement, one warm-up run, then the **median of five** timed runs end to end (parse → plan → sql → fixture execute → assemble). v3 numbers are the median of five separate runs of its script. Node 22, Apple Silicon.

| scenario | v3 ms | v4 ms | v4 / v3 |
|---|---|---|---|
| object dims (3 Map levels, 2 metrics) | 44 | 34 | 0.77 |
| array date dim (Array + 2 Map levels) | 61 | 44 | 0.72 |
| array dim + @filter (two passes, baseline lookups) | 239 | 214 | 0.90 |
| two queries + @diff (two fetches, cross-fetch reads) | 117 | 101 | 0.86 |
| compile only (types + 2 fetches + directive), per call | n/a | 0.10 | |
| heap after the run | 150 MB | 116 MB | |

Spread across the five runs was within ±4% for both versions (v4 `@filter`: 211–230 ms; v3: 235–247 ms).

v4 is faster in every scenario. Where the time goes in v4 (`ctx.timings`): assembly dominates; parse+plan+sql is ~0.1 ms per query.

## What was tried

- **Keyed-element index** (WeakMap per array, one bucket per key spec) kept from v3: Array dimensions are O(1) per row.
- **Per-physical templates**: dimension steps, key columns and the hook chain are computed once per statement, not per row; rows only pay for `row[col]` reads and the walk.
- **Row-level hook cache** (`WeakMap<Row, CellResult>`): a dimension directive runs once per row, not once per cell. This is what keeps `@filter` close to the no-directive case (the remaining cost is the baseline lookup per row).
- **No deep clone / no freeze of the baseline**: pass 2 writes into fresh objects; the baseline is shared by reference. v3 `cloneDeep`ed the whole result when several fetches had directives.
- **Not done**: pass 2 re-reads every row set. A future optimization could skip pass 2 for fetches whose hooks returned nothing in pass 1, but the two-pass model is what makes relocation/pruning semantics simple, so it stays.

Reproduce: `npm run bench` here, `node bench/merge.bench.js` in the v3 checkout.
