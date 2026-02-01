/* sys lib */
import { Injectable, signal } from "@angular/core";
import { Observable, from } from "rxjs";
import { map } from "rxjs/operators";

/* models */
import { Response, ResponseStatus } from "@models/response.model";

/* services */
import { MainService } from "../services/main.service";
import { AuthService } from "../services/auth.service";
import { LocalWebSocketService } from "../services/local-websocket.service";
import { SyncService } from "../services/sync.service";

@Injectable({
  providedIn: "root",
})
export class DataSyncProvider {
  private allowedEntities = ["todo", "task", "subtask"];

  userId = signal("");

  constructor(
    private mainService: MainService,
    private authService: AuthService,
    private localWebSocketService: LocalWebSocketService,
    private syncService: SyncService
  ) {}

  private validateEntity(entity: string): void {
    if (!this.allowedEntities.includes(entity)) {
      throw new Error(
        `Entity '${entity}' is not supported by DataSyncProvider. Use MainService directly for this entity.`
      );
    }
  }

  getAll<T>(
    entity: string,
    filter: { [key: string]: any },
    params?: { isOwner: boolean; isPrivate: boolean },
    parentTodoId?: string
  ): Observable<T[]> {
    this.validateEntity(entity);

    // this.userId.set(this.authService.getValueByKey("id"));
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.getAll(entity, filter, { isOwner, isPrivate });
    }

    // 2. Fallback to Socket.IO (NestJS - commented for rollback)
    /*
    if (isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.getAll(entity, {
        ...filter,
        userId,
        isOwner,
        isPrivate,
      });
    }
    */

    return from(this.mainService.getAll<T[]>(entity, filter, { isOwner, isPrivate })).pipe(
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
    params?: { isOwner: boolean; isPrivate: boolean },
    parentTodoId?: string
  ): Observable<T> {
    this.validateEntity(entity);

    // this.userId.set(this.authService.getValueByKey("id"));
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.get(entity, filter, { isOwner, isPrivate });
    }

    // 2. Fallback to Socket.IO (NestJS - commented for rollback)
    /*
    if (isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.get(entity, { ...filter, userId, isOwner, isPrivate });
    }
    */

    return from(this.mainService.get<T>(entity, filter, { isOwner, isPrivate })).pipe(
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
    // this.userId.set(this.authService.getValueByKey("id"));
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.create<T>(entity, data, parentTodoId, {
        isOwner,
        isPrivate,
      });
    }

    // 2. Fallback to Socket.IO (NestJS - commented for rollback)
    /*
    if (isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.create<T>(entity, data, userId, parentTodoId);
    }
    */

    return from(this.mainService.create<T, any>(entity, data, { isOwner, isPrivate })).pipe(
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
    // this.userId.set(this.authService.getValueByKey("id"));
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.update<T>(entity, id, data, parentTodoId, {
        isOwner,
        isPrivate,
      });
    }

    // 2. Fallback to Socket.IO (NestJS - commented for rollback)
    /*
    if (isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.update<T>(entity, id, data, userId, parentTodoId);
    }
    */

    return from(this.mainService.update<T, any>(entity, id, data, { isOwner, isPrivate })).pipe(
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
  ): Observable<T> {
    // this.userId.set(this.authService.getValueByKey("id"));
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.request<T>("update-all", {
        entity,
        data,
        syncMetadata: { isOwner, isPrivate },
      });
    }

    return from(
      this.mainService.updateAll<T, any>(
        entity,
        data.map((item) => ({ ...item })),
        { isOwner, isPrivate }
      )
    ).pipe(
      map((response: Response<T>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message || "Failed to update all");
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
    // this.userId.set(this.authService.getValueByKey("id"));
    const { isOwner, isPrivate } = params ?? { isOwner: true, isPrivate: true };

    // 1. Try Local WebSocket (Rust backend)
    if (this.localWebSocketService.isConnected()) {
      return this.localWebSocketService.delete(entity, id, parentTodoId, {
        isOwner,
        isPrivate,
      });
    }

    // 2. Fallback to Socket.IO (NestJS - commented for rollback)
    /*
    if (isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.delete(entity, id, userId, parentTodoId);
    }
    */

    return from(this.mainService.delete<void>(entity, id, { isOwner, isPrivate })).pipe(
      map((response: Response<void>) => {
        if (response.status !== ResponseStatus.SUCCESS) {
          throw new Error(response.message || "Failed to delete");
        }
      })
    );
  }
}
