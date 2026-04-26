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

  // ==================== SIGNALS ====================
  private readonly privateTodosSignal = signal<Todo[]>([]);
  private readonly sharedTodosSignal = signal<Todo[]>([]);
  private readonly categoriesSignal = signal<Category[]>([]);
  private readonly profileSignal = signal<Profile | null>(null);
  private readonly profilesSignal = signal<Profile[]>([]);
  private readonly chatsByTodoSignal = signal<Map<string, Chat[]>>(new Map());
  private readonly userSignal = signal<any | null>(null);

  // ==================== INDEX MAPS ====================
  private readonly taskToTodoIndex = new Map<string, string>();
  private readonly subtaskToTaskIndex = new Map<string, string>();

  // ==================== ENTITY HANDLERS ====================
  private readonly handlers = {
    todos: new TodoHandler(this.privateTodosSignal, this.sharedTodosSignal),
    tasks: new NestedEntityHandler<Task>(this.privateTodosSignal, this.sharedTodosSignal, "tasks", {
      getTodoIdForTask: (id: string) => this.getTodoIdForTask(id),
      getTaskIdForSubtask: (id: string) => this.getTaskIdForSubtask(id),
    }),
    subtasks: new NestedEntityHandler<Subtask>(
      this.privateTodosSignal,
      this.sharedTodosSignal,
      "subtasks",
      {
        getTodoIdForTask: (id: string) => this.getTodoIdForTask(id),
        getTaskIdForSubtask: (id: string) => this.getTaskIdForSubtask(id),
      }
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
  readonly profiles = this.profilesSignal.asReadonly();
  readonly chatsByTodo = this.chatsByTodoSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();

  // ==================== INDEX LOOKUPS ====================
  getTodoIdForTask(taskId: string): string | null {
    return this.taskToTodoIndex.get(taskId) ?? null;
  }

  getTodoIdForSubtask(subtaskId: string): string | null {
    const taskId = this.subtaskToTaskIndex.get(subtaskId);
    return taskId ? (this.taskToTodoIndex.get(taskId) ?? null) : null;
  }

  getTaskIdForSubtask(subtaskId: string): string | null {
    return this.subtaskToTaskIndex.get(subtaskId) ?? null;
  }

  private rebuildIndexes(): void {
    this.taskToTodoIndex.clear();
    this.subtaskToTaskIndex.clear();
    const allTodos = [...this.privateTodosSignal(), ...this.sharedTodosSignal()];
    for (const todo of allTodos) {
      for (const task of todo.tasks || []) {
        if (task.id) {
          this.taskToTodoIndex.set(task.id, todo.id);
          for (const subtask of task.subtasks || []) {
            if (subtask.id) {
              this.subtaskToTaskIndex.set(subtask.id, task.id);
            }
          }
        }
      }
    }
  }

  // ==================== GENERIC CRUD ====================
  addItem(type: StorageEntity, data: any, options?: { isPrivate?: boolean }): void {
    this.updateIndexesForEntity(type, data);
    this.handlers[type]?.add(data);
  }

  private updateIndexesForEntity(type: StorageEntity, data: any): void {
    if (type === "todos" && data.id) {
      data.tasks?.forEach((task: Task) => {
        if (task.id) {
          this.taskToTodoIndex.set(task.id, data.id);
          task.subtasks?.forEach((sub: Subtask) => {
            if (sub.id) this.subtaskToTaskIndex.set(sub.id, task.id);
          });
        }
      });
    } else if (type === "tasks" && data.id && data.todo_id) {
      this.taskToTodoIndex.set(data.id, data.todo_id);
    } else if (type === "subtasks" && data.id && data.task_id) {
      this.subtaskToTaskIndex.set(data.id, data.task_id);
    }
  }

  updateItem(
    type: StorageEntity,
    id: string,
    updates: Partial<any>,
    options?: { isPrivate?: boolean }
  ): void {
    if (updates["deleted_at"]) {
      const existing: any = this.getById(type, id);
      if (existing?.["deleted_at"]) return;
    }

    // If tasks are being updated/added inside a todo, ensure indexes are maintained
    if (type === "todos" && updates["tasks"]) {
      this.updateIndexesForEntity("todos", { id, ...updates });
    }

    if (type === "todos") {
      const categoriesSignal = this.categoriesSignal;
      this.handlers[type]?.update(id, updates, {
        getCategoryById: (catId: string) => categoriesSignal().find((c) => c.id === catId),
      });
    } else {
      this.handlers[type]?.update(id, updates);
    }
  }

  removeItem(type: StorageEntity, id: string, parentId?: string, isTeam: boolean = false): void {
    if (type === "tasks") {
      this.taskToTodoIndex.delete(id);
    } else if (type === "subtasks") {
      this.subtaskToTaskIndex.delete(id);
    }
    this.handlers[type]?.remove(id, parentId);
  }

  // ==================== PUBLIC GETTERS ====================
  getTasksByTodoId(todo_id?: string): Task[] {
    return this.todos().find((t) => t.id === todo_id)?.tasks || [];
  }

  getSubtasksByTaskId(task_id?: string): Subtask[] {
    return this.tasks().find((t) => t.id === task_id)?.subtasks || [];
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
    const handler = this.handlers.chats as ChatHandler;
    handler.setByTodoId(chats, todo_id);
  }

  addChatToTodo(chat: Chat, todo_id?: string): void {
    if (!todo_id) return;
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(todo_id) || [];
      if (!chats.some((c) => c.id === chat.id)) {
        newMap.set(todo_id, [chat, ...chats]);
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
    if (!this.privateTodosSignal().some((t) => t.id === todo_id)) {
      this.privateTodosSignal.update((todos) => [
        { ...todo, visibility: "private" },
        ...todos.filter((t) => t.id !== todo_id),
      ]);
    }
  }

  /**
   * Remove todo with all related data (tasks, subtasks, comments)
   */
  removeTodoWithCascade(todo_id?: string): void {
    if (!todo_id) return;
    const todo = this.getById("todos", todo_id);
    if (!todo) return;

    const handler = this.handlers.todos as TodoHandler;
    const allTodos = [...this.privateTodosSignal(), ...this.sharedTodosSignal()];
    handler.removeWithCascade(todo_id, allTodos);
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
      const todoId = this.getTodoIdForTask(id);
      taskHandler.remove(id, todoId ?? undefined);
      this.taskToTodoIndex.delete(id);
    } else if (table === "subtasks") {
      // Remove subtask from nested structure
      const subtaskHandler = this.handlers.subtasks as NestedEntityHandler<Subtask>;
      const taskId = this.getTaskIdForSubtask(id);
      subtaskHandler.remove(id, taskId ?? undefined);
      this.subtaskToTaskIndex.delete(id);
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
  addCommentToTask(comment: Comment, task_id?: string): void {
    if (!task_id) return;
    const handler = this.handlers.comments as CommentHandler;
    handler.add({ ...comment, task_id: task_id });
  }

  addCommentToSubtask(comment: Comment, subtask_id?: string): void {
    if (!subtask_id) return;
    const handler = this.handlers.comments as CommentHandler;
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

  // ==================== UTILITY METHODS ====================
  getById<T extends keyof EntityMap>(type: T, id: string): EntityMap[T] | undefined {
    return this.handlers[type]?.getById(id) as EntityMap[T] | undefined;
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
    this.taskToTodoIndex.clear();
    this.subtaskToTaskIndex.clear();
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
