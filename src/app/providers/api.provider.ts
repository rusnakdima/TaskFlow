import { Injectable, inject } from "@angular/core";
import { Observable, from, Subscriber, Subject } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

import { Response, ResponseStatus } from "@models/response.model";
import { RelationObj } from "@models/relation-obj.model";
import { Chat } from "@models/chat.model";

import { DataService } from "@services/data/data.service";
import { NotifyService } from "@services/notifications/notify.service";

export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

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
  private dataService = inject(DataService);

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
      if (this.isOffline() && operation !== "get" && operation !== "getAll") {
        const errorMsg = "You are offline. Changes will sync when connection is restored.";
        this.notifyService.showWarning(errorMsg);
        subscriber.error(new Error(errorMsg));
        return;
      }

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
                this.emitToDataService(operation, table, response.data);
              }
              if ((operation === "getAll" || operation === "get") && table === "chats") {
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
    if (this.isOffline()) {
      const errorMsg = "You are offline. Changes will sync when connection is restored.";
      this.notifyService.showWarning(errorMsg);
      subscriber.error(new Error(errorMsg));
      return;
    }

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
            this.emitToDataService(item["id"] ? "update" : "create", table, response.data);
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
    if (!chats || chats.length === 0) return;

    const todoId = (chats[0]?.todo_id || filter?.["todo_id"]) as string | undefined;
    if (todoId) {
      const cleanedChats = chats.map((chat) => {
        const { todo, ...rest } = chat as any;
        return rest;
      });
      this.dataService.setChatsForTodo(cleanedChats, todoId);
    }
  }

  private emitToDataService(operation: Operation, table: string, data: any): void {
    if (!data || !data.id) return;

    switch (operation) {
      case "create":
        this.emitInsert(table, data);
        break;
      case "update":
        this.emitUpdate(table, data);
        break;
      case "delete":
        this.emitDelete(table, data);
        break;
    }
  }

  private emitInsert(table: string, data: any): void {
    const subject = this.getSubjectForTable(table);
    if (subject) {
      const currentData = this.getCurrentDataForTable(table);
      subject.next([...currentData, data]);
    }
  }

  private emitUpdate(table: string, data: any): void {
    const subject = this.getSubjectForTable(table);
    if (subject) {
      const currentData = this.getCurrentDataForTable(table);
      const updated = currentData.map((item: any) =>
        item.id === data.id ? { ...item, ...data } : item
      );
      subject.next(updated);
    }
  }

  private emitDelete(table: string, data: any): void {
    const subject = this.getSubjectForTable(table);
    if (subject) {
      const currentData = this.getCurrentDataForTable(table);
      subject.next(currentData.filter((item: any) => item.id !== data.id));
    }
  }

  private getSubjectForTable(table: string): Subject<any> | null {
    switch (table) {
      case "todos":
        return this.dataService.todos$;
      case "tasks":
        return this.dataService.tasks$;
      case "subtasks":
        return this.dataService.subtasks$;
      case "comments":
        return this.dataService.comments$;
      case "chats":
        return this.dataService.chats$;
      case "categories":
        return this.dataService.categories$;
      default:
        return null;
    }
  }

  private getCurrentDataForTable(table: string): any[] {
    switch (table) {
      case "todos":
        return this.dataService.getCurrentTodos();
      case "tasks":
        return this.dataService.getCurrentTasks();
      case "subtasks":
        return this.dataService.getCurrentSubtasks();
      case "comments":
        return this.dataService.getCurrentComments();
      case "chats":
        return this.dataService.getCurrentChats();
      case "categories":
        return this.dataService.getCurrentCategories();
      default:
        return [];
    }
  }
}
