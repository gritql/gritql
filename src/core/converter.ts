import { GritQLContext, Hook, HookStage } from '../types';

export type ConversionFormat = 'graphql' | 'json' | 'csv' | 'table' | 'custom';

export interface ConversionOptions {
  format?: ConversionFormat;
  includeMetadata?: boolean;
  flattenResult?: boolean;
  customConverter?: (data: any, context: GritQLContext) => any;
  csvOptions?: {
    delimiter?: string;
    includeHeaders?: boolean;
    quoteChar?: string;
  };
  tableOptions?: {
    maxColumnWidth?: number;
    border?: boolean;
  };
}

export class ResultConverter {
  private hooks: Map<HookStage, Hook[]> = new Map();

  constructor(hooks: Hook[] = []) {
    hooks.forEach(hook => this.addHook(hook));
  }

  addHook(hook: Hook): void {
    const stageHooks = this.hooks.get(hook.stage) || [];
    stageHooks.push(hook);
    this.hooks.set(hook.stage, stageHooks);
  }

  async convert(
    data: any,
    context: GritQLContext,
    options: ConversionOptions = {}
  ): Promise<any> {
    const { format = 'graphql', includeMetadata = false } = options;

    try {
      // Execute beforeConvert hooks
      let processedData = await this.executeHooks('beforeConvert', data, context);

      // Execute duringConvert hooks
      processedData = await this.executeHooks('duringConvert', processedData, context);

      // Apply main conversion based on format
      let convertedData: any;
      
      switch (format) {
        case 'graphql':
          convertedData = this.convertToGraphQL(processedData, context, options);
          break;
        case 'json':
          convertedData = this.convertToJSON(processedData, context, options);
          break;
        case 'csv':
          convertedData = this.convertToCSV(processedData, context, options);
          break;
        case 'table':
          convertedData = this.convertToTable(processedData, context, options);
          break;
        case 'custom':
          convertedData = this.convertCustom(processedData, context, options);
          break;
        default:
          convertedData = processedData;
      }

      // Add metadata if requested
      if (includeMetadata) {
        convertedData = this.addMetadata(convertedData, data, context);
      }

      // Execute afterConvert hooks
      convertedData = await this.executeHooks('afterConvert', convertedData, context);

      return convertedData;
    } catch (error) {
      throw new Error(`Result conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private convertToGraphQL(data: any, context: GritQLContext, options: ConversionOptions): any {
    // Convert SQL result to GraphQL-like structure
    if (!Array.isArray(data)) {
      return { data: data };
    }

    // If it's an array of objects, wrap in data field
    return { data: data };
  }

  private convertToJSON(data: any, context: GritQLContext, options: ConversionOptions): any {
    if (options.flattenResult && Array.isArray(data) && data.length === 1) {
      return data[0];
    }
    return data;
  }

  private convertToCSV(data: any, context: GritQLContext, options: ConversionOptions): string {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    const csvOptions = options.csvOptions || {};
    const delimiter = csvOptions.delimiter || ',';
    const includeHeaders = csvOptions.includeHeaders !== false;
    const quoteChar = csvOptions.quoteChar || '"';

    const rows: string[] = [];
    const firstRow = data[0];
    const headers = Object.keys(firstRow);

    // Add headers if requested
    if (includeHeaders) {
      rows.push(headers.map(header => this.csvEscape(header, quoteChar, delimiter)).join(delimiter));
    }

    // Add data rows
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        return this.csvEscape(String(value), quoteChar, delimiter);
      });
      rows.push(values.join(delimiter));
    });

    return rows.join('\n');
  }

  private convertToTable(data: any, context: GritQLContext, options: ConversionOptions): string {
    if (!Array.isArray(data) || data.length === 0) {
      return 'No data';
    }

    const tableOptions = options.tableOptions || {};
    const maxColumnWidth = tableOptions.maxColumnWidth || 30;
    const border = tableOptions.border !== false;

    const firstRow = data[0];
    const headers = Object.keys(firstRow);
    
    // Calculate column widths
    const columnWidths = headers.map(header => {
      const maxContentWidth = Math.max(
        header.length,
        ...data.map(row => String(row[header] || '').length)
      );
      return Math.min(maxContentWidth, maxColumnWidth);
    });

    const rows: string[] = [];

    // Create border
    const createBorder = () => {
      return '+' + columnWidths.map(width => '-'.repeat(width + 2)).join('+') + '+';
    };

    // Create row
    const createRow = (values: string[]) => {
      const paddedValues = values.map((value, index) => {
        const truncated = value.length > columnWidths[index] 
          ? value.substring(0, columnWidths[index] - 3) + '...'
          : value;
        return ` ${truncated.padEnd(columnWidths[index])} `;
      });
      return '|' + paddedValues.join('|') + '|';
    };

    if (border) {
      rows.push(createBorder());
    }

    // Add headers
    rows.push(createRow(headers));
    
    if (border) {
      rows.push(createBorder());
    }

    // Add data rows
    data.forEach(row => {
      const values = headers.map(header => String(row[header] || ''));
      rows.push(createRow(values));
    });

    if (border) {
      rows.push(createBorder());
    }

    return rows.join('\n');
  }

  private convertCustom(data: any, context: GritQLContext, options: ConversionOptions): any {
    if (options.customConverter) {
      return options.customConverter(data, context);
    }
    return data;
  }

  private addMetadata(convertedData: any, originalData: any, context: GritQLContext): any {
    const metadata = {
      rowCount: Array.isArray(originalData) ? originalData.length : 1,
      provider: context.provider,
      executionTime: Date.now(), // This would be better calculated from execution start
      variables: context.variables
    };

    return {
      data: convertedData,
      metadata
    };
  }

  private csvEscape(value: string, quoteChar: string, delimiter: string): string {
    // Check if value needs escaping
    const needsEscaping = value.includes(delimiter) || 
                         value.includes(quoteChar) || 
                         value.includes('\n') || 
                         value.includes('\r');

    if (needsEscaping) {
      // Escape quote characters by doubling them
      const escaped = value.replace(new RegExp(quoteChar, 'g'), quoteChar + quoteChar);
      return quoteChar + escaped + quoteChar;
    }

    return value;
  }

  async convertBatch(
    results: any[],
    context: GritQLContext,
    options: ConversionOptions = {}
  ): Promise<any[]> {
    return Promise.all(
      results.map(result => this.convert(result, context, options))
    );
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
        // Continue with other hooks for conversion stages
      }
    }
    
    return processedData;
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