import { Injectable, inject, signal } from "@angular/core";
import { Observable, from } from "rxjs";
import { tap, map } from "rxjs/operators";
import { invoke } from "@tauri-apps/api/core";

import { Response, ResponseStatus } from "@models/response.model";
import {
  Todo,
  Task,
  Subtask,
  Category,
  Chat,
  Comment,
  User,
  Profile,
} from "@models/generated/api.types";
import { MongoConnectionService } from "@services/core/mongo-connection.service";
import { StorageService } from "@services/storage.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import {
  Visibility,
  CrudOptions,
  PaginatedOptions,
  PaginatedResult,
  HasVisibility,
  HasId,
  ApiError,
  PaginationState,
  Operation,
} from "@models/api.model";

export { ApiError, Visibility, HasId } from "@models/api.model";

export interface CascadeResult {
  todo_count: number;
  task_count: number;
  subtask_count: number;
  comment_count: number;
  chat_count: number;
}

function generateRequestId(): string {
  return "req-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 9);
}

@Injectable({ providedIn: "root" })
export class ApiService {
  private mongoConnectionService = inject(MongoConnectionService);
  private storageService = inject(StorageService);
  private jwtTokenService = inject(JwtTokenService);

  private pendingRequests = new Map<string, { controller: AbortController; timestamp: number }>();
  private readonly REQUEST_TTL = 30000;
  private readonly MAX_PENDING_REQUESTS = 100;
  private readonly DEFAULT_PAGE_SIZE = 10;

  readonly todos = new EntityApi<Todo>(this, "todos");
  readonly tasks = new EntityApi<Task>(this, "tasks");
  readonly subtasks = new EntityApi<Subtask>(this, "subtasks");
  readonly categories = new EntityApi<Category>(this, "categories");
  readonly profiles = new EntityApi<Profile>(this, "profiles");
  readonly comments = new EntityApi<Comment>(this, "comments");
  readonly chats = new EntityApi<Chat>(this, "chats");
  readonly users = new EntityApi<User>(this, "users");
  readonly admin = new AdminApi(this);

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

