/**
 * Rows → nested output (SPEC §7, §7.1).
 *
 * A streaming writer: physical queries in execution order, rows in row
 * order, every metric cell written at the location its dimension path names.
 * Two passes when any fetch carries a `result` hook; pass 1 is the baseline.
 */
import type { Cell, CellResult, Ctx, DirectiveUse, Fetch, Node, Output, Physical, Plan, Resolver, Row } from './model'
import type { Registry } from './registry'
import { nodeAt } from './plan/helpers'

export interface RowSet {
  physical: Physical
  rows: Row[]
}

export interface AssembleEnv {
  plan: Plan
  registry: Registry
  /** ctx for a result hook; `over` carries baseline/output/path/at */
  makeCtx(physical: Physical, node: Node | undefined, use: DirectiveUse | undefined, over: Partial<Ctx>): Ctx
  columns(node: Node, physical: Physical): string[]
}

interface Step {
  cols: string[]
  keySpec: string
  array: boolean
  /** plain object key (metric or unknown segment) */
  plain?: boolean
}

interface Hook {
  use: DirectiveUse
  resolver: Resolver
  owner: Node | undefined
  ownerPath: string[]
  rowLevel: boolean
}

interface MetricCell {
  node: Node
  col: string
  path: string[]
  hooks: Hook[]
  /** steps plus the metric's own Array step for `type: Array` metrics */
  allSteps?: Step[]
}

interface Template {
  steps: Step[]
  keyCols: string[]
  cells: MetricCell[]
  hasHooks: boolean
}

interface Holder {
  obj: Record<string, any>
  key: string
}

const SEP = '\u0000'
/** one state bag per middleware per assembler run, so its result hooks behave like a directive occurrence */
const mwStates = new WeakMap<Resolver, Record<string, unknown>>()
const mwState = (mw: Resolver) => {
  let st = mwStates.get(mw)
  if (!st) mwStates.set(mw, (st = {}))
  return st
}
const groupKey = (f: Fetch) => f.alias ?? ''

// ---------------------------------------------------------------------------
// keyed-element index
// ---------------------------------------------------------------------------

interface Bucket {
  cols: string[]
  map: Map<string, any>
}
const indexes = new WeakMap<any[], Map<string, Bucket>>()

function elementKey(el: any, cols: string[]): string | null {
  if (el === null || typeof el !== 'object') return null
  let out = ''
  for (let i = 0; i < cols.length; i++) {
    if (!(cols[i] in el)) return null
    out += (i ? SEP : '') + String(el[cols[i]])
  }
  return out
}

function valueKey(vals: unknown[]): string {
  let out = ''
  for (let i = 0; i < vals.length; i++) out += (i ? SEP : '') + String(vals[i])
  return out
}

function bucketOf(arr: any[], step: Step): Bucket {
  let buckets = indexes.get(arr)
  if (!buckets) {
    buckets = new Map()
    indexes.set(arr, buckets)
  }
  let b = buckets.get(step.keySpec)
  if (!b) {
    b = { cols: step.cols, map: new Map() }
    for (const el of arr) {
      const k = elementKey(el, step.cols)
      if (k !== null && !b.map.has(k)) b.map.set(k, el)
    }
    buckets.set(step.keySpec, b)
  }
  return b
}

function findKeyed(arr: any[], step: Step, vk: string): any {
  return bucketOf(arr, step).map.get(vk)
}

function appendKeyed(arr: any[], el: any): void {
  arr.push(el)
  const buckets = indexes.get(arr)
  if (!buckets) return
  for (const b of buckets.values()) {
    const k = elementKey(el, b.cols)
    if (k !== null && !b.map.has(k)) b.map.set(k, el)
  }
}

function isEmptyObject(o: any): boolean {
  for (const _ in o) return false
  return true
}

// ---------------------------------------------------------------------------
// locating
// ---------------------------------------------------------------------------

function mapKey(step: Step, keys: Record<string, unknown>): string {
  if (step.cols.length === 1) return String(keys[step.cols[0]])
  return step.cols.map((c) => String(keys[c])).join(';')
}

/** descend (creating) to the object the cell is written into */
function descend(holder: Holder, steps: Step[], keys: Record<string, unknown>): any {
  let node = holder.obj[holder.key]
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (s.array) {
      let arr: any[]
      if (Array.isArray(node)) arr = node
      else if (i === 0 && isEmptyObject(node)) {
        arr = []
        holder.obj[holder.key] = arr
      } else {
        arr = node[s.keySpec]
        if (arr == null) {
          arr = []
          node[s.keySpec] = arr
        } else if (!Array.isArray(arr)) {
          throw new Error(`Cannot write an Array dimension at "${s.keySpec}": the key holds a value`)
        }
      }
      const vals = s.cols.map((c) => keys[c])
      const vk = valueKey(vals)
      let el = findKeyed(arr, s, vk)
      if (el === undefined) {
        el = {}
        for (let k = 0; k < s.cols.length; k++) el[s.cols[k]] = vals[k]
        appendKeyed(arr, el)
      }
      node = el
    } else {
      if (Array.isArray(node)) throw new Error(`Cannot use key "${mapKey(s, keys)}" on an array`)
      const key = mapKey(s, keys)
      let child = node[key]
      if (child == null) {
        child = steps[i + 1]?.array ? [] : {}
        node[key] = child
      }
      node = child
    }
  }
  return node
}

