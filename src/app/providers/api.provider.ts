/* sys lib */
import { Injectable, Injector, inject } from "@angular/core";
import { Observable, from, of, firstValueFrom, defer } from "rxjs";
import { invoke } from "@tauri-apps/api/core";
import { finalize, tap, catchError, map, switchMap } from "rxjs/operators";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { RelationObj } from "@models/relation-obj.model";
import { SyncMetadata } from "@models/sync-metadata";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";
import { NetworkErrorHelper } from "@helpers/network-error.helper";

/* services */
import { WebSocketService } from "@services/core/websocket.service";
import { SyncService } from "@services/data/sync.service";
import { StorageService } from "@services/core/storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";

type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

interface CrudParams {
  table: string;
  filter?: { [key: string]: any };
  data?: any;
  id?: string;
  parentTodoId?: string;
  relations?: RelationObj[];
  load?: string[]; // NEW: TypeORM-like dot notation for relations
  syncMetadata?: SyncMetadata;
}

// Constants
const ALLOWED_TABLES = [
  "todos",
  "tasks",
  "subtasks",
  "categories",
  "chats",
  "comments",
  "profiles",
  "users",
];
const CACHE_TTL_MS = 5000;
const WS_RETRY_ATTEMPTS = 3;
const WS_RETRY_DELAY_MS = 100;

@Injectable({
  providedIn: "root",
})
export class ApiProvider {
  private ws = inject(WebSocketService);
  private notifyService = inject(NotifyService);
  private jwtTokenService = inject(JwtTokenService);
  private injector = inject(Injector);

  private inFlightRequests = new Map<string, Observable<any>>();
  private requestCache = new Map<string, { data: any; timestamp: number }>();

  constructor() {}

  private get syncService(): SyncService {
    return this.injector.get(SyncService);
  }

  private get storageService(): StorageService {
    return this.injector.get(StorageService);
  }

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

  // ==================== Metadata Resolution ====================

  private getCurrentUserId(): string | null {
    const token = this.jwtTokenService.getToken();
    return this.jwtTokenService.getUserId(token);
  }

  private createDefaultMetadata(): SyncMetadata {
    return { isOwner: true, isPrivate: true };
  }

  private resolveMetadata(table: string, todoId?: string, record?: any, id?: string): SyncMetadata {
    const currentUserId = this.getCurrentUserId();
    const metadata: SyncMetadata = this.createDefaultMetadata();

    if (table === "todos") {
      const targetId = id || record?.id || todoId;
      const todo = record || (targetId ? this.storageService.getById("todos", targetId) : null);
      if (todo) {
        return {
          isPrivate: todo.visibility === "private",
          isOwner: todo.userId === currentUserId,
        };
      }
    }

    const effectiveTodoId = this.resolveTodoId(table, todoId, record, id);
    if (effectiveTodoId) {
      const todo = this.storageService.getById("todos", effectiveTodoId);
      if (todo) {
        metadata.isPrivate = todo.visibility === "private";
        metadata.isOwner = todo.userId === currentUserId;
      }
    }

    return metadata;
  }

  private async resolveMetadataAsync(table: string, id: string): Promise<SyncMetadata> {
    const currentUserId = this.getCurrentUserId();
    const defaultMetadata: SyncMetadata = this.createDefaultMetadata();

    try {
      if (table === "todos") {
        const todo = await this.fetchEntityById<Todo>("todos", id);
        if (todo) {
          return {
            isPrivate: todo.visibility === "private",
            isOwner: todo.userId === currentUserId,
          };
        }
      }

      if (table === "tasks") {
        const task = await this.fetchEntityById<Task>("tasks", id);
        if (task?.todoId) {
          const todo = await this.fetchEntityById<Todo>("todos", task.todoId);
          if (todo) {
            return {
              isPrivate: todo.visibility === "private",
              isOwner: todo.userId === currentUserId,
            };
          }
        }
      }
    } catch {
      // Fall through to default metadata
    }

    return defaultMetadata;
  }

