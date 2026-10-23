/**
 * AST value nodes → plain JS, with `$variables` substituted.
 * An undefined variable makes the whole argument / list item / object field
 * disappear, which is how `limit: $limit` turns into "no limit".
 */
import type { ArgumentNode, ValueNode } from '@0no-co/graphql.web'

export type Variables = Record<string, unknown>

export const UNDEFINED = Symbol('undefined variable')

export function valueToJs(value: ValueNode, variables: Variables): unknown {
  // graphql.web's unions do not narrow on `kind`, hence the loose view
  const node = value as any
  switch (node.kind as string) {
    case 'IntValue':
      return parseInt(node.value, 10)
    case 'FloatValue':
      return parseFloat(node.value)
    case 'StringValue':
    case 'EnumValue':
      return node.value
    case 'BooleanValue':
      return node.value
    case 'NullValue':
      return null
    case 'Variable': {
      const v = variables[node.name.value]
      return v === undefined ? UNDEFINED : v
    }
    case 'ListValue': {
      const out: unknown[] = []
      for (const item of node.values as ValueNode[]) {
        const v = valueToJs(item, variables)
        if (v !== UNDEFINED) out.push(v)
      }
      return out
    }
    case 'ObjectValue': {
      const out: Record<string, unknown> = {}
      for (const f of node.fields as { name: { value: string }; value: ValueNode }[]) {
        const v = valueToJs(f.value, variables)
        if (v !== UNDEFINED) out[f.name.value] = v
      }
      return out
    }
  }
}

/**
 * Arguments → object. Repeated argument names collect into an array
 * (`unionall(table: a, table: b)`); undefined variables drop the argument.
 */
export function argsToObject(
  args: readonly ArgumentNode[] | undefined,
  variables: Variables,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!args) return out
  const seen = new Set<string>()
  for (const a of args) {
    const v = valueToJs(a.value, variables)
    if (v === UNDEFINED) continue
    const k = a.name.value
    if (seen.has(k)) {
      const prev = out[k]
      out[k] = Array.isArray(prev) && (prev as any).__repeated ? [...prev, v] : repeated([prev, v])
    } else {
      seen.add(k)
      out[k] = v
    }
  }
  return out
}

function repeated(items: unknown[]): unknown[] {
  Object.defineProperty(items, '__repeated', { value: true, enumerable: false })
  return items
}
