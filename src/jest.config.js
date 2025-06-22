module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.d.ts',
    '!**/__tests__/**',
    '!jest.config.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
};