/** read-only walk; `undefined` when a step is missing */
function readAt(root: any, steps: Step[], keys: Record<string, unknown>): any {
  let node = root
  for (const s of steps) {
    if (node == null || typeof node !== 'object') return undefined
    if (s.plain) {
      node = node[s.cols[0]]
    } else if (s.array) {
      const arr = Array.isArray(node) ? node : node[s.keySpec]
      if (!Array.isArray(arr)) return undefined
      node = findKeyed(arr, s, valueKey(s.cols.map((c) => keys[c])))
    } else {
      node = node[mapKey(s, keys)]
    }
  }
  return node
}

function iterate(node: any, steps: Step[], i: number, cb: (value: unknown) => void): void {
  if (i === steps.length) {
    cb(node)
    return
  }
  if (node == null || typeof node !== 'object') return
  const s = steps[i]
  if (s.plain) iterate(node[s.cols[0]], steps, i + 1, cb)
  else if (s.array) {
    const arr = Array.isArray(node) ? node : node[s.keySpec]
    if (Array.isArray(arr)) for (const el of arr) iterate(el, steps, i + 1, cb)
  } else if (!Array.isArray(node)) {
    for (const k of Object.keys(node)) iterate(node[k], steps, i + 1, cb)
  }
}

// ---------------------------------------------------------------------------
// assembler
// ---------------------------------------------------------------------------

export class Assembler {
  private stepCache = new Map<string, Step[]>()

  constructor(private env: AssembleEnv) {}

  /** steps for an output-key path inside a fetch, resolved through the fetch tree */
  stepsFor(fetch: Fetch | undefined, path: string[]): Step[] {
    const cacheKey = `${fetch ? groupKey(fetch) : '\u0001'}\u0000${path.join('\u0000')}`
    let steps = this.stepCache.get(cacheKey)
    if (steps) return steps
    steps = []
    for (let i = 0; i < path.length; i++) {
      const node = fetch ? nodeAt(fetch, path.slice(0, i + 1)) : undefined
      if (node && node.kind === 'dimension') steps.push(this.dimStep(node, fetch!))
      else steps.push({ cols: [path[i]], keySpec: path[i], array: false, plain: true })
    }
    this.stepCache.set(cacheKey, steps)
    return steps
  }

  private dimStep(node: Node, fetch: Fetch): Step {
    const cols = this.env.columns(node, { fetch } as Physical)
    return { cols, keySpec: cols.join(';'), array: node.args.type === 'Array' }
  }

  /** `ctx.at` bound to a baseline */
  reader(baseline: Output | undefined) {
    return (alias: string | null, keys: Record<string, unknown>, path: string[]): unknown => {
      if (!baseline) return undefined
      const fetch = this.env.plan.fetches.find((f) => f.alias === alias)
      return readAt(baseline[alias ?? ''], this.stepsFor(fetch, path), keys)
    }
  }

  /** every value at `path` in a tree (for `@indexed`) */
  values(tree: any, fetch: Fetch | undefined, path: string[]): unknown[] {
    const out: unknown[] = []
    iterate(tree, this.stepsFor(fetch, path), 0, (v) => out.push(v))
    return out
  }

  private template(physical: Physical): Template {
    const { fetch, grain } = physical
    const steps = grain.map((d) => this.dimStep(d, fetch))
    const keyCols = steps.flatMap((s) => s.cols)
    const grainPath = grain.map((d) => d.alias)

    const hooksOf = (uses: DirectiveUse[], owner: Node | undefined, ownerPath: string[], rowLevel: boolean): Hook[] => {
      const out: Hook[] = []
      for (const use of uses) {
        const resolver = this.env.registry.directives.get(use.name)
        if (resolver?.result) out.push({ use, resolver, owner, ownerPath, rowLevel })
      }
      return out
    }
    const shared: Hook[] = []
    for (const mw of this.env.registry.middleware) {
      if (mw.result) shared.push({ use: { name: 'middleware', args: {}, state: mwState(mw) }, resolver: mw, owner: undefined, ownerPath: [], rowLevel: true })
    }
    shared.push(...hooksOf(fetch.directives, undefined, [], true))
    grain.forEach((d, i) => shared.push(...hooksOf(d.directives, d, grainPath.slice(0, i + 1), true)))

    const cells: MetricCell[] = []
    for (const m of physical.metrics) {
      const path = [...grainPath, m.alias]
      const hooks = [...shared, ...hooksOf(m.directives, m, path, false)]
      for (const col of this.env.columns(m, physical)) {
        const cell: MetricCell = { node: m, col, path, hooks }
        if (m.args.type === 'Array') cell.allSteps = [...steps, { cols: [col], keySpec: col, array: true }]
        cells.push(cell)
      }
      if (m.args.type === 'Array') keyCols.push(...this.env.columns(m, physical))
    }
    return { steps, keyCols, cells, hasHooks: cells.some((c) => c.hooks.length > 0) }
  }

