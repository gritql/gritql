import { DocumentNode, DirectiveNode } from 'graphql'
import { argumentsToObject } from '../arguments'
import { progressiveGet, progressiveSet } from '../progressive'

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
  include: (context: PreExecutedContext) => {},
  skip: (context: PreExecutedContext) => {}
}

export const postExecutedDirectives = {
  // to: name
  // by: name
  // pick: (context: PostExecutedContext) => {
  //  
  // },

  // to: name
  indexed: (context: PostExecutedContext) => {
    if (context.tree.arguments) {
      throw "Indexed directive requires arguments"
    }

    const args = argumentsToObject(context.tree.arguments)

    if (!args.to) {
      throw "Indexed directive requires 'to' argument"
    }

    return ({ value, result, replacedPath, fullObject }) => {
      if (context.data.max == null) {
        const firstList = progressiveGet(fullObject[context.query.filters.by], context.path)
        const secondList = progressiveGet(fullObject[args.to], context.path)

        let finalList: number[]

        if (Array.isArray(firstList)) {
          finalList = firstList.concat(secondList)
        } else {
          finalList = [firstList, secondList]
        }

        context.data.max = finalList.reduce((res, el) => {
          return Math.max(res, el)
        })
      }

      return progressiveSet(result, replacedPath, value / context.data.max, false)
    }
  },

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
      } else if (preExecutedDirectives[directive.name.value]) {
        // TODO: support of pre executed directives
      }
    })
  }

  return tree;
}
