/* sys lib */
import { Injectable, Injector, inject } from "@angular/core";
import { Observable, from, of, firstValueFrom, defer } from "rxjs";
import { invoke } from "@tauri-apps/api/core";
import { finalize, tap, catchError, map } from "rxjs/operators";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { RelationObj } from "@models/relation-obj.model";
import { SyncMetadata } from "@models/sync-metadata";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";

/* helpers */
import { CacheHelper } from "@helpers/cache.helper";
import { CrudParamsBuilder, CrudParams } from "@helpers/crud-params.helper";
import { StorageUpdateHelper } from "@helpers/storage-update.helper";

/* services */
import { SyncService } from "@services/data/sync.service";
import { StorageService } from "@services/core/storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { SyncProgressService } from "@services/core/sync-progress.service";

type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

interface AdminDataWithRelations {
  [key: string]: any[];
}

@Injectable({
  providedIn: "root",
})
export class ApiProvider {
  private notifyService = inject(NotifyService);
  private jwtTokenService = inject(JwtTokenService);
  private injector = inject(Injector);

  private inFlightRequests = new Map<string, Observable<any>>();
  private cacheHelper = new CacheHelper();
  private storageUpdateHelper = new StorageUpdateHelper();

  constructor() {}

  private get syncService(): SyncService {
    return this.injector.get(SyncService);
  }

  private get syncProgressService(): SyncProgressService {
    return this.injector.get(SyncProgressService);
  }

  private get storageService(): StorageService {
    return this.injector.get(StorageService);
  }

