import { countParser, sumParser, avgParser, minParser, maxParser } from '../../parsers/metric';
import { ParseContext } from '../../types';
import { query } from '../../intent';
import { Kind } from 'graphql';

describe('Metric Parsers', () => {
  let mockContext: ParseContext;

  beforeEach(() => {
    mockContext = {
      query: query(),
      variables: {},
      fragments: {},
      path: ['users']
    };
  });

  describe('countParser', () => {
    it('should parse count field', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'count' }
      } as any;

      countParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps).toHaveLength(1);
      expect(steps[0]).toEqual({
        type: 'count',
        args: ['users.*', 'count']
      });
    });

    it('should use alias when provided', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'count' },
        alias: { kind: Kind.NAME, value: 'total_users' }
      } as any;

      mockContext.query = query(); // Reset query builder
      countParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps[0].args[1]).toBe('total_users');
    });
  });

  describe('sumParser', () => {
    it('should parse sum field with column argument', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'sum' },
        arguments: [{
          kind: Kind.ARGUMENT,
          name: { kind: Kind.NAME, value: 'column' },
          value: { kind: Kind.STRING, value: 'amount' }
        }]
      } as any;

      mockContext.query = query(); // Reset query builder
      sumParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps[0]).toEqual({
        type: 'sum',
        args: ['users.amount', 'sum']
      });
    });

    it('should derive column from field name', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'sum_revenue' }
      } as any;

      mockContext.query = query(); // Reset query builder
      sumParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps[0].args[0]).toBe('users.revenue');
    });
  });

  describe('avgParser', () => {
    it('should parse avg field', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'avg_score' }
      } as any;

      mockContext.query = query(); // Reset query builder
      avgParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps[0]).toEqual({
        type: 'avg',
        args: ['users.score', 'avg_score']
      });
    });
  });

  describe('minParser', () => {
    it('should parse min field', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'min_age' }
      } as any;

      mockContext.query = query(); // Reset query builder
      minParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps[0]).toEqual({
        type: 'min',
        args: ['users.age', 'min_age']
      });
    });
  });

  describe('maxParser', () => {
    it('should parse max field', () => {
      const field = {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: 'max_salary' }
      } as any;

      mockContext.query = query(); // Reset query builder
      maxParser.parse(field, mockContext);
      
      const steps = mockContext.query.getSteps();
      expect(steps[0]).toEqual({
        type: 'max',
        args: ['users.salary', 'max_salary']
      });
    });
  });
});