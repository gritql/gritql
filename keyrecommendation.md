# Key Architectural Recommendation: Deferred Query Materialization with Multi-Stage Intent Support

## 🎯 Core Problem Analysis

After analyzing `gql-sql-slicer.ts` and `/metrics/`, I can see the fundamental issues:

1. **Your current architecture builds SQL eagerly during parsing, but directives and transformations need to modify the query structure after parsing is complete**
2. **Complex metrics like `aggrAverage` require preaggregation tables (subqueries) that need to be planned before final SQL generation**
3. **Multi-stage operations (ranking, percentiles, window functions) need coordinated execution**

### Current Flow (Problematic):
```
GraphQL AST → [Parse + Build SQL] → Apply Directives on Results → Merge
                    ↑ Too Early!        ↑ Can't modify subqueries!
```

### Required Flow (Solution):
```
GraphQL AST → Query Intent → [Plan Stages] → [Transform Intent] → Build Multi-Stage SQL → Execute → Merge
                              ↑ Plan preaggregation    ↑ Perfect Timing!
```

## 🏗️ **Key Recommendation: Query Intent Object Pattern**

### 1. **Create a Multi-Stage Query Intent Object (MSQIO)**
Replace immediate SQL building with a declarative intent representation that supports multi-stage execution:

```typescript
interface QueryIntent {
  // Core Query Structure
  operation: 'fetch' | 'with' | 'join'
  table?: string
  alias?: string
  
  // Data Selection
  metrics: Map<string, MetricIntent>
  dimensions: Map<string, DimensionIntent>
  
  // Query Modifications
  filters: FilterIntent[]
  joins: JoinIntent[]
  sorting: SortIntent[]
  pagination: PaginationIntent
  
  // Multi-Stage Execution Plan
  stages: QueryStage[]           // NEW: Ordered execution stages
  dependencies: StageDependency[] // NEW: Inter-stage dependencies
  
  // Transformations to Apply
  directives: DirectiveIntent[]
  processors: ProcessorIntent[]
  
  // Metadata
  provider: string
  context: QueryContext
  queryDependencies: string[] // for query merging
}

interface QueryStage {
  id: string
  type: 'preaggregation' | 'main' | 'post_window' | 'ranking'
  intent: StageIntent
  dependsOn: string[] // Other stage IDs
  materializeAs: 'subquery' | 'cte' | 'temp_table' | 'main_query'
}

interface MetricIntent {
  type: 'simple' | 'window' | 'aggregate' | 'multi_stage'
  expression?: string
  
  // For multi-stage metrics like aggrAverage
  stages?: {
    preaggregation?: {
      groupBy: string[]
      aggregates: Map<string, string>
    }
    final?: {
      expression: string
      windowFunction?: WindowFunctionIntent
    }
  }
  
  // For window functions like ranking
  windowFunction?: WindowFunctionIntent
  
  args: Record<string, any>
  alias: string
}

interface WindowFunctionIntent {
  function: 'RANK' | 'DENSE_RANK' | 'ROW_NUMBER' | 'PERCENTILE_CONT' | 'MIN' | 'MAX'
  partitionBy?: string[]
  orderBy?: { field: string; direction: 'ASC' | 'DESC' }[]
  frame?: WindowFrameIntent
}
```

### 2. **Implement Transformation Pipeline**
Create immutable transformations that modify intent:

```typescript
class QueryIntentTransformer {
  transform(intent: QueryIntent, transformation: Transformation): QueryIntent {
    // Return new intent object with transformation applied
    return {
      ...intent,
      // Apply transformation logic
    }
  }
}
```

### 3. **Multi-Stage Query Planner & Materializer**
Analyze metrics to create execution plan, then materialize:

