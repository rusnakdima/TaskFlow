import { Injectable, inject, computed, WritableSignal } from "@angular/core";
import { StorageStateService } from "./storage-state.service";
import { StorageCrudService } from "./storage-crud.service";
import { StorageChatService } from "./storage-chat.service";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { User } from "@models/user.model";
import { groupByKey } from "@stores/utils/store-helpers";

@Injectable({ providedIn: "root" })
export class StorageFacadeService {
  private state = inject(StorageStateService);
  private crud = inject(StorageCrudService);
  private chat = inject(StorageChatService);

  setCollection<
    T extends
      | "categories"
      | "profiles"
      | "privateTodos"
      | "sharedTodos"
      | "publicTodos"
      | "allProfiles"
      | "user"
      | "tasks"
      | "subtasks"
      | "comments"
      | "chats"
      | "users"
      | "dailyActivities"
      | "todos",
  >(
    type: T,
    items: T extends "profiles"
      ? Profile | null
      : T extends "tasks"
        ? Task[]
        : T extends "subtasks"
          ? Subtask[]
          : T extends "comments"
            ? Comment[]
            : T extends "chats"
              ? Chat[]
              : T extends "privateTodos" | "sharedTodos" | "publicTodos" | "allProfiles"
                ? T extends "allProfiles"
                  ? Profile[]
                  : Todo[]
                : T extends "user"
                  ? User | null
                  : T extends "users"
                    ? User[]
                    : T extends "dailyActivities"
                      ? any[]
                      : Category[],
    options?: { append?: boolean; resetPagination?: boolean }
  ): void {
    switch (type) {
      case "categories":
        this.state._categories.set(items as Category[]);
        break;
      case "profiles":
        this.state._profile.set(items as Profile | null);
        if (items && typeof items === "object" && "user" in items && (items as Profile).user) {
          this.state._user.set((items as Profile).user || null);
        }
        break;
      case "tasks":
        if (options?.append) {
          this.state._tasks.update((existing) => [...existing, ...(items as Task[])]);
        } else {
          this.state._tasks.update((existing) => {
            const existingById = new Map(existing.map((t) => [t.id, t]));
            for (const item of items as Task[]) {
              existingById.set(item.id, item);
            }
            return Array.from(existingById.values());
          });
        }
        if (options?.resetPagination) {
          this.resetPagination("tasks");
        }
        break;
      case "subtasks":
        if (options?.append) {
          this.state._subtasks.update((existing) => [...existing, ...(items as Subtask[])]);
        } else {
          this.state._subtasks.update((existing) => {
            const existingById = new Map(existing.map((s) => [s.id, s]));
            for (const item of items as Subtask[]) {
              existingById.set(item.id, item);
            }
            return Array.from(existingById.values());
          });
        }
        if (options?.resetPagination) {
          this.resetPagination("subtasks");
        }
        break;
      case "comments":
        if (options?.append) {
          this.state._comments.update((existing) => [...existing, ...(items as Comment[])]);
        } else {
          this.state._comments.update((existing) => {
            const existingById = new Map(existing.map((c) => [c.id, c]));
            for (const item of items as Comment[]) {
              existingById.set(item.id, item);
            }
            return Array.from(existingById.values());
          });
        }
        if (options?.resetPagination) {
          this.resetPagination("comments");
        }
        break;
      case "chats":
        if (options?.append) {
          this.state._chats.update((existing) => [...existing, ...(items as Chat[])]);
        } else {
          this.state._chats.update((existing) => {
            const existingById = new Map(existing.map((c) => [c.id, c]));
            for (const item of items as Chat[]) {
              existingById.set(item.id, item);
            }
            return Array.from(existingById.values());
          });
        }
        if (options?.resetPagination) {
          this.resetPagination("chats");
        }
        break;
      case "privateTodos":
        this.storeTodosWithRelations("privateTodos", items as Todo[], options);
        break;
      case "sharedTodos":
        this.storeTodosWithRelations("sharedTodos", items as Todo[], options);
        break;
      case "publicTodos":
        this.storeTodosWithRelations("publicTodos", items as Todo[], options);
        break;
      case "todos": {
        const allTodos = items as Todo[];
        const privateItems: Todo[] = [];
        const sharedItems: Todo[] = [];
        const publicItems: Todo[] = [];

        for (const todo of allTodos) {
          switch ((todo as any).visibility) {
            case "private":
              privateItems.push(todo);
              break;
            case "shared":
              sharedItems.push(todo);
              break;
            case "public":
              publicItems.push(todo);
              break;
            default:
              privateItems.push(todo);
          }
        }

        if (privateItems.length > 0) {
          this.storeTodosWithRelations("privateTodos", privateItems, options);
        }
        if (sharedItems.length > 0) {
          this.storeTodosWithRelations("sharedTodos", sharedItems, options);
        }
        if (publicItems.length > 0) {
          this.storeTodosWithRelations("publicTodos", publicItems, options);
        }
        break;
      }
      case "allProfiles":
        this.state._allProfiles.set(items as Profile[]);
        break;
      case "user":
        this.state._user.set(items as User | null);
        break;
      case "users":
        this.state._users.set(items as User[]);
        break;
      case "dailyActivities":
        this.state._dailyActivities.set(items as any[]);
        break;
    }
  }

