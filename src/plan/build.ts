/**
 * AST → Plan (SPEC §2, §3). Variables are substituted, fragments inlined,
 * join nodes folded into `fetch.joins`, legacy inline filters normalized.
 * Directives are attached, not evaluated: that is the engine's `plan` stage.
 */
import type {
  DirectiveNode,
  FieldNode,
  OperationDefinitionNode,
  SelectionNode,
  VariableDefinitionNode,
} from '@0no-co/graphql.web'
import { visit } from '@0no-co/graphql.web'
import { GritqlError, toGritqlError } from '../errors'
import type { DirectiveUse, Fetch, FetchKind, FilterExpr, Join, JoinType, Node, Plan } from '../model'
import { JOIN_TYPES } from '../model'
import type { Fragment, ParsedDocument } from '../parse'
import { argsToObject, resolveVariables, Variables } from '../parse'
import { checkPropTypes, PropTypes } from '../types'
import { typeNodeChecker } from '../parse/types'

const FETCH_KINDS: readonly FetchKind[] = ['fetch', 'with', 'fetchPlain', 'unionall']
const RESERVED_FETCH_ARGS = new Set(['table', 'filters', 'where', 'having', 'search', ...JOIN_TYPES])

/** closest candidate within two edits, for "did you mean" hints */
export function suggest(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined
  let bestD = 3
  for (const c of candidates) {
    const d = editDistance(name.toLowerCase(), c.toLowerCase())
    if (d < bestD) (bestD = d), (best = c)
  }
  return best
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}
const LEGACY_SUFFIXES: [string, string][] = [
  ['_gte', 'gte'],
  ['_lte', 'lte'],
  ['_gt', 'gt'],
  ['_lt', 'lt'],
  ['_like', 'like'],
  ['_in', 'in'],
]

interface BuildContext {
  doc: ParsedDocument
  variables: Variables
  fetch: Fetch
  path: string[]
  strict: boolean
}

export interface BuildOptions {
  /** reject unknown fetch arguments, undeclared variables and legacy string forms (default true) */
  strict?: boolean
}

export function buildPlan(doc: ParsedDocument, variables: Variables, opts: BuildOptions = {}): Plan {
  const strict = opts.strict !== false
  if (strict) checkDeclaredVariables(doc)
  const plan: Plan = { fetches: [], variables }
  for (const op of doc.operations) {
    const vars = resolveVariables(op, variables, doc.types)
    const defaultTable = op.name?.value ?? null
    for (const sel of op.selectionSet.selections) {
      if (sel.kind !== 'Field') throw new GritqlError('PLAN', 'Only fetch, with, fetchPlain or unionall are allowed at the top level')
      plan.fetches.push(buildFetch(sel, defaultTable, doc, vars, strict))
    }
  }
  return plan
}

/**
 * strict: every `$var` used in an operation must be declared by that operation; one used in a fragment by the
 * fragment (`fragment F($a: String!)`) or by any operation, since a fragment may be spread in any of them
 */
function checkDeclaredVariables(doc: ParsedDocument): void {
  const names = (defs: readonly { variable: { name: { value: string } } }[] | undefined) => (defs ?? []).map((d) => d.variable.name.value)
  const check = (root: any, declared: Set<string>, where: string) =>
    visit(root, {
      Variable(node: any) {
        if (!declared.has(node.name.value)) {
          throw new GritqlError('TYPE', `Variable $${node.name.value} is not declared by ${where}; declare it or set strict: false`)
        }
      },
    })
  const everyOperation = doc.operations.flatMap((op) => names(op.variableDefinitions))
  for (const op of doc.operations) check(op.selectionSet, new Set(names(op.variableDefinitions)), `operation '${op.name?.value ?? 'query'}'`)
  for (const [name, f] of Object.entries(doc.fragments)) check(f.definition.selectionSet, new Set([...everyOperation, ...names(f.variableDefinitions)]), `fragment '${name}'`)
}

function directives(nodes: readonly DirectiveNode[] | undefined, vars: Variables): DirectiveUse[] {
  return (nodes ?? []).map((d) => ({ name: d.name.value, args: argsToObject(d.arguments, vars), state: {} }))
}

