import { Injectable, inject, signal } from "@angular/core";
import { Observable, from } from "rxjs";
import { tap, map } from "rxjs/operators";
import { invoke } from "@tauri-apps/api/core";

import { Response, ResponseStatus } from "@models/response.model";
import { MongoConnectionService } from "@services/core/mongo-connection.service";
import { StorageService } from "@services/storage.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";

export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";
export type Visibility = "private" | "shared" | "public" | "all";

export interface CrudOptions {
  visibility: Visibility;
  offline?: boolean;
  filter?: Record<string, any>;
  skip?: number;
  limit?: number;
  load?: string[];
  sort?: { [key: string]: number };
}

export interface PaginatedOptions extends CrudOptions {
  limit?: number;
  skip?: number;
}

interface PaginationState {
  skip: number;
  limit: number;
  hasMore: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
}

interface HasVisibility {
  visibility?: string;
  user_id?: string;
  assignees?: string[];
}

export interface HasId {
  id?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: "network" | "server" | "validation" | "offline",
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function generateRequestId(): string {
  return "req-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 9);
}

@Injectable({ providedIn: "root" })
export class REQUEST_SERVICE {
  private mongoConnectionService = inject(MongoConnectionService);
  private storageService = inject(StorageService);
  private jwtTokenService = inject(JwtTokenService);

  private pendingRequests = new Map<string, { controller: AbortController; timestamp: number }>();
  private readonly REQUEST_TTL = 30000;
  private readonly MAX_PENDING_REQUESTS = 100;
  private readonly DEFAULT_PAGE_SIZE = 20;

  private paginationState = signal<Map<string, PaginationState>>(new Map());

