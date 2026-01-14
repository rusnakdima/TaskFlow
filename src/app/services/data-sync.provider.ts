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
    return { isOwner: true, isPrivate: true };
  }

  getAll<T>(
    entity: string,
    filter: { [key: string]: any },
    params?: any,
    parentTodoId?: string
  ): Observable<T[]> {
    this.validateEntity(entity);

    const userId = this.authService.getValueByKey("id");
    const { isOwner, isPrivate } = params;

    console.log(isOwner, isPrivate);

    if (isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.getTodosByAssignee(userId).pipe(
        map((todos) => (todos as T[]).filter((todo: any) => todo.visibility === "team")),
        catchError((error) => {
          console.error("Failed to get shared assignee todos:", error);
          throw new Error("Unable to load shared assignee todos. Please try again.");
        })
      );
    }

    return from(this.mainService.getAll<any[]>(entity, filter, { isOwner, isPrivate })).pipe(
      map((response: Response<any[]>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          let filteredData = response.data;
          if (entity === "todo") {
            if (isPrivate === false) {
              filteredData = response.data.filter((todo: any) => todo.visibility === "team");
            } else {
              filteredData = response.data.filter((todo: any) => todo.visibility === "private");
            }
          }

          return filteredData;
        } else {
          throw new Error(response.message || "Failed to load data");
        }
      })
    );
  }

  get<T>(
    entity: string,
    filter: { [key: string]: any },
    params?: any,
    parentTodoId?: string
  ): Observable<T> {
    this.validateEntity(entity);

    const userId = this.authService.getValueByKey("id");
    const { isOwner, isPrivate } = this.getSyncFlags(params);

    if (isPrivate === false && this.webSocketService.isConnected()) {
      return this.webSocketService.get(entity, filter);
    }

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

  create<T>(entity: string, data: any, params?: any, parentTodoId?: string): Observable<T> {
    const userId = this.authService.getValueByKey("id");
    const { isOwner, isPrivate } = this.getSyncFlags(params);

    if (isPrivate === false && this.webSocketService.isConnected()) {
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
    const userId = this.authService.getValueByKey("id");
    const { isOwner, isPrivate } = this.getSyncFlags(params);

    let isConectedWSS = this.webSocketService.isConnected();

    if (isPrivate === false && isConectedWSS) {
      from(this.webSocketService.update<Response<T>>(entity, id, data, userId)).pipe(
        map((response: Response<T>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data;
          } else {
            throw new Error(response.message || "Failed to create");
          }
        })
      );
    }

    if (entity == "todo" && isOwner === true) {
      if (isPrivate == false && isConectedWSS) {
        from(this.webSocketService.update<Response<T>>(entity, id, data, userId)).pipe(
          map((response: Response<T>) => {
            if (response.status === ResponseStatus.SUCCESS) {
              return response.data;
            } else {
              throw new Error(response.message || "Failed to create");
            }
          })
        );
      } else {
        from(
          this.mainService.update<T, any>(entity, id, data, { isOwner, isPrivate: !isPrivate })
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
    const { isOwner, isPrivate } = this.getSyncFlags(params);

    if (isPrivate === false && this.webSocketService.isConnected()) {
      throw new Error("Bulk update not supported for shared data.");
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

  delete(entity: string, id: string, params?: any, parentTodoId?: string): Observable<void> {
    const userId = this.authService.getValueByKey("id");
    const { isOwner, isPrivate } = this.getSyncFlags(params);

    if (isPrivate === false && this.webSocketService.isConnected()) {
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
