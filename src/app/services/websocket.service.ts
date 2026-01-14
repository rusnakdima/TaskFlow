/* sys lib */
import { Injectable } from "@angular/core";
import { Observable, BehaviorSubject, throwError } from "rxjs";
import { io, Socket } from "socket.io-client";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

/* services */
import { MainService } from "./main.service";

@Injectable({
  providedIn: "root",
})
export class WebSocketService {
  private socket: Socket | null = null;
  private wsUrl = "ws://localhost:3000";
  private isWsConnected$ = new BehaviorSubject<boolean>(false);
  private currentUserId: string | null = null;

  constructor(private mainService: MainService) {
    this.initializeWebSocket();
  }

  private initializeWebSocket(): void {
    try {
      this.socket = io(this.wsUrl, {
        transports: ["websocket", "polling"],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 5000,
      });

      this.socket.on("connect", () => {
        console.log("WebSocketService: Connected to WebSocket server");
        this.isWsConnected$.next(true);

        if (this.currentUserId) {
          this.joinUserRoom(this.currentUserId);
        }
      });

      this.socket.on("disconnect", (reason) => {
        console.log("WebSocketService: Disconnected from WebSocket server:", reason);
        this.isWsConnected$.next(false);
      });

      this.socket.on("connect_error", (error) => {
        console.error("WebSocketService: Connection error:", error);
        this.isWsConnected$.next(false);
      });

      this.setupRealTimeListeners();
    } catch (error) {
      console.error("WebSocketService: Failed to initialize WebSocket:", error);
      this.isWsConnected$.next(false);
    }
  }

  private setupRealTimeListeners(): void {
    if (!this.socket) return;

    this.socket.on("todo-created", (data) => {
      console.log("WebSocketService: Todo created event:", data);
      window.dispatchEvent(new CustomEvent("ws-todo-created", { detail: data }));
    });

    this.socket.on("todo-updated", (data) => {
      console.log("WebSocketService: Todo updated event:", data);
      window.dispatchEvent(new CustomEvent("ws-todo-updated", { detail: data }));
    });

    this.socket.on("todo-deleted", (data) => {
      console.log("WebSocketService: Todo deleted event:", data);
      window.dispatchEvent(new CustomEvent("ws-todo-deleted", { detail: data }));
    });

    this.socket.on("task-created", (data) => {
      console.log("WebSocketService: Task created event:", data);
      window.dispatchEvent(new CustomEvent("ws-task-created", { detail: data }));
    });

    this.socket.on("task-updated", (data) => {
      console.log("WebSocketService: Task updated event:", data);
      window.dispatchEvent(new CustomEvent("ws-task-updated", { detail: data }));
    });

    this.socket.on("task-deleted", (data) => {
      console.log("WebSocketService: Task deleted event:", data);
      window.dispatchEvent(new CustomEvent("ws-task-deleted", { detail: data }));
    });

    this.socket.on("subtask-created", (data) => {
      console.log("WebSocketService: Subtask created event:", data);
      window.dispatchEvent(new CustomEvent("ws-subtask-created", { detail: data }));
    });

    this.socket.on("subtask-updated", (data) => {
      console.log("WebSocketService: Subtask updated event:", data);
      window.dispatchEvent(new CustomEvent("ws-subtask-updated", { detail: data }));
    });

    this.socket.on("subtask-deleted", (data) => {
      console.log("WebSocketService: Subtask deleted event:", data);
      window.dispatchEvent(new CustomEvent("ws-subtask-deleted", { detail: data }));
    });
  }

  isConnected(): boolean {
    return this.isWsConnected$.value;
  }

  getConnectionStatus(): Observable<boolean> {
    return this.isWsConnected$.asObservable();
  }

  setWebSocketUrl(url: string): void {
    this.wsUrl = url;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.initializeWebSocket();
  }

  setCurrentUser(userId: string): void {
    this.currentUserId = userId;
    if (this.isConnected()) {
      this.joinUserRoom(userId);
    }
  }

  joinUserRoom(userId: string): void {
    if (this.socket && this.isConnected()) {
      this.socket.emit("join-room", { userId });
    }
  }

  joinTodoRoom(todoId: string): void {
    if (this.socket && this.isConnected()) {
      this.socket.emit("join-todo-room", { todoId });
    }
  }

  leaveTodoRoom(todoId: string): void {
    if (this.socket && this.isConnected()) {
      this.socket.emit("leave-todo-room", { todoId });
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isWsConnected$.next(false);
    }
  }

