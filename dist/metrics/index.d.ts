import { Knex } from 'knex'
import { InferProps } from 'prop-types'
import { DocumentNode } from 'graphql'

export declare const partitionByTypes: {
  by: any
}
export declare function partitionBy(
  args: InferProps<typeof partitionByTypes>,
  query: any,
  knex: Knex,
): '' | Knex.Raw<any>
export declare function getOverClosure(
  args: InferProps<typeof partitionByTypes>,
  query: any,
  knex: Knex,
  options?: {
    orderBy?: {
      by: string
      dir?: 'ASC' | 'DESC'
    }
    cast?: String
  },
): Knex.Raw<any> | 'OVER()'
export declare const metricResolvers: {
  percentile: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  median: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  sum: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  min: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  max: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  count: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  countDistinct: (
    tree: DocumentNode,
    query: any,
    knex: Knex<any, any[]>,
  ) => void
  join: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => any
  leftJoin: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => any
  rightJoin: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => any
  fullJoin: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => any
  innerJoin: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => any
  leftOuterJoin: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => any
  rightOuterJoin: (
    tree: DocumentNode,
    query: any,
    knex: Knex<any, any[]>,
  ) => any
  fullOuterJoin: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => any
  ranking: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  searchRanking: (
    tree: DocumentNode,
    query: any,
    knex: Knex<any, any[]>,
  ) => void
  searchHeadline: (
    tree: DocumentNode,
    query: any,
    knex: Knex<any, any[]>,
  ) => void
  unique: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  from: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  avg: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  avgPerDimension: (
    tree: DocumentNode,
    query: any,
    knex: Knex<any, any[]>,
  ) => void
  share: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  indexed: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  divide: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  aggrAverage: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  weightAvg: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  distinct: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
  default: (tree: DocumentNode, query: any, knex: Knex<any, any[]>) => void
}
