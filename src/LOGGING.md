# GritQL Logging System

GritQL includes a flexible logging system that helps debug the parsing and query building process.

## Quick Start

```typescript
import { logger, LogLevel, LogModules } from 'gritql'

// Enable logging with INFO level
logger.setEnabled(true)
logger.setLevel(LogLevel.INFO)
```

## Log Levels

- `LogLevel.NONE` (0) - No logging
- `LogLevel.ERROR` (1) - Only errors
- `LogLevel.WARN` (2) - Warnings and errors  
- `LogLevel.INFO` (3) - General information
- `LogLevel.DEBUG` (4) - Detailed debugging information
- `LogLevel.TRACE` (5) - Very detailed trace information

## Modules

- `LogModules.WALKER` - AST walking and query building
- `LogModules.FILTER_PARSER` - Filter parsing and SQL generation
- `LogModules.DIMENSION_PARSER` - Dimension field parsing
- `LogModules.METRIC_PARSER` - Metric field parsing  
- `LogModules.DIRECTIVE_PARSER` - GraphQL directive parsing

## Configuration Examples

### Enable detailed logging for debugging

```typescript
logger.configure({
  enabled: true,
  level: LogLevel.DEBUG,
  modules: {
    [LogModules.WALKER]: LogLevel.TRACE,
    [LogModules.FILTER_PARSER]: LogLevel.DEBUG
  }
})
```

### Enable logging for specific module only

```typescript
logger.setEnabled(true)
logger.setLevel(LogLevel.NONE)  // Disable all by default
logger.setModuleLevel(LogModules.WALKER, LogLevel.DEBUG)  // Enable only walker
```

### Production configuration

```typescript
logger.configure({
  enabled: true,
  level: LogLevel.ERROR,  // Only log errors
  modules: {}
})
```

## Log Output Format

Logs are output in the format:
```
[timestamp] [level] [module] message {data}
```

Example:
```
[2024-12-26T10:30:45.123Z] [INFO] [walker] Starting AST walk { documentType: 'Document' }
[2024-12-26T10:30:45.124Z] [DEBUG] [walker] Processing operation { operationType: 'query', tableName: 'users' }
```

## Environment Variables

You can control logging via environment variables:

```bash
GRITQL_LOG_ENABLED=true
GRITQL_LOG_LEVEL=debug
GRITQL_LOG_MODULES=walker:info,filter-parser:debug
```

Module names in environment variables can use either format:
- Kebab case: `walker`, `filter-parser`, `dimension-parser`
- Constant case: `WALKER`, `FILTER_PARSER`, `DIMENSION_PARSER`

Example usage:
```bash
GRITQL_LOG_ENABLED=true GRITQL_LOG_LEVEL=warn GRITQL_LOG_MODULES=walker:info,filter-parser:trace ts-node manual_test.ts
```