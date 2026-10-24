#!/usr/bin/env node
// Measures the assembly phase (SQL rows -> result object) on synthetic data,
// plus parse+plan+sql compilation. Same scenarios and row generator as
// v3's bench/merge.bench.js so the numbers compare directly.
// Usage: npm run bench [-- <rows>]   (default 200000). Reports the median of 5 timed runs per scenario.
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const outDir = path.join(root, '.bench-build')

execSync(`npx tsc -p tsconfig.build.json --outDir ${outDir} --declaration false`, { cwd: root, stdio: 'inherit' })

const { gritql, fixtureAdapter } = require(path.join(outDir, 'index.js'))

const N = +process.argv[2] || 200000

const rows = []
for (let i = 0; i < N; i++) {
  rows.push({
    date: `2022-01-${String((i % 365) + 1).padStart(3, '0')}`,
    device: `dev${i % 20}`,
    country: `c${Math.floor(i / 7300)}`,
    value: i,
    other: i * 2,
  })
}

// v3-comparable scenarios run with v3's output shape (keyed objects) and legacy argument forms.
// Since proposal 1, @filter and @diff are computed in SQL: the fixture adapter returns the rows as
// given, so those two scenarios measure compile + single-pass assembly, not the directive work.
const compat = { strict: false, output: 'keyed' }
const scenarios = [
  ['object dims', `query t { fetch { date { device { country { value: sum(a: x) other: sum(a: y) } } } } }`, compat],
  ['array date dim', `query t { fetch { date(type: Array) { device { country { value: sum(a: x) other: sum(a: y) } } } } }`, compat],
  ['array dim + @filter', `query t { fetch { date(type: Array) { device @filter(value_gt: 100) { country { value: sum(a: x) other: sum(a: y) } } } } }`, compat],
  [
    'two queries + @diff',
    `query t {
    series: fetch { date(type: Array) { device { value: sum(a: x) @diff(by: prev) } } }
    prev: fetch { date(type: Array) { device { value: sum(a: x) } } }
  }`,
    compat,
  ],
  // the same three levels as 'object dims', in v4's default shape (arrays of records) vs keyed objects
  ['records (default)', `query t { fetch { date { device { country { value: sum(a: x) other: sum(a: y) } } } } }`, {}],
  ['keyed (type: Map)', `query t { fetch { date(type: Map) { device(type: Map) { country(type: Map) { value: sum(a: x) other: sum(a: y) } } } } }`, {}],
]

const time = async (fn) => {
  const start = process.hrtime.bigint()
  const result = await fn()
  return [Number(process.hrtime.bigint() - start) / 1e6, result]
}

const pad = (s, n) => String(s).padEnd(n)

;(async () => {
  console.log(`${N} rows per query\n`)
  console.log(`${pad('scenario', 24)}${pad('ms', 10)}result`)

  for (const [label, query, opts] of scenarios) {
    const tables = query.includes('prev:') ? [rows, rows] : [rows]
    const run = () => gritql({ adapters: { pg: fixtureAdapter(tables) }, ...opts }).run(query, {})
    await run() // warm up
    const samples = []
    let result
    for (let i = 0; i < 5; i++) {
      const [ms, r] = await time(run)
      samples.push(ms)
      result = r
    }
    samples.sort((a, b) => a - b)
    const size = Array.isArray(result) ? `${result.length} elements` : `${Object.keys(result).length} keys`
    console.log(`${pad(label, 24)}${pad(samples[2].toFixed(0), 10)}${size}   (median of 5; min ${samples[0].toFixed(0)}, max ${samples[4].toFixed(0)})`)
  }

  // compilation only: parse + plan + lower + sql, no rows
  const compileQuery = `
    input Date { gte: String!  lte: String! }
    input Filters { country: String  date: Date!  domain: [String] }
    query ii_transactional($filters: Filters, $limit: Number) {
      matrix: fetch(filters: $filters) {
        domain(type: Array, sort_desc: value, limit: $limit) {
          value: sum(a: transactionrevenue)
          share: share(a: transactionrevenue)
          device(type: Array) { value: sum(a: transactionrevenue) @diff(by: prev) }
        }
      }
      prev: fetch(filters: $filters) {
        domain(type: Array) { device(type: Array) { value: sum(a: transactionrevenue) } }
      }
    }`
  const vars = { filters: { country: 'US', date: { gte: '2022-01-01', lte: '2022-01-31' }, domain: ['a.com', 'b.com'] }, limit: 10 }
  const g = gritql({ adapters: { pg: fixtureAdapter([]) } })
  await g.compile(compileQuery, vars)
  const ITER = 1000
  const [compileMs] = await time(async () => {
    for (let i = 0; i < ITER; i++) await g.compile(compileQuery, vars)
  })
  console.log(`${pad('compile x1000', 24)}${pad(compileMs.toFixed(0), 10)}${(compileMs / ITER).toFixed(3)} ms/compile`)

  // the end-of-run figure is mostly uncollected garbage; report what the last result retains
  if (global.gc) global.gc()
  console.log(`\nheap retained after GC: ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB (rows + last result)`)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
