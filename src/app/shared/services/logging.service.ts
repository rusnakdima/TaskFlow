import { Injectable, signal, inject } from "@angular/core";
import { environment } from "../../../environments/environment";

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  operation: string;
  request_id: string;
  user_id: string | null;
  duration_ms: number | null;
  data: unknown;
  error: { message: string; stack?: string } | null;
}

@Injectable({ providedIn: "root" })
export class LoggingService {
  private static readonly LOG_BUFFER_SIZE = 100;
  private static readonly LOG_FLUSH_INTERVAL = 5000;

  private static requestId: string | null = null;
  private static userId: string | null = null;

  private readonly _logs = signal<LogEntry[]>([]);
  private _logFlushTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly logs = this._logs.asReadonly();

  private shouldLog(level: LogLevel): boolean {
    if (environment.logEnabled === false) return false;
    switch (level) {
      case LogLevel.DEBUG:
        return environment.logDebug === true;
      case LogLevel.INFO:
        return environment.logInfo === true;
      case LogLevel.WARN:
        return environment.logWarn === true;
      case LogLevel.ERROR:
        return environment.logError === true;
      default:
        return false;
    }
  }

  private createErrorObj(error: unknown): { message: string; stack?: string } | null {
    if (error instanceof Error) {
      return { message: error.message, stack: error.stack };
    }
    if (typeof error === "object" && error !== null && "message" in error) {
      return { message: (error as { message: string }).message };
    }
    return null;
  }

  private queueLog(entry: LogEntry): void {
    this._logs.update((logs) => [...logs, entry].slice(-LoggingService.LOG_BUFFER_SIZE));
    if (this._logs().length >= LoggingService.LOG_BUFFER_SIZE) {
      this.flushLogs();
    } else {
      this.scheduleLogFlush();
    }
  }

  private scheduleLogFlush(): void {
    if (this._logFlushTimeout) return;
    this._logFlushTimeout = setTimeout(() => {
      this._logFlushTimeout = null;
      this.flushLogs();
    }, LoggingService.LOG_FLUSH_INTERVAL);
  }

  private flushLogs(): void {
    const logs = this._logs();
    if (logs.length === 0) return;
    for (const entry of logs) {
      const prefix = `[TaskFlow][${entry.level}][${entry.service}]`;
      const message = `${entry.operation} (${entry.request_id})`;
      switch (entry.level) {
        case LogLevel.ERROR:
          console.error(prefix, message, {
            user_id: entry.user_id,
            duration_ms: entry.duration_ms,
            data: entry.data,
            error: entry.error,
          });
          break;
        case LogLevel.WARN:
          console.warn(prefix, message, {
            user_id: entry.user_id,
            duration_ms: entry.duration_ms,
            data: entry.data,
            error: entry.error,
          });
          break;
        case LogLevel.INFO:
          console.info(prefix, message, {
            user_id: entry.user_id,
            duration_ms: entry.duration_ms,
            data: entry.data,
          });
          break;
        default:
          console.log(prefix, message, {
            user_id: entry.user_id,
            duration_ms: entry.duration_ms,
            data: entry.data,
          });
      }
    }
    this._logs.set([]);
  }

  error(
    service: string,
    operation: string,
    data?: unknown,
    error?: unknown,
    durationMs?: number
  ): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      service,
      operation,
      request_id: LoggingService.requestId || this.generateRequestId(),
      user_id: LoggingService.userId,
      duration_ms: durationMs ?? null,
      data,
      error: this.createErrorObj(error),
    });
  }

  info(service: string, operation: string, data?: unknown, durationMs?: number): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      service,
      operation,
      request_id: LoggingService.requestId || this.generateRequestId(),
      user_id: LoggingService.userId,
      duration_ms: durationMs ?? null,
      data,
      error: null,
    });
  }

  warn(service: string, operation: string, data?: unknown, durationMs?: number): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      service,
      operation,
      request_id: LoggingService.requestId || this.generateRequestId(),
      user_id: LoggingService.userId,
      duration_ms: durationMs ?? null,
      data,
      error: null,
    });
  }

  debug(service: string, operation: string, data?: unknown, durationMs?: number): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    this.queueLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      service,
      operation,
      request_id: LoggingService.requestId || this.generateRequestId(),
      user_id: LoggingService.userId,
      duration_ms: durationMs ?? null,
      data,
      error: null,
    });
  }

  clearLogs(): void {
    this._logs.set([]);
  }

  static generateRequestId(): string {
    return crypto.randomUUID();
  }

  static setRequestId(id: string): void {
    LoggingService.requestId = id;
  }

  static getRequestId(): string | null {
    return LoggingService.requestId;
  }

  static setUserId(id: string | null): void {
    LoggingService.userId = id;
  }

  static getUserId(): string | null {
    return LoggingService.userId;
  }

  static createLogger(context: string) {
    return {
      debug: (op: string, data?: unknown) => inject(LoggingService).debug(`${context} ${op}`, data),
      info: (op: string, data?: unknown) => inject(LoggingService).info(`${context} ${op}`, data),
      warn: (op: string, data?: unknown) => inject(LoggingService).warn(`${context} ${op}`, data),
      error: (op: string, data?: unknown, err?: unknown) =>
        inject(LoggingService).error(`${context} ${op}`, data, err),
    };
  }

  static startOperation(service: string, operation: string, data?: unknown): () => void {
    const startTime = Date.now();
    inject(LoggingService).debug(`${service} ${operation} START`, data);
    return () => {
      const duration = Date.now() - startTime;
      inject(LoggingService).debug(`${service} ${operation} END`, { duration_ms: duration });
    };
  }
}