function buildFetch(field: FieldNode, defaultTable: string | null, doc: ParsedDocument, vars: Variables, strict: boolean): Fetch {
  const kind = field.name.value as FetchKind
  if (!FETCH_KINDS.includes(kind)) {
    throw new GritqlError('PLAN', `Cant find fetch in the payload: '${kind}' is not fetch, with, fetchPlain or unionall`)
  }
  const args = argsToObject(field.arguments, vars)
  const alias = field.alias?.value ?? null
  if (strict) {
    for (const k of Object.keys(args)) {
      if (RESERVED_FETCH_ARGS.has(k)) continue
      const near = suggest(k, RESERVED_FETCH_ARGS)
      const hint = near ? `did you mean '${near}'?` : `column predicates go in \`where: { ${k}: ... }\`; limit/offset/sort belong on a dimension`
      throw new GritqlError('ARGS', `Unknown fetch argument '${k}': ${hint}`, { path: [alias ?? kind] })
    }
    if (args.having !== undefined && args.filters && typeof args.filters === 'object' && 'having' in (args.filters as object)) {
      throw new GritqlError('ARGS', '`having` is given both as a fetch argument and inside `filters`', { path: [alias ?? kind] })
    }
  }

  let source: string | string[]
  if (kind === 'unionall') {
    const tables = args.table
    source = Array.isArray(tables) ? (tables as string[]) : typeof tables === 'string' ? [tables] : []
    if (source.length === 0) throw new GritqlError('PLAN', 'unionall requires at least one table argument', { path: [alias ?? kind] })
  } else {
    const table = (args.table as string | undefined) ?? defaultTable
    if (!table) {
      throw new GritqlError('PLAN', 'Table name must be specified trought table argument or query name', { path: [alias ?? kind] })
    }
    source = table
  }

  const fetch: Fetch = {
    alias,
    kind,
    source,
    filters: normalizeFilters(args),
    where: args.where && typeof args.where === 'object' ? (args.where as FilterExpr) : null,
    search: (args.search as Record<string, string>) ?? {},
    joins: [],
    tree: [],
    directives: directives(field.directives, vars),
    emit: kind !== 'with',
    variables: vars,
  }
  for (const type of JOIN_TYPES) {
    if (args[type] !== undefined) fetch.joins.push(toJoin(type, args[type] as Record<string, unknown>, alias ?? kind, strict))
  }
  // search terms from `filters: { search }` join the fetch-level registry so search metrics can find them
  const inFilters = fetch.filters?.search
  if (inFilters && typeof inFilters === 'object') {
    fetch.search = { ...fetch.search }
    for (const [k, v] of Object.entries(inFilters as Record<string, unknown>)) {
      if (k in fetch.search) throw new GritqlError('ARGS', `Search for ${k} already defined`, { path: [alias ?? kind] })
      fetch.search[k] = String(v)
    }
  }
  if (!field.selectionSet?.selections.length) {
    throw new GritqlError('PLAN', 'The query is empty, you need specify metrics or dimensions', { path: [alias ?? kind] })
  }
  fetch.tree = buildNodes(field.selectionSet.selections, { doc, variables: vars, fetch, path: [alias ?? ''], strict })
  return fetch
}

/** `filters: {...}`, the `having:` fetch argument, plus legacy inline args (`brand: Adidas`, `date_gt: "2020"`) → one filter object. */
function normalizeFilters(args: Record<string, unknown>): FilterExpr | null {
  const out: FilterExpr = {}
  let any = false
  if (args.having !== undefined) {
    out.having = args.having
    any = true
  }
  for (const [key, value] of Object.entries(args)) {
    if (RESERVED_FETCH_ARGS.has(key)) continue
    any = true
    const suffix = LEGACY_SUFFIXES.find(([s]) => key.endsWith(s) && key.length > s.length)
    if (!suffix) {
      out[key] = value
      continue
    }
    const [s, op] = suffix
    const column = key.slice(0, -s.length)
    const existing = (out[column] as Record<string, unknown> | undefined) ?? {}
    existing[op] = op === 'in' && typeof value === 'string' ? value.split('|') : value
    out[column] = existing
  }
  if (args.filters && typeof args.filters === 'object') {
    Object.assign(out, args.filters as FilterExpr)
    any = true
  }
  return any ? out : null
}

/** join shorthand operators and their mirror when written on the joined-table side */
const BY_OPS: Record<string, string> = { eq: 'eq', gt: 'lt', gte: 'lte', lt: 'gt', lte: 'gte' }

