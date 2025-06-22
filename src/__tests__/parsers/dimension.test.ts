import { groupParser, selectParser, distinctParser } from '../../parsers/dimension';
import { ParseContext } from '../../types';
import { query } from '../../intent';
import { Kind } from 'graphql';

describe('Dimension Parsers', () => {
  let mockContext: ParseContext;

  beforeEach(() => {
    mockContext = {
      query: query(),
      variables: {},
      fragments: {},
      path: ['products']
    };
  });

  describe('groupParser', () => {
    it('should parse group field', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'category' }
      } as any;

      groupParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps).toHaveLength(2);
      expect(steps[0]).toEqual({
        type: 'select',
        args: ['products.category', 'category']
      });
      expect(steps[1]).toEqual({
        type: 'groupBy',
        args: ['products.category']
      });
    });

    it('should use column argument when provided', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'group' },
        arguments: [{
          kind: Kind.ARGUMENT,
          name: { kind: Kind.NAME, value: 'column' },
          value: { kind: Kind.STRING, value: 'department' }
        }]
      } as any;

      mockContext.query = query(); // Reset
      groupParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps[0].args[0]).toBe('products.department');
      expect(steps[1].args[0]).toBe('products.department');
    });
  });

  describe('selectParser', () => {
    it('should parse select field', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'name' }
      } as any;

      mockContext.query = query(); // Reset
      selectParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps).toHaveLength(1);
      expect(steps[0]).toEqual({
        type: 'select',
        args: ['products.name', 'name']
      });
    });

    it('should use alias when provided', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'name' },
        alias: { kind: Kind.NAME, value: 'product_name' }
      } as any;

      mockContext.query = query(); // Reset
      selectParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps[0].args[1]).toBe('product_name');
    });
  });

  describe('distinctParser', () => {
    it('should parse distinct field', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'distinct_category' }
      } as any;

      mockContext.query = query(); // Reset
      distinctParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps).toHaveLength(1);
      expect(steps[0]).toEqual({
        type: 'distinct',
        args: ['products.category', 'distinct_category']
      });
    });

    it('should use column argument when provided', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'distinct' },
        arguments: [{
          kind: Kind.ARGUMENT,
          name: { kind: Kind.NAME, value: 'column' },
          value: { kind: Kind.STRING, value: 'status' }
        }]
      } as any;

      mockContext.query = query(); // Reset
      distinctParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps[0].args[0]).toBe('products.status');
    });
  });
});