import { createGritQL } from '../../index';
import { createTestQuery, createMockKnex } from '../setup';

describe('GritQL Basic Integration', () => {
  it('should create GritQL instance', () => {
    const gritql = createGritQL();
    expect(gritql).toBeDefined();
    expect(typeof gritql.query).toBe('function');
    expect(typeof gritql.use).toBe('function');
  });

  it('should handle basic GraphQL query parsing', async () => {
    // Test basic functionality without the full pipeline
    const { parse } = require('graphql');
    const query = `query { count }`;
    
    // Test 1: GraphQL parsing works
    const ast = parse(query);
    expect(ast).toBeDefined();
    expect(ast.definitions).toHaveLength(1);
    
    // Test 2: GritQL instance can be created
    const gritql = createGritQL();
    expect(gritql).toBeDefined();
    expect(typeof gritql.query).toBe('function');
    
    // Test 3: Query builder creation works
    const { query: createQueryBuilder } = require('../../intent');
    const queryBuilder = createQueryBuilder();
    expect(queryBuilder).toBeDefined();
    expect(typeof queryBuilder.getSteps).toBe('function');
    
    // Test 4: Basic query builder operations
    const builder = queryBuilder.select('count');
    expect(builder.getSteps()).toHaveLength(1);
    expect(builder.getSteps()[0].type).toBe('select');
  });
});