  private determineOfflineFlag(): boolean {
    const isMongoConnected = this.mongoConnectionService.isConnected();
    const isBrowserOffline = !navigator.onLine;

    if (isBrowserOffline || !isMongoConnected) {
      return true;
    }

    return false;
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
    extra?: { append?: boolean; isPrivate?: boolean }
  ): void {
    switch (operation) {
      case "add":
        if (data && (data as HasId).id) {
          this.storageService.modify(table as any, "create", data as any);
        }
        break;
      case "update":
        if (data && (data as HasId).id) {
          this.storageService.modify(table as any, "update", data as any);
        }
        break;
      case "remove":
        if (data && (data as HasId).id) {
          this.storageService.modify(table as any, "delete", { id: (data as HasId).id });
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

    const offline = options.offline ?? this.determineOfflineFlag();
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
    const isPrivate = options.visibility === "private";
    return this.invokeCrud<T>("create", table, options, { data }).pipe(
      tap((created) => {
        this.syncToStorage(table, "add", created, { isPrivate });
      })
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
            visibility: options.visibility as Visibility,
            filter: options.filter,
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
      visibility: state.visibility || "all",
      filter: state.filter,
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

  getProfile(): Observable<Profile | null> {
    const userId = this.currentUserId();
    return this.getAll<Profile>("profiles", {
      visibility: "all",
      filter: { user_id: userId },
    }).pipe(
      tap((profiles) => {
        if (profiles && profiles.length > 0) {
          this.storageService.setCollection("profiles", profiles[0] as any);
        }
      }),
      map((profiles) => profiles?.[0] || null)
    );
  }

  getPublicProfiles(): Observable<Profile[]> {
    return this.getAll<Profile>("profiles", { visibility: "public" });
  }

  invokeCommand<T>(command: string, args?: Record<string, unknown>): Observable<T> {
    return from(invoke<T>(command, args) as Promise<T>);
  }

  async batchSoftDelete(table: string, ids: string[]): Promise<CascadeResult[]> {
    return invoke<CascadeResult[]>("batch_soft_delete_cascade", { table, ids });
  }

  async batchHardDelete(table: string, ids: string[]): Promise<CascadeResult[]> {
    return invoke<CascadeResult[]>("batch_hard_delete_cascade", { table, ids });
  }

  async batchRestore(table: string, ids: string[]): Promise<CascadeResult[]> {
    return invoke<CascadeResult[]>("batch_restore_cascade", { table, ids });
  }
}

function getCurrentUserId(apiService: ApiService): string | null {
  return apiService.currentUserId() || null;
}

class EntityApi<T extends HasId> {
  private readonly userOwnedTables = [
    "todos",
    "tasks",
    "subtasks",
    "categories",
    "comments",
    "chats",
  ];

  constructor(
    private apiService: ApiService,
    private table: string
  ) {}

  getAll(options?: PaginatedOptions & { todoId?: string; taskId?: string }): Observable<T[]> {
    const opts = this.buildOptions(options);
    return this.apiService.getAll<T>(this.table, opts);
  }

  get(id: string, options?: CrudOptions): Observable<T> {
    return this.apiService.get<T>(this.table, id, this.buildOptions(options));
  }

  create(data: Partial<T>, options?: CrudOptions): Observable<T> {
    return this.apiService.create<T>(this.table, data as T, this.buildOptions(options));
  }

  update(id: string, data: Partial<T>, options?: CrudOptions): Observable<T> {
    return this.apiService.update<T>(this.table, id, data as T, this.buildOptions(options));
  }

  delete(id: string, options?: CrudOptions): Observable<void> {
    return this.apiService.delete<T>(this.table, id, this.buildOptions(options));
  }

  loadMore(): Observable<T[]> {
    return this.apiService.loadMore<T>(this.table);
  }

  paginate(
    options: PaginatedOptions & { todoId?: string; taskId?: string },
    reset = false
  ): Observable<PaginatedResult<T>> {
    return this.apiService.paginate<T>(this.table, this.buildOptions(options), reset);
  }

  private buildOptions(
    options?: CrudOptions & { todoId?: string; taskId?: string }
  ): PaginatedOptions {
    if (!options) return { visibility: "all" };

    const { todoId, taskId, ...rest } = options;
    const visibility = options.visibility || "all";

    let filter = rest.filter ? { ...rest.filter } : {};

    if (todoId) {
      filter = { ...filter, todo_id: todoId };
    }
    if (taskId) {
      filter = { ...filter, task_id: taskId };
    }

    if (this.userOwnedTables.includes(this.table)) {
      const userId = getCurrentUserId(this.apiService);
      if (userId && !filter["user_id"]) {
        filter = { ...filter, user_id: userId };
      }
    }

    return { ...rest, visibility, filter, limit: rest.limit || 10 };
  }
}

class AdminApi {
  constructor(private apiService: ApiService) {}

  getAllArchiveData(): Observable<unknown> {
    return this.apiService.invokeCommand("get_all_archive_data", {});
  }

  getAllAdminData(): Observable<unknown> {
    return this.apiService.invokeCommand("get_all_admin_data", {});
  }

  adminGetAll(): Observable<unknown> {
    return this.apiService.invokeCommand("admin_get_all", {});
  }

  adminGetPaginated(dataType: string, skip: number, limit: number): Observable<unknown> {
    return this.apiService.invokeCommand("admin_get_paginated", { dataType, skip, limit });
  }

  adminToggleDelete(table: string, id: string): Observable<void> {
    return this.apiService.invokeCommand("admin_toggle_delete", { table, id });
  }

  adminPermanentlyDelete(table: string, id: string): Observable<void> {
    return this.apiService.invokeCommand("admin_permanently_delete", { table, id });
  }

  adminToggleDeleteLocal(table: string, id: string): Observable<void> {
    return this.apiService.invokeCommand("admin_toggle_delete_local", { table, id });
  }

  adminPermanentlyDeleteLocal(table: string, id: string): Observable<void> {
    return this.apiService.invokeCommand("admin_permanently_delete_local", { table, id });
  }

  adminGetAllArchive(): Observable<unknown> {
    return this.apiService.invokeCommand("admin_get_all_archive", {});
  }

  adminGetArchivePaginated(dataType: string, skip: number, limit: number): Observable<unknown> {
    return this.apiService.invokeCommand("admin_get_archive_paginated", { dataType, skip, limit });
  }

  batchSoftDelete(table: string, ids: string[]): Observable<CascadeResult> {
    return this.apiService.batchSoftDelete(table, ids) as unknown as Observable<CascadeResult>;
  }

  batchHardDelete(table: string, ids: string[]): Observable<CascadeResult> {
    return this.apiService.batchHardDelete(table, ids) as unknown as Observable<CascadeResult>;
  }

  batchRestore(table: string, ids: string[]): Observable<CascadeResult> {
    return this.apiService.batchRestore(table, ids) as unknown as Observable<CascadeResult>;
  }
}

export { ApiService as REQUEST_SERVICE };
