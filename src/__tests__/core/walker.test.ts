import { ASTWalker } from '../../core/walker';
import { countParser, sumParser } from '../../parsers/metric';
import { groupParser } from '../../parsers/dimension';
import { limitDirectiveParser } from '../../parsers/directive';
import { query } from '../../intent';
import { parse } from 'graphql';

describe('ASTWalker', () => {
  let walker: ASTWalker;
  let mockQueryBuilder: any;

  beforeEach(() => {
    walker = new ASTWalker([countParser, sumParser], [groupParser], [limitDirectiveParser]);
    mockQueryBuilder = query();
  });

  it('should create walker with parsers', () => {
    expect(walker).toBeDefined();
    const registered = walker.getRegisteredParsers();
    expect(registered.metrics).toContain('count');
    expect(registered.metrics).toContain('sum');
    expect(registered.dimensions).toContain('group');
    expect(registered.directives).toContain('limit');
  });

  it('should add parsers dynamically', () => {
    walker.addMetricParser({
      name: 'avg',
      parse: jest.fn()
    });

    const registered = walker.getRegisteredParsers();
    expect(registered.metrics).toContain('avg');
  });

  it('should process basic field selection', () => {
    const testQuery = parse(`
      query {
        name
        email
      }
    `);

    const context = {
      query: query(),
      variables: {},
      fragments: {},
      path: []
    };

    walker.walk(testQuery, context);
    
    const steps = context.query.getSteps();
    expect(steps.length).toBe(2);
    expect(steps[0].type).toBe('select');
    expect(steps[0].args[0]).toBe('data.name');
    expect(steps[1].type).toBe('select');
    expect(steps[1].args[0]).toBe('data.email');
  });

  it('should walk simple GraphQL document', () => {
    const testQuery = parse(`
      query {
        users {
          count
        }
      }
    `);

    const context = {
      query: mockQueryBuilder,
      variables: {},
      fragments: {},
      path: []
    };

    walker.walk(testQuery, context);
    
    const steps = context.query.getSteps();
    expect(steps.length).toBeGreaterThan(0);
    // Check that count parser was invoked
    const countStep = steps.find((step: any) => step.type === 'count');
    expect(countStep).toBeDefined();
  });

  it('should process fields with directives', () => {
    const query = parse(`
      query {
        users {
          count @limit(count: 10)
        }
      }
    `);

    const context = {
      query: mockQueryBuilder,
      variables: {},
      fragments: {},
      path: []
    };

    walker.walk(query, context);
    
    const steps = context.query.getSteps();
    const limitStep = steps.find((step: any) => step.type === 'limit');
    expect(limitStep).toBeDefined();
    expect(limitStep?.args[0]).toBe(10);
  });
});