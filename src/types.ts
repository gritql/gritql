import { DocumentNode, FieldNode, DirectiveNode } from 'graphql'
import { Knex } from 'knex'

export interface QueryBuilder {
  getSteps(): any[]
  toKnex(knex: Knex): Knex.QueryBuilder
  toSQL(knex: Knex): string
  execute(knex: Knex): Promise<any>
  // Intent-based builder methods
  select(...args: any[]): QueryBuilder
  count(...args: any[]): QueryBuilder
  sum(...args: any[]): QueryBuilder
  avg(...args: any[]): QueryBuilder
  min(...args: any[]): QueryBuilder
  max(...args: any[]): QueryBuilder
  distinct(...args: any[]): QueryBuilder
  where(...args: any[]): QueryBuilder
  groupBy(...args: any[]): QueryBuilder
  orderBy(...args: any[]): QueryBuilder
  limit(...args: any[]): QueryBuilder
  offset(...args: any[]): QueryBuilder
  join(...args: any[]): QueryBuilder
  leftJoin(...args: any[]): QueryBuilder
  rightJoin(...args: any[]): QueryBuilder
  innerJoin(...args: any[]): QueryBuilder
  from(...args: any[]): QueryBuilder
  with(...args: any[]): QueryBuilder
  // Intent-specific methods
  name(name: string): QueryBuilder
  remove(id: number | string): QueryBuilder
  startGroup(): QueryBuilder
  endGroup(): QueryBuilder
  clone(): QueryBuilder
  [key: string]: any
}

export interface GritQLContext {
  variables?: Record<string, any>
  knex?: Knex
  provider?: string
  [key: string]: any
}

export interface ParseContext {
  query: QueryBuilder
  variables: Record<string, any>
  fragments: Record<string, any>
  // Query-specific fields
  idx?: number
  name?: string
  table?: string
  filters?: any
  isWith?: boolean
  [key: string]: any
}

export type HookStage =
  | 'beforeParse'
  | 'afterParse'
  | 'beforeBuild'
  | 'afterBuild'
  | 'beforeFinalize'
  | 'beforeExecute'
  | 'afterExecute'
  | 'beforeConvert'
  | 'duringConvert'
  | 'afterConvert'

export interface Hook<T = any> {
  stage: HookStage
  handler: (data: T, context: GritQLContext) => T | Promise<T>
}

export interface MetricParser {
  name: string
  parse: (field: FieldNode, context: ParseContext) => void
}

export interface DimensionParser {
  name: string
  parse: (field: FieldNode, context: ParseContext) => void
}

export interface DirectiveParser {
  name: string
  parse: (
    directive: DirectiveNode,
    field: FieldNode,
    context: ParseContext,
  ) => void
}

export interface Extension {
  name: string
  hooks?: Hook[]
  metricParsers?: MetricParser[]
  dimensionParsers?: DimensionParser[]
  directiveParsers?: DirectiveParser[]
  setup?: (gritql: GritQL) => void
}

export interface GritQLConfig {
  knex?: Knex
  provider?: string
  extensions?: Extension[]
}

export interface GritQLQuery {
  query: string | DocumentNode
  variables?: Record<string, any>
  context?: GritQLContext
}

export interface GritQL {
  use(extension: Extension): GritQL
  query(query: GritQLQuery): Promise<any>
  getMetricParser(name: string): MetricParser | undefined
  getDimensionParser(name: string): DimensionParser | undefined
  getDirectiveParser(name: string): DirectiveParser | undefined
}

