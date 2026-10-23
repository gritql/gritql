// Make this file a module so test helpers do not clash across files
export {}
//@ts-ignore
const {
  progressiveGet,
  progressiveSet,
  compilePath,
  setByTemplate,
  getByTemplate,
  iterateProgressive,
  replVars,
  getBatchContext,
} = require('../progressive')

// ---------------------------------------------------------------------------
// Reference implementation: the path grammar spelled out naively, no caching.
// The real module must agree with it on every generated sequence below.
// ---------------------------------------------------------------------------
type RefSeg =
  | { kind: 'key'; key: string }
  | { kind: 'push' }
  | { kind: 'index'; index: number }
  | { kind: 'match'; pairs: [string, string][] }

const unshield = (s: string) => s.replace(/\$#@#/g, '.')

const refParse = (path: string): RefSeg[] =>
  path.split('.').map((raw) => {
    const s = unshield(raw)
    if (!(s.startsWith('[') && s.endsWith(']'))) return { kind: 'key', key: s }
    const inner = s.slice(1, -1)
    if (inner === '') return { kind: 'push' }
    if (/^\d+$/.test(inner)) return { kind: 'index', index: +inner }
    if (inner.startsWith('@')) {
      return {
        kind: 'match',
        pairs: inner
          .slice(1)
          .split(';')
          .map((p) => {
            const i = p.indexOf('=')
            return [p.slice(0, i), p.slice(i + 1)] as [string, string]
          }),
      }
    }
    return { kind: 'key', key: s }
  })

const matches = (o: any, pairs: [string, string][]) =>
  o != null &&
  typeof o === 'object' &&
  pairs.every(([k, v]) => k in o && String(o[k]) === v)

function refSet(root: any, path: string, value: any, summItUp = false) {
  const segs = refParse(path)
  if (
    segs[0].kind !== 'key' &&
    !Array.isArray(root) &&
    Object.keys(root).length === 0
  ) {
    root = []
  }

  const trail: { node: any; parent: any; at: any; stamped: string[] }[] = []
  let node = root

  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]
    const next = segs[i + 1]
    let parent = node
    let at: any
    let stamped: string[] = []

    if (seg.kind === 'key') {
      if (Array.isArray(node)) throw new Error('key step on an array')
      if (node[seg.key] == null) node[seg.key] = next.kind === 'key' ? {} : []
      at = seg.key
      node = node[seg.key]
    } else if (seg.kind === 'match') {
      if (!Array.isArray(node)) {
        const k = seg.pairs.map(([key]) => key).join(';')
        if (node[k] == null) node[k] = []
        if (!Array.isArray(node[k])) throw new Error('match step on a non-array')
        trail.push({ node: node[k], parent: node, at: k, stamped: [] })
        parent = node[k]
        node = node[k]
      }
      let el = node.find((o) => matches(o, seg.pairs))
      if (!el) {
        el = {}
        seg.pairs.forEach(([k, v]) => (el[k] = v))
        node.push(el)
      }
      at = node.indexOf(el)
      stamped = seg.pairs.map(([k]) => k)
      node = el
    } else if (seg.kind === 'push') {
      if (!Array.isArray(node)) throw new Error('[] on an object')
      node.push({})
      at = node.length - 1
      node = node[at]
    } else {
      if (!Array.isArray(node)) throw new Error('[n] on an object')
      if (node[seg.index] == null) node[seg.index] = {}
      at = seg.index
      node = node[seg.index]
    }
    trail.push({ node, parent, at, stamped })
  }

  const prop = unshield(path.split('.').pop())

  if (value === undefined) {
    delete node[prop]
    for (let i = trail.length - 1; i >= 0; i--) {
      const { node: n, parent, at, stamped } = trail[i]
      const empty = Array.isArray(n)
        ? n.every((v) => v === undefined)
        : Object.keys(n).every((k) => stamped.includes(k))
      if (!empty) break
      if (Array.isArray(parent)) parent.splice(at, 1)
      else delete parent[at]
    }
  } else if (summItUp && node[prop]) {
    node[prop] += value
  } else {
    node[prop] = value
  }

  return root
}

