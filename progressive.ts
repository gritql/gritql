/**
 * Path-based builder and reader for the nested result object that merge()
 * produces from flat SQL rows.
 *
 * Grammar (segments separated by '.'):
 *   key            plain object key
 *   []             push a new element
 *   [n]            the n-th element (created when missing)
 *   [@k=v;k2=v2]   the element whose k/k2 equal v/v2 by string form; created
 *                  with those keys stamped on it when missing. On an object
 *                  the array lives under the key(s) joined with ';'.
 *   $#@#           an escaped '.' (string paths only, see replVars)
 *   :name          a variable (compilePath only), replaced per row
 *
 * Keyed lookups are O(1): every array gets a lazily built index keyed by the
 * element's own values, held in a WeakMap, so it can never point at the wrong
 * element even when the array is changed from outside (hits are verified and
 * the index rebuilt on a mismatch).
 */

type Part = string | { v: string }

export type Segment =
  | { kind: 'key'; parts: Part[]; raw: string }
  | { kind: 'push'; raw: string }
  | { kind: 'index'; index: number; raw: string }
  | {
      kind: 'match'
      keys: string[]
      keySpec: string
      values: Part[][]
      raw: string
    }

export type CompiledPath = Segment[]

const SEP = '\u0000'
const VAR = /:([A-Za-z0-9_]+)/g
const EMPTY_VARS = {}
const hasOwn = Object.prototype.hasOwnProperty

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function unshieldSeparator(str: string) {
  return str.replace(/\$#@#/g, '.')
}

function parseParts(text: string, withVars: boolean): Part[] {
  if (!withVars || text.indexOf(':') === -1) return [text]

  const parts: Part[] = []
  let last = 0
  VAR.lastIndex = 0
  let m: RegExpExecArray
  while ((m = VAR.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push({ v: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))

  return parts
}

function parseSegment(raw: string, withVars: boolean): Segment {
  if (raw.length >= 2 && raw[0] === '[' && raw[raw.length - 1] === ']') {
    const inner = raw.slice(1, -1)

    if (inner === '') return { kind: 'push', raw }
    if (/^\d+$/.test(inner)) return { kind: 'index', index: +inner, raw }
    if (inner[0] === '@') {
      const keys: string[] = []
      const values: Part[][] = []
      inner
        .slice(1)
        .split(';')
        .forEach((pair) => {
          const eq = pair.indexOf('=')
          keys.push(pair.slice(0, eq))
          values.push(parseParts(pair.slice(eq + 1), withVars))
        })

      return { kind: 'match', keys, keySpec: keys.join(';'), values, raw }
    }
  }

  return { kind: 'key', parts: parseParts(raw, withVars), raw }
}

function parse(path: string, withVars: boolean): CompiledPath {
  return path
    .split('.')
    .map((raw) => parseSegment(unshieldSeparator(raw), withVars))
}

/** Compiles a template such as `[@date=:date].:device.value` once. */
export function compilePath(template: string): CompiledPath {
  return parse(template, true)
}

// Concrete paths (no variables) repeat a lot inside one merge; keep the
// parsed form around, bounded so unique paths can't grow memory forever.
const parsedPaths = new Map<string, CompiledPath>()
const PARSED_PATHS_LIMIT = 10000

function parseConcrete(path: string): CompiledPath {
  let segs = parsedPaths.get(path)
  if (!segs) {
    if (parsedPaths.size >= PARSED_PATHS_LIMIT) parsedPaths.clear()
    segs = parse(path, false)
    parsedPaths.set(path, segs)
  }
  return segs
}

// ---------------------------------------------------------------------------
// Variable resolution
// ---------------------------------------------------------------------------

function resolveParts(parts: Part[], vars: Record<string, any>): string {
  const first = parts[0]
  if (parts.length === 1 && typeof first === 'string') return first

  let out = ''
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (typeof part === 'string') out += part
    else if (hasOwn.call(vars, part.v)) out += String(vars[part.v])
    else out += ':' + part.v
  }
  return out
}

function resolveMatchValues(
  seg: Extract<Segment, { kind: 'match' }>,
  vars: Record<string, any>,
): string[] {
  const values = new Array(seg.values.length)
  for (let i = 0; i < values.length; i++) {
    values[i] = resolveParts(seg.values[i], vars)
  }
  return values
}

const valueKeyOf = (values: string[]) =>
  values.length === 1 ? values[0] : values.join(SEP)

// ---------------------------------------------------------------------------
// Keyed-element index
// ---------------------------------------------------------------------------

interface Entry {
  el: any
  pos: number
}

interface Bucket {
  keys: string[]
  map: Map<string, Entry>
}

interface ArrayIndex {
  // Array length the buckets were last synced to; -1 forces a rebuild.
  length: number
  buckets: Map<string, Bucket>
}

const indexes = new WeakMap<any[], ArrayIndex>()

function elementKey(el: any, keys: string[]): string | null {
  if (el === null || typeof el !== 'object') return null

  if (keys.length === 1) {
    return keys[0] in el ? String(el[keys[0]]) : null
  }

  let out = ''
  for (let i = 0; i < keys.length; i++) {
    if (!(keys[i] in el)) return null
    out += (i ? SEP : '') + String(el[keys[i]])
  }
  return out
}

function scanInto(arr: any[], bucket: Bucket, from: number) {
  for (let pos = from; pos < arr.length; pos++) {
    const key = elementKey(arr[pos], bucket.keys)
    if (key !== null && !bucket.map.has(key)) {
      bucket.map.set(key, { el: arr[pos], pos })
    }
  }
}

function rebuild(arr: any[], idx: ArrayIndex) {
  idx.buckets.forEach((bucket) => {
    bucket.map.clear()
    scanInto(arr, bucket, 0)
  })
  idx.length = arr.length
}

function syncedIndex(arr: any[]): ArrayIndex {
  let idx = indexes.get(arr)
  if (!idx) {
    idx = { length: arr.length, buckets: new Map() }
    indexes.set(arr, idx)
  } else if (idx.length !== arr.length) {
    if (idx.length >= 0 && arr.length > idx.length) {
      // Elements were appended from outside: index just the new tail.
      idx.buckets.forEach((bucket) => scanInto(arr, bucket, idx.length))
      idx.length = arr.length
    } else {
      rebuild(arr, idx)
    }
  }
  return idx
}

function findKeyed(
  arr: any[],
  keys: string[],
  keySpec: string,
  valueKey: string,
) {
  const idx = syncedIndex(arr)
  let bucket = idx.buckets.get(keySpec)
  if (!bucket) {
    bucket = { keys, map: new Map() }
    idx.buckets.set(keySpec, bucket)
    scanInto(arr, bucket, 0)
  }

  const hit = bucket.map.get(valueKey)
  if (hit === undefined) return undefined
  if (arr[hit.pos] === hit.el && elementKey(hit.el, keys) === valueKey) {
    return hit.el
  }

  // The array was changed from outside since we indexed it.
  rebuild(arr, idx)
  const fresh = bucket.map.get(valueKey)
  return fresh === undefined ? undefined : fresh.el
}

// Called right after this module put `el` at `pos`.
function indexAppend(arr: any[], el: any, pos: number) {
  const idx = indexes.get(arr)
  if (!idx) return
  idx.buckets.forEach((bucket) => {
    const key = elementKey(el, bucket.keys)
    if (key !== null && !bucket.map.has(key)) bucket.map.set(key, { el, pos })
  })
  idx.length = arr.length
}

function indexInvalidate(arr: any[]) {
  const idx = indexes.get(arr)
  if (idx) idx.length = -1
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

interface Step {
  node: any
  parent: any
  at: string | number
  stamped: string[] | null
}

const describePath = (segs: CompiledPath, upTo: number) =>
  segs
    .slice(0, upTo + 1)
    .map((s) => s.raw)
    .join('.')

const isEmptyObject = (o: any) => {
  for (const _ in o) return false
  return true
}

function setPath(
  root: any,
  segs: CompiledPath,
  vars: Record<string, any>,
  value: any,
  summItUp: boolean,
) {
  const n = segs.length
  if (n === 0) return root

  if (
    segs[0].kind !== 'key' &&
    !Array.isArray(root) &&
    root !== null &&
    typeof root === 'object' &&
    isEmptyObject(root)
  ) {
    root = []
  }

  const pruning = value === undefined
  const trail: Step[] = pruning ? [] : null
  let node = root

  for (let i = 0; i < n - 1; i++) {
    const seg = segs[i]
    let parent = node
    let at: string | number
    let stamped: string[] | null = null

    if (node === null || typeof node !== 'object') {
      throw new Error(
        `Cannot descend into a ${node === null ? 'null' : typeof node} at "${describePath(segs, i - 1)}"`,
      )
    }

    switch (seg.kind) {
      case 'key': {
        const key = resolveParts(seg.parts, vars)
        if (Array.isArray(node)) {
          throw new Error(
            `Cannot use key "${key}" on an array at "${describePath(segs, i - 1)}"`,
          )
        }
        let child = node[key]
        if (child == null) {
          child = segs[i + 1].kind === 'key' ? {} : []
          node[key] = child
        }
        at = key
        node = child
        break
      }

      case 'match': {
        if (!Array.isArray(node)) {
          let arr = node[seg.keySpec]
          if (arr == null) {
            arr = []
            node[seg.keySpec] = arr
          } else if (!Array.isArray(arr)) {
            throw new Error(
              `Cannot use ${seg.raw} at "${describePath(segs, i - 1)}": "${seg.keySpec}" is not an array`,
            )
          }
          if (pruning) trail.push({ node: arr, parent: node, at: seg.keySpec, stamped: null })
          parent = arr
          node = arr
        }

        const values = resolveMatchValues(seg, vars)
        let el = findKeyed(node, seg.keys, seg.keySpec, valueKeyOf(values))
        if (el === undefined) {
          el = {}
          for (let k = 0; k < seg.keys.length; k++) el[seg.keys[k]] = values[k]
          node.push(el)
          indexAppend(node, el, node.length - 1)
        }
        at = -1
        stamped = seg.keys
        node = el
        break
      }

      case 'push': {
        if (!Array.isArray(node)) {
          throw new Error(`Cannot use [] on an object at "${describePath(segs, i - 1)}"`)
        }
        const el = {}
        node.push(el)
        indexAppend(node, el, node.length - 1)
        at = node.length - 1
        node = el
        break
      }

      case 'index': {
        if (!Array.isArray(node)) {
          throw new Error(
            `Cannot use ${seg.raw} on an object at "${describePath(segs, i - 1)}"`,
          )
        }
        let el = node[seg.index]
        if (el == null) {
          el = {}
          node[seg.index] = el
          indexAppend(node, el, seg.index)
        }
        at = seg.index
        node = el
        break
      }
    }

    if (pruning) trail.push({ node, parent, at, stamped })
  }

  if (node === null || typeof node !== 'object') {
    throw new Error(
      `Cannot set a property on a ${node === null ? 'null' : typeof node} at "${describePath(segs, n - 2)}"`,
    )
  }

  const last = segs[n - 1]
  const prop = last.kind === 'key' ? resolveParts(last.parts, vars) : last.raw

  if (pruning) {
    delete node[prop]
    prune(trail)
  } else if (summItUp && node[prop]) {
    node[prop] += value
  } else {
    node[prop] = value
  }

  return root
}

// Removes every container on the trail that became empty, innermost first.
// A keyed element counts as empty when only its stamped keys are left.
function prune(trail: Step[]) {
  for (let i = trail.length - 1; i >= 0; i--) {
    const { node, parent, at, stamped } = trail[i]

    let empty: boolean
    if (Array.isArray(node)) {
      empty = node.every((v) => v === undefined)
    } else {
      empty = true
      for (const key in node) {
        if (!stamped || stamped.indexOf(key) === -1) {
          empty = false
          break
        }
      }
    }
    if (!empty) return

    if (Array.isArray(parent)) {
      const pos = typeof at === 'number' && at >= 0 ? at : parent.indexOf(node)
      if (pos !== -1) parent.splice(pos, 1)
      indexInvalidate(parent)
    } else {
      delete parent[at]
    }
  }
}

function getPath(root: any, segs: CompiledPath, vars: Record<string, any>) {
  let node = root

  // A missing step yields NaN and the walk goes on, so a trailing key
  // reads as undefined: callers test the result for falsiness.
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]

    switch (seg.kind) {
      case 'key': {
        const key = resolveParts(seg.parts, vars)
        if (Array.isArray(node)) {
          // Legacy convenience: an element is addressable by any of its values.
          node = node.find((o) => o != null && Object.values(o).includes(key))
        } else if (node == null) {
          node = NaN
        } else {
          node = node[key]
        }
        break
      }

      case 'match': {
        let arr: any[] = null
        if (Array.isArray(node)) arr = node
        else if (node != null && Array.isArray(node[seg.keySpec])) arr = node[seg.keySpec]

        if (arr) {
          const values = resolveMatchValues(seg, vars)
          const el = findKeyed(arr, seg.keys, seg.keySpec, valueKeyOf(values))
          node = el === undefined ? NaN : el
        } else if (node != null && node[seg.raw]) {
          node = node[seg.raw]
        } else {
          node = NaN
        }
        break
      }

      case 'index':
        node = Array.isArray(node) && node[seg.index] !== undefined ? node[seg.index] : NaN
        break

      case 'push':
        node = NaN
        break
    }
  }

  return node
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** The template with one more key segment, e.g. the parent path plus a metric name. */
export function withKey(compiled: CompiledPath, key: string): CompiledPath {
  return compiled.concat(parseSegment(key, false))
}

/**
 * The string path `replVars(template, vars)` would have produced, for code
 * that still works with string paths.
 */
export function renderTemplate(
  compiled: CompiledPath,
  vars: Record<string, any>,
): string {
  let out = ''
  for (let i = 0; i < compiled.length; i++) {
    const seg = compiled[i]
    if (i) out += '.'
    if (seg.kind === 'key') {
      out += shieldSeparator(resolveParts(seg.parts, vars))
    } else if (seg.kind === 'match') {
      out += '[@'
      for (let k = 0; k < seg.keys.length; k++) {
        if (k) out += ';'
        out += seg.keys[k] + '=' + shieldSeparator(resolveParts(seg.values[k], vars))
      }
      out += ']'
    } else {
      out += seg.raw
    }
  }
  return out
}

/** Writes `value` at the template path resolved against `vars` (a row). */
export function setByTemplate(
  object: any,
  compiled: CompiledPath,
  vars: Record<string, any>,
  value: any,
  summItUp = false,
) {
  return setPath(object, compiled, vars, value, summItUp)
}

/** Reads the template path resolved against `vars`; NaN when a step is missing. */
export function getByTemplate(
  object: any,
  compiled: CompiledPath,
  vars: Record<string, any>,
) {
  return getPath(object, compiled, vars)
}

/*
var k = {};
progressiveSet(k, 'book.test.one', 1)
progressiveSet(k, 'book.two.one', 3)
progressiveSet(k, 'book.dumbo.[].one', 3)
progressiveSet(k, 'book.dumbo.[].twenty', 434)
progressiveSet(k, 'book.dumbo.[].second', '3dqd25')
progressiveSet(k, 'book.dumbo.[1].leela', 'fry')
progressiveSet(k, 'book.dumbo.[@one=3].leela', 'fry')
console.log(JSON.stringify(k))
*/
// The trailing hashContext arguments are kept for callers of the old
// signature; the WeakMap index replaced them and they are ignored.
export function progressiveGet(object: any, queryPath: string, _hashContext?: any) {
  return getPath(object, parseConcrete(queryPath), EMPTY_VARS)
}

export function progressiveSet(
  object: any,
  queryPath: string,
  value: any,
  summItUp?: boolean,
  _hashContext?: Record<string, any>,
) {
  return setPath(object, parseConcrete(queryPath), EMPTY_VARS, value, !!summItUp)
}

export function iterateProgressive(
  obj,
  key: string,
  callback: (obj, currentKeys: Array<number | string>) => void,
) {
  function iterateKeys(obj, keys: string[], index = 0, currentKeys = []) {
    if (index === keys.length || obj == null) {
      callback(obj, currentKeys)
      return
    }

    if (keys[index].startsWith(':')) {
      const objKeys = Object.keys(obj)

      objKeys.forEach((key) => {
        iterateKeys(obj[key], keys, index + 1, [...currentKeys, key])
      })
    } else if (keys[index].startsWith('[') && keys[index].endsWith(']')) {
      obj.forEach?.((el, i) => {
        iterateKeys(el, keys, index + 1, [...currentKeys, i])
      })
    } else {
      iterateKeys(obj[keys[index]], keys, index + 1, [
        ...currentKeys,
        keys[index],
      ])
    }
  }

  return iterateKeys(obj, key.split('.'))
}

function shieldSeparator(str) {
  if (typeof str !== 'string') return str
  return str.replace(/\./g, '$#@#')
}

/**
 * Fills `:name` variables in a string path from `obj`, shielding dots in the
 * values. One pass over the template: every occurrence is replaced, `:date`
 * never eats `:date_x`, and substituted values are never re-scanned.
 */
export function replVars(str: string, obj: Record<string, any>) {
  return str.replace(VAR, (match, name) =>
    hasOwn.call(obj, name) ? shieldSeparator(String(obj[name])) : match,
  )
}

export function getBatchContext(batches, by) {
  return (
    (batches[by] || batches['___query' + by])?.find((q) => q.name === by)
      ?.hashContext || {}
  )
}
