import { Injectable, inject, OnDestroy } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { LoggingService } from "@app/shared/services/logging.service";
import { environment } from "@env/environment";

interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  operation: string;
  request_id: string;
  user_id: string | null;
  duration_ms: number | null;
  data: unknown;
  error: { message: string; stack?: string } | null;
}

const LOG_ENDPOINT = "/api/logs";
const BUFFER_SIZE = 50;
const FLUSH_INTERVAL = 10000;
const MAX_RETRIES = 3;

@Injectable({ providedIn: "root" })
export class LogStorageService implements OnDestroy {
  private http = inject(HttpClient);
  private loggingService = inject(LoggingService);
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  private retryCount = 0;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.onlineHandler = () => {
        this.isOnline = true;
        this.flush();
      };
      this.offlineHandler = () => {
        this.isOnline = false;
      };
      window.addEventListener("online", this.onlineHandler);
      window.addEventListener("offline", this.offlineHandler);
      this.startFlushTimer();
    }
  }

  ngOnDestroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (typeof window !== "undefined") {
      if (this.onlineHandler) {
        window.removeEventListener("online", this.onlineHandler);
        this.onlineHandler = null;
      }
      if (this.offlineHandler) {
        window.removeEventListener("offline", this.offlineHandler);
        this.offlineHandler = null;
      }
    }
  }

  log(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= BUFFER_SIZE) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flush();
    }, FLUSH_INTERVAL);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (!this.isOnline) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      await this.sendLogs(entries);
      this.retryCount = 0;
    } catch (error) {
      this.buffer.unshift(...entries);
      this.handleFlushError(error);
    }
  }

  private async sendLogs(entries: LogEntry[]): Promise<void> {
    if (!environment.production) {
      this.loggingService.debug("[LogStorage] Would send logs to backend:", entries.length);
      return;
    }

    try {
      await firstValueFrom(this.http.post(environment.apiUrl + LOG_ENDPOINT, { logs: entries }));
    } catch (error) {
      throw error;
    }
  }

  private handleFlushError(error: unknown): void {
    this.retryCount++;
    if (this.retryCount >= MAX_RETRIES) {
      this.loggingService.error(
        "LogStorage",
        "Max retries reached, logs will be lost",
        null,
        error
      );
      this.persistToLocalStorage();
      this.buffer = [];
      this.retryCount = 0;
    } else {
      setTimeout(() => this.flush(), 5000 * this.retryCount);
    }
  }

  private persistToLocalStorage(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const existingLogs = localStorage.getItem("app_logs") || "[]";
      const logs = JSON.parse(existingLogs);
      logs.push(...this.buffer);
      localStorage.setItem("app_logs", JSON.stringify(logs.slice(-1000)));
    } catch (e) {
      this.loggingService.error("LogStorage", "Failed to persist to localStorage", null, e);
    }
  }

  getBufferedLogs(): LogEntry[] {
    return [...this.buffer];
  }

  clearBuffer(): void {
    this.buffer = [];
  }
}

export function createLogEntry(
  service: string,
  operation: string,
  level: string,
  data?: unknown,
  error?: unknown,
  durationMs?: number
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    service,
    operation,
    request_id: LoggingService.generateRequestId(),
    user_id: null,
    duration_ms: durationMs ?? null,
    data: data ?? null,
    error:
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error?.message
          ? { message: error.message }
          : null,
  };
}
