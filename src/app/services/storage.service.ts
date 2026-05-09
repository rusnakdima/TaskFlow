/* sys lib */
import { Injectable, inject, signal, computed, WritableSignal, Injector } from "@angular/core";
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
import {
  EntityType,
  VisibilityFilter,
  Operation,
  ChatOperation,
  ParentType,
  ChildType,
  PaginationState,
} from "@models/storage.model";

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
  addEntityToSignal,
  createGroupedMap,
  groupByKey,
  deduplicateById,
  upsertEntityBulk,
} from "@stores/utils/store-helpers";
import { TimestampHelper, VisibilityHelper, DEFAULT_CACHE_TTL_MS } from "@helpers/index";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 100;
const DEFAULT_PAGINATION: PaginationState = { skip: 0, limit: 20, hasMore: true };

// ==================== ENTITY SIGNAL REGISTRY ====================
interface SignalBundle {
  todos: WritableSignal<Todo[]>;
  tasks: WritableSignal<Task[]>;
  subtasks: WritableSignal<Subtask[]>;
  comments: WritableSignal<Comment[]>;
  chats: WritableSignal<Chat[]>;
  categories: WritableSignal<Category[]>;
  profiles: WritableSignal<Profile | null>;
  users: WritableSignal<User[]>;
}

@Injectable({ providedIn: "root" })
export class StorageService {
  private _notifyService: NotifyService | null = null;
  private _adminService: AdminService | null = null;
  private _adminDataService: AdminDataService | null = null;
  private _cascadeService: CascadeService | null = null;
  private _injector = inject(Injector);

  // ==================== SIGNAL REGISTRY ====================
  private readonly _signals: SignalBundle = {
    todos: signal<Todo[]>([]),
    tasks: signal<Task[]>([]),
    subtasks: signal<Subtask[]>([]),
    comments: signal<Comment[]>([]),
    chats: signal<Chat[]>([]),
    categories: signal<Category[]>([]),
    profiles: signal<Profile | null>(null),
    users: signal<User[]>([]),
  };

  // Separate todo visibility signals
  private readonly _privateTodos = signal<Todo[]>([]);
  private readonly _sharedTodos = signal<Todo[]>([]);
  private readonly _publicTodos = signal<Todo[]>([]);

  // Other state signals
  private readonly _allProfiles = signal<Profile[]>([]);
  private readonly _user = signal<User | null>(null);
  private readonly _dailyActivities = signal<any[]>([]);
  private readonly _cacheInvalidated = signal(false);
  private readonly _loaded = signal(false);
  private readonly _loading = signal(false);
  private readonly _lastLoaded = signal<Date | null>(null);

  // Pagination signals
  private readonly _pagination = signal<Record<ChildType, PaginationState>>({
    todos: { ...DEFAULT_PAGINATION },
    tasks: { ...DEFAULT_PAGINATION },
    subtasks: { ...DEFAULT_PAGINATION },
    comments: { ...DEFAULT_PAGINATION },
    chats: { ...DEFAULT_PAGINATION },
  });

  // Computed caches
  private readonly _reactiveCache = new Map<string, ReturnType<typeof computed<any>>>();
  private readonly _chatCache = new Map<string, ReturnType<typeof computed<Chat[]>>>();
  private readonly _tasksCache = new Map<string, ReturnType<typeof computed<Task[]>>>();
  private readonly _cacheTimestamps = new Map<string, number>();

  // ==================== COMPUTED SIGNALS ====================
  private readonly allActiveTodos = computed(() => {
    const allTodos = [...this._privateTodos(), ...this._sharedTodos(), ...this._publicTodos()];
    return deduplicateById(allTodos, { filterDeleted: true });
  });

  private readonly activeTasks = computed(() => this._signals.tasks().filter((t) => !t.deleted_at));
  private readonly activeSubtasks = computed(() =>
    this._signals.subtasks().filter((s) => !s.deleted_at)
  );
  private readonly activeComments = computed(() =>
    this._signals.comments().filter((c) => !c.deleted_at)
  );
  private readonly activeChats = computed(() => this._signals.chats().filter((c) => !c.deleted_at));

  readonly privateTodos = computed(() => this._privateTodos().filter((t) => !t.deleted_at));
  readonly sharedTodos = computed(() => this._sharedTodos().filter((t) => !t.deleted_at));
  readonly publicTodos = computed(() => this._publicTodos().filter((t) => !t.deleted_at));
  readonly todos = computed(() => this.allActiveTodos());
  readonly tasks = computed(() => this.activeTasks());
  readonly subtasks = computed(() => this.activeSubtasks());
  readonly comments = computed(() => this.activeComments());
  readonly chats = computed(() => this.activeChats());
  readonly categories = this._signals.categories.asReadonly();
  readonly profile = this._signals.profiles.asReadonly();
  readonly profiles = this._signals.profiles.asReadonly();
  readonly allProfiles = this._allProfiles.asReadonly();
  readonly user = this._user.asReadonly();
  readonly users = this._signals.users.asReadonly();
  readonly dailyActivities = this._dailyActivities.asReadonly();
  readonly archivedTodos = computed(() =>
    [...this._privateTodos(), ...this._sharedTodos(), ...this._publicTodos()].filter(
      (t) => t.deleted_at
    )
  );
  readonly archivedTasks = computed(() => this._signals.tasks().filter((t) => t.deleted_at));
  readonly archivedSubtasks = computed(() => this._signals.subtasks().filter((s) => s.deleted_at));
  readonly cacheInvalidated = this._cacheInvalidated.asReadonly();
  readonly subtasksGroupedByTask = computed(() =>
    groupByKey(this._signals.subtasks(), (s) => s.task_id)
  );
  readonly isLoading = this._loading.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly lastLoaded = this._lastLoaded.asReadonly();

