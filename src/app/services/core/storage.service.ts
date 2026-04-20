/* sys lib */
import { Injectable, signal, computed, inject, Injector } from "@angular/core";
/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";

import { BaseStorageService } from "./base-storage.service";
import { TodoHandler } from "./entity-handlers/todo.handler";
import { NestedEntityHandler } from "./entity-handlers/nested-entity.handler";
import { CommentHandler } from "./entity-handlers/comment.handler";
import { CategoryHandler } from "./entity-handlers/category.handler";
import { ProfileHandler } from "./entity-handlers/profile.handler";
import { ChatHandler } from "./entity-handlers/chat.handler";
import { ApiProvider } from "@providers/api.provider";

export type StorageEntity = keyof EntityMap;

interface EntityMap {
  todos: Todo;
  tasks: Task;
  subtasks: Subtask;
  categories: Category;
  profiles: Profile;
  chats: Chat;
  comments: Comment;
}

@Injectable({ providedIn: "root" })
export class StorageService extends BaseStorageService {
  private injector = inject(Injector);

  private get dataSyncProvider(): ApiProvider {
    return this.injector.get(ApiProvider);
  }

  // ==================== SIGNALS ====================
  private readonly privateTodosSignal = signal<Todo[]>([]);
  private readonly sharedTodosSignal = signal<Todo[]>([]);
  private readonly categoriesSignal = signal<Category[]>([]);
  private readonly profileSignal = signal<Profile | null>(null);
  private readonly chatsByTodoSignal = signal<Map<string, Chat[]>>(new Map());

