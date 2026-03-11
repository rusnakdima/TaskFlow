/* sys lib */
import { inject, Injectable } from "@angular/core";
import { Observable, BehaviorSubject, Subject, throwError } from "rxjs";
import { take, map, timeout, filter, catchError } from "rxjs/operators";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { SyncMetadata } from "@models/sync-metadata";
import { RelationObj } from "@models/relation-obj.model";

/* services */
import { NotifyService } from "@services/notify.service";

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
export class LocalWebSocketService {
  private socket: WebSocket | null = null;
  private url = "ws://127.0.0.1:8766";
  private isConnected$ = new BehaviorSubject<boolean>(false);
  private messageSubject = new Subject<any>();
  private eventSubject = new Subject<{ event: string; data: any }>();

  private notifyService = inject(NotifyService);

  constructor() {
    this.connect();
  }

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

      this.socket.onerror = (error) => {
        this.isConnected$.next(false);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event) {
            this.handleBroadcast(data);
          } else {
            this.messageSubject.next(data);
          }
        } catch (e) {
          // Failed to parse message
        }
      };
    } catch (error) {
      this.isConnected$.next(false);
    }
  }

  private handleBroadcast(data: any): void {
    const eventName = `ws-${data.event}`;
    window.dispatchEvent(new CustomEvent(eventName, { detail: data.data }));

    this.eventSubject.next({ event: data.event, data: data.data });
  }

  isConnected(): boolean {
    return this.isConnected$.value;
  }

  getConnectionStatus(): Observable<boolean> {
    return this.isConnected$.asObservable();
  }

  onEvent(eventName: string): Observable<any> {
    return this.eventSubject.asObservable().pipe(
      filter((e) => e.event === eventName),
      map((e) => e.data)
    );
  }

  emit(action: string, payload: any): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ action, ...payload }));
  }

  private request<T>(action: string, payload: any): Observable<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return throwError(() => new Error("Local WebSocket not connected"));
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
        // Only show notification for non-success or custom messages (not generic "Operation successful")
        if (
          resp.status !== ResponseStatus.SUCCESS ||
          (resp.message && resp.message !== "Operation successful")
        ) {
          this.notifyService.showNotify(resp.status, resp.message);
        }
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

  private buildPayload(operation: Operation, params: CrudParams): any {
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

    return payload;
  }

  private mapOperation(operation: Operation): string {
    const map: Record<Operation, string> = {
      getAll: "get-all",
      get: "get",
      create: "create",
      update: "update",
      updateAll: "update-all",
      delete: "delete",
    };
    return map[operation];
  }

  crud<T>(operation: Operation, params: CrudParams): Observable<T> {
    const payload = this.buildPayload(operation, params);
    const action = this.mapOperation(operation);
    return this.request<T>(action, payload);
  }
}
