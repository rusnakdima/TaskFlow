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
  constructor(
    private mainService: MainService,
    private authService: AuthService,
    private webSocketService: WebSocketService
  ) {}

  getAll<T>(entity: string, params?: any, parentTodoId?: string): Observable<T[]> {
    console.log(entity, params, parentTodoId);

    if (params?.queryType === "owned") {
      const userId = this.authService.getValueByKey("id");
      return from(this.mainService.getAllByField<T[]>(entity, "userId", userId)).pipe(
        map((response: Response<T[]>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data;
          } else {
            throw new Error(response.message || "Failed to load owned data");
          }
        })
      );
    } else if (params?.queryType === "shared") {
      if (this.webSocketService.isConnected()) {
        const userId = this.authService.getValueByKey("id");
        return this.webSocketService.getTodosByAssignee(userId).pipe(
          map((todos) => todos as T[]),
          catchError((error) => {
            console.error("WSS connection failed for team todos:", error);
            throw new Error(
              "Unable to connect to WS server. Please check your connection and try again."
            );
          })
        );
      } else {
        throw new Error("No connection to WS server. Please check your internet connection.");
      }
    }

    return from(
      this.mainService.getAllByField<any[]>(entity, params?.field || "", params?.value || "")
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

  getByField<T>(entity: string, nameField: string, value: string, params?: any): Observable<T> {
    console.log(entity, nameField, value, params);

    if (params?.queryType === "owned") {
      return from(this.mainService.getByField<T>(entity, nameField, value)).pipe(
        map((response: Response<T>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data;
          } else {
            throw new Error(response.message || "Failed to load owned data");
          }
        })
      );
    } else if (params?.queryType === "shared") {
      if (this.webSocketService.isConnected()) {
        return this.webSocketService.getByField(entity, nameField, value) as Observable<T>;
      } else {
        throw new Error("No connection to WS server. Please check your internet connection.");
      }
    }

    return from(this.mainService.getByField<T>(entity, nameField, value)).pipe(
      map((response: Response<T>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message || "Failed to load data");
        }
      })
    );
  }

  create<T>(entity: string, data: any, parentTodoId?: string, params?: any): Observable<T> {
    console.log(entity, data, parentTodoId, params);

    const currentUserId = this.authService.getValueByKey("id");
    let isOwner = true;
    let isPrivate = true;

    if (params?.queryType === "owned") {
      isOwner = true;
      isPrivate = true;
    } else if (params?.queryType === "shared") {
      isOwner = data.userId === currentUserId;
      isPrivate = false;
      if (!isOwner && isPrivate) {
        throw new Error("Invalid operation: cannot create private data as assignee.");
      }
    }

    if (params?.queryType === "shared" && this.webSocketService.isConnected()) {
      const userId = currentUserId;
      switch (entity) {
        case "todo":
          return this.webSocketService.createTodo({ ...data, userId }) as Observable<T>;
        case "task":
          return this.webSocketService.createTask({ ...data, userId }) as Observable<T>;
        case "subtask":
          return this.webSocketService.createSubtask({ ...data, userId }) as Observable<T>;
        default:
          throw new Error(`Unknown entity: ${entity}`);
      }
    }

    // Fallback to MainService
    const enrichedData = {
      ...data,
      _syncMetadata: { isOwner, isPrivate },
    };
    return from(
      this.mainService.create<string, any>(entity, enrichedData, { isOwner, isPrivate })
    ).pipe(
      map((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return {} as T;
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
    parentTodoId?: string,
    params?: any
  ): Observable<T> {
    console.log(entity, id, data, parentTodoId, params);

    const currentUserId = this.authService.getValueByKey("id");
    let isOwner = true;
    let isPrivate = true;

    if (params?.queryType === "owned") {
      isOwner = true;
      isPrivate = true;
    } else if (params?.queryType === "shared") {
      // For shared todos, assume user has ownership permissions
      isOwner = true;
      isPrivate = false;
    }

    if (params?.queryType === "shared" && this.webSocketService.isConnected()) {
      const userId = currentUserId;
      switch (entity) {
        case "todo":
          return this.webSocketService.updateTodo(id, { ...data, userId }) as Observable<T>;
        case "task":
          return this.webSocketService.updateTask({ ...data, id, userId }) as Observable<T>;
        case "subtask":
          return this.webSocketService.updateSubtask({ ...data, id, userId }) as Observable<T>;
        default:
          throw new Error(`Unknown entity: ${entity}`);
      }
    }

    // Fallback to MainService
    const enrichedData = {
      ...data,
      _syncMetadata: { isOwner, isPrivate },
    };
    return from(
      this.mainService.update<string, any>(entity, id, enrichedData, { isOwner, isPrivate })
    ).pipe(
      map((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return {} as T;
        } else {
          throw new Error(response.message || "Failed to update");
        }
      })
    );
  }

  updateAll<T>(entity: string, data: any[], parentTodoId?: string, params?: any): Observable<T> {
    console.log(entity, data, parentTodoId, params);

    if (params?.queryType === "owned") {
      const enrichedData = data.map((item) => ({
        ...item,
        _syncMetadata: { isOwner: true, isPrivate: true },
      }));
      return from(
        this.mainService.updateAll<string, any>(entity, enrichedData, {
          isOwner: true,
          isPrivate: true,
        })
      ).pipe(
        map((response: Response<string>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return {} as T;
          } else {
            throw new Error(response.message || "Failed to update all owned data");
          }
        })
      );
    } else if (params?.queryType === "shared") {
      throw new Error("Bulk update not supported for team data.");
    }

    const enrichedData = data.map((item) => ({
      ...item,
      _syncMetadata: { isOwner: true, isPrivate: true },
    }));
    return from(
      this.mainService.updateAll<string, any>(entity, enrichedData, {
        isOwner: true,
        isPrivate: true,
      })
    ).pipe(
      map((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return {} as T;
        } else {
          throw new Error(response.message || "Failed to update all");
        }
      })
    );
  }

  delete<T>(entity: string, id: string, parentTodoId?: string, params?: any): Observable<T> {
    console.log(entity, id, parentTodoId, params);

    const currentUserId = this.authService.getValueByKey("id");
    let isOwner = true;
    let isPrivate = true;

    if (params?.queryType === "owned") {
      isOwner = true;
      isPrivate = true;
    } else if (params?.queryType === "shared") {
      // For shared todos, assume user has ownership permissions
      isOwner = true;
      isPrivate = false;
    }

    if (params?.queryType === "shared" && this.webSocketService.isConnected()) {
      const userId = currentUserId;
      switch (entity) {
        case "todo":
          return this.webSocketService.deleteTodo(id) as Observable<T>;
        case "task":
          return this.webSocketService.deleteTask(id, userId) as Observable<T>;
        case "subtask":
          return this.webSocketService.deleteSubtask(id, userId) as Observable<T>;
        default:
          throw new Error(`Unknown entity: ${entity}`);
      }
    }

    // Fallback to MainService
    return from(this.mainService.delete<T>(entity, id, { isOwner, isPrivate })).pipe(
      map((response: Response<T>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message || "Failed to delete");
        }
      })
    );
  }

  setOwnershipChecker(checker: (todoId: string) => boolean) {}

  setTeamChecker(checker: (todoId: string) => boolean) {}

  setAccessChecker(checker: (todoId: string) => boolean) {}
}
