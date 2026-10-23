/**
 * graphql.web parses executable definitions only. gritql documents also carry
 * type blocks (`input Filters { ... }`, `enum`, `union`, `type`) that describe
 * the variables. This module lexes the source, lifts those blocks out into a
 * small TypeDef AST and blanks them in the text so graphql.web sees only the
 * operations and fragments.
 */
import { GritqlError } from '../errors'

export interface TypeRef {
  name: string
  list: boolean
  required: boolean
  itemRequired: boolean
}

export interface TypeDirective {
  name: string
  argsSource: string // raw text between the parentheses, parsed later with graphql.web
}

export interface TypeDef {
  kind: 'input' | 'type' | 'enum' | 'union'
  name: string
  directives: TypeDirective[]
  fields: { name: string; type: TypeRef }[]
  values: string[]
  types: string[]
}

interface Token {
  kind: 'name' | 'punct' | 'string' | 'number'
  value: string
  start: number
  end: number
}

const TYPE_KEYWORDS = new Set(['input', 'type', 'enum', 'union'])
const OPERATION_KEYWORDS = new Set(['query', 'mutation', 'subscription', 'fragment'])
const NAME_START = /[_A-Za-z]/
const NAME_CHAR = /[_0-9A-Za-z]/

export function lex(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ',' || c === '﻿') {
      i++
    } else if (c === '#') {
      while (i < n && text[i] !== '\n') i++
    } else if (c === '"') {
      const start = i
      if (text.startsWith('"""', i)) {
        i += 3
        while (i < n && !text.startsWith('"""', i)) i += text[i] === '\\' ? 2 : 1
        i += 3
      } else {
        i++
        while (i < n && text[i] !== '"') i += text[i] === '\\' ? 2 : 1
        i++
      }
      tokens.push({ kind: 'string', value: text.slice(start, i), start, end: i })
    } else if (c === '.' && text.startsWith('...', i)) {
      tokens.push({ kind: 'punct', value: '...', start: i, end: i + 3 })
      i += 3
    } else if ('!$&():=@[]{}|'.includes(c)) {
      tokens.push({ kind: 'punct', value: c, start: i, end: i + 1 })
      i++
    } else if (NAME_START.test(c)) {
      const start = i
      while (i < n && NAME_CHAR.test(text[i])) i++
      tokens.push({ kind: 'name', value: text.slice(start, i), start, end: i })
    } else if (c === '-' || (c >= '0' && c <= '9')) {
      const start = i
      i++
      while (i < n && /[0-9.eE+-]/.test(text[i])) i++
      tokens.push({ kind: 'number', value: text.slice(start, i), start, end: i })
    } else {
      throw new GritqlError('PARSE', `Unexpected character '${c}' at offset ${i}`)
    }
  }
  return tokens
}

class Cursor {
  i = 0
  constructor(private tokens: Token[]) {}
  peek(offset = 0): Token | undefined {
    return this.tokens[this.i + offset]
  }
  next(): Token {
    const t = this.tokens[this.i++]
    if (!t) throw new GritqlError('PARSE', 'Unexpected end of document in type definition')
    return t
  }
  expect(kind: Token['kind'], value?: string): Token {
    const t = this.next()
    if (t.kind !== kind || (value !== undefined && t.value !== value)) {
      throw new GritqlError('PARSE', `Expected ${value ?? kind} but found '${t.value}' at offset ${t.start}`)
    }
    return t
  }
  is(value: string): boolean {
    const t = this.peek()
    return !!t && t.kind === 'punct' && t.value === value
  }
}

function parseTypeRef(c: Cursor): TypeRef {
  if (c.is('[')) {
    c.next()
    const inner = parseTypeRef(c)
    if (inner.list) throw new GritqlError('PARSE', 'Nested list types are not supported')
    c.expect('punct', ']')
    const required = c.is('!')
    if (required) c.next()
    return { name: inner.name, list: true, required, itemRequired: inner.required }
  }
  const name = c.expect('name').value
  const required = c.is('!')
  if (required) c.next()
  return { name, list: false, required, itemRequired: false }
}