```typescript
class QueryPlanner {
  plan(intent: QueryIntent): QueryIntent {
    const stages: QueryStage[] = []
    
    // Analyze metrics to determine required stages
    for (const [alias, metric] of intent.metrics) {
      if (metric.type === 'multi_stage') {
        // Create preaggregation stage for aggrAverage, etc.
        stages.push({
          id: `preag_${alias}`,
          type: 'preaggregation',
          intent: this.createPreaggregationStage(metric),
          dependsOn: [],
          materializeAs: 'cte'
        })
      }
      
      if (metric.windowFunction) {
        // Window functions need their own stage
        stages.push({
          id: `window_${alias}`,
          type: 'post_window',
          intent: this.createWindowStage(metric),
          dependsOn: stages.map(s => s.id),
          materializeAs: 'subquery'
        })
      }
    }
    
    // Create main query stage
    stages.push({
      id: 'main',
      type: 'main',
      intent: this.createMainStage(intent),
      dependsOn: stages.filter(s => s.type === 'preaggregation').map(s => s.id),
      materializeAs: 'main_query'
    })
    
    return { ...intent, stages }
  }
  
  private createPreaggregationStage(metric: MetricIntent): StageIntent {
    // For aggrAverage: GROUP BY dimension, aggregate the values
    return {
      operation: 'aggregate',
      groupBy: metric.stages.preaggregation.groupBy,
      aggregates: metric.stages.preaggregation.aggregates,
      table: metric.sourceTable || 'main'
    }
  }
}

class MultiStageQueryMaterializer {
  materialize(intent: QueryIntent, provider: Provider): Knex.QueryBuilder {
    const builder = provider.getQueryBuilder()
    
    // Execute stages in dependency order
    const executionPlan = this.createExecutionPlan(intent.stages)
    
    let query = builder
    const stageMaterializations = new Map<string, string>()
    
    for (const stage of executionPlan) {
      switch (stage.materializeAs) {
        case 'cte':
          // Add as Common Table Expression
          const cteQuery = this.materializeStage(stage, provider)
          query = query.with(stage.id, cteQuery)
          stageMaterializations.set(stage.id, stage.id)
          break
          
        case 'subquery':
          // Materialize as subquery for FROM clause
          const subQuery = this.materializeStage(stage, provider)
          stageMaterializations.set(stage.id, `(${subQuery.toString()})`)
          break
          
        case 'main_query':
          // Final query that references CTEs/subqueries
          query = this.materializeMainStage(stage, query, stageMaterializations, provider)
          break
      }
    }
    
    return query
  }
  
  private materializeStage(stage: QueryStage, provider: Provider): Knex.QueryBuilder {
    const builder = provider.getQueryBuilder()
    
    switch (stage.type) {
      case 'preaggregation':
        return this.materializePreaggregation(stage.intent, builder)
      case 'post_window':
        return this.materializeWindowFunction(stage.intent, builder)
      case 'main':
        return this.materializeMainQuery(stage.intent, builder)
    }
  }
}
```

## 🔄 **Implementation Strategy**

### Phase 1: Intent Building with Stage Analysis (Replace Current Parsing)
```typescript
// Instead of building SQL during parsing:
query.promise = query.providers[query.provider].getQueryPromise(query, builder)

// Build intent during parsing:
query.intent = {
  operation: 'fetch',
  table: tree.name.value,
  metrics: new Map(),
  dimensions: new Map(),
  filters: parseFiltersToIntent(tree, query),
  stages: [], // Will be populated by planner
  dependencies: [],
  directives: [],
  provider: query.provider
}

// Parse complex metrics like aggrAverage into multi-stage intents:
function parseAggrAverageMetric(tree, args): MetricIntent {
  return {
    type: 'multi_stage',
    alias: tree.alias.value,
    args,
    stages: {
      preaggregation: {
        groupBy: [args.by],
        aggregates: new Map([
          [`sum_${args.to}`, `SUM(${args.to})`],
          [`count_${args.by}`, `COUNT(${args.by})`]
        ])
      },
      final: {
        expression: `SUM(sum_${args.to})::FLOAT / COUNT(count_${args.by})::FLOAT`
      }
    }
  }
}

// Parse window functions like ranking:
function parseRankingMetric(tree, args): MetricIntent {
  return {
    type: 'window',
    alias: tree.alias.value,
    args,
    windowFunction: {
      function: 'RANK',
      orderBy: [{ field: args.a, direction: 'DESC' }],
      partitionBy: args.partitionBy ? [args.partitionBy] : undefined
    }
  }
}
```