function refGet(root: any, path: string) {
  const raws = path.split('.')
  const segs = refParse(path)
  let node = root

  // A miss becomes NaN and the walk continues (NaN.x is undefined).
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]
    if (seg.kind === 'match') {
      const find = (arr: any[]) => arr.find((o) => matches(o, seg.pairs))
      const spec = seg.pairs.map(([k]) => k).join(';')
      if (Array.isArray(node)) {
        const el = find(node)
        node = el === undefined ? NaN : el
      } else if (node != null && Array.isArray(node[spec])) {
        const el = find(node[spec])
        node = el === undefined ? NaN : el
      } else if (node != null && node[unshield(raws[i])]) {
        node = node[unshield(raws[i])]
      } else {
        node = NaN
      }
    } else if (seg.kind === 'index') {
      node = Array.isArray(node) && node[seg.index] !== undefined ? node[seg.index] : NaN
    } else if (seg.kind === 'push') {
      node = NaN
    } else if (Array.isArray(node)) {
      node = node.find((o) => o != null && Object.values(o).includes(seg.key))
    } else if (node == null) {
      node = NaN
    } else {
      node = node[seg.key]
    }
  }

  return node
}

// Small seeded PRNG so a failing sequence is reproducible from its seed.
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const KEYS = ['a', 'b', 'c']
const MATCH_KEYS = ['id', 'k', 'n']
const VALUES = ['x', 'y', '1', '2', 'a$#@#b', 'yy']

type Kind = 'key' | 'match' | 'push' | 'index'

// A shape fixes the segment kind at every depth, so every path generated
// from it is structurally compatible with the others (objects stay objects,
// arrays stay arrays). Keys of a match step are fixed per depth too.
function randomShape(rng: () => number) {
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]
  const depth = 1 + Math.floor(rng() * 4)
  const shape: { kind: Kind; keys?: string[] }[] = []

  for (let i = 0; i < depth; i++) {
    const prev = shape[i - 1]?.kind
    const allowed: Kind[] =
      i === 0 || prev === 'key'
        ? ['key', 'match', 'push', 'index']
        : ['key', 'match']
    const kind = pick(allowed)
    const keys =
      kind === 'match'
        ? Array.from(new Set([pick(MATCH_KEYS), ...(rng() < 0.3 ? [pick(MATCH_KEYS)] : [])]))
        : undefined
    shape.push({ kind, keys })
  }

  const randomPath = () =>
    shape
      .map(({ kind, keys }) => {
        if (kind === 'key') return pick(KEYS)
        if (kind === 'push') return '[]'
        if (kind === 'index') return `[${Math.floor(rng() * 3)}]`
        return `[@${keys.map((k) => `${k}=${pick(VALUES)}`).join(';')}]`
      })
      .concat(pick(KEYS))
      .join('.')

  return randomPath
}

const json = (x: any) => JSON.stringify(x)

