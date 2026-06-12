import { Injectable } from "@angular/core";
import { environment } from "../../environments/environment";

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

const LOG_PREFIX = "[TaskFlow]";
const LOG_FLUSH_INTERVAL = 5000;
const LOG_BUFFER_SIZE = 100;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  operation: string;
  request_id: string;
  user_id: string | null;
  duration_ms: number | null;
  data: any;
  error: { message: string; stack?: string } | null;
}

let logBuffer: LogEntry[] = [];
let requestId: string | null = null;
let userId: string | null = null;
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

export function generateRequestId(): string {
  return crypto.randomUUID();
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function createLogEntry(
  level: LogLevel,
  service: string,
  operation: string,
  data?: any,
  error?: { message: string; stack?: string } | null,
  durationMs?: number
): LogEntry {
  return {
    timestamp: getTimestamp(),
    level,
    service,
    operation,
    request_id: requestId || generateRequestId(),
    user_id: userId,
    duration_ms: durationMs ?? null,
    data: data ?? null,
    error: error ?? null,
  };
}

function flushLogs(): void {
  if (logBuffer.length === 0) return;

  const entries = [...logBuffer];
  logBuffer = [];

  for (const entry of entries) {
    const prefix = `${LOG_PREFIX}[${entry.level}][${entry.service}]`;
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
      case LogLevel.DEBUG:
      default:
        console.log(prefix, message, {
          user_id: entry.user_id,
          duration_ms: entry.duration_ms,
          data: entry.data,
        });
        break;
    }
  }
}

function scheduleFlush(): void {
  if (flushTimeout) return;
  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushLogs();
  }, LOG_FLUSH_INTERVAL);
}

function queueLog(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length >= LOG_BUFFER_SIZE) {
    flushLogs();
  } else {
    scheduleFlush();
  }
}

@Injectable({ providedIn: "root" })
export class LoggerService {
  private readonly logEnabled: boolean;

  constructor() {
    this.logEnabled = environment.logEnabled ?? true;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.logEnabled) return false;

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

  private log(level: LogLevel, service: string, operation: string, data?: any, error?: any): void {
    if (!this.shouldLog(level)) return;

    const durationMs = error?.durationMs;
    const errorObj =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error?.message
          ? { message: error.message }
          : null;

    const entry = createLogEntry(level, service, operation, data, errorObj, durationMs);

    if (typeof window !== "undefined") {
      queueLog(entry);
    } else {
      const prefix = `${LOG_PREFIX}[${level}][${service}]`;
      const message = `${operation} (${entry.request_id})`;
      if (level === LogLevel.ERROR) {
        console.error(prefix, message, { user_id: entry.user_id, data, error: errorObj });
      } else if (level === LogLevel.WARN) {
        console.warn(prefix, message, { user_id: entry.user_id, data, error: errorObj });
      } else if (level === LogLevel.INFO) {
        console.info(prefix, message, { user_id: entry.user_id, data });
      } else {
        console.log(prefix, message, { user_id: entry.user_id, data });
      }
    }
  }

  debug(operation: string, data?: any): void {
    this.log(LogLevel.DEBUG, "LoggerService", operation, data);
  }

  info(operation: string, data?: any): void {
    this.log(LogLevel.INFO, "LoggerService", operation, data);
  }

  warn(operation: string, data?: any): void {
    this.log(LogLevel.WARN, "LoggerService", operation, data);
  }

  error(operation: string, data?: any, error?: any): void {
    this.log(LogLevel.ERROR, "LoggerService", operation, data, error);
  }

  group(label: string, fn: () => void): void {
    if (!this.logEnabled) {
      fn();
      return;
    }
    console.group(`${LOG_PREFIX}${label}`);
    fn();
    console.groupEnd();
  }

  time(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug(`${label} Duration: ${duration}ms`);
    };
  }

  setRequestId(id: string): void {
    requestId = id;
  }

  setUserId(id: string | null): void {
    userId = id;
  }

  getRequestId(): string | null {
    return requestId;
  }

  flush(): void {
    flushLogs();
  }
}

export const log = new LoggerService();

export function createLogger(context: string) {
  return {
    debug: (op: string, data?: any) => log.debug(`${context} ${op}`, data),
    info: (op: string, data?: any) => log.info(`${context} ${op}`, data),
    warn: (op: string, data?: any) => log.warn(`${context} ${op}`, data),
    error: (op: string, data?: any, err?: any) => log.error(`${context} ${op}`, data, err),
    group: (label: string, fn: () => void) => log.group(`${context} ${label}`, fn),
    time: (label: string) => log.time(`${context} ${label}`),
  };
}

export function startOperation(service: string, operation: string, data?: any): () => void {
  const startTime = Date.now();
  log.debug(`${service} ${operation} START`, data);
  return () => {
    const duration = Date.now() - startTime;
    log.debug(`${service} ${operation} END`, { duration_ms: duration });
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flushLogs();
  });
}

export class Logger {
  static debug(service: string, operation: string, data?: any): void {
    log.debug(`${service} ${operation}`, data);
  }

  static info(service: string, operation: string, data?: any): void {
    log.info(`${service} ${operation}`, data);
  }

  static warn(service: string, operation: string, data?: any): void {
    log.warn(`${service} ${operation}`, data);
  }

  static error(service: string, operation: string, data?: any, error?: any): void {
    log.error(`${service} ${operation}`, data, error);
  }

  static group(label: string, fn: () => void): void {
    log.group(label, fn);
  }

  static time(label: string): () => void {
    return log.time(label);
  }

  static setRequestId(id: string): void {
    log.setRequestId(id);
  }

  static setUserId(id: string | null): void {
    log.setUserId(id);
  }

  static getRequestId(): string | null {
    return log.getRequestId();
  }

  static flush(): void {
    log.flush();
  }
}
