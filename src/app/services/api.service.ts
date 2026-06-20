import { Injectable, inject, signal, Injector } from "@angular/core";
import { Observable } from "rxjs";

import { Response, ResponseStatus } from "@entities/response.model";
import {
  Todo,
  Task,
  Subtask,
  Category,
  Chat,
  Comment,
  Profile,
  User,
  Group,
} from "@entities/generated/api.types";
import { MongoConnectionService } from "@core/services/mongo-connection.service";
import { StorageService } from "@services/storage.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { TauriApiService } from "@app/api/tauri-api.service";
import {
  Visibility,
  CrudOptions,
  PaginatedOptions,
  HasVisibility,
  ApiError,
  PaginationState,
} from "@entities/api.model";

export { ApiError, Visibility, HasId } from "@entities/api.model";

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
  private _injector = inject(Injector);
  jwtTokenService = inject(JwtTokenService);
  private tauriApi = inject(TauriApiService);

  private _storageService: StorageService | null = null;
  get storageService(): StorageService {
    if (!this._storageService) {
      this._storageService = this._injector.get(StorageService);
    }
    return this._storageService;
  }

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
  readonly groups = new EntityApi<Group>(this, {
    get: "get_group",
    getAll: "get_groups",
    create: "create_group",
    update: "update_group",
    delete: "delete_group",
  });

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
    return !navigator.onLine || !this.mongoConnectionService.isConnected();
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
    return new Observable((subscriber) => {
      const offline = this.isOffline();
      const invokeArgs = { ...args, offline };
      this.tauriApi
        .invokeAsync<Response<T>>(command, invokeArgs)
        .then((response: any) => {
          if (response.status === ResponseStatus.SUCCESS) {
            subscriber.next(response.data as T);
            subscriber.complete();
          } else {
            subscriber.error(
              new ApiError(response.message || `Command failed: ${command}`, "server")
            );
          }
        })
        .catch((err: any) => {
          const errMsg =
            err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
          subscriber.error(new ApiError(errMsg, "network"));
        });
    });
  }

  async batchSoftDelete(
    table: string,
    ids: string[],
    visibility?: string
  ): Promise<CascadeResult[]> {
    const token = this.jwtTokenService.getToken();
    const response = await this.tauriApi.invokeAsync<Response<CascadeResult[]>>(
      "batch_soft_delete_cascade",
      {
        table,
        ids,
        token,
        visibility,
      }
    );
    return response.data as CascadeResult[];
  }

  async batchHardDelete(
    table: string,
    ids: string[],
    visibility?: string
  ): Promise<CascadeResult[]> {
    const token = this.jwtTokenService.getToken();
    const response = await this.tauriApi.invokeAsync<Response<CascadeResult[]>>(
      "batch_hard_delete_cascade",
      {
        table,
        ids,
        token,
        visibility,
      }
    );
    return response.data as CascadeResult[];
  }

  async batchRestore(table: string, ids: string[], visibility?: string): Promise<CascadeResult[]> {
    const token = this.jwtTokenService.getToken();
    const response = await this.tauriApi.invokeAsync<Response<CascadeResult[]>>(
      "batch_restore_cascade",
      {
        table,
        ids,
        token,
        visibility,
      }
    );
    return response.data as CascadeResult[];
  }

  resetPagination(table: string): void {
    this.resetPaginationState(table);
  }

  hasMore(table: string): boolean {
    return this.getPaginationState(table).hasMore;
  }

  getTasksByMonth(year: number, month: number): Observable<{ tasks: unknown[] }> {
    const offline = !this.mongoConnectionService.isConnected();
    return new Observable((subscriber) => {
      this.tauriApi
        .invoke<Response<{ tasks: unknown[] }>>("get_tasks_by_month", { year, month, offline })
        .subscribe({
          next: (response) => {
            if (response.status === ResponseStatus.SUCCESS) {
              subscriber.next(response.data as { tasks: unknown[] });
              subscriber.complete();
            } else {
              subscriber.error(
                new ApiError(response.message || "Failed to load tasks by month", "server")
              );
            }
          },
          error: (err) => {
            subscriber.error(new ApiError(err?.message || String(err), "network"));
          },
        });
    });
  }

  initializeUserData(userId: string): Observable<Response<unknown>> {
    return this.tauriApi.invoke<Response<unknown>>(
      "initialize_user_data",
      this.toSnakeCase({ userId }) as Record<string, unknown>
    );
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
      load?: string | string[];
      page?: number;
      limit?: number;
      todoId?: string;
      taskId?: string;
    } = {}
  ): Observable<T> {
    const token = this.jwtTokenService.getToken();

    const args: Record<string, unknown> = { token };

    if (params.id !== undefined && params.id !== null) {
      args["id"] = params.id;
    }
    if (params.data) args["data"] = params.data;
    if (params.visibility) args["visibility"] = params.visibility;
    if (params.load) args["load"] = JSON.stringify(params.load);
    if (params.page !== undefined) args["page"] = params.page;
    if (params.limit !== undefined) args["limit"] = params.limit;

    if (params.filter) {
      const filter = { ...params.filter };
      if (params.todoId) (filter as any).todo_id = params.todoId;
      if (params.taskId) (filter as any).task_id = params.taskId;
      args["filter"] = filter;
    }

    return new Observable((subscriber) => {
      this.tauriApi.invoke<T>(route, this.toSnakeCase(args) as Record<string, unknown>).subscribe({
        next: (data) => {
          subscriber.next(this.fromSnakeCase(data) as T);
          subscriber.complete();
        },
        error: (err: unknown) => {
          const errMsg =
            err && typeof err === "object" && "message" in err
              ? String((err as { message?: unknown }).message)
              : String(err);
          subscriber.error(new ApiError(errMsg, "network"));
        },
      });
    });
  }

  crudByFilter<T>(
    route: string,
    params: {
      filter?: Record<string, unknown>;
      visibility?: string;
      load?: string | string[];
    } = {}
  ): Observable<T> {
    const token = this.jwtTokenService.getToken();

    const args: Record<string, unknown> = { token };

    if (params.visibility) args["visibility"] = params.visibility;
    if (params.load) args["load"] = JSON.stringify(params.load);
    if (params.filter) args["filter"] = params.filter;

    return new Observable((subscriber) => {
      this.tauriApi
        .invoke<Response<T>>(route, this.toSnakeCase(args) as Record<string, unknown>)
        .subscribe({
          next: (response) => {
            if (response.status === ResponseStatus.SUCCESS) {
              subscriber.next(this.fromSnakeCase(response.data) as T);
              subscriber.complete();
            } else {
              subscriber.error(new ApiError(response.message || `Failed: ${route}`, "server"));
            }
          },
          error: (err: unknown) => {
            const errMsg =
              err && typeof err === "object" && "message" in err
                ? String((err as { message?: unknown }).message)
                : String(err);
            subscriber.error(new ApiError(errMsg, "network"));
          },
        });
    });
  }

  crudList<T>(
    route: string,
    params: {
      id?: string;
      data?: Partial<T>;
      visibility?: string;
      filter?: Record<string, unknown>;
      load?: string | string[];
      page?: number;
      limit?: number;
      todoId?: string;
      taskId?: string;
      offline?: boolean;
    } = {}
  ): Observable<T[]> {
    const token = this.jwtTokenService.getToken();
    const offlineParam = params.offline ?? this.isOffline();

    const args: Record<string, unknown> = { token, offline: offlineParam };

    if (params.id) args["id"] = params.id;
    if (params.data) args["data"] = params.data;
    if (params.visibility) args["visibility"] = params.visibility;
    if (params.load) {
      args["load"] = Array.isArray(params.load) ? JSON.stringify(params.load) : params.load;
    }
    if (params.page !== undefined) args["page"] = params.page;
    if (params.limit !== undefined) args["limit"] = params.limit;

    const filter = params.filter ? { ...params.filter } : {};
    if (params.todoId) (filter as any).todo_id = params.todoId;
    if (params.taskId) (filter as any).task_id = params.taskId;
    if (Object.keys(filter).length > 0) {
      args["filter"] = filter;
    }

    return new Observable((subscriber) => {
      this.tauriApi
        .invoke<Response<T[]>>(route, this.toSnakeCase(args) as Record<string, unknown>)
        .subscribe({
          next: (response) => {
            const items = Array.isArray(response) ? response : (response as any)?.data?.items || [];
            subscriber.next(this.fromSnakeCase(items) as T[]);
            subscriber.complete();
          },
          error: (err: unknown) => {
            const errMsg =
              err && typeof err === "object" && "message" in err
                ? String((err as { message?: unknown }).message)
                : String(err);
            subscriber.error(new ApiError(errMsg, "network"));
          },
        });
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
        .catch((err) => {
          const errMsg =
            err && typeof err === "object" && "message" in err
              ? String((err as any).message)
              : String(err);
          subscriber.error(new ApiError(errMsg, "network"));
        });
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
      case "groups":
        return this.groups as unknown as EntityApi<T>;
      default:
        throw new ApiError(`Unknown table: ${table}`, "server");
    }
  }

  private toSnakeCase(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.toSnakeCase(item));
    }
    if (typeof obj === "object" && !(obj instanceof Date)) {
      return Object.fromEntries(
        Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
          key.replace(/([A-Z])/g, (letter) => `_${letter.toLowerCase()}`),
          this.toSnakeCase(value),
        ])
      );
    }
    return obj;
  }

  private fromSnakeCase(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.fromSnakeCase(item));
    }
    if (typeof obj === "object" && !(obj instanceof Date)) {
      return Object.fromEntries(
        Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
          key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
          this.fromSnakeCase(value),
        ])
      );
    }
    return obj;
  }
}