function parseDirectives(c: Cursor, text: string): TypeDirective[] {
  const out: TypeDirective[] = []
  while (c.is('@')) {
    c.next()
    const name = c.expect('name').value
    let argsSource = ''
    if (c.is('(')) {
      const open = c.next()
      let depth = 1
      let close = open
      while (depth > 0) {
        close = c.next()
        if (close.kind === 'punct' && close.value === '(') depth++
        if (close.kind === 'punct' && close.value === ')') depth--
      }
      argsSource = text.slice(open.end, close.start)
    }
    out.push({ name, argsSource })
  }
  return out
}

function parseTypeDef(c: Cursor, text: string): TypeDef {
  const kind = c.expect('name').value as TypeDef['kind']
  const name = c.expect('name').value
  const directives = parseDirectives(c, text)
  const def: TypeDef = { kind, name, directives, fields: [], values: [], types: [] }

  if (kind === 'union') {
    c.expect('punct', '=')
    if (c.is('|')) c.next()
    def.types.push(c.expect('name').value)
    while (c.is('|')) {
      c.next()
      def.types.push(c.expect('name').value)
    }
    return def
  }

  if (!c.is('{')) return def // e.g. `type X @inherits(name: Y)` with no own fields
  c.next()
  while (!c.is('}')) {
    const field = c.expect('name').value
    if (kind === 'enum') {
      def.values.push(field)
      parseDirectives(c, text)
      continue
    }
    c.expect('punct', ':')
    const type = parseTypeRef(c)
    parseDirectives(c, text)
    def.fields.push({ name: field, type })
  }
  c.next()
  return def
}

function skipBalanced(c: Cursor): void {
  // advance to the first '{' then past its matching '}'
  while (!c.is('{')) c.next()
  let depth = 0
  do {
    const t = c.next()
    if (t.kind === 'punct' && t.value === '{') depth++
    if (t.kind === 'punct' && t.value === '}') depth--
  } while (depth > 0)
}

export interface SplitDocument {
  executable: string // original text with type blocks blanked out (offsets preserved)
  types: TypeDef[]
  /** `fragment F($a: String!) on T` → { F: '$a: String!' }; the list is blanked for graphql.web */
  fragmentVariables: Record<string, string>
}

export function splitTypeBlocks(text: string): SplitDocument {
  const tokens = lex(text)
  const c = new Cursor(tokens)
  const types: TypeDef[] = []
  const fragmentVariables: Record<string, string> = {}
  const cuts: [number, number][] = []

  while (c.peek()) {
    const t = c.peek()!
    if (t.kind === 'name' && TYPE_KEYWORDS.has(t.value) && c.peek(1)?.kind === 'name') {
      const start = t.start
      types.push(parseTypeDef(c, text))
      const last = c.peek(-1)!
      cuts.push([start, last.end])
    } else if (t.kind === 'name' && t.value === 'fragment' && c.peek(2)?.kind === 'punct' && c.peek(2)?.value === '(') {
      c.next()
      const name = c.expect('name').value
      const open = c.next()
      let depth = 1
      let close = open
      while (depth > 0) {
        close = c.next()
        if (close.kind === 'punct' && close.value === '(') depth++
        if (close.kind === 'punct' && close.value === ')') depth--
      }
      fragmentVariables[name] = text.slice(open.end, close.start)
      cuts.push([open.start, close.end])
      skipBalanced(c)
    } else if ((t.kind === 'name' && OPERATION_KEYWORDS.has(t.value)) || (t.kind === 'punct' && t.value === '{')) {
      skipBalanced(c)
    } else {
      throw new GritqlError('PARSE', `Unexpected '${t.value}' at offset ${t.start}`)
    }
  }

  if (cuts.length === 0) return { executable: text, types, fragmentVariables }
  let executable = ''
  let pos = 0
  for (const [s, e] of cuts) {
    executable += text.slice(pos, s) + ' '.repeat(e - s)
    pos = e
  }
  executable += text.slice(pos)
  return { executable, types, fragmentVariables }
}
