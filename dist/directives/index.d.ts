import { DocumentNode, DirectiveNode } from 'graphql'
export interface PreExecutedContext {
  tree: DirectiveNode
  caller: DocumentNode
}
export interface PostExecutedContext {
  tree: DirectiveNode
  caller: DocumentNode
  path: string
  query: any
  data: {
    [key: string]: any
  }
  type: string
  on: 'dimension' | 'metric'
  name: string
}
export declare const preExecutedDirectives: {
  include: (context: PreExecutedContext) => any
  skip: (context: PreExecutedContext) => any
  compare: (context: PreExecutedContext) => DocumentNode
}
export declare const postExecutedDirectives: {
  omit: (context: PostExecutedContext) => {
    ({ originFullObject }: { originFullObject: any }): {
      skip: boolean
    }
    context: PostExecutedContext
  }
  diff: (context: PostExecutedContext) => {
    ({
      replacedPath,
      originFullObject,
      value,
      batches,
    }: {
      replacedPath: any
      originFullObject: any
      value: any
      batches: any
    }): {
      value: any
    }
    context: PostExecutedContext
  }
  subtract: (context: PostExecutedContext) => {
    ({
      replacedPath,
      originFullObject,
      value,
      batches,
    }: {
      replacedPath: any
      originFullObject: any
      value: any
      batches: any
    }): {
      value: any
    }
    context: PostExecutedContext
  }
  indexed: (context: PostExecutedContext) => {
    ({
      value,
      originFullObject,
      batches,
    }: {
      value: any
      originFullObject: any
      batches: any
    }): {
      value: any
    }
    context: PostExecutedContext
  }
  filter: (context: PostExecutedContext) => {
    ({
      value,
      globalReplacedPath,
      originFullObject,
      row,
      batches,
      q,
    }: {
      value: any
      globalReplacedPath: any
      originFullObject: any
      row: any
      batches: any
      q: any
    }):
      | {
          skip: any
          skipAll?: undefined
        }
      | {
          skip: boolean
          skipAll: boolean
        }
      | {
          skip?: undefined
          skipAll?: undefined
        }
    context: PostExecutedContext
  }
  groupOn: (context: PostExecutedContext) => {
    ({
      row,
      path,
      data,
      value,
      key,
      globalReplacedPath,
      originFullObject,
      batches,
      result,
      q,
    }: {
      row: any
      path: any
      data: any
      value: any
      key: any
      globalReplacedPath: any
      originFullObject: any
      batches: any
      result: any
      q: any
    }):
      | {
          replacers?: undefined
          path?: undefined
          value?: undefined
          skip?: undefined
        }
      | {
          replacers: any
          path: any
          value: any
          skip: boolean
        }
    context: PostExecutedContext
  }
  groupBy: (context: PostExecutedContext) => {
    ({
      row,
      path,
      data,
      value,
      key,
      globalReplacedPath,
      originFullObject,
      batches,
      result,
      q,
    }: {
      row: any
      path: any
      data: any
      value: any
      key: any
      globalReplacedPath: any
      originFullObject: any
      batches: any
      result: any
      q: any
    }):
      | {
          replacers?: undefined
          path?: undefined
          value?: undefined
          skip?: undefined
        }
      | {
          replacers: any
          path: any
          value: any
          skip: boolean
        }
    context: PostExecutedContext
  }
  divide: (context: PostExecutedContext) => {
    ({
      replacedPath,
      originFullObject,
      value,
      key,
      batches,
    }: {
      replacedPath: any
      originFullObject: any
      value: any
      key: any
      batches: any
    }): {
      value: any
    }
    context: PostExecutedContext
  }
}
export declare function parseDirective(
  tree: DocumentNode,
  query: any,
  on: string,
  path?: string,
): any
