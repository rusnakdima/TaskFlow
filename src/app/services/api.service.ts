import { Injectable, inject, signal } from "@angular/core";
import { Observable, from } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

import { Response, ResponseStatus } from "@models/response.model";
import {
  Todo,
  Task,
  Subtask,
  Category,
  Chat,
  Comment,
  Profile,
  User,
} from "@models/generated/api.types";
import { MongoConnectionService } from "@services/core/mongo-connection.service";
import { StorageService } from "@services/storage.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import {
  Visibility,
  CrudOptions,
  PaginatedOptions,
  HasVisibility,
  ApiError,
  PaginationState,
} from "@models/api.model";

export { ApiError, Visibility, HasId } from "@models/api.model";

export interface CascadeResult {
  todo_count: number;
  task_count: number;
  subtask_count: number;
  comment_count: number;
  chat_count: number;
}

@Injectable({ providedIn: "root" })
export class ApiService {
  private mongoConnectionService = inject(MongoConnectionService);
  storageService = inject(StorageService);
  jwtTokenService = inject(JwtTokenService);

  readonly todos = new TodoApi(this);
  readonly tasks = new TaskApi(this);
  readonly subtasks = new SubtaskApi(this);
  readonly categories = new CategoryApi(this);
  readonly profiles = new ProfileApi(this);
  readonly comments = new CommentApi(this);
  readonly chats = new ChatApi(this);
  readonly admin = new AdminApi(this);
  readonly users = new UserApi(this);

  private paginationState = signal<Map<string, PaginationState>>(new Map());

  private getPaginationState(table: string): PaginationState {
    let state = this.paginationState().get(table);
    if (!state) {
      state = { skip: 0, limit: 10, hasMore: true };
      this.paginationState.update((m) => {
        const newMap = new Map(m);
        newMap.set(table, state!);
        return newMap;
      });
    }
    return state;
  }

  private updatePaginationState(table: string, newState: Partial<PaginationState>): void {
    const current = this.getPaginationState(table);
    this.paginationState.update((m) => {
      const newMap = new Map(m);
      newMap.set(table, { ...current, ...newState });
      return newMap;
    });
  }

  private resetPaginationState(table: string): void {
    this.paginationState.update((m) => {
      const newMap = new Map(m);
      newMap.set(table, { skip: 0, limit: 10, hasMore: true });
      return newMap;
    });
  }

  isOffline(): boolean {
    return !navigator.onLine;
  }

  isMongoConnected(): boolean {
    return this.mongoConnectionService.isConnected();
  }

  currentUserId(): string {
    return this.jwtTokenService.getCurrentUserId() || "";
  }

  filterByVisibility<T extends HasVisibility>(items: T[], visibility: Visibility): T[] {
    const userId = this.currentUserId();
    if (!userId) return [];

    return items.filter((item) => {
      switch (visibility) {
        case "all":
          return (
            item.user_id === userId ||
            (Array.isArray(item.assignees) && item.assignees.includes(userId)) ||
            item.visibility === "public"
          );
        case "private":
          return item.user_id === userId;
        case "shared":
          return (
            (Array.isArray(item.assignees) && item.assignees.includes(userId)) ||
            (item.visibility === "shared" && item.user_id === userId)
          );
        case "public":
          return item.visibility === "public";
        default:
          return item.visibility === visibility;
      }
    });
  }

  invokeCommand<T>(command: string, args?: Record<string, unknown>): Observable<T> {
    return from(invoke<T>(command, args) as Promise<T>);
  }

  async batchSoftDelete(table: string, ids: string[]): Promise<CascadeResult[]> {
    return invoke<CascadeResult[]>("batch_soft_delete_cascade", { table, ids });
  }

  async batchHardDelete(table: string, ids: string[]): Promise<CascadeResult[]> {
    return invoke<CascadeResult[]>("batch_hard_delete_cascade", { table, ids });
  }

  async batchRestore(table: string, ids: string[]): Promise<CascadeResult[]> {
    return invoke<CascadeResult[]>("batch_restore_cascade", { table, ids });
  }

  resetPagination(table: string): void {
    this.resetPaginationState(table);
  }

