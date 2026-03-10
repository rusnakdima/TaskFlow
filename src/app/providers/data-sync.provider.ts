/* sys lib */
import { Injectable, Injector, inject } from "@angular/core";
import { Observable, from } from "rxjs";
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
import { AuthService } from "@services/auth.service";

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
  private allowedTables = ["todos", "tasks", "subtasks", "categories", "profiles", "chats"];

  private localWebSocketService = inject(LocalWebSocketService);
  private authService = inject(AuthService);
  private injector = inject(Injector);

  constructor() {}

  private get syncService(): SyncService {
    return this.injector.get(SyncService);
  }

  private get storageService(): StorageService {
    return this.injector.get(StorageService);
  }

  private validateTable(table: string): void {
    if (!this.allowedTables.includes(table)) {
      throw new Error(
        `Table '${table}' is not supported. Allowed: ${this.allowedTables.join(", ")}`
      );
    }
  }

  private resolveMetadata(table: string, todoId?: string, record?: any, id?: string): SyncMetadata {
    const currentUserId = this.authService.getValueByKey("id");
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
    return RelationsHelper.getRelationsForTable(table, table === "todos");
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

  private executeWithFallback<T>(
    operation: Operation,
    params: CrudParams,
    isArray: boolean = false
  ): Observable<T> {
    return new Observable<T>((subscriber) => {
      const makeRequest = (fallback: boolean) => {
        if (!fallback && this.localWebSocketService.isConnected()) {
          this.localWebSocketService.crud<T>(operation, params).subscribe({
            next: (data) => subscriber.next(data),
            error: (err) => this.fallbackToTauri(operation, params, subscriber, isArray),
            complete: () => subscriber.complete(),
          });
        } else {
          this.fallbackToTauri(operation, params, subscriber, isArray);
        }
      };
      makeRequest(false);
    });
  }

  private fallbackToTauri<T>(
    operation: Operation,
    params: CrudParams,
    subscriber: any,
    isArray: boolean
  ): void {
    const payload: any = {
      operation: operation === "get" ? "read" : operation,
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
        })
        .catch((err) => subscriber.error(err));
    } else {
      invoke<Response<T>>("manageData", payload)
        .then((response: Response<T>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as T);
          } else {
            subscriber.error(new Error(response.message || `Failed to ${operation}`));
          }
          subscriber.complete();
        })
        .catch((err) => subscriber.error(err));
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
    const crudParams = this.buildCrudParams(table, { filter, parentTodoId, ...params });
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
      console.error("Sync failed after visibility change:", error);
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
    return this.executeWithFallback<void>("delete", crudParams);
  }
}
