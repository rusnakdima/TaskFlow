import { Injectable, inject, signal } from "@angular/core";
import { Observable } from "rxjs";
import { tap, map } from "rxjs/operators";

import { RequestService } from "@services/core/request.service";
import { UnifiedStorageService } from "@app/store/unified-storage.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";

export interface Options {
  filter?: any;
  skip?: number;
  limit?: number;
  load?: string[];
  visibility?: string;
}

export interface PaginatedOptions extends Options {
  limit?: number;
  skip?: number;
}

interface PaginationState {
  skip: number;
  limit: number;
  hasMore: boolean;
}

@Injectable({ providedIn: "root" })
export class DataService {
  private request = inject(RequestService);
  private storage = inject(UnifiedStorageService);
  private jwt = inject(JwtTokenService);

  private readonly _paginationState = signal<Map<string, PaginationState>>(new Map());

  private getPaginationState(table: string): PaginationState {
    let state = this._paginationState().get(table);
    if (!state) {
      state = { skip: 0, limit: 20, hasMore: true };
      this._paginationState.update((m) => {
        const newMap = new Map(m);
        newMap.set(table, state!);
        return newMap;
      });
    }
    return state;
  }

  private updatePaginationState(table: string, newState: Partial<PaginationState>): void {
    const current = this.getPaginationState(table);
    this._paginationState.update((m) => {
      const newMap = new Map(m);
      newMap.set(table, { ...current, ...newState });
      return newMap;
    });
  }

  isOffline(): boolean {
    return this.request.isOffline();
  }

  get<T>(table: string, id: string, options?: Options): Observable<T> {
    return this.request.crud<T>("get", table, { id, ...options }).pipe(
      tap((data) => {
        if (data && (data as any).id) {
          this.storage.addItem(table as any, data);
        }
      })
    );
  }

  getAll<T>(table: string, options?: PaginatedOptions): Observable<T[]> {
    return this.request.crud<T[]>("getAll", table, options || {}).pipe(
      tap((data) => {
        if (Array.isArray(data)) {
          this.storage.setCollection(table as any, data as any);
          this.updatePaginationState(table, {
            skip: (options?.skip || 0) + data.length,
            hasMore: data.length >= (options?.limit || 20),
          });
        }
      })
    );
  }

  create<T>(table: string, data: Partial<T>, visibility?: string): Observable<T> {
    return this.request.crud<T>("create", table, { data, visibility }).pipe(
      tap((created) => {
        if (created && (created as any).id) {
          this.storage.addItem(table as any, created);
        }
      })
    );
  }

  update<T>(table: string, id: string, data: Partial<T>, visibility?: string): Observable<T> {
    return this.request.crud<T>("update", table, { id, data, visibility }).pipe(
      tap((updated) => {
        if (updated && (updated as any).id) {
          this.storage.updateItem(table as any, (updated as any).id, updated);
        }
      })
    );
  }

  delete<T>(table: string, id: string, visibility?: string): Observable<void> {
    return this.request.crud<void>("delete", table, { id, visibility }).pipe(
      tap(() => {
        this.storage.removeItem(table as any, id);
      })
    );
  }

  loadPage<T>(table: string, options: PaginatedOptions): Observable<T[]> {
    const state = this.getPaginationState(table);
    const pageOptions = { ...options, skip: 0, limit: options.limit || state.limit };

    return this.request.crud<T[]>("getAll", table, pageOptions).pipe(
      tap((data) => {
        if (Array.isArray(data)) {
          this.storage.setCollection(table as any, data as any);
          this.updatePaginationState(table, {
            skip: data.length,
            hasMore: data.length >= (pageOptions.limit || state.limit),
          });
        }
      })
    );
  }

  loadMore<T>(table: string): Observable<T[]> {
    const state = this.getPaginationState(table);
    if (!state.hasMore) {
      return new Observable((observer) => {
        observer.next([]);
        observer.complete();
      });
    }

    return this.request.crud<T[]>("getAll", table, { skip: state.skip, limit: state.limit }).pipe(
      tap((data) => {
        if (Array.isArray(data) && data.length > 0) {
          this.storage.setCollection(table as any, data as any, { append: true });
          this.updatePaginationState(table, {
            skip: state.skip + data.length,
            hasMore: data.length >= state.limit,
          });
        } else if (Array.isArray(data) && data.length === 0) {
          this.updatePaginationState(table, { hasMore: false });
        }
      })
    );
  }

  filterByVisibility<T>(items: T[], visibility: string): T[] {
    const userId = this.jwt.getCurrentUserId() || "";
    if (!userId) return [];

    return items.filter((item: any) => {
      switch (visibility) {
        case "all":
          return (
            item.user_id === userId ||
            item.assignees?.includes(userId) ||
            item.visibility === "public"
          );
        case "private":
          return item.user_id === userId;
        case "shared":
          return (
            item.assignees?.includes(userId) ||
            (item.visibility === "shared" && item.user_id === userId)
          );
        case "public":
          return item.visibility === "public";
        default:
          return item.visibility === visibility;
      }
    });
  }

