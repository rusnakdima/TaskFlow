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
import { BaseStorageService } from "@services/core/base-storage.service";
import { AdminService } from "@services/data/admin.service";
import { AdminDataService, AdminDataWithRelations } from "@services/core/admin-data.service";
import { CascadeService } from "@services/core/cascade.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageSignalMap } from "@models/storage-signal-map.model";

/* handlers */
import { TodoHandler } from "@services/core/entity-handlers/todo.handler";
import { CategoryHandler } from "@services/core/entity-handlers/category.handler";
import { ProfileHandler } from "@services/core/entity-handlers/profile.handler";
import { FlatCommentHandler } from "@services/core/entity-handlers/flat-comment.handler";
import { FlatChatHandler } from "@services/core/entity-handlers/flat-chat.handler";
import { TaskHandler } from "@services/core/entity-handlers/task.handler";
import { SubtaskHandler } from "@services/core/entity-handlers/subtask.handler";

/* utils */
import { groupByKey, existsById } from "@stores/utils/store-helpers";

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

// TTL cache expiry: 5 minutes
const TTL_CACHE_EXPIRY_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

@Injectable({ providedIn: "root" })
export class UnifiedStorageService extends BaseStorageService {
  // ==================== CORE DATA SIGNALS ====================
  protected readonly privateTodosSignal = signal<Todo[]>([]);
  protected readonly sharedTodosSignal = signal<Todo[]>([]);
  protected readonly publicTodosSignal = signal<Todo[]>([]);
  protected readonly tasksSignal = signal<Task[]>([]);
  protected readonly subtasksSignal = signal<Subtask[]>([]);
  protected readonly commentsSignal = signal<Comment[]>([]);
  protected readonly chatsSignal = signal<Chat[]>([]);
  protected readonly categoriesSignal = signal<Category[]>([]);
  protected readonly profileSignal = signal<Profile | null>(null);
  protected readonly profilesSignal = signal<Profile[]>([]);
  protected readonly allProfilesSignal = signal<Profile[]>([]);
  protected readonly userSignal = signal<User | null>(null);
  protected readonly usersSignal = signal<User[]>([]);
  protected readonly dailyActivitiesSignal = signal<any[]>([]);

  // ==================== DEPENDENCIES (lazy injection to avoid circular DI) ====================
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

  constructor() {
    super();
  }

  // ==================== MAP-BASED O(1) LOOKUPS ====================
  readonly todoMap = computed(() => new Map(this.allActiveTodos().map((t) => [t.id, t])));
  readonly taskMap = computed(() => new Map(this.activeTasks().map((t) => [t.id, t])));
  readonly subtaskMap = computed(() => new Map(this.activeSubtasks().map((s) => [s.id, s])));
  readonly commentMap = computed(() => new Map(this.activeComments().map((c) => [c.id, c])));

  // ==================== GROUPED LOOKUP MAPS ====================
  readonly tasksByTodoId = computed(() => {
    const map = new Map<string, Task[]>();
    for (const task of this.activeTasks()) {
      if (!map.has(task.todo_id)) map.set(task.todo_id, []);
      map.get(task.todo_id)!.push(task);
    }
    return map;
  });

  readonly subtasksByTaskId = computed(() => {
    const map = new Map<string, Subtask[]>();
    for (const subtask of this.activeSubtasks()) {
      if (!map.has(subtask.task_id)) map.set(subtask.task_id, []);
      map.get(subtask.task_id)!.push(subtask);
    }
    return map;
  });

