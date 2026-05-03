import { Injectable, inject } from "@angular/core";
import { Observable, from, Subscriber } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

import { Response, ResponseStatus } from "@models/response.model";
import { RelationObj } from "@models/relation-obj.model";
import { Chat } from "@models/chat.model";

import { StorageUpdateService } from "@services/core/storage.service";
import { StorageService } from "@services/core/storage.service";
import { NotifyService } from "@services/notifications/notify.service";

type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

interface CrudOptions {
  id?: string;
  data?: unknown;
  parentTodoId?: string;
  load?: string[];
  filter?: { [key: string]: any };
  visibility?: string;
  skip?: number;
  limit?: number;
  sort?: { [key: string]: number };
}

@Injectable({
  providedIn: "root",
})
export class ApiProvider {
  private notifyService = inject(NotifyService);
  private storageService = inject(StorageService);
  private storageUpdateService = inject(StorageUpdateService);

  invokeCommand<T>(command: string, args: Record<string, unknown> = {}): Observable<T> {
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

  crud<T>(operation: Operation, table: string, options: CrudOptions = {}): Observable<T> {
    return new Observable<T>((subscriber) => {
      const payload: Record<string, unknown> = {
        operation,
        table,
      };

      if (options.id) payload["id"] = options.id;
      if (options.data) payload["data"] = options.data;
      if (options.filter) payload["filter"] = options.filter;
      if (options.load) payload["load"] = JSON.stringify(options.load);
      if (options.visibility) payload["visibility"] = options.visibility;
      if (options.skip !== undefined) payload["skip"] = options.skip;
      if (options.limit !== undefined) payload["limit"] = options.limit;
      if (options.sort) payload["sort"] = JSON.stringify(options.sort);

      if (operation === "updateAll" && options.data) {
        this.executeUpdateAll(payload, options, subscriber);
      } else {
        invoke<Response<T>>("manage_data", payload).then(
          (response) => {
            if (response.status === ResponseStatus.SUCCESS) {
              if (operation !== "get" && operation !== "getAll") {
                this.storageUpdateService.updateAfterOperation(
                  operation,
                  table,
                  response.data,
                  options.id,
                  options.parentTodoId
                );
              }
              if (operation === "getAll" && table === "chats") {
                this.handleChatsResult(response.data as Chat[], options.filter);
              }
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
            subscriber.error(new Error(err));
          }
        );
      }
    });
  }

  clearCache(): void {
    // Cache removed - no-op for backwards compatibility
  }

  isOffline(): boolean {
    return !navigator.onLine;
  }

  private executeUpdateAll<T>(
    payload: Record<string, unknown>,
    options: CrudOptions,
    subscriber: Subscriber<T>
  ): void {
    const dataItems = options.data as Array<Record<string, unknown>>;
    Promise.all(
      dataItems.map((item) =>
        invoke<Response<T>>("manage_data", {
          operation: item["id"] ? "update" : "create",
          table: payload["table"] as string,
          id: item["id"] as string | undefined,
          data: item,
          visibility: options.visibility,
        })
      )
    ).then(
      (responses: Response<T>[]) => {
        const success = responses.every((r) => r.status === ResponseStatus.SUCCESS);
        if (success) {
          const table = payload["table"] as string;
          responses.forEach((response, index) => {
            const item = dataItems[index];
            this.storageUpdateService.updateAfterOperation(
              item["id"] ? "update" : "create",
              table,
              response.data,
              item["id"] as string | undefined,
              undefined
            );
          });
          subscriber.next(responses.map((r) => r.data).filter(Boolean) as T);
          subscriber.complete();
        } else {
          const firstError = responses.find((r) => r.status !== ResponseStatus.SUCCESS);
          const msg = firstError?.message || "Failed to update all records";
          this.notifyService.showError(msg);
          subscriber.error(new Error(msg));
        }
      },
      (err: unknown) => {
        const msg = (err as Error)?.message || String(err);
        this.notifyService.showError(msg);
        subscriber.error(new Error(msg));
      }
    );
  }

  private handleChatsResult(chats: Chat[], filter?: Record<string, unknown>): void {
    if (chats?.length > 0) {
      const todoId = (chats[0]?.todo_id || filter?.["todo_id"]) as string | undefined;
      if (todoId) {
        this.storageService.setChatsByTodo(chats, todoId);
      }
    }
  }
}
