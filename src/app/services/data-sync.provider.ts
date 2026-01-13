/* sys lib */
import { Injectable } from "@angular/core";
import { Observable, from, of, forkJoin } from "rxjs";
import { map, catchError, finalize } from "rxjs/operators";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";

/* services */
import { MainService } from "./main.service";
import { AuthService } from "./auth.service";
import { WebSocketService } from "./websocket.service";

@Injectable({
  providedIn: "root",
})
export class DataSyncProvider {
  private allowedEntities = ["todo", "task", "subtask"];

  constructor(
    private mainService: MainService,
    private authService: AuthService,
    private webSocketService: WebSocketService
  ) {}

  private validateEntity(entity: string): void {
    if (!this.allowedEntities.includes(entity)) {
      throw new Error(
        `Entity '${entity}' is not supported by DataSyncProvider. Use MainService directly for this entity.`
      );
    }
  }

  private getSyncFlags(params?: any): { isOwner: boolean; isPrivate: boolean } {
    if (params?.isPrivate === true) {
      return { isOwner: true, isPrivate: true };
    } else if (params?.isPrivate === false) {
      return { isOwner: params?.isOwner ?? true, isPrivate: false };
    }
    return { isOwner: true, isPrivate: true }; // default to private
  }

  getAll<T>(entity: string, params?: any, parentTodoId?: string): Observable<T[]> {
    console.log(entity, params, parentTodoId);
    this.validateEntity(entity);

    const userId = this.authService.getValueByKey("id");
    const { isOwner, isPrivate } = this.getSyncFlags(params);

    if (params?.isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.getTodosByAssignee(userId).pipe(
        map((todos) => todos as T[]),
        catchError((error) => {
          console.error("Failed to get shared todos:", error);
          throw new Error("Unable to load shared todos. Please try again.");
        })
      );
    }

    const filter = params?.field && params?.value ? { [params.field]: params.value } : {};
    return from(
      this.mainService.getAllByField<any[]>(entity, filter, {
        isOwner,
        isPrivate,
      })
    ).pipe(
      map((response: Response<any[]>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message || "Failed to load data");
        }
      })
    );
  }

  getByField<T>(
    entity: string,
    nameField: string,
    value: string,
    params?: any,
    parentTodoId?: string
  ): Observable<T> {
    console.log(entity, nameField, value, params);
    this.validateEntity(entity);

    const userId = this.authService.getValueByKey("id");
    const { isOwner, isPrivate } = this.getSyncFlags(params);

    if (params?.isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.getByField(entity, nameField, value);
    }

    return from(
      this.mainService.getByField<T>(entity, { [nameField]: value }, { isOwner, isPrivate })
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

  create<T>(entity: string, data: any, params?: any, parentTodoId?: string): Observable<T> {
    console.log(entity, data, parentTodoId, params);

    const userId = this.authService.getValueByKey("id");
    const { isOwner, isPrivate } = this.getSyncFlags(params);

    if (params?.isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.create<T>(entity, data, userId);
    }

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
    params?: any,
    parentTodoId?: string
  ): Observable<T> {
    console.log(entity, id, data, parentTodoId, params);

    const userId = this.authService.getValueByKey("id");
    const { isOwner, isPrivate } = this.getSyncFlags(params);

    if (params?.isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.update<T>(entity, id, data, userId);
    }

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

  updateAll<T>(entity: string, data: any[], params?: any, parentTodoId?: string): Observable<T> {
    console.log(entity, data, parentTodoId, params);

    const { isOwner, isPrivate } = this.getSyncFlags(params);

    if (params?.isPrivate === false && this.webSocketService.isConnected()) {
      throw new Error("Bulk update not supported for shared data.");
    }

    return from(
      this.mainService.updateAll<T, any>(entity, data, {
        isOwner,
        isPrivate,
      })
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

  delete(entity: string, id: string, params?: any, parentTodoId?: string): Observable<void> {
    console.log(entity, id, parentTodoId, params);

    const userId = this.authService.getValueByKey("id");
    const { isOwner, isPrivate } = this.getSyncFlags(params);

    if (params?.isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.delete(entity, id, userId);
    }

    return from(this.mainService.delete<void>(entity, id, { isOwner, isPrivate })).pipe(
      map((response: Response<void>) => {
        if (response.status !== ResponseStatus.SUCCESS) {
          throw new Error(response.message || "Failed to delete");
        }
      })
    );
  }

  setOwnershipChecker(checker: (todoId: string) => boolean) {}

  setTeamChecker(checker: (todoId: string) => boolean) {}

  setAccessChecker(checker: (todoId: string) => boolean) {}
}
