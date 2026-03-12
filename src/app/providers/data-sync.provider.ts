/* sys lib */
import { Injectable, Injector, inject } from "@angular/core";
import { Observable, from, share, of, firstValueFrom } from "rxjs";
import { invoke } from "@tauri-apps/api/core";
import { finalize, tap, catchError } from "rxjs/operators";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { RelationObj } from "@models/relation-obj.model";
import { SyncMetadata } from "@models/sync-metadata";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";

/* services */
import { LocalWebSocketService } from "@services/core/local-websocket.service";
import { SyncService } from "@services/data/sync.service";
import { StorageService } from "@services/core/storage.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { OfflineQueueService } from "@services/core/offline-queue.service";
import { Profile } from "@models/profile.model";

type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

interface CrudParams {
  table: string;
  filter?: { [key: string]: any };
  data?: any;
  id?: string;
  parentTodoId?: string;
  relations?: RelationObj[];
  syncMetadata?: SyncMetadata;
}

@Injectable({
  providedIn: "root",
})
export class DataSyncProvider {
  private allowedTables = [
    "todos",
    "tasks",
    "subtasks",
    "categories",
    "chats",
    "comments",
    "profiles",
    "users",
  ];

  private localWebSocketService = inject(LocalWebSocketService);
  private jwtTokenService = inject(JwtTokenService);
  private offlineQueueService = inject(OfflineQueueService);
  private injector = inject(Injector);

  constructor() {
    // Register execute function in OfflineQueueService to avoid circular dependency
    this.offlineQueueService.setExecuteFunction(
      (operation, entityType, entityId, data, parentTodoId) =>
        this.executeOperationForQueue(operation, entityType, entityId, data, parentTodoId)
    );
  }

  /**
   * Execute operation for offline queue (extracted to avoid circular dependency)
   */
  private async executeOperationForQueue(
    operation: "create" | "update" | "delete",
    entityType: string,
    entityId: string,
    data?: any,
    parentTodoId?: string
  ): Promise<any> {
    // entityType is already plural (same as table name)
    const table = entityType;
    return new Promise((resolve, reject) => {
      let obs: Observable<any>;

      switch (operation) {
        case "create":
          obs = this.crud("create", table, { data, parentTodoId });
          break;
        case "update":
          obs = this.crud("update", table, { id: entityId, data, parentTodoId });
          break;
        case "delete":
          obs = this.crud("delete", table, { id: entityId, parentTodoId });
          break;
        default:
          reject(new Error(`Unknown operation: ${operation}`));
          return;
      }

      obs.subscribe({
        next: resolve,
        error: reject,
      });
    });
  }

  private get syncService(): SyncService {
    return this.injector.get(SyncService);
  }

  private get storageService(): StorageService {
    return this.injector.get(StorageService);
  }

