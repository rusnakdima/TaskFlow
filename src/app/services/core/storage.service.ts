import { Injectable, inject } from "@angular/core";

import { UnifiedStorageService } from "@app/store/unified-storage.service";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { User } from "@models/user.model";

@Injectable({ providedIn: "root" })
export class StorageService {
  private storage = inject(UnifiedStorageService);

  setCollection(table: string, data: any[], options?: { append?: boolean }): void {
    this.mapTableToSetCollection(table, data, options);
  }

  private mapTableToSetCollection(
    table: string,
    data: any[],
    options?: { append?: boolean }
  ): void {
    const tableMapping: Record<
      string,
      | "categories"
      | "profiles"
      | "privateTodos"
      | "sharedTodos"
      | "publicTodos"
      | "tasks"
      | "subtasks"
      | "comments"
      | "chats"
      | "allProfiles"
      | "user"
      | "users"
      | "dailyActivities"
    > = {
      categories: "categories",
      profiles: "profiles",
      privateTodos: "privateTodos",
      sharedTodos: "sharedTodos",
      publicTodos: "publicTodos",
      tasks: "tasks",
      subtasks: "subtasks",
      comments: "comments",
      chats: "chats",
      allProfiles: "allProfiles",
      user: "user",
      users: "users",
      dailyActivities: "dailyActivities",
    };

    const mappedType = tableMapping[table];
    if (mappedType) {
      this.storage.setCollection(mappedType, data, options);
    }
  }

  addItem(table: string, item: any): void {
    this.storage.addItem(table as any, item);
  }

  updateItem(table: string, id: string, data: Partial<any>): void {
    this.storage.updateItem(table as any, id, data);
  }

  removeItem(table: string, id: string): void {
    this.storage.removeItem(table as any, id);
  }

  batchUpdate(table: string, items: { id: string; data: Partial<any> }[]): void {
    const mappedItems = items.map((item) => ({ id: item.id, updates: item.data }));
    this.storage.batchUpdate(table as any, mappedItems);
  }

  getById<T>(table: string, id: string): T | undefined {
    return this.storage.getById(table as any, id) as T | undefined;
  }

  todos(visibility?: string): Todo[] {
    if (!visibility || visibility === "all") {
      return this.storage.todos();
    }
    switch (visibility) {
      case "private":
        return this.storage.privateTodos();
      case "shared":
        return this.storage.sharedTodos();
      case "public":
        return this.storage.publicTodos();
      default:
        return this.storage.todos();
    }
  }

  tasks(): Task[] {
    return this.storage.tasks();
  }

  getTasksByTodoId(todoId: string): Task[] {
    return this.storage.getTasksByTodoId(todoId);
  }

  getSubtasksByTaskId(taskId: string): Subtask[] {
    return this.storage.getSubtasksByTaskId(taskId);
  }

  getCommentsByTaskId(taskId: string): Comment[] {
    return this.storage.getCommentsByTaskId(taskId);
  }
}
