import { describe, test, expect } from 'vitest'
import { parseDocument, argsToObject, resolveVariables } from '../src/parse'
import { splitTypeBlocks } from '../src/parse/typeblocks'

const firstFetch = (text: string) => {
  const doc = parseDocument(text)
  const sel = doc.operations[0].selectionSet.selections[0]
  if (sel.kind !== 'Field') throw new Error('expected a field')
  return { doc, field: sel }
}

describe('type blocks', () => {
  test('are lifted out and blanked in place', () => {
    const text = `input Date { gte: String! lte: String! }
      query t($d: Date) { fetch(filters: $d) { v: sum(a: x) } }`
    const { executable, types } = splitTypeBlocks(text)
    expect(types).toHaveLength(1)
    expect(types[0]).toMatchObject({ kind: 'input', name: 'Date' })
    expect(types[0].fields.map((f) => [f.name, f.type.required])).toEqual([
      ['gte', true],
      ['lte', true],
    ])
    expect(executable).toHaveLength(text.length)
    expect(executable.trim().startsWith('query t')).toBe(true)
  })

  test('parses list types, enums, unions and @inherits', () => {
    const { types } = splitTypeBlocks(`
      enum Op { eq like }
      input OrArray { in: [String!]! }
      type Base { a: Number! }
      type Child @inherits(name: Base) { b: Number }
      union U = Base | Child
      query t { fetch { x } }
    `)
    expect(types.map((t) => t.kind)).toEqual(['enum', 'input', 'type', 'type', 'union'])
    expect(types[0].values).toEqual(['eq', 'like'])
    expect(types[1].fields[0].type).toEqual({ name: 'String', list: true, required: true, itemRequired: true })
    expect(types[3].directives).toEqual([{ name: 'inherits', argsSource: 'name: Base' }])
    expect(types[4].types).toEqual(['Base', 'Child'])
  })

  test('lifts fragment variable lists', () => {
    const text = `fragment F($a: String!, $b: Number) on Any { v: sum(a: $a) }
      query t { fetch { use(fragment: F, a: pageviews) } }`
    const { fragmentVariables, executable } = splitTypeBlocks(text)
    expect(fragmentVariables).toEqual({ F: '$a: String!, $b: Number' })
    expect(executable).toHaveLength(text.length)
    const doc = parseDocument(text)
    expect(doc.fragments.F.variableDefinitions.map((d) => d.variable.name.value)).toEqual(['a', 'b'])
  })

  test('ignores comments and strings that look like type blocks', () => {
    const { types, executable } = splitTypeBlocks(`# input Nope { a: String }
      query t { fetch(label: "type X { }") { v: sum(a: x) } }`)
    expect(types).toHaveLength(0)
    expect(executable).toContain('"type X { }"')
  })
})

describe('parseDocument', () => {
  test('collects operations, fragments and built types', () => {
    const doc = parseDocument(`
      input Filters { country: String! date: [String] }
      fragment F on T { v: sum(a: x) }
      query a($f: Filters) { x: fetch(filters: $f) { ...F } }
      query b { y: fetch { ...F } }
    `)
    expect(doc.operations).toHaveLength(2)
    expect(Object.keys(doc.fragments)).toEqual(['F'])
    expect(Object.keys(doc.types)).toContain('Filters')
  })

  test('type is exact, input is a loose shape', () => {
    const doc = parseDocument(`
      type Exact { a: String! }
      input Loose { a: String! }
      query t($e: Exact, $l: Loose) { fetch(e: $e, l: $l) { v } }
    `)
    const op = doc.operations[0]
    expect(() => resolveVariables(op, { e: { a: 'x', extra: 1 } }, doc.types)).toThrow(/key `extra`/)
    expect(() => resolveVariables(op, { l: { a: 'x', extra: 1 } }, doc.types)).not.toThrow()
    expect(() => resolveVariables(op, { l: { a: 1 } }, doc.types)).toThrow(/`l\.a`.*expected `string`/)
  })

  test('@inherits prepends parent fields', () => {
    const doc = parseDocument(`
      type Year { year: Number! }
      type Month @inherits(name: Year) { month: Number! }
      query t($m: Month) { fetch(m: $m) { v } }
    `)
    const op = doc.operations[0]
    expect(() => resolveVariables(op, { m: { year: 2022, month: 1 } }, doc.types)).not.toThrow()
    expect(() => resolveVariables(op, { m: { month: 1 } }, doc.types)).toThrow(/`m\.year` is marked as required/)
  })

  test('undeclared type is an error', () => {
    expect(() => parseDocument(`input A { x: Missing } query t { fetch { v } }`)).toThrow(
      /Missing is not declared type/,
    )
  })

  test('parse errors are GritqlError PARSE', () => {
    expect(() => parseDocument(`query t { fetch( { v } }`)).toThrow(expect.objectContaining({ code: 'PARSE' }))
  })
})

describe('variables', () => {
  test('required variable missing', () => {
    const doc = parseDocument(`query t($f: String!) { fetch(x: $f) { v } }`)
    expect(() => resolveVariables(doc.operations[0], {}, doc.types)).toThrow(
      /Failed query type: The query `f` is marked as required in `t`/,
    )
  })

  test('list variables and defaults', () => {
    const doc = parseDocument(`query t($l: [Number!], $d: Number = 5) { fetch(l: $l, d: $d) { v } }`)
    const vars = resolveVariables(doc.operations[0], { l: [1, 2] }, doc.types)
    expect(vars).toEqual({ l: [1, 2], d: 5 })
    expect(() => resolveVariables(doc.operations[0], { l: [1, 'a'] }, doc.types)).toThrow(/`l\[1\]`/)
  })
})

describe('argsToObject', () => {
  test('converts scalars, enums, lists and objects', () => {
    const { field } = firstFetch(
      `query t { fetch(s: "str", e: Adidas, i: 3, f: 1.5, b: true, n: null, l: [1, two], o: { k: { deep: 1 } }) { v } }`,
    )
    expect(argsToObject(field.arguments, {})).toEqual({
      s: 'str',
      e: 'Adidas',
      i: 3,
      f: 1.5,
      b: true,
      n: null,
      l: [1, 'two'],
      o: { k: { deep: 1 } },
    })
  })

  test('substitutes variables and drops undefined ones everywhere', () => {
    const { field } = firstFetch(
      `query t($a: Number, $missing: Number) { fetch(limit: $missing, filters: { x: $a, y: $missing }, list: [$a, $missing]) { v } }`,
    )
    expect(argsToObject(field.arguments, { a: 1 })).toEqual({ filters: { x: 1 }, list: [1] })
  })

  test('repeated argument names collect into an array', () => {
    const { field } = firstFetch(`query t { unionall(table: a, table: b, table: c) { v } }`)
    expect(argsToObject(field.arguments, {})).toEqual({ table: ['a', 'b', 'c'] })
  })

  test('fn|field strings stay strings', () => {
    const { field } = firstFetch(`query t { fetch(a: "count|sessions", b: "|x") { v } }`)
    expect(argsToObject(field.arguments, {})).toEqual({ a: 'count|sessions', b: '|x' })
  })
})
