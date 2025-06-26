import { FieldNode } from 'graphql';
import { MetricParser, ParseContext } from '../types';
import { logger, LogModules } from '../utils/logger';

/**
 * Basic metric parsers for common SQL aggregations
 */

export const countParser: MetricParser = {
  name: 'count',
  parse: (field: FieldNode, context: ParseContext) => {
    const alias = field.alias?.value || field.name.value;
    const tableName = context.table || 'data';
    
    logger.debug(LogModules.METRIC_PARSER, 'Parsing count metric', {
      alias,
      tableName
    });
    
    context.query = context.query.count(`${tableName}.*`, alias);
  }
};

export const sumParser: MetricParser = {
  name: 'sum',
  parse: (field: FieldNode, context: ParseContext) => {
    const alias = field.alias?.value || field.name.value;
    const tableName = context.table || 'data';
    
    // Get the column name from field arguments or name
    const columnArg = field.arguments?.find(arg => arg.name.value === 'field' || arg.name.value === 'column');
    const columnName = columnArg ? 
      (columnArg.value as any).value : 
      field.name.value.replace('sum_', '');
    
    logger.debug(LogModules.METRIC_PARSER, 'Parsing sum metric', {
      alias,
      columnName,
      tableName,
      fromArgument: !!columnArg
    });
    
    context.query = context.query.sum(`${tableName}.${columnName}`, alias);
  }
};

export const avgParser: MetricParser = {
  name: 'avg',
  parse: (field: FieldNode, context: ParseContext) => {
    const alias = field.alias?.value || field.name.value;
    const tableName = context.table || 'data';
    
    // Get the column name from field arguments or name
    const columnArg = field.arguments?.find(arg => arg.name.value === 'field' || arg.name.value === 'column');
    const columnName = columnArg ? 
      (columnArg.value as any).value : 
      field.name.value.replace('avg_', '');
    
    logger.debug(LogModules.METRIC_PARSER, 'Parsing avg metric', {
      alias,
      columnName,
      tableName,
      fromArgument: !!columnArg
    });
    
    context.query = context.query.avg(`${tableName}.${columnName}`, alias);
  }
};

export const minParser: MetricParser = {
  name: 'min',
  parse: (field: FieldNode, context: ParseContext) => {
    const alias = field.alias?.value || field.name.value;
    const tableName = context.table || 'data';
    
    const columnArg = field.arguments?.find(arg => arg.name.value === 'column');
    const columnName = columnArg ? 
      (columnArg.value as any).value : 
      field.name.value.replace('min_', '');
    
    logger.debug(LogModules.METRIC_PARSER, 'Parsing min metric', {
      alias,
      columnName,
      tableName
    });
    
    context.query = context.query.min(`${tableName}.${columnName}`, alias);
  }
};

export const maxParser: MetricParser = {
  name: 'max',
  parse: (field: FieldNode, context: ParseContext) => {
    const alias = field.alias?.value || field.name.value;
    const tableName = context.table || 'data';
    
    const columnArg = field.arguments?.find(arg => arg.name.value === 'column');
    const columnName = columnArg ? 
      (columnArg.value as any).value : 
      field.name.value.replace('max_', '');
    
    logger.debug(LogModules.METRIC_PARSER, 'Parsing max metric', {
      alias,
      columnName,
      tableName
    });
    
    context.query = context.query.max(`${tableName}.${columnName}`, alias);
  }
};

// Export all basic metric parsers
export const basicMetricParsers: MetricParser[] = [
  countParser,
  sumParser,
  avgParser,
  minParser,
  maxParser
];