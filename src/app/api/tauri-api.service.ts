import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { invoke } from "@tauri-apps/api/core";
import { LoggerService } from "@shared/services/logger.service";

@Injectable({ providedIn: "root" })
export class TauriApiService {
  private readonly loggingService = inject(LoggerService);

  invoke<T>(command: string, args?: Record<string, unknown>): Observable<T> {
    return new Observable((subscriber) => {
      invoke<T>(command, args)
        .then((result) => {
          subscriber.next(result);
          subscriber.complete();
        })
        .catch((err) => {
          subscriber.error(err);
        });
    });
  }

  invokeAsync<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(command, args);
  }

  invokeWithArgs<T>(command: string, args: Record<string, unknown>): Observable<T> {
    return this.invoke<T>(command, args);
  }

  logError(service: string, operation: string, data?: unknown, error?: unknown): void {
    this.loggingService.error(`${service}: ${operation}`, error, data as Record<string, unknown>);
  }

  logInfo(service: string, operation: string, data?: unknown): void {
    this.loggingService.info(`${service}: ${operation}`, data as Record<string, unknown>);
  }

  logWarn(service: string, operation: string, data?: unknown): void {
    this.loggingService.warn(`${service}: ${operation}`, data as Record<string, unknown>);
  }

  logDebug(service: string, operation: string, data?: unknown): void {
    this.loggingService.debug(`${service}: ${operation}`, data as Record<string, unknown>);
  }
}