class EntityApi<T> {
  private static readonly ROUTE_TO_ENTITY: Record<string, string> = {
    // Todos
    create_todo: "todos",
    get_todo: "todos",
    get_todos: "todos",
    update_todo: "todos",
    delete_todo: "todos",
    // Tasks
    create_task: "tasks",
    get_task: "tasks",
    get_tasks: "tasks",
    update_task: "tasks",
    delete_task: "tasks",
    // Subtasks
    create_subtask: "subtasks",
    get_subtask: "subtasks",
    get_subtasks: "subtasks",
    update_subtask: "subtasks",
    delete_subtask: "subtasks",
    // Categories
    create_category: "categories",
    get_category: "categories",
    get_categories: "categories",
    update_category: "categories",
    delete_category: "categories",
    // Profiles
    create_profile: "profiles",
    get_profile: "profiles",
    get_profiles: "profiles",
    update_profile: "profiles",
    delete_profile: "profiles",
    // Comments
    create_comment: "comments",
    get_comment: "comments",
    get_comments: "comments",
    update_comment: "comments",
    delete_comment: "comments",
    // Chats
    create_chat: "chats",
    get_chat: "chats",
    get_chats: "chats",
    update_chat: "chats",
    delete_chat: "chats",
    // Users
    get_user: "users",
    get_users: "users",
  };

