/* sys lib */
import { inject, Injectable, NgZone, OnDestroy } from "@angular/core";
import { Observable, BehaviorSubject, Subject, throwError } from "rxjs";
import { take, map, timeout, filter, catchError } from "rxjs/operators";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { SyncMetadata } from "@models/sync-metadata";
import { RelationObj } from "@models/relation-obj.model";
import { Comment } from "@models/comment.model";

/* services */
import { StorageService } from "@services/core/storage.service";
import { ConflictDetectionService } from "@services/core/conflict-detection.service";
import { NotifyService } from "@services/notifications/notify.service";

type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

interface CrudParams {
  table: string;
  filter?: { [key: string]: any };
  data?: any;
  id?: string;
  parentTodoId?: string;
  relations?: RelationObj[];
  syncMetadata?: SyncMetadata;
}

@Injectable({
  providedIn: "root",
})
export class WebSocketService implements OnDestroy {
  private ngZone = inject(NgZone);
  private storageService = inject(StorageService);
  private conflictDetectionService = inject(ConflictDetectionService);
  private notifyService = inject(NotifyService);

  private socket: WebSocket | null = null;
  private url = "ws://127.0.0.1:8766";
  private isConnected$ = new BehaviorSubject<boolean>(false);
  private messageSubject = new Subject<any>();
  private eventSubject = new Subject<{ event: string; data: any }>();
  private unlistenFns: UnlistenFn[] = [];

  // Event handlers map for automatic storage updates
  private eventHandlers: Record<string, (data: any) => void> = {
    // Todo events
    "todo-created": (data) => this.storageService.addItem("todos", data),
    "todo-updated": (data) => this.storageService.updateItem("todos", data.id, data),
    "todo-deleted": (data) => {
      if (data.isDeleted === true) {
        this.storageService.updateItem("todos", data.id, data);
      } else {
        this.storageService.removeItem("todos", data.id);
      }
    },

    // Task events
    "task-created": (data) => this.storageService.addItem("tasks", data),
    "task-updated": (data) => this.storageService.updateItem("tasks", data.id, data),
    "task-deleted": (data) => {
      if (data.isDeleted === true) {
        this.storageService.updateItem("tasks", data.id, data);
      } else {
        this.storageService.removeItem("tasks", data.id);
      }
    },

    // Subtask events
    "subtask-created": (data) => this.storageService.addItem("subtasks", data),
    "subtask-updated": (data) => this.storageService.updateItem("subtasks", data.id, data),
    "subtask-deleted": (data) => {
      if (data.isDeleted === true) {
        this.storageService.updateItem("subtasks", data.id, data);
      } else {
        this.storageService.removeItem("subtasks", data.id);
      }
    },

    // Category events
    "category-created": (data) => this.storageService.addItem("categories", data),
    "category-updated": (data) => this.storageService.updateItem("categories", data.id, data),
    "category-deleted": (data) => this.storageService.removeItem("categories", data.id),

    // Comment events (special handling)
    "comment-created": (data) => this.handleCommentCreate(data),
    "comment-updated": (data) => this.handleCommentUpdate(data),
    "comment-deleted": (data) => this.handleCommentDelete(data),

    // Chat events
    "chat-created": (data) => this.handleChatUpdate(data),
    "chat-updated": (data) => this.handleChatUpdate(data),
    "chat-deleted": (data) => this.handleChatUpdate(data),
  };

  constructor() {
    this.connect();
    this.initTauriListeners();
  }

  // ==================== WebSocket Connection Management ====================

  connect(): void {
    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.isConnected$.next(true);
      };

      this.socket.onclose = () => {
        this.isConnected$.next(false);
        setTimeout(() => this.connect(), 5000);
      };