### Phase 2: Directive Application (During Intent Phase)
```typescript
// Instead of applying directives during merge:
function parseDirective(tree, query, type, path) {
  // Apply directive to intent, not SQL
  query.intent.directives.push({
    type: tree.directive.name.value,
    args: tree.directive.arguments,
    target: { type, path },
    transform: getDirectiveTransformer(tree.directive.name.value)
  })
}
```

### Phase 3: Query Planning & Intent Transformation Pipeline
```typescript
function processQuery(intent: QueryIntent): QueryIntent {
  // 1. Plan stages based on metric complexity
  const planner = new QueryPlanner()
  let processedIntent = planner.plan(intent)
  
  // 2. Apply directive transformations (can modify stages)
  for (const directive of processedIntent.directives) {
    processedIntent = directive.transform(processedIntent)
  }
  
  // 3. Apply processors
  for (const processor of getProcessors()) {
    processedIntent = processor.transform(processedIntent)
  }
  
  // 4. Optimize stages (combine compatible stages, eliminate redundancy)
  const optimizer = new StageOptimizer()
  processedIntent = optimizer.optimize(processedIntent)
  
  return processedIntent
}
```

### Phase 4: Multi-Stage Materialization
```typescript
function materializeQuery(intent: QueryIntent): Knex.QueryBuilder {
  const provider = providers[intent.provider]
  const materializer = new MultiStageQueryMaterializer(provider)
  
  return materializer.materialize(intent)
}

// Example output for aggrAverage metric:
// WITH preag_avg_metric AS (
//   SELECT 
//     device,
//     SUM(revenue) as sum_revenue,
//     COUNT(device) as count_device
//   FROM sales_table 
//   GROUP BY device
// )
// SELECT 
//   device,
//   SUM(sum_revenue)::FLOAT / COUNT(count_device)::FLOAT as avg_metric
// FROM preag_avg_metric
// GROUP BY device
```

## 💡 **Specific Benefits for Your Use Case**

### 1. **Directive Flexibility with Multi-Stage Support**
Directives can now modify any aspect of the query before SQL generation, including multi-stage operations:
```typescript
// @groupOn directive can change dimensions before SQL building
const groupOnDirective = (intent: QueryIntent, args) => ({
  ...intent,
  dimensions: new Map([
    ['grouped_field', { 
      expression: `CASE WHEN ${args.condition} THEN ${args.groupValue} ELSE original_field END`
    }]
  ])
})

// @partitionBy directive can modify window functions across stages
const partitionByDirective = (intent: QueryIntent, args) => {
  const updatedStages = intent.stages.map(stage => {
    if (stage.type === 'post_window') {
      return {
        ...stage,
        intent: {
          ...stage.intent,
          windowFunction: {
            ...stage.intent.windowFunction,
            partitionBy: args.fields
          }
        }
      }
    }
    return stage
  })
  
  return { ...intent, stages: updatedStages }
}

// @preaggregate directive can force creation of materialized intermediate tables
const preaggregateDirective = (intent: QueryIntent, args) => {
  // Force complex metrics to use temp tables instead of CTEs for performance
  const updatedStages = intent.stages.map(stage => 
    stage.type === 'preaggregation' 
      ? { ...stage, materializeAs: 'temp_table' }
      : stage
  )
  
  return { ...intent, stages: updatedStages }
}
```

