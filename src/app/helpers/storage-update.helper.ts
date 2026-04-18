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
    parentTodoId?: string,
    isTeamEntityFn?: (table: string, id?: string, parentTodoId?: string) => boolean
  ): void {
    try {
      if (operation !== "get" && operation !== "getAll") {
        this.notifyService.handleLocalAction(table, operation, result || { id });
      }

      const isTeam = isTeamEntityFn ? isTeamEntityFn(table, id, parentTodoId) : false;

      switch (operation) {
        case "create":
          this.handleCreate(table, result, isTeam);
          break;
        case "update":
          this.handleUpdate(table, result, isTeam);
          break;
        case "delete":
          this.handleDelete(table, id, parentTodoId, isTeam);
          break;
        case "updateAll":
          this.handleUpdateAll(table, result, parentTodoId);
          break;
      }
    } catch {
      // Error silently ignored
    }
  }

  private handleCreate(table: string, result: any, isTeam: boolean): void {
    this.storageService.addItem(table as any, result, { isPrivate: !isTeam });
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

  private handleDelete(table: string, id?: string, parentTodoId?: string, isTeam?: boolean): void {
    if (table === "todos" && id) {
      this.archiveTodoWithCascade(id, isTeam || false);
    } else {
      let parentId: string | undefined;
      if (table === "tasks" && id) {
        parentId = this.storageService.getById("tasks", id)?.todoId;
      } else if (table === "subtasks" && id) {
        parentId = this.storageService.getById("subtasks", id)?.taskId;
      }
      this.storageService.removeItem(table as any, id!, parentId, isTeam);
    }
  }

  private handleUpdateAll(table: string, result: any, parentTodoId?: string): void {
    if (table === "chats" && result && Array.isArray(result)) {
      const todoId = parentTodoId || (result[0] as any)?.todoId;
      if (todoId) {
        this.storageService.setChatsByTodo(todoId, result);
      }
    } else {
      (result as any[]).forEach((item) => {
        if (item && item.id) {
          this.storageService.updateItem(table as any, item.id, item, { isPrivate: true });
        }
      });
    }
  }

  private archiveTodoWithCascade(todoId: string, isTeam: boolean): void {
    this.storageService.removeItem("todos", todoId, undefined, isTeam);
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
