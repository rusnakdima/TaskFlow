import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { invoke } from "@tauri-apps/api/core";
import { Response, getData, isSuccess } from "@entities/response.model";
import { ApiException } from "@entities/error.model";

const DEFAULT_TIMEOUT_MS = 30000;

export interface InvokeOptions {
  timeoutMs?: number;
  suppressError?: boolean;
}

@Injectable({ providedIn: "root" })
export class TauriApiService {
  invoke<T>(command: string, args?: Record<string, unknown>): Observable<T> {
    return new Observable((subscriber) => {
      this.invokeAsync<Response<T>>(command, args)
        .then((response) => {
          if (isSuccess(response)) {
            subscriber.next(getData<T>(response) as T);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiException(response.message || `Operation failed: ${command}`, response.status)
            );
          }
        })
        .catch((err) => {
          subscriber.error(err);
        });
    });
  }

  async invokeAsync<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(command, args);
  }

  async invokeWithArgs<T>(
    command: string,
    args?: Record<string, unknown>,
    options: InvokeOptions = {}
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      const response = await Promise.race([
        invoke<Response<T>>(command, args),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new ApiException(`Command "${command}" timed out after ${timeoutMs}ms`, "TIMEOUT")
              ),
            timeoutMs
          )
        ),
      ]);

      if (isSuccess(response)) {
        return getData<T>(response) as T;
      }
      throw new ApiException(response.message || `Operation failed: ${command}`, response.status);
    } catch (error: unknown) {
      if (error instanceof ApiException) throw error;
      throw new ApiException(
        error instanceof Error ? error.message : String(error),
        "UNKNOWN",
        error
      );
    }
  }
}
