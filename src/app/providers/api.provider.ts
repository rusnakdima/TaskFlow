import { Injectable, inject } from "@angular/core";
import { Observable, from, of } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { invoke } from "@tauri-apps/api/core";

import { Response, ResponseStatus } from "@models/response.model";
import { RelationObj } from "@models/relation-obj.model";

import { StorageUpdateHelper } from "@helpers/storage-update.helper";
import { StorageService } from "@services/core/storage.service";
import { NotifyService } from "@services/notifications/notify.service";

type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

@Injectable({
  providedIn: "root",
})
export class ApiProvider {
  private notifyService = inject(NotifyService);
  private storageService = inject(StorageService);
  private storageUpdateHelper = new StorageUpdateHelper();

  invokeCommand<T>(command: string, args: Record<string, any> = {}): Observable<T> {
    return from(
      invoke<Response<T>>(command, args).then(
        (response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data as T;
          }
          throw new Error(response?.message || "Unknown error");
        },
        (err) => {
          throw new Error(err?.message || String(err));
        }
      )
    );
  }

  crud<T>(
    operation: Operation,
    table: string,
    options: {
      filter?: Record<string, any>;
      data?: any;
      id?: string;
      parentTodoId?: string;
      relations?: RelationObj[];
      load?: string[];
      isOwner?: boolean;
      isPrivate?: boolean;
    } = {},
    _isArray: boolean = false
  ): Observable<T> {
    console.debug(
      "CRUD: operation=" +
        operation +
        ", table=" +
        table +
        ", options=" +
        JSON.stringify(options) +
        ", isArray=" +
        _isArray
    );

    return new Observable<T>((subscriber) => {
      const syncMetadata = {
        is_owner: options.isOwner ?? true,
        is_private: options.isPrivate ?? true,
      };
      const payload: Record<string, any> = {
        operation,
        table,
        sync_metadata: syncMetadata,
      };

      if (options.id) payload["id"] = options.id;
      if (options.data) payload["data"] = options.data;
      if (options.filter) payload["filter"] = options.filter;
      if (options.relations) payload["relations"] = options.relations;
      if (options.load) payload["load"] = options.load;

      if (operation === "updateAll" && options.data) {
        this.executeUpdateAll(payload, options, subscriber);
      } else {
        invoke<Response<T>>("manage_data", payload).then(
          (response) => {
            if (response.status === ResponseStatus.SUCCESS) {
              subscriber.next(response.data as T);
              subscriber.complete();
            } else {
              this.notifyService.showError(response?.message || "Unknown error");
              subscriber.error(new Error(response?.message));
            }
          },
          (err) => {
            const msg = err?.message || String(err);
            this.notifyService.showError(msg);
            subscriber.error(new Error(msg));
          }
        );
      }
    }).pipe(
      tap((result) => {
        if (operation !== "get" && operation !== "getAll") {
          this.storageUpdateHelper.updateAfterOperation(
            operation,
            table,
            result,
            options.id,
            options.parentTodoId
          );
        }
        if (operation === "getAll" && table === "chats") {
          this.handleChatsResult(result as any[], options.filter);
        }
      }),
      catchError(() => of(null)) as any
    );
  }

  clearCache(): void {
    // Cache removed - no-op for backwards compatibility
  }

  private executeUpdateAll<T>(payload: any, options: any, subscriber: any): void {
    Promise.all(
      options.data.map((item: any) =>
        invoke<Response<T>>("manage_data", {
          operation: item.id ? "update" : "create",
          table: payload.table,
          id: item.id,
          data: item,
          sync_metadata: payload.sync_metadata,
        })
      )
    ).then(
      (responses: Response<T>[]) => {
        const success = responses.every((r) => r.status === ResponseStatus.SUCCESS);
        if (success) {
          subscriber.next(responses.map((r) => r.data).filter(Boolean) as T);
          subscriber.complete();
        } else {
          const firstError = responses.find((r) => r.status !== ResponseStatus.SUCCESS);
          const msg = firstError?.message || "Failed to update all records";
          this.notifyService.showError(msg);
          subscriber.error(new Error(msg));
        }
      },
      (err) => {
        const msg = err?.message || String(err);
        this.notifyService.showError(msg);
        subscriber.error(new Error(msg));
      }
    );
  }

  private handleChatsResult(chats: any[], filter?: Record<string, any>): void {
    if (chats?.length > 0) {
      const todoId = chats[0]?.todo_id || filter?.["todo_id"];
      if (todoId) {
        this.storageService.setChatsByTodo(chats, todoId);
      }
    }
  }
}
