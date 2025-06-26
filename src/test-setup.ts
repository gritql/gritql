// Test setup and utilities
import { jest } from '@jest/globals';

// Mock Knex for testing
jest.mock('knex', () => {
  const createMockQueryBuilder = () => {
    const mockQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      sum: jest.fn().mockReturnThis(),
      avg: jest.fn().mockReturnThis(),
      max: jest.fn().mockReturnThis(),
      min: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      rightJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      as: jest.fn().mockReturnThis(),
      toQuery: jest.fn().mockReturnValue('SELECT * FROM test'),
      toString: jest.fn().mockReturnValue('SELECT * FROM test'),
    };

    // Make it thenable by implementing then/catch/finally
    mockQueryBuilder.then = jest.fn((resolve?: any, reject?: any) => {
      const result = [{ count: 1, result: 'mock' }];
      const promise = Promise.resolve(result);
      if (resolve) return promise.then(resolve, reject);
      return promise;
    });
    
    mockQueryBuilder.catch = jest.fn((reject: any) => {
      return Promise.resolve([{ count: 1, result: 'mock' }]).catch(reject);
    });
    
    mockQueryBuilder.finally = jest.fn((fn: any) => {
      return Promise.resolve([{ count: 1, result: 'mock' }]).finally(fn);
    });

    return mockQueryBuilder;
  };

  return {
    __esModule: true,
    default: jest.fn(() => ({
      queryBuilder: createMockQueryBuilder,
    })),
  };
});

// Helper to create simple test GraphQL queries
export const createTestQuery = (query: string) => `
  query {
    ${query}
  }
`;

// Helper to create mock Knex instance
export const createMockKnex = () => {
  const createMockQueryBuilder = () => {
    const mockQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      sum: jest.fn().mockReturnThis(),
      avg: jest.fn().mockReturnThis(),
      max: jest.fn().mockReturnThis(),
      min: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      rightJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      as: jest.fn().mockReturnThis(),
      toQuery: jest.fn().mockReturnValue('SELECT * FROM test'),
      toString: jest.fn().mockReturnValue('SELECT * FROM test'),
    };

    // Make it thenable by implementing then/catch/finally
    mockQueryBuilder.then = jest.fn((resolve?: any, reject?: any) => {
      const result = [{ count: 1, result: 'mock' }];
      const promise = Promise.resolve(result);
      if (resolve) return promise.then(resolve, reject);
      return promise;
    });
    
    mockQueryBuilder.catch = jest.fn((reject: any) => {
      return Promise.resolve([{ count: 1, result: 'mock' }]).catch(reject);
    });
    
    mockQueryBuilder.finally = jest.fn((fn: any) => {
      return Promise.resolve([{ count: 1, result: 'mock' }]).finally(fn);
    });

    return mockQueryBuilder;
  };

  return {
    queryBuilder: createMockQueryBuilder,
  } as any;
};