  assemble(rowSets: RowSet[]): Output {
    const templates = new Map<Physical, Template>()
    for (const rs of rowSets) templates.set(rs.physical, this.template(rs.physical))

    const out1 = this.pass(rowSets, templates, undefined)
    const needsPass2 = new Set<string>()
    for (const rs of rowSets) if (templates.get(rs.physical)!.hasHooks) needsPass2.add(groupKey(rs.physical.fetch))
    const out = needsPass2.size ? this.pass(rowSets, templates, out1, needsPass2) : out1

    const keys = Object.keys(out)
    return keys.length === 1 && keys[0] === '' ? out[''] : out
  }

  private pass(rowSets: RowSet[], templates: Map<Physical, Template>, baseline: Output | undefined, only?: Set<string>): Output {
    const out: Record<string, any> = baseline && only ? { ...baseline } : {}
    if (only) for (const k of only) delete out[k]
    const at = this.reader(baseline)

    for (const { physical, rows } of rowSets) {
      const key = groupKey(physical.fetch)
      if (only && !only.has(key)) continue
      if (physical.fetch.kind === 'fetchPlain') {
        ;(out[key] ??= []).push(rows)
        continue
      }
      if (!(key in out)) out[key] = {}
      this.fill({ obj: out, key }, physical, rows, templates.get(physical)!, baseline, out, at)
    }
    return out
  }

  private fill(
    holder: Holder,
    physical: Physical,
    rows: Row[],
    tpl: Template,
    baseline: Output | undefined,
    output: Output,
    at: Ctx['at'],
  ): void {
    const { steps, keyCols, cells } = tpl
    const ctxs = new Map<DirectiveUse, Ctx>()
    const rowCache = new Map<DirectiveUse, WeakMap<Row, CellResult | null>>()
    const ctxFor = (h: Hook): Ctx => {
      let ctx = ctxs.get(h.use)
      if (!ctx) {
        ctx = this.env.makeCtx(physical, h.owner, h.use, {
          baseline,
          output,
          path: h.ownerPath,
          at,
          values: (tree, alias, path) => this.values(tree, this.env.plan.fetches.find((f) => f.alias === alias), path),
        })
        ctxs.set(h.use, ctx)
      }
      return ctx
    }

    for (let j = 0; j < rows.length; j++) {
      const row = rows[j]
      const rowKeys: Record<string, unknown> = {}
      for (const c of keyCols) rowKeys[c] = row[c]

      for (const m of cells) {
        if (!(m.col in row)) continue
        let value = row[m.col]
        let keys = rowKeys
        let skip = false
        let skipAll = false
        let relocated = false
        let sets: Record<string, unknown>[] | null = null

        for (const h of m.hooks) {
          let res: CellResult | null | void
          if (h.rowLevel) {
            let cache = rowCache.get(h.use)
            if (!cache) rowCache.set(h.use, (cache = new WeakMap()))
            if (cache.has(row)) res = cache.get(row)
            else {
              res = h.resolver.result!({ value, row, keys, node: m.node, path: m.path, index: j }, ctxFor(h)) ?? null
              cache.set(row, res)
            }
          } else {
            res = h.resolver.result!({ value, row, keys, node: m.node, path: m.path, index: j }, ctxFor(h))
          }
          if (!res) continue
          if (!h.rowLevel && 'value' in res) value = res.value
          if (res.skip) skip = true
          if (res.skipAll) skipAll = true
          if (res.keys) {
            keys = res.keys
            relocated = true
          }
          if (res.set) (sets ??= []).push(res.set)
        }
        if (skipAll) break
        if (skip) continue

        const target = m.allSteps ? descend(holder, m.allSteps, { ...keys, [m.col]: value }) : descend(holder, steps, keys)
        if (relocated && typeof target[m.col] === 'number' && typeof value === 'number') target[m.col] += value
        else target[m.col] = value
        if (sets) for (const s of sets) Object.assign(target, s)
      }
    }
  }
}
