import { Injectable } from "@angular/core";
import { getLoggingService } from "@tauri-apps/logger";

@Injectable({
  providedIn: "root",
})
export class LoggerService {
  private logger = getLoggingService();

  debug(message: string, context?: Record<string, unknown>, data?: unknown): void {
    const merged = data ? { ...context, data } : context;
    this.logger.debug(message, merged);
  }

  warn(message: string, context?: Record<string, unknown>, data?: unknown): void {
    const merged = data ? { ...context, data } : context;
    this.logger.warn(message, merged);
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this.logger.error(message, error, context);
  }

  info(message: string, context?: Record<string, unknown>, data?: unknown): void {
    const merged = data ? { ...context, data } : context;
    this.logger.info(message, merged);
  }

  startOperation(name: string, context?: Record<string, unknown>): string {
    return this.logger.startOperation(name, context);
  }

  completeOperation(name: string, operationId: string, success?: boolean, data?: unknown): void {
    this.logger.completeOperation(name, operationId, success, data);
  }
}
