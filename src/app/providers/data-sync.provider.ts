/* sys lib */
import { Injectable, signal } from "@angular/core";
import { Observable, from } from "rxjs";
import { map } from "rxjs/operators";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { RelationObj, TypesField } from "@models/relation-obj.model";

/* services */
import { MainService } from "../services/main.service";
import { AuthService } from "../services/auth.service";
import { LocalWebSocketService } from "../services/local-websocket.service";
import { SyncService } from "../services/sync.service";

@Injectable({
  providedIn: "root",
})
export class DataSyncProvider {
  private allowedEntities = ["todo", "task", "subtask", "category", "profile"];
  private tableMap: Record<string, string> = {
    todo: "todos",
    task: "tasks",
    subtask: "subtasks",
    category: "categories",
    profile: "profiles",
  };

  userId = signal("");

  constructor(
    private mainService: MainService,
    private authService: AuthService,
    private localWebSocketService: LocalWebSocketService,
    private syncService: SyncService
  ) {}

  private getTableName(entity: string): string {
    return this.tableMap[entity] || `${entity}s`;
  }

  private validateEntity(entity: string): void {
    if (!this.allowedEntities.includes(entity)) {
      throw new Error(
        `Entity '${entity}' is not supported. Allowed: ${this.allowedEntities.join(", ")}`
      );
    }
  }

  /**
   * Build default relations for entity
   */
  private getDefaultRelations(entity: string): RelationObj[] | undefined {
    if (entity === "todo") {
      return [
        {
          nameTable: "tasks",
          typeField: TypesField.OneToMany,
          nameField: "todoId",
          newNameField: "tasks",
          relations: [
            {
              nameTable: "subtasks",
              typeField: TypesField.OneToMany,
              nameField: "taskId",
              newNameField: "subtasks",
              relations: null,
            },
          ],
        },
        {
          nameTable: "users",
          typeField: TypesField.OneToOne,
          nameField: "userId",
          newNameField: "user",
          relations: [
            {
              nameTable: "profiles",
              typeField: TypesField.OneToOne,
              nameField: "profileId",
              newNameField: "profile",
              relations: null,
            },
          ],
        },
        {
          nameTable: "categories",
          typeField: TypesField.ManyToOne,
          nameField: "categories",
          newNameField: "categories",
          relations: null,
        },
      ];
    }
    if (entity === "task") {
      return [
        {
          nameTable: "subtasks",
          typeField: TypesField.OneToMany,
          nameField: "taskId",
          newNameField: "subtasks",
          relations: null,
        },
      ];
    }
    return undefined;
  }

  getAll<T>(
    entity: string,
    filter: { [key: string]: any },
    params?: { isOwner: boolean; isPrivate: boolean; relations?: RelationObj[] },
    parentTodoId?: string
  ): Observable<T[]> {
    this.validateEntity(entity);

    const { isOwner, isPrivate, relations } = params ?? {
      isOwner: true,
      isPrivate: true,
    };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.getAll(entity, filter, { isOwner, isPrivate });
    }

    // 2. Use new unified manageData endpoint with relations
    const defaultRelations = relations ?? this.getDefaultRelations(entity);

    return from(
      invoke<Response<T[]>>("manageData", {
        operation: "getAll",
        table: this.getTableName(entity),
        filter,
        relations: defaultRelations,
        syncMetadata: { isOwner, isPrivate },
      })
    ).pipe(
      map((response: Response<T[]>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data || [];
        } else {
          throw new Error(response.message || "Failed to load data");
        }
      })
    );
  }

  get<T>(
    entity: string,
    filter: { [key: string]: any },
    params?: { isOwner: boolean; isPrivate: boolean; relations?: RelationObj[] },
    parentTodoId?: string
  ): Observable<T> {
    this.validateEntity(entity);

    const { isOwner, isPrivate, relations } = params ?? {
      isOwner: true,
      isPrivate: true,
    };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.get(entity, filter, { isOwner, isPrivate });
    }

    // 2. Use new unified manageData endpoint with relations
    const defaultRelations = relations ?? this.getDefaultRelations(entity);

    return from(
      invoke<Response<T>>("manageData", {
        operation: "read",
        table: this.getTableName(entity),
        filter,
        relations: defaultRelations,
        syncMetadata: { isOwner, isPrivate },
      })
    ).pipe(
      map((response: Response<T>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message || "Failed to load data");
        }
      })
    );
  }

  create<T>(
    entity: string,
    data: any,
    params?: { isOwner: boolean; isPrivate: boolean },
    parentTodoId?: string
  ): Observable<T> {
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.create<T>(entity, data, parentTodoId, {
        isOwner,
        isPrivate,
      });
    }

    // 2. Use new unified manageData endpoint
    return from(
      invoke<Response<T>>("manageData", {
        operation: "create",
        table: this.getTableName(entity),
        data,
        syncMetadata: { isOwner, isPrivate },
      })
    ).pipe(
      map((response: Response<T>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message || "Failed to create");
        }
      })
    );
  }

  update<T>(
    entity: string,
    id: string,
    data: any,
    params?: { isOwner: boolean; isPrivate: boolean },
    parentTodoId?: string
  ): Observable<T> {
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.update<T>(entity, id, data, parentTodoId, {
        isOwner,
        isPrivate,
      });
    }

    // 2. Use new unified manageData endpoint
    return from(
      invoke<Response<T>>("manageData", {
        operation: "update",
        table: this.getTableName(entity),
        id,
        data,
        syncMetadata: { isOwner, isPrivate },
      })
    ).pipe(
      map((response: Response<T>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message || "Failed to update");
        }
      })
    );
  }

  updateAll<T>(
    entity: string,
    data: any[],
    params?: { isOwner: boolean; isPrivate: boolean },
    parentTodoId?: string
  ): Observable<T[]> {
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      // LocalWebSocketService returns Observable<T> but we cast to Observable<T[]>
      return this.localWebSocketService.updateAll<T[]>(entity, data, parentTodoId, {
        isOwner,
        isPrivate,
      });
    }

    // 2. Batch operations using unified manageData endpoint
    return from(
      Promise.all(
        data.map((item) =>
          invoke<Response<T>>("manageData", {
            operation: item.id ? "update" : "create",
            table: this.getTableName(entity),
            id: item.id,
            data: item,
            syncMetadata: { isOwner, isPrivate },
          })
        )
      )
    ).pipe(
      map((responses: Response<T>[]) => {
        const success = responses.every((r) => r.status === ResponseStatus.SUCCESS);
        if (success) {
          return responses.map((r) => r.data).filter(Boolean) as T[];
        } else {
          throw new Error("Failed to update all records");
        }
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
    } catch (error) {
      console.error("Sync failed after visibility change:", error);
    }
  }

  delete(
    entity: string,
    id: string,
    params?: { isOwner: boolean; isPrivate: boolean },
    parentTodoId?: string
  ): Observable<void> {
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.delete(entity, id, parentTodoId, {
        isOwner,
        isPrivate,
      });
    }

    // 2. Use new unified manageData endpoint
    return from(
      invoke<Response<void>>("manageData", {
        operation: "delete",
        table: this.getTableName(entity),
        id,
        syncMetadata: { isOwner, isPrivate },
      })
    ).pipe(
      map((response: Response<void>) => {
        if (response.status !== ResponseStatus.SUCCESS) {
          throw new Error(response.message || "Failed to delete");
        }
      })
    );
  }
}
