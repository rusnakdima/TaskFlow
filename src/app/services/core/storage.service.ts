/* sys lib */
import { Injectable, signal, computed, inject } from "@angular/core";
/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";

import { BaseStorageService } from "./base-storage.service";
import { EntityIndexService } from "./entity-index.service";
import { StorageCrudService, StorageEntity } from "./storage-crud.service";
import { TodoHandler } from "./entity-handlers/todo.handler";

export type { StorageEntity };

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

@Injectable({ providedIn: "root" })
export class StorageService extends BaseStorageService {
  private entityIndexService = inject(EntityIndexService);
  private crudService = inject(StorageCrudService);

  // ==================== SIGNALS ====================
  private readonly privateTodosSignal = signal<Todo[]>([]);
  private readonly sharedTodosSignal = signal<Todo[]>([]);
  private readonly categoriesSignal = signal<Category[]>([]);
  private readonly profileSignal = signal<Profile | null>(null);
  private readonly profilesSignal = signal<Profile[]>([]);
  private readonly chatsByTodoSignal = signal<Map<string, Chat[]>>(new Map());
  private readonly userSignal = signal<any | null>(null);

  // ==================== COMPUTED SIGNALS ====================
  private readonly todosComputed = computed(() => {
    const allTodos = [...this.privateTodosSignal(), ...this.sharedTodosSignal()];
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
      (todo) => !todo.deleted_at && todo.visibility === "team"
    );
  });

  // ==================== PUBLIC SIGNALS ====================
  readonly privateTodos = this.privateTodosComputed;
  readonly sharedTodos = this.sharedTodosComputed;
  readonly todos = this.todosComputed;
  readonly tasks = computed(() =>
    this.todos().flatMap((todo) => (todo.tasks || []).filter((task) => !task.deleted_at))
  );
  readonly subtasks = computed(() =>
    this.tasks().flatMap((task) => (task.subtasks || []).filter((subtask) => !subtask.deleted_at))
  );
  readonly comments = computed(() => {
    const todos = this.todos();
    const allComments: Comment[] = [];
    todos.forEach((todo) => {
      todo.tasks?.forEach((task) => {
        if (task.comments) {
          allComments.push(...task.comments);
        }
        task.subtasks?.forEach((subtask) => {
          if (subtask.comments) {
            allComments.push(...subtask.comments);
          }
        });
      });
    });
    return allComments;
  });
  readonly categories = this.categoriesSignal.asReadonly();
  readonly profile = this.profileSignal.asReadonly();
  readonly profiles = this.profilesSignal.asReadonly();
  readonly chatsByTodo = this.chatsByTodoSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();

  constructor() {
    super();
    this.crudService.init(
      this.privateTodosSignal,
      this.sharedTodosSignal,
      this.categoriesSignal,
      this.profileSignal,
      this.profilesSignal,
      this.chatsByTodoSignal
    );
  }

  // ==================== INDEX LOOKUPS (delegates to EntityIndexService) ====================
  getTodoIdForTask(taskId: string): string | null {
    return this.entityIndexService.getTodoIdForTask(taskId);
  }

  getTodoIdForSubtask(subtaskId: string): string | null {
    return this.entityIndexService.getTodoIdForSubtask(subtaskId);
  }

  getTaskIdForSubtask(subtaskId: string): string | null {
    return this.entityIndexService.getTaskIdForSubtask(subtaskId);
  }

  private rebuildIndexes(): void {
    this.entityIndexService.rebuildIndexes(this.privateTodosSignal(), this.sharedTodosSignal());
  }

  // ==================== GENERIC CRUD (delegates to StorageCrudService) ====================
  addItem(type: StorageEntity, data: any, options?: { isPrivate?: boolean }): void {
    if (!data?.id) {
      return;
    }
    this.crudService.addItem(type, data, options);
  }

  updateItem(
    type: StorageEntity,
    id: string,
    updates: Partial<any>,
    options?: { isPrivate?: boolean }
  ): void {
    this.crudService.updateItem(type, id, updates, options);
  }

  batchUpdate(
    type: StorageEntity,
    items: { id: string; updates: Partial<any> }[],
    options?: { isPrivate?: boolean }
  ): void {
    this.crudService.batchUpdate(type, items, options);
  }

  removeItem(type: StorageEntity, id: string, parentId?: string, isTeam: boolean = false): void {
    this.crudService.removeItem(type, id, parentId, isTeam);
  }

  // ==================== PUBLIC GETTERS ====================
  getTasksByTodoId(todo_id?: string): Task[] {
    const todo = this.todos().find((t) => t.id === todo_id);
    return todo?.tasks || [];
  }

  getSubtasksByTaskId(task_id?: string): Subtask[] {
    for (const todo of [...this.privateTodosSignal(), ...this.sharedTodosSignal()]) {
      for (const task of todo.tasks || []) {
        if (task.id === task_id) {
          return task.subtasks || [];
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
      return this.chatsByTodoSignal().get(todo_id) || [];
    });
  }

  setChatsByTodo(chats: Chat[], todo_id?: string): void {
    if (!todo_id) return;
    const handler = this.crudService.handlersMap.chats;
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
  }

  clearChatsByTodo(todo_id?: string): void {
    if (!todo_id) return;
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      newMap.delete(todo_id);
      return newMap;
    });
  }

  // ==================== TODO OPERATIONS ====================
  moveTodoToShared(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.getById("todos", todo_id);
    if (!todo) return;

    this.privateTodosSignal.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this.sharedTodosSignal().some((t) => t.id === todo_id)) {
      this.sharedTodosSignal.update((todos) => [
        { ...todo, visibility: "team" },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  moveTodoToPrivate(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.getById("todos", todo_id);
    if (!todo) return;

    this.sharedTodosSignal.update((todos) => todos.filter((t) => t.id !== todo_id));
    if (!this.privateTodosSignal().some((t) => t.id !== todo_id)) {
      this.privateTodosSignal.update((todos) => [
        { ...todo, visibility: "private" },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  removeTodoWithCascade(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.getById("todos", todo_id);
    if (!todo) return;

    const handler = this.crudService.handlersMap.todos as TodoHandler;
    const allTodos = [...this.privateTodosSignal(), ...this.sharedTodosSignal()];
    handler.removeWithCascade(todo_id, allTodos);
  }

  removeRecordWithCascade(table: string, id: string, deletedAt?: string): void {
    if (table === "todos") {
      this.removeTodoWithCascade(id);
    } else if (table === "tasks") {
      const taskHandler = this.crudService.handlersMap.tasks;
      const todoId = this.getTodoIdForTask(id);
      if (deletedAt) {
        (taskHandler as any).softDeleteWithCascade?.(id, deletedAt, todoId ?? undefined);
      } else {
        taskHandler.remove(id, todoId ?? undefined);
        this.entityIndexService.deleteTaskIndex(id);
      }
    } else if (table === "subtasks") {
      const subtaskHandler = this.crudService.handlersMap.subtasks;
      const taskId = this.getTaskIdForSubtask(id);
      if (deletedAt) {
        (subtaskHandler as any).softDeleteWithCascade?.(id, deletedAt, taskId ?? undefined);
      } else {
        subtaskHandler.remove(id, taskId ?? undefined);
        this.entityIndexService.deleteSubtaskIndex(id);
      }
    } else if (table === "comments") {
      if (deletedAt) {
        this.crudService.handlersMap.comments?.update(id, { deleted_at: deletedAt });
      } else {
        this.crudService.handlersMap.comments?.remove(id);
      }
    } else if (table === "chats") {
      this.crudService.handlersMap.chats?.remove(id);
    } else if (table === "categories") {
      this.crudService.handlersMap.categories?.remove(id);
    }
  }

  restoreTodoWithCascade(data: {
    todo: Todo;
    tasks: Task[];
    subtasks: Subtask[];
    comments: Comment[];
    chats?: Chat[];
  }): void {
    const handler = this.crudService.handlersMap.todos as TodoHandler;
    handler.restoreWithCascade(data);
  }

  // ==================== COMMENT OPERATIONS ====================
  addCommentToTask(comment: Comment, task_id?: string): void {
    if (!task_id) return;
    const handler = this.crudService.handlersMap.comments;
    handler.add({ ...comment, task_id: task_id });
  }

  addCommentToSubtask(comment: Comment, subtask_id?: string): void {
    if (!subtask_id) return;
    const handler = this.crudService.handlersMap.comments;
    handler.add({ ...comment, subtask_id: subtask_id });
  }

  removeCommentFromAll(commentId: string): void {
    this.crudService.handlersMap.comments?.remove(commentId);
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

  getById<T extends keyof EntityMap>(type: T, id: string): EntityMap[T] | undefined {
    if (type === "users") {
      return this.userSignal()?.id === id ? this.userSignal() as EntityMap[T] : undefined;
    }
    return this.crudService.getById(type, id);
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
    this.entityIndexService.clearIndexes();
  }

  setCollection<
    T extends "categories" | "profiles" | "privateTodos" | "sharedTodos" | "allProfiles" | "user",
  >(
    type: T,
    items: T extends "profiles"
      ? Profile | null
      : T extends "privateTodos" | "sharedTodos" | "allProfiles"
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
      case "privateTodos":
        this.privateTodosSignal.set(items as Todo[]);
        this.rebuildIndexes();
        break;
      case "sharedTodos":
        this.sharedTodosSignal.set(items as Todo[]);
        this.rebuildIndexes();
        break;
      case "allProfiles":
        this.profilesSignal.set(items as Profile[]);
        break;
      case "user":
        this.userSignal.set(items as any | null);
        break;
    }
  }
}
