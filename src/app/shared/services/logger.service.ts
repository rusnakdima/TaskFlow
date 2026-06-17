import { Injectable } from "@angular/core";
import { logger } from "@services/logger.service";

@Injectable({
  providedIn: "root",
})
export class LoggerService {
  debug(message: string, context?: Record<string, unknown>, data?: unknown): void {
    const merged = data ? { ...context, data } : context;
    logger.debug(merged ? JSON.stringify(merged) : message);
  }

  warn(message: string, context?: Record<string, unknown>, data?: unknown): void {
    const merged = data ? { ...context, data } : context;
    logger.warn(merged ? JSON.stringify(merged) : message);
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const errorStr = error ? ` ${JSON.stringify(error)}` : "";
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    logger.error(message + errorStr + contextStr);
  }

  info(message: string, context?: Record<string, unknown>, data?: unknown): void {
    const merged = data ? { ...context, data } : context;
    logger.info(merged ? JSON.stringify(merged) : message);
  }

  startOperation(name: string, context?: Record<string, unknown>): string {
    logger.info(`Operation started: ${name}${context ? ` ${JSON.stringify(context)}` : ""}`);
    return name;
  }

  completeOperation(name: string, _operationId: string, success?: boolean, data?: unknown): void {
    const status = success === false ? "failed" : "completed";
    logger.info(`Operation ${status}: ${name}${data ? ` ${JSON.stringify(data)}` : ""}`);
  }
}