  // ==================== LOOKUP MAPS ====================
  readonly todoMap = computed(() => new Map(this.allActiveTodos().map((t) => [t.id, t])));
  readonly taskMap = computed(() => new Map(this.activeTasks().map((t) => [t.id, t])));
  readonly subtaskMap = computed(() => new Map(this.activeSubtasks().map((s) => [s.id, s])));
  readonly commentMap = computed(() => new Map(this.activeComments().map((c) => [c.id, c])));
  readonly tasksByTodoId = computed(() => createGroupedMap(this.activeTasks(), (t) => t.todo_id));
  readonly subtasksByTaskId = computed(() =>
    createGroupedMap(this.activeSubtasks(), (s) => s.task_id)
  );
  readonly commentsByTaskId = computed(() =>
    createGroupedMap(
      this.activeComments(),
      (c) => c.task_id,
      (c) => !!c.task_id
    )
  );
  readonly commentsBySubtaskId = computed(() =>
    createGroupedMap(
      this.activeComments(),
      (c) => c.subtask_id,
      (c) => !!c.subtask_id
    )
  );
  readonly chatsByTodoId = computed(() =>
    createGroupedMap(
      this.activeChats(),
      (c) => c.todo_id,
      (c) => !!c.todo_id
    )
  );

  // ==================== PAGINATION GETTERS ====================
  get todosPagination() {
    return this._pagination().todos;
  }
  get tasksPagination() {
    return this._pagination().tasks;
  }
  get subtasksPagination() {
    return this._pagination().subtasks;
  }
  get commentsPagination() {
    return this._pagination().comments;
  }
  get chatsPagination() {
    return this._pagination().chats;
  }
  get hasMoreTodos(): boolean {
    return this._pagination().tasks.hasMore;
  }
  get hasMoreTasks(): boolean {
    return this._pagination().tasks.hasMore;
  }
  get hasMoreSubtasks(): boolean {
    return this._pagination().subtasks.hasMore;
  }
  get hasMoreComments(): boolean {
    return this._pagination().comments.hasMore;
  }
  get hasMoreChats(): boolean {
    return this._pagination().chats.hasMore;
  }
  get pendingTasksCount(): number {
    return this._signals.tasks().filter((t) => t.status === TaskStatus.PENDING).length;
  }

  get signalMap(): StorageSignalMap {
    return {
      todos: this._signals.todos,
      tasks: this._signals.tasks,
      subtasks: this._signals.subtasks,
      comments: this._signals.comments,
      chats: this._signals.chats,
      categories: this._signals.categories,
      daily_activities: this._dailyActivities,
    };
  }

  // ==================== SERVICE GETTERS ====================
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

  // ==================== GENERIC GET ====================
  get(type: EntityType, id: string): any | undefined {
    if (type === "users" || type === "profiles") return undefined;
    const signal = this.getSignal(type);
    return signal().find((e: any) => e.id === id);
  }

  private getSignal(type: EntityType): WritableSignal<any[]> {
    switch (type) {
      case "todos":
        return this._signals.todos;
      case "tasks":
        return this._signals.tasks;
      case "subtasks":
        return this._signals.subtasks;
      case "comments":
        return this._signals.comments;
      case "chats":
        return this._signals.chats;
      case "categories":
        return this._signals.categories;
      case "users":
        return this._signals.users;
      default:
        return this._signals.tasks;
    }
  }

  // ==================== GENERIC GET CHILDREN ====================
  getChildren(parentType: ParentType, parentId: string): Task[] | Subtask[] | Chat[] {
    switch (parentType) {
      case "tasks":
        return this.tasksByTodoId().get(parentId) || [];
      case "subtasks":
        return this.subtasksByTaskId().get(parentId) || [];
      case "chats":
        return this.chatsByTodoId().get(parentId) || [];
    }
  }

  // ==================== GENERIC QUERY ====================
  query(
    type: EntityType,
    filters?: {
      visibility?: VisibilityFilter;
      todoId?: string;
      taskId?: string;
      subtaskId?: string;
    }
  ): any[] {
    switch (type) {
      case "todos":
        if (!filters?.visibility || filters.visibility === "all") return this.todos();
        if (filters.visibility === "private") return this.privateTodos();
        if (filters.visibility === "shared") return this.sharedTodos();
        return this.publicTodos();
      case "tasks":
        return filters?.todoId ? this.tasksByTodoId().get(filters.todoId) || [] : this.tasks();
      case "subtasks":
        return filters?.taskId
          ? this.subtasksByTaskId().get(filters.taskId) || []
          : this.subtasks();
      case "comments":
        if (filters?.taskId) return this.commentsByTaskId().get(filters.taskId) || [];
        if (filters?.subtaskId) return this.commentsBySubtaskId().get(filters.subtaskId) || [];
        return this.comments();
      case "chats":
        return filters?.todoId ? this.chatsByTodoId().get(filters.todoId) || [] : this.chats();
      default:
        return this.getSignal(type)() || [];
    }
  }

