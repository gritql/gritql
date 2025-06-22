import { Knex } from 'knex';
import { QueryBuilder, GritQLContext, Hook, HookStage } from '../types';

export class QueryExecutor {
  private hooks: Map<HookStage, Hook[]> = new Map();

  constructor(hooks: Hook[] = []) {
    hooks.forEach(hook => this.addHook(hook));
  }

  addHook(hook: Hook): void {
    const stageHooks = this.hooks.get(hook.stage) || [];
    stageHooks.push(hook);
    this.hooks.set(hook.stage, stageHooks);
  }

  async execute(
    queryBuilder: QueryBuilder,
    context: GritQLContext
  ): Promise<any> {
    try {
      // Execute beforeExecute hooks
      await this.executeHooks('beforeExecute', queryBuilder, context);

      if (!context.knex) {
        throw new Error('Knex instance is required in context for query execution');
      }

      // Build and execute the query
      const knexQuery = queryBuilder.toKnex(context.knex);
      
      // Log query for debugging if needed
      if (process.env.NODE_ENV === 'development') {
        console.log('Executing SQL:', knexQuery.toString());
      }

      const result = await knexQuery;

      // Execute afterExecute hooks
      await this.executeHooks('afterExecute', result, context);

      return result;
    } catch (error) {
      // Handle execution errors
      const enhancedError = this.enhanceError(error, queryBuilder, context);
      throw enhancedError;
    }
  }

  async executeWithTransaction(
    queryBuilder: QueryBuilder,
    context: GritQLContext,
    transactionCallback?: (trx: Knex.Transaction) => Promise<void>
  ): Promise<any> {
    if (!context.knex) {
      throw new Error('Knex instance is required in context for transaction execution');
    }

    return context.knex.transaction(async (trx) => {
      const transactionContext = {
        ...context,
        knex: trx
      };

      // Execute custom transaction logic if provided
      if (transactionCallback) {
        await transactionCallback(trx);
      }

      return this.execute(queryBuilder, transactionContext);
    });
  }

  async executeBatch(
    queries: Array<{ builder: QueryBuilder; context: GritQLContext }>,
    options: { concurrent?: boolean; stopOnError?: boolean } = {}
  ): Promise<any[]> {
    const { concurrent = false, stopOnError = true } = options;

    if (concurrent) {
      // Execute all queries concurrently
      try {
        return await Promise.all(
          queries.map(({ builder, context }) => this.execute(builder, context))
        );
      } catch (error) {
        if (stopOnError) {
          throw error;
        }
        // Handle partial failures - continue with individual execution
        const results = await Promise.allSettled(
          queries.map(({ builder, context }) => this.execute(builder, context))
        );
        return results.map(result => 
          result.status === 'fulfilled' ? result.value : null
        );
      }
    } else {
      // Execute queries sequentially
      const results: any[] = [];
      for (const { builder, context } of queries) {
        try {
          const result = await this.execute(builder, context);
          results.push(result);
        } catch (error) {
          if (stopOnError) {
            throw error;
          }
          results.push(null);
        }
      }
      return results;
    }
  }

  async explainQuery(
    queryBuilder: QueryBuilder,
    context: GritQLContext
  ): Promise<any> {
    if (!context.knex) {
      throw new Error('Knex instance is required in context for query explanation');
    }

    const knexQuery = queryBuilder.toKnex(context.knex);
    
    // Different databases have different EXPLAIN syntax
    const provider = context.provider || 'postgresql';
    
    switch (provider) {
      case 'postgresql':
      case 'pg':
        return context.knex.raw(`EXPLAIN ANALYZE ${knexQuery.toString()}`);
      
      case 'mysql':
      case 'mysql2':
        return context.knex.raw(`EXPLAIN ${knexQuery.toString()}`);
      
      case 'sqlite3':
        return context.knex.raw(`EXPLAIN QUERY PLAN ${knexQuery.toString()}`);
      
      default:
        // Fallback to basic EXPLAIN
        return context.knex.raw(`EXPLAIN ${knexQuery.toString()}`);
    }
  }

  async validateQuery(
    queryBuilder: QueryBuilder,
    context: GritQLContext
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      if (!context.knex) {
        return { valid: false, error: 'Knex instance is required' };
      }

      // Try to build the query and get its SQL
      const sql = queryBuilder.toSQL(context.knex);
      
      // Basic validation - check if SQL is not empty
      if (!sql || sql.trim().length === 0) {
        return { valid: false, error: 'Generated SQL is empty' };
      }

      // Try to prepare the query (doesn't execute, just validates syntax)
      await context.knex.raw(`PREPARE stmt AS ${sql}`).catch(() => {
        // Some databases don't support PREPARE, ignore this error
      });

      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Unknown validation error' 
      };
    }
  }

  private async executeHooks(
    stage: HookStage,
    data: any,
    context: GritQLContext
  ): Promise<any> {
    const stageHooks = this.hooks.get(stage) || [];
    
    let processedData = data;
    for (const hook of stageHooks) {
      try {
        processedData = await hook.handler(processedData, context);
      } catch (error) {
        console.error(`Hook execution failed for stage ${stage}:`, error);
        // Continue with other hooks unless it's a critical stage
        if (stage === 'beforeExecute') {
          throw error;
        }
      }
    }
    
    return processedData;
  }

  private enhanceError(
    error: any,
    queryBuilder: QueryBuilder,
    context: GritQLContext
  ): Error {
    const enhancedError = new Error(
      `Query execution failed: ${error.message}`
    );

    // Add additional context to the error
    const errorContext = {
      originalError: error,
      querySteps: queryBuilder.getSteps(),
      sql: context.knex ? queryBuilder.toSQL(context.knex) : null,
      provider: context.provider,
      variables: context.variables
    };

    // Attach context to error object
    Object.assign(enhancedError, { context: errorContext });

    return enhancedError;
  }

  getRegisteredHooks(): Record<HookStage, number> {
    const hookCounts: Partial<Record<HookStage, number>> = {};
    
    for (const [stage, hooks] of this.hooks) {
      hookCounts[stage] = hooks.length;
    }
    
    return hookCounts as Record<HookStage, number>;
  }

  clearHooks(stage?: HookStage): void {
    if (stage) {
      this.hooks.delete(stage);
    } else {
      this.hooks.clear();
    }
  }
}