  private resolveTodoId(table: string, todoId?: string, record?: any, id?: string): string | null {
    let effectiveTodoId = todoId || record?.todoId;

    if (!effectiveTodoId && (record?.id || id)) {
      const targetId = id || record?.id;
      if (table === "tasks") {
        effectiveTodoId = this.storageService.getById("tasks", targetId!)?.todoId;
      } else if (table === "subtasks") {
        const subtask = this.storageService.getById("subtasks", targetId!);
        if (subtask) {
          effectiveTodoId = this.storageService.getById("tasks", subtask.taskId)?.todoId;
        }
      }
    }

    return effectiveTodoId || null;
  }

  private async fetchEntityById<T>(table: string, id: string): Promise<T | null> {
    try {
      return await firstValueFrom(
        this.crud<T>("get", table, { id }).pipe(catchError(() => of(null)))
      );
    } catch {
      return null;
    }
  }

  // ==================== CRUD Parameter Building ====================

  private buildCrudParams(
    table: string,
    options: {
      filter?: { [key: string]: any };
      data?: any;
      id?: string;
      parentTodoId?: string;
      relations?: RelationObj[];
      load?: string[]; // NEW: TypeORM-like dot notation
      isOwner?: boolean;
      isPrivate?: boolean;
    }
  ): CrudParams {
    if (!ALLOWED_TABLES.includes(table)) {
      throw new Error(`Table '${table}' is not supported. Allowed: ${ALLOWED_TABLES.join(", ")}`);
    }

    const metadata =
      options.isOwner !== undefined
        ? { isOwner: options.isOwner, isPrivate: options.isPrivate ?? true }
        : this.resolveMetadata(
            table,
            options.parentTodoId || options.data?.todoId,
            options.data,
            options.id
          );

    // Use load parameter if provided, otherwise fall back to relations helper
    const load = options.load;
    const relations = !load
      ? (options.relations ?? RelationsHelper.getRelationsForTable(table))
      : undefined;

    const result = {
      table,
      filter: options.filter,
      data: options.data,
      id: options.id,
      parentTodoId: options.parentTodoId,
      relations,
      load, // NEW: Pass load parameter to backend
      syncMetadata: metadata,
    };
    return result;
  }

  // ==================== Request Execution ====================

  private buildRequestKey(
    operation: Operation,
    table: string,
    id?: string,
    filter?: { [key: string]: any }
  ): string {
    const filterKey = filter ? JSON.stringify(Object.entries(filter).sort()) : "no-filter";
    return `${operation}:${table}:${id || "no-id"}:${filterKey}`;
  }

  private executeWithFallback<T>(operation: Operation, params: CrudParams): Observable<T> {
    const requestKey = this.buildRequestKey(operation, params.table, params.id, params.filter);

    if (this.isCacheable(operation)) {
      const cached = this.getCached(requestKey);
      if (cached) {
        return of(cached as T);
      }
    }

    const existingRequest = this.inFlightRequests.get(requestKey);
    if (existingRequest) {
      return existingRequest as Observable<T>;
    }

    // Use defer to ensure the Observable is created lazily when subscribed
    const request$ = defer(() => {
      return new Observable<T>((subscriber) => {
        this.tryWebSocket(operation, params, requestKey, subscriber, 0);
      });
    }).pipe(
      tap({
        next: (data) => {
          if (this.isCacheable(operation)) {
            this.cacheRequest(requestKey, data);
          }
        },
        error: (err) => {
          // Error logged internally
        },
      }),
      finalize(() => {
        this.inFlightRequests.delete(requestKey);
      })
    );

    this.inFlightRequests.set(requestKey, request$);
    return request$;
  }

  private isCacheable(operation: Operation): boolean {
    return operation === "get" || operation === "getAll";
  }