  getEntitiesByType<T>(entityName: string, options: any): Observable<T[]> {
    return this.request.crud<T[]>("getAll", entityName, options);
  }

  getTasksByMonth(year: number, month: number): Observable<{ tasks: any[] }> {
    return this.request.getTasksByMonth(year, month);
  }

  initializeUserData(userId: string): Observable<any> {
    return this.request.initializeUserData(userId);
  }

  getUser(id: string): Observable<any> {
    return this.request.crud<any>("get", "users", { id });
  }

  getProfile(): Observable<any> {
    const userId = this.jwt.getCurrentUserId();
    return this.request.crud<any>("get", "profiles", { filter: { user_id: userId } });
  }

  getPublicProfiles(): Observable<any[]> {
    return this.request.crud<any[]>("getAll", "profiles", { visibility: "public" });
  }

  updateProfile(id: string, data: Partial<any>, visibility?: string): Observable<any> {
    return this.update<any>("profiles", id, data, visibility);
  }

  createProfile(data: Partial<any>, visibility?: string): Observable<any> {
    return this.create<any>("profiles", data, visibility);
  }

  setChatsForTodo(chats: any[], todoId: string): void {
    this.storage.setChatsByTodo(chats, todoId);
  }

  getTasksByTodoId(todoId: string): any[] {
    return this.storage.getTasksByTodoId(todoId);
  }

  getSubtasksByTaskId(taskId: string): any[] {
    return this.storage.getSubtasksByTaskId(taskId);
  }

  getCommentsByTaskId(taskId: string): any[] {
    return this.storage.getCommentsByTaskId(taskId);
  }

  getCommentsBySubtaskId(subtaskId: string): any[] {
    return this.storage.getCommentsBySubtaskId(subtaskId);
  }

  getTodo(id: string, options?: Options): Observable<Todo> {
    return this.get<Todo>("todos", id, options);
  }

  getTodos(options?: Options): Observable<Todo[]> {
    return this.getAll<Todo>("todos", options);
  }

  createTodo(data: Partial<Todo>, visibility?: string): Observable<Todo> {
    return this.create<Todo>("todos", data, visibility);
  }

  updateTodo(id: string, data: Partial<Todo>, visibility?: string): Observable<Todo> {
    return this.update<Todo>("todos", id, data, visibility);
  }

  deleteTodo(id: string, visibility?: string): Observable<void> {
    return this.delete("todos", id, visibility);
  }

  getTask(id: string, options?: Options): Observable<Task> {
    return this.get<Task>("tasks", id, options);
  }

  getTasks(todoId: string, options?: Options): Observable<Task[]> {
    return this.getAll<Task>("tasks", {
      ...options,
      filter: { ...options?.filter, todo_id: todoId },
    });
  }

  createTask(data: Partial<Task>, visibility?: string): Observable<Task> {
    return this.create<Task>("tasks", data, visibility);
  }

  updateTask(id: string, data: Partial<Task>, visibility?: string): Observable<Task> {
    return this.update<Task>("tasks", id, data, visibility);
  }

  deleteTask(id: string, visibility?: string): Observable<void> {
    return this.delete("tasks", id, visibility);
  }

  getSubtask(id: string, options?: Options): Observable<Subtask> {
    return this.get<Subtask>("subtasks", id, options);
  }

  createSubtask(data: Partial<Subtask>, visibility?: string): Observable<Subtask> {
    return this.create<Subtask>("subtasks", data, visibility);
  }

  updateSubtask(id: string, data: Partial<Subtask>, visibility?: string): Observable<Subtask> {
    return this.update<Subtask>("subtasks", id, data, visibility);
  }

  deleteSubtask(id: string, visibility?: string): Observable<void> {
    return this.delete("subtasks", id, visibility);
  }

  getSubtasks(taskId?: string, options?: Options): Observable<Subtask[]> {
    return this.getAll<Subtask>("subtasks", {
      ...options,
      filter: { ...options?.filter, task_id: taskId },
    });
  }

  getCategories(options?: Options): Observable<any[]> {
    return this.getAll("categories", options);
  }

  getComments(taskId: string, options?: Options): Observable<any[]> {
    return this.getAll("comments", { ...options, filter: { ...options?.filter, task_id: taskId } });
  }

  getChats(todoId: string, options?: Options): Observable<any[]> {
    return this.getAll("chats", { ...options, filter: { ...options?.filter, todo_id: todoId } });
  }

  updateAll<T>(table: string, items: Partial<T>[]): Observable<T[]> {
    return this.request.crud<T[]>("updateAll", table, { items });
  }
}