### 2. **Multi-Stage Query Optimization**
Analyze complete intent and stage dependencies before building SQL:
```typescript
class StageOptimizer {
  optimize(intent: QueryIntent): QueryIntent {
    // Combine compatible preaggregation stages
    const combinedStages = this.combinePreaggregationStages(intent.stages)
    
    // Eliminate redundant window function stages
    const optimizedWindows = this.optimizeWindowFunctions(combinedStages)
    
    // Optimize stage materialization strategy
    const optimizedMaterialization = this.optimizeMaterialization(optimizedWindows)
    
    return { ...intent, stages: optimizedMaterialization }
  }
  
  private combinePreaggregationStages(stages: QueryStage[]): QueryStage[] {
    // If multiple metrics need the same GROUP BY, combine them
    const preaggStages = stages.filter(s => s.type === 'preaggregation')
    const grouped = groupBy(preaggStages, s => s.intent.groupBy.join(','))
    
    const combinedStages = Object.values(grouped).map(stageGroup => {
      if (stageGroup.length === 1) return stageGroup[0]
      
      // Combine multiple preaggregation stages with same GROUP BY
      return {
        id: stageGroup.map(s => s.id).join('_'),
        type: 'preaggregation' as const,
        intent: {
          ...stageGroup[0].intent,
          aggregates: new Map([
            ...Array.from(stageGroup[0].intent.aggregates),
            ...stageGroup.slice(1).flatMap(s => Array.from(s.intent.aggregates))
          ])
        },
        dependsOn: [],
        materializeAs: 'cte' as const
      }
    })
    
    return [...combinedStages, ...stages.filter(s => s.type !== 'preaggregation')]
  }
}
```

### 3. **Provider Abstraction**
Same intent works for PostgreSQL, Snowflake, GA:
```typescript
// PostgreSQL materializer
pgMaterializer.materialize(intent) // → Knex SQL

// Google Analytics materializer  
gaMaterializer.materialize(intent) // → GA API call

// Snowflake materializer
snowflakeMaterializer.materialize(intent) // → Snowflake SQL
```

### 4. **Multi-Query Merging with Stage Coordination**
Analyze all intents and their stages before deciding how to merge:
```typescript
class QueryMerger {
  analyzeAndMerge(intents: QueryIntent[]): QueryIntent[] {
    // 1. Find queries that can share preaggregation stages
    const sharedPreaggregations = this.findSharedStages(intents, 'preaggregation')
    
    // 2. Merge compatible queries at the stage level
    const mergedIntents = this.mergeCompatibleStages(intents, sharedPreaggregations)
    
    // 3. Plan cross-query dependencies
    const dependencyPlan = this.planCrossQueryDependencies(mergedIntents)
    
    return this.optimizeExecutionOrder(mergedIntents, dependencyPlan)
  }
  
  private findSharedStages(intents: QueryIntent[], stageType: string): Map<string, QueryIntent[]> {
    const stageSignatures = new Map<string, QueryIntent[]>()
    
    for (const intent of intents) {
      for (const stage of intent.stages.filter(s => s.type === stageType)) {
        const signature = this.createStageSignature(stage)
        
        if (!stageSignatures.has(signature)) {
          stageSignatures.set(signature, [])
        }
        stageSignatures.get(signature).push(intent)
      }
    }
    
    // Return only stages shared by multiple queries
    return new Map(
      Array.from(stageSignatures.entries()).filter(([_, intents]) => intents.length > 1)
    )
  }
  
  private createStageSignature(stage: QueryStage): string {
    // Create a signature that identifies functionally equivalent stages
    return JSON.stringify({
      type: stage.type,
      groupBy: stage.intent.groupBy?.sort(),
      table: stage.intent.table,
      filters: stage.intent.filters?.sort()
    })
  }
}

// Example: Two queries both need device-level preaggregation
// Query 1: aggrAverage(revenue, by: device) 
// Query 2: aggrAverage(sessions, by: device)
// Result: Single shared preaggregation stage for device grouping
```

## 🚀 **Migration Path**

### Step 1: Introduce Intent Objects with Basic Stage Support (Parallel)
- Keep current SQL building
- Add intent building alongside
- Start with simple metrics, add stage analysis for complex ones
- Compare outputs for validation

### Step 2: Implement Multi-Stage Planner
- Create QueryPlanner for metrics like `aggrAverage`
- Implement basic stage materialization (CTEs first)
- Validate complex metric outputs match current system

