/* sys lib */
import { Injectable, inject, signal, computed, Injector } from "@angular/core";
import { Observable } from "rxjs";

/* models */
import { Todo, User, Profile, Room, Category } from "@models/generated/api.types";
import { Task, TaskStatus } from "@models/generated/api.types";
import { Subtask } from "@models/generated/api.types";
import { Comment } from "@models/generated/api.types";
import { Chat } from "@models/generated/api.types";
import {
  EntityType,
  VisibilityFilter,
  Operation,
  ChatOperation,
  ParentType,
  ChildType,
  PaginationState,
} from "@models/storage.model";
import { AdminDataWithRelations } from "@services/core/admin-data.service";

/* services */
import { CascadeService } from "@services/core/cascade.service";
import { NotifyService } from "@services/notifications/notify.service";
import { StorageSignalMap } from "@models/storage-signal-map.model";
import { StorageEntityService } from "@services/core/storage-entity.service";
import { StorageCacheService } from "@services/core/storage-cache.service";
import { StorageQueryService } from "@services/core/storage-query.service";
import { MongoConnectionService } from "@services/core/mongo-connection.service";

/* utils */
import { deduplicateById, groupByKey, createGroupedMap } from "@stores/utils/store-helpers";
import { TimestampHelper, VisibilityHelper, DEFAULT_CACHE_TTL_MS } from "@helpers/index";

const DEFAULT_PAGINATION: PaginationState = { skip: 0, limit: 20, hasMore: true };

@Injectable({ providedIn: "root" })
export class StorageService {
  private readonly _injector = inject(Injector);
  private readonly _entityService = inject(StorageEntityService);
  private readonly _cacheService = inject(StorageCacheService);
  private readonly _queryService = inject(StorageQueryService);
  private readonly mongoConnectionService = inject(MongoConnectionService);

  private _notifyService: NotifyService | null = null;
  private _cascadeService: CascadeService | null = null;

  private readonly _pagination = signal<Record<ChildType, PaginationState>>({
    todos: { ...DEFAULT_PAGINATION },
    tasks: { ...DEFAULT_PAGINATION },
    subtasks: { ...DEFAULT_PAGINATION },
    categories: { ...DEFAULT_PAGINATION },
    comments: { ...DEFAULT_PAGINATION },
    chats: { ...DEFAULT_PAGINATION },
  });

  private get notifyService(): NotifyService {
    if (!this._notifyService) this._notifyService = this._injector.get(NotifyService);
    return this._notifyService;
  }

  private get cascadeService(): CascadeService {
    if (!this._cascadeService) this._cascadeService = this._injector.get(CascadeService);
    return this._cascadeService;
  }

  private readonly allActiveTodos = computed(() => {
    const allTodos = [
      ...this._entityService.privateTodos(),
      ...this._entityService.sharedTodos(),
      ...this._entityService.publicTodos(),
    ];
    return deduplicateById(allTodos, { filterDeleted: true });
  });

  private readonly activeTasks = computed(() =>
    this._entityService.tasks().filter((t) => !t.deleted_at)
  );
  private readonly activeSubtasks = computed(() =>
    this._entityService.subtasks().filter((s) => !s.deleted_at)
  );
  private readonly activeComments = computed(() =>
    this._entityService.comments().filter((c) => !c.deleted_at)
  );
  private readonly activeChats = computed(() =>
    this._entityService.chats().filter((c) => !c.deleted_at)
  );