  /**
   * Unified invoke command function for all Tauri commands
   * Handles response validation and error handling
   */
  invokeCommand<T>(command: string, args: Record<string, any> = {}): Observable<T> {
    return from(
      invoke<Response<T>>(command, args).then((response) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data as T;
        }
        throw new Error(response.message || `Command ${command} failed`);
      })
    );
  }

  private validateTable(table: string): void {
    if (!this.allowedTables.includes(table)) {
      throw new Error(
        `Table '${table}' is not supported. Allowed: ${this.allowedTables.join(", ")}`
      );
    }
  }

  private resolveMetadata(table: string, todoId?: string, record?: any, id?: string): SyncMetadata {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const currentUserId = this.jwtTokenService.getUserId(token);
    let metadata: SyncMetadata = { isOwner: true, isPrivate: true };

    // If we're working with a todo directly
    if (table === "todos") {
      const targetId = id || record?.id || todoId;
      const todo = record || (targetId ? this.storageService.getTodoById(targetId) : null);

      if (todo) {
        metadata.isPrivate = todo.visibility === "private";
        metadata.isOwner = todo.userId === currentUserId;
        return metadata;
      }
    }

    // For tasks/subtasks/chats, we need to find the parent todoId
    let effectiveTodoId = todoId || record?.todoId;

    if (!effectiveTodoId && (record?.id || id)) {
      const targetId = id || record?.id;
      if (table === "tasks") {
        effectiveTodoId = this.storageService.getTaskById(targetId!)?.todoId;
      } else if (table === "subtasks") {
        const subtask = this.storageService.getSubtaskById(targetId!);
        if (subtask) {
          effectiveTodoId = this.storageService.getTaskById(subtask.taskId)?.todoId;
        }
      } else if (table === "chats") {
        // We might not have chats in storage service yet, so we rely on parentTodoId being passed
      }
    }

    if (effectiveTodoId) {
      const todo = this.storageService.getTodoById(effectiveTodoId);
      if (todo) {
        metadata.isPrivate = todo.visibility === "private";
        metadata.isOwner = todo.userId === currentUserId;
      }
    }

    return metadata;
  }

  /**
   * Async metadata resolution - fetches from backend if not in storage
   * Use this when metadata is critical and storage may not be populated yet
   */
  private async resolveMetadataAsync(table: string, id: string): Promise<SyncMetadata> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const currentUserId = this.jwtTokenService.getUserId(token);
    const metadata: SyncMetadata = { isOwner: true, isPrivate: true };

    // For todos, fetch directly
    if (table === "todos") {
      try {
        const todo = await firstValueFrom(
          this.crud<Todo>("get", "todos", { filter: { id } }).pipe(
            catchError(() => of(null)) // Return null on error
          )
        );
        if (todo) {
          return {
            isPrivate: todo.visibility === "private",
            isOwner: todo.userId === currentUserId,
          };
        }
      } catch {
        // Fall through to default metadata
      }
    }

    // For tasks, fetch and extract todoId
    if (table === "tasks") {
      try {
        const task = await firstValueFrom(
          this.crud<Task>("get", "tasks", { filter: { id } }).pipe(catchError(() => of(null)))
        );
        if (task && task.todoId) {
          const todo = await firstValueFrom(
            this.crud<Todo>("get", "todos", { filter: { id: task.todoId } }).pipe(catchError(() => of(null)))
          );
          if (todo) {
            return {
              isPrivate: todo.visibility === "private",
              isOwner: todo.userId === currentUserId,
            };
          }
        }
      } catch {
        // Fall through to default metadata
      }
    }

    return metadata;
  }

  private getDefaultRelations(table: string): RelationObj[] | undefined {
    return RelationsHelper.getRelationsForTable(table);
  }

  private buildCrudParams(
    table: string,
    options: {
      filter?: { [key: string]: any };
      data?: any;
      id?: string;
      parentTodoId?: string;
      relations?: RelationObj[];
      isOwner?: boolean;
      isPrivate?: boolean;
    }
  ): CrudParams {
    const metadata =
      options.isOwner !== undefined
        ? { isOwner: options.isOwner, isPrivate: options.isPrivate ?? true }
        : this.resolveMetadata(
            table,
            options.parentTodoId || options.data?.todoId,
            options.data,
            options.id
          );

    const relations = options.relations ?? this.getDefaultRelations(table);

    return {
      table,
      filter: options.filter,
      data: options.data,
      id: options.id,
      parentTodoId: options.parentTodoId,
      relations,
      syncMetadata: metadata,
    };
  }

  private inFlightRequests = new Map<string, Observable<any>>(); // Cache in-flight requests by operation+table+id
  private requestCache = new Map<string, { data: any; timestamp: number }>(); // Cache successful responses
  private readonly CACHE_TTL_MS = 5000; // 5 second cache TTL

  private executeWithFallback<T>(
    operation: Operation,
    params: CrudParams,
    isArray: boolean = false
  ): Observable<T> {
    const requestKey = `${operation}:${params.table}:${params.id || "no-id"}`;
    console.log(`[DataSyncProvider] executeWithFallback: ${requestKey}`, {
      operation,
      table: params.table,
      id: params.id,
    });

    // Check cache first (for GET operations)
    if (operation === "get" || operation === "getAll") {
      const cached = this.requestCache.get(requestKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        console.log(`[DataSyncProvider] Cache HIT for ${requestKey}`);
        return of(cached.data as T);
      }
    }

    // Check if request is already in-flight
    const existingRequest = this.inFlightRequests.get(requestKey);
    if (existingRequest) {
      console.log(`[DataSyncProvider] In-flight request HIT for ${requestKey}`);
      return existingRequest as Observable<T>;
    }

    let wsSubscription: any = null;
    let retryTimeout: any = null;

    // Create new observable and cache it
    const request$ = new Observable<T>((subscriber) => {
      const tryWebSocket = (attempt: number) => {
        const isConnected = this.localWebSocketService.isConnected();
        console.log(
          `[DataSyncProvider] WebSocket attempt ${attempt} for ${requestKey}. Connected: ${isConnected}`
        );

        if (isConnected) {
          wsSubscription = this.localWebSocketService.crud<T>(operation, params).subscribe({
            next: (data) => {
              console.log(`[DataSyncProvider] WebSocket SUCCESS for ${requestKey}`);
              subscriber.next(data);
              subscriber.complete();
            },
            error: (err) => {
              console.warn(
                `[DataSyncProvider] WebSocket ERROR for ${requestKey}, falling back to Tauri`,
                err
              );
              // Don't delete from cache here - let finalize handle it
              this.fallbackToTauri(operation, params, subscriber, isArray, requestKey);
            },
            complete: () => {},
          });
        } else if (attempt < 3) {
          console.log(`[DataSyncProvider] WebSocket not connected, retrying...`);
          retryTimeout = setTimeout(() => tryWebSocket(attempt + 1), 100);
        } else {
          console.log(
            `[DataSyncProvider] WebSocket failed after retries, falling back to Tauri for ${requestKey}`
          );
          this.fallbackToTauri(operation, params, subscriber, isArray, requestKey);
        }
      };

      tryWebSocket(0);

      // Cleanup function
      return () => {
        if (wsSubscription) wsSubscription.unsubscribe();
        if (retryTimeout) clearTimeout(retryTimeout);
      };
    }).pipe(
      share(), // Share the execution among multiple subscribers
      tap({
        next: (data) => {
          // Cache successful GET responses
          if (operation === "get" || operation === "getAll") {
            this.requestCache.set(requestKey, { data, timestamp: Date.now() });
          }
        },
      }),
      finalize(() => {
        // Always clean up in-flight request cache on completion or error
        this.inFlightRequests.delete(requestKey);
      })
    );

    // Cache the in-flight request BEFORE any async operations
    this.inFlightRequests.set(requestKey, request$);

    return request$;
  }

  private fallbackToTauri<T>(
    operation: Operation,
    params: CrudParams,
    subscriber: any,
    isArray: boolean,
    requestKey?: string
  ): void {
    console.log(`[DataSyncProvider] Falling back to Tauri for ${operation} on ${params.table}`, {
      id: params.id,
      syncMetadata: params.syncMetadata,
    });

    const payload: any = {
      operation: operation,
      table: params.table,
      syncMetadata: params.syncMetadata,
    };

    if (params.filter) payload.filter = params.filter;
    if (params.relations) payload.relations = params.relations;
    if (params.id) payload.id = params.id;
    if (params.data) payload.data = params.data;

    const handleError = (err: any) => {
      console.error(
        `[DataSyncProvider] Tauri operation failed: ${operation} on ${params.table}`,
        err
      );
      // Don't queue validation errors - they will never succeed
      const isValidationError = err?.message?.includes("Validation failed") || 
                                err?.status === "Error" && err?.message?.includes("Validation");
      // Queue the operation for later retry (only for create/update/delete, and not validation errors)
      if (operation !== "getAll" && operation !== "get" && !isValidationError) {
        this.queueOperation(operation, params);
      }
      subscriber.error(err);
      if (requestKey) this.inFlightRequests.delete(requestKey);
    };

    if (operation === "updateAll" && params.data) {
      console.log(`[DataSyncProvider] Invoking multiple manageData for updateAll`);
      Promise.all(
        params.data.map((item: any) =>
          invoke<Response<T>>("manageData", {
            operation: item.id ? "update" : "create",
            table: params.table,
            id: item.id,
            data: item,
            syncMetadata: params.syncMetadata,
          })
        )
      )
        .then((responses: Response<T>[]) => {
          const success = responses.every((r) => r.status === ResponseStatus.SUCCESS);
          if (success) {
            console.log(`[DataSyncProvider] updateAll successful`);
            subscriber.next(responses.map((r) => r.data).filter(Boolean) as T);
            subscriber.complete();
          } else {
            handleError(new Error("Failed to update all records"));
          }
          if (requestKey) this.inFlightRequests.delete(requestKey);
        })
        .catch((err) => {
          handleError(err);
        });
    } else {
      console.log(`[DataSyncProvider] Invoking manageData with payload:`, payload);
      invoke<Response<T>>("manageData", payload)
        .then((response: Response<T>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            console.log(
              `[DataSyncProvider] Tauri response success for ${operation} on ${params.table}`,
              response.data
            );
            subscriber.next(response.data as T);
            subscriber.complete();
          } else {
            console.error(
              `[DataSyncProvider] Tauri response error for ${operation} on ${params.table}`,
              response
            );
            handleError(new Error(response.message || `Failed to ${operation}`));
          }
          if (requestKey) this.inFlightRequests.delete(requestKey);
        })
        .catch((err) => {
          handleError(err);
        });
    }
  }

  /**
   * Queue operation for later retry when offline
   */
  private queueOperation(operation: Operation, params: CrudParams): void {
    // Don't queue read operations
    if (operation === "getAll" || operation === "get") {
      return;
    }

    // Entity type is same as table name (both are plural)
    const entityType = params.table;

    this.offlineQueueService.enqueue({
      operation: operation as "create" | "update" | "delete",
      entityType,
      entityId: params.id || "",
      data: params.data,
      parentTodoId: params.parentTodoId,
      syncMetadata: params.syncMetadata,
    });
  }

  // ==================== CRUD OPERATIONS ====================

  /**
   * Unified CRUD operation method with WebSocket fallback and caching
   * Similar to LocalWebSocketService.crud() but with additional features:
   * - Automatic WebSocket → Tauri fallback
   * - Response caching with TTL
   * - In-flight request deduplication
   * - Offline queue support
   * - Automatic StorageService updates
   *
   * @param operation - CRUD operation type
   * @param table - Database table name (plural: "todos", "tasks", etc.)
   * @param options - Operation options
   * @param isArray - Whether the result is an array (for caching)
   * @returns Observable with the result
   *
   * @example
   * // Create a todo
   * dataSyncProvider.crud("create", "todos", { data: todoData }).subscribe(...)
   *
   * @example
   * // Get tasks with filter
   * dataSyncProvider.crud("get", "tasks", { filter: { todoId } }).subscribe(...)
   *
   * @example
   * // Get all todos
   * dataSyncProvider.crud("getAll", "todos", { filter: { userId } }, true).subscribe(...)
   *
   * @example
   * // Update a task
   * dataSyncProvider.crud("update", "tasks", { id: taskId, data: updates }).subscribe(...)
   *
   * @example
   * // Delete a subtask
   * dataSyncProvider.crud("delete", "subtasks", { id: subtaskId }).subscribe(...)
   */
  crud<T>(
    operation: Operation,
    table: string,
    options: {
      filter?: { [key: string]: any };
      data?: any;
      id?: string;
      parentTodoId?: string;
      relations?: RelationObj[];
      isOwner?: boolean;
      isPrivate?: boolean;
    } = {},
    isArray: boolean = false
  ): Observable<T> {
    this.validateTable(table);
    const crudParams = this.buildCrudParams(table, options);
    return this.executeWithFallback<T>(operation, crudParams, isArray).pipe(
      tap((result) => {
        // Auto-update storage for write operations
        if (operation !== "get" && operation !== "getAll") {
          this.updateStorageAfterOperation(operation, table, result, options.id);
          this.clearCacheForTable(table);
        }
        // Special case: getAll for chats should also update storage
        if (operation === "getAll" && table === "chats") {
          const chats = result as any[];
          if (chats && chats.length > 0) {
            const todoId = chats[0]?.todoId || options.filter?.['todoId'];
            if (todoId) {
              this.storageService.setChatsByTodo(todoId, chats);
            }
          }
        }
      })
    );
  }

  async syncAfterVisibilityChange(newVisibility: "private" | "team"): Promise<void> {
    console.log(`[DataSyncProvider] syncAfterVisibilityChange to: ${newVisibility}`);
    try {
      if (newVisibility === "private") {
        await this.syncService.importToLocal();
      } else {
        await this.syncService.exportToCloud();
      }
      this.clearCache();
    } catch (error) {
      console.error(`[DataSyncProvider] syncAfterVisibilityChange failed`, error);
    }
  }

  // ==================== PROFILE OPERATIONS ====================
  // Note: Use standard create(), update(), get() methods directly for profile operations
  // Example: this.dataSyncProvider.create<Profile>("profiles", data)
  //          this.dataSyncProvider.update<Profile>("profiles", id, data)
  //          this.dataSyncProvider.get<Profile>("profiles", { userId })

  /**
   * Get profile by userId
   * FIX: Returns null (not {}) when profile not found, includes caching
   */
  getProfileByUserId(userId: string, relations?: RelationObj[]): Observable<Profile | null> {
    // Check cache first (profile doesn't change often)
    const cacheKey = `profile:${userId}`;
    const cached = this.requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 60000) {
      // 1 min cache for profile
      return of(cached.data as Profile);
    }

    // Use crud with getAll to find profile by userId
    return new Observable<Profile | null>((subscriber) => {
      this.crud<Profile[]>("getAll", "profiles", { filter: { userId }, relations }, true).subscribe({
        next: (results: Profile[]) => {
          if (results && results.length > 0) {
            const profile = results[0];
            // Cache the profile
            this.requestCache.set(cacheKey, { data: profile, timestamp: Date.now() });
            subscriber.next(profile);
          } else {
            // ✅ FIX: Return null, not empty object
            subscriber.next(null);
          }
        },
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });
    });
  }

  // ==================== STORAGE UPDATE HELPERS ====================

  /**
   * Update StorageService after successful CRUD operation
   * Uses switch statement to handle different operation types
   */
  private updateStorageAfterOperation(
    operation: Operation,
    table: string,
    result: any,
    id?: string
  ): void {
    try {
      switch (operation) {
        case "create":
          console.log(`[DataSyncProvider] Updating storage after create: ${table}`, result);
          this.storageService.addItem(table as any, result);
          break;

        case "update":
          if (!result || !result.id) {
            console.warn(`[DataSyncProvider] Cannot update storage: missing id in result`, result);
            return;
          }
          console.log(`[DataSyncProvider] Updating storage after update: ${table}`, result);
          this.storageService.updateItem(table as any, result.id, result);
          break;

        case "delete":
          console.log(`[DataSyncProvider] Updating storage after delete: ${table}, id: ${id}`);
          this.storageService.removeItem(table as any, id!);
          break;

        case "updateAll":
          console.log(`[DataSyncProvider] Updating storage after updateAll: ${table}`, result);
          (result as any[]).forEach((item) => {
            if (item && item.id) {
              this.storageService.updateItem(table as any, item.id, item);
            }
          });
          break;
      }
    } catch (error) {
      console.error(`[DataSyncProvider] Failed to update storage after ${operation}`, error);
    }
  }

  // ==================== CACHE MANAGEMENT ====================

  /**
   * Clear cache for a specific table or all tables
   * Called after create/update/delete operations to prevent stale data
   */
  clearCache(table?: string): void {
    if (table) {
      // Clear cache entries for specific table
      for (const key of this.requestCache.keys()) {
        if (key.includes(`:${table}:`)) {
          this.requestCache.delete(key);
        }
      }
    } else {
      // Clear all caches
      this.requestCache.clear();
    }
  }

  /**
   * Clear cache when data is modified (create, update, delete)
   */
  private clearCacheForTable(table: string): void {
    this.clearCache(table);
  }
}
