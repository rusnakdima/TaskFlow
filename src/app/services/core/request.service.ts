import { Injectable, inject } from "@angular/core";
import { Observable, from } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

import { Response, ResponseStatus } from "@models/response.model";

import { JwtTokenService } from "@services/auth/jwt-token.service";
import { MongoConnectionService } from "@services/core/mongo-connection.service";

export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

export interface CrudOptions {
  id?: string;
  data?: unknown;
  items?: unknown[];
  parentTodoId?: string;
  load?: string[];
  filter?: { [key: string]: any };
  visibility?: string;
  skip?: number;
  limit?: number;
  sort?: { [key: string]: number };
}

function generateRequestId(): string {
  return "req-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 9);
}

function debugLog(
  op: string,
  table: string,
  id: string | undefined,
  offline: boolean,
  msg: string,
  extra?: any
): void {
  const prefix = `[RequestService]`;
  const meta = { op, table, id: id ?? "N/A", offline };
  console.debug(`${prefix} ${msg}`, meta, extra ?? "");
}

@Injectable({ providedIn: "root" })
/**
 * @deprecated RequestService is deprecated and will be removed in a future release.
 * Use REQUEST_SERVICE from @services/api.service instead for new code.
 * This service is still used by DataService and 21 other files, so do not delete.
 */
export class RequestService {
  private jwtTokenService = inject(JwtTokenService);
  private mongoConnectionService = inject(MongoConnectionService);

  private pendingRequests = new Map<string, { controller: AbortController; timestamp: number }>();
  private readonly REQUEST_TTL = 30000;
  private readonly MAX_PENDING_REQUESTS = 100;

  private cleanupPendingRequests(): void {
    const now = Date.now();
    for (const [key, entry] of this.pendingRequests.entries()) {
      if (now - entry.timestamp > this.REQUEST_TTL) {
        entry.controller.abort();
        this.pendingRequests.delete(key);
      }
    }
    while (this.pendingRequests.size > this.MAX_PENDING_REQUESTS) {
      const oldestKey = this.pendingRequests.keys().next().value;
      if (oldestKey) {
        this.pendingRequests.get(oldestKey)?.controller.abort();
        this.pendingRequests.delete(oldestKey);
      }
    }
  }

  private getRequestKey(operation: string, table: string, id?: string, filter?: any): string {
    return `${operation}:${table}:${id || ""}:${JSON.stringify(filter || {})}`;
  }

  private getRequestDeduplicationKey(
    operation: string,
    table: string,
    id?: string,
    filter?: any
  ): string {
    this.cleanupPendingRequests();

    const key = this.getRequestKey(operation, table, id, filter);
    const now = Date.now();
    const existing = this.pendingRequests.get(key);

    if (existing && now - existing.timestamp < 500) {
      existing.controller.abort();
    }

    const controller = new AbortController();
    this.pendingRequests.set(key, { controller, timestamp: now });

    return key;
  }

  private removeRequest(key: string): void {
    this.pendingRequests.delete(key);
  }

