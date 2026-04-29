import { Injectable } from "@angular/core";
import { StorageService } from "@services/core/storage.service";
import { NotifyService } from "@services/notifications/notify.service";

export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

export interface ArchiveDataMap {
  [table: string]: any[];
}

@Injectable({ providedIn: "root" })
export class StorageUpdateService {
  constructor(
    private storageService: StorageService,
    private notifyService: NotifyService
  ) {}

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

  removeRecordWithCascade(data: ArchiveDataMap, table: string, recordId: string): ArchiveDataMap {
    const updated = { ...data };
    const tableData = updated[table] || [];
    updated[table] = tableData.filter((r: any) => r.id !== recordId);

    if (table === "todos") {
      const todoTasks = tableData.filter((t: any) => t.todo_id === recordId);
      const todoTaskIds = todoTasks.map((t: any) => t.id);
      updated["tasks"] = (updated["tasks"] || []).filter((t: any) => t.todo_id !== recordId);
      updated["subtasks"] = (updated["subtasks"] || []).filter(
        (s: any) => !todoTaskIds.includes(s.task_id)
      );
      updated["comments"] = (updated["comments"] || []).filter(
        (c: any) => c.todo_id !== recordId && !todoTaskIds.includes(c.task_id)
      );
      updated["chats"] = (updated["chats"] || []).filter((c: any) => c.todo_id !== recordId);
    } else if (table === "tasks") {
      updated["subtasks"] = (updated["subtasks"] || []).filter((s: any) => s.task_id !== recordId);
      updated["comments"] = (updated["comments"] || []).filter((c: any) => c.task_id !== recordId);
    } else if (table === "subtasks") {
      updated["comments"] = (updated["comments"] || []).filter(
        (c: any) => c.subtask_id !== recordId
      );
    }

    return updated;
  }

  getCascadeChildIds(restoredRecord: any): { taskIds: string[]; subtaskIds: string[] } {
    const taskIds = restoredRecord.tasks?.map((t: any) => t.id) || [];
    const subtaskIds =
      restoredRecord.tasks?.flatMap((t: any) => t.subtasks?.map((s: any) => s.id) || []) || [];
    return { taskIds, subtaskIds };
  }

  restoreRecordWithCascade(
    data: ArchiveDataMap,
    table: string,
    restoredRecord: any,
    recordId: string
  ): ArchiveDataMap {
    const updated = { ...data };
    const tableData = updated[table] || [];
    updated[table] = tableData.map((r: any) => (r.id === recordId ? restoredRecord : r));

    if (table === "todos") {
      const { taskIds, subtaskIds } = this.getCascadeChildIds(restoredRecord);
      const existingTasks = data["tasks"] || [];
      const existingSubtasks = data["subtasks"] || [];
      const existingComments = data["comments"] || [];
      const existingChats = data["chats"] || [];

      const newTasks = restoredRecord.tasks || [];
      const newSubtasks = newTasks.flatMap((t: any) => t.subtasks || []);
      const newComments = newSubtasks.flatMap((s: any) => s.comments || []);

      updated["tasks"] = [
        ...existingTasks.filter((t: any) => !taskIds.includes(t.id)),
        ...newTasks,
      ];
      updated["subtasks"] = [
        ...existingSubtasks.filter((s: any) => !subtaskIds.includes(s.id)),
        ...newSubtasks,
      ];
      updated["comments"] = [
        ...existingComments.filter(
          (c: any) => c.todo_id !== recordId && !taskIds.includes(c.task_id)
        ),
        ...newComments,
      ];
      updated["chats"] = [...existingChats.filter((c: any) => c.todo_id !== recordId)];
    }

    return updated;
  }
}