      this.socket.onerror = () => {
        this.isConnected$.next(false);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event) {
            const eventName = `ws-${data.event}`;
            window.dispatchEvent(new CustomEvent(eventName, { detail: data.data }));
            this.eventSubject.next({ event: data.event, data: data.data });
          } else {
            this.messageSubject.next(data);
          }
        } catch (e) {
          // Parse error - likely not a JSON message, ignore silently
        }
      };
    } catch (error) {
      this.isConnected$.next(false);
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.unlistenFns.forEach((fn) => fn());
    this.unlistenFns = [];
  }

  isConnected(): boolean {
    return this.isConnected$.value;
  }

  getConnectionStatus(): Observable<boolean> {
    return this.isConnected$.asObservable();
  }

  // ==================== Event Handling ====================

  onEvent(eventName: string): Observable<any> {
    return this.eventSubject.asObservable().pipe(
      filter((e) => e.event === eventName),
      map((e) => e.data)
    );
  }

  private async initTauriListeners() {
    const collections = ["tasks", "todos", "subtasks", "comments", "categories", "chats"];

    for (const collection of collections) {
      const unlisten = await listen(`db-change-${collection}`, (event: any) => {
        this.ngZone.run(() => {
          this.handleDbChange(collection, event.payload);
        });
      });
      this.unlistenFns.push(unlisten);
    }
  }

  private handleDbChange(collection: string, change: any) {
    const operationType = change.operationType;
    let eventType = "";

    const entityName = this.getEntityName(collection);

    switch (operationType) {
      case "insert":
        eventType = `${entityName}-created`;
        break;
      case "update":
      case "replace":
        eventType = `${entityName}-updated`;
        break;
      case "delete":
        eventType = `${entityName}-deleted`;
        break;
    }

    if (eventType) {
      const data = change.fullDocument || { id: change.documentKey?._id || change.documentKey?.id };

      // Check for conflicts before updating (only for updates)
      let hasConflict = false;
      if (eventType.includes("-updated") && data.id) {
        hasConflict = this.conflictDetectionService.checkConflict(entityName as any, data);
      }

      // Update storage automatically via event handlers (skip if conflict)
      const handler = this.eventHandlers[eventType];
      if (handler && !hasConflict) {
        handler(data);
      }

      // Send notification event (skip if conflict)
      if (!hasConflict) {
        this.notifyService.handleNotificationEvent(eventType, data);
      }

      // Dispatch custom event to maintain compatibility
      const customEventName = `ws-${eventType}`;
      window.dispatchEvent(new CustomEvent(customEventName, { detail: data }));
    }
  }

  private getEntityName(collection: string): string {
    return collection;
  }

  // ==================== Comment Event Handlers ====================

  private handleCommentCreate(data: Comment): void {
    if (data.taskId) {
      const task = this.storageService.getTaskById(data.taskId);
      if (task) {
        this.storageService.addCommentToTask(data.taskId, data);
      }
    } else if (data.subtaskId) {
      const subtask = this.storageService.getSubtaskById(data.subtaskId);
      if (subtask) {
        this.storageService.addCommentToSubtask(data.subtaskId, data);
      }
    }
  }

  private handleCommentUpdate(data: Comment): void {
    this.handleCommentCreate(data);
  }

  private handleCommentDelete(data: { id: string }): void {
    this.storageService.removeCommentFromAll(data.id);
  }

  private handleChatUpdate(data: any): void {
    // Chat updates are handled via todo updates since chats are nested
  }

  // ==================== CRUD Operations ====================

  private request<T>(action: string, payload: any): Observable<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    const requestId = Math.random().toString(36).substring(7);
    const request = { action, requestId, ...payload };

    this.socket.send(JSON.stringify(request));

    return this.messageSubject.asObservable().pipe(
      filter((response) => {
        const reqId = response.requestId || response.response?.requestId;
        return reqId === requestId;
      }),
      take(1),
      timeout(30000),
      map((response: { response: Response<T>; requestId?: string }) => {
        const resp = response.response || response;
        if (resp.status === ResponseStatus.SUCCESS) {
          return resp.data;
        } else {
          throw new Error(resp.message || "Operation failed");
        }
      }),
      catchError((error) => {
        if (error.name === "TimeoutError") {
          return throwError(() => new Error("Request timed out - no response from server"));
        }
        return throwError(() => error);
      })
    );
  }

  crud<T>(operation: Operation, params: CrudParams): Observable<T> {
    const payload: any = { entity: params.table };

    switch (operation) {
      case "getAll":
      case "get":
        if (params.filter) payload.filter = params.filter;
        if (params.relations) payload.relations = params.relations;
        break;
      case "create":
        payload.data = { ...params.data };
        if (params.parentTodoId && params.table === "tasks") {
          payload.data.todoId = params.parentTodoId;
        }
        break;
      case "update":
        payload.id = params.id;
        payload.data = { ...params.data };
        if (params.parentTodoId && params.table === "tasks") {
          payload.data.todoId = params.parentTodoId;
        }
        break;
      case "updateAll":
        payload.data = params.data;
        payload.todoId = params.parentTodoId;
        break;
      case "delete":
        payload.id = params.id;
        break;
    }

    if (params.syncMetadata) {
      payload.syncMetadata = params.syncMetadata;
    }

    const action: string = {
      getAll: "get-all",
      get: "get",
      create: "create",
      update: "update",
      updateAll: "update-all",
      delete: "delete",
    }[operation];

    return this.request<T>(action, payload);
  }

  // ==================== Storage Event Listeners (Legacy Support) ====================

  /**
   * Initialize storage event listeners for backward compatibility
   * Maps WebSocket events to StorageService updates
   */
  initStorageListeners(): void {
    const entities: Array<"todos" | "tasks" | "subtasks" | "categories" | "comments"> = [
      "todos",
      "tasks",
      "subtasks",
      "categories",
      "comments",
    ];

    entities.forEach((entity) => {
      window.addEventListener(`ws-${entity}-created`, (event: any) =>
        this.storageService.addItem(entity, event.detail)
      );
      window.addEventListener(`ws-${entity}-updated`, (event: any) =>
        this.storageService.updateItem(entity, event.detail.id, event.detail)
      );
      window.addEventListener(`ws-${entity}-deleted`, (event: any) => {
        const data = event.detail;
        if (data.isDeleted === true) {
          this.storageService.updateItem(entity, data.id, data);
        } else {
          this.storageService.removeItem(entity, data.id);
        }
      });
    });
  }

  // ==================== Cleanup ====================

  ngOnDestroy() {
    this.disconnect();
  }
}