  // ==================== ENTITY HANDLERS ====================
  private readonly handlers = {
    todos: new TodoHandler(this.privateTodosSignal, this.sharedTodosSignal),
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

  // ==================== COMPUTED SIGNALS ====================
  private readonly todosComputed = computed(() => {
    const allTodos = [...this.privateTodosSignal(), ...this.sharedTodosSignal()];
    const uniqueTodoMap = new Map<string, Todo>();
    allTodos.forEach((todo) => {
      // Filter out deleted todos
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
        // Add task-level comments
        if (task.comments) {
          allComments.push(...task.comments);
        }
        // Add subtask comments
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
  readonly chatsByTodo = this.chatsByTodoSignal.asReadonly();

  // ==================== GENERIC CRUD ====================
  addItem(type: StorageEntity, data: any, options?: { isPrivate?: boolean }): void {
    this.handlers[type]?.add(data);
    // Note: Local JSON persistence is now handled by ApiProvider
    // isPrivate option kept for backward compatibility but not used here
  }

  updateItem(
    type: StorageEntity,
    id: string,
    updates: Partial<any>,
    options?: { isPrivate?: boolean }
  ): void {
    if (updates["deleted_at"] === true) {
      const existing: any = this.getById(type, id);
      if (existing?.["deleted_at"] === true) return;
    }

    if (type === "todos") {
      const categoriesSignal = this.categoriesSignal;
      this.handlers[type]?.update(id, updates, {
        getCategoryById: (catId: string) => categoriesSignal().find((c) => c.id === catId),
      });
    } else {
      this.handlers[type]?.update(id, updates);
    }
    // Note: Local JSON persistence is now handled by ApiProvider
    // isPrivate option kept for backward compatibility but not used here
  }

  removeItem(type: StorageEntity, id: string, parentId?: string, isTeam: boolean = false): void {
    this.handlers[type]?.remove(id, parentId);
    // Note: Local JSON persistence is now handled by ApiProvider
    // isTeam parameter kept for backward compatibility but not used here
  }

  // ==================== PUBLIC GETTERS ====================
  getTasksByTodoId(todoId: string): Task[] {
    return this.todos().find((t) => t.id === todoId)?.tasks || [];
  }

  getSubtasksByTaskId(taskId: string): Subtask[] {
    return this.tasks().find((t) => t.id === taskId)?.subtasks || [];
  }

  get pendingTasksCount(): number {
    return this.tasks().filter((t) => t.status === TaskStatus.PENDING).length;
  }

  // ==================== CHAT OPERATIONS ====================
  getChatsByTodo(todoId: string): Chat[] {
    return this.chatsByTodoSignal().get(todoId) || [];
  }

  getChatsByTodoReactive(todoId: string): ReturnType<typeof computed<Chat[]>> {
    return computed(() => this.chatsByTodoSignal().get(todoId) || []);
  }

  setChatsByTodo(todoId: string, chats: Chat[]): void {
    const handler = this.handlers.chats as ChatHandler;
    handler.setByTodoId(todoId, chats);
  }

  addChatToTodo(todoId: string, chat: Chat): void {
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(todoId) || [];
      if (!chats.some((c) => c.id === chat.id)) {
        newMap.set(todoId, [chat, ...chats]);
      }
      return newMap;
    });
  }

  updateChatInTodo(todoId: string, chat: Chat): void {
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      for (const [tid, chats] of newMap.entries()) {
        if (tid === todoId) {
          const updatedChats = chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c));
          newMap.set(tid, updatedChats);
          break;
        }
      }
      return newMap;
    });
  }

  deleteChatFromTodo(todoId: string, chatId: string): void {
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(todoId) || [];
      const filtered = chats.filter((c) => c.id !== chatId);
      if (filtered.length !== chats.length) {
        newMap.set(todoId, filtered);
      }
      return newMap;
    });
  }

  clearChatsByTodo(todoId: string): void {
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      newMap.delete(todoId);
      return newMap;
    });
  }

  // ==================== TODO OPERATIONS ====================
  moveTodoToShared(todoId: string): void {
    const todo = this.getById("todos", todoId);
    if (!todo) return;

    this.privateTodosSignal.update((todos) => todos.filter((t) => t.id !== todoId));
    if (!this.sharedTodosSignal().some((t) => t.id === todoId)) {
      this.sharedTodosSignal.update((todos) => [
        { ...todo, visibility: "team" },
        ...todos.filter((t) => t.id !== todoId),
      ]);
    }
  }

  moveTodoToPrivate(todoId: string): void {
    const todo = this.getById("todos", todoId);
    if (!todo) return;

    this.sharedTodosSignal.update((todos) => todos.filter((t) => t.id !== todoId));
    if (!this.privateTodosSignal().some((t) => t.id === todoId)) {
      this.privateTodosSignal.update((todos) => [
        { ...todo, visibility: "private" },
        ...todos.filter((t) => t.id !== todoId),
      ]);
    }
  }

  /**
   * Remove todo with all related data (tasks, subtasks, comments)
   */
  removeTodoWithCascade(todoId: string): void {
    const todo = this.getById("todos", todoId);
    if (!todo) return;

    const handler = this.handlers.todos as TodoHandler;
    const allTodos = [...this.privateTodosSignal(), ...this.sharedTodosSignal()];
    handler.removeWithCascade(todoId, allTodos);
  }

  /**
   * Remove record with cascade for main storage
   */
  removeRecordWithCascade(table: string, id: string): void {
    if (table === "todos") {
      this.removeTodoWithCascade(id);
    } else if (table === "tasks") {
      // Remove task from nested structure
      const taskHandler = this.handlers.tasks as NestedEntityHandler<Task>;
      const todoId = this.todos().find((t) => t.tasks?.some((task) => task.id === id))?.id;
      taskHandler.remove(id, todoId);
    } else if (table === "subtasks") {
      // Remove subtask from nested structure
      const subtaskHandler = this.handlers.subtasks as NestedEntityHandler<Subtask>;
      const taskId = this.tasks().find((t) => t.subtasks?.some((s) => s.id === id))?.id;
      subtaskHandler.remove(id, taskId);
    } else if (table === "comments") {
      this.handlers.comments?.remove(id);
    } else if (table === "chats") {
      this.handlers.chats?.remove(id);
    } else if (table === "categories") {
      this.handlers.categories?.remove(id);
    }
  }

  /**
   * Restore todo with all related data
   */
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

  // ==================== COMMENT OPERATIONS ====================
  addCommentToTask(taskId: string, comment: Comment): void {
    const handler = this.handlers.comments as CommentHandler;
    handler.add({ ...comment, taskId });
  }

  addCommentToSubtask(subtaskId: string, comment: Comment): void {
    const handler = this.handlers.comments as CommentHandler;
    handler.add({ ...comment, subtaskId });
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

  getTodoReactive(todoId: string): ReturnType<typeof computed<Todo | undefined>> {
    return computed(() => this.todos().find((t) => t.id === todoId));
  }

  getTaskReactive(taskId: string): ReturnType<typeof computed<Task | undefined>> {
    return computed(() => this.tasks().find((t) => t.id === taskId));
  }

  // ==================== UTILITY METHODS ====================
  getById<T extends keyof EntityMap>(type: T, id: string): EntityMap[T] | undefined {
    return this.handlers[type]?.getById(id) as EntityMap[T] | undefined;
  }

  clear(): void {
    this.privateTodosSignal.set([]);
    this.sharedTodosSignal.set([]);
    this.categoriesSignal.set([]);
    this.profileSignal.set(null);
    this.loadedSignal.set(false);
    this.lastLoadedSignal.set(null);
  }

  setCollection<T extends "categories" | "profiles" | "privateTodos" | "sharedTodos">(
    type: T,
    items: T extends "profiles"
      ? Profile | null
      : T extends "privateTodos" | "sharedTodos"
        ? Todo[]
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
        break;
      case "sharedTodos":
        this.sharedTodosSignal.set(items as Todo[]);
        break;
    }
  }
}