function toJoin(type: JoinType, args: Record<string, unknown>, where: string, strict: boolean): Join {
  const table = args.table
  if (typeof table !== 'string') throw new GritqlError('ARGS', "Join function requires 'table' as argument", { path: [where] })
  let on = (args.on as FilterExpr | undefined) ?? {}
  const byKeys = Object.keys(args).filter((k) => k === 'by' || k.startsWith('by_'))
  if (byKeys.length && strict) {
    const k = byKeys[0]
    const [left, right] = String(Array.isArray(args[k]) ? (args[k] as string[])[0] : args[k]).split(':')
    const col = (right ?? 'joinedColumn').replace(/^@/, '')
    const ref = left?.startsWith('@') ? left : `@${left ?? 'fetchColumn'}`
    const op = k === 'by' ? 'eq' : k.slice(3)
    const example = op === 'eq' ? `{ ${col}: "${ref}" }` : `{ ${col}: { ${BY_OPS[op] ?? op}: "${ref}" } }`
    throw new GritqlError('ARGS', `Join shorthand '${k}' is a string grammar; write on: ${example} (or set strict: false)`, { path: [where] })
  }
  if (byKeys.length) {
    on = { ...on }
    for (const k of byKeys) {
      const pairs = Array.isArray(args[k]) ? (args[k] as string[]) : [args[k] as string]
      const op = k === 'by' ? 'eq' : k.slice(3)
      if (!(op in BY_OPS)) throw new GritqlError('ARGS', `Join function does not support '${k}'`, { path: [where] })
      for (const pair of pairs) {
        const [left, right] = String(pair).split(':')
        if (!left || !right) {
          throw new GritqlError('ARGS', "'by' argument inside Join function must include two fields (divided with :)", { path: [where] })
        }
        const col = right.replace(/^@/, '')
        const ref = left.startsWith('@') ? left : `@${left}`
        // `by_gt: "@a:@b"` reads `fetch.a > joined.b`; the predicate is written on the joined column, so it flips.
        // several shorthands on one joined column are ANDed
        const prev = on[col]
        const next = { [BY_OPS[op]]: ref }
        if (prev === undefined) on[col] = op === 'eq' ? ref : next
        else {
          const merged = typeof prev === 'string' ? { eq: prev } : (prev as Record<string, unknown>)
          if (BY_OPS[op] in merged) throw new GritqlError('ARGS', `Join condition on '${col}' repeats operator '${op}'`, { path: [where] })
          on[col] = { ...merged, ...next }
        }
      }
    }
  }
  if (Object.keys(on).length === 0) {
    throw new GritqlError('ARGS', "Join function requires 'by' or 'on' as argument", { path: [where] })
  }
  return { type, table, on }
}

function buildNodes(selections: readonly SelectionNode[], ctx: BuildContext): Node[] {
  const out: Node[] = []
  for (const selection of selections) {
    // graphql.web's unions do not narrow on `kind`
    const sel = selection as any
    if (sel.kind === 'FragmentSpread') {
      const fragment = requireFragment(ctx.doc, sel.name.value)
      out.push(...buildNodes(fragment.definition.selectionSet.selections, ctx))
      continue
    }
    if (sel.kind === 'InlineFragment') {
      out.push(...buildNodes(sel.selectionSet.selections, ctx))
      continue
    }
    const name = sel.name.value
    if (name === 'use') {
      out.push(...useFragment(sel, ctx))
      continue
    }
    if ((JOIN_TYPES as readonly string[]).includes(name) && sel.selectionSet) {
      ctx.fetch.joins.push(toJoin(name as JoinType, argsToObject(sel.arguments, ctx.variables), ctx.path.join('.'), ctx.strict))
      out.push(...buildNodes(sel.selectionSet.selections, ctx))
      continue
    }
    const alias = sel.alias?.value ?? name
    const node: Node = {
      alias,
      name,
      kind: sel.selectionSet ? 'dimension' : 'metric',
      args: argsToObject(sel.arguments, ctx.variables),
      children: [],
      directives: directives(sel.directives, ctx.variables),
      emit: true,
    }
    if (sel.selectionSet) {
      node.children = buildNodes(sel.selectionSet.selections, { ...ctx, path: [...ctx.path, alias] })
    }
    out.push(node)
  }
  return out
}

function requireFragment(doc: ParsedDocument, name: string): Fragment {
  const fragment = doc.fragments[name]
  if (!fragment) throw new GritqlError('PLAN', `${name} fragment is not defined yet`)
  return fragment
}

/** `use(fragment: F, a: pageviews)`: inline F with its variables bound to the given args. */
function useFragment(field: FieldNode, ctx: BuildContext): Node[] {
  const args = argsToObject(field.arguments, ctx.variables)
  const { fragment: name, ...given } = args
  if (typeof name !== 'string') throw new GritqlError('ARGS', 'use requires a `fragment` argument', { path: ctx.path })
  const fragment = requireFragment(ctx.doc, name)
  const overlay: Variables = { ...ctx.variables }
  const validators: Record<string, any> = {}
  for (const def of fragment.variableDefinitions as readonly VariableDefinitionNode[]) {
    const varName = def.variable.name.value
    validators[varName] = typeNodeChecker(def.type, ctx.doc.types)
    if (given[varName] !== undefined) overlay[varName] = given[varName]
    else if (def.defaultValue) overlay[varName] = argsToObject([{ kind: 'Argument', name: def.variable.name, value: def.defaultValue } as any], {})[varName]
  }
  try {
    checkPropTypes(validators, overlay, 'fragment arguments', name)
  } catch (e) {
    throw toGritqlError('ARGS', e, ctx.path)
  }
  return buildNodes(fragment.definition.selectionSet.selections, { ...ctx, variables: overlay })
}

export { PropTypes }