  readonly privateTodos = computed(() =>
    this._entityService.privateTodos().filter((t) => !t.deleted_at)
  );
  readonly sharedTodos = computed(() =>
    this._entityService.sharedTodos().filter((t) => !t.deleted_at)
  );
  readonly publicTodos = computed(() =>
    this._entityService.publicTodos().filter((t) => !t.deleted_at)
  );
  readonly todos = computed(() => this.allActiveTodos());
  readonly tasks = computed(() => this.activeTasks());
  readonly subtasks = computed(() => this.activeSubtasks());
  readonly comments = computed(() => this.activeComments());
  readonly chats = computed(() => this.activeChats());
  readonly categories = this._entityService.categories.asReadonly();
  readonly profile = this._entityService.profiles.asReadonly();
  readonly profiles = this._entityService.profiles.asReadonly();
  readonly publicProfiles = this._entityService.publicProfiles.asReadonly();
  readonly allProfiles = this._queryService.allProfiles;
  readonly user = this._queryService.user;
  readonly users = this._entityService.users.asReadonly();
  readonly rooms = this._entityService.rooms.asReadonly();
  readonly dailyActivities = this._queryService.dailyActivities;
  readonly archivedTodos = computed(() =>
    [
      ...this._entityService.privateTodos(),
      ...this._entityService.sharedTodos(),
      ...this._entityService.publicTodos(),
    ].filter((t) => t.deleted_at)
  );
  readonly archivedTasks = computed(() => this._entityService.tasks().filter((t) => t.deleted_at));
  readonly archivedSubtasks = computed(() =>
    this._entityService.subtasks().filter((s) => s.deleted_at)
  );
  readonly cacheInvalidated = this._cacheService.cacheInvalidated;
  readonly subtasksGroupedByTask = computed(() =>
    groupByKey(this._entityService.subtasks(), (s) => s.task_id)
  );
  readonly isLoading = this._queryService.loading;
  readonly loaded = this._queryService.loaded;
  readonly lastLoaded = this._queryService.lastLoaded;

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
    return this._pagination().todos.hasMore;
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
    return this._entityService.tasks().filter((t) => t.status === TaskStatus.PENDING).length;
  }

  get signalMap(): StorageSignalMap {
    return {
      todos: this._entityService.todos,
      tasks: this._entityService.tasks,
      subtasks: this._entityService.subtasks,
      comments: this._entityService.comments,
      chats: this._entityService.chats,
      categories: this._entityService.categories,
      daily_activities: signal([]),
    };
  }

  get(type: EntityType, id: string): any | undefined {
    if (type === "users" || type === "profiles") return undefined;
    return this._queryService.findById(type, id);
  }

  getChildren(parentType: ParentType, parentId: string): Task[] | Subtask[] | Chat[] {
    switch (parentType) {
      case "tasks":
        return this.tasksByTodoId().get(parentId) || [];
      case "subtasks":
        return this.subtasksByTaskId().get(parentId) || [];
      case "chats":
        return this.chats();
    }
  }

  query(
    type: EntityType,
    filters?: {
      visibility?: VisibilityFilter;
      todoId?: string;
      taskId?: string;
      subtaskId?: string;
    }
  ): any[] {
    return this._queryService.query(type, filters);
  }

  watch(
    type: "todos" | "tasks" | "subtasks" | "comments" | "chats",
    id?: string
  ): ReturnType<typeof computed<any>> {
    if (!id) return computed(() => undefined);
    const cacheKey = `${type}_${id}`;
    if (this._cacheService.hasReactiveCache(cacheKey))
      return this._cacheService.getReactiveCache(cacheKey)!;
    const computedSignal = computed(() =>
      this._queryService.query(type).find((e: any) => e.id === id)
    );
    this._cacheService.setReactiveCache(cacheKey, computedSignal);
    return computedSignal;
  }

  watchByTodo(
    todoId: string,
    type: "tasks" | "chats"
  ): ReturnType<typeof computed<Task[] | Chat[]>> {
    if (!todoId) return computed(() => []);
    const cacheKey = `${type}_by_todo_${todoId}`;
    if (this._cacheService.hasTasksCache(cacheKey) && type === "tasks")
      return this._cacheService.getTasksCache(cacheKey)!;
    const now = Date.now();
    if (this._cacheService.isCacheValid(cacheKey, DEFAULT_CACHE_TTL_MS)) {
      return type === "chats"
        ? computed(() => this.chats())
        : this._cacheService.getTasksCache(cacheKey)!;
    }
    if (this._cacheService.isCacheFull()) {
      this._cacheService.evictOldestCache();
    }
    const computedSignal =
      type === "chats"
        ? computed(() => this.chats())
        : computed(() => this._queryService.query(type, { todoId: todoId! }));
    if (type === "chats") {
      this._cacheService.setChatCache(todoId, computedSignal);
    } else {
      this._cacheService.setTasksCache(todoId, computedSignal);
    }
    this._cacheService.setCacheTimestamp(cacheKey, now);
    return computedSignal;
  }

  modify(type: EntityType, op: "create" | "update" | "delete", data: any): void {
    if (type === "users") return;
    switch (op) {
      case "create":
        this._entityService.addEntity(type, data);
        break;
      case "update":
        this._entityService.updateEntity(type, data);
        break;
      case "delete":
        this._entityService.removeEntity(type, data.id);
        break;
    }
    if (type === "todos" || type === "tasks" || type === "subtasks") {
    }
  }

  updateEntity(type: EntityType, data: any): void {
    this._entityService.updateEntity(type, data);
  }

  updateChat(op: ChatOperation, data?: Chat): void {
    this._entityService.updateChat("", op as any, data);
  }

  setChats(chats: Chat[]) {
    this._entityService.chats.set(chats);
  }
  setRooms(rooms: Room[]) {
    this._entityService.rooms.set(rooms);
  }
  addChat(chat: Chat) {
    this._entityService.updateChat("", "add", chat);
  }
  updateChatById(chat: Chat) {
    this._entityService.updateChat("", "update", chat);
  }
  deleteChat(chatId: string) {
    this._entityService.updateChat("", "delete", { id: chatId } as Chat);
  }
  clearChats() {
    this._entityService.updateChat("", "clear");
  }

  bulkUpsertSubtasks(subtasks: Subtask[]): void {
    this._entityService.bulkUpsertSubtasks(subtasks);
  }

  moveTodoToShared(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.get("todos", todo_id);
    if (!todo) return;
    this._entityService.privateTodos.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this._entityService.sharedTodos().some((t) => t.id === todo_id)) {
      this._entityService.sharedTodos.update((todos) => [
        { ...todo, visibility: "shared" as const },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  /**
   * @deprecated Use updateEntityVisibility("todos", id, "private") instead
   */
  moveTodoToPrivate(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.get("todos", todo_id);
    if (!todo) return;
    this._entityService.sharedTodos.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this._entityService.privateTodos().some((t) => t.id === todo_id)) {
      this._entityService.privateTodos.update((todos) => [
        { ...todo, visibility: "private" as const },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  updateEntityVisibility(table: EntityType, id: string, newVisibility: string): void {
    let entity: any;
    if (table === "todos") {
      const allTodos = [
        ...this._entityService.privateTodos(),
        ...this._entityService.sharedTodos(),
        ...this._entityService.publicTodos(),
      ];
      entity = allTodos.find((t) => t.id === id);
    } else {
      entity = this.get(table, id);
    }
    if (!entity || entity.visibility === newVisibility) return;

    if (table === "todos") {
      const oldList =
        entity.visibility === "private"
          ? this._entityService.privateTodos
          : entity.visibility === "public"
            ? this._entityService.publicTodos
            : this._entityService.sharedTodos;

      const newList =
        newVisibility === "private"
          ? this._entityService.privateTodos
          : newVisibility === "public"
            ? this._entityService.publicTodos
            : this._entityService.sharedTodos;

      const updatedEntity = { ...entity, visibility: newVisibility };
      oldList.update((todos) => {
        const filtered = todos.filter((t) => t.id !== id);
        if (filtered.length === todos.length && !todos.some((t) => t.id === id)) {
          return todos;
        }
        return filtered;
      });
      newList.update((todos) => {
        const filtered = todos.filter((t) => t.id !== id);
        if (filtered.some((t) => t.id === id)) {
          return todos;
        }
        return [updatedEntity, ...filtered];
      });
    } else {
      this.updateRecord(table, id, { visibility: newVisibility });
    }
  }

  removeTodoWithCascade(todo_id?: string): void {
    if (!todo_id) return;
    const { taskIds = [], subtaskIds = [] } = this.cascadeService.computeCascadeForTodo(
      this._entityService.tasks(),
      this._entityService.subtasks(),
      todo_id
    );
    this._entityService.subtasks.update((items) =>
      items.filter((s) => !subtaskIds?.includes(s.id))
    );
    this._entityService.tasks.update((items) => items.filter((t) => t.todo_id !== todo_id));
    this._entityService.comments.update((items) =>
      items.filter((c) => {
        const isTodoComment = (c as any).todo_id === todo_id;
        const isTaskComment = c.task_id && (taskIds?.includes(c.task_id) ?? false);
        const isSubtaskComment = c.subtask_id && (subtaskIds?.includes(c.subtask_id) ?? false);
        return !isTodoComment && !isTaskComment && !isSubtaskComment;
      })
    );
    this._entityService.chats.update((items) => items);
    this._entityService.privateTodos.update((items) => items.filter((t) => t.id !== todo_id));
    this._entityService.sharedTodos.update((items) => items.filter((t) => t.id !== todo_id));
    this._entityService.publicTodos.update((items) => items.filter((t) => t.id !== todo_id));
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
      if (deletedAt) this._entityService.updateEntity("comments", { id, deleted_at: deletedAt });
      else this._entityService.removeEntity("comments", id);
    } else if (table === "chats" || table === "categories") {
      this._entityService.removeEntity(table as EntityType, id);
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
        this._entityService.subtasks(),
        id
      );
      this._entityService.subtasks.update((items) =>
        items.map((s) =>
          (subtaskIds?.includes(s.id) ?? false)
            ? { ...s, deleted_at: timestamp, updated_at: timestamp }
            : s
        )
      );
      this._entityService.comments.update((items) =>
        items.map((c) =>
          c.task_id === id || (c.subtask_id && (subtaskIds?.includes(c.subtask_id) ?? false))
            ? { ...c, deleted_at: timestamp, updated_at: timestamp }
            : c
        )
      );
      this._entityService.tasks.update((items) =>
        items.map((t) => (t.id === id ? { ...t, deleted_at: timestamp, updated_at: timestamp } : t))
      );
    } else {
      this._entityService.subtasks.update((items) =>
        items.map((s) => (s.id === id ? { ...s, deleted_at: timestamp, updated_at: timestamp } : s))
      );
      this._entityService.comments.update((items) =>
        items.map((c) =>
          c.subtask_id === id ? { ...c, deleted_at: timestamp, updated_at: timestamp } : c
        )
      );
    }
  }

  private softDelete(table: "tasks" | "subtasks", id: string): void {
    const timestamp = TimestampHelper.createTimestamp();
    if (table === "tasks") {
      const subtasks = this._entityService.subtasks().filter((s) => s.task_id === id);
      this._entityService.tasks.update((tasks) =>
        tasks.map((t) => (t.id === id ? { ...t, deleted_at: timestamp } : t))
      );
      subtasks.forEach((s) => this.softDelete("subtasks", s.id));
    } else {
      this._entityService.subtasks.update((subtasks) =>
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
        ? this._entityService.privateTodos
        : visibility === "public"
          ? this._entityService.publicTodos
          : this._entityService.sharedTodos;
    targetArray.set([data.todo, ...targetArray()]);
    if (data.tasks?.length) this._entityService.tasks.update((t) => [...t, ...data.tasks]);
    if (data.subtasks?.length) this._entityService.subtasks.update((s) => [...s, ...data.subtasks]);
    if (data.comments?.length) this._entityService.comments.update((c) => [...c, ...data.comments]);
    if (data.chats?.length) this._entityService.chats.update((c) => [...c, ...(data.chats || [])]);
  }

  restoreRecordWithCascade(table: string, id: string): void {
    const timestamp = TimestampHelper.createTimestamp();
    const updateData = { deleted_at: undefined, updated_at: timestamp };
    if (table === "todos") {
      this._entityService.updateEntity("todos", { id, ...updateData });
      const relatedTasks = this._entityService.tasks().filter((t) => t.todo_id === id);
      const relatedSubtasks = this._entityService
        .subtasks()
        .filter((s) => relatedTasks.some((t) => t.id === s.task_id));
      const relatedChats = this._entityService.chats();
      relatedTasks.forEach((t) =>
        this._entityService.updateEntity("tasks", { id: t.id, ...updateData })
      );
      relatedSubtasks.forEach((s) =>
        this._entityService.updateEntity("subtasks", { id: s.id, ...updateData })
      );
      relatedChats.forEach((c) =>
        this._entityService.updateEntity("chats", { id: c.id, ...updateData })
      );
    } else if (table === "tasks") {
      this._entityService.updateEntity("tasks", { id, ...updateData });
      this._entityService
        .subtasks()
        .filter((s) => s.task_id === id)
        .forEach((s) => this._entityService.updateEntity("subtasks", { id: s.id, ...updateData }));
    } else if (table === "subtasks") {
      this._entityService.updateEntity("subtasks", { id, ...updateData });
    } else if (["comments", "chats", "categories"].includes(table)) {
      this._entityService.updateEntity(table as EntityType, { id, ...updateData });
    }
  }

  updateRecordDeleteStatusWithCascade(table: string, id: string, deletedAt: boolean): void {
    const timestamp = TimestampHelper.createTimestamp();
    const update = { deleted_at: deletedAt ? timestamp : undefined, updated_at: timestamp };
    if (table === "todos") {
      const { taskIds = [], subtaskIds = [] } = this.cascadeService.computeCascadeForTodo(
        this._entityService.tasks(),
        this._entityService.subtasks(),
        id
      );
      this._entityService.tasks.update((tasks) =>
        tasks.map((t) => (t.todo_id === id ? { ...t, ...update } : t))
      );
      this._entityService.subtasks.update((subtasks) =>
        subtasks.map((s) => ((subtaskIds?.includes(s.id) ?? false) ? { ...s, ...update } : s))
      );
      this._entityService.comments.update((comments) =>
        comments.map((c) => {
          const isRelated =
            (c.task_id && (taskIds?.includes(c.task_id) ?? false)) ||
            (c.subtask_id && (subtaskIds?.includes(c.subtask_id) ?? false));
          return isRelated ? { ...c, ...update } : c;
        })
      );
      this._entityService.chats.update((chats) => chats.map((c) => ({ ...c, ...update })));
      [
        this._entityService.privateTodos,
        this._entityService.sharedTodos,
        this._entityService.publicTodos,
      ].forEach((signal) =>
        signal.update((todos) => todos.map((t) => (t.id === id ? { ...t, ...update } : t)))
      );
    } else if (table === "tasks") {
      const { subtaskIds = [] } = this.cascadeService.computeCascadeForTask(
        this._entityService.subtasks(),
        id
      );
      this._entityService.subtasks.update((subtasks) =>
        subtasks.map((s) => ((subtaskIds?.includes(s.id) ?? false) ? { ...s, ...update } : s))
      );
      this._entityService.comments.update((comments) =>
        comments.map((c) => {
          const isRelated =
            c.task_id === id || (c.subtask_id && (subtaskIds?.includes(c.subtask_id) ?? false));
          return isRelated ? { ...c, ...update } : c;
        })
      );
      this._entityService.tasks.update((tasks) =>
        tasks.map((t) => (t.id === id ? { ...t, ...update } : t))
      );
    } else if (table === "subtasks") {
      this._entityService.comments.update((comments) =>
        comments.map((c) => (c.subtask_id === id ? { ...c, ...update } : c))
      );
      this._entityService.subtasks.update((subtasks) =>
        subtasks.map((s) => (s.id === id ? { ...s, ...update } : s))
      );
    } else if (table === "categories") {
      [
        this._entityService.privateCategories,
        this._entityService.sharedCategories,
        this._entityService.publicCategories,
      ].forEach((signal) =>
        signal.update((categories) =>
          categories.map((c) => (c.id === id ? { ...c, ...update } : c))
        )
      );
    }
  }

  loadInitialData(type: string, limit: number): Observable<any> {
    return this._queryService.loadInitialData(type, limit);
  }

  loadMoreData(type: string, skip: number): Observable<any> {
    return this._queryService.loadMoreData(type, skip);
  }

  loadAdminData(force: boolean = false): Observable<AdminDataWithRelations> {
    return this._queryService.loadAdminData(force);
  }

  updateRecord(table: string, id: string, updates: any): void {
    const sig = this.signalMap[table as keyof StorageSignalMap];
    if (sig)
      sig.update((items: any[]) =>
        items.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );
  }

  updateRelatedRecords(parentTable: string, parentId: string, updates: any): void {
    if (parentTable === "todos") {
      this._entityService.tasks.update((tasks) =>
        tasks.map((t) => (t.todo_id === parentId ? { ...t, ...updates } : t))
      );
    } else if (parentTable === "tasks") {
      this._entityService.subtasks.update((subtasks) =>
        subtasks.map((s) => (s.task_id === parentId ? { ...s, ...updates } : s))
      );
    }
  }

  removeRecord(table: string, id: string): void {
    const sig = this.signalMap[table as keyof StorageSignalMap];
    if (sig) sig.update((items: any[]) => items.filter((item: any) => item.id !== id));
    if (table === "todos")
      this._entityService.tasks.update((tasks) => tasks.filter((t) => t.todo_id !== id));
    else if (table === "tasks")
      this._entityService.subtasks.update((subtasks) => subtasks.filter((s) => s.task_id !== id));
  }

  updateRecordDeleteStatus(table: string, id: string, deletedAt: boolean): void {
    const timestamp = TimestampHelper.createTimestamp();
    this.updateRecord(table, id, {
      deleted_at: deletedAt ? timestamp : undefined,
      updated_at: timestamp,
    });
  }

  updateSignal(table: string, updater: (items: any[]) => any[]): void {
    const sig = this.signalMap[table as keyof StorageSignalMap];
    if (sig) sig.update(updater);
  }

  setSignal(table: string, items: any[]): void {
    const sig = this.signalMap[table as keyof StorageSignalMap];
    if (sig) sig.set(items);
  }

  addCommentToTask(comment: Comment, task_id?: string): void {
    this._entityService.addCommentToTask(comment, task_id);
  }

  addCommentToSubtask(comment: Comment, subtask_id?: string): void {
    this._entityService.addCommentToSubtask(comment, subtask_id);
  }

  removeCommentFromAll(commentId: string): void {
    this._entityService.removeCommentFromAll(commentId);
  }

  setCollection(
    type: string,
    items: any,
    options?: { append?: boolean; resetPagination?: boolean }
  ): void {
    this._queryService.setCollection(type, items, options);
  }

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
    this._pagination.update((p) => ({ ...p, todos: { ...p.todos, hasMore } }));
  }

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

  private handleDelete(table: string, id?: string, _parentTodoId?: string): void {
    if (table === "todos" && id) this.modify("todos", "delete", { id });
    else if (table === "chats" && id) this.updateChat("delete", { id } as Chat);
    else if (id) this.modify(table as EntityType, "delete", { id });
  }

  private handleUpdateAll(table: string, result: any, _parentTodoId?: string): void {
    if (table === "chats" && result?.length) {
      this.modify("chats", "update", result[0]);
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

  invalidateCache(): void {
    this._queryService.setLoaded(false);
    this._queryService.setLastLoaded(null);
    this._cacheService.invalidateCache();
  }

  isCacheValid(cacheExpiryMs: number): boolean {
    return this._queryService.isCacheValid(cacheExpiryMs);
  }

  clear(): void {
    this._entityService.clearEntitySignals();
    this._queryService.setAllProfiles([]);
    this._queryService.setUser(null);
    this._queryService.setDailyActivities([]);
    this._queryService.setLoaded(false);
    this._queryService.setLastLoaded(null);
    this._cacheService.clearAll();
    this._pagination.set({
      todos: { ...DEFAULT_PAGINATION },
      tasks: { ...DEFAULT_PAGINATION },
      subtasks: { ...DEFAULT_PAGINATION },
      categories: { ...DEFAULT_PAGINATION },
      comments: { ...DEFAULT_PAGINATION },
      chats: { ...DEFAULT_PAGINATION },
    });
  }

  getChats(): Chat[] {
    return this.chats();
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
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
  }
  getCommentsBySubtaskId(subtask_id: string): Comment[] {
    return (this.commentsBySubtaskId().get(subtask_id) || []).sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeA - timeB;
    });
  }
  getChatsByAll(): Chat[] {
    return this.chats();
  }

  getTodosByVisibility(visibility?: string): Todo[] {
    return this._queryService.getTodosByVisibility(visibility);
  }

  getTodosWithNestedTasks(): Todo[] {
    return this._queryService.getTodosWithNestedTasks();
  }
  getTasksWithNestedSubtasks(): Task[] {
    return this._queryService.getTasksWithNestedSubtasks();
  }
  getSubtasksWithNestedComments(): Subtask[] {
    return this._queryService.getSubtasksWithNestedComments();
  }
  getUnreadChatCount(todoId: string, userId: string): number {
    return this._queryService.getUnreadChatCount(todoId, userId);
  }
  getUsername(userId: string): string {
    return this._queryService.getUsername(userId);
  }
  subtaskExists(id: string): boolean {
    return this._queryService.subtaskExists(id);
  }
  subtaskCountByTaskId(task_id?: string) {
    return this._queryService.subtaskCountByTaskId(task_id);
  }
  isPrivateData(entity: any): boolean {
    return this._queryService.isPrivateData(entity);
  }
  canAccessOffline(visibility: VisibilityFilter): boolean {
    return this._queryService.canAccessOffline(visibility);
  }

  setCollectionByTable(table: string, data: any[], options?: { append?: boolean }): void {
    this._queryService.setCollectionByTable(table, data, options);
  }

  ensureUserLoaded(): void {
    this._queryService.ensureUserLoaded();
  }

  ensureProfileLoaded(): void {
    this._queryService.ensureProfileLoaded();
  }

  ensurePublicProfilesLoaded(): void {
    this._queryService.ensurePublicProfilesLoaded();
  }

  getCurrentUser() {
    return this._entityService.getCurrentUser();
  }

  ensureTodosLoaded(visibility: string = "private", limit: number = 10): void {
    if (visibility === "all") {
      if (
        this.privateTodos().length > 0 &&
        this.sharedTodos().length > 0 &&
        this.publicTodos().length > 0
      )
        return;
      this._queryService.ensureTodosLoaded("private", limit);
      this.mongoConnectionService.checkConnection().subscribe((isConnected) => {
        if (isConnected) {
          this._queryService.ensureTodosLoaded("shared", limit);
          this._queryService.ensureTodosLoaded("public", limit);
        }
      });
      return;
    }
    const targetTodos =
      visibility === "private"
        ? this.privateTodos()
        : visibility === "public"
          ? this.publicTodos()
          : this.sharedTodos();
    if (targetTodos.length > 0) return;
    this._queryService.ensureTodosLoaded(visibility, limit);
  }

  ensureTasksLoaded(visibility: string = "private", limit: number = 10, todoId?: string): void {
    if (todoId && (this.tasksByTodoId().get(todoId)?.length ?? 0) > 0) return;
    if (!todoId && this.tasks().length > 0) return;
    this._queryService.ensureTasksLoaded(visibility, limit, todoId);
  }

  ensureSubtasksLoaded(visibility: string = "private", limit: number = 10): void {
    if (this.subtasks().length > 0) return;
    this._queryService.ensureSubtasksLoaded(visibility, limit);
  }

  ensureChatsLoaded(visibility: string = "private", limit: number = 50): void {
    if (this.chats().length > 0) return;
    this._queryService.ensureChatsLoaded(visibility, limit);
  }

  ensureCategoriesLoaded(visibility: string = "private", limit: number = 100): void {
    this._queryService.ensureCategoriesLoaded(visibility, limit);
  }

  ensureTaskCommentsLoaded(
    taskId: string,
    visibility: string = "private",
    limit: number = 10
  ): void {
    const existing = this.commentsByTaskId().get(taskId) || [];
    if (existing.length > 0) return;
    this._queryService.ensureTaskCommentsLoaded(taskId, visibility, limit);
  }

  ensureSubtaskCommentsLoaded(
    subtaskId: string,
    visibility: string = "private",
    limit: number = 10
  ): void {
    const existing = this.commentsBySubtaskId().get(subtaskId) || [];
    if (existing.length > 0) return;
    this._queryService.ensureSubtaskCommentsLoaded(subtaskId, visibility, limit);
  }

  getTodos(visibility: string = "private"): Todo[] {
    const todos =
      visibility === "private"
        ? this._entityService.privateTodos()
        : visibility === "shared"
          ? this._entityService.sharedTodos()
          : visibility === "public"
            ? this._entityService.publicTodos()
            : [];
    if (todos.length === 0 && !this._queryService.isEntityLoading("todos")) {
      this._queryService.ensureTodosLoaded(visibility);
    }
    return todos;
  }

  getCategoriesForVisibility(visibility: string): Category[] {
    const categories =
      visibility === "private"
        ? this._entityService.privateCategories()
        : visibility === "shared"
          ? this._entityService.sharedCategories()
          : visibility === "public"
            ? this._entityService.publicCategories()
            : [];
    return categories;
  }

  loadMoreTodos(): void {
    if (this._pagination().todos.hasMore && !this._queryService.isEntityLoading("todos")) {
      this._queryService.loadMoreTodos();
    }
  }

  getTasks(visibility: string = "private"): Task[] {
    if (this._entityService.tasks().length === 0 && !this._queryService.isEntityLoading("tasks")) {
      this._queryService.ensureTasksLoaded(visibility);
    }
    return this._entityService.tasks();
  }

  loadMoreTasks(todoId?: string): void {
    if (this._pagination().tasks.hasMore && !this._queryService.isEntityLoading("tasks")) {
      this._queryService.loadMoreTasks(todoId);
    }
  }

  getSubtasks(visibility: string = "private"): Subtask[] {
    if (
      this._entityService.subtasks().length === 0 &&
      !this._queryService.isEntityLoading("subtasks")
    ) {
      this._queryService.ensureSubtasksLoaded(visibility);
    }
    return this._entityService.subtasks();
  }

  loadMoreSubtasks(taskId?: string): void {
    if (this._pagination().subtasks.hasMore && !this._queryService.isEntityLoading("subtasks")) {
      this._queryService.loadMoreSubtasks(taskId);
    }
  }

  getCategories(visibility: string = "private"): any[] {
    if (
      this._entityService.categories().length === 0 &&
      !this._queryService.isEntityLoading("categories")
    ) {
      this._queryService.ensureCategoriesLoaded(visibility);
    }
    return this._entityService.categories();
  }

  loadMoreCategories(): void {
    if (
      this._pagination().categories.hasMore &&
      !this._queryService.isEntityLoading("categories")
    ) {
      this._queryService.loadMoreCategories();
    }
  }

  getChatsForVisibility(visibility: string = "private"): Chat[] {
    if (this._entityService.chats().length === 0 && !this._queryService.isEntityLoading("chats")) {
      this._queryService.ensureChatsLoaded(visibility);
    }
    return this._entityService.chats();
  }

  loadMoreChats(): void {
    if (this._pagination().chats.hasMore && !this._queryService.isEntityLoading("chats")) {
      this._queryService.loadMoreChats();
    }
  }

  getComments(visibility: string = "private"): Comment[] {
    if (
      this._entityService.comments().length === 0 &&
      !this._queryService.isEntityLoading("comments")
    ) {
      this._queryService.ensureCommentsLoaded(visibility);
    }
    return this._entityService.comments();
  }

  loadMoreComments(): void {
    if (this._pagination().comments.hasMore && !this._queryService.isEntityLoading("comments")) {
      this._queryService.loadMoreComments();
    }
  }

  getUser(): User | null {
    if (!this._queryService.user() && !this._queryService.isEntityLoading("user")) {
      this._queryService.ensureUserLoaded();
    }
    return this._queryService.user();
  }

  getProfile(): Profile | null {
    if (
      !this._queryService.allProfiles()?.length &&
      !this._queryService.isEntityLoading("profile")
    ) {
      this._queryService.ensureProfileLoaded();
    }
    return this._queryService.allProfiles()[0] || null;
  }
}