  getTodosByAssignee(assignee: string): Observable<Todo[]> {
    console.log("WebSocketService: getTodosByAssignee called with assignee:", assignee);

    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<Todo[]>((observer) => {
      this.socket!.emit("get-all", { entity: "todo", assignee });

      const successHandler = (data: any) => {
        console.log("WebSocketService: received todos via WS:", data);
        if (data.status === ResponseStatus.SUCCESS) {
          observer.next(data.data.todos || []);
          observer.complete();
        } else {
          observer.error(new Error(data.message || "Failed to retrieve todos"));
        }
        this.socket!.off("todos-retrieved", successHandler);
        this.socket!.off("todos-retrieve-error", errorHandler);
      };

      const errorHandler = (data: any) => {
        console.error("WebSocketService: WS error:", data);
        observer.error(new Error(data.error || "Failed to retrieve todos"));
        this.socket!.off("todos-retrieved", successHandler);
        this.socket!.off("todos-retrieve-error", errorHandler);
      };

      this.socket!.on("todos-retrieved", successHandler);
      this.socket!.on("todos-retrieve-error", errorHandler);

      setTimeout(() => {
        if (!observer.closed) {
          observer.error(new Error("WebSocket timeout for getTodosByAssignee"));
          this.socket!.off("todos-retrieved", successHandler);
          this.socket!.off("todos-retrieve-error", errorHandler);
        }
      }, 5000);
    });
  }

  get(entity: string, filter: { [key: string]: any }): Observable<any> {
    console.log("WebSocketService: get called with", entity, filter);

    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<any>((observer) => {
      this.socket!.emit("get-by-field", { entity, nameField, value });

      const successHandler = (data: any) => {
        console.log("WebSocketService: received item via WS:", data);
        observer.next(data);
        observer.complete();
        this.socket!.off("get-by-field-success", successHandler);
        this.socket!.off("get-by-field-error", errorHandler);
      };

      const errorHandler = (data: any) => {
        console.error("WebSocketService: WS getByField error:", data);
        observer.error(new Error(data.error || "Failed to get by field"));
        this.socket!.off("get-by-field-success", successHandler);
        this.socket!.off("get-by-field-error", errorHandler);
      };

      this.socket!.on("get-by-field-success", successHandler);
      this.socket!.on("get-by-field-error", errorHandler);

      setTimeout(() => {
        if (!observer.closed) {
          observer.error(new Error("WebSocket timeout for getByField"));
          this.socket!.off("get-by-field-success", successHandler);
          this.socket!.off("get-by-field-error", errorHandler);
        }
      }, 5000);
    });
  }

  getTasks(): Observable<Task[]> {
    console.log("WebSocketService: getTasks called");

    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<Task[]>((observer) => {
      this.socket!.emit("get-all", { entity: "task" });

      const successHandler = (data: any) => {
        console.log("WebSocketService: received tasks via WS:", data);
        if (data.status === ResponseStatus.SUCCESS) {
          observer.next(data.data.tasks || []);
          observer.complete();
        } else {
          observer.error(new Error(data.message || "Failed to retrieve tasks"));
        }
        this.socket!.off("tasks-retrieved", successHandler);
        this.socket!.off("tasks-retrieve-error", errorHandler);
      };

      const errorHandler = (data: any) => {
        console.error("WebSocketService: WS error:", data);
        observer.error(new Error(data.error || "Failed to retrieve tasks"));
        this.socket!.off("tasks-retrieved", successHandler);
        this.socket!.off("tasks-retrieve-error", errorHandler);
      };

      this.socket!.on("tasks-retrieved", successHandler);
      this.socket!.on("tasks-retrieve-error", errorHandler);

      setTimeout(() => {
        if (!observer.closed) {
          observer.error(new Error("WebSocket timeout for getTasks"));
          this.socket!.off("tasks-retrieved", successHandler);
          this.socket!.off("tasks-retrieve-error", errorHandler);
        }
      }, 5000);
    });
  }

  getSubtasksByTask(taskId: string): Observable<Subtask[]> {
    console.log("WebSocketService: getSubtasksByTask called with taskId:", taskId);

    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<Subtask[]>((observer) => {
      this.socket!.emit("get-all", { entity: "subtask", taskId });

      const successHandler = (data: any) => {
        console.log("WebSocketService: received subtasks via WS:", data);
        if (data.status === ResponseStatus.SUCCESS) {
          observer.next(data.data.subtasks || []);
          observer.complete();
        } else {
          observer.error(new Error(data.message || "Failed to retrieve subtasks"));
        }
        this.socket!.off("subtasks-retrieved", successHandler);
        this.socket!.off("subtasks-retrieve-error", errorHandler);
      };

      const errorHandler = (data: any) => {
        console.error("WebSocketService: WS error:", data);
        observer.error(new Error(data.error || "Failed to retrieve subtasks"));
        this.socket!.off("subtasks-retrieved", successHandler);
        this.socket!.off("subtasks-retrieve-error", errorHandler);
      };

      this.socket!.on("subtasks-retrieved", successHandler);
      this.socket!.on("subtasks-retrieve-error", errorHandler);

      setTimeout(() => {
        if (!observer.closed) {
          observer.error(new Error("WebSocket timeout for getSubtasksByTask"));
          this.socket!.off("subtasks-retrieved", successHandler);
          this.socket!.off("subtasks-retrieve-error", errorHandler);
        }
      }, 5000);
    });
  }

