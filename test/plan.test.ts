import { describe, test, expect } from 'vitest'
import { parseDocument } from '../src/parse'
import { buildPlan } from '../src/plan/build'

const plan = (text: string, variables: Record<string, unknown> = {}) => buildPlan(parseDocument(text), variables)

describe('buildPlan', () => {
  test('fetch forms, aliases and default table', () => {
    const p = plan(`query t {
      a: fetch { v: sum(a: x) }
      fetch(table: other) { v }
      w: with { v }
      p: fetchPlain(table: raw) { v }
      u: unionall(table: a, table: b) { v }
    }`)
    expect(p.fetches.map((f) => [f.alias, f.kind, f.source, f.emit])).toEqual([
      ['a', 'fetch', 't', true],
      [null, 'fetch', 'other', true],
      ['w', 'with', 't', false],
      ['p', 'fetchPlain', 'raw', true],
      ['u', 'unionall', ['a', 'b'], true],
    ])
  })

  test('anonymous operation needs a table', () => {
    expect(() => plan(`{ q: fetch { v } }`)).toThrow(/Table name must be specified/)
    expect(plan(`{ q: fetch(table: t) { v } }`).fetches[0].source).toBe('t')
  })

  test('metric vs dimension, alias, args, children, directives', () => {
    const p = plan(`query t($l: Number) {
      fetch { device(type: Array, limit: $l) @filter(value_gt: 1) { value: sum(a: x) @diff(by: prev) title } }
    }`, { l: 5 })
    const [device] = p.fetches[0].tree
    expect(device).toMatchObject({ alias: 'device', name: 'device', kind: 'dimension', args: { type: 'Array', limit: 5 } })
    expect(device.directives).toEqual([{ name: 'filter', args: { value_gt: 1 }, state: {} }])
    expect(device.children.map((c) => [c.alias, c.name, c.kind])).toEqual([
      ['value', 'sum', 'metric'],
      ['title', 'title', 'metric'],
    ])
    expect(device.children[0].directives[0]).toMatchObject({ name: 'diff', args: { by: 'prev' } })
  })

  test('legacy inline args and filters object merge into one filter (strict: false)', () => {
    const q = `query t { fetch(brand: Adidas, date_gt: "2020-1-1", date_lt: "2021", cat_in: "a|b", filters: { price: { gte: 1 } }) { v } }`
    expect(() => plan(q)).toThrow(/Unknown fetch argument 'brand'/)
    const p = buildPlan(parseDocument(q), {}, { strict: false })
    expect(p.fetches[0].filters).toEqual({
      brand: 'Adidas',
      date: { gt: '2020-1-1', lt: '2021' },
      cat: { in: ['a', 'b'] },
      price: { gte: 1 },
    })
  })

  test('search and join arguments', () => {
    const p = plan(`query t { fetch(search: { title: "shoes" }, leftJoin: { table: cat, on: { product: "@product" } }) { v } }`)
    expect(p.fetches[0].search).toEqual({ title: 'shoes' })
    expect(p.fetches[0].joins).toEqual([{ type: 'leftJoin', table: 'cat', on: { product: '@product' } }])
    expect(p.fetches[0].filters).toBeNull()
  })

  test('join nodes fold into fetch.joins and lift their children', () => {
    const p = plan(`query t { fetch {
      join(table: cat, by: "@product:@product", by: "@country:@country") {
        product(type: Array) { price: unique(a: price, from: cat) }
      }
    } }`)
    const f = p.fetches[0]
    expect(f.joins).toEqual([{ type: 'join', table: 'cat', on: { product: '@product', country: '@country' } }])
    expect(f.tree.map((n) => n.alias)).toEqual(['product'])
  })

  test('join requires table and on/by', () => {
    expect(() => plan(`query t { fetch { join(table: cat) { v } } }`)).toThrow(/'by' or 'on'/)
    expect(() => plan(`query t { fetch { join(on: { a: "@a" }) { v } } }`)).toThrow(/'table'/)
  })

  test('fragments: spread, inline and use() with arguments', () => {
    const p = plan(`
      fragment Shares on Any { date(type: Array) { value: sum(a: pageviews) } }
      fragment ByMetric($a: String!, $t: String = "Array") on Any { date(type: $t) { value: sum(a: $a) } }
      query t {
        a: fetch { ...Shares }
        b: fetch { use(fragment: ByMetric, a: sessions) }
        c: fetch { ... on Any { total: sum(a: x) } }
      }`)
    expect(p.fetches[0].tree[0].children[0].args).toEqual({ a: 'pageviews' })
    expect(p.fetches[1].tree[0].args).toEqual({ type: 'Array' })
    expect(p.fetches[1].tree[0].children[0].args).toEqual({ a: 'sessions' })
    expect(p.fetches[2].tree[0].alias).toBe('total')
  })

  test('use() validates fragment arguments', () => {
    const text = `fragment F($a: String!) on Any { v: sum(a: $a) } query t { fetch { use(fragment: F) } }`
    expect(() => plan(text)).toThrow(/`a` is marked as required in `F`/)
    expect(() => plan(`query t { fetch { ...Missing } }`)).toThrow(/Missing fragment is not defined/)
  })

  test('multiple operations share variables and contribute fetches in order', () => {
    const p = plan(
      `query a($t: String!) { x: fetch(table: $t) { v } } query b($t: String!) { y: fetch(table: $t) { v } }`,
      { t: 'tbl' },
    )
    expect(p.fetches.map((f) => [f.alias, f.source])).toEqual([
      ['x', 'tbl'],
      ['y', 'tbl'],
    ])
  })

  test('empty fetch and unknown top-level field are errors', () => {
    expect(() => plan(`query t { fetch { } }`)).toThrow()
    expect(() => plan(`query t { nope { v } }`)).toThrow(/Cant find fetch/)
  })
})
