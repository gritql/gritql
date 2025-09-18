# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Build**: `npm run build` - Compiles TypeScript to `dist/` directory
**Test**: `npm test` - Runs Jest test suite
**Test (Watch)**: `npm run test-dev` - Runs Jest in watch mode for development

## Architecture Overview

GritQL is a GraphQL-to-SQL query translation library that provides a GraphQL-like interface for SQL databases. The architecture follows a modular design with clear separation of concerns:

### Core Components

**Main Entry Point** (`index.ts`): Exports all public APIs including `gqlToDb`, types, resolvers, and wrappers.

**Query Builder** (`gql-sql-slicer.ts`): The heart of the library containing:

- `gqlToDb()` factory function that returns a configurable query executor
- `queryBuilder()` function that recursively processes GraphQL AST nodes
- `merge()` function that combines query results with proper data structure

**Parser** (`parser.ts`): Handles GraphQL AST parsing including:

- Type definitions and variable validation using PropTypes
- Fragment compilation and selection processing
- Argument processing with variable substitution

**Type System** (`types.ts`): Custom PropTypes implementation for runtime type validation of GraphQL variables and arguments.

### Resolver Architecture

**Metrics** (`metrics/index.ts`): SQL aggregation functions like `sum`, `count`, `avg`, `percentile`, ranking functions, and complex operations like `weightAvg` and `aggrAverage`.

**Dimensions** (`dimensions/index.ts`): Data grouping and categorization functions including `groupBy`, `groupByEach`, `combine`, and join operations.

**Wrappers** (`metrics/wrapper.ts`, `dimensions/wrapper.ts`): Higher-order functions that wrap resolver implementations with:

- PropTypes argument validation
- SQL dialect compatibility checking
- Database provider abstraction

### Data Processing Pipeline

1. **Parse**: GraphQL query → AST using `graphql-tag`
2. **Build**: AST → SQL queries via `queryBuilder()`
3. **Execute**: SQL queries → raw results via database providers
4. **Merge**: Raw results → structured data via `merge()` function

### Database Providers

**Provider System** (`providers/index.ts`): Abstraction layer supporting:

- PostgreSQL (via `postgres` driver)
- Snowflake (via `snowflake-sdk`)
- Custom providers through `useProvider()` API

**Cross-table Operations** (`cross-table.ts`): Handles table joins and relationships across different data sources.

### Filter System

**Filters** (`filters.ts`, `filter.ts`): Comprehensive filtering capabilities including:

- Basic comparison operators (`eq`, `gt`, `lt`, etc.)
- Complex filters (`in`, `between`, `regexp`)
- Advanced filter parsing and application
- Filter composition and nesting

### Key Patterns

**Directive System** (`directives/index.ts`): Provides GraphQL directive support for query customization and data transformation.

**Progressive Merging** (`progressive.ts`): Handles incremental data merging for complex nested query results.

**Query Combination** (`query-combiner.ts`): Merges multiple query objects while preserving SQL optimization opportunities.

## Testing

Uses Jest with TypeScript support (`ts-jest`). Test files follow the pattern `*.test.ts` and snapshot testing is used for query generation validation.

## Database Integration Notes

- Knex.js is used as the SQL query builder foundation
- Provider-specific SQL dialect differences are handled through the provider system
- Query optimization happens at the Knex level before SQL generation
- Window functions and advanced SQL features are supported where available

# Standard Workflow

1. First think through the problem, read the codebase for relevant files, and write a plan to projectplan.md
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan
4. Then, begin working on the todo items, marking them as complete as you go
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity
7. Finally, add a review section to the projectplan.md file with a summary of the changes you made and any other relevant information

# important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
