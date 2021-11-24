import { DocumentNode, DirectiveNode } from 'graphql'
import { argumentsToObject } from '../arguments'
import { iterateProgressive } from '../progressive'

export interface PreExecutedContext {
  tree: DirectiveNode
  // tree of caller
  caller: DocumentNode
}

export interface PostExecutedContext {
 tree: DirectiveNode
 // tree of caller
 caller: DocumentNode
 // resolved path
 path: string
 query: any
 data: { [key: string]: any }
}

export const preExecutedDirectives = {
  // include: (context: PreExecutedContext) => {},
  // skip: (context: PreExecutedContext) => {},
}

export const postExecutedDirectives = {
  // Arguments
  // to: query name
  // pick: (context: PostExecutedContext) => {
  //  
  // },

  // omit: (context: PostExecutedContext) => {},

  // Argumnets
  // to: query name
  // diff: (context: PostExecutedContext) => {}

  // Divide value by max value
  // Arguments
  // to: query name
  indexed: (context: PostExecutedContext) => {
    if (!context.tree.arguments) {
      throw "Indexed directive requires arguments"
    }

    const args = argumentsToObject(context.tree.arguments)

    if (!args.to) {
      throw "Indexed directive requires 'to' argument"
    }

    const transformer = ({ value, originFullObject }) => {
      function calculateMax(val: number) {
        context.data.max = Math.max(val, context.data.max || 0)
      }

      if (context.data.max == null && originFullObject) {
        iterateProgressive(originFullObject[context.query.name], context.path, calculateMax)
        iterateProgressive(originFullObject[args.to], context.path, calculateMax)
      }

      if (context.data.max != null) {
        return { value: value / context.data.max }
      } else {
        return { value }
      }
    }

    transformer.context = context;

    return transformer
  },

  // Arguments
  // [metricName: name]: any
  // [[`${metricName}_gt`]]: any
  // [[`${metricName}_gte`]]: any
  // [[`${metricName}_lt`]]: any
  // [[`${metricName}_lte`]]: any
  // [[`${metricName}_in`]]: any
  // filter: (context: PostExecutedContext) => {
  //
  // }
}

export function parseDirective(tree: DocumentNode, query, path?: string) {
  if (!query.directives) query.directives = []

  if (tree.directives) {
    tree.directives.forEach(directive => {
      if (postExecutedDirectives[directive.name.value]) {
        query.directives.push(postExecutedDirectives[directive.name.value]({
          tree: directive,
          caller: tree,
          path: path || query.path,
          query,
          data: {}
        }))
      }
      
      if (preExecutedDirectives[directive.name.value]) {
        // TODO: support of pre executed directives
      }
    })
  }

  return tree;
}
