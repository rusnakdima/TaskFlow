import { inject, Injectable } from "@angular/core";
import { Observable, Subject, throwError } from "rxjs";
import { take, map, timeout, filter, catchError, tap } from "rxjs/operators";

import { Response, ResponseStatus } from "@models/response.model";
import { SyncMetadata } from "@models/sync-metadata";
import { RelationObj } from "@models/relation-obj.model";
import { WebSocketConnectionService } from "@services/core/websocket-connection.service";

type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

interface CrudParams {
  table: string;
  filter?: { [key: string]: any };
  data?: any;
  id?: string;
  parentTodoId?: string;
  relations?: RelationObj[];
  load?: string[];
  syncMetadata?: SyncMetadata;
}

@Injectable({
  providedIn: "root",
})
export class WebSocketCrudService {
  private connectionService = inject(WebSocketConnectionService);
  private messageSubject = new Subject<any>();

  request<T>(action: string, payload: any): Observable<T> {
    const socket = this.connectionService.getSocket();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return throwError(() => new Error("WebSocket not connected"));
    }

    const requestId = Math.random().toString(36).substring(7);
    const request = { action, requestId, ...payload };

    socket.send(JSON.stringify(request));

    return this.messageSubject.asObservable().pipe(
      filter((response) => response.requestId === requestId),
      take(1),
      timeout(30000),
      map(
        (response: {
          requestId?: string;
          response?: Response<T>;
          status?: string;
          data?: T;
          message?: string;
        }) => {
          let resp: Response<T>;
          if (response.response) {
            resp = response.response;
          } else if (response.status) {
            resp = {
              status: response.status as ResponseStatus,
              message: response.message || "",
              data: response.data as T,
            } as Response<T>;
          } else {
            throw new Error("Invalid response format");
          }

          if (resp.status === ResponseStatus.SUCCESS) {
            return resp.data as T;
          } else {
            throw new Error(resp.message || "Operation failed");
          }
        }
      ),
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
        if (params.filter) payload.filter = params.filter;
        if (params.relations) payload.relations = params.relations;
        if (params.load) payload.load = params.load;
        break;
      case "get":
        if (params.id) payload.id = params.id;
        if (params.filter) payload.filter = params.filter;
        if (params.relations) payload.relations = params.relations;
        if (params.load) payload.load = params.load;
        break;
      case "create":
        payload.data = { ...params.data };
        if (params.parentTodoId && params.table === "tasks") {
          payload.data.todo_id = params.parentTodoId;
        }
        break;
      case "update":
        payload.id = params.id;
        payload.data = { ...params.data };
        if (params.parentTodoId && params.table === "tasks") {
          payload.data.todo_id = params.parentTodoId;
        }
        break;
      case "updateAll":
        payload.data = params.data;
        payload.todo_id = params.parentTodoId;
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

  getMessageSubject(): Subject<any> {
    return this.messageSubject;
  }
}