  private storeTodosWithRelations(
    type: "privateTodos" | "sharedTodos" | "publicTodos",
    items: Todo[],
    options?: { append?: boolean; resetPagination?: boolean }
  ): void {
    const nestedTasks: Task[] = [];
    const nestedChats: Chat[] = [];
    const nestedUsers: User[] = [];
    const todosToStore: Todo[] = [];

    for (const todo of items) {
      const cleanTodo = { ...todo } as any;

      if ((todo as any).tasks && Array.isArray((todo as any).tasks)) {
        nestedTasks.push(...(todo as any).tasks);
        delete cleanTodo.tasks;
      }
      if ((todo as any).chats && Array.isArray((todo as any).chats)) {
        nestedChats.push(...(todo as any).chats);
        delete cleanTodo.chats;
      }
      if ((todo as any).user) {
        nestedUsers.push((todo as any).user);
        delete cleanTodo.user;
      }

      todosToStore.push(cleanTodo as Todo);
    }

    if (nestedTasks.length > 0) {
      this.setCollection("tasks", nestedTasks, { append: options?.append });
    }
    if (nestedChats.length > 0) {
      this.setCollection("chats", nestedChats, { append: options?.append });
    }
    if (nestedUsers.length > 0) {
      this.setCollection("users", nestedUsers, { append: options?.append });
    }

    switch (type) {
      case "privateTodos":
        this.state._privateTodos.update((existing) => {
          const existingById = new Map(existing.map((t) => [t.id, t]));
          for (const item of todosToStore) {
            if (item.visibility === "private") {
              existingById.set(item.id, item);
            }
          }
          return Array.from(existingById.values());
        });
        break;
      case "sharedTodos":
        this.state._sharedTodos.update((existing) => {
          const existingById = new Map(existing.map((t) => [t.id, t]));
          for (const item of todosToStore) {
            if (item.visibility === "shared" || item.visibility === undefined) {
              existingById.set(item.id, item);
            }
          }
          return Array.from(existingById.values());
        });
        break;
      case "publicTodos":
        this.state._publicTodos.update((existing) => {
          const existingById = new Map(existing.map((t) => [t.id, t]));
          for (const item of todosToStore) {
            if (item.visibility === "public") {
              existingById.set(item.id, item);
            }
          }
          return Array.from(existingById.values());
        });
        break;
    }

    if (options?.resetPagination) {
      this.resetPagination("todos");
    }
  }

  updateAfterOperation(
    operation: "getAll" | "get" | "create" | "update" | "updateAll" | "delete",
    table: string,
    result: any,
    id?: string,
    parentTodoId?: string,
    notifyService?: any
  ): void {
    try {
      if (operation !== "get" && operation !== "getAll" && notifyService) {
        notifyService.handleLocalAction(table, operation, result || { id });
      }

      const isShared = result?.visibility === "shared";

      switch (operation) {
        case "create":
          this.crud.addItem(table as any, result, { isPrivate: !isShared });
          break;
        case "update":
          this.handleUpdate(table, result, isShared);
          break;
        case "delete":
          this.handleDelete(table, id, parentTodoId);
          break;
        case "updateAll":
          this.handleUpdateAll(table, result, parentTodoId);
          break;
      }
    } catch (error) {}
  }