  invokeCommand<T>(command: string, args: Record<string, any> = {}): Observable<T> {
    return from(
      invoke<Response<T>>(command, args)
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data as T;
          }
          const rawMessage = response?.message;
          let message: string;
          if (typeof rawMessage === "string") {
            message = rawMessage;
          } else if (rawMessage) {
            message = JSON.stringify(rawMessage);
          } else {
            message = "Unknown error";
          }
          throw new Error(message);
        })
        .catch((err) => {
          let errorMessage: string;
          if (err instanceof Error) {
            errorMessage = err.message;
          } else if (typeof err === "string") {
            errorMessage = err;
          } else if (err?.message) {
            errorMessage =
              typeof err.message === "string" ? err.message : JSON.stringify(err.message);
          } else {
            errorMessage = JSON.stringify(err) || "Unknown error";
          }
          throw new Error(errorMessage);
        })
    );
  }

  // ==================== Metadata Resolution ====================

  private getCurrentUserId(): string | null {
    const token = this.jwtTokenService.getToken();
    return this.jwtTokenService.getUserId(token);
  }

  private createDefaultMetadata(): SyncMetadata {
    return { is_owner: true, is_private: true };
  }

  private resolveMetadata(table: string, todoId?: string, record?: any, id?: string): SyncMetadata {
    const currentUserId = this.getCurrentUserId();
    const metadata: SyncMetadata = this.createDefaultMetadata();

    if (table === "todos") {
      const targetId = id || record?.id || todoId;
      const todo = record || (targetId ? this.storageService.getById("todos", targetId) : null);
      if (todo) {
        return {
          is_private: todo.visibility === "private",
          is_owner: todo.user_id === currentUserId,
        };
      }
    }

    const effectiveTodoId = this.resolveTodoId(table, todoId, record, id);
    if (effectiveTodoId) {
      const todo = this.storageService.getById("todos", effectiveTodoId);
      if (todo) {
        metadata.is_private = todo.visibility === "private";
        metadata.is_owner = todo.user_id === currentUserId;
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
            is_private: todo.visibility === "private",
            is_owner: todo.user_id === currentUserId,
          };
        }
      }

      if (table === "tasks") {
        const task = await this.fetchEntityById<Task>("tasks", id);
        if (task?.todo_id) {
          const todo = await this.fetchEntityById<Todo>("todos", task.todo_id);
          if (todo) {
            return {
              is_private: todo.visibility === "private",
              is_owner: todo.user_id === currentUserId,
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
    let effectiveTodoId = todoId || record?.todo_id;

    if (!effectiveTodoId && (record?.id || id)) {
      const targetId = id || record?.id;
      if (table === "tasks") {
        effectiveTodoId = this.storageService.getById("tasks", targetId!)?.todo_id;
      } else if (table === "subtasks") {
        const subtask = this.storageService.getById("subtasks", targetId!);
        if (subtask) {
          effectiveTodoId = this.storageService.getById("tasks", subtask.task_id)?.todo_id;
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
      load?: string[];
      isOwner?: boolean;
      isPrivate?: boolean;
    }
  ): CrudParams {
    return CrudParamsBuilder.build(table, options, this.resolveMetadata.bind(this));
  }

  // ==================== Request Execution ====================

  private buildRequestKey(
    operation: Operation,
    table: string,
    id?: string,
    filter?: { [key: string]: any }
  ): string {
    return CrudParamsBuilder.buildRequestKey(operation, table, id, filter);
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
    return this.cacheHelper.isCacheable(operation);
  }

  private getCached(requestKey: string): any | null {
    return this.cacheHelper.getCached(requestKey);
  }

  private cacheRequest(requestKey: string, data: any): void {
    this.cacheHelper.cacheRequest(requestKey, data);
  }

  private tryWebSocket<T>(
    operation: Operation,
    params: CrudParams,
    requestKey: string,
    subscriber: any,
    attempt: number
  ): void {
    // DISABLED WS - always use direct Tauri API calls
    this.executeTauriFallback(operation, params, subscriber, requestKey);
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
    if (params.load) payload.load = params.load;
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
    const isResponseError =
      err && typeof err.status !== "undefined" && typeof err.message !== "undefined";

    let errorMessage: string;
    if (isResponseError) {
      if (typeof err.message === "string") {
        errorMessage = err.message;
      } else if (err.message) {
        errorMessage = JSON.stringify(err.message);
      } else {
        errorMessage = "Unknown error";
      }
    } else if (typeof err?.message === "string") {
      errorMessage = err.message;
    } else if (err instanceof Error) {
      errorMessage = err.message;
    } else if (typeof err === "string") {
      errorMessage = err;
    } else if (err) {
      errorMessage = JSON.stringify(err);
    } else {
      errorMessage = "Unknown error";
    }

    if (isResponseError) {
      this.notifyService.showError(errorMessage);
    } else if (errorMessage.includes("Record not found")) {
      this.handleRecordNotFound(operation, params, errorMessage);
    } else {
      this.notifyService.showError(errorMessage);
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

    const operationVerb =
      operation === "update" || operation === "updateAll" ? "update" : operation;
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
          const firstError = responses.find((r) => r.status !== ResponseStatus.SUCCESS);
          const rawMessage = firstError?.message;
          let message: string;
          if (typeof rawMessage === "string") {
            message = rawMessage;
          } else if (rawMessage) {
            message = JSON.stringify(rawMessage);
          } else {
            message = "Failed to update all records";
          }
          this.notifyService.showError(message);
          subscriber.error(new Error(message));
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
          const rawMessage = response?.message;
          let message: string;
          if (typeof rawMessage === "string") {
            message = rawMessage;
          } else if (rawMessage) {
            message = JSON.stringify(rawMessage);
          } else {
            message = "Unknown error";
          }
          this.notifyService.showError(message);
          subscriber.error(new Error(message));
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
      const todoId = chats[0]?.todo_id || filter?.["todo_id"];
      if (todoId) {
        this.storageService.setChatsByTodo(chats, todoId);
      }
    }
  }

  // ==================== Visibility Change Sync ====================

  async syncSingleTodoVisibilityChange(
    newVisibility: "private" | "team",
    todo_id?: string,
  ): Promise<void> {
    if (!todo_id) return;
    const todo = this.storageService.getById("todos", todo_id);
    if (!todo) {
      throw new Error(`Todo with id ${todo_id} not found`);
    }

    const currentVisibility = todo.visibility;
    const isPrivateToTeam = currentVisibility === "private" && newVisibility === "team";
    const isTeamToPrivate = currentVisibility === "team" && newVisibility === "private";

    if (!isPrivateToTeam && !isTeamToPrivate) {
      await this.importTodoToLocalDb(todo_id);
      this.clearCache("todos");
      return;
    }

    const sourceProvider = isPrivateToTeam ? "Json" : "Mongo";
    const targetProvider = isPrivateToTeam ? "Mongo" : "Json";

    this.syncProgressService.startSync(
      "visibility_change",
      `Syncing todo to ${newVisibility}...`,
      10
    );

    try {
      await invoke<Response<any>>("syncVisibilityToProvider", {
        todo_id,
        sourceProvider,
        targetProvider,
      });

      this.clearCache("todos");
      this.syncProgressService.endSync();
    } catch (error) {
      this.syncProgressService.reset();
      throw error;
    }
  }

  private async syncPrivateTodoToTeam(todo: Todo): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.syncProgressService.updateProgress(0, "Exporting todo to team...");

        await this.withRetry(
          () => this.exportTodoToMongoDb(todo),
          attempt,
          `Exporting todo to MongoDB`
        );

        this.syncProgressService.updateProgress(
          this.countTodoChildren(todo),
          "Importing from MongoDB..."
        );

        await this.importTodoToLocalDb(todo.id);
        this.clearCache("todos");
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error("Failed to sync private todo to team after retries");
  }

  private async syncTeamTodoToPrivate(todo: Todo): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        this.syncProgressService.updateProgress(0, "Exporting todo to private...");

        await this.withRetry(
          () => this.exportTodoToJson(todo),
          attempt,
          `Exporting todo to local storage`
        );

        this.syncProgressService.updateProgress(
          this.countTodoChildren(todo),
          "Importing from local storage..."
        );

        await this.importTodoToLocalDb(todo.id);
        this.clearCache("todos");
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error("Failed to sync team todo to private after retries");
  }

  private countTodoChildren(todo: Todo): number {
    let count = 0;
    todo.tasks?.forEach((task) => {
      count++;
      task.subtasks?.forEach(() => {
        count++;
      });
      count++; // comments count approximation
    });
    return count;
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    attempt: number,
    operationName: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (attempt < 2) {
        const delay = Math.pow(2, attempt) * 1000;
        this.syncProgressService.setMessage(`${operationName} failed, retrying...`);
        await this.sleep(delay);
        return await operation();
      }
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async exportTodoToMongoDb(todo: Todo): Promise<void> {
    const todoWithoutRelations = this.stripRelations(todo);

    (await firstValueFrom(
      this.crud<Todo>("update", "todos", {
        id: todo.id,
        data: { ...todoWithoutRelations, visibility: "team" },
        isOwner: true,
        isPrivate: false,
      }).pipe(catchError(() => of(null)))
    )) as Todo;

    const taskSyncPromises: Promise<void>[] = [];
    todo.tasks?.forEach((task) => {
      const taskWithoutRelations = this.stripTaskRelations(task);
      taskSyncPromises.push(
        firstValueFrom(
          this.crud<Task>("update", "tasks", {
            id: task.id,
            data: taskWithoutRelations,
            isOwner: true,
            isPrivate: false,
          }).pipe(catchError(() => of(null)))
        ).then(() => {
          this.syncProgressService.updateProgress(
            this.syncProgressService.completedItems() + 1,
            "Syncing tasks..."
          );
        }) as Promise<void>
      );

      task.subtasks?.forEach((subtask) => {
        const subtaskWithoutRelations = this.stripSubtaskRelations(subtask);
        taskSyncPromises.push(
          firstValueFrom(
            this.crud<Subtask>("update", "subtasks", {
              id: subtask.id,
              data: subtaskWithoutRelations,
              isOwner: true,
              isPrivate: false,
            }).pipe(catchError(() => of(null)))
          ).then(() => {
            this.syncProgressService.updateProgress(
              this.syncProgressService.completedItems() + 1,
              "Syncing subtasks..."
            );
          }) as Promise<void>
        );

        subtask.comments?.forEach((comment: Comment) => {
          taskSyncPromises.push(
            firstValueFrom(
              this.crud<Comment>("create", "comments", {
                data: comment,
                isOwner: true,
                isPrivate: false,
              }).pipe(catchError(() => of(null)))
            ).then(() => {
              this.syncProgressService.updateProgress(
                this.syncProgressService.completedItems() + 1,
                "Syncing comments..."
              );
            }) as Promise<void>
          );
        });
      });

      task.comments?.forEach((comment: Comment) => {
        taskSyncPromises.push(
          firstValueFrom(
            this.crud<Comment>("create", "comments", {
              data: comment,
              isOwner: true,
              isPrivate: false,
            }).pipe(catchError(() => of(null)))
          ).then(() => {
            this.syncProgressService.updateProgress(
              this.syncProgressService.completedItems() + 1,
              "Syncing comments..."
            );
          }) as Promise<void>
        );
      });
    });

    await Promise.all(taskSyncPromises);

    const chatSyncPromises: Promise<void>[] = [];
    const chats = this.storageService.getChatsByTodo(todo.id);
    chats.forEach((chat: Chat) => {
      chatSyncPromises.push(
        firstValueFrom(
          this.crud<Chat>("create", "chats", {
            data: chat,
            isOwner: true,
            isPrivate: false,
          }).pipe(catchError(() => of(null)))
        ).then(() => {
          this.syncProgressService.updateProgress(
            this.syncProgressService.completedItems() + 1,
            "Syncing chats..."
          );
        }) as Promise<void>
      );
    });

    await Promise.all(chatSyncPromises);
  }

  private async exportTodoToJson(todo: Todo): Promise<void> {
    const todoWithoutRelations = this.stripRelations(todo);

    (await firstValueFrom(
      this.crud<Todo>("update", "todos", {
        id: todo.id,
        data: { ...todoWithoutRelations, visibility: "private" },
        isOwner: true,
        isPrivate: true,
      }).pipe(catchError(() => of(null)))
    )) as Todo;

    const taskSyncPromises: Promise<void>[] = [];
    todo.tasks?.forEach((task) => {
      const taskWithoutRelations = this.stripTaskRelations(task);
      taskSyncPromises.push(
        firstValueFrom(
          this.crud<Task>("update", "tasks", {
            id: task.id,
            data: taskWithoutRelations,
            isOwner: true,
            isPrivate: true,
          }).pipe(catchError(() => of(null)))
        ).then(() => {
          this.syncProgressService.updateProgress(
            this.syncProgressService.completedItems() + 1,
            "Syncing tasks..."
          );
        }) as Promise<void>
      );

      task.subtasks?.forEach((subtask) => {
        const subtaskWithoutRelations = this.stripSubtaskRelations(subtask);
        taskSyncPromises.push(
          firstValueFrom(
            this.crud<Subtask>("update", "subtasks", {
              id: subtask.id,
              data: subtaskWithoutRelations,
              isOwner: true,
              isPrivate: true,
            }).pipe(catchError(() => of(null)))
          ).then(() => {
            this.syncProgressService.updateProgress(
              this.syncProgressService.completedItems() + 1,
              "Syncing subtasks..."
            );
          }) as Promise<void>
        );

        subtask.comments?.forEach((comment: Comment) => {
          taskSyncPromises.push(
            firstValueFrom(
              this.crud<Comment>("create", "comments", {
                data: comment,
                isOwner: true,
                isPrivate: true,
              }).pipe(catchError(() => of(null)))
            ).then(() => {
              this.syncProgressService.updateProgress(
                this.syncProgressService.completedItems() + 1,
                "Syncing comments..."
              );
            }) as Promise<void>
          );
        });
      });

      task.comments?.forEach((comment: Comment) => {
        taskSyncPromises.push(
          firstValueFrom(
            this.crud<Comment>("create", "comments", {
              data: comment,
              isOwner: true,
              isPrivate: true,
            }).pipe(catchError(() => of(null)))
          ).then(() => {
            this.syncProgressService.updateProgress(
              this.syncProgressService.completedItems() + 1,
              "Syncing comments..."
            );
          }) as Promise<void>
        );
      });
    });

    await Promise.all(taskSyncPromises);

    const chatSyncPromises: Promise<void>[] = [];
    const chats = this.storageService.getChatsByTodo(todo.id);
    chats.forEach((chat: Chat) => {
      chatSyncPromises.push(
        firstValueFrom(
          this.crud<Chat>("create", "chats", {
            data: chat,
            isOwner: true,
            isPrivate: true,
          }).pipe(catchError(() => of(null)))
        ).then(() => {
          this.syncProgressService.updateProgress(
            this.syncProgressService.completedItems() + 1,
            "Syncing chats..."
          );
        }) as Promise<void>
      );
    });

    await Promise.all(chatSyncPromises);
  }

  private stripRelations(todo: Todo): Partial<Todo> {
    const { tasks, user, categories, ...rest } = todo;
    return rest;
  }

  private stripTaskRelations(task: Task): Partial<Task> {
    const { subtasks, comments, todo: parentTodo, ...rest } = task;
    return rest;
  }

  private stripSubtaskRelations(subtask: Subtask): Partial<Subtask> {
    const { comments, task: parentTask, ...rest } = subtask;
    return rest;
  }

  private async importTodoToLocalDb(todo_id?: string): Promise<void> {
    if (!todo_id) return;
    const cloudTodo = await firstValueFrom(
      this.crud<Todo>("get", "todos", { id: todo_id }).pipe(catchError(() => of(null)))
    );

    if (!cloudTodo) {
      throw new Error(`Todo with id ${todo_id} not found in cloud`);
    }

    this.storageService.updateItem("todos", todo_id, cloudTodo);
  }

  // ==================== Archive Operations ====================

  private archiveTodoWithCascade(todo_id?: string, isTeam: boolean = false): void {
    if (!todo_id) return;
    const todo = this.storageService.getById("todos", todo_id);
    if (!todo) return;

    // For team entities, pass isPrivate: false to prevent local JSON persistence
    const options = { isPrivate: !isTeam };

    // Archive todo
    this.storageService.updateItem(
      "todos",
      todo_id,
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
    this.storageService.clearChatsByTodo(todo_id);
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
      const todoId = parentTodoId || this.storageService.getById("tasks", id)?.todo_id;
      if (!todoId) return false;
      const todo = this.storageService.getById("todos", todoId);
      return todo?.visibility === "team";
    }

    if (table === "subtasks" && id) {
      const taskId = this.storageService.getById("subtasks", id)?.task_id;
      if (!taskId) return false;
      const task = this.storageService.getById("tasks", taskId);
      if (!task?.todo_id) return false;
      const todo = this.storageService.getById("todos", task.todo_id);
      return todo?.visibility === "team";
    }

    if (table === "comments" && id) {
      const comment = this.storageService.getById("comments", id);
      if (comment?.task_id) {
        const task = this.storageService.getById("tasks", comment.task_id);
        if (task?.todo_id) {
          const todo = this.storageService.getById("todos", task.todo_id);
          return todo?.visibility === "team";
        }
      }
      if (comment?.subtask_id) {
        const taskId = this.storageService.getById("subtasks", comment.subtask_id)?.task_id;
        if (taskId) {
          const task = this.storageService.getById("tasks", taskId);
          if (task?.todo_id) {
            const todo = this.storageService.getById("todos", task.todo_id);
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
          // For soft delete (archive), update deletedAt field instead of removing
          if (table === "todos") {
            // Archive todo with cascade (set deletedAt !== null for todo and all related entities)
            this.archiveTodoWithCascade(id!, isTeam);
          } else if (table === "tasks" || table === "subtasks") {
            // Use removeRecordWithCascade for proper cascade removal from nested structure
            this.storageService.removeRecordWithCascade(table, id!);
          } else {
            // For other tables (comments, chats, categories)
            this.storageService.removeItem(table as any, id!, undefined, isTeam);
          }
          break;
        case "updateAll":
          // Special handling for chats - set the entire list
          if (table === "chats" && result && Array.isArray(result)) {
            const todoId = parentTodoId || (result[0] as any)?.todo_id;
            if (todoId) {
              this.storageService.setChatsByTodo(result, todoId);
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
        const merged = this.storageUpdateHelper.preserveFields(result, existingTask, ["comments", "subtasks"]);
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
        const merged = this.storageUpdateHelper.preserveFields(result, existingSubtask, ["comments"]);
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

      if (incomingValue !== undefined && incomingValue !== null) {
        result[field] = incomingValue;
      } else if (existingValue) {
        result[field] = existingValue;
      }
    }

    return result as T;
  }

  // ==================== Cache Management

  clearCache(table?: string): void {
    this.cacheHelper.clearCache(table);
  }

  // ==================== Admin Data Loading ====================

  /**
   * Load all admin data from cloud with WS fallback
   * Returns all records including deleted for admin view
   */
  loadAllAdminData(): Observable<AdminDataWithRelations> {
    const tables = [
      { key: "todos", load: ["tasks.subtasks", "categories", "user.profile"] },
      { key: "tasks", load: ["subtasks", "user.profile"] },
      { key: "subtasks", load: ["user.profile"] },
      { key: "comments", load: ["user.profile"] },
      { key: "chats", load: ["user.profile"] },
      { key: "categories", load: ["user.profile"] },
    ];

    const loadPromises = tables.map(({ key, load }) =>
      firstValueFrom(
        this.crud<any[]>(
          "getAll",
          key,
          { filter: {}, load, isOwner: true, isPrivate: false },
          true
        ).pipe(catchError(() => of([])))
      ).then((data) => ({ key, data: data || [] }))
    );

    return from(Promise.all(loadPromises)).pipe(
      map((results) => {
        const dataMap: AdminDataWithRelations = {};
        results.forEach(({ key, data }) => {
          dataMap[key] = data;
        });
        return dataMap;
      })
    );
  }
}
