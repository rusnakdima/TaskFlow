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

export interface EntityRoutes {
  get: string;
  getAll: string;
  create?: string;
  update?: string;
  delete?: string;
}

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

  readonly todos = new EntityApi<Todo>(this, {
    get: "get_todo",
    getAll: "get_todos",
    create: "create_todo",
    update: "update_todo",
    delete: "delete_todo",
  });
  readonly tasks = new EntityApi<Task>(this, {
    get: "get_task",
    getAll: "get_tasks",
    create: "create_task",
    update: "update_task",
    delete: "delete_task",
  });
  readonly subtasks = new EntityApi<Subtask>(this, {
    get: "get_subtask",
    getAll: "get_subtasks",
    create: "create_subtask",
    update: "update_subtask",
    delete: "delete_subtask",
  });
  readonly categories = new EntityApi<Category>(this, {
    get: "get_category",
    getAll: "get_categories",
    create: "create_category",
    update: "update_category",
    delete: "delete_category",
  });
  readonly profiles = new EntityApi<Profile>(this, {
    get: "get_profile",
    getAll: "get_profiles",
    create: "create_profile",
    update: "update_profile",
    delete: "delete_profile",
  });
  readonly comments = new EntityApi<Comment>(this, {
    get: "get_comment",
    getAll: "get_comments",
    create: "create_comment",
    update: "update_comment",
    delete: "delete_comment",
  });
  readonly chats = new EntityApi<Chat>(this, {
    get: "get_chat",
    getAll: "get_chats",
    create: "create_chat",
    update: "update_chat",
    delete: "delete_chat",
  });
  readonly admin = new AdminApi(this);
  readonly users = new EntityApi<User>(this, { get: "get_user", getAll: "get_users" });

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

  loadPage<T>(table: string, options: PaginatedOptions): Observable<T[]> {
    const command = this.getCommand(table, "getAll");
    if (!command)
      return new Observable((s) => {
        s.error(new ApiError(`Unknown table: ${table}`, "server"));
      });
    return this.crudList<T>(command, { page: 0, limit: options.limit || 10, ...options });
  }

  loadMore<T>(table: string): Observable<T[]> {
    const state = this.getPaginationState(table);
    if (!state.hasMore) {
      return new Observable((observer) => {
        observer.next([] as unknown as T[]);
        observer.complete();
      });
    }
    const command = this.getCommand(table, "getAll");
    if (!command)
      return new Observable((s) => {
        s.error(new ApiError(`Unknown table: ${table}`, "server"));
      });
    return this.crudList<T>(command, {
      visibility: state.visibility as Visibility,
      filter: state.filter,
      page: state.skip,
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
    const page = reset ? 0 : state.skip;
    const command = this.getCommand(table, "getAll");
    if (!command)
      return new Observable((s) => {
        s.error(new ApiError(`Unknown table: ${table}`, "server"));
      });
    return new Observable((subscriber) => {
      this.crudList<T>(command, { ...options, page, limit }).subscribe({
        next: (items) => {
          this.updatePaginationState(table, {
            skip: page + items.length,
            hasMore: items.length >= limit,
          });
          subscriber.next({ items, hasMore: items.length >= limit });
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  crud<T>(
    route: string,
    params: {
      id?: string;
      data?: Partial<T>;
      visibility?: string;
      filter?: Record<string, unknown>;
      load?: string[];
      page?: number;
      limit?: number;
      todoId?: string;
      taskId?: string;
    } = {}
  ): Observable<T> {
    const token = this.jwtTokenService.getToken();

    const args: Record<string, unknown> = { token };

    if (params.id) args["id"] = params.id;
    if (params.data) args["data"] = params.data;
    if (params.visibility) args["visibility"] = params.visibility;
    if (params.load) args["load"] = params.load;
    if (params.page !== undefined) args["page"] = params.page;
    if (params.limit !== undefined) args["limit"] = params.limit;

    if (params.filter) {
      const filter = { ...params.filter };
      if (params.todoId) (filter as any).todo_id = params.todoId;
      if (params.taskId) (filter as any).task_id = params.taskId;
      args["filter"] = filter;
    }

    return new Observable((subscriber) => {
      invoke<Response<T>>(route, args)
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as T);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || `Failed: ${route}`, "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  crudList<T>(
    route: string,
    params: {
      id?: string;
      data?: Partial<T>;
      visibility?: string;
      filter?: Record<string, unknown>;
      load?: string[];
      page?: number;
      limit?: number;
      todoId?: string;
      taskId?: string;
    } = {}
  ): Observable<T[]> {
    const token = this.jwtTokenService.getToken();

    const args: Record<string, unknown> = { token };

    if (params.id) args["id"] = params.id;
    if (params.data) args["data"] = params.data;
    if (params.visibility) args["visibility"] = params.visibility;
    if (params.load) args["load"] = params.load;
    if (params.page !== undefined) args["page"] = params.page;
    if (params.limit !== undefined) args["limit"] = params.limit;

    if (params.filter) {
      const filter = { ...params.filter };
      if (params.todoId) (filter as any).todo_id = params.todoId;
      if (params.taskId) (filter as any).task_id = params.taskId;
      args["filter"] = filter;
    }

    return new Observable((subscriber) => {
      invoke<Response<T[]>>(route, args)
        .then((response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            const items = Array.isArray(response.data)
              ? response.data
              : (response.data as any)?.items || [];
            subscriber.next(items as T[]);
            subscriber.complete();
          } else {
            subscriber.error(new ApiError(response.message || `Failed: ${route}`, "server"));
          }
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  private getCommand(table: string, operation: string): string {
    const routes: Record<string, Record<string, string>> = {
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
      users: { get: "get_user", getAll: "get_users" },
    };
    return routes[table]?.[operation] || "";
  }

  getPublicProfiles(): Observable<Profile[]> {
    return this.profiles.getAll({ visibility: "public" });
  }

  get<T>(table: string, id: string, options: CrudOptions = { visibility: "all" }): Observable<T> {
    return this.getEntityApi<T>(table).get(id, options.visibility);
  }

  getAll<T>(
    table: string,
    options: PaginatedOptions & { todoId?: string; taskId?: string } = { visibility: "all" }
  ): Observable<T[]> {
    return this.getEntityApi<T>(table).getAll(options);
  }

  create<T>(
    table: string,
    data: Partial<T>,
    options: CrudOptions = { visibility: "all" }
  ): Observable<T> {
    return this.getEntityApi<T>(table).create(data, options.visibility);
  }

  update<T>(
    table: string,
    id: string,
    data: Partial<T>,
    options: CrudOptions = { visibility: "all" }
  ): Observable<T> {
    return this.getEntityApi<T>(table).update(id, data, options.visibility);
  }

  updateAll<T>(
    table: string,
    items: Partial<T>[],
    options?: { visibility?: string; offline?: boolean }
  ): Observable<T[]> {
    return new Observable((subscriber) => {
      Promise.all(
        items.map((item) =>
          (item as any).id
            ? this.getEntityApi<T>(table)
                .update((item as any).id, item, options?.visibility)
                .toPromise()
            : null
        )
      )
        .then((responses) => {
          const updatedItems = responses.filter((r) => r !== null) as T[];
          subscriber.next(updatedItems);
          subscriber.complete();
        })
        .catch((err) => subscriber.error(new ApiError(err?.message || String(err), "network")));
    });
  }

  delete(table: string, id: string, options?: CrudOptions): Observable<void> {
    return this.getEntityApi<void>(table).delete(id, options);
  }

  private getEntityApi<T>(table: string): EntityApi<T> {
    switch (table) {
      case "todos":
        return this.todos as unknown as EntityApi<T>;
      case "tasks":
        return this.tasks as unknown as EntityApi<T>;
      case "subtasks":
        return this.subtasks as unknown as EntityApi<T>;
      case "categories":
        return this.categories as unknown as EntityApi<T>;
      case "profiles":
        return this.profiles as unknown as EntityApi<T>;
      case "comments":
        return this.comments as unknown as EntityApi<T>;
      case "chats":
        return this.chats as unknown as EntityApi<T>;
      case "users":
        return this.users as unknown as EntityApi<T>;
      default:
        throw new ApiError(`Unknown table: ${table}`, "server");
    }
  }
}

class EntityApi<T> {
  constructor(
    private api: ApiService,
    private routes: EntityRoutes
  ) {}

  get(id: string, visibility?: string): Observable<T> {
    return this.api.crud<T>(this.routes.get, { id, visibility });
  }

  getAll(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    todoId?: string;
    taskId?: string;
    load?: string[];
  }): Observable<T[]> {
    const {
      page = 0,
      limit = 10,
      visibility = "all",
      filter,
      todoId,
      taskId,
      load,
    } = options || {};
    return this.api.crudList<T>(this.routes.getAll, {
      page,
      limit,
      visibility,
      filter: filter as Record<string, unknown>,
      todoId,
      taskId,
      load,
    });
  }

  create(data: Partial<T>, visibility?: string): Observable<T> {
    return this.api.crud<T>(this.routes.create!, { data, visibility });
  }

  update(id: string, data: Partial<T>, visibility?: string): Observable<T> {
    return this.api.crud<T>(this.routes.update!, { id, data, visibility });
  }

  delete(id: string, options?: { visibility?: string }): Observable<void> {
    return this.api.crud<void>(this.routes.delete!, { id, visibility: options?.visibility });
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