  constructor(
    private api: ApiService,
    private routes: EntityRoutes
  ) {}

  private getEntityType(operation: "create" | "update" | "delete"): string {
    const route =
      operation === "create"
        ? this.routes.create
        : operation === "update"
          ? this.routes.update
          : this.routes.delete;
    return EntityApi.ROUTE_TO_ENTITY[route!] || "";
  }

  get(id: string, visibility?: string, load?: string[]): Observable<T> {
    return this.api.crud<T>(this.routes.get, { id, visibility, load });
  }

  getAll(options?: {
    page?: number;
    limit?: number;
    visibility?: string;
    filter?: unknown;
    todoId?: string;
    taskId?: string;
    load?: string | string[];
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
    return new Observable((subscriber) => {
      this.api.crud<T>(this.routes.create!, { data, visibility }).subscribe({
        next: (result: T) => {
          this.api.storageService.modify(this.getEntityType("create") as any, "create", result);
          subscriber.next(result);
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  update(id: string, data: Partial<T>, visibility?: string): Observable<T> {
    return new Observable((subscriber) => {
      this.api.crud<T>(this.routes.update!, { id, data, visibility }).subscribe({
        next: (result) => {
          this.api.storageService.modify(this.getEntityType("update") as any, "update", result);
          subscriber.next(result);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  delete(id: string, options?: { visibility?: string }): Observable<void> {
    const entityType = this.getEntityType("delete");
    return new Observable((subscriber) => {
      this.api.crud<void>(this.routes.delete!, { id, visibility: options?.visibility }).subscribe({
        next: () => {
          this.api.storageService.modify(entityType as any, "delete", { id });
          subscriber.next();
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  permanentDelete(id: string, options?: { visibility?: string }): Observable<void> {
    const entityType = this.getEntityType("delete");
    const token = this.api.jwtTokenService.getToken();
    return new Observable((subscriber) => {
      this.api
        .invokeCommand("hard_remove_data", {
          table: entityType,
          id,
          token,
          visibility: options?.visibility,
        })
        .subscribe({
          next: () => {
            this.api.storageService.modify(entityType as any, "delete", { id });
            subscriber.next();
            subscriber.complete();
          },
          error: (err) => subscriber.error(err),
        });
    });
  }
}

class AdminApi {
  constructor(private api: ApiService) {}

  softRemoveData(table: string, id: string, visibility?: string): Observable<CascadeResult> {
    const token = this.api.jwtTokenService.getToken();
    return this.api.invokeCommand("soft_remove_data", {
      table,
      id,
      token,
      visibility,
    }) as Observable<CascadeResult>;
  }

  hardRemoveData(table: string, id: string, visibility?: string): Observable<CascadeResult> {
    const token = this.api.jwtTokenService.getToken();
    return this.api.invokeCommand("hard_remove_data", {
      table,
      id,
      token,
      visibility,
    }) as Observable<CascadeResult>;
  }

  getAllAdminData(): Observable<unknown> {
    return this.api.invokeCommand("get_all_admin_data", {
      token: this.api.jwtTokenService.getToken(),
    });
  }

  getAllAdminPaginated(dataType: string, skip: number, limit: number): Observable<unknown> {
    return this.api.invokeCommand("get_all_admin_paginated", { dataType, skip, limit });
  }

  adminToggleDelete(table: string, id: string, visibility?: string): Observable<void> {
    const token = this.api.jwtTokenService.getToken();
    return this.api.invokeCommand("soft_delete", { table, id, token, visibility });
  }

  adminPermanentlyDelete(table: string, id: string, visibility?: string): Observable<void> {
    const token = this.api.jwtTokenService.getToken();
    return this.api.invokeCommand("permanent_delete", { table, id, token, visibility });
  }

  adminToggleDeleteLocal(
    table: string,
    id: string,
    visibility: string = "private"
  ): Observable<void> {
    const token = this.api.jwtTokenService.getToken();
    return this.api.invokeCommand("soft_delete", { table, id, token, visibility });
  }

  adminPermanentlyDeleteLocal(
    table: string,
    id: string,
    visibility: string = "private"
  ): Observable<void> {
    const token = this.api.jwtTokenService.getToken();
    return this.api.invokeCommand("permanent_delete", { table, id, token, visibility });
  }

  getAllArchiveData(): Observable<unknown> {
    return this.api.invokeCommand("get_all_archive_data", {
      token: this.api.jwtTokenService.getToken(),
    });
  }

  getAllArchivePaginated(dataType: string, skip: number, limit: number): Observable<unknown> {
    return this.api.invokeCommand("get_all_archive_paginated", { dataType, skip, limit });
  }

  batchSoftDelete(table: string, ids: string[], visibility?: string): Observable<CascadeResult> {
    return this.api.batchSoftDelete(table, ids, visibility) as unknown as Observable<CascadeResult>;
  }

  batchHardDelete(table: string, ids: string[], visibility?: string): Observable<CascadeResult> {
    return this.api.batchHardDelete(table, ids, visibility) as unknown as Observable<CascadeResult>;
  }

  batchRestore(table: string, ids: string[], visibility?: string): Observable<CascadeResult> {
    return this.api.batchRestore(table, ids, visibility) as unknown as Observable<CascadeResult>;
  }
}