  // ==================== GENERIC WATCH ====================
  watch(
    type: "todos" | "tasks" | "subtasks" | "comments" | "chats",
    id?: string
  ): ReturnType<typeof computed<any>> {
    if (!id) return computed(() => undefined);
    const cacheKey = `${type}_${id}`;
    if (this._reactiveCache.has(cacheKey)) return this._reactiveCache.get(cacheKey)!;
    const computedSignal = computed(() => this.query(type).find((e: any) => e.id === id));
    this._reactiveCache.set(cacheKey, computedSignal);
    return computedSignal;
  }

  watchByTodo(
    todoId: string,
    type: "tasks" | "chats"
  ): ReturnType<typeof computed<Task[] | Chat[]>> {
    if (!todoId) return computed(() => []);
    const cacheKey = `${type}_by_todo_${todoId}`;
    if (this._chatCache.has(cacheKey) && type === "chats") return this._chatCache.get(cacheKey)!;
    if (this._tasksCache.has(cacheKey) && type === "tasks") return this._tasksCache.get(cacheKey)!;
    const now = Date.now();
    const timestamp = this._cacheTimestamps.get(cacheKey);
    if (timestamp && now - timestamp < DEFAULT_CACHE_TTL_MS) {
      return type === "chats" ? this._chatCache.get(cacheKey)! : this._tasksCache.get(cacheKey)!;
    }
    if (this._chatCache.size >= MAX_CACHE_SIZE || this._tasksCache.size >= MAX_CACHE_SIZE) {
      this.evictOldestCache();
    }
    const computedSignal = computed(() => this.query(type, { todoId: todoId! }));
    if (type === "chats") {
      this._chatCache.set(todoId, computedSignal);
    } else {
      this._tasksCache.set(todoId, computedSignal);
    }
    this._cacheTimestamps.set(cacheKey, now);
    return computedSignal;
  }

  private evictOldestCache(): void {
    const sortedKeys = Array.from(this._cacheTimestamps.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, 10)
      .map(([key]) => key);
    for (const key of sortedKeys) {
      const id = key.replace(/^(tasks|chats)_by_todo_/, "");
      this._chatCache.delete(id);
      this._tasksCache.delete(id);
      this._cacheTimestamps.delete(key);
    }
  }

  // ==================== GENERIC MODIFY ====================
  modify(type: EntityType, op: "create" | "update" | "delete", data: any): void {
    if (type === "users") return;
    switch (op) {
      case "create":
        this.addEntity(type, data);
        break;
      case "update":
        this.updateEntity(type, data);
        break;
      case "delete":
        this.removeEntity(type, data.id);
        break;
    }
  }

  private addEntity(type: EntityType, data: any): void {
    if (!data?.id) return;
    if (type === "profiles") {
      this._signals.profiles.set(data);
      return;
    }
    if (type === "todos") {
      const visibility = data.visibility || "shared";
      const target =
        visibility === "private"
          ? this._privateTodos
          : visibility === "public"
            ? this._publicTodos
            : this._sharedTodos;
      addEntityToSignal(target, data);
    } else {
      addEntityToSignal(this.getSignal(type) as WritableSignal<any[]>, data);
    }
  }

  private updateEntity(type: EntityType, data: any): void {
    if (!data?.id) return;
    if (type === "profiles") {
      const current = this._signals.profiles();
      if (current?.id === data.id) this._signals.profiles.set({ ...current, ...data });
      return;
    }
    if (type === "todos") {
      updateEntityInSignal(this._privateTodos, data.id, data);
      updateEntityInSignal(this._sharedTodos, data.id, data);
      updateEntityInSignal(this._publicTodos, data.id, data);
    } else {
      updateEntityInSignal(this.getSignal(type) as WritableSignal<any[]>, data.id, data);
    }
  }

  private removeEntity(type: EntityType, id: string): void {
    if (type === "profiles") {
      const current = this._signals.profiles();
      if (current?.id === id) this._signals.profiles.set(null);
      return;
    }
    if (type === "todos") {
      removeEntityFromSignal(this._privateTodos, id);
      removeEntityFromSignal(this._sharedTodos, id);
      removeEntityFromSignal(this._publicTodos, id);
    } else {
      removeEntityFromSignal(this.getSignal(type) as WritableSignal<any[]>, id);
    }
  }

  // ==================== CHAT OPERATIONS ====================
  updateChat(todoId: string, op: ChatOperation, data?: Chat): void {
    if (!todoId) return;
    switch (op) {
      case "set":
        this._signals.chats.update((chats) => [
          ...chats.filter((c) => c.todo_id !== todoId),
          ...(data ? [data] : []),
        ]);
        break;
      case "add":
        if (data)
          this._signals.chats.update((chats) =>
            chats.some((c) => c.id === data.id) ? chats : [...chats, data]
          );
        break;
      case "update":
        if (data)
          this._signals.chats.update((chats) =>
            chats.map((c) => (c.id === data.id ? { ...c, ...data } : c))
          );
        break;
      case "delete":
        if (data)
          this._signals.chats.update((chats) =>
            chats.filter((c) => !(c.id === data.id && c.todo_id === todoId))
          );
        break;
      case "clear":
        this._signals.chats.update((chats) => chats.filter((c) => c.todo_id !== todoId));
        break;
    }
  }

