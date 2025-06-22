module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
  ],
  plugins: ['@typescript-eslint'],
  env: {
    node: true,
    jest: true,
  },
  rules: {
    // Keep it simple - just basic linting
    'no-unused-vars': 'warn',
    'prefer-const': 'error',
    'no-console': 'warn',
  },
  ignorePatterns: ['dist/', 'node_modules/'],
};