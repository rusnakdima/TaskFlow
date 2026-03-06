/* sys lib */
import { Injectable, signal } from "@angular/core";
import { Observable, from } from "rxjs";
import { map } from "rxjs/operators";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { RelationObj, TypesField } from "@models/relation-obj.model";

/* services */
import { AuthService } from "../services/auth.service";
import { LocalWebSocketService } from "../services/local-websocket.service";
import { SyncService } from "../services/sync.service";

@Injectable({
  providedIn: "root",
})
export class DataSyncProvider {
  private allowedTables = ["todos", "tasks", "subtasks", "categories", "profiles"];
  userId = signal("");

  constructor(
    private authService: AuthService,
    private localWebSocketService: LocalWebSocketService,
    private syncService: SyncService
  ) {}

  private validateTable(table: string): void {
    if (!this.allowedTables.includes(table)) {
      throw new Error(
        `Table '${table}' is not supported. Allowed: ${this.allowedTables.join(", ")}`
      );
    }
  }

  /**
   * Build default relations for table
   */
  private getDefaultRelations(table: string): RelationObj[] | undefined {
    if (table === "todos") {
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
    if (table === "tasks") {
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
    if (table === "profiles") {
      return [
        {
          nameTable: "users",
          typeField: TypesField.OneToOne,
          nameField: "userId",
          newNameField: "user",
          relations: null,
        },
      ];
    }
    return undefined;
  }

  getAll<T>(
    table: string,
    filter: { [key: string]: any },
    params?: { isOwner: boolean; isPrivate: boolean; relations?: RelationObj[] },
    parentTodoId?: string
  ): Observable<T[]> {
    this.validateTable(table);

    const { isOwner, isPrivate, relations } = params ?? {
      isOwner: true,
      isPrivate: true,
    };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      const defaultRelations = relations ?? this.getDefaultRelations(table);
      return this.localWebSocketService.getAll(table, filter, { isOwner, isPrivate }, defaultRelations);
    }

    // 2. Fallback to Tauri invoke (unified manageData endpoint)
    const defaultRelations = relations ?? this.getDefaultRelations(table);

    return from(
      invoke<Response<T[]>>("manageData", {
        operation: "getAll",
        table,
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
    table: string,
    filter: { [key: string]: any },
    params?: { isOwner: boolean; isPrivate: boolean; relations?: RelationObj[] },
    parentTodoId?: string
  ): Observable<T> {
    this.validateTable(table);

    const { isOwner, isPrivate, relations } = params ?? {
      isOwner: true,
      isPrivate: true,
    };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      const defaultRelations = relations ?? this.getDefaultRelations(table);
      return this.localWebSocketService.get(table, filter, { isOwner, isPrivate }, defaultRelations);
    }

    // 2. Fallback to Tauri invoke (unified manageData endpoint)
    const defaultRelations = relations ?? this.getDefaultRelations(table);

    return from(
      invoke<Response<T>>("manageData", {
        operation: "read",
        table,
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
    table: string,
    data: any,
    params?: { isOwner: boolean; isPrivate: boolean },
    parentTodoId?: string
  ): Observable<T> {
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.create<T>(table, data, parentTodoId, {
        isOwner,
        isPrivate,
      });
    }

    // 2. Fallback to Tauri invoke (unified manageData endpoint)
    return from(
      invoke<Response<T>>("manageData", {
        operation: "create",
        table,
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
    table: string,
    id: string,
    data: any,
    params?: { isOwner: boolean; isPrivate: boolean },
    parentTodoId?: string
  ): Observable<T> {
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.update<T>(table, id, data, parentTodoId, {
        isOwner,
        isPrivate,
      });
    }

    // 2. Fallback to Tauri invoke (unified manageData endpoint)
    return from(
      invoke<Response<T>>("manageData", {
        operation: "update",
        table,
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
    table: string,
    data: any[],
    params?: { isOwner: boolean; isPrivate: boolean },
    parentTodoId?: string
  ): Observable<T[]> {
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.updateAll<T[]>(table, data, parentTodoId, {
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
            table,
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
    table: string,
    id: string,
    params?: { isOwner: boolean; isPrivate: boolean },
    parentTodoId?: string
  ): Observable<void> {
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.delete(table, id, parentTodoId, {
        isOwner,
        isPrivate,
      });
    }

    // 2. Fallback to Tauri invoke (unified manageData endpoint)
    return from(
      invoke<Response<void>>("manageData", {
        operation: "delete",
        table,
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