  readonly commentsByTaskId = computed(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of this.activeComments()) {
      if (comment.task_id) {
        if (!map.has(comment.task_id)) map.set(comment.task_id, []);
        map.get(comment.task_id)!.push(comment);
      }
    }
    return map;
  });

  readonly commentsBySubtaskId = computed(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of this.activeComments()) {
      if (comment.subtask_id) {
        if (!map.has(comment.subtask_id)) map.set(comment.subtask_id, []);
        map.get(comment.subtask_id)!.push(comment);
      }
    }
    return map;
  });

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

  // ==================== TTL CACHE FOR REACTIVE COMPUTEDS ====================
  private readonly chatsCache = new Map<string, ReturnType<typeof computed<Chat[]>>>();
  private readonly tasksByTodoCache = new Map<string, ReturnType<typeof computed<Task[]>>>();
  private cacheTimestamps = new Map<string, number>();

  // ==================== ACTIVE/ARCHIVED COMPUTEDS ====================
  readonly activeTodos = computed(() => this.allActiveTodos().filter((t) => !t.deleted_at));

  readonly archivedTodos = computed(() =>
    [...this.privateTodosSignal(), ...this.sharedTodosSignal(), ...this.publicTodosSignal()].filter(
      (t) => t.deleted_at
    )
  );

  readonly activeTasks = computed(() => this.tasksSignal().filter((t) => !t.deleted_at));
  readonly archivedTasks = computed(() => this.tasksSignal().filter((t) => t.deleted_at));
  readonly activeSubtasks = computed(() => this.subtasksSignal().filter((s) => !s.deleted_at));
  readonly archivedSubtasks = computed(() => this.subtasksSignal().filter((s) => s.deleted_at));
  readonly activeComments = computed(() => this.commentsSignal().filter((c) => !c.deleted_at));

  // ==================== MERGED TODO COMPUTEDS ====================
  private readonly allActiveTodos = computed(() => {
    const allTodos = [
      ...this.privateTodosSignal(),
      ...this.sharedTodosSignal(),
      ...this.publicTodosSignal(),
    ];
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
    this.privateTodosSignal().filter((t) => !t.deleted_at)
  );

  private readonly sharedTodosComputed = computed(() =>
    this.sharedTodosSignal().filter((t) => !t.deleted_at)
  );

  private readonly publicTodosComputed = computed(() =>
    this.publicTodosSignal().filter((t) => !t.deleted_at)
  );

  // ==================== PUBLIC SIGNALS ====================
  readonly privateTodos = this.privateTodosComputed;
  readonly sharedTodos = this.sharedTodosComputed;
  readonly publicTodos = this.publicTodosComputed;
  readonly todos = this.allActiveTodos;
  readonly tasks = computed(() => this.activeTasks());
  readonly subtasks = computed(() => this.activeSubtasks());
  readonly comments = computed(() => this.activeComments());
  readonly categories = this.categoriesSignal.asReadonly();
  readonly profile = this.profileSignal.asReadonly();
  readonly profiles = this.profilesSignal.asReadonly();
  readonly allProfiles = this.allProfilesSignal.asReadonly();
  readonly chats = computed(() => this.chatsSignal().filter((c) => !c.deleted_at));
  readonly user = this.userSignal.asReadonly();
  readonly users = this.usersSignal.asReadonly();
  readonly dailyActivities = this.dailyActivitiesSignal.asReadonly();

  // ==================== SIGNAL MAP FOR ADMIN ====================
  readonly signalMap: StorageSignalMap = {
    todos: this.privateTodosSignal,
    tasks: this.tasksSignal,
    subtasks: this.subtasksSignal,
    comments: this.commentsSignal,
    chats: this.chatsSignal,
    categories: this.categoriesSignal,
    daily_activities: this.dailyActivitiesSignal,
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

  // ==================== ENTITY HANDLERS ====================
  private readonly handlers = {
    todos: new TodoHandler(this.privateTodosSignal, this.sharedTodosSignal, this.publicTodosSignal),
    tasks: new TaskHandler(this.tasksSignal),
    subtasks: new SubtaskHandler(this.subtasksSignal),
    categories: new CategoryHandler(this.categoriesSignal),
    profiles: new ProfileHandler(this.profileSignal),
    chats: new FlatChatHandler(this.chatsSignal),
    comments: new FlatCommentHandler(this.commentsSignal),
  };

  get handlersMap() {
    return this.handlers;
  }

  // ==================== CRUD OPERATIONS ====================
  addItem(type: StorageEntity, data: any, options?: { isPrivate?: boolean }): void {
    if (type === "users" || !data?.id) return;
    this.handlers[type]?.add(data);
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

      if (type === "todos") {
        const categoriesSignal = this.categoriesSignal;
        this.handlers[type]?.update(id, updates, {
          getCategoryById: (catId: string) => categoriesSignal().find((c) => c.id === catId),
        });
      } else if (type !== "users") {
        this.handlers[type]?.update(id, updates);
      }
    }
  }

  removeItem(type: StorageEntity, id: string, parentId?: string, isShared: boolean = false): void {
    if (type === "users") return;
    this.handlers[type]?.remove(id, parentId);
  }

  getById<T extends keyof EntityMap>(type: T, id: string): EntityMap[T] | undefined {
    if (type === "users") return undefined;
    const handler = this.handlers[type as keyof typeof this.handlers];
    return handler ? (handler.getById(id) as EntityMap[T] | undefined) : undefined;
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

  // ==================== PUBLIC GETTERS ====================
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
    this.subtasksSignal.update((existing) => {
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

  // ==================== CHAT OPERATIONS ====================
  getChatsByTodo(todo_id?: string): Chat[] {
    if (!todo_id) return [];
    return this.chats().filter((c) => c.todo_id === todo_id);
  }

  getChatsByTodoReactive(todo_id?: string): ReturnType<typeof computed<Chat[]>> {
    if (!todo_id) return computed(() => []);

    const now = Date.now();
    const cached = this.chatsCache.get(todo_id);
    const timestamp = this.cacheTimestamps.get(`chats_${todo_id}`);

    if (cached && timestamp && now - timestamp < TTL_CACHE_EXPIRY_MS) {
      return cached;
    }

    if (this.chatsCache.size >= MAX_CACHE_SIZE) {
      const sortedKeys = Array.from(this.cacheTimestamps.entries())
        .filter(([key]) => key.startsWith("chats_"))
        .sort((a, b) => a[1] - b[1])
        .slice(0, this.chatsCache.size - MAX_CACHE_SIZE + 1)
        .map(([key]) => key);
      for (const key of sortedKeys) {
        const todoId = key.replace("chats_", "");
        this.chatsCache.delete(todoId);
        this.cacheTimestamps.delete(key);
      }
    }

    const computedSignal = computed(() => {
      return this.chats().filter((chat) => chat.todo_id === todo_id);
    });

    this.chatsCache.set(todo_id, computedSignal);
    this.cacheTimestamps.set(`chats_${todo_id}`, now);
    return computedSignal;
  }

  getTasksByTodoReactive(todo_id?: string): ReturnType<typeof computed<Task[]>> {
    if (!todo_id) return computed(() => []);

    const now = Date.now();
    const cached = this.tasksByTodoCache.get(todo_id);
    const timestamp = this.cacheTimestamps.get(`tasks_${todo_id}`);

    if (cached && timestamp && now - timestamp < TTL_CACHE_EXPIRY_MS) {
      return cached;
    }

    if (this.tasksByTodoCache.size >= MAX_CACHE_SIZE) {
      const sortedKeys = Array.from(this.cacheTimestamps.entries())
        .filter(([key]) => key.startsWith("tasks_"))
        .sort((a, b) => a[1] - b[1])
        .slice(0, this.tasksByTodoCache.size - MAX_CACHE_SIZE + 1)
        .map(([key]) => key);
      for (const key of sortedKeys) {
        const todoId = key.replace("tasks_", "");
        this.tasksByTodoCache.delete(todoId);
        this.cacheTimestamps.delete(key);
      }
    }

    const computedSignal = computed(() => {
      return this.tasks().filter((task) => task.todo_id === todo_id);
    });

    this.tasksByTodoCache.set(todo_id, computedSignal);
    this.cacheTimestamps.set(`tasks_${todo_id}`, now);
    return computedSignal;
  }

  setChatsByTodo(chats: Chat[], todo_id?: string): void {
    if (!todo_id) return;
    this.chatsSignal.update((existing) => {
      const filtered = existing.filter((c) => c.todo_id !== todo_id);
      return [...filtered, ...chats];
    });
  }

  addChatToTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this.chatsSignal.update((chats) => {
      if (chats.some((c) => c.id === chat.id)) return chats;
      return [...chats, chat];
    });
  }

  updateChatInTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this.chatsSignal.update((chats) =>
      chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c))
    );
  }

  deleteChatFromTodo(chatId: string, todo_id?: string): void {
    if (!todo_id) return;
    this.chatsSignal.update((chats) =>
      chats.filter((c) => !(c.id === chatId && c.todo_id === todo_id))
    );
  }

  clearChatsByTodo(todo_id?: string): void {
    if (!todo_id) return;
    this.chatsSignal.update((chats) => chats.filter((c) => c.todo_id !== todo_id));
  }

  // ==================== TODO OPERATIONS ====================
  moveTodoToShared(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.getById("todos", todo_id);
    if (!todo) return;

    this.privateTodosSignal.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this.sharedTodosSignal().some((t) => t.id === todo_id)) {
      this.sharedTodosSignal.update((todos) => [
        { ...todo, visibility: "shared" },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  moveTodoToPrivate(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.getById("todos", todo_id);
    if (!todo) return;

    this.sharedTodosSignal.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this.privateTodosSignal().some((t) => t.id === todo_id)) {
      this.privateTodosSignal.update((todos) => [
        { ...todo, visibility: "private" },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  // ==================== CASCADE OPERATIONS ====================
  removeTodoWithCascade(todo_id?: string): void {
    if (!todo_id) return;
    const handler = this.handlers.todos as TodoHandler;
    const allTodos = [...this.privateTodosSignal(), ...this.sharedTodosSignal()];
    handler.removeWithCascade(todo_id, allTodos);

    this.removeTodoWithCascadeInternal(todo_id);
  }

  private removeTodoWithCascadeInternal(todo_id?: string): void {
    if (!todo_id) return;

    const { taskIds, subtaskIds } = this.cascadeService.computeCascadeForTodo(
      this.tasksSignal(),
      this.subtasksSignal(),
      todo_id
    );

    this.subtasksSignal.update((items) => items.filter((s) => !subtaskIds.includes(s.id)));
    this.tasksSignal.update((items) => items.filter((t) => t.todo_id !== todo_id));
    this.commentsSignal.update((items) =>
      items.filter((c) => {
        const isTodoComment = (c as any).todo_id === todo_id;
        const isTaskComment = c.task_id && taskIds.includes(c.task_id);
        const isSubtaskComment = c.subtask_id && subtaskIds.includes(c.subtask_id);
        return !isTodoComment && !isTaskComment && !isSubtaskComment;
      })
    );
    this.chatsSignal.update((items) => items.filter((c) => c.todo_id !== todo_id));
    this.privateTodosSignal.update((items) => items.filter((t) => t.id !== todo_id));
    this.sharedTodosSignal.update((items) => items.filter((t) => t.id !== todo_id));
    this.publicTodosSignal.update((items) => items.filter((t) => t.id !== todo_id));
  }

  removeRecordWithCascade(table: string, id: string, deletedAt?: string): void {
    if (table === "todos") {
      this.removeTodoWithCascadeInternal(id);
    } else if (table === "tasks") {
      const taskHandler = this.handlers.tasks;
      const task = this.getById("tasks", id);
      const todoId = task?.todo_id ?? null;
      if (deletedAt) {
        this.softDeleteTaskWithCascade(id, deletedAt, todoId ?? undefined);
      } else {
        this.softDeleteTaskInternal(id);
      }
    } else if (table === "subtasks") {
      const subtaskHandler = this.handlers.subtasks;
      const subtask = this.getById("subtasks", id);
      const taskId = subtask?.task_id ?? null;
      if (deletedAt) {
        this.softDeleteSubtaskWithCascade(id, deletedAt, taskId ?? undefined);
      } else {
        this.softDeleteSubtaskInternal(id);
      }
    } else if (table === "comments") {
      if (deletedAt) {
        this.handlers.comments?.update(id, { deleted_at: deletedAt });
      } else {
        this.handlers.comments?.remove(id);
      }
    } else if (table === "chats") {
      this.handlers.chats?.remove(id);
    } else if (table === "categories") {
      this.handlers.categories?.remove(id);
    }
  }

  private softDeleteTaskWithCascade(task_id: string, deletedAt: string, todoId?: string): void {
    const { subtaskIds } = this.cascadeService.computeCascadeForTask(
      this.subtasksSignal(),
      task_id
    );
    const timestamp = deletedAt;

    this.subtasksSignal.update((items) =>
      items.map((s) =>
        subtaskIds.includes(s.id) ? { ...s, deleted_at: timestamp, updated_at: timestamp } : s
      )
    );
    this.commentsSignal.update((items) =>
      items.map((c) =>
        c.task_id === task_id || (c.subtask_id && subtaskIds.includes(c.subtask_id))
          ? { ...c, deleted_at: timestamp, updated_at: timestamp }
          : c
      )
    );
    this.tasksSignal.update((items) =>
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
    this.subtasksSignal.update((items) =>
      items.map((s) =>
        s.id === subtask_id ? { ...s, deleted_at: timestamp, updated_at: timestamp } : s
      )
    );
    this.commentsSignal.update((items) =>
      items.map((c) =>
        c.subtask_id === subtask_id ? { ...c, deleted_at: timestamp, updated_at: timestamp } : c
      )
    );
  }

  private softDeleteTaskInternal(task_id: string): void {
    const timestamp = new Date().toISOString();
    const subtasks = this.getSubtasksByTaskId(task_id);

    this.tasksSignal.update((tasks) =>
      tasks.map((t) => (t.id === task_id ? { ...t, deleted_at: timestamp } : t))
    );

    for (const subtask of subtasks) {
      this.softDeleteSubtaskInternal(subtask.id);
    }
  }

  private softDeleteSubtaskInternal(subtask_id: string): void {
    const timestamp = new Date().toISOString();
    this.subtasksSignal.update((subtasks) =>
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
    this.privateTodosSignal.set([data.todo, ...this.privateTodosSignal()]);

    if (data.tasks?.length) {
      this.tasksSignal.set([...this.tasksSignal(), ...data.tasks]);
    }
    if (data.subtasks?.length) {
      this.subtasksSignal.set([...this.subtasksSignal(), ...data.subtasks]);
    }
    if (data.comments?.length) {
      this.commentsSignal.set([...this.commentsSignal(), ...data.comments]);
    }
    if (data.chats?.length) {
      this.chatsSignal.set([...this.chatsSignal(), ...data.chats]);
    }
  }

  restoreRecordWithCascade(table: string, id: string): void {
    const timestamp = new Date().toISOString();

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
        this.getChatsByTodo(id).map((c) => ({
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
    const timestamp = new Date().toISOString();

    if (table === "todos") {
      const { taskIds, subtaskIds } = this.cascadeService.computeCascadeForTodo(
        this.tasksSignal(),
        this.subtasksSignal(),
        id
      );

      this.tasksSignal.update((tasks) =>
        tasks.map((task) =>
          task.todo_id === id
            ? { ...task, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : task
        )
      );

      this.subtasksSignal.update((subtasks) =>
        subtasks.map((subtask) =>
          subtaskIds.includes(subtask.id)
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );

      this.commentsSignal.update((comments) =>
        comments.map((comment) => {
          const isRelated =
            (comment.task_id && taskIds.includes(comment.task_id)) ||
            (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
          return isRelated
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment;
        })
      );

      this.chatsSignal.update((chats) =>
        chats.map((chat) =>
          chat.todo_id === id
            ? { ...chat, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : chat
        )
      );

      this.privateTodosSignal.update((todos) =>
        todos.map((todo) =>
          todo.id === id
            ? { ...todo, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : todo
        )
      );
      this.sharedTodosSignal.update((todos) =>
        todos.map((todo) =>
          todo.id === id
            ? { ...todo, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : todo
        )
      );
      this.publicTodosSignal.update((todos) =>
        todos.map((todo) =>
          todo.id === id
            ? { ...todo, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : todo
        )
      );
    } else if (table === "tasks") {
      const { subtaskIds } = this.cascadeService.computeCascadeForTask(this.subtasksSignal(), id);

      this.subtasksSignal.update((subtasks) =>
        subtasks.map((subtask) =>
          subtaskIds.includes(subtask.id)
            ? { ...subtask, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : subtask
        )
      );

      this.commentsSignal.update((comments) =>
        comments.map((comment) => {
          const isRelated =
            comment.task_id === id ||
            (comment.subtask_id && subtaskIds.includes(comment.subtask_id));
          return isRelated
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment;
        })
      );

      this.tasksSignal.update((tasks) =>
        tasks.map((task) =>
          task.id === id
            ? { ...task, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : task
        )
      );
    } else if (table === "subtasks") {
      this.commentsSignal.update((comments) =>
        comments.map((comment) =>
          comment.subtask_id === id
            ? { ...comment, deleted_at: deletedAt ? timestamp : null, updated_at: timestamp }
            : comment
        )
      );

      this.subtasksSignal.update((subtasks) =>
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
      this.privateTodosSignal().length > 0 ||
      this.tasksSignal().length > 0 ||
      this.subtasksSignal().length > 0;

    if (!force && !hasAnyData) {
      force = true;
    }

    if (!force && this.isCacheValid(TTL_CACHE_EXPIRY_MS)) {
      return of(this.getAdminDataWithRelations());
    }

    if (this.loadingSignal()) {
      return of(this.getAdminDataWithRelations());
    }

    this.loadingSignal.set(true);

    return this.adminDataService.loadAllAdminData().pipe(
      tap((data: AdminDataWithRelations) => {
        this.privateTodosSignal.set(data["todos"] || []);
        this.tasksSignal.set(data["tasks"] || []);
        this.subtasksSignal.set(data["subtasks"] || []);
        this.commentsSignal.set(data["comments"] || []);
        this.chatsSignal.set(data["chats"] || []);
        this.categoriesSignal.set(data["categories"] || []);
        this.dailyActivitiesSignal.set(data["daily_activities"] || []);

        this.extractUsersAndProfiles(data);

        this.loadingSignal.set(false);
        this.loadedSignal.set(true);
        this.lastLoadedSignal.set(new Date());
      }),
      catchError((err) => {
        this.loadingSignal.set(false);
        return of(this.getAdminDataWithRelations());
      }),
      map(() => this.getAdminDataWithRelations())
    );
  }

  private getAdminDataWithRelations(): AdminDataWithRelations {
    return {
      todos: this.privateTodosSignal(),
      tasks: this.tasksSignal(),
      subtasks: this.subtasksSignal(),
      comments: this.commentsSignal(),
      chats: this.chatsSignal(),
      categories: this.categoriesSignal(),
      daily_activities: this.dailyActivitiesSignal(),
      users: this.usersSignal(),
      profiles: this.profilesSignal(),
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

    this.usersSignal.set(Array.from(usersMap.values()));
    this.profilesSignal.set(Array.from(profilesMap.values()));
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
      this.tasksSignal.update((tasks) =>
        tasks.map((task) => (task.todo_id === parentId ? { ...task, ...updates } : task))
      );
    } else if (parentTable === "tasks") {
      this.subtasksSignal.update((subtasks) =>
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
      this.tasksSignal.update((tasks) => tasks.filter((task) => task.todo_id !== id));
    } else if (table === "tasks") {
      this.subtasksSignal.update((subtasks) =>
        subtasks.filter((subtask) => subtask.task_id !== id)
      );
    }
  }

  updateRecordDeleteStatus(table: string, id: string, deletedAt: boolean): void {
    const timestamp = new Date().toISOString();
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
    const handler = this.handlers.comments;
    handler.add({ ...comment, task_id: task_id });
  }

  addCommentToSubtask(comment: Comment, subtask_id?: string): void {
    if (!subtask_id) return;
    const handler = this.handlers.comments;
    handler.add({ ...comment, subtask_id: subtask_id });
  }

  removeCommentFromAll(commentId: string): void {
    this.handlers.comments?.remove(commentId);
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
    const chats = this.getChatsByTodo(todoId).filter((c: Chat) => !c.deleted_at);
    return chats.filter((c: Chat) => !c.read_by || !c.read_by.includes(userId)).length;
  }

  getUsername(userId: string): string {
    const user = this.users().find((u) => u.id === userId);
    const userAny = user as any;
    if (userAny?.profile?.name) {
      return `${userAny.profile.name} ${userAny.profile.last_name || ""}`.trim();
    }
    const profile = this.profiles().find((p) => p.user_id === userId);
    if (profile?.name) {
      return `${profile.name} ${profile.last_name || ""}`.trim();
    }
    if (user?.username) return user.username;
    return "Unknown";
  }

  getTodoReactive(todo_id?: string): ReturnType<typeof computed<Todo | undefined>> {
    return computed(() => {
      if (!todo_id) return undefined;
      return this.todos().find((t) => t.id === todo_id);
    });
  }

  getTaskReactive(task_id?: string): ReturnType<typeof computed<Task | undefined>> {
    return computed(() => {
      if (!task_id) return undefined;
      return this.tasks().find((t) => t.id === task_id);
    });
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
      | "dailyActivities",
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
        this.categoriesSignal.set(items as Category[]);
        break;
      case "profiles":
        this.profileSignal.set(items as Profile | null);
        if (items && typeof items === "object" && "user" in items && (items as Profile).user) {
          this.userSignal.set((items as Profile).user || null);
        }
        break;
      case "tasks":
        if (options?.append) {
          this.tasksSignal.update((existing) => [...existing, ...(items as Task[])]);
        } else {
          this.tasksSignal.set(items as Task[]);
        }
        if (options?.resetPagination) {
          this.resetPagination("tasks");
        }
        break;
      case "subtasks":
        if (options?.append) {
          this.subtasksSignal.update((existing) => [...existing, ...(items as Subtask[])]);
        } else {
          this.subtasksSignal.set(items as Subtask[]);
        }
        if (options?.resetPagination) {
          this.resetPagination("subtasks");
        }
        break;
      case "comments":
        if (options?.append) {
          this.commentsSignal.update((existing) => [...existing, ...(items as Comment[])]);
        } else {
          this.commentsSignal.set(items as Comment[]);
        }
        if (options?.resetPagination) {
          this.resetPagination("comments");
        }
        break;
      case "chats":
        if (options?.append) {
          this.chatsSignal.update((existing) => [...existing, ...(items as Chat[])]);
        } else {
          this.chatsSignal.set(items as Chat[]);
        }
        if (options?.resetPagination) {
          this.resetPagination("chats");
        }
        break;
      case "privateTodos":
        this.privateTodosSignal.set(items as Todo[]);
        if (options?.resetPagination) {
          this.resetPagination("todos");
        }
        break;
      case "sharedTodos":
        this.sharedTodosSignal.set(items as Todo[]);
        if (options?.resetPagination) {
          this.resetPagination("todos");
        }
        break;
      case "publicTodos":
        this.publicTodosSignal.set(items as Todo[]);
        if (options?.resetPagination) {
          this.resetPagination("todos");
        }
        break;
      case "allProfiles":
        this.allProfilesSignal.set(items as Profile[]);
        break;
      case "user":
        this.userSignal.set(items as User | null);
        break;
      case "users":
        this.usersSignal.set(items as User[]);
        break;
      case "dailyActivities":
        this.dailyActivitiesSignal.set(items as any[]);
        break;
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
    this.privateTodosSignal.set([]);
    this.sharedTodosSignal.set([]);
    this.publicTodosSignal.set([]);
    this.tasksSignal.set([]);
    this.subtasksSignal.set([]);
    this.commentsSignal.set([]);
    this.chatsSignal.set([]);
    this.categoriesSignal.set([]);
    this.profileSignal.set(null);
    this.profilesSignal.set([]);
    this.allProfilesSignal.set([]);
    this.userSignal.set(null);
    this.usersSignal.set([]);
    this.dailyActivitiesSignal.set([]);
    this.loadedSignal.set(false);
    this.lastLoadedSignal.set(null);
    this.chatsCache.clear();
    this.tasksByTodoCache.clear();
    this.cacheTimestamps.clear();
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
}
