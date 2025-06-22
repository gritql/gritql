import { FieldNode } from 'graphql';
import { DimensionParser, ParseContext } from '../types';

/**
 * Basic dimension parsers for SQL grouping and selection
 */

export const groupParser: DimensionParser = {
  name: 'group',
  parse: (field: FieldNode, context: ParseContext) => {
    const alias = field.alias?.value || field.name.value;
    const tableName = context.path.length > 0 ? context.path[0] : 'data';
    
    // Get the column name from field arguments or name
    const columnArg = field.arguments?.find(arg => arg.name.value === 'column');
    const columnName = columnArg ? 
      (columnArg.value as any).value : 
      field.name.value;
    
    const fullColumnName = `${tableName}.${columnName}`;
    
    // Add to select and group by
    context.query = context.query.select(fullColumnName, alias);
    context.query = context.query.groupBy(fullColumnName);
  }
};

export const selectParser: DimensionParser = {
  name: 'select',
  parse: (field: FieldNode, context: ParseContext) => {
    const alias = field.alias?.value || field.name.value;
    const tableName = context.path.length > 0 ? context.path[0] : 'data';
    
    // Get the column name from field arguments or name
    const columnArg = field.arguments?.find(arg => arg.name.value === 'column');
    const columnName = columnArg ? 
      (columnArg.value as any).value : 
      field.name.value;
    
    const fullColumnName = `${tableName}.${columnName}`;
    
    // Add to select only
    context.query = context.query.select(fullColumnName, alias);
  }
};

export const distinctParser: DimensionParser = {
  name: 'distinct',
  parse: (field: FieldNode, context: ParseContext) => {
    const alias = field.alias?.value || field.name.value;
    const tableName = context.path.length > 0 ? context.path[0] : 'data';
    
    const columnArg = field.arguments?.find(arg => arg.name.value === 'column');
    const columnName = columnArg ? 
      (columnArg.value as any).value : 
      field.name.value.replace('distinct_', '');
    
    const fullColumnName = `${tableName}.${columnName}`;
    
    // Add distinct select
    context.query = context.query.distinct(fullColumnName, alias);
  }
};

// Export all basic dimension parsers
export const basicDimensionParsers: DimensionParser[] = [
  groupParser,
  selectParser,
  distinctParser
];