  private handleUpdate(table: string, result: any, isShared: boolean): void {
    if (!result || !result.id) return;

    const options = { isPrivate: !isShared };

    if (table === "tasks") {
      const existing = this.crud.getById("tasks", result.id);
      if (existing) {
        const merged = this.mergePreservingFields(result, existing, ["comments", "subtasks"]);
        this.crud.updateItem(table as any, result.id, merged, options);
      } else {
        this.crud.updateItem(table as any, result.id, result, options);
      }
      return;
    }

    if (table === "subtasks") {
      const existing = this.crud.getById("subtasks", result.id);
      if (existing) {
        const merged = this.mergePreservingFields(result, existing, ["comments"]);
        this.crud.updateItem(table as any, result.id, merged, options);
      } else {
        this.crud.updateItem(table as any, result.id, result, options);
      }
      return;
    }

    this.crud.updateItem(table as any, result.id, result, options);
  }

  private handleDelete(table: string, id?: string, parentTodoId?: string): void {
    if (table === "todos" && id) {
      this.crud.removeItem("todos", id);
    } else if (table === "tasks" || table === "subtasks") {
      // cascade handled elsewhere
    } else if (table === "chats" && id) {
      this.chat.deleteChatFromTodo(id, parentTodoId);
    } else {
      this.crud.removeItem(table as any, id!);
    }
  }

  private handleUpdateAll(table: string, result: any, parentTodoId?: string): void {
    if (table === "chats" && result && Array.isArray(result)) {
      const todoId = parentTodoId || (result[0] as any)?.todo_id;
      if (todoId) {
        this.chat.setChatsByTodo(result, todoId);
      }
    } else {
      (result as any[]).forEach((item) => {
        if (item && item.id) {
          this.crud.updateItem(table as any, item.id, item, { isPrivate: true });
        }
      });
    }
  }

  private mergePreservingFields<T extends Record<string, any>>(
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

  getTodosWithNestedTasks(): Todo[] {
    return this.state.getTodosWithNestedTasks();
  }

  getTasksWithNestedSubtasks(): Task[] {
    return this.state.getTasksWithNestedSubtasks();
  }

  getSubtasksWithNestedComments(): Subtask[] {
    return this.state.getSubtasksWithNestedComments();
  }

  updatePagination(
    type: "todos" | "tasks" | "subtasks" | "comments" | "chats",
    skip: number,
    limit: number,
    receivedCount: number
  ): void {
    let paginationSignal: WritableSignal<{ skip: number; limit: number; hasMore: boolean }>;
    switch (type) {
      case "todos":
        paginationSignal = this.state._todosPagination;
        break;
      case "tasks":
        paginationSignal = this.state._tasksPagination;
        break;
      case "subtasks":
        paginationSignal = this.state._subtasksPagination;
        break;
      case "comments":
        paginationSignal = this.state._commentsPagination;
        break;
      case "chats":
        paginationSignal = this.state._chatsPagination;
        break;
    }
    paginationSignal.set({
      skip: skip + receivedCount,
      limit,
      hasMore: receivedCount >= limit,
    });
  }

  resetPagination(type: "todos" | "tasks" | "subtasks" | "comments" | "chats"): void {
    const defaults = { skip: 0, limit: 20, hasMore: true };
    let paginationSignal: WritableSignal<{ skip: number; limit: number; hasMore: boolean }>;
    switch (type) {
      case "todos":
        paginationSignal = this.state._todosPagination;
        break;
      case "tasks":
        paginationSignal = this.state._tasksPagination;
        break;
      case "subtasks":
        paginationSignal = this.state._subtasksPagination;
        break;
      case "comments":
        paginationSignal = this.state._commentsPagination;
        break;
      case "chats":
        paginationSignal = this.state._chatsPagination;
        break;
    }
    paginationSignal.set(defaults);
  }

  setHasMoreTodos(hasMore: boolean): void {
    this.state._todosPagination.update((p) => ({ ...p, hasMore }));
  }

  setCollectionByTable(table: string, data: any[], options?: { append?: boolean }): void {
    const tableMapping: Record<string, any> = {
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
      this.setCollection(mappedType as any, data, options);
    }
  }

  getTodosByVisibility(visibility?: string): Todo[] {
    if (!visibility || visibility === "all") {
      return this.state.todos();
    }
    switch (visibility) {
      case "private":
        return this.state.privateTodos();
      case "shared":
        return this.state.sharedTodos();
      case "public":
        return this.state.publicTodos();
      default:
        return this.state.todos();
    }
  }

  readonly subtasksGroupedByTask: ReturnType<typeof computed<Map<string, Subtask[]>>> = computed(
    () => {
      return groupByKey(this.state.subtasks(), (subtask) => subtask.task_id);
    }
  );
}
