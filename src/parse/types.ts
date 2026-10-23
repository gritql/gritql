/**
 * Builds argument checkers from type blocks and validates variables against
 * the operation's variable definitions.
 */
import { parse } from '@0no-co/graphql.web'
import type { OperationDefinitionNode, TypeNode } from '@0no-co/graphql.web'
import { GritqlError } from '../errors'
import { Checker, checkPropTypes, PropTypes } from '../types'
import type { TypeDef, TypeRef } from './typeblocks'
import { argsToObject, valueToJs, UNDEFINED, Variables } from './values'

export type TypeRegistry = Record<string, Checker>

export const baseTypes: TypeRegistry = {
  Any: PropTypes.any,
  Number: PropTypes.number,
  String: PropTypes.string,
  Bool: PropTypes.bool,
  Boolean: PropTypes.bool,
  Object: PropTypes.object,
  Array: PropTypes.array,
}

function lookup(types: TypeRegistry, name: string): Checker {
  const t = types[name]
  if (!t) throw new GritqlError('TYPE', `${name} is not declared type`)
  return t
}

function refChecker(ref: TypeRef, types: TypeRegistry): Checker {
  let c = lookup(types, ref.name)
  if (ref.list) {
    if (ref.itemRequired) c = c.isRequired!
    c = PropTypes.arrayOf(c)
  }
  return ref.required ? c.isRequired! : c
}

function directiveArgs(source: string): Record<string, unknown> {
  if (!source.trim()) return {}
  const doc = parse(`{ f(${source}) }`)
  const field = (doc.definitions[0] as OperationDefinitionNode).selectionSet.selections[0]
  return field.kind === 'Field' ? argsToObject(field.arguments, {}) : {}
}

/** Applies `@inherits(name)` by prepending the parent's members. */
function applyInherits(def: TypeDef, defs: Record<string, TypeDef>): TypeDef {
  let out = def
  for (const d of def.directives) {
    if (d.name !== 'inherits') {
      throw new GritqlError('TYPE', `Unsupported type directive @${d.name} on ${def.name}`)
    }
    const name = directiveArgs(d.argsSource).name
    if (typeof name !== 'string') throw new GritqlError('TYPE', 'Inherits directive requires `name` argument')
    const parent = defs[name]
    if (!parent) throw new GritqlError('TYPE', `Type "${name}" is not defined`)
    if (parent.kind !== def.kind) {
      throw new GritqlError('TYPE', `Can't inherits ${def.kind} from ${parent.kind}`)
    }
    out = {
      ...out,
      fields: [...parent.fields, ...out.fields],
      values: [...parent.values, ...out.values],
      types: [...parent.types, ...out.types],
    }
  }
  return out
}

/** Processes type blocks in document order; later definitions override earlier ones. */
export function buildTypes(typeDefs: TypeDef[]): TypeRegistry {
  const types: TypeRegistry = { ...baseTypes }
  const defs: Record<string, TypeDef> = {}
  for (const raw of typeDefs) {
    const def = applyInherits(raw, defs)
    defs[def.name] = def
    switch (def.kind) {
      case 'enum':
        types[def.name] = PropTypes.oneOf(def.values)
        break
      case 'union':
        types[def.name] = PropTypes.oneOfType(def.types.map((t) => lookup(types, t)))
        break
      case 'input':
      case 'type': {
        const shape: Record<string, Checker> = {}
        for (const f of def.fields) shape[f.name] = refChecker(f.type, types)
        types[def.name] = def.kind === 'input' ? PropTypes.shape(shape) : PropTypes.exact(shape)
        break
      }
    }
  }
  return types
}

export function typeNodeChecker(typeNode: TypeNode, types: TypeRegistry): Checker {
  const node = typeNode as any
  if (node.kind === 'NonNullType') return typeNodeChecker(node.type, types).isRequired!
  if (node.kind === 'ListType') return PropTypes.arrayOf(typeNodeChecker(node.type, types))
  return lookup(types, node.name.value)
}

/**
 * Returns the operation's variables with defaults applied, after validating
 * them against the declared types. Variables not declared by the operation
 * pass through untouched.
 */
export function resolveVariables(
  op: OperationDefinitionNode,
  variables: Variables,
  types: TypeRegistry,
): Variables {
  const out: Variables = { ...variables }
  const validators: Record<string, Checker> = {}
  for (const def of op.variableDefinitions ?? []) {
    const name = def.variable.name.value
    validators[name] = typeNodeChecker(def.type, types)
    if (out[name] === undefined && def.defaultValue) {
      const v = valueToJs(def.defaultValue, {})
      if (v !== UNDEFINED) out[name] = v
    }
  }
  checkPropTypes(validators, out, 'query', op.name?.value ?? 'query')
  return out
}
