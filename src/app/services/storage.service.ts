/* sys lib */
import {
  Injectable,
  inject,
  signal,
  computed,
  Signal,
  WritableSignal,
  Injector,
} from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, map, catchError } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { User } from "@models/user.model";

/* services */
import { AdminService } from "@services/data/admin.service";
import { AdminDataService, AdminDataWithRelations } from "@services/core/admin-data.service";
import { CascadeService } from "@services/core/cascade.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageSignalMap } from "@models/storage-signal-map.model";

/* utils */
import {
  updateEntityInSignal,
  removeEntityFromSignal,
  createGroupedMap,
  addEntityToSignal,
  groupByKey,
} from "@stores/utils/store-helpers";
import { TimestampHelper, VisibilityHelper, DEFAULT_CACHE_TTL_MS } from "@helpers/index";

export type StorageEntity = keyof EntityMap;
export type VisibilityFilter = "all" | "private" | "shared" | "public";

export interface ArchiveDataMap {
  [table: string]: any[];
}

interface EntityMap {
  todos: Todo;
  tasks: Task;
  subtasks: Subtask;
  categories: Category;
  profiles: Profile;
  chats: Chat;
  comments: Comment;
  users: User;
}

export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

@Injectable({ providedIn: "root" })
export class StorageService {
  // ==================== CORE DATA SIGNALS ====================
  private readonly _privateTodos = signal<Todo[]>([]);
  private readonly _sharedTodos = signal<Todo[]>([]);
  private readonly _publicTodos = signal<Todo[]>([]);
  private readonly _tasks = signal<Task[]>([]);
  private readonly _subtasks = signal<Subtask[]>([]);
  private readonly _comments = signal<Comment[]>([]);
  private readonly _chats = signal<Chat[]>([]);
  private readonly _categories = signal<Category[]>([]);
  private readonly _profile = signal<Profile | null>(null);
  private readonly _profiles = signal<Profile[]>([]);
  private readonly _allProfiles = signal<Profile[]>([]);
  private readonly _user = signal<User | null>(null);
  private readonly _users = signal<User[]>([]);
  private readonly _dailyActivities = signal<any[]>([]);

  // ==================== LOADING STATE SIGNALS ====================
  private readonly _isLoading = signal(false);
  private readonly _loaded = signal(false);
  private readonly _lastLoaded = signal<Date | null>(null);
  private readonly _cacheInvalidated = signal(false);

  // ==================== COMPUTED CACHE FOR REACTIVE LOOKUPS ====================
  private readonly _todoComputedCache = new Map<
    string,
    ReturnType<typeof computed<Todo | undefined>>
  >();
  private readonly _taskComputedCache = new Map<
    string,
    ReturnType<typeof computed<Task | undefined>>
  >();

  // ==================== DEPENDENCIES ====================
  private _notifyService: NotifyService | null = null;
  private _adminService: AdminService | null = null;
  private _adminDataService: AdminDataService | null = null;
  private _cascadeService: CascadeService | null = null;
  private _injector = inject(Injector);

  private get notifyService(): NotifyService {
    if (!this._notifyService) this._notifyService = this._injector.get(NotifyService);
    return this._notifyService;
  }
  private get adminService(): AdminService {
    if (!this._adminService) this._adminService = this._injector.get(AdminService);
    return this._adminService;
  }
  private get adminDataService(): AdminDataService {
    if (!this._adminDataService) this._adminDataService = this._injector.get(AdminDataService);
    return this._adminDataService;
  }
  private get cascadeService(): CascadeService {
    if (!this._cascadeService) this._cascadeService = this._injector.get(CascadeService);
    return this._cascadeService;
  }

  constructor() {}

  // ==================== PUBLIC SIGNALS ====================
  readonly isLoading = this._isLoading.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly lastLoaded = this._lastLoaded.asReadonly();
  readonly cacheInvalidated = this._cacheInvalidated.asReadonly();

  // ==================== O(1) LOOKUP MAPS ====================
  readonly todoMap = computed(() => new Map(this.allActiveTodos().map((t) => [t.id, t])));
  readonly taskMap = computed(() => new Map(this.activeTasks().map((t) => [t.id, t])));
  readonly subtaskMap = computed(() => new Map(this.activeSubtasks().map((s) => [s.id, s])));
  readonly commentMap = computed(() => new Map(this.activeComments().map((c) => [c.id, c])));

  // ==================== GROUPED LOOKUP MAPS ====================
  private createGroupedLookup<K extends string, T>(
    entities: T[],
    getKey: (e: T) => K | undefined,
    filterFn?: (e: T) => boolean
  ): Map<K, T[]> {
    return createGroupedMap(entities, getKey, filterFn);
  }

  readonly tasksByTodoId = computed(() =>
    this.createGroupedLookup(this.activeTasks(), (t) => t.todo_id)
  );

  readonly subtasksByTaskId = computed(() =>
    this.createGroupedLookup(this.activeSubtasks(), (s) => s.task_id)
  );

  readonly commentsByTaskId = computed(() =>
    this.createGroupedLookup(
      this.activeComments(),
      (c) => c.task_id,
      (c) => !!c.task_id
    )
  );

  readonly commentsBySubtaskId = computed(() =>
    this.createGroupedLookup(
      this.activeComments(),
      (c) => c.subtask_id,
      (c) => !!c.subtask_id
    )
  );

  readonly chatsByTodoId = computed(() =>
    this.createGroupedLookup(
      this.activeChats(),
      (c) => c.todo_id,
      (c) => !!c.todo_id
    )
  );

