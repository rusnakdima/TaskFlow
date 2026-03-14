/* sys lib */
import { Injectable, Injector, inject } from "@angular/core";
import { Observable, from, share, of, firstValueFrom } from "rxjs";
import { invoke } from "@tauri-apps/api/core";
import { finalize, tap, catchError, map } from "rxjs/operators";

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
    this.offlineQueueService.setExecuteFunction(
      (operation, entityType, entityId, data, parentTodoId) =>
        this.executeOperationForQueue(operation, entityType, entityId, data, parentTodoId)
    );
  }

  private async executeOperationForQueue(
    operation: "create" | "update" | "delete",
    entityType: string,
    entityId: string,
    data?: any,
    parentTodoId?: string
  ): Promise<any> {
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
      obs.subscribe({ next: resolve, error: reject });
    });
  }

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

  private resolveMetadataInternal(
    table: string,
    todoId?: string,
    record?: any,
    id?: string
  ): SyncMetadata {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const currentUserId = this.jwtTokenService.getUserId(token);
    let metadata: SyncMetadata = { isOwner: true, isPrivate: true };

    if (table === "todos") {
      const targetId = id || record?.id || todoId;
      const todo = record || (targetId ? this.storageService.getTodoById(targetId) : null);
      if (todo) {
        metadata.isPrivate = todo.visibility === "private";
        metadata.isOwner = todo.userId === currentUserId;
        return metadata;
      }
    }

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

  private async resolveMetadataAsync(table: string, id: string): Promise<SyncMetadata> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const currentUserId = this.jwtTokenService.getUserId(token);
    const metadata: SyncMetadata = { isOwner: true, isPrivate: true };

    if (table === "todos") {
      try {
        const todo = await firstValueFrom(
          this.crud<Todo>("get", "todos", { filter: { id } }).pipe(catchError(() => of(null)))
        );
        if (todo) {
          return {
            isPrivate: todo.visibility === "private",
            isOwner: todo.userId === currentUserId,
          };
        }
      } catch {
        /* Fall through */
      }
    }

    if (table === "tasks") {
      try {
        const task = await firstValueFrom(
          this.crud<Task>("get", "tasks", { filter: { id } }).pipe(catchError(() => of(null)))
        );
        if (task && task.todoId) {
          const todo = await firstValueFrom(
            this.crud<Todo>("get", "todos", { filter: { id: task.todoId } }).pipe(
              catchError(() => of(null))
            )
          );
          if (todo) {
            return {
              isPrivate: todo.visibility === "private",
              isOwner: todo.userId === currentUserId,
            };
          }
        }
      } catch {
        /* Fall through */
      }
    }

    return metadata;
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
    // Inline validateTable
    if (!this.allowedTables.includes(table)) {
      throw new Error(
        `Table '${table}' is not supported. Allowed: ${this.allowedTables.join(", ")}`
      );
    }

    const metadata =
      options.isOwner !== undefined
        ? { isOwner: options.isOwner, isPrivate: options.isPrivate ?? true }
        : this.resolveMetadataInternal(
            table,
            options.parentTodoId || options.data?.todoId,
            options.data,
            options.id
          );

    // Inline getDefaultRelations
    const relations = options.relations ?? RelationsHelper.getRelationsForTable(table);

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

  private inFlightRequests = new Map<string, Observable<any>>();
  private requestCache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL_MS = 5000;

  private executeWithFallback<T>(
    operation: Operation,
    params: CrudParams,
    isArray: boolean = false
  ): Observable<T> {
    const requestKey = `${operation}:${params.table}:${params.id || "no-id"}`;

    if (operation === "get" || operation === "getAll") {
      const cached = this.requestCache.get(requestKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return of(cached.data as T);
      }
    }

    const existingRequest = this.inFlightRequests.get(requestKey);
    if (existingRequest) {
      return existingRequest as Observable<T>;
    }

    let wsSubscription: any = null;
    let retryTimeout: any = null;

    const request$ = new Observable<T>((subscriber) => {
      const tryWebSocket = (attempt: number) => {
        const isConnected = this.localWebSocketService.isConnected();

        if (isConnected) {
          wsSubscription = this.localWebSocketService.crud<T>(operation, params).subscribe({
            next: (data) => {
              subscriber.next(data);
              subscriber.complete();
            },
            error: (err) => {
              this.executeTauriFallback(operation, params, subscriber, requestKey);
            },
            complete: () => {},
          });
        } else if (attempt < 3) {
          retryTimeout = setTimeout(() => tryWebSocket(attempt + 1), 100);
        } else {
          this.executeTauriFallback(operation, params, subscriber, requestKey);
        }
      };

      tryWebSocket(0);
      return () => {
        if (wsSubscription) wsSubscription.unsubscribe();
        if (retryTimeout) clearTimeout(retryTimeout);
      };
    }).pipe(
      share(),
      tap({
        next: (data) => {
          if (operation === "get" || operation === "getAll") {
            this.requestCache.set(requestKey, { data, timestamp: Date.now() });
          }
        },
      }),
      finalize(() => {
        this.inFlightRequests.delete(requestKey);
      })
    );

    this.inFlightRequests.set(requestKey, request$);
    return request$;
  }

  private executeTauriFallback<T>(
    operation: Operation,
    params: CrudParams,
    subscriber: any,
    requestKey: string
  ): void {
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
      const isValidationError =
        err?.message?.includes("Validation failed") ||
        (err?.status === "Error" && err?.message?.includes("Validation"));
      if (operation !== "getAll" && operation !== "get" && !isValidationError) {
        this.queueOperation(operation, params);
      }
      subscriber.error(err);
      if (requestKey) this.inFlightRequests.delete(requestKey);
    };

    if (operation === "updateAll" && params.data) {
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
            handleError(new Error("Failed to update all records"));
          }
          if (requestKey) this.inFlightRequests.delete(requestKey);
        })
        .catch((err) => {
          handleError(err);
        });
    } else {
      invoke<Response<T>>("manageData", payload)
        .then((response: Response<T>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as T);
            subscriber.complete();
          } else {
            handleError(new Error(response.message || `Failed to ${operation}`));
          }
          if (requestKey) this.inFlightRequests.delete(requestKey);
        })
        .catch((err) => {
          handleError(err);
        });
    }
  }

  private queueOperation(operation: Operation, params: CrudParams): void {
    if (operation === "getAll" || operation === "get") {
      return;
    }
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
    const crudParams = this.buildCrudParams(table, options);
    return this.executeWithFallback<T>(operation, crudParams, isArray).pipe(
      tap((result) => {
        if (operation !== "get" && operation !== "getAll") {
          this.updateStorageAfterOperation(operation, table, result, options.id);
          this.clearCache(table);
        }
        if (operation === "getAll" && table === "chats") {
          const chats = result as any[];
          if (chats && chats.length > 0) {
            const todoId = chats[0]?.todoId || options.filter?.["todoId"];
            if (todoId) {
              this.storageService.setChatsByTodo(todoId, chats);
            }
          }
        }
      })
    );
  }

  getProfileByUserId(userId: string): Observable<Profile | null> {
    // Always fetch from backend with userId filter to get latest profile
    return this.crud<Profile[]>("getAll", "profiles", { filter: { userId: userId } }, true).pipe(
      map((profiles) => {
        const profile = profiles && profiles.length > 0 ? profiles[0] : null;
        if (profile) {
          this.storageService.setProfile(profile);
        }
        return profile;
      })
    );
  }

  async syncAfterVisibilityChange(newVisibility: "private" | "team"): Promise<void> {
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

  private updateStorageAfterOperation(
    operation: Operation,
    table: string,
    result: any,
    id?: string
  ): void {
    try {
      switch (operation) {
        case "create":
          this.storageService.addItem(table as any, result);

          // For comments, also add to parent task/subtask (check for duplicates)
          if (table === "comments" && result) {
            if (result.taskId) {
              const existingTask = this.storageService.getTaskById(result.taskId);
              if (existingTask) {
                const commentExists = (existingTask.comments || []).some((c: any) => c.id === result.id);
                if (!commentExists) {
                  const updatedComments = [...(existingTask.comments || []), result];
                  this.storageService.updateItem("tasks", result.taskId, {
                    ...existingTask,
                    comments: updatedComments
                  });
                }
              }
            } else if (result.subtaskId) {
              const existingSubtask = this.storageService.getSubtaskById(result.subtaskId);
              if (existingSubtask) {
                const commentExists = (existingSubtask.comments || []).some((c: any) => c.id === result.id);
                if (!commentExists) {
                  const updatedComments = [...(existingSubtask.comments || []), result];
                  this.storageService.updateItem("subtasks", result.subtaskId, {
                    ...existingSubtask,
                    comments: updatedComments
                  });
                }
              }
            }
          }
          break;
        case "update":
          if (!result || !result.id) {
            return;
          }

          // For tasks, preserve comments and subtasks fields
          if (table === "tasks") {
            const existingTask = this.storageService.getTaskById(result.id);
            if (existingTask) {
              const mergedResult = {
                ...result,
                comments: (result.comments && result.comments.length > 0) ? result.comments : existingTask.comments,
                subtasks: (result.subtasks && result.subtasks.length > 0) ? result.subtasks : existingTask.subtasks
              };
              this.storageService.updateItem(table as any, result.id, mergedResult);
              return;
            }
          }

          // For subtasks, preserve comments field
          if (table === "subtasks") {
            const existingSubtask = this.storageService.getSubtaskById(result.id);
            if (existingSubtask) {
              const mergedResult = {
                ...result,
                comments: (result.comments && result.comments.length > 0) ? result.comments : existingSubtask.comments
              };
              this.storageService.updateItem(table as any, result.id, mergedResult);
              return;
            }
          }

          this.storageService.updateItem(table as any, result.id, result);
          break;
        case "delete":
          this.storageService.removeItem(table as any, id!);
          break;
        case "updateAll":
          (result as any[]).forEach((item) => {
            if (item && item.id) {
              this.storageService.updateItem(table as any, item.id, item);
            }
          });
          break;
      }
    } catch (error) {
      // Failed to update storage after operation
    }
  }

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
}
