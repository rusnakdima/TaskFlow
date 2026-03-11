/* sys lib */
import { Injectable, Injector, inject } from "@angular/core";
import { Observable, from, share, throwError } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { RelationObj } from "@models/relation-obj.model";
import { SyncMetadata } from "@models/sync-metadata";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";

/* services */
import { LocalWebSocketService } from "@services/local-websocket.service";
import { SyncService } from "@services/sync.service";
import { StorageService } from "@services/storage.service";
import { JwtTokenService } from "@services/jwt-token.service";

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
  private injector = inject(Injector);

  constructor() {}

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

  private executeWithFallback<T>(
    operation: Operation,
    params: CrudParams,
    isArray: boolean = false
  ): Observable<T> {
    const requestKey = `${operation}:${params.table}:${params.id || "no-id"}`;

    let wsSubscription: any = null;
    let retryTimeout: any = null;

    // Create new observable and cache it
    const request$ = new Observable<T>((subscriber) => {
      const tryWebSocket = (attempt: number) => {
        const isConnected = this.localWebSocketService.isConnected();

        if (isConnected) {
          wsSubscription = this.localWebSocketService.crud<T>(operation, params).subscribe({
            next: (data) => {
              this.inFlightRequests.delete(requestKey);
              subscriber.next(data);
              subscriber.complete();
            },
            error: (err) => {
              this.fallbackToTauri(operation, params, subscriber, isArray, requestKey);
            },
            complete: () => {},
          });
        } else if (attempt < 3) {
          retryTimeout = setTimeout(() => tryWebSocket(attempt + 1), 100);
        } else {
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
      share() // Share the execution among multiple subscribers
    );

    // Cache the in-flight request
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
    const payload: any = {
      operation: operation,
      table: params.table,
      syncMetadata: params.syncMetadata,
    };

    if (params.filter) payload.filter = params.filter;
    if (params.relations) payload.relations = params.relations;
    if (params.id) payload.id = params.id;
    if (params.data) payload.data = params.data;

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
          } else {
            subscriber.error(new Error("Failed to update all records"));
          }
          subscriber.complete();
          if (requestKey) this.inFlightRequests.delete(requestKey);
        })
        .catch((err) => {
          subscriber.error(err);
          if (requestKey) this.inFlightRequests.delete(requestKey);
        });
    } else {
      invoke<Response<T>>("manageData", payload)
        .then((response: Response<T>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as T);
          } else {
            subscriber.error(new Error(response.message || `Failed to ${operation}`));
          }
          subscriber.complete();
          if (requestKey) this.inFlightRequests.delete(requestKey);
        })
        .catch((err) => {
          subscriber.error(err);
          if (requestKey) this.inFlightRequests.delete(requestKey);
        });
    }
  }

  getAll<T>(
    table: string,
    filter: { [key: string]: any },
    params?: { isOwner?: boolean; isPrivate?: boolean; relations?: RelationObj[] },
    parentTodoId?: string
  ): Observable<T[]> {
    this.validateTable(table);
    const crudParams = this.buildCrudParams(table, { filter, parentTodoId, ...params });
    return this.executeWithFallback<T[]>("getAll", crudParams, true);
  }

  get<T>(
    table: string,
    filter: { [key: string]: any },
    params?: { isOwner?: boolean; isPrivate?: boolean; relations?: RelationObj[] },
    parentTodoId?: string
  ): Observable<T> {
    this.validateTable(table);

    // Use filter-based get (backend now supports this)
    const crudParams = this.buildCrudParams(table, {
      filter,
      parentTodoId,
      ...params,
    });
    return this.executeWithFallback<T>("get", crudParams);
  }

  create<T>(
    table: string,
    data: any,
    params?: { isOwner?: boolean; isPrivate?: boolean },
    parentTodoId?: string
  ): Observable<T> {
    this.validateTable(table);
    const crudParams = this.buildCrudParams(table, { data, parentTodoId, ...params });
    return this.executeWithFallback<T>("create", crudParams);
  }

  update<T>(
    table: string,
    id: string,
    data: any,
    params?: { isOwner?: boolean; isPrivate?: boolean },
    parentTodoId?: string
  ): Observable<T> {
    this.validateTable(table);
    const crudParams = this.buildCrudParams(table, { id, data, parentTodoId, ...params });
    return this.executeWithFallback<T>("update", crudParams);
  }

  updateAll<T>(
    table: string,
    data: any[],
    params?: { isOwner?: boolean; isPrivate?: boolean },
    parentTodoId?: string
  ): Observable<T[]> {
    this.validateTable(table);
    const crudParams = this.buildCrudParams(table, { data, parentTodoId, ...params });
    return this.executeWithFallback<T[]>("updateAll", crudParams, true);
  }

  async syncAfterVisibilityChange(newVisibility: "private" | "team"): Promise<void> {
    try {
      if (newVisibility === "private") {
        await this.syncService.importToLocal();
      } else {
        await this.syncService.exportToCloud();
      }
    } catch (error) {
      // Sync failed after visibility change
    }
  }

  delete(
    table: string,
    id: string,
    params?: { isOwner?: boolean; isPrivate?: boolean },
    parentTodoId?: string
  ): Observable<void> {
    this.validateTable(table);
    const crudParams = this.buildCrudParams(table, { id, parentTodoId, ...params });

    // Use Tauri directly for delete operations (more reliable than WebSocket)
    return this.invokeCommand<void>("manageData", {
      operation: "delete",
      table: crudParams.table,
      id: crudParams.id,
      syncMetadata: crudParams.syncMetadata,
    });
  }

  // ==================== PROFILE OPERATIONS ====================
  // These are wrappers around standard CRUD operations for convenience

  getProfileByUserId(userId: string, relations?: RelationObj[]): Observable<any> {
    return this.get("profiles", { userId }, { relations });
  }

  createProfile(data: any): Observable<any> {
    return this.invokeCommand("profileCreate", { data });
  }

  updateProfile(id: string, data: any): Observable<any> {
    return this.invokeCommand("profileUpdate", { id, data });
  }

  deleteProfile(id: string): Observable<any> {
    return this.invokeCommand("profileDelete", { id });
  }

  // ==================== AUTH OPERATIONS (via auth routes) ====================

  login(data: any): Observable<any> {
    return this.invokeCommand("login", { loginForm: data });
  }

  signup(data: any): Observable<any> {
    return this.invokeCommand("register", { signupForm: data });
  }

  requestPasswordReset(email: string): Observable<any> {
    return this.invokeCommand("requestPasswordReset", { email });
  }

  verifyCode(email: string, code: string): Observable<any> {
    return this.invokeCommand("verifyCode", { email, code });
  }

  resetPassword(data: any): Observable<any> {
    return this.invokeCommand("resetPassword", { resetData: data });
  }

  checkToken(token: string): Observable<any> {
    return this.invokeCommand("checkToken", { token });
  }

  // ==================== STATISTICS OPERATIONS ====================

  getStatistics(userId: string, timeRange: string): Observable<any> {
    return this.invokeCommand("statisticsGet", { userId, timeRange });
  }
}
