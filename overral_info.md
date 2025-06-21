# GritQL4 Codebase Overview

This document provides a comprehensive overview of the GritQL4 prototype codebase, analyzing each file's purpose and role in the refactored architecture.

## Context and Goals

Based on the original GritQL repository and test files, GritQL is a GraphQL-like query language for SQL databases that:

1. **Provides GraphQL syntax for SQL queries** - Uses GraphQL-like queries to generate SQL
2. **Supports metrics and dimensions** - Built-in aggregation functions and dimensional grouping
3. **Handles multiple database providers** - PostgreSQL, Snowflake, Google Analytics
4. **Query optimization and merging** - Combines multiple queries for efficient execution
5. **Type safety** - Strong typing support with variable validation

The prototype follows a modular, plugin-based architecture similar to the user's provided example.

## File-by-File Analysis

### Root Files

#### `/query-combiner.ts`
**Purpose**: Legacy query combination utility
**Summary**: Simple function that merges query metadata (table, joins, filters, etc.) from a cloned query into the main query. This is likely what needs to be refactored into the new architecture.

### Core Engine (`/src/`)

#### `/src/gritql.ts`
**Purpose**: Main GritQL engine implementation
**Summary**: 
- Primary `GritQL` class that orchestrates the entire query processing pipeline
- Implements the `queryParser` method that processes GraphQL AST into executable queries
- Manages source providers (PostgreSQL, Snowflake, etc.)
- Handles query execution, variable validation, and type checking
- Uses a plugin system where providers can be registered with `.use(provider)`
- Core architecture matches the user's desired pattern: `gritql.use(provider)`

#### `/src/QueryBuilder.ts`
**Purpose**: Query instruction builder and executor
**Summary**:
- `Query` class that stores query instructions as JSON operations
- Implements a command pattern where operations are queued and executed in priority order
- Each instruction has a provider, arguments, and priority
- Supports query duplication and async rendering
- Acts as an abstraction layer between GraphQL AST and SQL generation

#### `/src/depricated_gritql.ts`
**Purpose**: Older implementation (deprecated)
**Summary**:
- Earlier version of the GritQL engine with similar structure
- Includes additional entity imports (Merger, QueryProcessor, etc.)
- Shows the evolution toward a more modular architecture
- Contains example usage and pipeline comments showing the intended flow

### Entity Abstractions (`/src/entities/`)

#### `/src/entities/SourceProvider.ts`
**Purpose**: Interface definition for data source providers
**Summary**:
- Defines the contract that all providers must implement
- Includes methods for query building, connection management, execution
- Supports keywords validation and instruction registration
- Enables provider-specific optimizations and transformations

#### `/src/entities/Merger.ts`
**Purpose**: Result merging functionality
**Summary**: 
- Currently empty class - placeholder for result merging logic
- Intended to combine results from multiple queries
- Part of the result processing pipeline

### Database Providers (`/src/providers/`)

#### `/src/providers/PostgresProvider.ts`
**Purpose**: PostgreSQL-specific implementation
**Summary**:
- Extends `KnexBasedSQLProvider` for PostgreSQL databases
- Implements SQL-specific instructions like filters, metrics, and dimensions
- Includes search functionality using PostgreSQL's full-text search
- Provides the `apply_filters` instruction for WHERE clause generation

#### `/src/providers/KnexBasedSQLProvider.ts`
**Purpose**: Base class for SQL database providers
**Summary**:
- Abstract base for SQL databases using Knex.js query builder
- Defines common SQL keywords and functionality
- Implements connection management and query execution patterns
- Provides the foundation for PostgreSQL and Snowflake providers

#### `/src/providers/SnowflakeProvider.ts`
**Purpose**: Snowflake data warehouse provider
**Summary**:
- Implements Snowflake-specific connection and execution logic
- Uses snowflake-sdk for database connectivity
- Supports pool-based connections
- Handles Snowflake's specific SQL dialect requirements

#### `/src/providers/GoogleAnalyticsProvider.ts`
**Purpose**: Google Analytics data source provider  
**Summary**:
- Non-SQL provider for Google Analytics data
- Transforms GritQL queries into GA API calls
- Handles GA-specific result transformation and error handling
- Shows how non-SQL providers can be integrated

#### `/src/providers/index.ts`
**Purpose**: Provider exports (currently empty)
**Summary**: Placeholder for provider module exports

### Instructions (`/src/Instructions/`)

#### `/src/Instructions/basic.ts`
**Purpose**: Basic SQL instruction implementations
**Summary**:
- Defines the `Instruction` type with name, priority, and validation specs
- Implements core SQL functions: `sum`, `min`, `max`, `median`, `count`, `share`, `indexed`, `divide`
- Each instruction includes SQL keyword requirements and argument validation
- Provides building blocks for metrics and dimensions

### Tests (`/src/__tests__/`)

#### `/src/__tests__/basic.spec.ts`
**Purpose**: Basic functionality tests
**Summary**:
- Tests simple query generation and SQL output
- Validates metric functions, array sorting, and dimension handling
- Uses snapshot testing to ensure SQL generation consistency
- Shows expected query patterns and usage

#### `/src/__tests__/variables_and_types.spec.ts`
**Purpose**: Type system and variable validation tests
**Summary**:
- Tests GraphQL type definitions (input, type, union)
- Validates variable substitution and type checking
- Tests complex type features like inheritance and directives
- Ensures type safety in query processing

## Architecture Patterns

The codebase follows several key patterns that align with the user's prototype:

### 1. Plugin Architecture
```typescript
const gritql = new GritQL()
gritql.use(postgresProvider)
gritql.use(snowflakeProvider)
```

### 2. Instruction-Based Query Building
- Queries are built using discrete instructions
- Each instruction has validation and priority
- Instructions are provider-specific but follow common interfaces

### 3. Multi-Provider Support
- Clean separation between SQL and non-SQL providers
- Provider-specific optimizations and transformations
- Consistent interface across different data sources

### 4. Type Safety
- Strong typing with PropTypes validation
- GraphQL type system integration
- Variable validation and transformation

## Refactoring Opportunities

Based on the current prototype and the user's desired architecture:

1. **Query Combiner**: The simple `combineQuery` function needs to be replaced with a more sophisticated merger that can handle the instruction-based architecture

2. **Result Processing Pipeline**: Need to implement the result processor chain as shown in the user's prototype

3. **Query Parser Enhancement**: The parser could benefit from the middleware pattern shown in the prototype

4. **Provider Registration**: The `.use()` pattern is already implemented but could be enhanced with the processor chain concept

The current codebase provides a solid foundation for the refactoring goals, with clear separation of concerns and extensible architecture.