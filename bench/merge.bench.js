#!/usr/bin/env node
// Measures the merge phase (SQL rows -> result object) on synthetic data.
// Usage: npm run bench [-- <rows>]   (default 200000)
//
// Compiles the sources into .bench-build first so no `dist/` is needed.
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const outDir = path.join(root, '.bench-build')

execSync(`npx tsc -p tsconfig.json --outDir ${outDir} --declaration false`, {
  cwd: root,
  stdio: 'inherit',
})

const { gqlToDb } = require(path.join(outDir, 'gql-sql-slicer.js'))
const { progressiveSet, replVars, compilePath, setByTemplate } = require(
  path.join(outDir, 'progressive.js'),
)

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

const scenarios = [
  ['object dims', `query t { fetch { date { device { country { value: sum(a: x) other: sum(a: y) } } } } }`],
  ['array date dim', `query t { fetch { date(type: Array) { device { country { value: sum(a: x) other: sum(a: y) } } } } }`],
  ['array dim + @filter', `query t { fetch { date(type: Array) { device @filter(value_gt: 100) { country { value: sum(a: x) other: sum(a: y) } } } } }`],
  ['two queries + @diff', `query t {
    series: fetch { date(type: Array) { device { value: sum(a: x) @diff(by: prev) } } }
    prev: fetch { date(type: Array) { device { value: sum(a: x) } } }
  }`],
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

  for (const [label, query] of scenarios) {
    const tables = query.includes('prev:') ? [rows, rows] : [rows]
    const run = () => gqlToDb().dbFetch(() => tables)(query, {})
    await run() // warm up
    const [ms, result] = await time(run)
    const size = Array.isArray(result)
      ? `${result.length} elements`
      : `${Object.keys(result).length} keys`
    console.log(`${pad(label, 24)}${pad(ms.toFixed(0), 10)}${size}`)
  }

  const template = '[@date=:date].:device.:country.value'
  const [stringMs] = await time(() => {
    let o = {}
    for (const r of rows) o = progressiveSet(o, replVars(template, r), r.value)
    return o
  })
  console.log(`${pad('raw: replVars + set', 24)}${stringMs.toFixed(0)}`)

  const compiled = compilePath(template)
  const [templateMs] = await time(() => {
    let o = {}
    for (const r of rows) o = setByTemplate(o, compiled, r, r.value)
    return o
  })
  console.log(`${pad('raw: setByTemplate', 24)}${templateMs.toFixed(0)}`)

  console.log(`\nheap used: ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
