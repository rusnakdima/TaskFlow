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
import { NestedEntityHandler } from "./entity-handlers/nested-entity.handler";
import { CommentHandler } from "./entity-handlers/comment.handler";
import { CategoryHandler } from "./entity-handlers/category.handler";
import { ProfileHandler } from "./entity-handlers/profile.handler";
import { ChatHandler } from "./entity-handlers/chat.handler";

import { BaseStorageService } from "./base-storage.service";
import { NotifyService } from "@services/notifications/notify.service";

export type StorageEntity = keyof EntityMap;

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
  // ==================== SIGNALS ====================
  private readonly privateTodosSignal = signal<Todo[]>([]);
  private readonly sharedTodosSignal = signal<Todo[]>([]);
  private readonly publicTodosSignal = signal<Todo[]>([]);
  private readonly categoriesSignal = signal<Category[]>([]);
  private readonly profileSignal = signal<Profile | null>(null);
  private readonly profilesSignal = signal<Profile[]>([]);
  private readonly allProfilesSignal = signal<Profile[]>([]);
  private readonly chatsByTodoSignal = signal<Map<string, Chat[]>>(new Map());
  private readonly userSignal = signal<any | null>(null);

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
    return this.privateTodosSignal().filter(
      (todo) => !todo.deleted_at && todo.visibility === "private"
    );
  });

  private readonly sharedTodosComputed = computed(() => {
    return this.sharedTodosSignal().filter(
      (todo) => !todo.deleted_at && todo.visibility === "shared"
    );
  });

  private readonly publicTodosComputed = computed(() => {
    return this.publicTodosSignal().filter(
      (todo) => !todo.deleted_at && todo.visibility === "public"
    );
  });

  // ==================== PUBLIC SIGNALS ====================
  readonly privateTodos = this.privateTodosComputed;
  readonly sharedTodos = this.sharedTodosComputed;
  readonly publicTodos = this.publicTodosComputed;
  readonly todos = this.todosComputed;
  readonly tasks = computed(() =>
    this.todos().flatMap((todo) =>
      (Array.isArray(todo.tasks) ? todo.tasks : []).filter((task) => !task.deleted_at)
    )
  );
  readonly subtasks = computed(() =>
    this.tasks().flatMap((task) =>
      (Array.isArray(task.subtasks) ? task.subtasks : []).filter((subtask) => !subtask.deleted_at)
    )
  );
  readonly comments = computed(() => {
    const todos = this.todos();
    const allComments: Comment[] = [];
    todos.forEach((todo) => {
      if (Array.isArray(todo.tasks)) {
        todo.tasks.forEach((task) => {
          if (Array.isArray(task.comments)) {
            allComments.push(...task.comments);
          }
          if (Array.isArray(task.subtasks)) {
            task.subtasks.forEach((subtask) => {
              if (Array.isArray(subtask.comments)) {
                allComments.push(...subtask.comments);
              }
            });
          }
        });
      }
    });
    return allComments;
  });
  readonly categories = this.categoriesSignal.asReadonly();
  readonly profile = this.profileSignal.asReadonly();
  readonly profiles = this.profilesSignal.asReadonly();
  readonly allProfiles = this.allProfilesSignal.asReadonly();
  readonly chatsByTodo = this.chatsByTodoSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();

  // ==================== ENTITY HANDLERS ====================
  private readonly handlers = {
    todos: new TodoHandler(this.privateTodosSignal, this.sharedTodosSignal, this.publicTodosSignal),
    tasks: new NestedEntityHandler<Task>(this.privateTodosSignal, this.sharedTodosSignal, "tasks"),
    subtasks: new NestedEntityHandler<Subtask>(
      this.privateTodosSignal,
      this.sharedTodosSignal,
      "subtasks"
    ),
    categories: new CategoryHandler(this.categoriesSignal),
    profiles: new ProfileHandler(this.profileSignal),
    chats: new ChatHandler(this.chatsByTodoSignal),
    comments: new CommentHandler(this.privateTodosSignal, this.sharedTodosSignal),
  };

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

  get handlersMap() {
    return this.handlers;
  }

  // ==================== PUBLIC GETTERS ====================
  getTasksByTodoId(todo_id?: string): Task[] {
    const todo = this.todos().find((t) => t.id === todo_id);
    return Array.isArray(todo?.tasks) ? todo.tasks : [];
  }

  getSubtasksByTaskId(task_id?: string): Subtask[] {
    for (const todo of [...this.privateTodosSignal(), ...this.sharedTodosSignal()]) {
      const tasks = Array.isArray(todo.tasks) ? todo.tasks : [];
      for (const task of tasks) {
        if (task.id === task_id) {
          return Array.isArray(task.subtasks) ? task.subtasks : [];
        }
      }
    }
    return [];
  }

  get pendingTasksCount(): number {
    return this.tasks().filter((t) => t.status === TaskStatus.PENDING).length;
  }

  // ==================== CHAT OPERATIONS ====================
  getChatsByTodo(todo_id?: string): Chat[] {
    if (!todo_id) return [];
    return this.chatsByTodoSignal().get(todo_id) || [];
  }

  getChatsByTodoReactive(todo_id?: string): ReturnType<typeof computed<Chat[]>> {
    return computed(() => {
      if (!todo_id) return [];
      return (this.chatsByTodoSignal().get(todo_id) || []).filter((chat) => !chat.deleted_at);
    });
  }

  private extractChatsFromTodos(todos: Todo[]): void {
    todos.forEach((todo) => {
      if (todo.chats && todo.chats.length > 0) {
        this.chatsByTodoSignal.update((map) => {
          const newMap = new Map(map);
          newMap.set(todo.id, todo.chats!);
          return newMap;
        });
      }
    });
  }

  private updateNestedChatsInTodo(todo_id: string, updater: (chats: Chat[]) => Chat[]): void {
    const updateTodos = (todos: Todo[]) =>
      todos.map((t) => (t.id === todo_id ? { ...t, chats: updater(t.chats || []) } : t));

    const privateTodos = this.privateTodosSignal();
    const sharedTodos = this.sharedTodosSignal();

    if (privateTodos.some((t) => t.id === todo_id)) {
      this.privateTodosSignal.set(updateTodos(privateTodos));
    }
    if (sharedTodos.some((t) => t.id === todo_id)) {
      this.sharedTodosSignal.set(updateTodos(sharedTodos));
    }
  }

  setChatsByTodo(chats: Chat[], todo_id?: string): void {
    if (!todo_id) return;
    const handler = this.handlers.chats;
    handler.setByTodoId(chats, todo_id);
  }

  addChatToTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(todo_id) || [];
      if (!chats.some((c) => c.id === chat.id)) {
        newMap.set(todo_id, [...chats, chat]);
      }
      return newMap;
    });
    this.updateNestedChatsInTodo(todo_id, (chats) =>
      chats.some((c) => c.id === chat.id) ? chats : [...chats, chat]
    );
  }

  updateChatInTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      for (const [tid, chats] of newMap.entries()) {
        if (tid === todo_id) {
          const updatedChats = chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c));
          newMap.set(tid, updatedChats);
          break;
        }
      }
      return newMap;
    });
    this.updateNestedChatsInTodo(todo_id, (chats) =>
      chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c))
    );
  }

  deleteChatFromTodo(chatId: string, todo_id?: string): void {
    if (!todo_id) return;
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(todo_id) || [];
      const filtered = chats.filter((c) => c.id !== chatId);
      if (filtered.length !== chats.length) {
        newMap.set(todo_id, filtered);
      }
      return newMap;
    });
    this.updateNestedChatsInTodo(todo_id, (chats) => chats.filter((c) => c.id !== chatId));
  }

  clearChatsByTodo(todo_id?: string): void {
    if (!todo_id) return;
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      newMap.delete(todo_id);
      return newMap;
    });
    this.updateNestedChatsInTodo(todo_id, () => []);
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
        this.getTasksByTodoId(id).flatMap((t) =>
          (t.subtasks || []).map((s) => ({
            id: s.id,
            updates: { deleted_at: null, updated_at: timestamp },
          }))
        )
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
      const chat = (this.handlers.chats as ChatHandler).getById(id);
      if (chat) {
        this.updateItem("chats", id, { deleted_at: null, updated_at: timestamp });
        this.updateNestedChatsInTodo(chat.todo_id, (chats) =>
          chats.map((c) => (c.id === id ? { ...c, deleted_at: null, updated_at: timestamp } : c))
        );
      }
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
      return this.todos().find((t) => t.id === parentId)?.tasks || ([] as any);
    }
    return this.tasks().find((t) => t.id === parentId)?.subtasks || ([] as any);
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
    this.categoriesSignal.set([]);
    this.profileSignal.set(null);
    this.profilesSignal.set([]);
    this.userSignal.set(null);
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
      | "user",
  >(
    type: T,
    items: T extends "profiles"
      ? Profile | null
      : T extends "privateTodos" | "sharedTodos" | "publicTodos" | "allProfiles"
        ? T extends "allProfiles"
          ? Profile[]
          : Todo[]
        : T extends "user"
          ? any | null
          : Category[]
  ): void {
    switch (type) {
      case "categories":
        this.categoriesSignal.set(items as Category[]);
        break;
      case "profiles":
        this.profileSignal.set(items as Profile | null);
        break;
      case "privateTodos": {
        const privateTodos = items as Todo[];
        this.extractChatsFromTodos(privateTodos);
        this.privateTodosSignal.set(privateTodos);
        break;
      }
      case "sharedTodos": {
        const sharedTodos = items as Todo[];
        this.extractChatsFromTodos(sharedTodos);
        this.sharedTodosSignal.set(sharedTodos);
        break;
      }
      case "publicTodos": {
        const publicTodos = items as Todo[];
        this.extractChatsFromTodos(publicTodos);
        this.publicTodosSignal.set(publicTodos);
        break;
      }
      case "allProfiles":
        this.allProfilesSignal.set(items as Profile[]);
        break;
      case "user":
        this.userSignal.set(items as any | null);
        break;
    }
  }
}