// as an input - this is the goal we are moving towards:                   │
// │   --------------------------                                              │
// │   There is graphql library method that can parse graphql query into       │
// │   AST. Then I want to use this AST to convert the query into SQL          │
// │   using intent library and execute the query to database. The             │
// │   results from the query, using the AST i can covert into an object       │
// │   that will repeat structure of gritql query.                             │
// │   the process should be:                                                  │
// │   graphql->AST->Walk AST, build intent query->finalize                    │
// │   query->execute query->get result->walk AST, build converter->
// convert into object.                                                    │
// │   the converter will go through the AST and considers sections as         │
// │   dimensions and leafs as metrics. There are parsers for metrics          │
// │   and parsers for dimensions. And each could also be having               │
// │   directives on this nodes that could futher modify the behavior.         │
// │   the interesting part is that directives might be able to affect         │
// │   on before finalisation of a query, theoretically before                 │
// │   execution, after execution, on converter, and on a row based            │
// │   level during convertion, and at the end on whole result.                │
// │   I want gritql to be extendable, so plugins should be able to plug
// in into any of this points. Also i need to be able to extend with       │
// │   custom metric parsers and dimension parsers.                            │
// │                                                                           │
// │   previous version of a library you can find here:                        │
// │   /Users/edjafarov/work/gritql4/gql-sql-slicer.ts, take it for            │
// │   information just to see where am i going. This is previous              │
// │   version that I want to rebuild from scratch adding way more             │
// │   flexibility and extencibility, and write it as lean as possible.        │
// │   And instead of direct using knex, intent library ./intent.ts will       │
// │   be used.            1. First think through the problem, read the codebase for               │
// │   relevant files, and write a plan to projectplan.md                      │
// │   2. The plan should have a list of todo items that you can check         │
// │   off as you complete them                                                │
// │   3. Before you begin working, check in with me and I will verify         │
// │   the plan                                                                │
// │   4. Then, begin working on the todo items, marking them as               │
// │   complete as you go                                                      │
// │   5. Please every step of the way just give me a high level               │
// │   explanation of what changes you made
// 6. Make every task and code change you do as simple as possible.        │
// │   We want to avoid making any massive or complex changes. Every           │
// │   change should impact as little code as possible. Everything is          │
// │   about simplicity                                                        │
// │   7. Finally, add a review section to the projectplan.md file with        │
// │   a summary of the changes you made and any other relevant                │
// │   information                                                             │
// │   --------------------------                                              │
// │   check currently implemented parts, and verify they are aligned          │
// │   with the goal.check  projectplan.md for already implemented
// steps. and pick it up from where it was left off.                       │
// │                                                                           │
// │   first think ultrahard if there should be things improved in             │
// │   projectplan. for next version prototype i am building check             │
// │   /Users/edjafarov/work/gritql4/src/__tests__/core/builder.test.ts        │
// │   /Users/edjafarov/work/gritql4/src/__tests__/core/registry.test.ts       │
// │   /Users/edjafarov/work/gritql4/src/__tests__/integration                 │
// │   /Users/edjafarov/work/gritql4/src/__tests__/integration/graphql-to      │
// │   -sql.test.ts                                                            │
// │   /Users/edjafarov/work/gritql4/src/__tests__/integration/multiple-dimensions.test.ts                                                       │
// │   /Users/edjafarov/work/gritql4/src/__tests__/integration/nested-dim      │
// │   ensions.test.ts                                                         │
// │   /Users/edjafarov/work/gritql4/src/__tests__/integration/sql-transf      │
// │   ormation.test.ts                                                        │
// │   /Users/edjafarov/work/gritql4/src/__tests__/intent                      │
// │   /Users/edjafarov/work/gritql4/src/__tests__/intent/sql-generation-      │
// │   only.test.ts                                                            │
// │   /Users/edjafarov/work/gritql4/src/__tests__/parsers                     │
// │   /Users/edjafarov/work/gritql4/src/__tests__/parsers/dimension.test.ts                                                                     │
// │   /Users/edjafarov/work/gritql4/src/__tests__/parsers/metric.test.ts      │
// │   /Users/edjafarov/work/gritql4/src/.claude                               │
// │   /Users/edjafarov/work/gritql4/src/core                                  │
// │   /Users/edjafarov/work/gritql4/src/core/converter.ts                     │
// │   /Users/edjafarov/work/gritql4/src/core/executor.ts                      │
// │   /Users/edjafarov/work/gritql4/src/core/walker.ts                        │
// │   /Users/edjafarov/work/gritql4/src/examples                              │
// │   /Users/edjafarov/work/gritql4/src/examples/basic-extension.ts           │
// │   /Users/edjafarov/work/gritql4/src/filters
// /Users/edjafarov/work/gritql4/src/filters/.claude                       │
// │   /Users/edjafarov/work/gritql4/src/filters/builder.ts                    │
// │   /Users/edjafarov/work/gritql4/src/filters/combinators.ts                │
// │   /Users/edjafarov/work/gritql4/src/filters/entry.ts                      │
// │   /Users/edjafarov/work/gritql4/src/filters/example.ts                    │
// │   /Users/edjafarov/work/gritql4/src/filters/index.ts                      │
// │   /Users/edjafarov/work/gritql4/src/filters/operators.ts                  │
// │   /Users/edjafarov/work/gritql4/src/filters/search.ts                     │
// │   /Users/edjafarov/work/gritql4/src/filters/types.ts                      │
// │   /Users/edjafarov/work/gritql4/src/node_modules
// /Users/edjafarov/work/gritql4/src/parsers                               │
// │   /Users/edjafarov/work/gritql4/src/parsers/dimension.ts                  │
// │   /Users/edjafarov/work/gritql4/src/parsers/directive.ts                  │
// │   /Users/edjafarov/work/gritql4/src/parsers/metric.ts                     │
// │   /Users/edjafarov/work/gritql4/src/plugins                               │
// │   /Users/edjafarov/work/gritql4/src/plugins/registry.ts                   │
// │   /Users/edjafarov/work/gritql4/src/types                                 │
// │   /Users/edjafarov/work/gritql4/src/types/jest.d.ts                       │
// │   /Users/edjafarov/work/gritql4/src/utils                                 │
// │   /Users/edjafarov/work/gritql4/src/.eslintrc.js
// /Users/edjafarov/work/gritql4/src/.gitignore                            │
// │   /Users/edjafarov/work/gritql4/src/index.ts                              │
// │   /Users/edjafarov/work/gritql4/src/intent.ts                             │
// │   /Users/edjafarov/work/gritql4/src/jest.config.js                        │
// │   /Users/edjafarov/work/gritql4/src/manual_test.ts                        │
// │   /Users/edjafarov/work/gritql4/src/package.json                          │
// │   /Users/edjafarov/work/gritql4/src/projectplan.md                        │
// │   /Users/edjafarov/work/gritql4/src/test-setup.ts                         │
// │   /Users/edjafarov/work/gritql4/src/tsconfig.json                         │
// │   /Users/edjafarov/work/gritql4/src/types.ts
// check current implementation and give me recommendations on how to proceed in recommendataions.md file