describe('progressive', () => {
  describe('differential against the reference implementation', () => {
    for (let seed = 1; seed <= 150; seed++) {
      test(`seed ${seed}`, () => {
        const rng = mulberry32(seed)
        const randomPath = randomShape(rng)
        const ops = 5 + Math.floor(rng() * 25)
        const used: string[] = []
        let ref: any = {}
        let impl: any = {}

        for (let i = 0; i < ops; i++) {
          const pruning = used.length > 0 && rng() < 0.2
          const path = pruning ? used[Math.floor(rng() * used.length)] : randomPath()
          const value = pruning ? undefined : Math.floor(rng() * 100)
          const summ = !pruning && rng() < 0.2
          if (!pruning) used.push(path)

          let expected
          try {
            expected = refSet(ref, path, value, summ)
          } catch (e) {
            expect(() => progressiveSet(impl, path, value, summ)).toThrow()
            continue
          }
          ref = expected
          impl = progressiveSet(impl, path, value, summ)

          expect(json(impl)).toBe(json(ref))
        }

        for (const path of used) {
          expect(progressiveGet(impl, path)).toEqual(refGet(ref, path))
          const parent = path.slice(0, path.lastIndexOf('.'))
          if (parent) expect(progressiveGet(impl, parent)).toEqual(refGet(ref, parent))
        }
      })
    }
  })

  describe('progressiveSet', () => {
    test('creates nested objects', () => {
      expect(progressiveSet({}, 'a.b.c', 1)).toEqual({ a: { b: { c: 1 } } })
    })

    test('[] pushes a new element each time', () => {
      const obj = progressiveSet({}, 'list.[].x', 1)
      progressiveSet(obj, 'list.[].x', 2)

      expect(obj).toEqual({ list: [{ x: 1 }, { x: 2 }] })
    })

    test('[n] targets an element by index', () => {
      const obj = { list: [{ x: 1 }, { x: 2 }] }
      progressiveSet(obj, 'list.[1].y', 3)

      expect(obj.list[1]).toEqual({ x: 2, y: 3 })
    })

    test('[n] creates the array and the element when missing', () => {
      const obj = progressiveSet({}, 'list.[1].y', 3)

      expect(obj.list.length).toBe(2)
      expect(obj.list[1]).toEqual({ y: 3 })
    })

    test('[] under an existing object throws instead of inventing a key', () => {
      expect(() => progressiveSet({ l: { existing: 1 } }, 'l.[].x', 1)).toThrow(
        /\[\]/,
      )
    })

    test('a plain key on an array throws instead of pushing garbage', () => {
      expect(() => progressiveSet({ l: [{ x: 1 }] }, 'l.y.z', 1)).toThrow(/array/)
    })

    test('[@k=v] creates and then reuses a keyed element', () => {
      const obj = progressiveSet({}, 'list.[@id=a].x', 1)
      progressiveSet(obj, 'list.[@id=a].y', 2)
      progressiveSet(obj, 'list.[@id=b].x', 3)

      expect(obj).toEqual({
        list: [
          { id: 'a', x: 1, y: 2 },
          { id: 'b', x: 3 },
        ],
      })
    })

    test('[@k=v;k2=v2] matches on every key', () => {
      const obj = progressiveSet({}, 'list.[@a=1;b=x].v', 5)
      progressiveSet(obj, 'list.[@a=1;b=x].w', 6)
      progressiveSet(obj, 'list.[@a=1;b=y].v', 7)

      expect(obj).toEqual({
        list: [
          { a: '1', b: 'x', v: 5, w: 6 },
          { a: '1', b: 'y', v: 7 },
        ],
      })
    })

    test('[@k=v] at the root turns an empty object into an array', () => {
      const obj = progressiveSet({}, '[@id=a].x', 1)

      expect(obj).toEqual([{ id: 'a', x: 1 }])
    })

    test('[@k=v] on an object stores the array under the key', () => {
      // merge() produces this when a metric and an Array dimension are
      // siblings: { "2022-01-01": { total: 3, device: [...] } }
      const obj = progressiveSet({ d: { total: 3 } }, 'd.[@device=mobile].value', 1)
      progressiveSet(obj, 'd.[@device=desktop].value', 2)

      expect(obj).toEqual({
        d: {
          total: 3,
          device: [
            { device: 'mobile', value: 1 },
            { device: 'desktop', value: 2 },
          ],
        },
      })
      expect(progressiveGet(obj, 'd.[@device=desktop].value')).toBe(2)
    })

    test('[@k=v;k2=v2] on an object stores the array under the joined keys', () => {
      const obj = progressiveSet({ d: { total: 3 } }, 'd.[@a=1;b=2].value', 1)

      expect(obj).toEqual({ d: { total: 3, 'a;b': [{ a: '1', b: '2', value: 1 }] } })
      expect(progressiveGet(obj, 'd.[@a=1;b=2].value')).toBe(1)
    })

    test('[@k=v] where the key already holds a non-array throws', () => {
      expect(() =>
        progressiveSet({ d: { device: 5 } }, 'd.[@device=mobile].value', 1),
      ).toThrow(/device/)
    })

    test('matches stamped keys loosely by string form', () => {
      const obj = { list: [{ id: 1 }, { id: true }, { id: null }] }
      progressiveSet(obj, 'list.[@id=1].x', 'one')
      progressiveSet(obj, 'list.[@id=true].x', 'yes')
      progressiveSet(obj, 'list.[@id=null].x', 'nil')

      expect(obj.list).toEqual([
        { id: 1, x: 'one' },
        { id: true, x: 'yes' },
        { id: null, x: 'nil' },
      ])
    })

    test('elements lacking the key are never matched', () => {
      const obj = { list: [{ other: 1 }] }
      progressiveSet(obj, 'list.[@id=undefined].x', 1)

      expect(obj.list).toEqual([{ other: 1 }, { id: 'undefined', x: 1 }])
    })

    test('summItUp adds to an existing number', () => {
      const obj = progressiveSet({ a: 1 }, 'a', 2, true)
      progressiveSet(obj, 'b', 5, true)

      expect(obj).toEqual({ a: 3, b: 5 })
    })

    test('unshields $#@# back into dots', () => {
      expect(progressiveSet({}, 'test$#@#com.x', 1)).toEqual({ 'test.com': { x: 1 } })
      expect(progressiveSet({}, 'l.[@d=a$#@#b].x', 1)).toEqual({
        l: [{ d: 'a.b', x: 1 }],
      })
    })

    test('a legacy hashContext argument is accepted and ignored', () => {
      const ctx = {}
      const obj = progressiveSet({}, 'list.[@id=a].x', 1, false, ctx)
      progressiveSet(obj, 'list.[@id=a].y', 2, false, ctx)

      expect(obj.list).toEqual([{ id: 'a', x: 1, y: 2 }])
      expect(ctx).toEqual({})
    })

    describe('setting undefined prunes', () => {
      test('the leaf and every container that became empty', () => {
        const obj = progressiveSet({}, 'a.b.c', 1)
        progressiveSet(obj, 'a.b.d', 2)
        progressiveSet(obj, 'a.b.c', undefined)
        expect(obj).toEqual({ a: { b: { d: 2 } } })

        progressiveSet(obj, 'a.b.d', undefined)
        expect(obj).toEqual({})
      })

      test('an emptied keyed element, keeping the rest', () => {
        const obj = progressiveSet({}, 'list.[@id=a].x', 1)
        progressiveSet(obj, 'list.[@id=b].x', 2)
        progressiveSet(obj, 'list.[@id=a].x', undefined)

        expect(obj.list).toEqual([{ id: 'b', x: 2 }])
        expect(progressiveGet(obj, 'list.[@id=b].x')).toBe(2)

        progressiveSet(obj, 'list.[@id=b].x', undefined)
        expect(obj).toEqual({})
      })

      test('keeps a keyed element that still has other values', () => {
        const obj = progressiveSet({}, 'list.[@id=a].x', 1)
        progressiveSet(obj, 'list.[@id=a].y', 2)
        progressiveSet(obj, 'list.[@id=a].x', undefined)

        expect(obj.list).toEqual([{ id: 'a', y: 2 }])
      })

      test('a missing path is a no-op', () => {
        const obj = { a: { b: 1 } }
        progressiveSet(obj, 'a.zz', undefined)
        progressiveSet(obj, 'q.w.e', undefined)

        expect(obj).toEqual({ a: { b: 1 } })
      })
    })
  })

  describe('keyed lookups stay correct when the array is changed from outside', () => {
    test('after an unshift', () => {
      const obj = progressiveSet({}, 'l.[@id=a].x', 1)
      obj.l.unshift({ id: 'z' })
      progressiveSet(obj, 'l.[@id=a].y', 2)

      expect(obj.l).toEqual([{ id: 'z' }, { id: 'a', x: 1, y: 2 }])
      expect(progressiveGet(obj, 'l.[@id=a].y')).toBe(2)
      expect(progressiveGet(obj, 'l.[@id=z]')).toEqual({ id: 'z' })
    })

    test('after a splice', () => {
      const obj = progressiveSet({}, 'l.[@id=a].x', 1)
      progressiveSet(obj, 'l.[@id=b].x', 2)
      progressiveSet(obj, 'l.[@id=c].x', 3)
      obj.l.splice(0, 1)
      progressiveSet(obj, 'l.[@id=c].y', 4)
      progressiveSet(obj, 'l.[@id=a].y', 5)

      expect(obj.l).toEqual([
        { id: 'b', x: 2 },
        { id: 'c', x: 3, y: 4 },
        { id: 'a', y: 5 },
      ])
    })

    test('after an element is pushed directly', () => {
      const obj = progressiveSet({}, 'l.[@id=a].x', 1)
      obj.l.push({ id: 'b', x: 2 })
      progressiveSet(obj, 'l.[@id=b].y', 3)

      expect(obj.l).toEqual([
        { id: 'a', x: 1 },
        { id: 'b', x: 2, y: 3 },
      ])
    })

    test('after a key is rewritten', () => {
      const obj = progressiveSet({}, 'l.[@id=a].x', 1)
      obj.l[0].id = 'renamed'
      progressiveSet(obj, 'l.[@id=a].y', 2)

      expect(obj.l).toEqual([
        { id: 'renamed', x: 1 },
        { id: 'a', y: 2 },
      ])
    })

    test('a second object with the same shape is independent', () => {
      const a = progressiveSet({}, 'l.[@id=a].x', 1)
      const b = progressiveSet({}, 'l.[@id=b].x', 2)
      progressiveSet(b, 'l.[@id=a].x', 3)

      expect(a.l).toEqual([{ id: 'a', x: 1 }])
      expect(b.l).toEqual([
        { id: 'b', x: 2 },
        { id: 'a', x: 3 },
      ])
    })
  })

  describe('progressiveGet', () => {
    const obj = {
      a: { b: { c: 1 } },
      list: [
        { id: 'a', x: 1 },
        { id: 'b', x: 2 },
      ],
      'test.com': { x: 3 },
      '[lit]': 4,
    }

    test('reads nested values', () => {
      expect(progressiveGet(obj, 'a.b.c')).toBe(1)
    })

    test('reads keyed array elements', () => {
      expect(progressiveGet(obj, 'list.[@id=b].x')).toBe(2)
      expect(progressiveGet(obj, 'list.[@id=b]')).toEqual({ id: 'b', x: 2 })
    })

    test('reads [@k=v] through an object holding the array under k', () => {
      expect(progressiveGet({ d: { id: [{ id: 'q', v: 7 }] } }, 'd.[@id=q].v')).toBe(7)
    })

    test('reads an element by one of its values', () => {
      expect(progressiveGet(obj, 'list.b.x')).toBe(2)
    })

    test('reads by index', () => {
      expect(progressiveGet(obj, 'list.[1].x')).toBe(2)
      expect(progressiveGet(obj, 'list.[5]')).toBeNaN()
      expect(progressiveGet(obj, 'list.[5].x')).toBeUndefined()
    })

    test('a bracket segment falls back to a literal key', () => {
      expect(progressiveGet(obj, '[lit]')).toBe(4)
    })

    test('returns NaN for missing paths', () => {
      expect(progressiveGet(obj, 'a.nope.c')).toBeNaN()
      expect(progressiveGet(obj, 'list.[@id=zzz]')).toBeNaN()
      expect(progressiveGet(obj, 'list.[@id=zzz].x')).toBeUndefined()
      expect(progressiveGet(obj, 'a.nope.[@id=x]')).toBeNaN()
      expect(progressiveGet({ a: 5 }, 'a.b')).toBeUndefined()
    })

    test('unshields $#@# back into dots', () => {
      expect(progressiveGet(obj, 'test$#@#com.x')).toBe(3)
    })

    test('a legacy hashContext argument is accepted and ignored', () => {
      const ctx = {}
      expect(progressiveGet(obj, 'list.[@id=b].x', ctx)).toBe(2)
      expect(progressiveGet(obj, 'list.[@id=b].x', ctx)).toBe(2)
      expect(ctx).toEqual({})
    })
  })

  describe('compiled templates', () => {
    test('resolve :vars per row without going through a string', () => {
      const tpl = compilePath('[@date=:date].:device.value')
      let obj = {}
      obj = setByTemplate(obj, tpl, { date: '2022-01-01', device: 'mobile' }, 1)
      obj = setByTemplate(obj, tpl, { date: '2022-01-01', device: 'desktop' }, 2)
      obj = setByTemplate(obj, tpl, { date: '2022-01-02', device: 'mobile' }, 3)

      expect(obj).toEqual([
        { date: '2022-01-01', mobile: { value: 1 }, desktop: { value: 2 } },
        { date: '2022-01-02', mobile: { value: 3 } },
      ])
      expect(getByTemplate(obj, tpl, { date: '2022-01-02', device: 'mobile' })).toBe(3)
      expect(getByTemplate(obj, tpl, { date: '2022-01-03', device: 'mobile' })).toBeNaN()
      expect(getByTemplate(obj, tpl, { date: '2022-01-02', device: 'desktop' })).toBeNaN()
    })

    test('agree with replVars + progressiveSet on ordinary values', () => {
      const template = ':country.[@date=:date;device=:device].:kind.value'
      const rows = [
        { country: 'DE', date: '2022-01-01', device: 'mobile', kind: 'a', value: 1 },
        { country: 'DE', date: '2022-01-01', device: 'desktop', kind: 'a', value: 2 },
        { country: 'FR', date: '2022-01-02', device: 'mobile', kind: 'b', value: 3 },
        { country: 'DE', date: '2022-01-01', device: 'mobile', kind: 'b', value: 4 },
      ]
      const tpl = compilePath(template)
      let viaStrings: any = {}
      let viaTemplate: any = {}
      rows.forEach((row) => {
        viaStrings = progressiveSet(viaStrings, replVars(template, row), row.value)
        viaTemplate = setByTemplate(viaTemplate, tpl, row, row.value)
      })

      expect(json(viaTemplate)).toBe(json(viaStrings))
    })

    test('values never re-enter the path grammar', () => {
      const tpl = compilePath('[@domain=:domain].:device.value')
      const nasty = ['a=b;c', 'x[1]', '@at', '12:30:00', 'with.dot', '$&', ':device', '']
      let obj: any = {}
      nasty.forEach((domain, i) => {
        obj = setByTemplate(obj, tpl, { domain, device: `d.${i}` }, i)
      })

      expect(obj.map((el) => el.domain)).toEqual(nasty)
      nasty.forEach((domain, i) => {
        expect(obj[i][`d.${i}`]).toEqual({ value: i })
        expect(getByTemplate(obj, tpl, { domain, device: `d.${i}` })).toBe(i)
      })
    })

    test('substitute every occurrence of a variable', () => {
      const tpl = compilePath(':date.[@date=:date;device=:device].value')
      const obj = setByTemplate({}, tpl, { date: '2022-01-01', device: 'm' }, 1)

      expect(obj).toEqual({
        '2022-01-01': [{ date: '2022-01-01', device: 'm', value: 1 }],
      })
    })

    test('do not confuse :date with :date_x', () => {
      const tpl = compilePath(':date_x.:date.value')
      const obj = setByTemplate({}, tpl, { date: 'D', date_x: 'DX' }, 1)

      expect(obj).toEqual({ DX: { D: { value: 1 } } })
    })

    test('leave unknown variables as literals', () => {
      const tpl = compilePath(':a.:b.value')
      expect(setByTemplate({}, tpl, { a: 1 }, 2)).toEqual({ 1: { ':b': { value: 2 } } })
    })

    test('stamp the string form of a value, like replVars did', () => {
      const tpl = compilePath('[@date=:date].value')
      const date = new Date('2022-01-06T12:00:00Z')
      const obj = setByTemplate({}, tpl, { date }, 1)

      expect(obj).toEqual([{ date: String(date), value: 1 }])
      expect(setByTemplate({}, compilePath(':n.value'), { n: 5 }, 1)).toEqual({
        5: { value: 1 },
      })
    })

    test('join two variables inside one segment', () => {
      const tpl = compilePath(':date.:a;:b.value')
      expect(setByTemplate({}, tpl, { date: 'd', a: 'x', b: 'y' }, 1)).toEqual({
        d: { 'x;y': { value: 1 } },
      })
    })

    test('a template without variables behaves like a plain path', () => {
      const tpl = compilePath('a.[@id=1].b')
      expect(setByTemplate({}, tpl, {}, 1)).toEqual(progressiveSet({}, 'a.[@id=1].b', 1))
    })

    test('setting undefined prunes through templates too', () => {
      const tpl = compilePath('[@date=:date].:device.value')
      let obj = setByTemplate({}, tpl, { date: 'd1', device: 'm' }, 1)
      obj = setByTemplate(obj, tpl, { date: 'd2', device: 'm' }, 2)
      obj = setByTemplate(obj, tpl, { date: 'd1', device: 'm' }, undefined)

      expect(obj).toEqual([{ date: 'd2', m: { value: 2 } }])
    })
  })

  describe('iterateProgressive', () => {
    test('walks dynamic keys and arrays', () => {
      const obj = {
        mobile: { list: [{ v: 1 }, { v: 2 }] },
        desktop: { list: [{ v: 3 }] },
      }
      const seen = []

      iterateProgressive(obj, ':device.list.[].v', (value, keys) => {
        seen.push([value, keys])
      })

      expect(seen).toEqual([
        [1, ['mobile', 'list', 0, 'v']],
        [2, ['mobile', 'list', 1, 'v']],
        [3, ['desktop', 'list', 0, 'v']],
      ])
    })

    test('stops with undefined on a missing branch', () => {
      const seen = []

      iterateProgressive({ a: {} }, 'a.b.c', (value) => seen.push(value))

      expect(seen).toEqual([undefined])
    })
  })

  describe('replVars', () => {
    test('replaces :vars and shields dots in values', () => {
      expect(
        replVars('[@domain=:domain].:device.v', {
          domain: 'test.com',
          device: 'mobile',
        }),
      ).toBe('[@domain=test$#@#com].mobile.v')
    })

    test('leaves unknown vars alone', () => {
      expect(replVars(':a.:b', { a: 1 })).toBe('1.:b')
    })
  })

  describe('getBatchContext', () => {
    const ctx = { hit: true }
    const batches = {
      series: [{ name: 'series', hashContext: ctx }],
      ___queryother: [{ name: 'other', hashContext: ctx }],
    }

    test('finds a batch by name', () => {
      expect(getBatchContext(batches, 'series')).toBe(ctx)
    })

    test('falls back to the ___query prefix', () => {
      expect(getBatchContext(batches, 'other')).toBe(ctx)
    })

    test('returns an empty object when nothing matches', () => {
      expect(getBatchContext(batches, 'nope')).toEqual({})
    })
  })
})
