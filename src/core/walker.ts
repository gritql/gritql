import { 
  DocumentNode, 
  FieldNode, 
  SelectionSetNode, 
  DirectiveNode,
  visit
} from 'graphql';
import { ParseContext, MetricParser, DimensionParser, DirectiveParser } from '../types';

export class ASTWalker {
  private metricParsers: Map<string, MetricParser> = new Map();
  private dimensionParsers: Map<string, DimensionParser> = new Map();
  private directiveParsers: Map<string, DirectiveParser> = new Map();

  constructor(
    metricParsers: MetricParser[] = [],
    dimensionParsers: DimensionParser[] = [],
    directiveParsers: DirectiveParser[] = []
  ) {
    metricParsers.forEach(parser => this.metricParsers.set(parser.name, parser));
    dimensionParsers.forEach(parser => this.dimensionParsers.set(parser.name, parser));
    directiveParsers.forEach(parser => this.directiveParsers.set(parser.name, parser));
  }

  addMetricParser(parser: MetricParser): void {
    this.metricParsers.set(parser.name, parser);
  }

  addDimensionParser(parser: DimensionParser): void {
    this.dimensionParsers.set(parser.name, parser);
  }

  addDirectiveParser(parser: DirectiveParser): void {
    this.directiveParsers.set(parser.name, parser);
  }

  walk(document: DocumentNode, context: ParseContext): void {
    const self = this;
    visit(document, {
      Field: {
        enter(node: FieldNode) {
          self.processField(node, context);
        }
      }
    });
  }

  private processField(field: FieldNode, context: ParseContext): void {
    const fieldName = field.name.value;
    
    // Update path context
    const newContext = {
      ...context,
      path: [...context.path, fieldName]
    };

    // Process directives first
    if (field.directives) {
      field.directives.forEach(directive => {
        this.processDirective(directive, field, newContext);
      });
    }

    // Try to find and execute metric parser
    const metricParser = this.findMetricParser(fieldName);
    if (metricParser) {
      metricParser.parse(field, newContext);
      // Update parent context with new query
      context.query = newContext.query;
      return;
    }

    // Try to find and execute dimension parser
    const dimensionParser = this.findDimensionParser(fieldName);
    if (dimensionParser) {
      dimensionParser.parse(field, newContext);
      // Update parent context with new query
      context.query = newContext.query;
      return;
    }

    // If no specific parser found, treat as a basic field selection
    this.processBasicField(field, newContext);
    // Update parent context with new query
    context.query = newContext.query;

    // Process nested selections
    if (field.selectionSet) {
      this.processSelectionSet(field.selectionSet, newContext);
      // Update parent context with new query after processing nested selections
      context.query = newContext.query;
    }
  }

  private processDirective(directive: DirectiveNode, field: FieldNode, context: ParseContext): void {
    const directiveName = directive.name.value;
    const parser = this.directiveParsers.get(directiveName);
    
    if (parser) {
      parser.parse(directive, field, context);
    }
  }

  private processBasicField(field: FieldNode, context: ParseContext): void {
    const alias = field.alias?.value || field.name.value;
    const fieldName = field.name.value;
    const tableName = context.path.length > 1 ? context.path[context.path.length - 2] : 'data';
    
    // Basic field selection
    context.query = context.query.select(`${tableName}.${fieldName}`, alias);
  }

  private processSelectionSet(selectionSet: SelectionSetNode, context: ParseContext): void {
    selectionSet.selections.forEach(selection => {
      if (selection.kind === 'Field') {
        this.processField(selection, context);
      }
    });
  }

  private findMetricParser(fieldName: string): MetricParser | undefined {
    // Direct match
    if (this.metricParsers.has(fieldName)) {
      return this.metricParsers.get(fieldName);
    }

    // Pattern matching for common metric patterns
    for (const [name, parser] of this.metricParsers) {
      if (fieldName.startsWith(`${name}_`) || fieldName.endsWith(`_${name}`)) {
        return parser;
      }
    }

    return undefined;
  }

  private findDimensionParser(fieldName: string): DimensionParser | undefined {
    // Direct match
    if (this.dimensionParsers.has(fieldName)) {
      return this.dimensionParsers.get(fieldName);
    }

    // Pattern matching for common dimension patterns
    for (const [name, parser] of this.dimensionParsers) {
      if (fieldName.startsWith(`${name}_`) || fieldName.endsWith(`_${name}`)) {
        return parser;
      }
    }

    return undefined;
  }

  getRegisteredParsers(): {
    metrics: string[];
    dimensions: string[];
    directives: string[];
  } {
    return {
      metrics: Array.from(this.metricParsers.keys()),
      dimensions: Array.from(this.dimensionParsers.keys()),
      directives: Array.from(this.directiveParsers.keys())
    };
  }
}