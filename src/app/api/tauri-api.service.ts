import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

@Injectable({ providedIn: "root" })
export class TauriApiService {
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
    console.error(`[${service}] ${operation}`, error, data);
  }

  logInfo(service: string, operation: string, data?: unknown): void {
    console.info(`[${service}] ${operation}`, data);
  }

  logWarn(service: string, operation: string, data?: unknown): void {
    console.warn(`[${service}] ${operation}`, data);
  }

  logDebug(service: string, operation: string, data?: unknown): void {
    console.debug(`[${service}] ${operation}`, data);
  }
}
