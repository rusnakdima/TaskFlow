import { Injectable, inject, signal, computed, WritableSignal } from "@angular/core";
import { Observable, from, of } from "rxjs";
import { tap, catchError, map } from "rxjs/operators";
import {
  Todo,
  Task,
  Subtask,
  Comment,
  Chat,
  User,
  Category,
  Profile,
  Room,
} from "@entities/generated/api.types";
import { ConversationItem, ChatMessage } from "@entities/chat.model";
import { EntityType, VisibilityFilter, ChildType, PaginationState } from "@entities/storage.model";
import { ApiService, Visibility } from "@services/api.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { NotifyService } from "@services/notifications/notify.service";
import { TauriApiService } from "@app/api/tauri-api.service";
import {
  upsertEntityBulk,
  updateEntityInSignal,
  removeEntityFromSignal,
  addEntityToSignal,
} from "@store/utils/store-helpers";
export type StorageTarget = "local" | "cloud";
export interface EntityStoreOptions {
  targetDb?: StorageTarget;
  visibility?: Visibility;
  todoId?: string;
  taskId?: string;
  skip?: number;
  limit?: number;
  filter?: Record<string, unknown>;
  load?: string[];
}
export interface CreateContext {
  targetDb: StorageTarget;
  visibility?: Visibility;
  todoId?: string;
  taskId?: string;
}
export interface UpdateContext {
  targetDb: StorageTarget;
  visibility?: Visibility;
}
const DEFAULT_PAGINATION: PaginationState = { skip: 0, limit: 20, hasMore: true };
@Injectable({ providedIn: "root" })
export class EntityStoreService {
  private readonly _apiService = inject(ApiService);
  private readonly _jwtTokenService = inject(JwtTokenService);
  private readonly _notifyService = inject(NotifyService);
  private readonly tauriApi = inject(TauriApiService);
  /* ════════════════════════════════════════════════════════════════════════
     SINGLE SOURCE OF TRUTH SIGNALS - One signal per entity type
     ════════════════════════════════════════════════════════════════════════ */
  readonly todos = signal<Todo[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly subtasks = signal<Subtask[]>([]);
  readonly comments = signal<Comment[]>([]);
  readonly chats = signal<Chat[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly profiles = signal<Profile[]>([]);
  readonly publicProfiles = signal<Profile[]>([]);
  readonly users = signal<User[]>([]);
  readonly currentUser = signal<User | null>(null);
  readonly rooms = signal<Room[]>([]);
  readonly conversations = signal<ConversationItem[]>([]);
  readonly messages = signal<ChatMessage[]>([]);
  readonly activeConversationId = signal<string | null>(null);
  private readonly _todosLoading = signal(false);
  private readonly _tasksLoading = signal(false);
  private readonly _subtasksLoading = signal(false);
  private readonly _categoriesLoading = signal(false);
  private readonly _chatsLoading = signal(false);
  private readonly _commentsLoading = signal(false);
  private readonly _userLoading = signal(false);
  private readonly _profileLoading = signal(false);
  private readonly _loaded = signal(false);
  private readonly _lastLoaded = signal<Date | null>(null);
  private readonly _pagination = signal<Record<ChildType, PaginationState>>({
    todos: { ...DEFAULT_PAGINATION },
    tasks: { ...DEFAULT_PAGINATION },
    subtasks: { ...DEFAULT_PAGINATION },
    categories: { ...DEFAULT_PAGINATION },
    comments: { ...DEFAULT_PAGINATION },
    chats: { ...DEFAULT_PAGINATION },
  });
  /* ════════════════════════════════════════════════════════════════════════
     FILTERED COMPUTED SIGNALS - Derived from single source signals
     ════════════════════════════════════════════════════════════════════════ */
  readonly privateTodos = computed(() =>
    this.todos().filter((t) => t.visibility === "private" && !t.deleted_at)
  );
  readonly sharedTodos = computed(() =>
    this.todos().filter((t) => t.visibility === "shared" && !t.deleted_at)
  );
  readonly publicTodos = computed(() =>
    this.todos().filter((t) => t.visibility === "public" && !t.deleted_at)
  );
  readonly allTodos = computed(() => this.todos().filter((t) => !t.deleted_at));
  readonly archivedTodos = computed(() => this.todos().filter((t) => !!t.deleted_at));
  readonly activeTasks = computed(() => this.tasks().filter((t) => !t.deleted_at));
  readonly archivedTasks = computed(() => this.tasks().filter((t) => !!t.deleted_at));
  readonly tasksByTodoId = computed(() => {
    const map = new Map<string, Task[]>();
    for (const task of this.activeTasks()) {
      const arr = map.get(task.todo_id) || [];
      arr.push(task);
      map.set(task.todo_id, arr);
    }
    return map;
  });
  readonly activeSubtasks = computed(() => this.subtasks().filter((s) => !s.deleted_at));
  readonly archivedSubtasks = computed(() => this.subtasks().filter((s) => !!s.deleted_at));
  readonly subtasksByTaskId = computed(() => {
    const map = new Map<string, Subtask[]>();
    for (const subtask of this.activeSubtasks()) {
      const arr = map.get(subtask.task_id) || [];
      arr.push(subtask);
      map.set(subtask.task_id, arr);
    }
    return map;
  });
  readonly activeComments = computed(() => this.comments().filter((c) => !c.deleted_at));
  readonly commentsByTaskId = computed(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of this.activeComments()) {
      if (comment.task_id) {
        const arr = map.get(comment.task_id) || [];
        arr.push(comment);
        map.set(comment.task_id, arr);
      }
    }
    return map;
  });
  readonly commentsBySubtaskId = computed(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of this.activeComments()) {
      if (comment.subtask_id) {
        const arr = map.get(comment.subtask_id) || [];
        arr.push(comment);
        map.set(comment.subtask_id, arr);
      }
    }
    return map;
  });
  readonly activeChats = computed(() => this.chats().filter((c) => !c.deleted_at));
  readonly todoMap = computed(() => new Map(this.allTodos().map((t) => [t.id, t])));
  readonly taskMap = computed(() => new Map(this.activeTasks().map((t) => [t.id, t])));
  readonly subtaskMap = computed(() => new Map(this.activeSubtasks().map((s) => [s.id, s])));
  readonly commentMap = computed(() => new Map(this.activeComments().map((c) => [c.id, c])));
  /* ════════════════════════════════════════════════════════════════════════
     STORAGE ROUTING - Determine correct storage based on context
     ════════════════════════════════════════════════════════════════════════ */
  determineStorageTarget(
    entityType: EntityType,
    context?: {
      visibility?: Visibility;
      todoId?: string;
      todoVisibility?: Visibility;
    }
  ): StorageTarget {
    if (entityType === "categories") {
      return "local";
    }
    if (entityType === "todos") {
      return context?.visibility === "private" ? "local" : "cloud";
    }
    if (entityType === "tasks" || entityType === "subtasks" || entityType === "comments") {
      if (context?.todoVisibility) {
        return context.todoVisibility === "private" ? "local" : "cloud";
      }
      if (context?.todoId) {
        const todo = this.todoMap().get(context.todoId);
        if (todo) {
          return todo.visibility === "private" ? "local" : "cloud";
        }
      }
    }
    return "cloud";
  }
  determineVisibilityForChild(todoId: string): Visibility {
    const todo = this.todoMap().get(todoId);
    return (todo?.visibility as Visibility) || "private";
  }
  /* ════════════════════════════════════════════════════════════════════════
     CREATE OPERATIONS - With visibility-based routing
     ════════════════════════════════════════════════════════════════════════ */
  createEntity(
    type: EntityType,
    data: Record<string, unknown>,
    context: CreateContext
  ): Observable<unknown> {
    const targetDb = context.targetDb;
    if (targetDb === "local") {
      return this.createEntityLocal(type, data, context);
    } else {
      return this.createEntityCloud(type, data, context);
    }
  }
  private createEntityLocal(
    type: EntityType,
    data: Record<string, unknown>,
    _context: CreateContext
  ): Observable<unknown> {
    const previousState = this.getEntitySignal(type)();
    this.addEntity(type, data);
    return from(
      this.tauriApi.invoke<Record<string, unknown>>("upsert_to_json", {
        table: type,
        data,
        id: (data as Record<string, unknown>)["id"],
      })
    ).pipe(
      tap((result) => {
        const resultRecord = result as Record<string, unknown>;
        if (resultRecord["id"]) {
          this.updateEntitySignal(type, resultRecord["id"] as string, resultRecord);
        }
      }),
      catchError((error) => {
        this.setEntitySignal(type, previousState);
        this._notifyService.showError(`Failed to create: ${error.message}`);
        throw error;
      })
    );
  }
  private createEntityCloud(
    type: EntityType,
    data: Record<string, unknown>,
    _context: CreateContext
  ): Observable<unknown> {
    const previousState = this.getEntitySignal(type)();
    this.addEntity(type, data);
    return this._apiService
      .crud<Record<string, unknown>>(this.getRoute(type, "create")!, { data })
      .pipe(
        tap((result) => {
          const resultRecord = result as Record<string, unknown>;
          if (resultRecord["id"]) {
            this.updateEntitySignal(type, resultRecord["id"] as string, resultRecord);
          }
        }),
        catchError((error) => {
          this.setEntitySignal(type, previousState);
          this._notifyService.showError(`Failed to create: ${error.message}`);
          throw error;
        })
      );
  }
  /* ════════════════════════════════════════════════════════════════════════
     UPDATE OPERATIONS - With visibility-based routing
 ════════════════════════════════════════════════════════════════════════ */
  updateEntity(
    type: EntityType,
    id: string,
    data: Partial<Record<string, unknown>>,
    context: UpdateContext
  ): Observable<unknown> {
    const targetDb = context.targetDb;
    if (targetDb === "local") {
      return this.updateEntityLocal(type, id, data);
    } else {
      return this.updateEntityCloud(type, id, data, context);
    }
  }
  private updateEntityLocal(
    type: EntityType,
    id: string,
    data: Partial<Record<string, unknown>>
  ): Observable<unknown> {
    const previousState = this.getEntitySignal(type)();
    this.getEntitySignal(type).update((items: unknown[]) =>
      (items as Record<string, unknown>[]).map((item: Record<string, unknown>) =>
        item["id"] === id ? { ...item, ...data } : item
      )
    );
    return from(
      this.tauriApi.invoke<Record<string, unknown>>("upsert_to_json", {
        table: type,
        data: { ...data, id },
        id,
      })
    ).pipe(
      catchError((error) => {
        this.setEntitySignal(type, previousState);
        this._notifyService.showError(`Failed to update: ${error.message}`);
        throw error;
      })
    );
  }
  private updateEntityCloud(
    type: EntityType,
    id: string,
    data: Partial<Record<string, unknown>>,
    _context: UpdateContext
  ): Observable<unknown> {
    const previousState = this.getEntitySignal(type)();
    this.getEntitySignal(type).update((items: unknown[]) =>
      (items as Record<string, unknown>[]).map((item: Record<string, unknown>) =>
        item["id"] === id ? { ...item, ...data } : item
      )
    );
    return this._apiService
      .crud<Record<string, unknown>>(this.getRoute(type, "update")!, { id, data })
      .pipe(
        catchError((error) => {
          this.setEntitySignal(type, previousState);
          this._notifyService.showError(`Failed to update: ${error.message}`);
          throw error;
        })
      );
  }
  /* ════════════════════════════════════════════════════════════════════════
     DELETE OPERATIONS - With visibility-based routing
     ════════════════════════════════════════════════════════════════════════ */
  deleteEntity(type: EntityType, id: string, context: UpdateContext): Observable<unknown> {
    const targetDb = context.targetDb;
    if (targetDb === "local") {
      return this.deleteEntityLocal(type, id);
    } else {
      return this.deleteEntityCloud(type, id);
    }
  }
  private deleteEntityLocal(type: EntityType, id: string): Observable<unknown> {
    const previousState = this.getEntitySignal(type)();
    this.getEntitySignal(type).update((items: unknown[]) =>
      (items as Record<string, unknown>[]).filter(
        (item: Record<string, unknown>) => item["id"] !== id
      )
    );
    return this.tauriApi
      .invoke<Record<string, unknown>>("delete_from_json", { table: type, id })
      .pipe(
        tap(() => {
          this._notifyService.showSuccess("Deleted successfully");
        }),
        catchError((error) => {
          this.setEntitySignal(type, previousState);
          this._notifyService.showError(`Failed to delete: ${error.message}`);
          throw error;
        })
      );
  }
  private deleteEntityCloud(type: EntityType, id: string): Observable<void> {
    const previousState = this.getEntitySignal(type)();
    this.getEntitySignal(type).update((items: unknown[]) =>
      (items as Record<string, unknown>[]).filter(
        (item: Record<string, unknown>) => item["id"] !== id
      )
    );
    return this._apiService.crud<void>(this.getRoute(type, "delete")!, { id }).pipe(
      tap(() => {
        this._notifyService.showSuccess("Deleted successfully");
      }),
      catchError((error) => {
        this.setEntitySignal(type, previousState);
        this._notifyService.showError(`Failed to delete: ${error.message}`);
        throw error;
      })
    );
  }
  /* ════════════════════════════════════════════════════════════════════════
     SOFT DELETE (ARCHIVE) OPERATIONS
     ════════════════════════════════════════════════════════════════════════ */
  archiveEntity(type: EntityType, id: string, context: UpdateContext): Observable<unknown> {
    return this.updateEntity(type, id, { deleted_at: new Date().toISOString() }, context);
  }
  restoreEntity(type: EntityType, id: string, context: UpdateContext): Observable<unknown> {
    return this.updateEntity(type, id, { deleted_at: null }, context);
  }
  /* ════════════════════════════════════════════════════════════════════════
     BATCH OPERATIONS
     ════════════════════════════════════════════════════════════════════════ */
  batchArchive(type: EntityType, ids: string[], context: UpdateContext): Observable<unknown[]> {
    const targetDb = context.targetDb;
    const deletedAt = new Date().toISOString();
    ids.forEach((id) => {
      this.getEntitySignal(type).update((items: unknown[]) =>
        (items as Record<string, unknown>[]).map((item: Record<string, unknown>) =>
          item["id"] === id ? { ...item, deleted_at: deletedAt } : item
        )
      );
    });
    if (targetDb === "local") {
      return from(
        this.tauriApi.invoke<unknown[]>("batch_soft_delete_json", {
          table: type,
          ids,
        })
      );
    } else {
      return from(this._apiService.batchSoftDelete(type, ids, context.visibility));
    }
  }
  batchRestore(type: EntityType, ids: string[], context: UpdateContext): Observable<unknown[]> {
    const targetDb = context.targetDb;
    ids.forEach((id) => {
      this.getEntitySignal(type).update((items: unknown[]) =>
        (items as Record<string, unknown>[]).map((item: Record<string, unknown>) =>
          item["id"] === id ? { ...item, deleted_at: null } : item
        )
      );
    });
    if (targetDb === "local") {
      return from(
        this.tauriApi.invoke<unknown[]>("batch_restore_json", {
          table: type,
          ids,
        })
      );
    } else {
      return from(this._apiService.batchRestore(type, ids, context.visibility));
    }
  }
  /* ════════════════════════════════════════════════════════════════════════
     LOADING STATE GETTERS
     ════════════════════════════════════════════════════════════════════════ */
  get isLoading(): ReturnType<typeof this._loaded.asReadonly> {
    return this._loaded.asReadonly();
  }
  get lastLoaded(): ReturnType<typeof this._lastLoaded.asReadonly> {
    return this._lastLoaded.asReadonly();
  }
  isEntityLoading(type: EntityType): boolean {
    switch (type) {
      case "todos":
        return this._todosLoading();
      case "tasks":
        return this._tasksLoading();
      case "subtasks":
        return this._subtasksLoading();
      case "categories":
        return this._categoriesLoading();
      case "chats":
        return this._chatsLoading();
      case "comments":
        return this._commentsLoading();
      case "users":
        return this._userLoading();
      case "profiles":
        return this._profileLoading();
      default:
        return false;
    }
  }
  /* ════════════════════════════════════════════════════════════════════════
     PAGINATION GETTERS
     ════════════════════════════════════════════════════════════════════════ */
  hasMoreTodos(): boolean {
    return this._pagination().todos.hasMore;
  }
  hasMoreTasks(): boolean {
    return this._pagination().tasks.hasMore;
  }
  hasMoreSubtasks(): boolean {
    return this._pagination().subtasks.hasMore;
  }
  hasMoreComments(): boolean {
    return this._pagination().comments.hasMore;
  }
  hasMoreChats(): boolean {
    return this._pagination().chats.hasMore;
  }
  hasMoreCategories(): boolean {
    return this._pagination().categories.hasMore;
  }
  /* ════════════════════════════════════════════════════════════════════════
     HYDRATION METHODS - Load data from appropriate storage
     ════════════════════════════════════════════════════════════════════════ */
  ensureTodosLoaded(visibility: VisibilityFilter = "all", limit = 10): void {
    if (this._todosLoading()) return;
    const existing = this.todos();
    if (existing.length > 0) {
      const hasPrivate =
        visibility === "all" || visibility === "private"
          ? existing.some((t) => t.visibility === "private")
          : true;
      const hasShared =
        visibility === "all" || visibility === "shared"
          ? existing.some((t) => t.visibility === "shared")
          : true;
      const hasPublic =
        visibility === "all" || visibility === "public"
          ? existing.some((t) => t.visibility === "public")
          : true;
      if (hasPrivate && hasShared && hasPublic) return;
    }
    this._todosLoading.set(true);
    if (visibility === "private" || visibility === "all") {
      this.loadTodosFromLocal(limit).subscribe();
    }
    if (visibility !== "private") {
      this._apiService.todos.getAll({ visibility, limit, load: ["user"] }).subscribe({
        next: (todos) => {
          this.todos.update((existing) => upsertEntityBulk(existing, todos));
          this.updatePagination("todos", 0, limit, todos.length);
        },
        error: () => this._todosLoading.set(false),
        complete: () => this._todosLoading.set(false),
      });
    } else {
      this._todosLoading.set(false);
    }
  }
  private loadTodosFromLocal(limit: number): Observable<Todo[]> {
    return this.tauriApi.invoke<Todo[]>("get_all_from_json", { table: "todos", limit }).pipe(
      map((response: unknown) => {
        const todoResponse = response as Todo[] | { data: Todo[] };
        const todos = Array.isArray(todoResponse) ? todoResponse : todoResponse?.data;
        if (todos && todos.length > 0) {
          const privateTodos = todos.filter((t: Todo) => t.visibility === "private");
          this.todos.update((existing) => upsertEntityBulk(existing, privateTodos));
          this.updatePagination("todos", 0, limit, privateTodos.length);
        }
        return todos || [];
      }),
      catchError(() => {
        return of([]);
      })
    );
  }
  ensureTasksLoaded(todoId?: string, visibility = "private", limit = 10): void {
    if (!todoId && this.activeTasks().length > 0) return;
    if (todoId && (this.tasksByTodoId().get(todoId)?.length ?? 0) > 0) return;
    if (this._tasksLoading()) return;
    this._tasksLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (todoId) filter["todo_id"] = todoId;
    this._apiService.tasks.getAll({ visibility, limit, filter, load: ["user"] }).subscribe({
      next: (tasks) => {
        this.tasks.update((existing) => upsertEntityBulk(existing, tasks));
        this.updatePagination("tasks", 0, limit, tasks.length);
      },
      error: () => this._tasksLoading.set(false),
      complete: () => this._tasksLoading.set(false),
    });
  }
  ensureSubtasksLoaded(taskId?: string, visibility = "private", limit = 10): void {
    if (!taskId && this.activeSubtasks().length > 0) return;
    if (taskId && (this.subtasksByTaskId().get(taskId)?.length ?? 0) > 0) return;
    if (this._subtasksLoading()) return;
    this._subtasksLoading.set(true);
    this._apiService.subtasks.getAll({ visibility, limit, taskId, load: ["user"] }).subscribe({
      next: (subtasks) => {
        this.subtasks.update((existing) => upsertEntityBulk(existing, subtasks));
        this.updatePagination("subtasks", 0, limit, subtasks.length);
      },
      error: () => this._subtasksLoading.set(false),
      complete: () => this._subtasksLoading.set(false),
    });
  }
  ensureCategoriesLoaded(visibility: VisibilityFilter = "all", limit = 100): void {
    if (this._categoriesLoading()) return;
    if (this.categories().length > 0) return;
    this._categoriesLoading.set(true);
    this.loadCategoriesFromLocal(limit).subscribe();
    if (visibility !== "private") {
      this._apiService.categories.getAll({ visibility, limit }).subscribe({
        next: (categories) => {
          this.categories.update((existing) => upsertEntityBulk(existing, categories));
          this.updatePagination("categories", 0, limit, categories.length);
        },
        error: () => this._categoriesLoading.set(false),
        complete: () => this._categoriesLoading.set(false),
      });
    } else {
      this._categoriesLoading.set(false);
    }
  }
  private loadCategoriesFromLocal(limit: number): Observable<Category[]> {
    return this.tauriApi
      .invoke<Category[]>("get_all_from_json", { table: "categories", limit })
      .pipe(
        map((response: unknown) => {
          const catResponse = response as Category[] | { data: Category[] };
          const categories = Array.isArray(catResponse) ? catResponse : catResponse?.data;
          if (categories && categories.length > 0) {
            this.categories.update((existing) => upsertEntityBulk(existing, categories));
            this.updatePagination("categories", 0, limit, categories.length);
          }
          return categories || [];
        }),
        catchError(() => {
          return of([]);
        })
      );
  }
  ensureCommentsLoaded(taskId?: string, visibility = "private", limit = 10): void {
    if (taskId && (this.commentsByTaskId().get(taskId)?.length ?? 0) > 0) return;
    if (!taskId && this.activeComments().length > 0) return;
    if (this._commentsLoading()) return;
    this._commentsLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (taskId) filter["task_id"] = taskId;
    this._apiService.comments.getAll({ visibility, limit, filter, load: ["user"] }).subscribe({
      next: (comments) => {
        this.comments.update((existing) => upsertEntityBulk(existing, comments));
        this.updatePagination("comments", 0, limit, comments.length);
      },
      error: () => this._commentsLoading.set(false),
      complete: () => this._commentsLoading.set(false),
    });
  }
  ensureChatsLoaded(visibility = "private", limit = 50): void {
    if (this._chatsLoading() || this.activeChats().length > 0) return;
    this._chatsLoading.set(true);
    this._apiService.chats.getAll({ visibility, limit }).subscribe({
      next: (chats) => {
        this.chats.set(chats);
        this.updatePagination("chats", 0, limit, chats.length);
      },
      error: () => this._chatsLoading.set(false),
      complete: () => this._chatsLoading.set(false),
    });
  }
  ensureUserLoaded(): void {
    if (this._userLoading() || this.currentUser()) return;
    this._userLoading.set(true);
    const token = this._jwtTokenService.getToken();
    const user = this._jwtTokenService.getUserFromToken(token);
    if (user) {
      this.currentUser.set(user);
    }
    this._userLoading.set(false);
  }
  ensureProfileLoaded(): void {
    if (this._profileLoading() || this.profiles().length > 0) return;
    this._profileLoading.set(true);
    const token = this._jwtTokenService.getToken();
    const userId = this._jwtTokenService.getUserId(token);
    if (!userId) {
      this._profileLoading.set(false);
      return;
    }
    this._apiService.profiles
      .getAll({ visibility: "private", filter: { user_id: userId }, load: ["user"] })
      .subscribe({
        next: (profiles) => {
          if (profiles && profiles.length > 0) {
            this.profiles.set(profiles);
          }
        },
        error: () => this._profileLoading.set(false),
        complete: () => this._profileLoading.set(false),
      });
  }
  loadAllProfiles(): void {
    this._apiService.profiles.getAll({ visibility: "public", load: ["user"] }).subscribe({
      next: (profiles) => {
        this.publicProfiles.set(profiles || []);
      },
      error: () => {},
    });
  }
  /* ════════════════════════════════════════════════════════════════════════
     LAZY GETTERS
     ════════════════════════════════════════════════════════════════════════ */
  getTodos(visibility: VisibilityFilter = "all"): Todo[] {
    if (this.todos().length === 0 && !this._todosLoading()) {
      this.ensureTodosLoaded(visibility);
    }
    switch (visibility) {
      case "private":
        return this.privateTodos();
      case "shared":
        return this.sharedTodos();
      case "public":
        return this.publicTodos();
      default:
        return this.allTodos();
    }
  }
  getTasks(todoId?: string): Task[] {
    if (todoId) {
      const tasks = this.tasksByTodoId().get(todoId) || [];
      if (tasks.length === 0 && !this._tasksLoading()) {
        this.ensureTasksLoaded(todoId);
      }
      return tasks;
    }
    if (this.activeTasks().length === 0 && !this._tasksLoading()) {
      this.ensureTasksLoaded();
    }
    return this.activeTasks();
  }
  getSubtasks(taskId?: string): Subtask[] {
    if (taskId) {
      const subtasks = this.subtasksByTaskId().get(taskId) || [];
      if (subtasks.length === 0 && !this._subtasksLoading()) {
        this.ensureSubtasksLoaded(taskId);
      }
      return subtasks;
    }
    if (this.activeSubtasks().length === 0 && !this._subtasksLoading()) {
      this.ensureSubtasksLoaded();
    }
    return this.activeSubtasks();
  }
  getComments(taskId?: string, subtaskId?: string): Comment[] {
    if (taskId) return this.commentsByTaskId().get(taskId) || [];
    if (subtaskId) return this.commentsBySubtaskId().get(subtaskId) || [];
    return this.activeComments();
  }
  getCategories(): Category[] {
    if (this.categories().length === 0 && !this._categoriesLoading()) {
      this.ensureCategoriesLoaded();
    }
    return this.categories();
  }
  getChats(): Chat[] {
    if (this.activeChats().length === 0 && !this._chatsLoading()) {
      this.ensureChatsLoaded();
    }
    return this.activeChats();
  }
  /* ════════════════════════════════════════════════════════════════════════
     PAGINATION - Load more data
     ════════════════════════════════════════════════════════════════════════ */
  loadMoreTodos(visibility: VisibilityFilter = "all"): void {
    if (this._todosLoading() || !this.hasMoreTodos()) return;
    const pagination = this._pagination().todos;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._todosLoading.set(true);
    this._apiService.todos
      .getAll({ page: nextPage, limit: pagination.limit, visibility })
      .subscribe({
        next: (todos) => {
          this.todos.update((existing) => upsertEntityBulk(existing, todos));
          this.updatePagination(
            "todos",
            nextPage * pagination.limit,
            pagination.limit,
            todos.length
          );
        },
        error: () => this._todosLoading.set(false),
        complete: () => this._todosLoading.set(false),
      });
  }
  loadMoreTasks(
    todoId?: string,
    visibility = "private",
    userId?: string,
    assigneeId?: string
  ): void {
    if (this._tasksLoading() || !this.hasMoreTasks()) return;
    const pagination = this._pagination().tasks;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._tasksLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (todoId) filter["todo_id"] = todoId;
    if (userId || assigneeId) {
      const orConditions: Record<string, string>[] = [];
      if (userId) orConditions.push({ user_id: userId });
      if (assigneeId) orConditions.push({ assignees: assigneeId });
      filter["$or"] = orConditions;
    }
    this._apiService.tasks
      .getAll({ page: nextPage, visibility, limit: pagination.limit, filter })
      .subscribe({
        next: (tasks) => {
          this.tasks.update((existing) => [...existing, ...tasks]);
          this.updatePagination(
            "tasks",
            nextPage * pagination.limit,
            pagination.limit,
            tasks.length
          );
        },
        error: () => this._tasksLoading.set(false),
        complete: () => this._tasksLoading.set(false),
      });
  }
  loadMoreSubtasks(taskId?: string): void {
    if (this._subtasksLoading() || !this.hasMoreSubtasks()) return;
    const pagination = this._pagination().subtasks;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._subtasksLoading.set(true);
    this._apiService.subtasks
      .getAll({ page: nextPage, limit: pagination.limit, taskId })
      .subscribe({
        next: (subtasks) => {
          this.subtasks.update((existing) => [...existing, ...subtasks]);
          this.updatePagination(
            "subtasks",
            nextPage * pagination.limit,
            pagination.limit,
            subtasks.length
          );
        },
        error: () => this._subtasksLoading.set(false),
        complete: () => this._subtasksLoading.set(false),
      });
  }
  loadMoreCategories(): void {
    if (this._categoriesLoading() || !this.hasMoreCategories()) return;
    const pagination = this._pagination().categories;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._categoriesLoading.set(true);
    this._apiService.categories.getAll({ page: nextPage, limit: pagination.limit }).subscribe({
      next: (categories) => {
        this.categories.update((existing) => [...existing, ...categories]);
        this.updatePagination(
          "categories",
          nextPage * pagination.limit,
          pagination.limit,
          categories.length
        );
      },
      error: () => this._categoriesLoading.set(false),
      complete: () => this._categoriesLoading.set(false),
    });
  }
  loadMoreComments(taskId?: string): void {
    if (this._commentsLoading() || !this.hasMoreComments()) return;
    const pagination = this._pagination().comments;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._commentsLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (taskId) filter["task_id"] = taskId;
    this._apiService.comments
      .getAll({ page: nextPage, limit: pagination.limit, filter })
      .subscribe({
        next: (comments) => {
          this.comments.update((existing) => [...existing, ...comments]);
          this.updatePagination(
            "comments",
            nextPage * pagination.limit,
            pagination.limit,
            comments.length
          );
        },
        error: () => this._commentsLoading.set(false),
        complete: () => this._commentsLoading.set(false),
      });
  }
  loadMoreChats(): void {
    if (this._chatsLoading() || !this.hasMoreChats()) return;
    const pagination = this._pagination().chats;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._chatsLoading.set(true);
    this._apiService.chats.getAll({ page: nextPage, limit: pagination.limit }).subscribe({
      next: (chats) => {
        this.chats.update((existing) => [...existing, ...chats]);
        this.updatePagination("chats", nextPage * pagination.limit, pagination.limit, chats.length);
      },
      error: () => this._chatsLoading.set(false),
      complete: () => this._chatsLoading.set(false),
    });
  }
  /* ════════════════════════════════════════════════════════════════════════
     ENTITY MANAGEMENT - Low level operations
     ════════════════════════════════════════════════════════════════════════ */
  addEntity(type: EntityType, data: Record<string, unknown>): void {
    if (!data?.["id"]) return;
    addEntityToSignal(
      this.getEntitySignal(type) as WritableSignal<{ id: string }[]>,
      data as { id: string }
    );
  }
  updateEntitySignal(type: EntityType, _id: string, data: Record<string, unknown>): void {
    if (!data?.["id"]) return;
    updateEntityInSignal(
      this.getEntitySignal(type) as WritableSignal<{ id: string }[]>,
      data["id"] as string,
      data as { id: string }
    );
  }
  removeEntity(type: EntityType, id: string): void {
    removeEntityFromSignal(this.getEntitySignal(type) as WritableSignal<{ id: string }[]>, id);
  }
  /* ════════════════════════════════════════════════════════════════════════
     UTILITY METHODS
     ════════════════════════════════════════════════════════════════════════ */
  private getEntitySignal(type: EntityType): WritableSignal<unknown[]> {
    switch (type) {
      case "todos":
        return this.todos;
      case "tasks":
        return this.tasks;
      case "subtasks":
        return this.subtasks;
      case "comments":
        return this.comments;
      case "chats":
        return this.chats;
      case "categories":
        return this.categories;
      case "users":
        return this.users;
      case "profiles":
        return this.profiles as unknown as WritableSignal<unknown[]>;
      default:
        return this.tasks;
    }
  }
  private setEntitySignal(type: EntityType, data: unknown[]): void {
    const sig = this.getEntitySignal(type);
    sig.set(data);
  }
  private getRoute(type: EntityType, operation: "create" | "update" | "delete"): string | null {
    const routes: Record<string, Record<string, string>> = {
      todos: { create: "create_todo", update: "update_todo", delete: "delete_todo" },
      tasks: { create: "create_task", update: "update_task", delete: "delete_task" },
      subtasks: { create: "create_subtask", update: "update_subtask", delete: "delete_subtask" },
      categories: {
        create: "create_category",
        update: "update_category",
        delete: "delete_category",
      },
      comments: { create: "create_comment", update: "update_comment", delete: "delete_comment" },
      chats: { create: "create_chat", update: "update_chat", delete: "delete_chat" },
      profiles: { create: "create_profile", update: "update_profile", delete: "delete_profile" },
    };
    return routes[type]?.[operation] || null;
  }
  private updatePagination(
    type: ChildType,
    skip: number,
    limit: number,
    receivedCount: number
  ): void {
    this._pagination.update((p) => ({
      ...p,
      [type]: { skip: skip + receivedCount, limit, hasMore: receivedCount >= limit },
    }));
  }
  currentUserId(): string {
    return this._jwtTokenService.getCurrentUserId() || "";
  }
  getUsername(userId: string): string {
    const user = this.users().find((u) => u.id === userId);
    const profile = this.profiles().find((p) => p.user_id === userId);
    if (profile?.name) return `${profile.name} ${profile.last_name || ""}`.trim();
    return user?.username || "Unknown";
  }
  clear(): void {
    this.todos.set([]);
    this.tasks.set([]);
    this.subtasks.set([]);
    this.comments.set([]);
    this.chats.set([]);
    this.categories.set([]);
    this.profiles.set([]);
    this.publicProfiles.set([]);
    this.users.set([]);
    this.currentUser.set(null);
    this.rooms.set([]);
    this.conversations.set([]);
    this.messages.set([]);
    this.activeConversationId.set(null);
    this._loaded.set(false);
    this._lastLoaded.set(null);
    this._pagination.set({
      todos: { ...DEFAULT_PAGINATION },
      tasks: { ...DEFAULT_PAGINATION },
      subtasks: { ...DEFAULT_PAGINATION },
      categories: { ...DEFAULT_PAGINATION },
      comments: { ...DEFAULT_PAGINATION },
      chats: { ...DEFAULT_PAGINATION },
    });
  }
}