// ==================== UPDATE OPERATIONS ====================
export type Operation = "getAll" | "get" | "create" | "update" | "updateAll" | "delete";

export interface ArchiveDataMap {
  [table: string]: any[];
}

@Injectable({ providedIn: "root" })
export class StorageUpdateService {
  constructor(
    private storageService: StorageService,
    private notifyService: NotifyService
  ) {}

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
          this.storageService.addItem(table as any, result, { isPrivate: !isShared });
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
      const existing = this.storageService.getById("tasks", result.id);
      if (existing) {
        const merged = this.preserveFields(result, existing, ["comments", "subtasks"]);
        this.storageService.updateItem(table as any, result.id, merged, options);
      } else {
        this.storageService.updateItem(table as any, result.id, result, options);
      }
      return;
    }

    if (table === "subtasks") {
      const existing = this.storageService.getById("subtasks", result.id);
      if (existing) {
        const merged = this.preserveFields(result, existing, ["comments"]);
        this.storageService.updateItem(table as any, result.id, merged, options);
      } else {
        this.storageService.updateItem(table as any, result.id, result, options);
      }
      return;
    }

    this.storageService.updateItem(table as any, result.id, result, options);
  }

  private handleDelete(table: string, id?: string, parentTodoId?: string): void {
    if (table === "todos" && id) {
      this.storageService.removeItem("todos", id);
    } else if (table === "tasks" || table === "subtasks") {
      this.storageService.removeRecordWithCascade(table, id!);
    } else if (table === "chats" && id) {
      this.storageService.deleteChatFromTodo(id, parentTodoId);
    } else {
      this.storageService.removeItem(table as any, id!);
    }
  }

  private handleUpdateAll(table: string, result: any, parentTodoId?: string): void {
    if (table === "chats" && result && Array.isArray(result)) {
      const todoId = parentTodoId || (result[0] as any)?.todo_id;
      if (todoId) {
        this.storageService.setChatsByTodo(result, todoId);
      }
    } else {
      (result as any[]).forEach((item) => {
        if (item && item.id) {
          this.storageService.updateItem(table as any, item.id, item, { isPrivate: true });
        }
      });
    }
  }

  preserveFields<T extends Record<string, any>>(
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

  removeRecordWithCascade(data: ArchiveDataMap, table: string, recordId: string): ArchiveDataMap {
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

  getCascadeChildIds(restoredRecord: any): { taskIds: string[]; subtaskIds: string[] } {
    const taskIds = restoredRecord.tasks?.map((t: any) => t.id) || [];
    const subtaskIds =
      restoredRecord.tasks?.flatMap((t: any) => t.subtasks?.map((s: any) => s.id) || []) || [];
    return { taskIds, subtaskIds };
  }

  restoreRecordWithCascade(
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
