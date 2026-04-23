import { Injector, inject } from "@angular/core";
import { StorageService } from "@services/core/storage.service";
import { NotifyService } from "@services/notifications/notify.service";

export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

export class StorageUpdateHelper {
  private injector = inject(Injector);
  private get storageService(): StorageService {
    return this.injector.get(StorageService);
  }
  private get notifyService(): NotifyService {
    return this.injector.get(NotifyService);
  }

  updateAfterOperation(
    operation: Operation,
    table: string,
    result: any,
    id?: string,
    parentTodoId?: string
  ): void {
    try {
      if (operation !== "get" && operation !== "getAll") {
        this.notifyService.handleLocalAction(table, operation, result || { id });
      }

      const isTeam = result?.visibility === "team";

      switch (operation) {
        case "create":
          this.storageService.addItem(table as any, result, { isPrivate: !isTeam });
          break;
        case "update":
          this.handleUpdate(table, result, isTeam);
          break;
        case "delete":
          this.handleDelete(table, id, parentTodoId);
          break;
        case "updateAll":
          this.handleUpdateAll(table, result, parentTodoId);
          break;
      }
    } catch (error) {
      console.error("Operation " + operation + " failed for " + table + ":", error);
    }
  }

  private handleUpdate(table: string, result: any, isTeam: boolean): void {
    if (!result || !result.id) return;

    const options = { isPrivate: !isTeam };

    if (table === "tasks") {
      const existing = this.storageService.getById("tasks", result.id);
      if (existing) {
        const merged = this.preserveFields(result, existing, ["comments", "subtasks"]);
        this.storageService.updateItem(table as any, result.id, merged, options);
      } else {
        this.storageService.updateItem(table as any, result.id, result, options);
      }
      return;
    }

    if (table === "subtasks") {
      const existing = this.storageService.getById("subtasks", result.id);
      if (existing) {
        const merged = this.preserveFields(result, existing, ["comments"]);
        this.storageService.updateItem(table as any, result.id, merged, options);
      } else {
        this.storageService.updateItem(table as any, result.id, result, options);
      }
      return;
    }

    this.storageService.updateItem(table as any, result.id, result, options);
  }

  private handleDelete(table: string, id?: string, parentTodoId?: string): void {
    if (table === "todos" && id) {
      this.storageService.removeItem("todos", id);
    } else if (table === "tasks" || table === "subtasks") {
      this.storageService.removeRecordWithCascade(table, id!);
    } else {
      this.storageService.removeItem(table as any, id!);
    }
  }

  private handleUpdateAll(table: string, result: any, parentTodoId?: string): void {
    if (table === "chats" && result && Array.isArray(result)) {
      const todoId = parentTodoId || (result[0] as any)?.todo_id;
      if (todoId) {
        this.storageService.setChatsByTodo(result, todoId);
      }
    } else {
      (result as any[]).forEach((item) => {
        if (item && item.id) {
          this.storageService.updateItem(table as any, item.id, item, { isPrivate: true });
        }
      });
    }
  }

  preserveFields<T extends Record<string, any>>(
    incoming: T,
    existing: T,
    fieldsToPreserve: string[]
  ): T {
    const result: any = { ...incoming };
    for (const field of fieldsToPreserve) {
      const incomingValue = incoming[field];
      const existingValue = existing[field];

      if (incomingValue !== undefined && incomingValue !== null) {
        result[field] = incomingValue;
      } else if (existingValue) {
        result[field] = existingValue;
      }
    }
    return result as T;
  }
}