### Step 3: Move Directives to Intent Phase
- Apply directives to intent instead of results
- Ensure directives can modify stage plans
- Validate behavior matches current system

### Step 4: Replace SQL Building with Multi-Stage Materialization
- Remove eager SQL building
- Use materialization for final SQL generation
- Implement stage optimization

### Step 5: Add Advanced Stage Features
- Implement temp table materialization for performance
- Add cross-query stage sharing
- Implement advanced merging strategies

## 🎯 **Key Success Metrics**

1. **Flexibility**: Directives can modify any query aspect before SQL
2. **Performance**: Better query optimization through complete visibility
3. **Maintainability**: Clear separation between intent and execution
4. **Extensibility**: Easy to add new providers and transformations

## 💭 **Why This Solves Your Complex Problems**

Your current issues are:

1. **SQL is built too early** - before you know all transformations needed
2. **Complex metrics require preaggregation** - but you can't plan subqueries during eager parsing  
3. **Window functions need specific execution order** - but current system can't coordinate stages
4. **Directives need to modify subquery structure** - impossible with current SQL-first approach

The **Multi-Stage Query Intent Object** pattern solves all of these:

1. **Deferred materialization** - SQL built only after complete analysis
2. **Stage planning** - `aggrAverage` gets proper preaggregation stage automatically
3. **Dependency management** - window functions execute in correct order
4. **Stage-aware directives** - can modify any stage before SQL generation

This follows the same pattern as modern query engines (Spark Catalyst, Apache Calcite, PostgreSQL planner):
- **Parse to logical plan** (Intent)
- **Analyze and optimize** (Stage planning + transformations)  
- **Generate physical plan** (Multi-stage SQL)
- **Execute** (Materialization)

## 🔥 **Specific Benefits for Your Metrics**

### `aggrAverage` becomes:
```sql
WITH device_preagg AS (
  SELECT device, SUM(revenue) as sum_rev, COUNT(*) as cnt
  FROM sales GROUP BY device
)
SELECT device, SUM(sum_rev)::FLOAT / SUM(cnt)::FLOAT as avg_revenue
FROM device_preagg GROUP BY device
```

### `ranking` with directives:
```sql  
-- @partitionBy(field: "category") directive can modify:
SELECT *, RANK() OVER(PARTITION BY category ORDER BY revenue DESC) as rank
FROM sales
```

### Combined metrics optimization:
```sql
-- Multiple aggrAverage metrics with same grouping get merged:
WITH device_preagg AS (
  SELECT 
    device, 
    SUM(revenue) as sum_rev, SUM(sessions) as sum_sess,
    COUNT(*) as cnt
  FROM sales GROUP BY device  
)
SELECT 
  device,
  SUM(sum_rev)::FLOAT / SUM(cnt)::FLOAT as avg_revenue,
  SUM(sum_sess)::FLOAT / SUM(cnt)::FLOAT as avg_sessions
FROM device_preagg GROUP BY device
```

## 🗃️ **Database-Specific Function Handling**

The Intent pattern dramatically improves database-specific function support compared to your current keyword validation:

### **Current Approach (Limited)**:
```typescript
// In metricWrapper - validates keywords after parsing
if (keywords && !keywords.every(keyword => 
  query.providers[query.provider].keywords.includes(keyword)
)) {
  throw new Error(`${query.provider} provider doesn't support ${tree.name.value} metric`)
}
```

### **Intent Approach (Powerful)**:
```typescript
interface ProviderCapabilities {
  // SQL Functions
  aggregateFunctions: Set<string>     // SUM, COUNT, AVG, etc.
  windowFunctions: Set<string>        // RANK, ROW_NUMBER, LAG, etc.
  analyticalFunctions: Set<string>    // PERCENTILE_CONT, MEDIAN, etc.
  mathFunctions: Set<string>          // SQRT, POWER, etc.
  stringFunctions: Set<string>        // SUBSTRING, REGEXP, etc.
  dateFunctions: Set<string>          // DATE_TRUNC, EXTRACT, etc.
  