  private getCached(requestKey: string): any | null {
    const cached = this.requestCache.get(requestKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    return null;
  }

  private cacheRequest(requestKey: string, data: any): void {
    this.requestCache.set(requestKey, { data, timestamp: Date.now() });
  }

  private tryWebSocket<T>(
    operation: Operation,
    params: CrudParams,
    requestKey: string,
    subscriber: any,
    attempt: number
  ): void {
    if (this.ws.isConnected()) {
      const wsSubscription = this.ws.crud<T>(operation, params).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => {
          this.executeTauriFallback(operation, params, subscriber, requestKey);
        },
        complete: () => {
          // WebSocket subscription completed
        },
      });

      // Store subscription to allow cleanup if needed
      subscriber.add(wsSubscription);
    } else if (attempt < WS_RETRY_ATTEMPTS) {
      setTimeout(
        () => this.tryWebSocket(operation, params, requestKey, subscriber, attempt + 1),
        WS_RETRY_DELAY_MS
      );
    } else {
      this.executeTauriFallback(operation, params, subscriber, requestKey);
    }
  }

  // ==================== Tauri Fallback ====================

  private executeTauriFallback<T>(
    operation: Operation,
    params: CrudParams,
    subscriber: any,
    requestKey: string
  ): void {
    const payload = this.buildTauriPayload(operation, params);

    if (operation === "updateAll" && params.data) {
      this.executeUpdateAll(payload, params, subscriber, requestKey);
    } else {
      this.executeSingleOperation(payload, operation, params, subscriber, requestKey);
    }
  }

  private buildTauriPayload(operation: Operation, params: CrudParams): any {
    const payload: any = {
      operation,
      table: params.table,
      syncMetadata: params.syncMetadata,
    };

    if (params.filter) payload.filter = params.filter;
    if (params.relations) payload.relations = params.relations;
    if (params.load) payload.load = params.load; // NEW: Include load parameter
    if (params.id) payload.id = params.id;
    if (params.data) payload.data = params.data;

    return payload;
  }

  private handleError(
    err: any,
    operation: Operation,
    params: CrudParams,
    subscriber: any,
    requestKey?: string
  ): void {
    const errorMessage = err.message || String(err);

    if (errorMessage.includes("Record not found")) {
      this.handleRecordNotFound(operation, params, errorMessage);
    }

    subscriber.error(err);
    if (requestKey) {
      this.inFlightRequests.delete(requestKey);
    }
  }

  private handleRecordNotFound(
    operation: Operation,
    params: CrudParams,
    errorMessage: string
  ): void {
    const match = errorMessage.match(/Record not found:\s*(\w+)\/([^\s]+)/);
    if (!match) return;

    const table = match[1];
    const recordId = match[2];

    const operationVerb = operation === "update" || operation === "updateAll" ? "update" : operation;
    this.notifyService.showWarning(
      `Cannot ${operationVerb} ${table.slice(0, -1)}: record was deleted or not found. Refreshing...`
    );

    if (table === "tasks" || table === "subtasks" || table === "comments") {
      this.storageService.removeItem(table as any, recordId);
    }

    this.clearCache(table);
  }

  private executeUpdateAll<T>(
    payload: any,
    params: CrudParams,
    subscriber: any,
    requestKey: string
  ): void {
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
          subscriber.next(responses.map((r) => r.data).filter(Boolean) as T);
          subscriber.complete();
        } else {
          this.handleError(
            new Error("Failed to update all records"),
            "updateAll",
            params,
            subscriber,
            requestKey
          );
        }
        this.inFlightRequests.delete(requestKey);
      })
      .catch((err) => {
        this.handleError(err, "updateAll", params, subscriber, requestKey);
      });
  }

  private executeSingleOperation<T>(
    payload: any,
    operation: Operation,
    params: CrudParams,
    subscriber: any,
    requestKey: string
  ): void {
    invoke<Response<T>>("manageData", payload)
      .then((response: Response<T>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          subscriber.next(response.data as T);
          subscriber.complete();
        } else {
          this.handleError(
            new Error(response.message || `Failed to ${operation}`),
            operation,
            params,
            subscriber,
            requestKey
          );
        }
        this.inFlightRequests.delete(requestKey);
      })
      .catch((err) => {
        this.handleError(err, operation, params, subscriber, requestKey);
      });
  }

  // ==================== Public CRUD API ====================

  crud<T>(
    operation: Operation,
    table: string,
    options: {
      filter?: { [key: string]: any };
      data?: any;
      id?: string;
      parentTodoId?: string;
      relations?: RelationObj[];
      load?: string[]; // NEW: TypeORM-like dot notation for relations
      isOwner?: boolean;
      isPrivate?: boolean;
    } = {},
    isArray: boolean = false
  ): Observable<T> {
    const crudParams = this.buildCrudParams(table, options);
    return this.executeWithFallback<T>(operation, crudParams).pipe(
      tap((result) => {
        if (operation !== "get" && operation !== "getAll") {
          this.updateStorageAfterOperation(
            operation,
            table,
            result,
            options.id,
            options.parentTodoId
          );
          this.clearCache(table);
        }
        if (operation === "getAll" && table === "chats") {
          this.handleChatsResult(result as any[], options.filter);
        }
      })
    );
  }

  private handleChatsResult(chats: any[], filter?: { [key: string]: any }): void {
    if (chats && chats.length > 0) {
      const todoId = chats[0]?.todoId || filter?.["todoId"];
      if (todoId) {
        this.storageService.setChatsByTodo(todoId, chats);
      }
    }
  }

  // ==================== Visibility Sync ====================

  /**
   * Sync todo visibility change to local storage
   * Called after CRUD update successfully changes visibility in MongoDB
   *
   * Flow:
   * - Private → Team: Import from cloud to get updated visibility, TodoHandler auto-moves to shared
   * - Team → Private: Import from cloud to get updated visibility, TodoHandler auto-moves to private
   */
  async syncSingleTodoVisibilityChange(
    todoId: string,
    newVisibility: "private" | "team"
  ): Promise<void> {
    // Import the updated todo from cloud
    // The TodoHandler.update() will automatically detect visibility change
    // and move the todo between private/shared signals
    await this.importTodoToLocalDb(todoId);
    this.clearCache("todos");
  }

  private async importTodoToLocalDb(todoId: string): Promise<void> {
    // Fetch the latest todo from cloud using id parameter
    const cloudTodo = await firstValueFrom(
      this.crud<Todo>("get", "todos", { id: todoId }).pipe(catchError(() => of(null)))
    );

    if (!cloudTodo) {
      throw new Error(`Todo with id ${todoId} not found in cloud`);
    }

    // Update local storage with cloud data
    // TodoHandler.update() will automatically handle visibility change
    // and move todo between private/shared signals
    this.storageService.updateItem("todos", todoId, cloudTodo);
  }

  // ==================== Archive Operations ====================

  private archiveTodoWithCascade(todoId: string, isTeam: boolean = false): void {
    const todo = this.storageService.getById("todos", todoId);
    if (!todo) return;

    // For team entities, pass isPrivate: false to prevent local JSON persistence
    const options = { isPrivate: !isTeam };

    // Archive todo
    this.storageService.updateItem(
      "todos",
      todoId,
      { deleted_at: new Date().toISOString() },
      options
    );

    // Archive all tasks and their subtasks/comments
    todo.tasks?.forEach((task) => {
      this.storageService.updateItem(
        "tasks",
        task.id,
        { deleted_at: new Date().toISOString() },
        options
      );

      // Archive all subtasks and their comments
      task.subtasks?.forEach((subtask) => {
        this.storageService.updateItem(
          "subtasks",
          subtask.id,
          { deleted_at: new Date().toISOString() },
          options
        );

        // Archive subtask comments
        subtask.comments?.forEach((comment: Comment) => {
          this.storageService.updateItem(
            "comments",
            comment.id,
            { deleted_at: new Date().toISOString() },
            options
          );
        });
      });

      // Archive task comments
      task.comments?.forEach((comment: Comment) => {
        this.storageService.updateItem(
          "comments",
          comment.id,
          { deleted_at: new Date().toISOString() },
          options
        );
      });
    });

    // Archive chats for this todo (H-4)
    this.storageService.clearChatsByTodo(todoId);
  }

  // ==================== Storage Updates ====================

  /**
   * Check if an entity belongs to a team visibility todo
   * Team entities should only update in-memory signals, not persist to local JSON
   */
  private isTeamEntity(table: string, id?: string, parentTodoId?: string): boolean {
    if (table === "todos" && id) {
      const todo = this.storageService.getById("todos", id);
      return todo?.visibility === "team";
    }

    if (table === "tasks" && id) {
      const todoId = parentTodoId || this.storageService.getById("tasks", id)?.todoId;
      if (!todoId) return false;
      const todo = this.storageService.getById("todos", todoId);
      return todo?.visibility === "team";
    }

    if (table === "subtasks" && id) {
      const taskId = this.storageService.getById("subtasks", id)?.taskId;
      if (!taskId) return false;
      const task = this.storageService.getById("tasks", taskId);
      if (!task?.todoId) return false;
      const todo = this.storageService.getById("todos", task.todoId);
      return todo?.visibility === "team";
    }

    if (table === "comments" && id) {
      // Comments can be on tasks or subtasks - find parent todo (H-5)
      const comment = this.storageService.getById("comments", id);
      if (comment?.taskId) {
        const task = this.storageService.getById("tasks", comment.taskId);
        if (task?.todoId) {
          const todo = this.storageService.getById("todos", task.todoId);
          return todo?.visibility === "team";
        }
      }
      if (comment?.subtaskId) {
        const taskId = this.storageService.getById("subtasks", comment.subtaskId)?.taskId;
        if (taskId) {
          const task = this.storageService.getById("tasks", taskId);
          if (task?.todoId) {
            const todo = this.storageService.getById("todos", task.todoId);
            return todo?.visibility === "team";
          }
        }
      }
    }

    return false;
  }

  private updateStorageAfterOperation(
    operation: Operation,
    table: string,
    result: any,
    id?: string,
    parentTodoId?: string
  ): void {
    try {
      // Trigger notification for all successful mutations (create/update/delete)
      if (operation !== "get" && operation !== "getAll") {
        this.notifyService.handleLocalAction(table, operation, result || { id });
      }

      // Check if this is a team entity - if so, only update in-memory (not local JSON)
      const isTeam = this.isTeamEntity(table, id, parentTodoId);

      switch (operation) {
        case "create":
          this.handleCreateOperation(table, result, isTeam);
          break;
        case "update":
          this.handleUpdateOperation(table, result, isTeam);
          break;
        case "delete":
          // For soft delete (archive), update deleted_at field instead of removing
          if (table === "todos") {
            // Archive todo with cascade (set deleted_at !== null for todo and all related entities)
            this.archiveTodoWithCascade(id!, isTeam);
          } else {
            // For tasks/subtasks, lookup parent ID before deletion
            let parentId: string | undefined;
            if (table === "tasks") {
              parentId = this.storageService.getById("tasks", id!)?.todoId;
            } else if (table === "subtasks") {
              parentId = this.storageService.getById("subtasks", id!)?.taskId;
            }
            this.storageService.removeItem(table as any, id!, parentId, isTeam);
          }
          break;
        case "updateAll":
          // Special handling for chats - set the entire list
          if (table === "chats" && result && Array.isArray(result)) {
            const todoId = parentTodoId || (result[0] as any)?.todoId;
            if (todoId) {
              this.storageService.setChatsByTodo(todoId, result);
            }
          } else {
            (result as any[]).forEach((item) => {
              if (item && item.id) {
                this.storageService.updateItem(table as any, item.id, item, { isPrivate: !isTeam });
              }
            });
          }
          break;
      }
    } catch (error) {
      // Error silently ignored
    }
  }

  private handleCreateOperation(table: string, result: any, isTeam: boolean = false): void {
    // For team entities, pass isPrivate: false to prevent local JSON persistence
    this.storageService.addItem(table as any, result, { isPrivate: !isTeam });
    // Comments are automatically added to their parent (task/subtask) by StorageService.addItem
  }

  private handleUpdateOperation(table: string, result: any, isTeam: boolean = false): void {
    if (!result || !result.id) {
      return;
    }

    // For team entities, pass isPrivate: false to prevent local JSON persistence
    const options = { isPrivate: !isTeam };

    if (table === "tasks") {
      const existingTask = this.storageService.getById("tasks", result.id);
      if (existingTask) {
        const merged = this.preserveEntityFields(result, existingTask, ["comments", "subtasks"]);
        this.storageService.updateItem(table as any, result.id, merged, options);
      } else {
        // Entity not in storage, update with backend response directly
        this.storageService.updateItem(table as any, result.id, result, options);
      }
      return;
    }

    if (table === "subtasks") {
      const existingSubtask = this.storageService.getById("subtasks", result.id);
      if (existingSubtask) {
        const merged = this.preserveEntityFields(result, existingSubtask, ["comments"]);
        this.storageService.updateItem(table as any, result.id, merged, options);
      } else {
        // Entity not in storage, update with backend response directly
        this.storageService.updateItem(table as any, result.id, result, options);
      }
      return;
    }

    this.storageService.updateItem(table as any, result.id, result, options);
  }

  private preserveEntityFields<T extends Record<string, any>>(
    incoming: T,
    existing: T,
    fieldsToPreserve: string[]
  ): T {
    const result: any = { ...incoming };
    for (const field of fieldsToPreserve) {
      const incomingValue = incoming[field];
      const existingValue = existing[field];

      // Always prefer incoming value if it exists (backend is source of truth)
      // Only use existing value if incoming doesn't have this field
      if (incomingValue !== undefined && incomingValue !== null) {
        result[field] = incomingValue;
      } else if (existingValue) {
        result[field] = existingValue;
      }
    }

    return result as T;
  }

  // ==================== Cache Management ====================

  clearCache(table?: string): void {
    if (table) {
      for (const key of this.requestCache.keys()) {
        if (key.includes(`:${table}:`)) {
          this.requestCache.delete(key);
        }
      }
    } else {
      this.requestCache.clear();
    }
  }

  // ==================== Connection Management ====================

  /**
   * Check MongoDB connection with timeout
   * @param timeoutMs - Timeout in milliseconds (default: 5000ms)
   * @returns Observable that emits true if connection successful, false otherwise
   * @deprecated Backend now uses local JSON first - this is for diagnostics only
   */
  checkMongoDbConnection(timeoutMs: number = 5000): Observable<boolean> {
    return new Observable<boolean>((subscriber) => {
      const timeoutId = setTimeout(() => {
        subscriber.next(false);
        subscriber.complete();
      }, timeoutMs);

      // Try a simple operation to test connection
      this.crud<any[]>("getAll", "users", { filter: {} }, true).subscribe({
        next: () => {
          clearTimeout(timeoutId);
          subscriber.next(true);
          subscriber.complete();
        },
        error: (err) => {
          clearTimeout(timeoutId);
          // Check if it's a network error
          const isNetworkError = NetworkErrorHelper.isNetworkError(err);
          subscriber.next(!isNetworkError);
          subscriber.complete();
        },
      });
    });
  }
}
