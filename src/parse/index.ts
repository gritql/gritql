import { parse as parseGraphql } from '@0no-co/graphql.web'
import type {
  FragmentDefinitionNode,
  OperationDefinitionNode,
  VariableDefinitionNode,
} from '@0no-co/graphql.web'
import { GritqlError } from '../errors'
import { splitTypeBlocks, TypeDef } from './typeblocks'
import { buildTypes, TypeRegistry } from './types'

export interface Fragment {
  definition: FragmentDefinitionNode
  variableDefinitions: readonly VariableDefinitionNode[]
}

export interface ParsedDocument {
  operations: OperationDefinitionNode[]
  fragments: Record<string, Fragment>
  types: TypeRegistry
  typeDefs: TypeDef[]
}

function graphql(text: string) {
  try {
    return parseGraphql(text)
  } catch (e) {
    throw new GritqlError('PARSE', e instanceof Error ? e.message : String(e), { cause: e })
  }
}

function fragmentVariableDefinitions(source: string): readonly VariableDefinitionNode[] {
  const doc = graphql(`query __fragment(${source}) { __x }`)
  return (doc.definitions[0] as OperationDefinitionNode).variableDefinitions ?? []
}

export function parseDocument(text: string): ParsedDocument {
  const { executable, types: typeDefs, fragmentVariables } = splitTypeBlocks(text)
  const doc = graphql(executable)
  const operations: OperationDefinitionNode[] = []
  const fragments: Record<string, Fragment> = {}
  for (const def of doc.definitions) {
    if (def.kind === 'OperationDefinition') operations.push(def)
    else if (def.kind === 'FragmentDefinition') {
      const name = def.name.value
      fragments[name] = {
        definition: def,
        variableDefinitions: fragmentVariables[name] ? fragmentVariableDefinitions(fragmentVariables[name]) : [],
      }
    }
  }
  if (operations.length === 0) throw new GritqlError('PARSE', 'Document has no operation')
  return { operations, fragments, types: buildTypes(typeDefs), typeDefs }
}

export { argsToObject, valueToJs, UNDEFINED } from './values'
export type { Variables } from './values'
export { resolveVariables, buildTypes, baseTypes } from './types'
export type { TypeRegistry } from './types'
export type { TypeDef, TypeRef } from './typeblocks'