  // Advanced Features
  supportsCTEs: boolean
  supportsTempTables: boolean
  supportsWindowFrames: boolean
  supportsLateralJoins: boolean
  supportsArrayAggregation: boolean
  
  // Provider-specific optimizations
  preferredMaterialization: 'cte' | 'temp_table' | 'subquery'
  maxCTEDepth: number
  supportsNestedCTEs: boolean
}

class ProviderSpecificMaterializer {
  materialize(intent: QueryIntent, provider: Provider): Knex.QueryBuilder {
    // 1. Validate intent against provider capabilities
    this.validateCapabilities(intent, provider.capabilities)
    
    // 2. Transform intent for provider-specific optimizations
    const optimizedIntent = this.optimizeForProvider(intent, provider)
    
    // 3. Generate provider-specific SQL
    return this.generateSQL(optimizedIntent, provider)
  }
  
  private validateCapabilities(intent: QueryIntent, capabilities: ProviderCapabilities) {
    for (const [alias, metric] of intent.metrics) {
      if (metric.windowFunction) {
        if (!capabilities.windowFunctions.has(metric.windowFunction.function)) {
          throw new Error(
            `Provider doesn't support ${metric.windowFunction.function} window function`
          )
        }
      }
      
      // Check if metric stages are compatible
      for (const stage of intent.stages) {
        if (stage.materializeAs === 'cte' && !capabilities.supportsCTEs) {
          // Automatically fallback to subquery
          stage.materializeAs = 'subquery'
        }
      }
    }
  }
  
  private optimizeForProvider(intent: QueryIntent, provider: Provider): QueryIntent {
    const capabilities = provider.capabilities
    
    // PostgreSQL: Use advanced window functions, CTEs
    if (provider.name === 'postgres') {
      return this.optimizeForPostgreSQL(intent, capabilities)
    }
    
    // Snowflake: Use native analytical functions, temp tables for complex queries
    if (provider.name === 'snowflake') {
      return this.optimizeForSnowflake(intent, capabilities)
    }
    
    // Google Analytics: Transform to GA-specific metrics
    if (provider.name === 'ga') {
      return this.optimizeForGA(intent, capabilities)
    }
    
    return intent
  }
}
```

### **Provider-Specific Optimizations**:

#### **PostgreSQL Specialization**:
```typescript
private optimizeForPostgreSQL(intent: QueryIntent, capabilities: ProviderCapabilities): QueryIntent {
  // PostgreSQL has PERCENTILE_CONT, use it instead of approximation
  const optimizedMetrics = new Map(intent.metrics)
  
  for (const [alias, metric] of intent.metrics) {
    if (metric.type === 'percentile') {
      optimizedMetrics.set(alias, {
        ...metric,
        expression: `PERCENTILE_CONT(${metric.args.factor || 0.5}) WITHIN GROUP(ORDER BY ${metric.args.a})`
      })
    }
    
    // PostgreSQL supports text search - use native ts_rank
    if (metric.type === 'search_ranking') {
      optimizedMetrics.set(alias, {
        ...metric,
        expression: `ts_rank(to_tsvector('simple', ${metric.args.a}), plainto_tsquery('simple', '${metric.args.query}'))`
      })
    }
  }
  
  return { ...intent, metrics: optimizedMetrics }
}
```

#### **Snowflake Specialization**:
```typescript
private optimizeForSnowflake(intent: QueryIntent, capabilities: ProviderCapabilities): QueryIntent {
  const optimizedStages = intent.stages.map(stage => {
    // Snowflake prefers materialized temp tables for complex aggregations
    if (stage.type === 'preaggregation' && stage.intent.aggregates.size > 3) {
      return { ...stage, materializeAs: 'temp_table' as const }
    }
    
    return stage
  })
  
  const optimizedMetrics = new Map(intent.metrics)
  
  for (const [alias, metric] of intent.metrics) {
    // Snowflake has native MEDIAN function
    if (metric.type === 'percentile' && metric.args.factor === 0.5) {
      optimizedMetrics.set(alias, {
        ...metric,
        expression: `MEDIAN(${metric.args.a})${metric.windowFunction ? ' OVER(...)' : ''}`
      })
    }
    
    // Use Snowflake's APPROXIMATE_PERCENTILE for large datasets
    if (metric.type === 'percentile' && metric.args.approximate) {
      optimizedMetrics.set(alias, {
        ...metric,
        expression: `APPROXIMATE_PERCENTILE(${metric.args.a}, ${metric.args.factor})`
      })
    }
  }
  
  return { ...intent, metrics: optimizedMetrics, stages: optimizedStages }
}
```

#### **Google Analytics Specialization**:
```typescript
private optimizeForGA(intent: QueryIntent, capabilities: ProviderCapabilities): QueryIntent {
  // GA doesn't support SQL - transform to GA API calls
  const gaMetrics = new Map()
  const gaDimensions = new Map()
  
  for (const [alias, metric] of intent.metrics) {
    switch (metric.type) {
      case 'sum':
        gaMetrics.set(alias, `ga:${metric.args.a}`)
        break
      case 'count':
        gaMetrics.set(alias, 'ga:sessions')
        break
      case 'divide':
        // GA handles calculated metrics differently
        gaMetrics.set(alias, {
          expression: `ga:${metric.args.a}/ga:${metric.args.by}`,
          type: 'calculated'
        })
        break
    }
  }
  
  // Transform stages to GA API structure
  const gaStages = [{
    id: 'main',
    type: 'main' as const,
    intent: {
      metrics: Array.from(gaMetrics.keys()),
      dimensions: Array.from(intent.dimensions.keys()),
      filters: this.transformFiltersToGA(intent.filters)
    },
    dependsOn: [],
    materializeAs: 'main_query' as const
  }]
  
  return { ...intent, metrics: gaMetrics, stages: gaStages }
}
```

### **Function Mapping System**:
```typescript
interface FunctionMapping {
  generic: string          // Generic function name
  postgres?: string        // PostgreSQL-specific implementation
  snowflake?: string       // Snowflake-specific implementation  
  mysql?: string          // MySQL-specific implementation
  requiresStaging?: boolean // Needs preaggregation
}

