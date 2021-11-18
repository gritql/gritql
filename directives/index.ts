import { DocumentNode, DirectiveNode } from 'graphql'

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
}

export const preExecutedDirectives = {
  include: (context: PreExecutedContext) => {},
  skip: (context: PreExecutedContext) => {}
}

export const postExecutedDirectives = {
  // to: name
  // by: name
  pick: (context: PostExecutedContext) => {
    
  },

  // to: name
  indexed: (context: PostExecutedContext) => {

  },

  // [metricName: name]: any
  // [[`${metricName}_gt`]]: any
  // [[`${metricName}_gte`]]: any
  // [[`${metricName}_lt`]]: any
  // [[`${metricName}_lte`]]: any
  // [[`${metricName}_in`]]: any
  filter: (context: PostExecutedContext) => {

  }
}
