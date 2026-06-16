export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
}

export class InMemoryLoggerService {
  private static instance: InMemoryLoggerService;
  private logs: LogEntry[] = [];
  private maxEntries = 1000;
  private currentLevel: LogLevel = LogLevel.Info;

  private constructor() {}

  static getInstance(): InMemoryLoggerService {
    if (!InMemoryLoggerService.instance) {
      InMemoryLoggerService.instance = new InMemoryLoggerService();
    }
    return InMemoryLoggerService.instance;
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.currentLevel;
  }

  private addLog(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxEntries) {
      this.logs.shift();
    }
  }

  debug(message: string, context?: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.Debug)) {
      const entry: LogEntry = {
        timestamp: new Date(),
        level: LogLevel.Debug,
        message,
        context,
        data,
      };
      this.addLog(entry);
      console.debug(`[DEBUG] ${context ? `[${context}] ` : ""}${message}`, data ?? "");
    }
  }

  info(message: string, context?: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.Info)) {
      const entry: LogEntry = {
        timestamp: new Date(),
        level: LogLevel.Info,
        message,
        context,
        data,
      };
      this.addLog(entry);
      console.info(`[INFO] ${context ? `[${context}] ` : ""}${message}`, data ?? "");
    }
  }

  warn(message: string, context?: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.Warn)) {
      const entry: LogEntry = {
        timestamp: new Date(),
        level: LogLevel.Warn,
        message,
        context,
        data,
      };
      this.addLog(entry);
      console.warn(`[WARN] ${context ? `[${context}] ` : ""}${message}`, data ?? "");
    }
  }

  error(message: string, context?: string, data?: unknown): void {
    if (this.shouldLog(LogLevel.Error)) {
      const entry: LogEntry = {
        timestamp: new Date(),
        level: LogLevel.Error,
        message,
        context,
        data,
      };
      this.addLog(entry);
      console.error(`[ERROR] ${context ? `[${context}] ` : ""}${message}`, data ?? "");
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  getLogsByContext(context: string): LogEntry[] {
    return this.logs.filter((log) => log.context === context);
  }
}

export const loggerService = LoggerService.getInstance();