  invokeCommand<T>(command: string, args: Record<string, unknown> = {}): Observable<T> {
    return from(
      invoke<Response<T>>(command, args).then(
        (response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data as T;
          }
          throw new Error(response?.message || "Unknown error");
        },
        (err) => {
          throw new Error(err?.message || String(err));
        }
      )
    );
  }

  crud<T>(operation: Operation, table: string, options: CrudOptions = {}): Observable<T> {
    const key =
      operation === "getAll" || operation === "get"
        ? this.getRequestDeduplicationKey(operation, table, options.id, options.filter)
        : generateRequestId();
    const offline = !this.mongoConnectionService.isConnected();

    const payload: Record<string, any> = {
      operation,
      table,
      offline,
      request_id: key,
    };

    if (options.id) payload["id"] = options.id;
    if (options.data) payload["data"] = options.data;
    if (options.items) payload["items"] = options.items;
    if (options.filter) payload["filter"] = options.filter;
    if (options.load) payload["load"] = JSON.stringify(options.load);
    if (options.visibility) payload["visibility"] = options.visibility;
    if (options.parentTodoId) payload["parentTodoId"] = options.parentTodoId;
    if (options.skip !== undefined) payload["skip"] = options.skip;
    if (options.limit !== undefined) payload["limit"] = options.limit;
    if (options.sort) payload["sort"] = JSON.stringify(options.sort);

    const t0 = performance.now();
    debugLog(operation, table, options.id, offline, `>>> REQUEST START (${key})`, {
      requestId: key,
      payload,
    });

    return new Observable<T>((subscriber) => {
      invoke<Response<T>>("manage_data", payload)
        .then(
          (response) => {
            const elapsed = Math.round(performance.now() - t0);
            debugLog(operation, table, options.id, offline, `<<< REQUEST COMPLETE (${key})`, {
              requestId: key,
              elapsedMs: elapsed,
              status: response.status,
            });

            if (response.status === ResponseStatus.SUCCESS) {
              subscriber.next(response.data as T);
              subscriber.complete();
            } else {
              throw new Error(response?.message || "Unknown error");
            }
          },
          (err) => {
            const elapsed = Math.round(performance.now() - t0);
            console.error(`[RequestService] !!! REQUEST ERROR (${key})`, {
              requestId: key,
              operation,
              table,
              id: options.id,
              elapsedMs: elapsed,
              error: err?.message || String(err),
            });
            throw new Error(err?.message || String(err));
          }
        )
        .catch((err) => subscriber.error(err));
    });
  }

  private invoke<T>(
    operation: string,
    table: string,
    id: string | undefined,
    args: Record<string, any>
  ): Observable<T> {
    const requestId = generateRequestId();
    const offline = !this.mongoConnectionService.isConnected();
    const t0 = performance.now();

    debugLog(operation, table, id, offline, `>>> REQUEST START (${requestId})`, {
      requestId,
      args,
    });

    const offlineArgs: Record<string, any> = {
      ...args,
      operation,
      table,
      offline,
      request_id: requestId,
    };
    if (id !== undefined) {
      offlineArgs["id"] = id;
    }

    return from(
      invoke<Response<T>>("manage_data", offlineArgs).then(
        (response) => {
          const elapsed = Math.round(performance.now() - t0);
          debugLog(operation, table, id, offline, `<<< REQUEST COMPLETE (${requestId})`, {
            requestId,
            elapsedMs: elapsed,
            status: response.status,
          });

          if (response.status === ResponseStatus.SUCCESS) {
            return response.data as T;
          }
          throw new Error(response?.message || "Unknown error");
        },
        (err) => {
          const elapsed = Math.round(performance.now() - t0);
          console.error(`[RequestService] !!! REQUEST ERROR (${requestId})`, {
            requestId,
            operation,
            table,
            id,
            elapsedMs: elapsed,
            error: err?.message || String(err),
          });
          throw new Error(err?.message || String(err));
        }
      )
    );
  }

  isOffline(): boolean {
    return !navigator.onLine;
  }

  currentUserId(): string {
    return this.jwtTokenService.getCurrentUserId() || "";
  }

  filterTodosByVisibility(todos: any[], visibility: string): any[] {
    const userId = this.currentUserId();
    if (!userId) return [];

    switch (visibility) {
      case "all":
        return todos.filter(
          (t: any) =>
            t.user_id === userId || t.assignees?.includes(userId) || t.visibility === "public"
        );
      case "private":
        return todos.filter((t: any) => t.user_id === userId);
      case "shared":
        return todos.filter(
          (t: any) =>
            t.assignees?.includes(userId) || (t.visibility === "shared" && t.user_id === userId)
        );
      case "public":
        return todos.filter((t: any) => t.visibility === "public");
      default:
        return todos.filter((t: any) => t.visibility === visibility);
    }
  }

  getTasksByMonth(year: number, month: number): Observable<{ tasks: any[] }> {
    const offline = !this.mongoConnectionService.isConnected();
    return from(
      invoke<Response<{ tasks: any[] }>>("get_tasks_by_month", { year, month, offline }).then(
        (response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data as { tasks: any[] };
          }
          throw new Error(response.message || "Failed to load tasks by month");
        },
        (err) => {
          throw new Error(err?.message || String(err));
        }
      )
    );
  }

  initializeUserData(userId: string): Observable<Response<any>> {
    return from(invoke<Response<any>>("initialize_user_data", { userId }));
  }
}
