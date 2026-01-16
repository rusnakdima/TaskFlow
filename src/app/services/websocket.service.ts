/* sys lib */
import { Injectable } from "@angular/core";
import { Observable, BehaviorSubject, throwError } from "rxjs";
import { io, Socket } from "socket.io-client";

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
        transports: ["websocket"],
        timeout: 5000,
      });

      this.socket.on("connect", () => {
        this.isWsConnected$.next(true);

        if (this.currentUserId) {
          this.joinUserRoom(this.currentUserId);
        }
      });

      this.socket.on("disconnect", (reason) => {
        this.isWsConnected$.next(false);
      });

      this.socket.on("connect_error", (error) => {
        console.error("WebSocketService: Connection failed, error:", error);
        console.error(
          "WebSocketService: Ensure WSS is running on",
          this.wsUrl,
          "and check for CORS/network issues"
        );
        this.isWsConnected$.next(false);
      });

      this.socket.on("connect_timeout", (timeout) => {
        console.error("WebSocketService: Connection timeout after", timeout, "ms");
        this.isWsConnected$.next(false);
      });

      this.setupRealTimeListeners();
    } catch (error) {
      console.error("WebSocketService: Failed to initialize WebSocket, error:", error);
      this.isWsConnected$.next(false);
    }
  }

  private setupRealTimeListeners(): void {
    if (!this.socket) return;

    this.socket.on("todo-created", (data) => {
      window.dispatchEvent(new CustomEvent("ws-todo-created", { detail: data }));
    });

    this.socket.on("todo-updated", (data) => {
      window.dispatchEvent(new CustomEvent("ws-todo-updated", { detail: data }));
    });

    this.socket.on("todo-deleted", (data) => {
      window.dispatchEvent(new CustomEvent("ws-todo-deleted", { detail: data }));
    });

    this.socket.on("task-created", (data) => {
      window.dispatchEvent(new CustomEvent("ws-task-created", { detail: data }));
    });

    this.socket.on("task-updated", (data) => {
      window.dispatchEvent(new CustomEvent("ws-task-updated", { detail: data }));
    });

    this.socket.on("task-deleted", (data) => {
      window.dispatchEvent(new CustomEvent("ws-task-deleted", { detail: data }));
    });

    this.socket.on("subtask-created", (data) => {
      window.dispatchEvent(new CustomEvent("ws-subtask-created", { detail: data }));
    });

    this.socket.on("subtask-updated", (data) => {
      window.dispatchEvent(new CustomEvent("ws-subtask-updated", { detail: data }));
    });

    this.socket.on("subtask-deleted", (data) => {
      window.dispatchEvent(new CustomEvent("ws-subtask-deleted", { detail: data }));
    });
  }

  isConnected(): boolean {
    const connected = this.isWsConnected$.value;

    return connected;
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
      this.socket.emit("join-room", { todoId });
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

  testConnection(): void {
    if (this.socket) {
    } else {
    }
  }

  getAll(entity: string, filter: { [key: string]: any }): Observable<any[]> {
    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<any[]>((observer) => {
      this.socket!.emit("get-all", {
        entity,
        filter,
      });

      const successHandler = (data: any) => {
        if (data.status === "success") {
          const items = (data.data && data.data[`${entity}s`]) || [];
          observer.next(items);
          observer.complete();
        } else {
          observer.error(new Error(data.message || `Failed to retrieve ${entity}s`));
        }
        this.socket!.off(`${entity}s-retrieved`, successHandler);
        this.socket!.off(`${entity}s-retrieve-error`, errorHandler);
      };

      const errorHandler = (data: any) => {
        console.error("WebSocketService: WS error:", data);
        observer.error(new Error(data.error || `Failed to retrieve ${entity}s`));
        this.socket!.off(`${entity}s-retrieved`, successHandler);
        this.socket!.off(`${entity}s-retrieve-error`, errorHandler);
      };

      this.socket!.on(`${entity}s-retrieved`, successHandler);
      this.socket!.on(`${entity}s-retrieve-error`, errorHandler);

      setTimeout(() => {
        if (!observer.closed) {
          observer.error(new Error(`WebSocket timeout for getAll ${entity}`));
          this.socket!.off(`${entity}s-retrieved`, successHandler);
          this.socket!.off(`${entity}s-retrieve-error`, errorHandler);
        }
      }, 5000);
    });
  }

  get(entity: string, filter: { [key: string]: any }): Observable<any> {
    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<any>((observer) => {
      this.socket!.emit("get", {
        entity,
        filter,
      });

      const successHandler = (data: any) => {
        if (data.status === "success") {
          observer.next(data.data.item);
          observer.complete();
        } else {
          observer.error(new Error(data.message || "Failed to get"));
        }
        this.socket!.off("get-success", successHandler);
        this.socket!.off("get-error", errorHandler);
      };

      const errorHandler = (data: any) => {
        console.error("WebSocketService: WS get error:", data);
        observer.error(new Error(data.message || data.error || "Failed to get"));
        this.socket!.off("get-success", successHandler);
        this.socket!.off("get-error", errorHandler);
      };

      this.socket!.on("get-success", successHandler);
      this.socket!.on("get-error", errorHandler);

      setTimeout(() => {
        if (!observer.closed) {
          observer.error(new Error("WebSocket timeout for get"));
          this.socket!.off("get-success", successHandler);
          this.socket!.off("get-error", errorHandler);
        }
      }, 5000);
    });
  }

  create<T>(entity: string, data: any, userId: string, todoId?: string): Observable<T> {
    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<T>((observer) => {
      this.socket!.emit("create", { entity, data, userId, todoId });

      const successHandler = (responseData: any) => {
        if (responseData.status === "success") {
          const entityData = responseData.data[entity];
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
        observer.error(
          new Error(responseData.message || responseData.error || `Failed to create ${entity}`)
        );
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

  update<T>(entity: string, id: string, data: any, userId: string, todoId?: string): Observable<T> {
    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<T>((observer) => {
      this.socket!.emit("update", { entity, data: { id, ...data }, userId, todoId });

      const successHandler = (responseData: any) => {
        if (responseData.status === "success") {
          const entityData = responseData.data[entity];
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
        observer.error(
          new Error(responseData.message || responseData.error || `Failed to update ${entity}`)
        );
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

  delete(entity: string, id: string, userId: string, todoId?: string): Observable<void> {
    if (!this.socket || !this.isConnected()) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    return new Observable<void>((observer) => {
      this.socket!.emit("delete", { entity, id, userId, todoId });

      const successHandler = (responseData: any) => {
        if (responseData.status === "success") {
          observer.next();
          observer.complete();
        } else {
          observer.error(new Error(responseData.message || `Failed to delete ${entity}`));
        }
        this.socket!.off(`${entity}-delete-success`, successHandler);
        this.socket!.off(`${entity}-delete-error`, errorHandler);
      };

      const errorHandler = (responseData: any) => {
        console.error(`WebSocketService: WS delete error:`, responseData);
        observer.error(
          new Error(responseData.message || responseData.error || `Failed to delete ${entity}`)
        );
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
