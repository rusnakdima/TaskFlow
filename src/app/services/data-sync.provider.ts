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

  // Generic CRUD methods
  getAll<T>(entity: string, params?: any, parentTodoId?: string): Observable<T[]> {
    // Check for queryType params from views/pages and manage forms
    if (params?.queryType === "owned") {
      // Send request directly to Rust via MainService
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
    } else if (params?.queryType === "team") {
      // Try to send request to WSS server
      if (this.webSocketService.isConnected()) {
        const userId = this.authService.getValueByKey("id");
        return this.webSocketService.getTodosByAssignee(userId).pipe(
          map((todos) => todos as T[]),
          catchError((error) => {
            // If WSS request fails, send notification about connection failure
            console.error("WSS connection failed for team todos:", error);
            throw new Error(
              "Unable to connect to team server. Please check your connection and try again."
            );
          })
        );
      } else {
        // WSS not connected, send notification
        throw new Error("No connection to team server. Please check your internet connection.");
      }
    }

    // Default behavior for other entities or when no queryType specified
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
    // Check for queryType params from views/pages and manage forms
    if (params?.queryType === "owned") {
      // Send request directly to Rust via MainService
      return from(this.mainService.getByField<T>(entity, nameField, value)).pipe(
        map((response: Response<T>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data;
          } else {
            throw new Error(response.message || "Failed to load owned data");
          }
        })
      );
    } else if (params?.queryType === "team") {
      // Try to send request to WSS server
      if (this.webSocketService.isConnected()) {
        return this.webSocketService.getByField(entity, nameField, value) as Observable<T>;
      } else {
        // WSS not connected, send notification
        throw new Error("No connection to team server. Please check your internet connection.");
      }
    }

    // Default behavior
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
    // Check for queryType params from views/pages and manage forms
    if (params?.queryType === "owned") {
      // Send request directly to Rust via MainService
      const enrichedData = {
        ...data,
        _syncMetadata: { isOwner: true, isPrivate: true },
      };
      return from(
        this.mainService.create<string, any>(entity, enrichedData, {
          isOwner: true,
          isPrivate: true,
        })
      ).pipe(
        map((response: Response<string>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return {} as T; // MainService returns string
          } else {
            throw new Error(response.message || "Failed to create owned data");
          }
        })
      );
    } else if (params?.queryType === "team") {
      // Try to send request to WSS server
      if (this.webSocketService.isConnected()) {
        const userId = this.authService.getValueByKey("id");
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
      } else {
        // WSS not connected, send notification
        throw new Error("No connection to team server. Please check your internet connection.");
      }
    }

    // Default behavior
    const enrichedData = {
      ...data,
      _syncMetadata: { isOwner: true, isPrivate: true },
    };
    return from(
      this.mainService.create<string, any>(entity, enrichedData, { isOwner: true, isPrivate: true })
    ).pipe(
      map((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return {} as T; // MainService returns string
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
    // Check for queryType params from views/pages and manage forms
    if (params?.queryType === "owned") {
      // Send request directly to Rust via MainService
      const enrichedData = {
        ...data,
        _syncMetadata: { isOwner: true, isPrivate: true },
      };
      return from(
        this.mainService.update<string, any>(entity, id, enrichedData, {
          isOwner: true,
          isPrivate: true,
        })
      ).pipe(
        map((response: Response<string>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return {} as T; // MainService returns string
          } else {
            throw new Error(response.message || "Failed to update owned data");
          }
        })
      );
    } else if (params?.queryType === "team") {
      // Try to send request to WSS server
      if (this.webSocketService.isConnected()) {
        const userId = this.authService.getValueByKey("id");
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
      } else {
        // WSS not connected, send notification
        throw new Error("No connection to team server. Please check your internet connection.");
      }
    }

    // Default behavior
    const enrichedData = {
      ...data,
      _syncMetadata: { isOwner: true, isPrivate: true },
    };
    return from(
      this.mainService.update<string, any>(entity, id, enrichedData, {
        isOwner: true,
        isPrivate: true,
      })
    ).pipe(
      map((response: Response<string>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return {} as T; // MainService returns string
        } else {
          throw new Error(response.message || "Failed to update");
        }
      })
    );
  }

  updateAll<T>(entity: string, data: any[], parentTodoId?: string, params?: any): Observable<T> {
    // Check for queryType params from views/pages and manage forms
    if (params?.queryType === "owned") {
      // Send request directly to Rust via MainService
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
            return {} as T; // MainService returns string
          } else {
            throw new Error(response.message || "Failed to update all owned data");
          }
        })
      );
    } else if (params?.queryType === "team") {
      // updateAll for team not supported via WSS, fallback to error
      throw new Error("Bulk update not supported for team data.");
    }

    // Default behavior
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
          return {} as T; // MainService returns string
        } else {
          throw new Error(response.message || "Failed to update all");
        }
      })
    );
  }

  delete<T>(entity: string, id: string, parentTodoId?: string, params?: any): Observable<T> {
    // Check for queryType params from views/pages and manage forms
    if (params?.queryType === "owned") {
      // Send request directly to Rust via MainService
      return from(this.mainService.delete<T>(entity, id, { isOwner: true, isPrivate: true })).pipe(
        map((response: Response<T>) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data;
          } else {
            throw new Error(response.message || "Failed to delete owned data");
          }
        })
      );
    } else if (params?.queryType === "team") {
      // Try to send request to WSS server
      if (this.webSocketService.isConnected()) {
        const userId = this.authService.getValueByKey("id");
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
      } else {
        // WSS not connected, send notification
        throw new Error("No connection to team server. Please check your internet connection.");
      }
    }

    // Default behavior
    return from(this.mainService.delete<T>(entity, id, { isOwner: true, isPrivate: true })).pipe(
      map((response: Response<T>) => {
        if (response.status === ResponseStatus.SUCCESS) {
          return response.data;
        } else {
          throw new Error(response.message || "Failed to delete");
        }
      })
    );
  }

  // Methods for backward compatibility with views
  setOwnershipChecker(checker: (todoId: string) => boolean) {
    // No-op
  }

  setTeamChecker(checker: (todoId: string) => boolean) {
    // No-op
  }

  setAccessChecker(checker: (todoId: string) => boolean) {
    // No-op
  }
}
