/* sys lib */
import { inject, Injectable } from "@angular/core";
import { Observable, BehaviorSubject, Subject, throwError } from "rxjs";
import { take, map, timeout, filter, catchError } from "rxjs/operators";

/* models */
import { Response, ResponseStatus } from "@models/response.model";
import { SyncMetadata } from "@models/sync-metadata";

/* services */
import { NotifyService } from "./notify.service";

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
        console.error("LocalWebSocketService: WebSocket error", error);
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
          console.error("LocalWebSocketService: Failed to parse message", e);
        }
      };
    } catch (error) {
      console.error("LocalWebSocketService: Connection failed", error);
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
      console.error("LocalWebSocketService: Cannot emit, socket not connected");
      return;
    }
    this.socket.send(JSON.stringify({ action, ...payload }));
  }

  request<T>(action: string, payload: any): Observable<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error(
        "[LocalWebSocketService] Socket not connected. Ready state:",
        this.socket?.readyState
      );
      return throwError(() => new Error("Local WebSocket not connected"));
    }

    const requestId = Math.random().toString(36).substring(7);
    const request = { action, requestId, ...payload };

    this.socket.send(JSON.stringify(request));

    return this.messageSubject.asObservable().pipe(
      filter((response) => {
        const reqId = response.requestId || response.response?.requestId;
        const matches = reqId === requestId;
        return matches;
      }),
      take(1),
      timeout(30000),
      map((response: { response: Response<T>; requestId?: string }) => {
        const resp = response.response || response;
        const status = resp.status;

        this.notifyService.showNotify(status, resp.message);
        if (status === ResponseStatus.SUCCESS) {
          return resp.data;
        } else {
          throw new Error(resp.message || "Operation failed");
        }
      }),
      catchError((error) => {
        console.error("[LocalWebSocketService] Request failed:", error);
        if (error.name === "TimeoutError") {
          return throwError(() => new Error("Request timed out - no response from server"));
        }
        return throwError(() => error);
      })
    );
  }

  getAll<T>(
    entity: string,
    filter: { [key: string]: any },
    syncMetadata?: SyncMetadata
  ): Observable<T[]> {
    return this.request<T[]>("get-all", {
      entity,
      filter,
      syncMetadata,
    });
  }

  get<T>(
    entity: string,
    filter: { [key: string]: any },
    syncMetadata?: SyncMetadata
  ): Observable<T> {
    return this.request<T>("get", {
      entity,
      filter,
      syncMetadata,
    });
  }

  create<T>(
    entity: string,
    data: any,
    parentTodoId?: string,
    syncMetadata?: SyncMetadata
  ): Observable<T> {
    return this.request<T>("create", {
      entity,
      data: { ...data, todoId: parentTodoId },
      syncMetadata,
    });
  }

  update<T>(
    entity: string,
    id: string,
    data: any,
    parentTodoId?: string,
    syncMetadata?: SyncMetadata
  ): Observable<T> {
    return this.request<T>("update", {
      entity,
      id,
      data: { ...data, todoId: parentTodoId },
      syncMetadata,
    });
  }

  delete(
    entity: string,
    id: string,
    parentTodoId?: string,
    syncMetadata?: SyncMetadata
  ): Observable<void> {
    return this.request<void>("delete", {
      entity,
      id,
      syncMetadata,
    });
  }
}