  hasMore(table: string): boolean {
    return this.getPaginationState(table).hasMore;
  }

  getTasksByMonth(year: number, month: number): Observable<{ tasks: unknown[] }> {
    const offline = !this.mongoConnectionService.isConnected();
    return from(
      invoke<Response<{ tasks: unknown[] }>>("get_tasks_by_month", { year, month, offline }).then(
        (response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data as { tasks: unknown[] };
          }
          throw new ApiError(response.message || "Failed to load tasks by month", "server");
        },
        (err) => {
          throw new ApiError(err?.message || String(err), "network");
        }
      )
    );
  }

  initializeUserData(userId: string): Observable<Response<unknown>> {
    return from(invoke<Response<unknown>>("initialize_user_data", { userId }));
  }

  get<T>(table: string, id: string, options: CrudOptions = { visibility: "all" }): Observable<T> {
    const token = this.jwtTokenService.getToken();
    return new Observable((subscriber) => {
      invoke<Response<T>>(this.getCommand(table, "get"), {
        id,
        visibility: options.visibility,
        token,
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as T);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  getAll<T>(
    table: string,
    options: PaginatedOptions & { todoId?: string; taskId?: string } = { visibility: "all" }
  ): Observable<T[]> {
    const token = this.jwtTokenService.getToken();
    const page = options.skip || 0;
    const limit = options.limit || 10;
    const filter = { ...options.filter };
    if (options.todoId) (filter as any).todo_id = options.todoId;
    if (options.taskId) (filter as any).task_id = options.taskId;
    return new Observable((subscriber) => {
      invoke<Response<T[]>>(this.getCommand(table, "getAll"), {
        page,
        limit,
        visibility: options.visibility,
        filter,
        token,
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const items = Array.isArray(response.data)
              ? response.data
              : (response.data as any)?.items || [];
            this.storageService.setCollection(table as any, items as any);
            subscriber.next(items as T[]);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get all", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  create<T>(
    table: string,
    data: Partial<T>,
    options: CrudOptions = { visibility: "all" }
  ): Observable<T> {
    const token = this.jwtTokenService.getToken();
    return new Observable((subscriber) => {
      invoke<Response<T>>(this.getCommand(table, "create"), {
        data,
        visibility: options.visibility,
        token,
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.storageService.modify(table as any, "create", response.data as any);
            subscriber.next(response.data as T);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to create", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  update<T>(
    table: string,
    id: string,
    data: Partial<T>,
    options: CrudOptions = { visibility: "all" }
  ): Observable<T> {
    const token = this.jwtTokenService.getToken();
    return new Observable((subscriber) => {
      invoke<Response<T>>(this.getCommand(table, "update"), {
        id,
        data,
        visibility: options.visibility,
        token,
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.storageService.modify(table as any, "update", response.data as any);
            subscriber.next(response.data as T);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to update", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  updateAll<T>(
    table: string,
    items: Partial<T>[],
    options?: { visibility?: string; offline?: boolean }
  ): Observable<T[]> {
    const token = this.jwtTokenService.getToken();
    return new Observable((subscriber) => {
      Promise.all(
        items.map((item) =>
          (item as any).id
            ? invoke<Response<T>>(this.getCommand(table, "update"), {
                id: (item as any).id,
                data: item,
                visibility: options?.visibility || "all",
                token,
              })
            : null
        )
      )
        .then((responses) => {
          const updatedItems = responses
            .filter((r) => r && r.status === ResponseStatus.SUCCESS)
            .map((r) => r!.data as T);
          updatedItems.forEach((item) => {
            if ((item as any).id) this.storageService.modify(table as any, "update", item as any);
          });
          subscriber.next(updatedItems);
          subscriber.complete();
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  delete(table: string, id: string, options?: CrudOptions): Observable<void> {
    const token = this.jwtTokenService.getToken();
    return new Observable((subscriber) => {
      invoke<Response<{ deleted: boolean }>>(this.getCommand(table, "delete"), {
        id,
        visibility: options?.visibility,
        token,
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.storageService.modify(table as any, "delete", { id } as any);
            subscriber.next();
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to delete", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  loadPage<T>(table: string, options: PaginatedOptions): Observable<T[]> {
    return this.getAll<T>(table, { ...options, skip: 0, limit: options.limit || 10 });
  }

  loadMore<T>(table: string): Observable<T[]> {
    const state = this.getPaginationState(table);
    if (!state.hasMore) {
      return new Observable((observer) => {
        observer.next([] as unknown as T[]);
        observer.complete();
      });
    }
    return this.getAll<T>(table, {
      visibility: state.visibility as Visibility,
      filter: state.filter,
      skip: state.skip,
      limit: state.limit,
    });
  }

  paginate<T>(
    table: string,
    options: PaginatedOptions,
    reset = false
  ): Observable<{ items: T[]; hasMore: boolean }> {
    const state = this.getPaginationState(table);
    const limit = options.limit || state.limit;
    const skip = reset ? 0 : state.skip;
    return new Observable((subscriber) => {
      this.getAll<T>(table, { ...options, skip, limit }).subscribe({
        next: (items) => {
          this.updatePaginationState(table, {
            skip: skip + items.length,
            hasMore: items.length >= limit,
          });
          subscriber.next({ items, hasMore: items.length >= limit });
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  getPublicProfiles(): Observable<Profile[]> {
    return this.profiles.getAll({ visibility: "public" });
  }

  private getCommand(table: string, operation: string): string {
    const commands: Record<string, Record<string, string>> = {
      todos: {
        get: "get_todo",
        getAll: "get_todos",
        create: "create_todo",
        update: "update_todo",
        delete: "delete_todo",
      },
      tasks: {
        get: "get_task",
        getAll: "get_tasks",
        create: "create_task",
        update: "update_task",
        delete: "delete_task",
      },
      subtasks: {
        get: "get_subtask",
        getAll: "get_subtasks",
        create: "create_subtask",
        update: "update_subtask",
        delete: "delete_subtask",
      },
      categories: {
        get: "get_category",
        getAll: "get_categories",
        create: "create_category",
        update: "update_category",
        delete: "delete_category",
      },
      chats: {
        get: "get_chat",
        getAll: "get_chats",
        create: "create_chat",
        update: "update_chat",
        delete: "delete_chat",
      },
      comments: {
        get: "get_comment",
        getAll: "get_comments",
        create: "create_comment",
        update: "update_comment",
        delete: "delete_comment",
      },
      profiles: {
        get: "get_profile",
        getAll: "get_profiles",
        create: "create_profile",
        update: "update_profile",
        delete: "delete_profile",
      },
    };
    return commands[table]?.[operation] || table;
  }
}

class TodoApi {
  constructor(private api: ApiService) {}

  get(id: string, visibility?: string): Observable<Todo> {
    return new Observable((subscriber) => {
      invoke<Response<Todo>>("get_todo", {
        id,
        visibility,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as Todo);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get todo", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  getAll(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    todoId?: string;
    taskId?: string;
  }): Observable<Todo[]> {
    const { page = 0, limit = 10, visibility = "all", filter, todoId, taskId } = options || {};
    const actualFilter = { ...((filter as object) || {}) };
    if (todoId) (actualFilter as any).todo_id = todoId;
    if (taskId) (actualFilter as any).task_id = taskId;
    return new Observable((subscriber) => {
      invoke<Response<{ items: Todo[] }>>("get_todos", {
        page,
        limit,
        visibility,
        filter: actualFilter,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const items = Array.isArray(response.data)
              ? response.data
              : (response.data as any)?.items || [];
            this.api.storageService.setCollection("todos", items);
            subscriber.next(items as Todo[]);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get todos", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  create(data: Partial<Todo>): Observable<Todo> {
    return new Observable((subscriber) => {
      invoke<Response<Todo>>("create_todo", { data, token: this.api.jwtTokenService.getToken() })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("todos", "create", response.data);
            subscriber.next(response.data as Todo);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to create todo", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  update(id: string, data: Partial<Todo>, visibility?: string): Observable<Todo> {
    return new Observable((subscriber) => {
      invoke<Response<Todo>>("update_todo", {
        id,
        data,
        visibility,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("todos", "update", response.data);
            subscriber.next(response.data as Todo);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to update todo", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  delete(id: string): Observable<void> {
    return new Observable((subscriber) => {
      invoke<Response<{ deleted: boolean }>>("delete_todo", {
        id,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("todos", "delete", { id });
            subscriber.next();
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to delete todo", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }
}

class TaskApi {
  constructor(private api: ApiService) {}

  get(id: string, visibility?: string): Observable<Task> {
    return new Observable((subscriber) => {
      invoke<Response<Task>>("get_task", {
        id,
        visibility,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as Task);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get task", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  getAll(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    todoId?: string;
    taskId?: string;
  }): Observable<Task[]> {
    const { page = 0, limit = 10, visibility = "all", filter, todoId, taskId } = options || {};
    const actualFilter = { ...((filter as object) || {}) };
    if (todoId) (actualFilter as any).todo_id = todoId;
    if (taskId) (actualFilter as any).task_id = taskId;
    return new Observable((subscriber) => {
      invoke<Response<{ items: Task[] }>>("get_tasks", {
        page,
        limit,
        visibility,
        filter: actualFilter,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const items = Array.isArray(response.data)
              ? response.data
              : (response.data as any)?.items || [];
            this.api.storageService.setCollection("tasks", items);
            subscriber.next(items);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get tasks", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  create(data: Partial<Task>, visibility?: string): Observable<Task> {
    return new Observable((subscriber) => {
      invoke<Response<Task>>("create_task", {
        data,
        visibility,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("tasks", "create", response.data);
            subscriber.next(response.data as Task);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to create task", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  update(id: string, data: Partial<Task>, visibility?: string): Observable<Task> {
    return new Observable((subscriber) => {
      invoke<Response<Task>>("update_task", {
        id,
        data,
        visibility,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("tasks", "update", response.data);
            subscriber.next(response.data as Task);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to update task", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  delete(id: string, options?: { visibility?: string }): Observable<void> {
    return new Observable((subscriber) => {
      invoke<Response<{ deleted: boolean }>>("delete_task", {
        id,
        visibility: options?.visibility,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("tasks", "delete", { id });
            subscriber.next();
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to delete task", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }
}

class SubtaskApi {
  constructor(private api: ApiService) {}

  get(id: string, visibility?: string): Observable<Subtask> {
    return new Observable((subscriber) => {
      invoke<Response<Subtask>>("get_subtask", {
        id,
        visibility,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as Subtask);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get subtask", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  getAll(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    todoId?: string;
    taskId?: string;
  }): Observable<Subtask[]> {
    const { page = 0, limit = 10, visibility = "all", filter, todoId, taskId } = options || {};
    const actualFilter = { ...((filter as object) || {}) };
    if (todoId) (actualFilter as any).todo_id = todoId;
    if (taskId) (actualFilter as any).task_id = taskId;
    return new Observable((subscriber) => {
      invoke<Response<{ items: Subtask[] }>>("get_subtasks", {
        page,
        limit,
        visibility,
        filter: actualFilter,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const items = Array.isArray(response.data)
              ? response.data
              : (response.data as any)?.items || [];
            this.api.storageService.setCollection("subtasks", items);
            subscriber.next(items);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get subtasks", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  create(data: Partial<Subtask>, visibility?: string): Observable<Subtask> {
    return new Observable((subscriber) => {
      invoke<Response<Subtask>>("create_subtask", {
        data,
        visibility,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("subtasks", "create", response.data);
            subscriber.next(response.data as Subtask);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to create subtask", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  update(id: string, data: Partial<Subtask>, visibility?: string): Observable<Subtask> {
    return new Observable((subscriber) => {
      invoke<Response<Subtask>>("update_subtask", {
        id,
        data,
        visibility,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("subtasks", "update", response.data);
            subscriber.next(response.data as Subtask);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to update subtask", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  delete(id: string): Observable<void> {
    return new Observable((subscriber) => {
      invoke<Response<{ deleted: boolean }>>("delete_subtask", {
        id,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("subtasks", "delete", { id });
            subscriber.next();
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to delete subtask", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }
}

class CategoryApi {
  constructor(private api: ApiService) {}

  get(id: string): Observable<Category> {
    return new Observable((subscriber) => {
      invoke<Response<Category>>("get_category", { id, token: this.api.jwtTokenService.getToken() })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as Category);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get category", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  getAll(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
  }): Observable<Category[]> {
    const { page = 0, limit = 10, visibility = "all", filter } = options || {};
    return new Observable((subscriber) => {
      invoke<Response<Category[]>>("get_categories", {
        page,
        limit,
        visibility,
        filter,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const items = Array.isArray(response.data) ? response.data : [];
            this.api.storageService.setCollection("categories", items);
            subscriber.next(items);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to get categories", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  create(data: Partial<Category>): Observable<Category> {
    return new Observable((subscriber) => {
      invoke<Response<Category>>("create_category", {
        data,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("categories", "create", response.data);
            subscriber.next(response.data as Category);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to create category", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  update(id: string, data: Partial<Category>): Observable<Category> {
    return new Observable((subscriber) => {
      invoke<Response<Category>>("update_category", {
        id,
        data,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("categories", "update", response.data);
            subscriber.next(response.data as Category);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to update category", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  delete(id: string): Observable<void> {
    return new Observable((subscriber) => {
      invoke<Response<{ deleted: boolean }>>("delete_category", {
        id,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("categories", "delete", { id });
            subscriber.next();
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to delete category", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }
}

class ChatApi {
  constructor(private api: ApiService) {}

  get(id: string): Observable<Chat> {
    return new Observable((subscriber) => {
      invoke<Response<Chat>>("get_chat", { id, token: this.api.jwtTokenService.getToken() })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as Chat);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get chat", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  getAll(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
  }): Observable<Chat[]> {
    const { page = 0, limit = 10, visibility = "all", filter } = options || {};
    return new Observable((subscriber) => {
      invoke<Response<Chat[]>>("get_chats", {
        page,
        limit,
        visibility,
        filter,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const items = Array.isArray(response.data) ? response.data : [];
            this.api.storageService.setCollection("chats", items);
            subscriber.next(items);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get chats", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  create(data: Partial<Chat>): Observable<Chat> {
    return new Observable((subscriber) => {
      invoke<Response<Chat>>("create_chat", { data, token: this.api.jwtTokenService.getToken() })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("chats", "create", response.data);
            subscriber.next(response.data as Chat);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to create chat", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  update(id: string, data: Partial<Chat>): Observable<Chat> {
    return new Observable((subscriber) => {
      invoke<Response<Chat>>("update_chat", {
        id,
        data,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("chats", "update", response.data);
            subscriber.next(response.data as Chat);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to update chat", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  delete(id: string): Observable<void> {
    return new Observable((subscriber) => {
      invoke<Response<{ deleted: boolean }>>("delete_chat", {
        id,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("chats", "delete", { id });
            subscriber.next();
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to delete chat", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }
}

class CommentApi {
  constructor(private api: ApiService) {}

  get(id: string): Observable<Comment> {
    return new Observable((subscriber) => {
      invoke<Response<Comment>>("get_comment", { id, token: this.api.jwtTokenService.getToken() })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as Comment);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get comment", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  getAll(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
  }): Observable<Comment[]> {
    const { page = 0, limit = 10, visibility = "all", filter } = options || {};
    return new Observable((subscriber) => {
      invoke<Response<Comment[]>>("get_comments", {
        page,
        limit,
        visibility,
        filter,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const items = Array.isArray(response.data) ? response.data : [];
            this.api.storageService.setCollection("comments", items);
            subscriber.next(items);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get comments", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  create(data: Partial<Comment>): Observable<Comment> {
    return new Observable((subscriber) => {
      invoke<Response<Comment>>("create_comment", {
        data,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("comments", "create", response.data);
            subscriber.next(response.data as Comment);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to create comment", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  update(id: string, data: Partial<Comment>): Observable<Comment> {
    return new Observable((subscriber) => {
      invoke<Response<Comment>>("update_comment", {
        id,
        data,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("comments", "update", response.data);
            subscriber.next(response.data as Comment);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to update comment", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  delete(id: string): Observable<void> {
    return new Observable((subscriber) => {
      invoke<Response<{ deleted: boolean }>>("delete_comment", {
        id,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            this.api.storageService.modify("comments", "delete", { id });
            subscriber.next();
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to delete comment", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }
}

class UserApi {
  constructor(private api: ApiService) {}

  getAll(options?: { visibility?: string; page?: number; limit?: number }): Observable<User[]> {
    const { visibility = "private", page = 0, limit = 10 } = options || {};
    return new Observable((subscriber) => {
      invoke<Response<{ items: User[] }>>("get_users", {
        visibility,
        page,
        limit,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next((response.data as any)?.items || []);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get users", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }
}

class ProfileApi {
  constructor(private api: ApiService) {}

  getAll(options?: { visibility?: string; filter?: unknown }): Observable<Profile[]> {
    const { visibility = "all", filter } = options || {};
    return new Observable((subscriber) => {
      invoke<Response<Profile[]>>("get_profiles", {
        visibility,
        filter,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next((response.data as any)?.items || []);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || "Failed to get profiles", "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  create(data: Partial<Profile>): Observable<Profile> {
    return new Observable((subscriber) => {
      invoke<Response<Profile>>("create_profile", {
        data,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as Profile);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to create profile", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  update(id: string, data: Partial<Profile>): Observable<Profile> {
    return new Observable((subscriber) => {
      invoke<Response<Profile>>("update_profile", {
        id,
        data,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as Profile);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to update profile", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  delete(id: string): Observable<void> {
    return new Observable((subscriber) => {
      invoke<Response<{ deleted: boolean }>>("delete_profile", {
        id,
        token: this.api.jwtTokenService.getToken(),
      })
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next();
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || "Failed to delete profile", "server")
            );
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }
}

class AdminApi {
  constructor(private api: ApiService) {}

  getAllArchiveData(): Observable<unknown> {
    return this.api.invokeCommand("get_all_archive_data", {
      token: this.api.jwtTokenService.getToken(),
    });
  }

  getAllAdminData(): Observable<unknown> {
    return this.api.invokeCommand("get_all_admin_data", {});
  }

  adminGetAll(): Observable<unknown> {
    return this.api.invokeCommand("admin_get_all", {});
  }

  adminGetPaginated(dataType: string, skip: number, limit: number): Observable<unknown> {
    return this.api.invokeCommand("admin_get_paginated", { dataType, skip, limit });
  }

  adminToggleDelete(table: string, id: string): Observable<void> {
    return this.api.invokeCommand("admin_toggle_delete", { table, id });
  }

  adminPermanentlyDelete(table: string, id: string): Observable<void> {
    return this.api.invokeCommand("admin_permanently_delete", { table, id });
  }

  adminToggleDeleteLocal(table: string, id: string): Observable<void> {
    return this.api.invokeCommand("admin_toggle_delete_local", { table, id });
  }

  adminPermanentlyDeleteLocal(table: string, id: string): Observable<void> {
    return this.api.invokeCommand("admin_permanently_delete_local", { table, id });
  }

  adminGetAllArchive(): Observable<unknown> {
    return this.api.invokeCommand("admin_get_all_archive", {});
  }

  adminGetArchivePaginated(dataType: string, skip: number, limit: number): Observable<unknown> {
    return this.api.invokeCommand("admin_get_archive_paginated", { dataType, skip, limit });
  }

  batchSoftDelete(table: string, ids: string[]): Observable<CascadeResult> {
    return this.api.batchSoftDelete(table, ids) as unknown as Observable<CascadeResult>;
  }

  batchHardDelete(table: string, ids: string[]): Observable<CascadeResult> {
    return this.api.batchHardDelete(table, ids) as unknown as Observable<CascadeResult>;
  }

  batchRestore(table: string, ids: string[]): Observable<CascadeResult> {
    return this.api.batchRestore(table, ids) as unknown as Observable<CascadeResult>;
  }
}

export { ApiService as REQUEST_SERVICE };