  // Legacy chat methods
  setChatsByTodo(chats: Chat[], todo_id?: string) {
    this.updateChat(todo_id!, "set", chats[0]);
  }
  addChatToTodo(chat: Chat, todo_id?: string) {
    this.updateChat(todo_id!, "add", chat);
  }
  updateChatInTodo(chat: Chat, todo_id?: string) {
    this.updateChat(todo_id!, "update", chat);
  }
  deleteChatFromTodo(chatId: string, todo_id?: string) {
    this.updateChat(todo_id!, "delete", { id: chatId } as Chat);
  }
  clearChatsByTodo(todo_id?: string) {
    this.updateChat(todo_id!, "clear");
  }

  // ==================== BULK OPERATIONS ====================
  bulkUpsertSubtasks(subtasks: Subtask[]): void {
    this._signals.subtasks.update((existing) => {
      const map = new Map(existing.map((s) => [s.id, s]));
      subtasks.forEach((s) => map.set(s.id, { ...map.get(s.id), ...s }));
      return Array.from(map.values());
    });
  }

  // ==================== TODO VISIBILITY OPERATIONS ====================
  moveTodoToShared(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.get("todos", todo_id);
    if (!todo) return;
    this._privateTodos.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this._sharedTodos().some((t) => t.id === todo_id)) {
      this._sharedTodos.update((todos) => [
        { ...todo, visibility: "shared" as const },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  moveTodoToPrivate(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.get("todos", todo_id);
    if (!todo) return;
    this._sharedTodos.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this._privateTodos().some((t) => t.id === todo_id)) {
      this._privateTodos.update((todos) => [
        { ...todo, visibility: "private" as const },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  // ==================== CASCADE OPERATIONS ====================
  removeTodoWithCascade(todo_id?: string): void {
    if (!todo_id) return;
    const { taskIds = [], subtaskIds = [] } = this.cascadeService.computeCascadeForTodo(
      this._signals.tasks(),
      this._signals.subtasks(),
      todo_id
    );
    this._signals.subtasks.update((items) => items.filter((s) => !subtaskIds?.includes(s.id)));
    this._signals.tasks.update((items) => items.filter((t) => t.todo_id !== todo_id));
    this._signals.comments.update((items) =>
      items.filter((c) => {
        const isTodoComment = (c as any).todo_id === todo_id;
        const isTaskComment = c.task_id && (taskIds?.includes(c.task_id) ?? false);
        const isSubtaskComment = c.subtask_id && (subtaskIds?.includes(c.subtask_id) ?? false);
        return !isTodoComment && !isTaskComment && !isSubtaskComment;
      })
    );
    this._signals.chats.update((items) => items.filter((c) => c.todo_id !== todo_id));
    this._privateTodos.update((items) => items.filter((t) => t.id !== todo_id));
    this._sharedTodos.update((items) => items.filter((t) => t.id !== todo_id));
    this._publicTodos.update((items) => items.filter((t) => t.id !== todo_id));
  }

  removeRecordWithCascade(table: string, id: string, deletedAt?: string): void {
    if (table === "todos") {
      this.removeTodoWithCascade(id);
      return;
    }
    if (table === "tasks") {
      const task = this.get("tasks", id);
      if (deletedAt) this.softDeleteWithCascade("tasks", id, task?.todo_id, deletedAt);
      else this.softDelete("tasks", id);
    } else if (table === "subtasks") {
      const subtask = this.get("subtasks", id);
      if (deletedAt) this.softDeleteWithCascade("subtasks", id, subtask?.task_id, deletedAt);
      else this.softDelete("subtasks", id);
    } else if (table === "comments") {
      if (deletedAt) this.updateEntity("comments", { id, deleted_at: deletedAt });
      else this.removeEntity("comments", id);
    } else if (table === "chats" || table === "categories") {
      this.removeEntity(table as EntityType, id);
    }
  }

  private softDeleteWithCascade(
    table: "tasks" | "subtasks",
    id: string,
    _parentId: string | undefined,
    deletedAt: string
  ): void {
    const timestamp = deletedAt;
    if (table === "tasks") {
      const { subtaskIds = [] } = this.cascadeService.computeCascadeForTask(
        this._signals.subtasks(),
        id
      );
      this._signals.subtasks.update((items) =>
        items.map((s) =>
          (subtaskIds?.includes(s.id) ?? false)
            ? { ...s, deleted_at: timestamp, updated_at: timestamp }
            : s
        )
      );
      this._signals.comments.update((items) =>
        items.map((c) =>
          c.task_id === id || (c.subtask_id && (subtaskIds?.includes(c.subtask_id) ?? false))
            ? { ...c, deleted_at: timestamp, updated_at: timestamp }
            : c
        )
      );
      this._signals.tasks.update((items) =>
        items.map((t) => (t.id === id ? { ...t, deleted_at: timestamp, updated_at: timestamp } : t))
      );
    } else {
      this._signals.subtasks.update((items) =>
        items.map((s) => (s.id === id ? { ...s, deleted_at: timestamp, updated_at: timestamp } : s))
      );
      this._signals.comments.update((items) =>
        items.map((c) =>
          c.subtask_id === id ? { ...c, deleted_at: timestamp, updated_at: timestamp } : c
        )
      );
    }
  }

  private softDelete(table: "tasks" | "subtasks", id: string): void {
    const timestamp = TimestampHelper.createTimestamp();
    if (table === "tasks") {
      const subtasks = this._signals.subtasks().filter((s) => s.task_id === id);
      this._signals.tasks.update((tasks) =>
        tasks.map((t) => (t.id === id ? { ...t, deleted_at: timestamp } : t))
      );
      subtasks.forEach((s) => this.softDelete("subtasks", s.id));
    } else {
      this._signals.subtasks.update((subtasks) =>
        subtasks.map((s) => (s.id === id ? { ...s, deleted_at: timestamp } : s))
      );
    }
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
    if (data.tasks?.length) this._signals.tasks.update((t) => [...t, ...data.tasks]);
    if (data.subtasks?.length) this._signals.subtasks.update((s) => [...s, ...data.subtasks]);
    if (data.comments?.length) this._signals.comments.update((c) => [...c, ...data.comments]);
    if (data.chats?.length) this._signals.chats.update((c) => [...c, ...(data.chats || [])]);
  }

  restoreRecordWithCascade(table: string, id: string): void {
    const timestamp = TimestampHelper.createTimestamp();
    const updateData = { deleted_at: null, updated_at: timestamp };
    if (table === "todos") {
      this.updateEntity("todos", { id, ...updateData });
      const relatedTasks = this._signals.tasks().filter((t) => t.todo_id === id);
      const relatedSubtasks = this._signals
        .subtasks()
        .filter((s) => relatedTasks.some((t) => t.id === s.task_id));
      const relatedChats = this._signals.chats().filter((c) => c.todo_id === id);
      relatedTasks.forEach((t) => this.updateEntity("tasks", { id: t.id, ...updateData }));
      relatedSubtasks.forEach((s) => this.updateEntity("subtasks", { id: s.id, ...updateData }));
      relatedChats.forEach((c) => this.updateEntity("chats", { id: c.id, ...updateData }));
    } else if (table === "tasks") {
      this.updateEntity("tasks", { id, ...updateData });
      this._signals
        .subtasks()
        .filter((s) => s.task_id === id)
        .forEach((s) => this.updateEntity("subtasks", { id: s.id, ...updateData }));
    } else if (table === "subtasks") {
      this.updateEntity("subtasks", { id, ...updateData });
    } else if (["comments", "chats", "categories"].includes(table)) {
      this.updateEntity(table as EntityType, { id, ...updateData });
    }
  }

  updateRecordDeleteStatusWithCascade(table: string, id: string, deletedAt: boolean): void {
    const timestamp = TimestampHelper.createTimestamp();
    const update = { deleted_at: deletedAt ? timestamp : null, updated_at: timestamp };
    if (table === "todos") {
      const { taskIds = [], subtaskIds = [] } = this.cascadeService.computeCascadeForTodo(
        this._signals.tasks(),
        this._signals.subtasks(),
        id
      );
      this._signals.tasks.update((tasks) =>
        tasks.map((t) => (t.todo_id === id ? { ...t, ...update } : t))
      );
      this._signals.subtasks.update((subtasks) =>
        subtasks.map((s) => ((subtaskIds?.includes(s.id) ?? false) ? { ...s, ...update } : s))
      );
      this._signals.comments.update((comments) =>
        comments.map((c) => {
          const isRelated =
            (c.task_id && (taskIds?.includes(c.task_id) ?? false)) ||
            (c.subtask_id && (subtaskIds?.includes(c.subtask_id) ?? false));
          return isRelated ? { ...c, ...update } : c;
        })
      );
      this._signals.chats.update((chats) =>
        chats.map((c) => (c.todo_id === id ? { ...c, ...update } : c))
      );
      [this._privateTodos, this._sharedTodos, this._publicTodos].forEach((signal) =>
        signal.update((todos) => todos.map((t) => (t.id === id ? { ...t, ...update } : t)))
      );
    } else if (table === "tasks") {
      const { subtaskIds = [] } = this.cascadeService.computeCascadeForTask(
        this._signals.subtasks(),
        id
      );
      this._signals.subtasks.update((subtasks) =>
        subtasks.map((s) => ((subtaskIds?.includes(s.id) ?? false) ? { ...s, ...update } : s))
      );
      this._signals.comments.update((comments) =>
        comments.map((c) => {
          const isRelated =
            c.task_id === id || (c.subtask_id && (subtaskIds?.includes(c.subtask_id) ?? false));
          return isRelated ? { ...c, ...update } : c;
        })
      );
      this._signals.tasks.update((tasks) =>
        tasks.map((t) => (t.id === id ? { ...t, ...update } : t))
      );
    } else if (table === "subtasks") {
      this._signals.comments.update((comments) =>
        comments.map((c) => (c.subtask_id === id ? { ...c, ...update } : c))
      );
      this._signals.subtasks.update((subtasks) =>
        subtasks.map((s) => (s.id === id ? { ...s, ...update } : s))
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
          } else subscriber.error(new Error(response.message || "Failed to load data"));
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
          } else subscriber.error(new Error(response.message || "Failed to load more data"));
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  loadAdminData(force: boolean = false): Observable<AdminDataWithRelations> {
    const hasAnyData =
      this._privateTodos().length > 0 ||
      this._signals.tasks().length > 0 ||
      this._signals.subtasks().length > 0;
    if (!force && !hasAnyData) force = true;
    if (!force && this.isCacheValid(DEFAULT_TTL_MS)) return of(this.getAdminDataWithRelations());
    if (this._loading()) return of(this.getAdminDataWithRelations());
    this._loading.set(true);
    return this.adminDataService.loadAllAdminData().pipe(
      tap((data: AdminDataWithRelations) => {
        this._privateTodos.set(data["todos"] || []);
        this._signals.tasks.set(data["tasks"] || []);
        this._signals.subtasks.set(data["subtasks"] || []);
        this._signals.comments.set(data["comments"] || []);
        this._signals.chats.set(data["chats"] || []);
        this._signals.categories.set(data["categories"] || []);
        this._dailyActivities.set(data["daily_activities"] || []);
        this.extractUsersAndProfiles(data);
        this._loading.set(false);
        this._loaded.set(true);
        this._lastLoaded.set(new Date());
      }),
      catchError((_err) => {
        this._loading.set(false);
        return of(this.getAdminDataWithRelations());
      }),
      map(() => this.getAdminDataWithRelations())
    );
  }

  private getAdminDataWithRelations(): AdminDataWithRelations {
    return {
      todos: this._privateTodos(),
      tasks: this._signals.tasks(),
      subtasks: this._signals.subtasks(),
      comments: this._signals.comments(),
      chats: this._signals.chats(),
      categories: this._signals.categories(),
      daily_activities: this._dailyActivities(),
      users: this._signals.users(),
      profiles: this._signals.profiles() ? [this._signals.profiles()!] : [],
    };
  }

  private extractUsersAndProfiles(data: AdminDataWithRelations): void {
    const usersMap = new Map<string, User>();
    const profilesMap = new Map<string, Profile>();
    const extract = (entity: any) => {
      if (!entity?.user) return;
      usersMap.set(entity.user.id, entity.user);
      if (entity.user.profile) profilesMap.set(entity.user.profile.id, entity.user.profile);
    };
    data["todos"]?.forEach((todo: any) => {
      extract(todo);
      todo.categories?.forEach(extract);
    });
    data["tasks"]?.forEach((task: any) => {
      if (task.todo) extract(task.todo);
    });
    data["subtasks"]?.forEach((subtask: any) => {
      if (subtask.task?.todo) extract(subtask.task.todo);
      if (subtask.task) extract(subtask.task);
    });
    data["categories"]?.forEach(extract);
    data["comments"]?.forEach(extract);
    data["chats"]?.forEach(extract);
    this._signals.users.set(Array.from(usersMap.values()));
    this._signals.profiles.set(Object.fromEntries(profilesMap) as unknown as Profile);
  }

  // ==================== RECORD OPERATIONS ====================
  updateRecord(table: string, id: string, updates: any): void {
    const sig = this.signalMap[table];
    if (sig)
      sig.update((items: any[]) =>
        items.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );
  }

  updateRelatedRecords(parentTable: string, parentId: string, updates: any): void {
    if (parentTable === "todos") {
      this._signals.tasks.update((tasks) =>
        tasks.map((t) => (t.todo_id === parentId ? { ...t, ...updates } : t))
      );
    } else if (parentTable === "tasks") {
      this._signals.subtasks.update((subtasks) =>
        subtasks.map((s) => (s.task_id === parentId ? { ...s, ...updates } : s))
      );
    }
  }

  removeRecord(table: string, id: string): void {
    const sig = this.signalMap[table];
    if (sig) sig.update((items: any[]) => items.filter((item: any) => item.id !== id));
    if (table === "todos")
      this._signals.tasks.update((tasks) => tasks.filter((t) => t.todo_id !== id));
    else if (table === "tasks")
      this._signals.subtasks.update((subtasks) => subtasks.filter((s) => s.task_id !== id));
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
    addEntityToSignal(this._signals.comments, { ...comment, task_id });
  }

  addCommentToSubtask(comment: Comment, subtask_id?: string): void {
    if (!subtask_id) return;
    addEntityToSignal(this._signals.comments, { ...comment, subtask_id });
  }

  removeCommentFromAll(commentId: string): void {
    removeEntityFromSignal(this._signals.comments, commentId);
  }

  // ==================== SET COLLECTION ====================
  setCollection(
    type: string,
    items: any,
    options?: { append?: boolean; resetPagination?: boolean }
  ): void {
    switch (type) {
      case "categories":
        this._signals.categories.set(items);
        break;
      case "profiles":
        this._signals.profiles.set(items);
        if (items?.user) this._user.set(items.user);
        break;
      case "tasks":
        this.setArraySignal(this._signals.tasks, items, options);
        break;
      case "subtasks":
        this.setArraySignal(this._signals.subtasks, items, options);
        break;
      case "comments":
        this.setArraySignal(this._signals.comments, items, options);
        break;
      case "chats":
        this.setArraySignal(this._signals.chats, items, options);
        break;
      case "privateTodos":
        this.storeTodos("private", items, options);
        break;
      case "sharedTodos":
        this.storeTodos("shared", items, options);
        break;
      case "publicTodos":
        this.storeTodos("public", items, options);
        break;
      case "todos":
        this.storeTodosMixed(items, options);
        break;
      case "allProfiles":
        this._allProfiles.set(items);
        break;
      case "user":
        this._user.set(items);
        break;
      case "users":
        this._signals.users.set(items);
        break;
      case "dailyActivities":
        this._dailyActivities.set(items);
        break;
    }
  }

  private setArraySignal<T extends { id: string }>(
    signal: WritableSignal<T[]>,
    items: T[],
    options?: { append?: boolean }
  ): void {
    if (options?.append) signal.update((existing) => [...existing, ...items]);
    else signal.update((existing) => upsertEntityBulk(existing, items));
  }

  private storeTodos(
    visibility: "private" | "shared" | "public",
    items: Todo[],
    options?: { append?: boolean; resetPagination?: boolean }
  ): void {
    const [extractNested, targetSignal] =
      visibility === "private"
        ? [
            (t: any) => {
              const n = { tasks: t.tasks, chats: t.chats, user: t.user };
              delete t.tasks;
              delete t.chats;
              delete t.user;
              return n;
            },
            this._privateTodos,
          ]
        : visibility === "public"
          ? [
              (t: any) => {
                const n = { tasks: t.tasks, chats: t.chats, user: t.user };
                delete t.tasks;
                delete t.chats;
                delete t.user;
                return n;
              },
              this._publicTodos,
            ]
          : [
              (t: any) => {
                const n = { tasks: t.tasks, chats: t.chats, user: t.user };
                delete t.tasks;
                delete t.chats;
                delete t.user;
                return n;
              },
              this._sharedTodos,
            ];
    const nested = { tasks: [] as Task[], chats: [] as Chat[], users: [] as User[] };
    const todos = items.map((todo) => {
      const n = extractNested(todo);
      if (n.tasks) nested.tasks.push(...n.tasks);
      if (n.chats) nested.chats.push(...n.chats);
      if (n.user) nested.users.push(n.user);
      return todo;
    });
    if (nested.tasks.length) this.setCollection("tasks", nested.tasks, { append: options?.append });
    if (nested.chats.length) this.setCollection("chats", nested.chats, { append: options?.append });
    if (nested.users.length) this.setCollection("users", nested.users, { append: options?.append });
    targetSignal.update((existing) => upsertEntityBulk(existing, todos));
  }

  private storeTodosMixed(
    items: Todo[],
    options?: { append?: boolean; resetPagination?: boolean }
  ): void {
    const privateItems: Todo[] = [],
      sharedItems: Todo[] = [],
      publicItems: Todo[] = [];
    items.forEach((todo) => {
      const vis = (todo as any).visibility || "private";
      if (vis === "private") privateItems.push(todo);
      else if (vis === "public") publicItems.push(todo);
      else sharedItems.push(todo);
    });
    if (privateItems.length) this.storeTodos("private", privateItems, options);
    if (sharedItems.length) this.storeTodos("shared", sharedItems, options);
    if (publicItems.length) this.storeTodos("public", publicItems, options);
  }

  // ==================== PAGINATION ====================
  updatePagination(type: ChildType, skip: number, limit: number, receivedCount: number): void {
    this._pagination.update((p) => ({
      ...p,
      [type]: { skip: skip + receivedCount, limit, hasMore: receivedCount >= limit },
    }));
  }

  resetPagination(type: ChildType): void {
    this._pagination.update((p) => ({ ...p, [type]: { ...DEFAULT_PAGINATION } }));
  }

  setHasMoreTodos(hasMore: boolean): void {
    this._pagination.update((p) => ({ ...p, tasks: { ...p.tasks, hasMore } }));
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
      if (operation !== "get" && operation !== "getAll" && this.notifyService) {
        this.notifyService.handleLocalAction(table, operation, result || { id });
      }
      const isShared = result?.visibility === "shared";
      switch (operation) {
        case "create":
          this.modify(table as EntityType, "create", result);
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

  private handleUpdate(table: string, result: any, _isShared: boolean): void {
    if (!result?.id) return;
    if (table === "tasks" || table === "subtasks") {
      const existing = this.get(table as EntityType, result.id);
      if (existing) {
        const merged = this.mergePreservingFields(
          result,
          existing,
          table === "tasks" ? ["comments", "subtasks"] : ["comments"]
        );
        this.modify(table as EntityType, "update", merged);
      } else {
        this.modify(table as EntityType, "update", result);
      }
    } else {
      this.modify(table as EntityType, "update", result);
    }
  }

  private handleDelete(table: string, id?: string, parentTodoId?: string): void {
    if (table === "todos" && id) this.modify("todos", "delete", { id });
    else if (table === "chats" && id) this.updateChat(parentTodoId!, "delete", { id } as Chat);
    else if (id) this.modify(table as EntityType, "delete", { id });
  }

  private handleUpdateAll(table: string, result: any, parentTodoId?: string): void {
    if (table === "chats" && result?.length) {
      const todoId = parentTodoId || result[0].todo_id;
      if (todoId) this.updateChat(todoId, "set", result[0]);
    } else if (result?.length) {
      result.forEach((item: any) => {
        if (item?.id) this.modify(table as EntityType, "update", item);
      });
    }
  }

  private mergePreservingFields<T extends Record<string, any>>(
    incoming: T,
    existing: T,
    fields: string[]
  ): T {
    const result: any = { ...incoming };
    fields.forEach((field) => {
      const inc = incoming[field];
      const ext = existing[field];
      if (inc !== undefined && inc !== null) result[field] = inc;
      else if (ext) result[field] = ext;
    });
    return result as T;
  }

  // ==================== CACHE ====================
  invalidateCache(): void {
    this._loaded.set(false);
    this._lastLoaded.set(null);
    this._cacheInvalidated.set(true);
    this._chatCache.clear();
    this._tasksCache.clear();
    this._cacheTimestamps.clear();
    this._reactiveCache.clear();
    setTimeout(() => this._cacheInvalidated.set(false), 0);
  }

  isCacheValid(cacheExpiryMs: number): boolean {
    if (this._loading()) return false;
    const last = this._lastLoaded();
    return last ? Date.now() - last.getTime() < cacheExpiryMs : false;
  }

  // ==================== CLEAR ====================
  clear(): void {
    this._privateTodos.set([]);
    this._sharedTodos.set([]);
    this._publicTodos.set([]);
    this._signals.tasks.set([]);
    this._signals.subtasks.set([]);
    this._signals.comments.set([]);
    this._signals.chats.set([]);
    this._signals.categories.set([]);
    this._signals.profiles.set(null);
    this._signals.users.set([]);
    this._allProfiles.set([]);
    this._user.set(null);
    this._dailyActivities.set([]);
    this._loaded.set(false);
    this._lastLoaded.set(null);
    this._cacheInvalidated.set(true);
    this._chatCache.clear();
    this._tasksCache.clear();
    this._cacheTimestamps.clear();
    this._reactiveCache.clear();
    this._pagination.set({
      todos: { ...DEFAULT_PAGINATION },
      tasks: { ...DEFAULT_PAGINATION },
      subtasks: { ...DEFAULT_PAGINATION },
      comments: { ...DEFAULT_PAGINATION },
      chats: { ...DEFAULT_PAGINATION },
    });
    setTimeout(() => this._cacheInvalidated.set(false), 0);
  }

  // ==================== LEGACY COMPATIBILITY METHODS ====================
  // These methods exist for backward compatibility with existing code
  getChatsByTodoId(todo_id: string): Chat[] {
    return this.chatsByTodoId().get(todo_id) || [];
  }
  getTaskById(id: string): Task | undefined {
    return this.taskMap().get(id);
  }
  getTodoById(id: string): Todo | undefined {
    return this.todoMap().get(id);
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
    return (this.commentsByTaskId().get(task_id) || []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  getCommentsBySubtaskId(subtask_id: string): Comment[] {
    return (this.commentsBySubtaskId().get(subtask_id) || []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  getChatsByTodo(todo_id?: string): Chat[] {
    return todo_id ? this._signals.chats().filter((c) => c.todo_id === todo_id) : [];
  }

  // ==================== UTILITY ====================
  getTodosByVisibility(visibility?: string): Todo[] {
    if (!visibility || visibility === "all") return this.todos();
    if (visibility === "private") return this.privateTodos();
    if (visibility === "shared") return this.sharedTodos();
    return this.publicTodos();
  }

  getTodosWithNestedTasks(): Todo[] {
    return this.todos().map((t) => ({ ...t, tasks: this.tasksByTodoId().get(t.id) || [] }));
  }
  getTasksWithNestedSubtasks(): Task[] {
    return this.tasks().map((t) => ({ ...t, subtasks: this.subtasksByTaskId().get(t.id) || [] }));
  }
  getSubtasksWithNestedComments(): Subtask[] {
    return this.subtasks().map((s) => ({
      ...s,
      comments: this.commentsBySubtaskId().get(s.id) || [],
    }));
  }
  getUnreadChatCount(todoId: string, userId: string): number {
    return (
      this.chatsByTodoId()
        .get(todoId)
        ?.filter((c) => !c.read_by?.includes(userId)).length || 0
    );
  }
  getUsername(userId: string): string {
    const user = this._signals.users().find((u) => u.id === userId);
    const profile = this._signals.profiles() as unknown as Profile;
    if (profile?.name) return `${profile.name} ${profile.last_name || ""}`.trim();
    return user?.username || "Unknown";
  }
  subtaskExists(id: string): boolean {
    return this._signals.subtasks().some((s) => s.id === id);
  }
  subtaskCountByTaskId(task_id?: string) {
    return computed(() => this._signals.subtasks().filter((s) => s.task_id === task_id).length);
  }
  isPrivateData(entity: any): boolean {
    return entity?.visibility === "private";
  }
  canAccessOffline(visibility: VisibilityFilter): boolean {
    return visibility === "private";
  }

  setCollectionByTable(table: string, data: any[], options?: { append?: boolean }): void {
    const map: Record<string, EntityType> = {
      categories: "categories",
      profiles: "profiles",
      tasks: "tasks",
      subtasks: "subtasks",
      comments: "comments",
      chats: "chats",
      users: "users",
      dailyActivities: "dailyActivities",
    };
    if (map[table]) this.setCollection(map[table], data, options);
  }
}
