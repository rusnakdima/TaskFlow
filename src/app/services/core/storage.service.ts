/* sys lib */
import { Injectable, signal, computed, inject, Signal, WritableSignal } from "@angular/core";
/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
/* handlers */
import { TodoHandler } from "./entity-handlers/todo.handler";
import { CategoryHandler } from "./entity-handlers/category.handler";
import { ProfileHandler } from "./entity-handlers/profile.handler";
import { FlatCommentHandler } from "./entity-handlers/flat-comment.handler";

import { BaseStorageService } from "./base-storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { groupByKey } from "@stores/utils/store-helpers";

export type StorageEntity = keyof EntityMap;

export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

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
  users: any;
}

// ==================== STORAGE SERVICE ====================
@Injectable({ providedIn: "root" })
export class StorageService extends BaseStorageService {
  private readonly notifyService = inject(NotifyService);
  // ==================== FLAT SIGNALS ====================
  private readonly privateTodosSignal = signal<Todo[]>([]);
  private readonly sharedTodosSignal = signal<Todo[]>([]);
  private readonly publicTodosSignal = signal<Todo[]>([]);
  private readonly tasksSignal = signal<Task[]>([]);
  private readonly subtasksSignal = signal<Subtask[]>([]);
  private readonly commentsSignal = signal<Comment[]>([]);
  private readonly chatsSignal = signal<Chat[]>([]);
  private readonly categoriesSignal = signal<Category[]>([]);
  private readonly profileSignal = signal<Profile | null>(null);
  private readonly profilesSignal = signal<Profile[]>([]);
  private readonly allProfilesSignal = signal<Profile[]>([]);
  private readonly userSignal = signal<any | null>(null); // TODO: type User properly
  private readonly usersSignal = signal<any[]>([]); // TODO: type User properly
  private readonly dailyActivitiesSignal = signal<any[]>([]);

