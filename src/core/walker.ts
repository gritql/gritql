import {
  DocumentNode,
  FieldNode,
  SelectionSetNode,
  DirectiveNode,
  OperationDefinitionNode,
  ValueNode,
} from 'graphql'
import {
  ParseContext,
  MetricParser,
  DimensionParser,
  DirectiveParser,
} from '../types'
import { createQueryBuilder } from '../intent'
import { logger, LogModules } from '../utils/logger'
import { withFilters } from '../filters'

export interface WalkResult {
  queries: ParseContext[]
}

const FETCH_OPERATIONS = ['fetch', 'fetchPlain', 'with']

export class ASTWalker {
  private metricParsers: Map<string, MetricParser> = new Map()
  private dimensionParsers: Map<string, DimensionParser> = new Map()
  private directiveParsers: Map<string, DirectiveParser> = new Map()

  constructor(
    metricParsers: MetricParser[] = [],
    dimensionParsers: DimensionParser[] = [],
    directiveParsers: DirectiveParser[] = [],
  ) {
    metricParsers.forEach((p) => this.metricParsers.set(p.name, p))
    dimensionParsers.forEach((p) => this.dimensionParsers.set(p.name, p))
    directiveParsers.forEach((p) => this.directiveParsers.set(p.name, p))
  }

  addMetricParser(parser: MetricParser): void {
    this.metricParsers.set(parser.name, parser)
  }

  addDimensionParser(parser: DimensionParser): void {
    this.dimensionParsers.set(parser.name, parser)
  }

  addDirectiveParser(parser: DirectiveParser): void {
    this.directiveParsers.set(parser.name, parser)
  }

  walk(document: DocumentNode, context: ParseContext): WalkResult {
    logger.info(LogModules.WALKER, 'Starting AST walk', {
      documentType: document.kind,
    })
    const queries: ParseContext[] = []

    document.definitions.forEach((definition) => {
      if (
        definition.kind === 'OperationDefinition' &&
        definition.selectionSet
      ) {
        const tableName =
          definition.operation === 'query' ? definition.name?.value : undefined
        this.processOperation(definition, queries, context, tableName)
      }
    })

    const result = { queries: queries.filter((q) => q.name !== undefined) }
    logger.info(LogModules.WALKER, 'AST walk completed', {
      totalQueries: queries.length,
      namedQueries: result.queries.length,
    })
    return result
  }

  private processOperation(
    operation: OperationDefinitionNode,
    queries: ParseContext[],
    context: ParseContext,
    tableName?: string,
  ): void {
    logger.debug(LogModules.WALKER, 'Processing operation', {
      operationType: operation.operation,
      operationName: operation.name?.value,
      tableName,
    })
    operation.selectionSet?.selections.forEach((selection) => {
      if (selection.kind === 'Field') {
        this.processTopLevelField(selection, queries, context, tableName)
      }
    })
  }

  private processTopLevelField(
    field: FieldNode,
    queries: ParseContext[],
    context: ParseContext,
    tableName?: string,
  ): void {
    const fieldName = field.name.value
    logger.debug(LogModules.WALKER, 'Processing top-level field', {
      fieldName,
      hasAlias: !!field.alias,
      hasSelectionSet: !!field.selectionSet,
    })

    if (FETCH_OPERATIONS.includes(fieldName)) {
      this.processFetchOperation(field, queries, context, tableName, fieldName)
    } else {
      // Non-fetch fields at top level
      throw new Error('Only fetch operations are allowed at the top level')
    }
  }

  private processFetchOperation(
    field: FieldNode,
    queries: ParseContext[],
    context: ParseContext,
    tableName: string | undefined,
    operationType: string,
  ): void {
    logger.info(LogModules.WALKER, 'Processing fetch operation', {
      operationType,
      tableName,
      alias: field.alias?.value,
      hasArguments: !!field.arguments?.length,
    })
    const newContext: ParseContext = {
      ...context,
      idx: queries.length,
      name: field.alias?.value || undefined,
      table: tableName,
      query: tableName
        ? createQueryBuilder().select().from(tableName)
        : createQueryBuilder().select(),
      isWith: operationType === 'with',
    }

    // Parse and apply filters
    if (field.arguments?.length) {
      const filters = this.parseArguments(field)
      logger.trace(LogModules.WALKER, 'Parsed arguments', { filters })

      // Use withFilters to create a filter resolver
      const filterResolver = withFilters(newContext, filters)
      if (filterResolver) {
        newContext.query = filterResolver(newContext.query)
      }
    }

    // Validate table name
    if (!tableName && !newContext.isWith) {
      throw new Error(
        'Table name must be specified through table argument or query name',
      )
    }

    // Apply 'with' queries
    if (!newContext.isWith) {
      this.applyWithQueries(newContext, queries)
    }

    queries.push(newContext)

    // Process nested selections
    if (!field.selectionSet) {
      throw new Error(
        'The query is empty, you need to specify metrics or dimensions',
      )
    }
    this.processSelectionSet(field.selectionSet, queries, newContext.idx!)
  }

  private applyWithQueries(
    context: ParseContext,
    queries: ParseContext[],
  ): void {
    queries
      .filter((q) => q.isWith && q.name && q.query)
      .forEach((q) => {
        context.query = (context.query as any).with(q.name, q.query)
      })
  }