  // ==================== PAGINATION SIGNALS ====================
  private readonly _todosPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  private readonly _tasksPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  private readonly _subtasksPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  private readonly _commentsPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  private readonly _chatsPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });

  readonly todosPagination = this._todosPagination.asReadonly();
  readonly tasksPagination = this._tasksPagination.asReadonly();
  readonly subtasksPagination = this._subtasksPagination.asReadonly();
  readonly commentsPagination = this._commentsPagination.asReadonly();
  readonly chatsPagination = this._chatsPagination.asReadonly();

  // ==================== TTL CACHE ====================
  private readonly _chatsCache = new Map<string, ReturnType<typeof computed<Chat[]>>>();
  private readonly _tasksByTodoCache = new Map<string, ReturnType<typeof computed<Task[]>>>();
  private readonly _cacheTimestamps = new Map<string, number>();

  // ==================== ACTIVE/ARCHIVED COMPUTEDS ====================
  private readonly activeTodos = computed(() => this.allActiveTodos().filter((t) => !t.deleted_at));
  readonly archivedTodos = computed(() =>
    [...this._privateTodos(), ...this._sharedTodos(), ...this._publicTodos()].filter(
      (t) => t.deleted_at
    )
  );
  private readonly activeTasks = computed(() => this._tasks().filter((t) => !t.deleted_at));
  readonly archivedTasks = computed(() => this._tasks().filter((t) => t.deleted_at));
  private readonly activeSubtasks = computed(() => this._subtasks().filter((s) => !s.deleted_at));
  readonly archivedSubtasks = computed(() => this._subtasks().filter((s) => s.deleted_at));
  private readonly activeComments = computed(() => this._comments().filter((c) => !c.deleted_at));
  private readonly activeChats = computed(() => this._chats().filter((c) => !c.deleted_at));

  // ==================== MERGED TODO COMPUTEDS ====================
  private readonly allActiveTodos = computed(() => {
    const allTodos = [...this._privateTodos(), ...this._sharedTodos(), ...this._publicTodos()];
    const uniqueTodoMap = new Map<string, Todo>();
    allTodos.forEach((todo) => {
      if (todo.deleted_at) return;
      if (
        !uniqueTodoMap.has(todo.id) ||
        (todo.updated_at && uniqueTodoMap.get(todo.id)!.updated_at! < todo.updated_at)
      ) {
        uniqueTodoMap.set(todo.id, todo);
      }
    });
    return Array.from(uniqueTodoMap.values());
  });

  private readonly privateTodosComputed = computed(() =>
    this._privateTodos().filter((t) => !t.deleted_at)
  );
  private readonly sharedTodosComputed = computed(() =>
    this._sharedTodos().filter((t) => !t.deleted_at)
  );
  private readonly publicTodosComputed = computed(() =>
    this._publicTodos().filter((t) => !t.deleted_at)
  );

  // ==================== PUBLIC DATA SIGNALS ====================
  readonly privateTodos = this.privateTodosComputed;
  readonly sharedTodos = this.sharedTodosComputed;
  readonly publicTodos = this.publicTodosComputed;
  readonly todos = this.allActiveTodos;
  readonly tasks = computed(() => this.activeTasks());
  readonly subtasks = computed(() => this.activeSubtasks());
  readonly comments = computed(() => this.activeComments());
  readonly chats = computed(() => this.activeChats());
  readonly categories = this._categories.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly profiles = this._profiles.asReadonly();
  readonly allProfiles = this._allProfiles.asReadonly();
  readonly user = this._user.asReadonly();
  readonly users = this._users.asReadonly();
  readonly dailyActivities = this._dailyActivities.asReadonly();

  // ==================== SIGNAL MAP ====================
  readonly signalMap: StorageSignalMap = {
    todos: this._privateTodos,
    tasks: this._tasks,
    subtasks: this._subtasks,
    comments: this._comments,
    chats: this._chats,
    categories: this._categories,
    daily_activities: this._dailyActivities,
  };

  // ==================== HAS MORE GETTERS ====================
  get hasMoreTodos(): boolean {
    return this.todosPagination().hasMore;
  }
  get hasMoreTasks(): boolean {
    return this.tasksPagination().hasMore;
  }
  get hasMoreSubtasks(): boolean {
    return this.subtasksPagination().hasMore;
  }
  get hasMoreComments(): boolean {
    return this.commentsPagination().hasMore;
  }
  get hasMoreChats(): boolean {
    return this.chatsPagination().hasMore;
  }

  // ==================== CACHE VALIDITY ====================
  isCacheValid(ttlMs: number = DEFAULT_TTL_MS): boolean {
    if (!this._loaded()) return false;
    const lastLoaded = this._lastLoaded();
    if (!lastLoaded) return false;
    return new Date().getTime() - lastLoaded.getTime() < ttlMs;
  }

  invalidateCache(): void {
    this._loaded.set(false);
    this._lastLoaded.set(null);
    this._cacheInvalidated.set(true);
    this._chatsCache.clear();
    this._tasksByTodoCache.clear();
    this._cacheTimestamps.clear();
    setTimeout(() => this._cacheInvalidated.set(false), 0);
  }

  // ==================== CRUD OPERATIONS ====================
  addItem(type: StorageEntity, data: any, options?: { isPrivate?: boolean }): void {
    if (type === "users" || !data?.id) return;
    this.addToSignal(type, data, options?.isPrivate);
  }

  private addToSignal(type: StorageEntity, data: any, isPrivate?: boolean): void {
    switch (type) {
      case "todos": {
        const visibility = data.visibility || (isPrivate ? "private" : "shared");
        const targetArray =
          visibility === "private"
            ? this._privateTodos
            : visibility === "public"
              ? this._publicTodos
              : this._sharedTodos;
        addEntityToSignal(targetArray, data);
        break;
      }
      case "tasks":
        addEntityToSignal(this._tasks, data);
        break;
      case "subtasks":
        addEntityToSignal(this._subtasks, data);
        break;
      case "comments":
        addEntityToSignal(this._comments, data);
        break;
      case "chats":
        addEntityToSignal(this._chats, data);
        break;
      case "categories":
        addEntityToSignal(this._categories, data);
        break;
      case "profiles":
        this._profile.set(data);
        break;
    }
  }

  updateItem(
    type: StorageEntity,
    id: string,
    updates: Partial<any>,
    options?: { isPrivate?: boolean }
  ): void {
    this.batchUpdate(type, [{ id, updates }], options);
  }

  batchUpdate(
    type: StorageEntity,
    items: { id: string; updates: Partial<any> }[],
    options?: { isPrivate?: boolean }
  ): void {
    for (const { id, updates } of items) {
      if (updates["deleted_at"]) {
        const existing: any = this.getById(type, id);
        if (existing?.["deleted_at"]) continue;
      }
      this.updateInSignal(type, id, updates);
    }
  }

  private updateInSignal(type: StorageEntity, id: string, updates: any): void {
    switch (type) {
      case "todos":
        updateEntityInSignal(this._privateTodos, id, updates);
        updateEntityInSignal(this._sharedTodos, id, updates);
        updateEntityInSignal(this._publicTodos, id, updates);
        break;
      case "tasks":
        updateEntityInSignal(this._tasks, id, updates);
        break;
      case "subtasks":
        updateEntityInSignal(this._subtasks, id, updates);
        break;
      case "comments":
        updateEntityInSignal(this._comments, id, updates);
        break;
      case "chats":
        updateEntityInSignal(this._chats, id, updates);
        break;
      case "categories":
        updateEntityInSignal(this._categories, id, updates);
        break;
      case "profiles":
        const current = this._profile();
        if (current?.id === id) {
          this._profile.set({ ...current, ...updates });
        }
        break;
    }
  }

  removeItem(type: StorageEntity, id: string, parentId?: string, isShared: boolean = false): void {
    if (type === "users") return;
    this.removeFromSignal(type, id);
  }

  private removeFromSignal(type: StorageEntity, id: string): void {
    switch (type) {
      case "todos":
        removeEntityFromSignal(this._privateTodos, id);
        removeEntityFromSignal(this._sharedTodos, id);
        removeEntityFromSignal(this._publicTodos, id);
        break;
      case "tasks":
        removeEntityFromSignal(this._tasks, id);
        break;
      case "subtasks":
        removeEntityFromSignal(this._subtasks, id);
        break;
      case "comments":
        removeEntityFromSignal(this._comments, id);
        break;
      case "chats":
        removeEntityFromSignal(this._chats, id);
        break;
      case "categories":
        removeEntityFromSignal(this._categories, id);
        break;
      case "profiles":
        const current = this._profile();
        if (current?.id === id) {
          this._profile.set(null);
        }
        break;
    }
  }

  getById<T extends keyof EntityMap>(type: T, id: string): EntityMap[T] | undefined {
    if (type === "users") return undefined;
    return this.findInSignal(type, id) as EntityMap[T] | undefined;
  }

  private findInSignal(type: StorageEntity, id: string): any {
    switch (type) {
      case "todos":
        return (
          this._privateTodos().find((t) => t.id === id) ||
          this._sharedTodos().find((t) => t.id === id) ||
          this._publicTodos().find((t) => t.id === id)
        );
      case "tasks":
        return this._tasks().find((t) => t.id === id);
      case "subtasks":
        return this._subtasks().find((s) => s.id === id);
      case "comments":
        return this._comments().find((c) => c.id === id);
      case "chats":
        return this._chats().find((c) => c.id === id);
      case "categories":
        return this._categories().find((c) => c.id === id);
      case "profiles":
        return this._profile();
      default:
        return undefined;
    }
  }

  // ==================== O(1) LOOKUP METHODS ====================
  getTodoById(id: string): Todo | undefined {
    return this.todoMap().get(id);
  }

  getTaskById(id: string): Task | undefined {
    return this.taskMap().get(id);
  }

  getSubtaskById(id: string): Subtask | undefined {
    return this.subtaskMap().get(id);
  }

  getCommentById(id: string): Comment | undefined {
    return this.commentMap().get(id);
  }

  getTasksByTodoId(todo_id: string): Task[] {
    return this.tasksByTodoId().get(todo_id) || [];
  }

  getSubtasksByTaskId(task_id: string): Subtask[] {
    return this.subtasksByTaskId().get(task_id) || [];
  }

  getCommentsByTaskId(task_id: string): Comment[] {
    return this.commentsByTaskId().get(task_id) || [];
  }

  getCommentsBySubtaskId(subtask_id: string): Comment[] {
    return this.commentsBySubtaskId().get(subtask_id) || [];
  }

  getChatsByTodoId(todo_id: string): Chat[] {
    return this.chatsByTodoId().get(todo_id) || [];
  }

  getChatsByTodo(todo_id?: string): Chat[] {
    if (!todo_id) return [];
    return this.chats().filter((c) => c.todo_id === todo_id);
  }

  // ==================== VISIBILITY-AWARE GETTERS ====================
  getTodos(visibility: VisibilityFilter = "all"): Todo[] {
    switch (visibility) {
      case "private":
        return this.privateTodos();
      case "shared":
        return this.sharedTodos();
      case "public":
        return this.publicTodos();
      case "all":
      default:
        return this.todos();
    }
  }

  getTasks(todoId?: string, visibility?: VisibilityFilter): Task[] {
    if (todoId) {
      return this.getTasksByTodoId(todoId);
    }
    return this.tasks();
  }

  getSubtasks(taskId?: string): Subtask[] {
    if (taskId) {
      return this.getSubtasksByTaskId(taskId);
    }
    return this.subtasks();
  }

  getComments(taskId?: string, subtaskId?: string): Comment[] {
    if (taskId) {
      return this.getCommentsByTaskId(taskId);
    }
    if (subtaskId) {
      return this.getCommentsBySubtaskId(subtaskId);
    }
    return this.comments();
  }

  getChats(todoId?: string): Chat[] {
    if (todoId) {
      return this.getChatsByTodoId(todoId);
    }
    return this.chats();
  }

  // ==================== OFFLINE CHECK HELPERS ====================
  isPrivateData(entity: any): boolean {
    return entity?.visibility === "private";
  }

  canAccessOffline(visibility: VisibilityFilter): boolean {
    return visibility === "private";
  }

  // ==================== CHAT OPERATIONS ====================
  getChatsByTodoReactive(todo_id?: string): ReturnType<typeof computed<Chat[]>> {
    if (!todo_id) return computed(() => []);

    const now = Date.now();
    const cached = this._chatsCache.get(todo_id);
    const timestamp = this._cacheTimestamps.get(`chats_${todo_id}`);

    if (cached && timestamp && now - timestamp < DEFAULT_TTL_MS) {
      return cached;
    }

    if (this._chatsCache.size >= MAX_CACHE_SIZE) {
      this.evictOldestCache("chats_");
    }

    const computedSignal = computed(() => {
      return this.chats().filter((chat) => chat.todo_id === todo_id);
    });

    this._chatsCache.set(todo_id, computedSignal);
    this._cacheTimestamps.set(`chats_${todo_id}`, now);
    return computedSignal;
  }

  getTasksByTodoReactive(todo_id?: string): ReturnType<typeof computed<Task[]>> {
    if (!todo_id) return computed(() => []);

    const now = Date.now();
    const cached = this._tasksByTodoCache.get(todo_id);
    const timestamp = this._cacheTimestamps.get(`tasks_${todo_id}`);

    if (cached && timestamp && now - timestamp < DEFAULT_TTL_MS) {
      return cached;
    }

    if (this._tasksByTodoCache.size >= MAX_CACHE_SIZE) {
      this.evictOldestCache("tasks_");
    }

    const computedSignal = computed(() => {
      return this.tasks().filter((task) => task.todo_id === todo_id);
    });

    this._tasksByTodoCache.set(todo_id, computedSignal);
    this._cacheTimestamps.set(`tasks_${todo_id}`, now);
    return computedSignal;
  }

  private evictOldestCache(prefix: string): void {
    const sortedKeys = Array.from(this._cacheTimestamps.entries())
      .filter(([key]) => key.startsWith(prefix))
      .sort((a, b) => a[1] - b[1])
      .slice(0, this._chatsCache.size - MAX_CACHE_SIZE + 1)
      .map(([key]) => key);
    for (const key of sortedKeys) {
      const id = key.replace(prefix, "");
      if (prefix === "chats_") {
        this._chatsCache.delete(id);
      } else if (prefix === "tasks_") {
        this._tasksByTodoCache.delete(id);
      }
      this._cacheTimestamps.delete(key);
    }
  }

  setChatsByTodo(chats: Chat[], todo_id?: string): void {
    if (!todo_id) return;
    this._chats.update((existing) => {
      const filtered = existing.filter((c) => c.todo_id !== todo_id);
      return [...filtered, ...chats];
    });
  }

  addChatToTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this._chats.update((chats) => {
      if (chats.some((c) => c.id === chat.id)) return chats;
      return [...chats, chat];
    });
  }

  updateChatInTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this._chats.update((chats) => chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)));
  }

  deleteChatFromTodo(chatId: string, todo_id?: string): void {
    if (!todo_id) return;
    this._chats.update((chats) => chats.filter((c) => !(c.id === chatId && c.todo_id === todo_id)));
  }

  clearChatsByTodo(todo_id?: string): void {
    if (!todo_id) return;
    this._chats.update((chats) => chats.filter((c) => c.todo_id !== todo_id));
  }

  // ==================== TODO OPERATIONS ====================
  moveTodoToShared(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.getById("todos", todo_id);
    if (!todo) return;

    this._privateTodos.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this._sharedTodos().some((t) => t.id === todo_id)) {
      this._sharedTodos.update((todos) => [
        { ...todo, visibility: "shared" },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  moveTodoToPrivate(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.getById("todos", todo_id);
    if (!todo) return;

    this._sharedTodos.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this._privateTodos().some((t) => t.id === todo_id)) {
      this._privateTodos.update((todos) => [
        { ...todo, visibility: "private" },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  // ==================== CASCADE OPERATIONS ====================
  removeTodoWithCascade(todo_id?: string): void {
    if (!todo_id) return;
    this.removeTodoWithCascadeInternal(todo_id);
  }

  private removeTodoWithCascadeInternal(todo_id?: string): void {
    if (!todo_id) return;

    const { taskIds, subtaskIds } = this.cascadeService.computeCascadeForTodo(
      this._tasks(),
      this._subtasks(),
      todo_id
    );

    this._subtasks.update((items) => items.filter((s) => !subtaskIds.includes(s.id)));
    this._tasks.update((items) => items.filter((t) => t.todo_id !== todo_id));
    this._comments.update((items) =>
      items.filter((c) => {
        const isTodoComment = (c as any).todo_id === todo_id;
        const isTaskComment = c.task_id && taskIds.includes(c.task_id);
        const isSubtaskComment = c.subtask_id && subtaskIds.includes(c.subtask_id);
        return !isTodoComment && !isTaskComment && !isSubtaskComment;
      })
    );
    this._chats.update((items) => items.filter((c) => c.todo_id !== todo_id));
    this._privateTodos.update((items) => items.filter((t) => t.id !== todo_id));
    this._sharedTodos.update((items) => items.filter((t) => t.id !== todo_id));
    this._publicTodos.update((items) => items.filter((t) => t.id !== todo_id));
  }

  removeRecordWithCascade(table: string, id: string, deletedAt?: string): void {
    if (table === "todos") {
      this.removeTodoWithCascadeInternal(id);
    } else if (table === "tasks") {
      const task = this.getById("tasks", id);
      const todoId = task?.todo_id ?? null;
      if (deletedAt) {
        this.softDeleteTaskWithCascade(id, deletedAt, todoId ?? undefined);
      } else {
        this.softDeleteTaskInternal(id);
      }
    } else if (table === "subtasks") {
      const subtask = this.getById("subtasks", id);
      const taskId = subtask?.task_id ?? null;
      if (deletedAt) {
        this.softDeleteSubtaskWithCascade(id, deletedAt, taskId ?? undefined);
      } else {
        this.softDeleteSubtaskInternal(id);
      }
    } else if (table === "comments") {
      if (deletedAt) {
        this.updateInSignal("comments", id, { deleted_at: deletedAt });
      } else {
        this.removeFromSignal("comments", id);
      }
    } else if (table === "chats") {
      this.removeFromSignal("chats", id);
    } else if (table === "categories") {
      this.removeFromSignal("categories", id);
    }
  }

  private softDeleteTaskWithCascade(task_id: string, deletedAt: string, todoId?: string): void {
    const { subtaskIds } = this.cascadeService.computeCascadeForTask(this._subtasks(), task_id);
    const timestamp = deletedAt;

    this._subtasks.update((items) =>
      items.map((s) =>
        subtaskIds.includes(s.id) ? { ...s, deleted_at: timestamp, updated_at: timestamp } : s
      )
    );
    this._comments.update((items) =>
      items.map((c) =>
        c.task_id === task_id || (c.subtask_id && subtaskIds.includes(c.subtask_id))
          ? { ...c, deleted_at: timestamp, updated_at: timestamp }
          : c
      )
    );
    this._tasks.update((items) =>
      items.map((t) =>
        t.id === task_id ? { ...t, deleted_at: timestamp, updated_at: timestamp } : t
      )
    );
  }

  private softDeleteSubtaskWithCascade(
    subtask_id: string,
    deletedAt: string,
    taskId?: string
  ): void {
    const timestamp = deletedAt;
    this._subtasks.update((items) =>
      items.map((s) =>
        s.id === subtask_id ? { ...s, deleted_at: timestamp, updated_at: timestamp } : s
      )
    );
    this._comments.update((items) =>
      items.map((c) =>
        c.subtask_id === subtask_id ? { ...c, deleted_at: timestamp, updated_at: timestamp } : c
      )
    );
  }

  private softDeleteTaskInternal(task_id: string): void {
    const timestamp = TimestampHelper.createTimestamp();
    const subtasks = this.getSubtasksByTaskId(task_id);

    this._tasks.update((tasks) =>
      tasks.map((t) => (t.id === task_id ? { ...t, deleted_at: timestamp } : t))
    );

    for (const subtask of subtasks) {
      this.softDeleteSubtaskInternal(subtask.id);
    }
  }

  private softDeleteSubtaskInternal(subtask_id: string): void {
    const timestamp = TimestampHelper.createTimestamp();
    this._subtasks.update((subtasks) =>
      subtasks.map((s) => (s.id === subtask_id ? { ...s, deleted_at: timestamp } : s))
    );
  }

  restoreTodoWithCascade(data: {
    todo: Todo;
    tasks: Task[];
    subtasks: Subtask[];
    comments: Comment[];
    chats?: Chat[];
  }): void {
    const visibility = VisibilityHelper.getVisibility(data.todo.visibility);
    const targetArray =
      visibility === "private"
        ? this._privateTodos
        : visibility === "public"
          ? this._publicTodos
          : this._sharedTodos;
    targetArray.set([data.todo, ...targetArray()]);

    if (data.tasks?.length) {
      this._tasks.set([...this._tasks(), ...data.tasks]);
    }
    if (data.subtasks?.length) {
      this._subtasks.set([...this._subtasks(), ...data.subtasks]);
    }
    if (data.comments?.length) {
      this._comments.set([...this._comments(), ...data.comments]);
    }
    if (data.chats?.length) {
      this._chats.set([...this._chats(), ...data.chats]);
    }
  }

  restoreRecordWithCascade(table: string, id: string): void {
    const timestamp = TimestampHelper.createTimestamp();

    if (table === "todos") {
      this.batchUpdate("todos", [{ id, updates: { deleted_at: null, updated_at: timestamp } }]);
      this.batchUpdate(
        "tasks",
        this.getTasksByTodoId(id).map((t) => ({
          id: t.id,
          updates: { deleted_at: null, updated_at: timestamp },
        }))
      );
      this.batchUpdate(
        "subtasks",
        this.getSubtasksByTaskId(id).map((s) => ({
          id: s.id,
          updates: { deleted_at: null, updated_at: timestamp },
        }))
      );
      this.batchUpdate(
        "chats",
        this.getChatsByTodoId(id).map((c) => ({
          id: c.id,
          updates: { deleted_at: null, updated_at: timestamp },
        }))
      );
    } else if (table === "tasks") {
      this.batchUpdate("tasks", [{ id, updates: { deleted_at: null, updated_at: timestamp } }]);
      this.batchUpdate(
        "subtasks",
        this.getSubtasksByTaskId(id).map((s) => ({
          id: s.id,
          updates: { deleted_at: null, updated_at: timestamp },
        }))
      );
    } else if (table === "subtasks") {
      this.updateItem("subtasks", id, { deleted_at: null, updated_at: timestamp });
    } else if (table === "comments") {
      this.updateItem("comments", id, { deleted_at: null, updated_at: timestamp });
    } else if (table === "chats") {
      this.updateItem("chats", id, { deleted_at: null, updated_at: timestamp });
    } else if (table === "categories") {
      this.updateItem("categories", id, { deleted_at: null, updated_at: timestamp });
    }
  }

  updateRecordDeleteStatusWithCascade(table: string, id: string, deletedAt: boolean): void {
    const timestamp = TimestampHelper.createTimestamp();

    if (table === "todos") {
      const { taskIds, subtaskIds } = this.cascadeService.computeCascadeForTodo(
        this._tasks(),
        this._subtasks(),
        id
      );

      this._tasks.update((tasks) =>
        tasks.map((task) =>
          task.todo_id === id
            ? { ...task, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : task
        )
      );

      this._subtasks.update((subtasks) =>
        subtasks.map((subtask) =>
          subtaskIds.includes(subtask.id)
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );

      this._comments.update((comments) =>
        comments.map((comment) => {
          const isRelated =
            (comment.task_id && taskIds.includes(comment.task_id)) ||
            (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
          return isRelated
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment;
        })
      );

      this._chats.update((chats) =>
        chats.map((chat) =>
          chat.todo_id === id
            ? { ...chat, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : chat
        )
      );

      this._privateTodos.update((todos) =>
        todos.map((todo) =>
          todo.id === id
            ? { ...todo, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : todo
        )
      );
      this._sharedTodos.update((todos) =>
        todos.map((todo) =>
          todo.id === id
            ? { ...todo, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : todo
        )
      );
      this._publicTodos.update((todos) =>
        todos.map((todo) =>
          todo.id === id
            ? { ...todo, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : todo
        )
      );
    } else if (table === "tasks") {
      const { subtaskIds } = this.cascadeService.computeCascadeForTask(this._subtasks(), id);

      this._subtasks.update((subtasks) =>
        subtasks.map((subtask) =>
          subtaskIds.includes(subtask.id)
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );

      this._comments.update((comments) =>
        comments.map((comment) => {
          const isRelated =
            comment.task_id === id ||
            (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
          return isRelated
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment;
        })
      );

      this._tasks.update((tasks) =>
        tasks.map((task) =>
          task.id === id
            ? { ...task, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : task
        )
      );
    } else if (table === "subtasks") {
      this._comments.update((comments) =>
        comments.map((comment) =>
          comment.subtask_id === id
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment
        )
      );

      this._subtasks.update((subtasks) =>
        subtasks.map((subtask) =>
          subtask.id === id
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );
    }
  }

  // ==================== ADMIN DATA LOADING ====================
  loadInitialData(type: string, limit: number): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getAdminDataPaginated(type, 0, limit).subscribe({
        next: (response) => {
          if (response.status === "Success" && response.data) {
            subscriber.next(response);
            subscriber.complete();
          } else {
            subscriber.error(new Error(response.message || "Failed to load data"));
          }
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  loadMoreData(type: string, skip: number): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getAdminDataPaginated(type, skip, 10).subscribe({
        next: (response) => {
          if (response.status === "Success" && response.data) {
            subscriber.next(response);
            subscriber.complete();
          } else {
            subscriber.error(new Error(response.message || "Failed to load more data"));
          }
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  loadAdminData(force: boolean = false): Observable<AdminDataWithRelations> {
    const hasAnyData =
      this._privateTodos().length > 0 || this._tasks().length > 0 || this._subtasks().length > 0;

    if (!force && !hasAnyData) {
      force = true;
    }

    if (!force && this.isCacheValid(DEFAULT_TTL_MS)) {
      return of(this.getAdminDataWithRelations());
    }

    if (this._isLoading()) {
      return of(this.getAdminDataWithRelations());
    }

    this._isLoading.set(true);

    return this.adminDataService.loadAllAdminData().pipe(
      tap((data: AdminDataWithRelations) => {
        this._privateTodos.set(data["todos"] || []);
        this._tasks.set(data["tasks"] || []);
        this._subtasks.set(data["subtasks"] || []);
        this._comments.set(data["comments"] || []);
        this._chats.set(data["chats"] || []);
        this._categories.set(data["categories"] || []);
        this._dailyActivities.set(data["daily_activities"] || []);

        this.extractUsersAndProfiles(data);

        this._isLoading.set(false);
        this._loaded.set(true);
        this._lastLoaded.set(new Date());
      }),
      catchError((err) => {
        this._isLoading.set(false);
        return of(this.getAdminDataWithRelations());
      }),
      map(() => this.getAdminDataWithRelations())
    );
  }

  private getAdminDataWithRelations(): AdminDataWithRelations {
    return {
      todos: this._privateTodos(),
      tasks: this._tasks(),
      subtasks: this._subtasks(),
      comments: this._comments(),
      chats: this._chats(),
      categories: this._categories(),
      daily_activities: this._dailyActivities(),
      users: this._users(),
      profiles: this._profiles(),
    };
  }

  private extractUsersAndProfiles(data: AdminDataWithRelations): void {
    const usersMap = new Map<string, User>();
    const profilesMap = new Map<string, Profile>();

    data["todos"]?.forEach((todo: any) => {
      this.extractUserAndProfile(todo, usersMap, profilesMap);
      todo.categories?.forEach((category: any) =>
        this.extractUserAndProfile(category, usersMap, profilesMap)
      );
    });

    data["tasks"]?.forEach((task: any) => {
      if (task.todo) this.extractUserAndProfile(task.todo, usersMap, profilesMap);
    });

    data["subtasks"]?.forEach((subtask: any) => {
      if (subtask.task?.todo) this.extractUserAndProfile(subtask.task.todo, usersMap, profilesMap);
      if (subtask.task) this.extractUserAndProfile(subtask.task, usersMap, profilesMap);
    });

    data["categories"]?.forEach((category: any) =>
      this.extractUserAndProfile(category, usersMap, profilesMap)
    );

    data["comments"]?.forEach((comment: any) =>
      this.extractUserAndProfile(comment, usersMap, profilesMap)
    );

    data["chats"]?.forEach((chat: any) => this.extractUserAndProfile(chat, usersMap, profilesMap));

    this._users.set(Array.from(usersMap.values()));
    this._profiles.set(Array.from(profilesMap.values()));
  }

  private extractUserAndProfile(
    entity: any,
    usersMap: Map<string, User>,
    profilesMap: Map<string, Profile>
  ): void {
    if (!entity?.user) return;
    usersMap.set(entity.user.id, entity.user);
    if (entity.user.profile) {
      profilesMap.set(entity.user.profile.id, entity.user.profile);
    }
  }

  // ==================== RECORD ADMIN OPERATIONS ====================
  updateRecord(table: string, id: string, updates: any): void {
    const sig = this.signalMap[table];
    if (!sig) return;
    sig.update((items: any[]) =>
      items.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }

  updateRelatedRecords(parentTable: string, parentId: string, updates: any): void {
    if (parentTable === "todos") {
      this._tasks.update((tasks) =>
        tasks.map((task) => (task.todo_id === parentId ? { ...task, ...updates } : task))
      );
    } else if (parentTable === "tasks") {
      this._subtasks.update((subtasks) =>
        subtasks.map((subtask) =>
          subtask.task_id === parentId ? { ...subtask, ...updates } : subtask
        )
      );
    }
  }

  removeRecord(table: string, id: string): void {
    const sig = this.signalMap[table];
    if (!sig) return;
    sig.update((items: any[]) => items.filter((item: any) => item.id !== id));
    if (table === "todos") {
      this._tasks.update((tasks) => tasks.filter((task) => task.todo_id !== id));
    } else if (table === "tasks") {
      this._subtasks.update((subtasks) => subtasks.filter((subtask) => subtask.task_id !== id));
    }
  }

  updateRecordDeleteStatus(table: string, id: string, deletedAt: boolean): void {
    const timestamp = TimestampHelper.createTimestamp();
    this.updateRecord(table, id, {
      deleted_at: deletedAt ? timestamp : null,
      updated_at: timestamp,
    });
  }

  updateSignal(table: string, updater: (items: any[]) => any[]): void {
    const sig = this.signalMap[table];
    if (sig) sig.update(updater);
  }

  setSignal(table: string, items: any[]): void {
    const sig = this.signalMap[table];
    if (sig) sig.set(items);
  }

  // ==================== COMMENT OPERATIONS ====================
  addCommentToTask(comment: Comment, task_id?: string): void {
    if (!task_id) return;
    this.addToSignal("comments", { ...comment, task_id: task_id });
  }

  addCommentToSubtask(comment: Comment, subtask_id?: string): void {
    if (!subtask_id) return;
    this.addToSignal("comments", { ...comment, subtask_id: subtask_id });
  }

  removeCommentFromAll(commentId: string): void {
    this.removeFromSignal("comments", commentId);
  }

  // ==================== NESTED STRUCTURE HELPERS ====================
  getTodosWithNestedTasks(): Todo[] {
    const todos = this.activeTodos();
    const tasksByTodo = this.tasksByTodoId();
    return todos.map((todo) => ({
      ...todo,
      tasks: tasksByTodo.get(todo.id) || [],
    }));
  }

  getTasksWithNestedSubtasks(): Task[] {
    const tasks = this.activeTasks();
    const subtasksByTask = this.subtasksByTaskId();
    return tasks.map((task) => ({
      ...task,
      subtasks: subtasksByTask.get(task.id) || [],
    }));
  }

  getSubtasksWithNestedComments(): Subtask[] {
    const subtasks = this.activeSubtasks();
    const commentsBySubtask = this.commentsBySubtaskId();
    return subtasks.map((subtask) => ({
      ...subtask,
      comments: commentsBySubtask.get(subtask.id) || [],
    }));
  }

  // ==================== UTILITY METHODS ====================
  getAllByParentId<T extends "tasks" | "subtasks">(
    entityType: T,
    parentId: string
  ): T extends "tasks" ? Task[] : Subtask[] {
    if (entityType === "tasks") {
      return this.getTasksByTodoId(parentId) as any;
    }
    return this.getSubtasksByTaskId(parentId) as any;
  }

  getUnreadChatCount(todoId: string, userId: string): number {
    const chats = this.getChatsByTodoId(todoId).filter((c: Chat) => !c.deleted_at);
    return chats.filter((c: Chat) => !c.read_by || !c.read_by.includes(userId)).length;
  }

  getUsername(userId: string): string {
    const user = this._users().find((u) => u.id === userId);
    const userAny = user as any;
    if (userAny?.profile?.name) {
      return `${userAny.profile.name} ${userAny.profile.last_name || ""}`.trim();
    }
    const profile = this._profiles().find((p) => p.user_id === userId);
    if (profile?.name) {
      return `${profile.name} ${profile.last_name || ""}`.trim();
    }
    if (user?.username) return user.username;
    return "Unknown";
  }

  getTodoReactive(todo_id?: string): ReturnType<typeof computed<Todo | undefined>> {
    if (!todo_id) {
      return computed(() => undefined);
    }

    if (this._todoComputedCache.has(todo_id)) {
      return this._todoComputedCache.get(todo_id)!;
    }

    const computedSignal = computed(() => {
      return this.todos().find((t) => t.id === todo_id);
    });

    this._todoComputedCache.set(todo_id, computedSignal);
    return computedSignal;
  }

  getTaskReactive(task_id?: string): ReturnType<typeof computed<Task | undefined>> {
    if (!task_id) {
      return computed(() => undefined);
    }

    if (this._taskComputedCache.has(task_id)) {
      return this._taskComputedCache.get(task_id)!;
    }

    const computedSignal = computed(() => {
      return this.tasks().find((t) => t.id === task_id);
    });

    this._taskComputedCache.set(task_id, computedSignal);
    return computedSignal;
  }

  getTasksByTodoIdSignal(todo_id?: string): Task[] {
    if (!todo_id) return [];
    return this.tasks().filter((t) => t.todo_id === todo_id);
  }

  getSubtasksByTaskIdArray(task_id?: string): Subtask[] {
    if (!task_id) return [];
    return this.subtasks().filter((s) => s.task_id === task_id);
  }

  getSubtasksByTaskIdReactive(task_id?: string): Signal<Subtask[]> {
    return computed(() => this.subtasks().filter((subtask) => subtask.task_id === task_id));
  }

  subtaskCountByTaskId(task_id?: string): Signal<number> {
    return computed(() => this.subtasks().filter((subtask) => subtask.task_id === task_id).length);
  }

  readonly subtasksGroupedByTask: Signal<Map<string, Subtask[]>> = computed(() => {
    return groupByKey(this.subtasks(), (subtask) => subtask.task_id);
  });

  subtaskExists(id: string): boolean {
    return this.subtasks().some((s) => s.id === id);
  }

  bulkUpsertSubtasks(subtasks: Subtask[]): void {
    this._subtasks.update((existing) => {
      const subtaskMap = new Map(existing.map((s) => [s.id, s]));
      for (const subtask of subtasks) {
        subtaskMap.set(subtask.id, { ...subtaskMap.get(subtask.id), ...subtask });
      }
      return Array.from(subtaskMap.values());
    });
  }

  get pendingTasksCount(): number {
    return this.tasks().filter((t) => t.status === TaskStatus.PENDING).length;
  }

  // ==================== SET COLLECTION ====================
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
        this._categories.set(items as Category[]);
        break;
      case "profiles":
        this._profile.set(items as Profile | null);
        if (items && typeof items === "object" && "user" in items && (items as Profile).user) {
          this._user.set((items as Profile).user || null);
        }
        break;
      case "tasks":
        if (options?.append) {
          this._tasks.update((existing) => [...existing, ...(items as Task[])]);
        } else {
          this._tasks.update((existing) => {
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
          this._subtasks.update((existing) => [...existing, ...(items as Subtask[])]);
        } else {
          this._subtasks.update((existing) => {
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
          this._comments.update((existing) => [...existing, ...(items as Comment[])]);
        } else {
          this._comments.update((existing) => {
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
          this._chats.update((existing) => [...existing, ...(items as Chat[])]);
        } else {
          this._chats.update((existing) => {
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
        this._allProfiles.set(items as Profile[]);
        break;
      case "user":
        this._user.set(items as User | null);
        break;
      case "users":
        this._users.set(items as User[]);
        break;
      case "dailyActivities":
        this._dailyActivities.set(items as any[]);
        break;
    }
  }

  // ==================== PAGINATION HELPERS ====================
  updatePagination(
    type: "todos" | "tasks" | "subtasks" | "comments" | "chats",
    skip: number,
    limit: number,
    receivedCount: number
  ): void {
    const paginationSignal = this[`_${type}Pagination`] as WritableSignal<{
      skip: number;
      limit: number;
      hasMore: boolean;
    }>;
    paginationSignal.set({
      skip: skip + receivedCount,
      limit,
      hasMore: receivedCount >= limit,
    });
  }

  resetPagination(type: "todos" | "tasks" | "subtasks" | "comments" | "chats"): void {
    const defaults = { skip: 0, limit: 20, hasMore: true };
    const paginationSignal = this[`_${type}Pagination`] as WritableSignal<{
      skip: number;
      limit: number;
      hasMore: boolean;
    }>;
    paginationSignal.set(defaults);
  }

  setHasMoreTodos(hasMore: boolean): void {
    this._todosPagination.update((p) => ({ ...p, hasMore }));
  }

  // ==================== STORE TODOS WITH RELATIONS ====================
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
        this._privateTodos.update((existing) => {
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
        this._sharedTodos.update((existing) => {
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
        this._publicTodos.update((existing) => {
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

  // ==================== UPDATE AFTER OPERATION ====================
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

      const isShared = result?.visibility === "shared";

      switch (operation) {
        case "create":
          this.addItem(table as any, result, { isPrivate: !isShared });
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
      const existing = this.getById("tasks", result.id);
      if (existing) {
        const merged = this.mergePreservingFields(result, existing, ["comments", "subtasks"]);
        this.updateItem(table as any, result.id, merged, options);
      } else {
        this.updateItem(table as any, result.id, result, options);
      }
      return;
    }

    if (table === "subtasks") {
      const existing = this.getById("subtasks", result.id);
      if (existing) {
        const merged = this.mergePreservingFields(result, existing, ["comments"]);
        this.updateItem(table as any, result.id, merged, options);
      } else {
        this.updateItem(table as any, result.id, result, options);
      }
      return;
    }

    this.updateItem(table as any, result.id, result, options);
  }

  private handleDelete(table: string, id?: string, parentTodoId?: string): void {
    if (table === "todos" && id) {
      this.removeItem("todos", id);
    } else if (table === "tasks" || table === "subtasks") {
      this.removeRecordWithCascade(table, id!);
    } else if (table === "chats" && id) {
      this.deleteChatFromTodo(id, parentTodoId);
    } else {
      this.removeItem(table as any, id!);
    }
  }

  private handleUpdateAll(table: string, result: any, parentTodoId?: string): void {
    if (table === "chats" && result && Array.isArray(result)) {
      const todoId = parentTodoId || (result[0] as any)?.todo_id;
      if (todoId) {
        this.setChatsByTodo(result, todoId);
      }
    } else {
      (result as any[]).forEach((item) => {
        if (item && item.id) {
          this.updateItem(table as any, item.id, item, { isPrivate: true });
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

  // ==================== CLEAR ====================
  clear(): void {
    this._privateTodos.set([]);
    this._sharedTodos.set([]);
    this._publicTodos.set([]);
    this._tasks.set([]);
    this._subtasks.set([]);
    this._comments.set([]);
    this._chats.set([]);
    this._categories.set([]);
    this._profile.set(null);
    this._profiles.set([]);
    this._allProfiles.set([]);
    this._user.set(null);
    this._users.set([]);
    this._dailyActivities.set([]);
    this._loaded.set(false);
    this._lastLoaded.set(null);
    this._cacheInvalidated.set(true);
    this._chatsCache.clear();
    this._tasksByTodoCache.clear();
    this._cacheTimestamps.clear();
    setTimeout(() => this._cacheInvalidated.set(false), 0);
  }

  // ==================== ARCHIVE HELPERS ====================
  private removeRecordWithCascadeFromArchive(
    data: ArchiveDataMap,
    table: string,
    recordId: string
  ): ArchiveDataMap {
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

  private getCascadeChildIds(restoredRecord: any): { taskIds: string[]; subtaskIds: string[] } {
    const taskIds = restoredRecord.tasks?.map((t: any) => t.id) || [];
    const subtaskIds =
      restoredRecord.tasks?.flatMap((t: any) => t.subtasks?.map((s: any) => s.id) || []) || [];
    return { taskIds, subtaskIds };
  }

  private applyArchiveRestore(
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

  // ==================== FACADE METHODS (from StorageService) ====================
  getTodosByVisibility(visibility?: string): Todo[] {
    if (!visibility || visibility === "all") {
      return this.todos();
    }
    switch (visibility) {
      case "private":
        return this.privateTodos();
      case "shared":
        return this.sharedTodos();
      case "public":
        return this.publicTodos();
      default:
        return this.todos();
    }
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
}