  // ==================== PAGINATION SIGNALS ====================
  private readonly todosPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  private readonly tasksPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  private readonly subtasksPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  private readonly commentsPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  private readonly chatsPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });

  // Cache for reactive computed signals (prevents infinite loops)
  private readonly chatsCache = new Map<string, ReturnType<typeof computed<Chat[]>>>();
  private readonly tasksByTodoCache = new Map<string, ReturnType<typeof computed<Task[]>>>();

  // ==================== COMPUTED SIGNALS ====================
  private readonly todosComputed = computed(() => {
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

  private readonly privateTodosComputed = computed(() => {
    // Deduplication happens at the source signals (privateTodosSignal, etc.)
    // This computed just filters out deleted items
    return this.privateTodosSignal().filter((todo) => !todo.deleted_at);
  });

  private readonly sharedTodosComputed = computed(() => {
    return this.sharedTodosSignal().filter((todo) => !todo.deleted_at);
  });

  private readonly publicTodosComputed = computed(() => {
    return this.publicTodosSignal().filter((todo) => !todo.deleted_at);
  });

  // ==================== PUBLIC SIGNALS ====================
  readonly privateTodos = this.privateTodosComputed;
  readonly sharedTodos = this.sharedTodosComputed;
  readonly publicTodos = this.publicTodosComputed;
  readonly todos = this.todosComputed;
  readonly tasks = computed(() => this.tasksSignal().filter((t) => !t.deleted_at));
  readonly subtasks = computed(() => this.subtasksSignal().filter((s) => !s.deleted_at));
  readonly comments = computed(() => this.commentsSignal().filter((c) => !c.deleted_at));
  readonly categories = this.categoriesSignal.asReadonly();
  readonly profile = this.profileSignal.asReadonly();
  readonly profiles = this.profilesSignal.asReadonly();
  readonly allProfiles = this.allProfilesSignal.asReadonly();
  readonly chats = computed(() => this.chatsSignal().filter((c) => !c.deleted_at));
  readonly user = this.userSignal.asReadonly();
  readonly users = this.usersSignal.asReadonly();
  readonly dailyActivities = this.dailyActivitiesSignal.asReadonly();

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
    tasks: new TodoHandler(this.privateTodosSignal, this.sharedTodosSignal, this.publicTodosSignal),
    subtasks: new TodoHandler(
      this.privateTodosSignal,
      this.sharedTodosSignal,
      this.publicTodosSignal
    ),
    categories: new CategoryHandler(this.categoriesSignal),
    profiles: new ProfileHandler(this.profileSignal),
    chats: new TodoHandler(this.privateTodosSignal, this.sharedTodosSignal, this.publicTodosSignal),
    comments: new FlatCommentHandler(this.commentsSignal),
  };

  // ==================== CRUD OPERATIONS ====================
  // TODO: The `any` type here is due to handler architecture - handlers accept dynamic entity data
  // and this service acts as a router. Refactoring would require restructuring the handler system
  // to properly type all entity operations across todos, tasks, subtasks, etc.
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

  get handlersMap() {
    return this.handlers;
  }

  // ==================== PUBLIC GETTERS ====================
  getTasksByTodoId(todo_id?: string): Task[] {
    if (!todo_id) return [];
    return this.tasks().filter((t) => t.todo_id === todo_id);
  }

  getSubtasksByTaskId(task_id?: string): Subtask[] {
    if (!task_id) return [];
    return this.subtasks().filter((s) => s.task_id === task_id);
  }

  subtasksByTaskId(task_id?: string): Signal<Subtask[]> {
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

    if (!this.chatsCache.has(todo_id)) {
      this.chatsCache.set(
        todo_id,
        computed(() => {
          return this.chats().filter((chat) => chat.todo_id === todo_id);
        })
      );
    }
    return this.chatsCache.get(todo_id)!;
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
    const todo = this.getById("todos", todo_id);
    if (!todo) return;

    const handler = this.handlers.todos as TodoHandler;
    const allTodos = [...this.privateTodosSignal(), ...this.sharedTodosSignal()];
    handler.removeWithCascade(todo_id, allTodos);
  }

  removeRecordWithCascade(table: string, id: string, deletedAt?: string): void {
    if (table === "todos") {
      this.removeTodoWithCascade(id);
    } else if (table === "tasks") {
      const taskHandler = this.handlers.tasks;
      const task = this.getById("tasks", id);
      const todoId = task?.todo_id ?? null;
      if (deletedAt) {
        (taskHandler as any).softDeleteWithCascade?.(id, deletedAt, todoId ?? undefined);
      } else {
        taskHandler.remove(id, todoId ?? undefined);
      }
    } else if (table === "subtasks") {
      const subtaskHandler = this.handlers.subtasks;
      const subtask = this.getById("subtasks", id);
      const taskId = subtask?.task_id ?? null;
      if (deletedAt) {
        (subtaskHandler as any).softDeleteWithCascade?.(id, deletedAt, taskId ?? undefined);
      } else {
        subtaskHandler.remove(id, taskId ?? undefined);
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

  restoreTodoWithCascade(data: {
    todo: Todo;
    tasks: Task[];
    subtasks: Subtask[];
    comments: Comment[];
    chats?: Chat[];
  }): void {
    const handler = this.handlers.todos as TodoHandler;
    handler.restoreWithCascade(data);
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
    if (user?.profile?.name) {
      return `${user.profile.name} ${user.profile.last_name || ""}`.trim();
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
    this.userSignal.set(null);
    this.usersSignal.set([]);
    this.dailyActivitiesSignal.set([]);
    this.loadedSignal.set(false);
    this.lastLoadedSignal.set(null);
  }

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
                  ? any | null
                  : T extends "users"
                    ? any[]
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
        break;
      case "subtasks":
        if (options?.append) {
          this.subtasksSignal.update((existing) => [...existing, ...(items as Subtask[])]);
        } else {
          this.subtasksSignal.set(items as Subtask[]);
        }
        break;
      case "comments":
        if (options?.append) {
          this.commentsSignal.update((existing) => [...existing, ...(items as Comment[])]);
        } else {
          this.commentsSignal.set(items as Comment[]);
        }
        break;
      case "chats":
        if (options?.append) {
          this.chatsSignal.update((existing) => [...existing, ...(items as Chat[])]);
        } else {
          this.chatsSignal.set(items as Chat[]);
        }
        break;
      case "privateTodos":
        this.privateTodosSignal.set(items as Todo[]);
        break;
      case "sharedTodos":
        this.sharedTodosSignal.set(items as Todo[]);
        break;
      case "publicTodos":
        this.publicTodosSignal.set(items as Todo[]);
        break;
      case "allProfiles":
        this.allProfilesSignal.set(items as Profile[]);
        break;
      case "user":
        this.userSignal.set(items as any | null);
        break;
      case "users":
        this.usersSignal.set(items as any[]);
        break;
      case "dailyActivities":
        this.dailyActivitiesSignal.set(items as any[]);
        break;
    }
  }

  private updatePagination(
    type: "todos" | "tasks" | "subtasks" | "comments" | "chats",
    skip: number,
    limit: number,
    receivedCount: number
  ): void {
    const paginationSignal = this[`${type}Pagination`] as WritableSignal<{
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
    const paginationSignal = this[`${type}Pagination`] as WritableSignal<{
      skip: number;
      limit: number;
      hasMore: boolean;
    }>;
    paginationSignal.set(defaults);
  }

  // ==================== UPDATE OPERATIONS ====================
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
}