  private cleanupPendingRequests(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.pendingRequests.entries())) {
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

  private getRequestKey(operation: string, table: string, id?: string, filter?: unknown): string {
    return `${operation}:${table}:${id || ""}:${JSON.stringify(filter || {})}`;
  }

  private getRequestDeduplicationKey(
    operation: string,
    table: string,
    id?: string,
    filter?: unknown
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

  private determineOfflineFlag(visibility: Visibility): boolean {
    const isMongoConnected = this.mongoConnectionService.isConnected();

    if (visibility === "private") {
      return false;
    }

    return !isMongoConnected;
  }

  private getPaginationState(table: string): PaginationState {
    let state = this.paginationState().get(table);
    if (!state) {
      state = { skip: 0, limit: this.DEFAULT_PAGE_SIZE, hasMore: true };
      this.paginationState.update((m) => {
        const newMap = new Map(m);
        newMap.set(table, state!);
        return newMap;
      });
    }
    return state;
  }

  private updatePaginationState(table: string, newState: Partial<PaginationState>): void {
    const current = this.getPaginationState(table);
    this.paginationState.update((m) => {
      const newMap = new Map(m);
      newMap.set(table, { ...current, ...newState });
      return newMap;
    });
  }

  private resetPaginationState(table: string): void {
    this.paginationState.update((m) => {
      const newMap = new Map(m);
      newMap.set(table, { skip: 0, limit: this.DEFAULT_PAGE_SIZE, hasMore: true });
      return newMap;
    });
  }

  private syncToStorage<T extends HasId>(
    table: string,
    operation: "add" | "update" | "remove" | "set",
    data: T | T[] | null,
    extra?: { append?: boolean }
  ): void {
    switch (operation) {
      case "add":
        if (data && (data as HasId).id) {
          this.storageService.addItem(table as any, data as any);
        }
        break;
      case "update":
        if (data && (data as HasId).id) {
          this.storageService.updateItem(table as any, (data as HasId).id!, data as any);
        }
        break;
      case "remove":
        if (data && (data as HasId).id) {
          this.storageService.removeItem(table as any, (data as HasId).id!);
        }
        break;
      case "set":
        if (Array.isArray(data)) {
          this.storageService.setCollection(table as any, data as any, extra);
        } else if (data) {
          this.storageService.setCollection(table as any, data as any);
        }
        break;
    }
  }

  private invokeCrud<T>(
    operation: Operation,
    table: string,
    options: CrudOptions,
    extras?: { id?: string; data?: unknown; items?: unknown }
  ): Observable<T> {
    const key =
      operation === "getAll" || operation === "get"
        ? this.getRequestDeduplicationKey(operation, table, extras?.id, options.filter)
        : generateRequestId();

    const offline = options.offline ?? this.determineOfflineFlag(options.visibility);
    const requestId = generateRequestId();

    const payload: Record<string, unknown> = {
      operation,
      table,
      offline,
      request_id: requestId,
    };

    if (extras?.id) payload["id"] = extras.id;
    if (extras?.data) payload["data"] = extras.data;
    if (extras?.items) payload["items"] = extras.items;
    if (options.visibility) payload["visibility"] = options.visibility;
    if (options.filter) payload["filter"] = options.filter;
    if (options.load) payload["load"] = JSON.stringify(options.load);
    if (options.skip !== undefined) payload["skip"] = options.skip;
    if (options.limit !== undefined) payload["limit"] = options.limit;
    if (options.sort) payload["sort"] = JSON.stringify(options.sort);

    return new Observable<T>((subscriber) => {
      invoke<Response<T>>("manage_data", payload)
        .then(
          (response) => {
            this.removeRequest(key);
            if (response.status === ResponseStatus.SUCCESS) {
              subscriber.next(response.data as T);
              subscriber.complete();
            } else {
              subscriber.error(
                new ApiError(
                  response?.message || "Unknown error",
                  "server",
                  String(response.status)
                )
              );
            }
          },
          (err) => {
            this.removeRequest(key);
            if (offline && !this.mongoConnectionService.isConnected()) {
              subscriber.error(
                new ApiError(
                  "MongoDB is not connected. This operation requires a database connection.",
                  "offline"
                )
              );
            } else {
              subscriber.error(new ApiError(err?.message || String(err), "network"));
            }
          }
        )
        .catch((err) => subscriber.error(err));
    });
  }

  isOffline(): boolean {
    return !navigator.onLine;
  }

  isMongoConnected(): boolean {
    return this.mongoConnectionService.isConnected();
  }

  currentUserId(): string {
    return this.jwtTokenService.getCurrentUserId() || "";
  }

  filterByVisibility<T extends HasVisibility>(items: T[], visibility: Visibility): T[] {
    const userId = this.currentUserId();
    if (!userId) return [];

    return items.filter((item) => {
      switch (visibility) {
        case "all":
          return (
            item.user_id === userId ||
            (Array.isArray(item.assignees) && item.assignees.includes(userId)) ||
            item.visibility === "public"
          );
        case "private":
          return item.user_id === userId;
        case "shared":
          return (
            (Array.isArray(item.assignees) && item.assignees.includes(userId)) ||
            (item.visibility === "shared" && item.user_id === userId)
          );
        case "public":
          return item.visibility === "public";
        default:
          return item.visibility === visibility;
      }
    });
  }

  get<T>(table: string, id: string, options: CrudOptions = { visibility: "all" }): Observable<T> {
    return this.invokeCrud<T>("get", table, options, { id }).pipe(
      tap((data) => this.syncToStorage(table, "add", data as HasId))
    );
  }

  getAll<T extends HasId>(
    table: string,
    options: PaginatedOptions = { visibility: "all" }
  ): Observable<T[]> {
    return this.invokeCrud<T[]>("getAll", table, options).pipe(
      tap((data) => {
        if (Array.isArray(data)) {
          this.syncToStorage(table, "set", data);
          this.updatePaginationState(table, {
            skip: (options.skip || 0) + data.length,
            hasMore: data.length >= (options.limit || this.DEFAULT_PAGE_SIZE),
          });
        }
      })
    );
  }

  create<T extends HasId>(
    table: string,
    data: Partial<T>,
    options: CrudOptions = { visibility: "all" }
  ): Observable<T> {
    return this.invokeCrud<T>("create", table, options, { data }).pipe(
      tap((created) => this.syncToStorage(table, "add", created))
    );
  }

  update<T>(
    table: string,
    id: string,
    data: Partial<T>,
    options: CrudOptions = { visibility: "all" }
  ): Observable<T> {
    return this.invokeCrud<T>("update", table, options, { id, data }).pipe(
      tap((updated) => this.syncToStorage(table, "update", updated as HasId))
    );
  }

  delete<T extends HasId>(
    table: string,
    id: string,
    options: CrudOptions = { visibility: "all" }
  ): Observable<void> {
    return this.invokeCrud<void>("delete", table, options, { id }).pipe(
      tap(() => this.syncToStorage(table, "remove", { id } as T))
    );
  }

  updateAll<T extends HasId>(
    table: string,
    items: Partial<T>[],
    options: CrudOptions = { visibility: "all" }
  ): Observable<T[]> {
    return this.invokeCrud<T[]>("updateAll", table, options, { items }).pipe(
      tap((updatedItems) => {
        if (Array.isArray(updatedItems)) {
          for (const item of updatedItems) {
            this.syncToStorage(table, "update", item);
          }
        }
      })
    );
  }

  loadPage<T extends HasId>(table: string, options: PaginatedOptions): Observable<T[]> {
    const state = this.getPaginationState(table);
    const pageOptions = { ...options, skip: 0, limit: options.limit || state.limit };

    return this.invokeCrud<T[]>("getAll", table, pageOptions).pipe(
      tap((data) => {
        if (Array.isArray(data)) {
          this.syncToStorage(table, "set", data);
          this.updatePaginationState(table, {
            skip: data.length,
            hasMore: data.length >= (pageOptions.limit || state.limit),
          });
        }
      })
    );
  }

  loadMore<T extends HasId>(table: string): Observable<T[]> {
    const state = this.getPaginationState(table);
    if (!state.hasMore) {
      return new Observable((observer) => {
        observer.next([] as unknown as T[]);
        observer.complete();
      });
    }

    return this.invokeCrud<T[]>("getAll", table, {
      visibility: "all",
      skip: state.skip,
      limit: state.limit,
    }).pipe(
      tap((data) => {
        if (Array.isArray(data) && data.length > 0) {
          this.syncToStorage(table, "set", data, { append: true });
          this.updatePaginationState(table, {
            skip: state.skip + data.length,
            hasMore: data.length >= state.limit,
          });
        } else if (Array.isArray(data) && data.length === 0) {
          this.updatePaginationState(table, { hasMore: false });
        }
      })
    );
  }

  paginate<T extends HasId>(
    table: string,
    options: PaginatedOptions,
    reset = false
  ): Observable<PaginatedResult<T>> {
    const state = this.getPaginationState(table);
    const limit = options.limit || state.limit;
    const skip = reset ? 0 : state.skip;

    return this.invokeCrud<T[]>("getAll", table, { ...options, skip, limit }).pipe(
      tap((data) => {
        if (Array.isArray(data)) {
          this.syncToStorage(table, "set", data, reset ? undefined : { append: !reset });
          this.updatePaginationState(table, {
            skip: skip + data.length,
            hasMore: data.length >= limit,
          });
        }
      }),
      map((data) => ({ items: data, hasMore: data.length >= limit }))
    );
  }

  resetPagination(table: string): void {
    this.resetPaginationState(table);
  }

  hasMore(table: string): boolean {
    return this.getPaginationState(table).hasMore;
  }

  getTasksByMonth(year: number, month: number): Observable<{ tasks: unknown[] }> {
    const offline = !this.mongoConnectionService.isConnected();
    return from(
      invoke<Response<{ tasks: unknown[] }>>("get_tasks_by_month", { year, month, offline }).then(
        (response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data as { tasks: unknown[] };
          }
          throw new ApiError(response.message || "Failed to load tasks by month", "server");
        },
        (err) => {
          throw new ApiError(err?.message || String(err), "network");
        }
      )
    );
  }

  initializeUserData(userId: string): Observable<Response<unknown>> {
    return from(invoke<Response<unknown>>("initialize_user_data", { userId }));
  }

  getProfile(): Observable<unknown> {
    const userId = this.currentUserId();
    return this.getAll("profiles", {
      visibility: "all",
      filter: { user_id: userId },
      load: ["user"],
    }).pipe(
      tap((profiles: unknown[]) => {
        if (Array.isArray(profiles) && profiles.length > 0) {
          this.storageService.setCollection("profiles", profiles[0] as any);
        }
      }),
      map((profiles: unknown[]) => profiles[0] || null)
    );
  }

  getPublicProfiles(): Observable<unknown[]> {
    return this.getAll("profiles", { visibility: "public" });
  }

  invokeCommand<T>(command: string, args?: Record<string, unknown>): Observable<T> {
    return from(invoke<T>(command, args) as Promise<T>);
  }
}
