import { parse, DocumentNode } from 'graphql'
import { Knex } from 'knex'
import { query as createQueryBuilder } from './intent'
import { ExtensionRegistry } from './plugins/registry'
import { ASTWalker } from './core/walker'
import { QueryExecutor } from './core/executor'
import { ResultConverter } from './core/converter'
import { basicMetricParsers } from './parsers/metric'
import { basicDimensionParsers } from './parsers/dimension'
import { basicDirectiveParsers } from './parsers/directive'
import {
  GritQL,
  GritQLConfig,
  GritQLQuery,
  Extension,
  MetricParser,
  DimensionParser,
  DirectiveParser,
  GritQLContext,
  ParseContext,
} from './types'

export * from './types'
export { logger, LogLevel, LogModules } from './utils/logger'

export class GritQLInstance implements GritQL {
  private registry: ExtensionRegistry
  private knex?: Knex
  private provider: string

  constructor(config: GritQLConfig = {}) {
    this.registry = new ExtensionRegistry()
    this.knex = config.knex
    this.provider = config.provider || 'postgres'

    // Register initial extensions
    if (config.extensions) {
      for (const extension of config.extensions) {
        this.use(extension)
      }
    }
  }

  use(extension: Extension): GritQL {
    this.registry.register(extension)

    // Call setup if provided
    if (extension.setup) {
      extension.setup(this)
    }

    return this
  }

  async query({
    query: gqlQuery,
    variables = {},
    context = {},
  }: GritQLQuery): Promise<any> {
    // Merge context with instance config
    const queryContext: GritQLContext = {
      ...context,
      knex: context.knex || this.knex,
      provider: context.provider || this.provider,
      variables,
    }

    // Parse GraphQL query
    let ast: DocumentNode
    if (typeof gqlQuery === 'string') {
      // Run beforeParse hooks
      const modifiedQuery = await this.registry.runHooks(
        'beforeParse',
        gqlQuery,
        queryContext,
      )
      ast = parse(modifiedQuery)
    } else {
      ast = gqlQuery
    }

    // Run afterParse hooks
    ast = await this.registry.runHooks('afterParse', ast, queryContext)

    // Run beforeBuild hooks
    ast = await this.registry.runHooks('beforeBuild', ast, queryContext)

    // 1. Create ParseContext with query builder
    const parseContext: ParseContext = {
      query: createQueryBuilder(),
      variables,
      fragments: {},
      path: []
    }

    // 2. Create AST walker with all registered parsers
    const metricParsers = [...basicMetricParsers, ...this.registry.getMetricParsers()]
    const dimensionParsers = [...basicDimensionParsers, ...this.registry.getDimensionParsers()]
    const directiveParsers = [...basicDirectiveParsers, ...this.registry.getDirectiveParsers()]
    
    const walker = new ASTWalker(metricParsers, dimensionParsers, directiveParsers)
    
    // 3. Walk AST to build query
    const walkResult = walker.walk(ast, parseContext)
    
    // 4. Execute queries
    const executorHooks = [
      ...this.registry.getHooks('beforeExecute'),
      ...this.registry.getHooks('afterExecute')
    ]
    const executor = new QueryExecutor(executorHooks)
    
    // Execute all queries (could be multiple due to dimension splitting)
    const sqlResults = await executor.executeBatch(
      walkResult.queries.map(ctx => ({
        builder: ctx.query,
        context: queryContext
      })),
      { concurrent: true }
    )
    
    // 5. Convert and merge results
    const converterHooks = [
      ...this.registry.getHooks('beforeConvert'),
      ...this.registry.getHooks('duringConvert'),
      ...this.registry.getHooks('afterConvert')
    ]
    const converter = new ResultConverter(converterHooks)
    
    // For now, return the first result. Later we'll need to implement proper result merging
    // based on the GraphQL structure
    const result = await converter.convert(sqlResults[0], queryContext, { format: 'graphql' })
    
    return result
  }

  getMetricParser(name: string): MetricParser | undefined {
    return this.registry.getMetricParser(name)
  }

  getDimensionParser(name: string): DimensionParser | undefined {
    return this.registry.getDimensionParser(name)
  }

  getDirectiveParser(name: string): DirectiveParser | undefined {
    return this.registry.getDirectiveParser(name)
  }
}

export function createGritQL(config?: GritQLConfig): GritQL {
  return new GritQLInstance(config)
}
