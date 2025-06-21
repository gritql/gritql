# GraphQL to SQL Library Project Plan

## Overview
Building a new GraphQL to SQL library that uses the intent library for query building. The library will be highly extensible with a plugin architecture and lean implementation.

## Architecture

### Core Flow
1. Parse GraphQL query into AST
2. Walk AST and build intent query
3. Finalize query
4. Execute query against database
5. Get result from database
6. Walk AST and build converter
7. Convert result into GraphQL response structure

### Key Components

#### 1. Core System
- **Parser**: Use existing GraphQL parser to get AST
- **Walker**: Walk AST nodes and dispatch to parsers
- **Query Builder**: Build intent queries using the intent library
- **Executor**: Execute queries against database
- **Converter**: Convert database results to GraphQL structure

#### 2. Plugin System
Plugin hooks at various stages:
- **beforeParse**: Modify GraphQL query before parsing
- **afterParse**: Modify AST after parsing
- **beforeBuild**: Modify context before building query
- **afterBuild**: Modify intent query after building
- **beforeFinalize**: Modify query before finalization
- **beforeExecute**: Modify finalized query before execution
- **afterExecute**: Modify raw database results
- **beforeConvert**: Prepare for conversion
- **duringConvert**: Row-level conversion hooks
- **afterConvert**: Modify final result

#### 3. Parsers
- **Metric Parsers**: Parse scalar fields (SUM, COUNT, AVG, etc.)
- **Dimension Parsers**: Parse object fields (GROUP BY, etc.)
- **Directive Parsers**: Parse GraphQL directives

#### 4. Provider System
Intent library is using knex that is supporting different database providers. so that should be covered - support multiple database providers (PostgreSQL, MySQL, etc.)

## TODO List

### Phase 1: Core Infrastructure
- [x] Create basic project structure
- [x] Set up TypeScript configuration
- [x] Create core types and interfaces
- [x] Implement plugin system architecture
- [ ] Create parser registry for metrics/dimensions

### Phase 2: AST Walking and Query Building
- [ ] Implement AST walker
- [ ] Create basic metric parser
- [ ] Create basic dimension parser
- [ ] Integrate with intent library for query building
- [ ] Handle nested selections

### Phase 3: Execution and Conversion
- [ ] Implement query executor
- [ ] Create result converter
- [ ] Handle nested object conversion
- [ ] Support array results

### Phase 4: Directive System
- [ ] Parse GraphQL directives
- [ ] Implement directive hooks
- [ ] Create directive registry

### Phase 5: Provider Support
- [ ] Abstract database operations
- [ ] Create PostgreSQL provider
- [ ] Add provider registry

### Phase 6: Advanced Features
- [ ] Support fragments
- [ ] Support variables
- [ ] Support aliases
- [ ] Support filters and arguments

### Phase 7: Testing and Documentation
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Create documentation
- [ ] Add examples

## File Structure
```
src/
├── index.ts              # Main entry point
├── types.ts              # Core type definitions
├── core/
│   ├── parser.ts         # AST parser wrapper
│   ├── walker.ts         # AST walker
│   ├── builder.ts        # Query builder
│   ├── executor.ts       # Query executor
│   └── converter.ts      # Result converter
├── plugins/
│   ├── plugin.ts         # Plugin system
│   └── registry.ts       # Plugin registry
├── parsers/
│   ├── metric.ts         # Metric parsers
│   ├── dimension.ts      # Dimension parsers
│   └── directive.ts      # Directive parsers
├── providers/
│   ├── provider.ts       # Provider interface
│   └── postgres.ts       # PostgreSQL provider
└── utils/
    └── helpers.ts        # Utility functions
```

## Design Principles
1. **Simplicity**: Keep each component focused and minimal
2. **Extensibility**: Everything should be pluggable
3. **Type Safety**: Leverage TypeScript for safety
4. **Immutability**: Prefer immutable operations
5. **Testability**: Design for easy testing

## Next Steps
1. Review this plan
2. Start with Phase 1: Core Infrastructure
3. Implement incrementally, testing each component