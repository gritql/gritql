import { logger, LogLevel, LogModules } from '../index'

// Example 1: Enable logging globally with INFO level
logger.setEnabled(true)
logger.setLevel(LogLevel.INFO)

// Example 2: Enable detailed logging for specific modules
logger.setEnabled(true)
logger.setLevel(LogLevel.WARN)  // Default level for all modules
logger.setModuleLevel(LogModules.WALKER, LogLevel.DEBUG)  // More verbose for walker
logger.setModuleLevel(LogModules.FILTER_PARSER, LogLevel.TRACE)  // Most verbose for filters

// Example 3: Configure logger with object
logger.configure({
  enabled: true,
  level: LogLevel.INFO,
  modules: {
    [LogModules.WALKER]: LogLevel.DEBUG,
    [LogModules.METRIC_PARSER]: LogLevel.TRACE,
    [LogModules.DIMENSION_PARSER]: LogLevel.DEBUG,
    [LogModules.FILTER_PARSER]: LogLevel.WARN,
    [LogModules.DIRECTIVE_PARSER]: LogLevel.INFO,
  }
})

// Example 4: Disable logging completely
logger.setEnabled(false)

// Example 5: Enable only error logging
logger.configure({
  enabled: true,
  level: LogLevel.ERROR,
  modules: {}
})

/**
 * Log levels:
 * - NONE (0): No logging
 * - ERROR (1): Only errors
 * - WARN (2): Warnings and errors
 * - INFO (3): General information, warnings, and errors
 * - DEBUG (4): Detailed information for debugging
 * - TRACE (5): Very detailed trace information
 * 
 * Available modules:
 * - WALKER: AST walking and query building
 * - FILTER_PARSER: Filter parsing and application
 * - DIMENSION_PARSER: Dimension field parsing
 * - METRIC_PARSER: Metric field parsing
 * - DIRECTIVE_PARSER: GraphQL directive parsing
 * - QUERY_BUILDER: SQL query building (if added)
 * - RESULT_CONVERTER: Result conversion (if added)
 */