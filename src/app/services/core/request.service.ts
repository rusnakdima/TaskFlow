import { Injectable, inject } from "@angular/core";
import { Observable, from } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

import { Response, ResponseStatus } from "@models/response.model";

import { JwtTokenService } from "@services/auth/jwt-token.service";

@Injectable({ providedIn: "root" })
export class RequestService {
  private jwtTokenService = inject(JwtTokenService);

  private pendingRequests = new Map<string, { controller: AbortController; timestamp: number }>();

  private getRequestKey(operation: string, table: string, id?: string, filter?: any): string {
    return `${operation}:${table}:${id || ""}:${JSON.stringify(filter || {})}`;
  }

  private getRequestDeduplicationKey(
    operation: string,
    table: string,
    id?: string,
    filter?: any
  ): string {
    const key = this.getRequestKey(operation, table, id, filter);
    const now = Date.now();
    const existing = this.pendingRequests.get(key);

    if (existing && now - existing.timestamp < 500) {
      existing.controller.abort();
    }

    const controller = new AbortController();
    this.pendingRequests.set(key, { controller, timestamp: now });

    return key;
  }

  private removeRequest(key: string): void {
    this.pendingRequests.delete(key);
  }

  private invoke<T>(command: string, args: Record<string, any>): Observable<T> {
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

  isOffline(): boolean {
    return !navigator.onLine;
  }

  private getCurrentUserId(): string {
    return this.jwtTokenService.getCurrentUserId() || "";
  }

  filterTodosByVisibility(todos: any[], visibility: string): any[] {
    const userId = this.getCurrentUserId();
    if (!userId) return [];

    switch (visibility) {
      case "all":
        return todos.filter(
          (t: any) =>
            t.user_id === userId || t.assignees?.includes(userId) || t.visibility === "public"
        );
      case "private":
        return todos.filter((t: any) => t.user_id === userId);
      case "shared":
        return todos.filter(
          (t: any) =>
            t.assignees?.includes(userId) || (t.visibility === "shared" && t.user_id === userId)
        );
      case "public":
        return todos.filter((t: any) => t.visibility === "public");
      default:
        return todos.filter((t: any) => t.visibility === visibility);
    }
  }

  getTodos(options?: {
    filter?: any;
    skip?: number;
    limit?: number;
    load?: string[];
    visibility?: string;
  }): Observable<any[]> {
    const { filter, skip, limit, load, visibility } = options || {};
    const key = this.getRequestDeduplicationKey("getAll", "todos", undefined, filter);
    return new Observable<any[]>((subscriber) => {
      this.invoke<any[]>("manage_data", {
        operation: "getAll",
        table: "todos",
        filter,
        skip,
        limit,
        load: load ? JSON.stringify(load) : undefined,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data || []);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getTodo(id: string): Observable<any> {
    const key = this.getRequestDeduplicationKey("get", "todos", id);
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", { operation: "get", table: "todos", id }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  createTodo(data: any, visibility?: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "create",
        table: "todos",
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  updateTodo(id: string, data: any, visibility?: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "update",
        table: "todos",
        id,
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  deleteTodo(id: string, visibility?: string): Observable<void> {
    return new Observable<void>((subscriber) => {
      this.invoke<void>("manage_data", {
        operation: "delete",
        table: "todos",
        id,
        visibility,
      }).subscribe({
        next: () => {
          subscriber.next();
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  getTasks(todoId?: string, filter?: any, skip?: number, limit?: number): Observable<any[]> {
    const key = this.getRequestDeduplicationKey("getAll", "tasks", todoId, filter);
    const options: any = { filter, skip, limit };
    if (todoId) options.parentTodoId = todoId;
    return new Observable<any[]>((subscriber) => {
      this.invoke<any[]>("manage_data", {
        operation: "getAll",
        table: "tasks",
        ...options,
      }).subscribe({
        next: (data) => {
          subscriber.next(data || []);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getTask(id: string): Observable<any> {
    const key = this.getRequestDeduplicationKey("get", "tasks", id);
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", { operation: "get", table: "tasks", id }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  createTask(data: any, visibility?: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "create",
        table: "tasks",
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  updateTask(id: string, data: any, visibility?: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "update",
        table: "tasks",
        id,
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  deleteTask(id: string, visibility?: string): Observable<void> {
    return new Observable<void>((subscriber) => {
      this.invoke<void>("manage_data", {
        operation: "delete",
        table: "tasks",
        id,
        visibility,
      }).subscribe({
        next: () => {
          subscriber.next();
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  getSubtasks(taskId?: string, skip?: number, limit?: number): Observable<any[]> {
    const key = this.getRequestDeduplicationKey("getAll", "subtasks", taskId);
    return new Observable<any[]>((subscriber) => {
      this.invoke<any[]>("manage_data", {
        operation: "getAll",
        table: "subtasks",
        parentTodoId: taskId,
        skip,
        limit,
      }).subscribe({
        next: (data) => {
          subscriber.next(data || []);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getSubtask(id: string): Observable<any> {
    const key = this.getRequestDeduplicationKey("get", "subtasks", id);
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", { operation: "get", table: "subtasks", id }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  createSubtask(data: any, visibility?: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "create",
        table: "subtasks",
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  updateSubtask(id: string, data: any, visibility?: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "update",
        table: "subtasks",
        id,
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  deleteSubtask(id: string, visibility?: string): Observable<void> {
    return new Observable<void>((subscriber) => {
      this.invoke<void>("manage_data", {
        operation: "delete",
        table: "subtasks",
        id,
        visibility,
      }).subscribe({
        next: () => {
          subscriber.next();
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  getCategories(): Observable<any[]> {
    const key = this.getRequestDeduplicationKey("getAll", "categories");
    return new Observable<any[]>((subscriber) => {
      this.invoke<any[]>("manage_data", {
        operation: "getAll",
        table: "categories",
        visibility: "private",
      }).subscribe({
        next: (data) => {
          subscriber.next(data || []);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getComments(
    taskId?: string,
    subtaskId?: string,
    skip?: number,
    limit?: number
  ): Observable<any[]> {
    const filter: any = {};
    if (taskId) filter["task_id"] = taskId;
    if (subtaskId) filter["subtask_id"] = subtaskId;
    const key = this.getRequestDeduplicationKey("getAll", "comments", undefined, filter);
    return new Observable<any[]>((subscriber) => {
      this.invoke<any[]>("manage_data", {
        operation: "getAll",
        table: "comments",
        filter,
        skip,
        limit,
      }).subscribe({
        next: (data) => {
          subscriber.next(data || []);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getChats(todoId: string, skip?: number, limit?: number): Observable<any[]> {
    const filter = { todo_id: todoId };
    const key = this.getRequestDeduplicationKey("getAll", "chats", undefined, filter);
    return new Observable<any[]>((subscriber) => {
      this.invoke<any[]>("manage_data", {
        operation: "getAll",
        table: "chats",
        filter,
        skip,
        limit,
      }).subscribe({
        next: (data) => {
          subscriber.next(data || []);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getUser(id: string): Observable<any> {
    const key = this.getRequestDeduplicationKey("get", "users", id);
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "get",
        table: "users",
        id,
        visibility: "private",
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getProfile(): Observable<any> {
    const userId = this.jwtTokenService.getCurrentUserId();
    if (!userId) {
      return new Observable<any>((subscriber) => {
        subscriber.error(new Error("No user logged in"));
      });
    }
    const key = this.getRequestDeduplicationKey("get", "profiles", userId);
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "get",
        table: "profiles",
        filter: { user_id: userId },
        load: JSON.stringify(["user"]),
        visibility: "private",
      }).subscribe({
        next: (data) => {
          const profile = Array.isArray(data) ? data[0] : data;
          subscriber.next(profile);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getPublicProfiles(): Observable<any[]> {
    const key = this.getRequestDeduplicationKey("getAll", "profiles");
    return new Observable<any[]>((subscriber) => {
      this.invoke<any[]>("manage_data", {
        operation: "getAll",
        table: "profiles",
        visibility: "public",
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getEntitiesByType<T>(entityName: string, options: any): Observable<T[]> {
    const { filter, skip, limit, load, visibility, ...rest } = options;
    const key = this.getRequestDeduplicationKey("getAll", entityName, undefined, filter);
    return new Observable<T[]>((subscriber) => {
      this.invoke<T[]>("manage_data", {
        operation: "getAll",
        table: entityName,
        filter,
        skip,
        limit,
        load: load ? JSON.stringify(load) : undefined,
        visibility,
        ...rest,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  updateComment(id: string, data: any, visibility?: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "update",
        table: "comments",
        id,
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  updateProfile(id: string, data: any, visibility?: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "update",
        table: "profiles",
        id,
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  createProfile(data: any, visibility?: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "create",
        table: "profiles",
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  getTasksByMonth(year: number, month: number): Observable<{ tasks: any[] }> {
    return from(
      invoke<Response<{ tasks: any[] }>>("get_tasks_by_month", { year, month }).then(
        (response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data as { tasks: any[] };
          }
          throw new Error(response.message || "Failed to load tasks by month");
        },
        (err) => {
          throw new Error(err?.message || String(err));
        }
      )
    );
  }

  initializeUserData(userId: string): Observable<Response<any>> {
    return from(invoke<Response<any>>("initialize_user_data", { userId }));
  }
}