  private processField(field: FieldNode, context: ParseContext): void {
    const fieldName = field.name.value
    logger.trace(LogModules.WALKER, 'Processing field', {
      fieldName,
      alias: field.alias?.value,
      directives: field.directives?.map((d) => d.name.value),
      contextTable: context.table,
      contextName: context.name,
    })

    // Skip fetch operations (already handled at top level)
    if (FETCH_OPERATIONS.includes(fieldName)) return

    // Process directives
    field.directives?.forEach((directive) => {
      const parser = this.directiveParsers.get(directive.name.value)
      if (parser) {
        logger.debug(LogModules.WALKER, 'Applying directive parser', {
          directive: directive.name.value,
        })
        parser.parse(directive, field, context)
      } else {
        logger.warn(LogModules.WALKER, 'No parser found for directive', {
          directive: directive.name.value,
        })
      }
    })

    // Get the appropriate parser
    const metricParser = this.findParser(fieldName, this.metricParsers)
    const dimensionParser = this.findParser(fieldName, this.dimensionParsers)

    if (metricParser) {
      logger.debug(LogModules.WALKER, 'Using metric parser', {
        parser: metricParser.name,
        field: fieldName,
      })
      metricParser.parse(field, context)
    } else if (dimensionParser) {
      logger.debug(LogModules.WALKER, 'Using dimension parser', {
        parser: dimensionParser.name,
        field: fieldName,
      })
      dimensionParser.parse(field, context)
    } else {
      // Basic field selection
      const alias = field.alias?.value || field.name.value
      const tableName = context.table || 'data'
      logger.debug(LogModules.WALKER, 'Basic field selection', {
        tableName,
        fieldName,
        alias,
      })
      context.query = context.query.select(`${tableName}.${fieldName}`, alias)
    }
  }

  private processSelectionSet(
    selectionSet: SelectionSetNode,
    queries: ParseContext[],
    idx: number,
  ): ParseContext[] {
    logger.debug(LogModules.WALKER, 'Processing selection set', {
      queryIndex: idx,
      selectionsCount: selectionSet.selections.length,
    })
    const query = queries[idx]
    if (!query) return queries

    const fieldSelections = selectionSet.selections.filter(
      (s): s is FieldNode => s.kind === 'Field',
    )

    // Analyze selection types
    const metrics = fieldSelections.filter((s) => !s.selectionSet)
    const dimensions = fieldSelections.filter((s) => !!s.selectionSet)
    const needsSplitting =
      (metrics.length > 0 && dimensions.length > 0) || dimensions.length > 1
    logger.trace(LogModules.WALKER, 'Selection set analysis', {
      metricsCount: metrics.length,
      dimensionsCount: dimensions.length,
      needsSplitting,
    })

    if (needsSplitting) {
      // Process metrics in current query
      metrics.forEach((metric) => this.processField(metric, query))

      // Process each dimension in a new query
      dimensions.forEach((dimension) => {
        const newQuery: ParseContext = {
          ...query,
          idx: queries.length,
          query: query.query.clone(),
        }
        queries.push(newQuery)
        this.processField(dimension, newQuery)

        if (dimension.selectionSet) {
          this.processSelectionSet(
            dimension.selectionSet,
            queries,
            newQuery.idx!,
          )
        }
      })
    } else {
      // Process all selections normally
      selectionSet.selections.forEach((selection) => {
        if (selection.kind === 'Field') {
          this.processField(selection, query)
          if (selection.selectionSet) {
            this.processSelectionSet(selection.selectionSet, queries, idx)
          }
        }
      })
    }

    return queries
  }

  private findParser<T extends { name: string }>(
    fieldName: string,
    parsers: Map<string, T>,
  ): T | undefined {
    // Direct match
    const directMatch = parsers.get(fieldName)
    if (directMatch) return directMatch

    // Pattern matching
    for (const [name, parser] of parsers) {
      if (fieldName.startsWith(`${name}_`) || fieldName.endsWith(`_${name}`)) {
        return parser
      }
    }

    return undefined
  }

  private parseArguments(field: FieldNode): Record<string, any> {
    const args: Record<string, any> = {}

    field.arguments?.forEach((arg) => {
      const name = arg.name.value
      const value = this.extractValue(arg.value)

      // If the argument is named 'filter' or 'filters', it contains the filter object
      if (name === 'filter' || name === 'filters') {
        // The filter argument value becomes the entire filter object
        Object.assign(args, value)
      } else if (name === 'where') {
        // Direct where clause
        args.where = value
      } else {
        // Other arguments like limit, offset, etc.
        args[name] = value
      }
    })

    return args
  }

  private extractValue(value: ValueNode): any {
    switch (value.kind) {
      case 'StringValue':
        return value.value
      case 'IntValue':
        return parseInt(value.value, 10)
      case 'FloatValue':
        return parseFloat(value.value)
      case 'BooleanValue':
        return value.value
      case 'NullValue':
        return null
      case 'ListValue':
        return value.values.map((v) => this.extractValue(v))
      case 'ObjectValue': {
        const obj: Record<string, any> = {}
        value.fields.forEach((field) => {
          obj[field.name.value] = this.extractValue(field.value)
        })
        return obj
      }
      case 'Variable':
        return `$${value.name.value}`
      default:
        return null
    }
  }

  // Removed applyFilters method - now using withFilters from filters module

  getRegisteredParsers(): {
    metrics: string[]
    dimensions: string[]
    directives: string[]
  } {
    return {
      metrics: Array.from(this.metricParsers.keys()),
      dimensions: Array.from(this.dimensionParsers.keys()),
      directives: Array.from(this.directiveParsers.keys()),
    }
  }
}
