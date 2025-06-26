import { DirectiveNode, FieldNode } from 'graphql';
import { DirectiveParser, ParseContext } from '../types';
import { logger, LogModules } from '../utils/logger';

/**
 * Basic directive parsers for common operations
 */

export const limitDirectiveParser: DirectiveParser = {
  name: 'limit',
  parse: (directive: DirectiveNode, field: FieldNode, context: ParseContext) => {
    const limitArg = directive.arguments?.find(arg => arg.name.value === 'count');
    if (limitArg && limitArg.value.kind === 'IntValue') {
      const limit = parseInt(limitArg.value.value, 10);
      logger.debug(LogModules.DIRECTIVE_PARSER, 'Applying limit directive', { limit });
      context.query = context.query.limit(limit);
    }
  }
};

export const offsetDirectiveParser: DirectiveParser = {
  name: 'offset',
  parse: (directive: DirectiveNode, field: FieldNode, context: ParseContext) => {
    const offsetArg = directive.arguments?.find(arg => arg.name.value === 'count');
    if (offsetArg && offsetArg.value.kind === 'IntValue') {
      const offset = parseInt(offsetArg.value.value, 10);
      logger.debug(LogModules.DIRECTIVE_PARSER, 'Applying offset directive', { offset });
      context.query = context.query.offset(offset);
    }
  }
};

export const orderByDirectiveParser: DirectiveParser = {
  name: 'orderBy',
  parse: (directive: DirectiveNode, field: FieldNode, context: ParseContext) => {
    const columnArg = directive.arguments?.find(arg => arg.name.value === 'column');
    const directionArg = directive.arguments?.find(arg => arg.name.value === 'direction');
    
    if (columnArg && columnArg.value.kind === 'StringValue') {
      const column = columnArg.value.value;
      const direction = directionArg && directionArg.value.kind === 'StringValue' ? 
        directionArg.value.value : 'asc';
      
      const tableName = context.table || 'data';
      logger.debug(LogModules.DIRECTIVE_PARSER, 'Applying orderBy directive', { 
        column,
        direction,
        fullColumn: `${tableName}.${column}`
      });
      context.query = context.query.orderBy(`${tableName}.${column}`, direction);
    }
  }
};

export const whereDirectiveParser: DirectiveParser = {
  name: 'where',
  parse: (directive: DirectiveNode, field: FieldNode, context: ParseContext) => {
    const columnArg = directive.arguments?.find(arg => arg.name.value === 'column');
    const valueArg = directive.arguments?.find(arg => arg.name.value === 'value');
    const operatorArg = directive.arguments?.find(arg => arg.name.value === 'operator');
    
    if (columnArg && columnArg.value.kind === 'StringValue' && valueArg) {
      const column = columnArg.value.value;
      const operator = operatorArg && operatorArg.value.kind === 'StringValue' ? 
        operatorArg.value.value : '=';
      
      const tableName = context.table || 'data';
      
      // Handle different value types
      let value: any;
      if (valueArg.value.kind === 'StringValue') {
        value = valueArg.value.value;
      } else if (valueArg.value.kind === 'IntValue') {
        value = parseInt(valueArg.value.value, 10);
      } else if (valueArg.value.kind === 'FloatValue') {
        value = parseFloat(valueArg.value.value);
      } else if (valueArg.value.kind === 'BooleanValue') {
        value = valueArg.value.value;
      }
      
      logger.debug(LogModules.DIRECTIVE_PARSER, 'Applying where directive', {
        column,
        operator,
        value,
        valueType: valueArg.value.kind,
        fullColumn: `${tableName}.${column}`
      });
      
      context.query = context.query.where(`${tableName}.${column}`, operator, value);
    }
  }
};

// Export all basic directive parsers
export const basicDirectiveParsers: DirectiveParser[] = [
  limitDirectiveParser,
  offsetDirectiveParser,
  orderByDirectiveParser,
  whereDirectiveParser
];