const FUNCTION_MAPPINGS: Record<string, FunctionMapping> = {
  percentile: {
    generic: 'PERCENTILE_CONT({factor}) WITHIN GROUP(ORDER BY {field})',
    postgres: 'PERCENTILE_CONT({factor}) WITHIN GROUP(ORDER BY {field})',
    snowflake: 'MEDIAN({field})', // When factor = 0.5
    mysql: 'PERCENT_RANK() OVER(ORDER BY {field})', // Approximation
    requiresStaging: false
  },
  
  aggrAverage: {
    generic: 'SUM({numerator}) / COUNT({denominator})',
    postgres: 'SUM({numerator})::FLOAT / COUNT({denominator})::FLOAT',
    snowflake: 'SUM({numerator})::FLOAT / COUNT({denominator})::FLOAT',
    mysql: 'SUM({numerator}) / COUNT({denominator})',
    requiresStaging: true // Always needs preaggregation
  },
  
  textSearch: {
    generic: null, // No generic implementation
    postgres: `ts_rank(to_tsvector('simple', {field}), plainto_tsquery('simple', {query}))`,
    snowflake: null, // Not supported
    mysql: `MATCH({field}) AGAINST({query} IN NATURAL LANGUAGE MODE)`
  }
}
```

### **Benefits of Intent-Based Provider Handling**:

1. **Automatic Fallbacks**: If a provider doesn't support a function, automatically choose alternative implementation
2. **Provider-Specific Optimizations**: Each provider can use its best features (Snowflake temp tables, PostgreSQL text search, etc.)
3. **Cross-Provider Compatibility**: Same intent works across all providers with appropriate transformations
4. **Performance Optimization**: Provider-specific materialization strategies
5. **Feature Detection**: Intent can be validated against actual provider capabilities, not just keyword lists

This approach transforms database compatibility from a **validation problem** (current) to an **optimization opportunity** (intent-based).