  create<T>(entity: string, data: any, userId: string): Observable<T> {
    console.log(`WebSocketService: create called with entity: ${entity}, data:`, data);

    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<T>((observer) => {
      this.socket!.emit("create", { entity, data, userId });

      const successHandler = (responseData: any) => {
        console.log(`WebSocketService: ${entity} created via WS:`, responseData);
        if (responseData.status === ResponseStatus.SUCCESS) {
          const entityData = responseData.data ? responseData.data[entity] : responseData[entity];
          observer.next(entityData);
          observer.complete();
        } else {
          observer.error(new Error(responseData.message || `Failed to create ${entity}`));
        }
        this.socket!.off(`${entity}-create-success`, successHandler);
        this.socket!.off(`${entity}-create-error`, errorHandler);
      };

      const errorHandler = (responseData: any) => {
        console.error(`WebSocketService: WS create error:`, responseData);
        observer.error(new Error(responseData.error || `Failed to create ${entity}`));
        this.socket!.off(`${entity}-create-success`, successHandler);
        this.socket!.off(`${entity}-create-error`, errorHandler);
      };

      this.socket!.on(`${entity}-create-success`, successHandler);
      this.socket!.on(`${entity}-create-error`, errorHandler);

      setTimeout(() => {
        if (!observer.closed) {
          observer.error(new Error(`WebSocket timeout for ${entity} create`));
          this.socket!.off(`${entity}-create-success`, successHandler);
          this.socket!.off(`${entity}-create-error`, errorHandler);
        }
      }, 5000);
    });
  }

  update<T>(entity: string, id: string, data: any, userId: string): Observable<T> {
    console.log(`WebSocketService: update called with entity: ${entity}, id: ${id}, data:`, data);

    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<T>((observer) => {
      this.socket!.emit("update", { entity, data: { id, ...data }, userId });

      const successHandler = (responseData: any) => {
        console.log(`WebSocketService: ${entity} updated via WS:`, responseData);
        if (responseData.status === ResponseStatus.SUCCESS) {
          const entityData = responseData[entity];
          observer.next(entityData);
          observer.complete();
        } else {
          observer.error(new Error(responseData.message || `Failed to update ${entity}`));
        }
        this.socket!.off(`${entity}-update-success`, successHandler);
        this.socket!.off(`${entity}-update-error`, errorHandler);
      };

      const errorHandler = (responseData: any) => {
        console.error(`WebSocketService: WS update error:`, responseData);
        observer.error(new Error(responseData.error || `Failed to update ${entity}`));
        this.socket!.off(`${entity}-update-success`, successHandler);
        this.socket!.off(`${entity}-update-error`, errorHandler);
      };

      this.socket!.on(`${entity}-update-success`, successHandler);
      this.socket!.on(`${entity}-update-error`, errorHandler);

      setTimeout(() => {
        if (!observer.closed) {
          observer.error(new Error(`WebSocket timeout for ${entity} update`));
          this.socket!.off(`${entity}-update-success`, successHandler);
          this.socket!.off(`${entity}-update-error`, errorHandler);
        }
      }, 5000);
    });
  }

  delete(entity: string, id: string, userId: string): Observable<void> {
    console.log(`WebSocketService: delete called with entity: ${entity}, id: ${id}`);

    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<void>((observer) => {
      this.socket!.emit("delete", { entity, id, userId });

      const successHandler = (responseData: any) => {
        console.log(`WebSocketService: ${entity} deleted via WS:`, responseData);
        observer.next();
        observer.complete();
        this.socket!.off(`${entity}-delete-success`, successHandler);
        this.socket!.off(`${entity}-delete-error`, errorHandler);
      };

      const errorHandler = (responseData: any) => {
        console.error(`WebSocketService: WS delete error:`, responseData);
        observer.error(new Error(responseData.error || `Failed to delete ${entity}`));
        this.socket!.off(`${entity}-delete-success`, successHandler);
        this.socket!.off(`${entity}-delete-error`, errorHandler);
      };

      this.socket!.on(`${entity}-delete-success`, successHandler);
      this.socket!.on(`${entity}-delete-error`, errorHandler);

      setTimeout(() => {
        if (!observer.closed) {
          observer.error(new Error(`WebSocket timeout for ${entity} delete`));
          this.socket!.off(`${entity}-delete-success`, successHandler);
          this.socket!.off(`${entity}-delete-error`, errorHandler);
        }
      }, 5000);
    });
  }
}
