/* sys lib */
import { Injectable } from "@angular/core";
import { Observable, BehaviorSubject } from "rxjs";
import { io, Socket } from "socket.io-client";

@Injectable({
  providedIn: "root",
})
export class WebSocketService {
  private socket: Socket | null = null;
  private wsUrl = "ws://localhost:3000";

  private isWsConnected$ = new BehaviorSubject<boolean>(false);
  private currentUserId: string | null = null;

  constructor() {
    // this.initializeWebSocket();
  }

  private initializeWebSocket(): void {
    /* 
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
    */
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
    // this.initializeWebSocket();
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
}
