export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

interface LoggerConfig {
  level: LogLevel;
  modules: {
    [moduleName: string]: LogLevel;
  };
  enabled: boolean;
}

class Logger {
  private config: LoggerConfig = {
    level: LogLevel.NONE,
    modules: {},
    enabled: false,
  };

  constructor() {
    this.initFromEnv();
  }

  private initFromEnv(): void {
    // Check if logging is enabled via env
    if (process.env.GRITQL_LOG_ENABLED === 'true') {
      this.config.enabled = true;
    }

    // Set log level from env
    if (process.env.GRITQL_LOG_LEVEL) {
      const levelStr = process.env.GRITQL_LOG_LEVEL.toUpperCase();
      const level = LogLevel[levelStr as keyof typeof LogLevel];
      if (level !== undefined) {
        this.config.level = level;
      }
    }

    // Parse module-specific levels
    if (process.env.GRITQL_LOG_MODULES) {
      const modules = process.env.GRITQL_LOG_MODULES.split(',');
      modules.forEach(module => {
        const [name, levelStr] = module.split(':');
        if (name && levelStr) {
          const level = LogLevel[levelStr.toUpperCase() as keyof typeof LogLevel];
          if (level !== undefined) {
            // Convert kebab-case to constant format
            const moduleName = name.replace(/-/g, '_').toUpperCase();
            const moduleKey = Object.entries(LogModules).find(([key, value]) => 
              value === name || key === moduleName
            )?.[1];
            
            if (moduleKey) {
              this.config.modules[moduleKey] = level;
            }
          }
        }
      });
    }
  }

  private formatMessage(level: string, module: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] [${module}] ${message}${dataStr}`;
  }

  private shouldLog(module: string, level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    
    const moduleLevel = this.config.modules[module] ?? this.config.level;
    return level <= moduleLevel;
  }

  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  setModuleLevel(module: string, level: LogLevel): void {
    this.config.modules[module] = level;
  }

  error(module: string, message: string, data?: any): void {
    if (this.shouldLog(module, LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', module, message, data));
    }
  }

  warn(module: string, message: string, data?: any): void {
    if (this.shouldLog(module, LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', module, message, data));
    }
  }

  info(module: string, message: string, data?: any): void {
    if (this.shouldLog(module, LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', module, message, data));
    }
  }

  debug(module: string, message: string, data?: any): void {
    if (this.shouldLog(module, LogLevel.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', module, message, data));
    }
  }

  trace(module: string, message: string, data?: any): void {
    if (this.shouldLog(module, LogLevel.TRACE)) {
      console.log(this.formatMessage('TRACE', module, message, data));
    }
  }
}

export const LogModules = {
  WALKER: 'walker',
  FILTER_PARSER: 'filter-parser',
  DIMENSION_PARSER: 'dimension-parser',
  METRIC_PARSER: 'metric-parser',
  DIRECTIVE_PARSER: 'directive-parser',
  QUERY_BUILDER: 'query-builder',
  RESULT_CONVERTER: 'result-converter',
} as const;

export const logger = new Logger();