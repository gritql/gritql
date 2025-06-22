import { 
  Extension, 
  Hook, 
  MetricParser, 
  DimensionParser, 
  DirectiveParser,
  HookStage,
  GritQLContext
} from '../types';

export class ExtensionRegistry {
  private extensions: Extension[] = [];
  private hooks: Map<HookStage, Hook[]> = new Map();
  private metricParsers: Map<string, MetricParser> = new Map();
  private dimensionParsers: Map<string, DimensionParser> = new Map();
  private directiveParsers: Map<string, DirectiveParser> = new Map();

  register(extension: Extension): void {
    this.extensions.push(extension);

    // Register hooks
    if (extension.hooks) {
      for (const hook of extension.hooks) {
        const stageHooks = this.hooks.get(hook.stage) || [];
        stageHooks.push(hook);
        this.hooks.set(hook.stage, stageHooks);
      }
    }

    // Register metric parsers
    if (extension.metricParsers) {
      for (const parser of extension.metricParsers) {
        this.metricParsers.set(parser.name, parser);
      }
    }

    // Register dimension parsers
    if (extension.dimensionParsers) {
      for (const parser of extension.dimensionParsers) {
        this.dimensionParsers.set(parser.name, parser);
      }
    }

    // Register directive parsers
    if (extension.directiveParsers) {
      for (const parser of extension.directiveParsers) {
        this.directiveParsers.set(parser.name, parser);
      }
    }
  }

  async runHooks<T>(stage: HookStage, data: T, context: GritQLContext): Promise<T> {
    const stageHooks = this.hooks.get(stage) || [];
    let result = data;

    for (const hook of stageHooks) {
      result = await hook.handler(result, context);
    }

    return result;
  }

  getMetricParser(name: string): MetricParser | undefined {
    return this.metricParsers.get(name);
  }

  getDimensionParser(name: string): DimensionParser | undefined {
    return this.dimensionParsers.get(name);
  }

  getDirectiveParser(name: string): DirectiveParser | undefined {
    return this.directiveParsers.get(name);
  }

  getExtensions(): Extension[] {
    return [...this.extensions];
  }

  getMetricParsers(): MetricParser[] {
    return Array.from(this.metricParsers.values());
  }

  getDimensionParsers(): DimensionParser[] {
    return Array.from(this.dimensionParsers.values());
  }

  getDirectiveParsers(): DirectiveParser[] {
    return Array.from(this.directiveParsers.values());
  }

  getHooks(stage: HookStage): Hook[] {
    return this.hooks.get(stage) || [];
  }

  getAllHooks(): Hook[] {
    const allHooks: Hook[] = [];
    for (const hooks of this.hooks.values()) {
      allHooks.push(...hooks);
    }
    return allHooks;
  }
}