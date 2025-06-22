import { DocumentNode, FieldNode, DirectiveNode } from 'graphql';
import { Knex } from 'knex';

export interface QueryBuilder {
  getSteps(): any[];
  toKnex(knex: Knex): Knex.QueryBuilder;
  toSQL(knex: Knex): string;
  execute(knex: Knex): Promise<any>;
  // Intent-based builder methods
  select(...args: any[]): QueryBuilder;
  count(...args: any[]): QueryBuilder;
  sum(...args: any[]): QueryBuilder;
  avg(...args: any[]): QueryBuilder;
  min(...args: any[]): QueryBuilder;
  max(...args: any[]): QueryBuilder;
  distinct(...args: any[]): QueryBuilder;
  where(...args: any[]): QueryBuilder;
  groupBy(...args: any[]): QueryBuilder;
  orderBy(...args: any[]): QueryBuilder;
  limit(...args: any[]): QueryBuilder;
  offset(...args: any[]): QueryBuilder;
  join(...args: any[]): QueryBuilder;
  leftJoin(...args: any[]): QueryBuilder;
  rightJoin(...args: any[]): QueryBuilder;
  innerJoin(...args: any[]): QueryBuilder;
  from(...args: any[]): QueryBuilder;
  // Intent-specific methods
  name(name: string): QueryBuilder;
  remove(id: number | string): QueryBuilder;
  startGroup(): QueryBuilder;
  endGroup(): QueryBuilder;
  [key: string]: any;
}

export interface GritQLContext {
  variables?: Record<string, any>;
  knex?: Knex;
  provider?: string;
  [key: string]: any;
}

export interface ParseContext {
  query: QueryBuilder;
  variables: Record<string, any>;
  fragments: Record<string, any>;
  path: string[];
  [key: string]: any;
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
  | 'afterConvert';

export interface Hook<T = any> {
  stage: HookStage;
  handler: (data: T, context: GritQLContext) => T | Promise<T>;
}

export interface MetricParser {
  name: string;
  parse: (field: FieldNode, context: ParseContext) => void;
}

export interface DimensionParser {
  name: string;
  parse: (field: FieldNode, context: ParseContext) => void;
}

export interface DirectiveParser {
  name: string;
  parse: (directive: DirectiveNode, field: FieldNode, context: ParseContext) => void;
}

export interface Extension {
  name: string;
  hooks?: Hook[];
  metricParsers?: MetricParser[];
  dimensionParsers?: DimensionParser[];
  directiveParsers?: DirectiveParser[];
  setup?: (gritql: GritQL) => void;
}

export interface GritQLConfig {
  knex?: Knex;
  provider?: string;
  extensions?: Extension[];
}

export interface GritQLQuery {
  query: string | DocumentNode;
  variables?: Record<string, any>;
  context?: GritQLContext;
}

export interface GritQL {
  use(extension: Extension): GritQL;
  query(query: GritQLQuery): Promise<any>;
  getMetricParser(name: string): MetricParser | undefined;
  getDimensionParser(name: string): DimensionParser | undefined;
  getDirectiveParser(name: string): DirectiveParser | undefined;
}