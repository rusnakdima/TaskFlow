import { Injectable, inject } from "@angular/core";
import { Observable, from } from "rxjs";
import { invoke } from "@tauri-apps/api/core";
import { Response } from "@models/response.model";
import { LoggingService } from "@app/shared/services/logging.service";

@Injectable({ providedIn: "root" })
export class TauriApiService {
  private readonly loggingService = inject(LoggingService);

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
    this.loggingService.error(service, operation, data, error);
  }

  logInfo(service: string, operation: string, data?: unknown): void {
    this.loggingService.info(service, operation, data);
  }

  logWarn(service: string, operation: string, data?: unknown): void {
    this.loggingService.warn(service, operation, data);
  }

  logDebug(service: string, operation: string, data?: unknown): void {
    this.loggingService.debug(service, operation, data);
  }
}
