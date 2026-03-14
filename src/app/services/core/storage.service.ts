/* sys lib */
import { Injectable, signal, computed } from "@angular/core";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Comment as CommentModel } from "@models/comment.model";
import { Chat } from "@models/chat.model";

/* base */
import { BaseStorageService } from "./base-storage.service";

export type StorageEntity = "todos" | "tasks" | "subtasks" | "categories" | "comments" | "profiles" | "chats";

@Injectable({
  providedIn: "root",
})
export class StorageService extends BaseStorageService {
  private privateTodosSignal = signal<Todo[]>([]);
  private sharedTodosSignal = signal<Todo[]>([]);
  private categoriesSignal = signal<Category[]>([]);
  private profileSignal = signal<Profile | null>(null);
  private chatsByTodoSignal = signal<Map<string, Chat[]>>(new Map());

  // Computed signals created once (not in getters)
  private todosComputed = computed(() => {
    const allTodos = [...this.privateTodosSignal(), ...this.sharedTodosSignal()];
    const uniqueTodoMap = new Map<string, Todo>();
    const conflicts: string[] = [];

    allTodos.forEach((todo) => {
      if (uniqueTodoMap.has(todo.id)) {
        const existing = uniqueTodoMap.get(todo.id)!;
        if (todo.updatedAt && existing.updatedAt) {
          const todoDate = new Date(todo.updatedAt).getTime();
          const existingDate = new Date(existing.updatedAt).getTime();
          if (todoDate > existingDate) {
            conflicts.push(todo.id);
            uniqueTodoMap.set(todo.id, todo);
          } else {
            conflicts.push(todo.id);
          }
        } else {
          conflicts.push(todo.id);
        }
      } else {
        uniqueTodoMap.set(todo.id, todo);
      }
    });

    if (conflicts.length > 0) {
      // Conflicts detected but auto-resolved
    }

    return Array.from(uniqueTodoMap.values());
  });

  private tasksComputed = computed(() => this.todosComputed().flatMap((todo) => todo.tasks || []));
  private subtasksComputed = computed(() =>
    this.tasksComputed().flatMap((task) => task.subtasks || [])
  );

  // ==================== PUBLIC SIGNALS ====================

  get privateTodos() {
    return this.privateTodosSignal.asReadonly();
  }
  get sharedTodos() {
    return this.sharedTodosSignal.asReadonly();
  }
  get todos() {
    return this.todosComputed;
  }
  get tasks() {
    return this.tasksComputed;
  }
  get subtasks() {
    return this.subtasksComputed;
  }
  get categories() {
    return this.categoriesSignal.asReadonly();
  }
  get profile() {
    return this.profileSignal.asReadonly();
  }

  get chatsByTodo() {
    return this.chatsByTodoSignal.asReadonly();
  }

  // Setters
  setCategories(categories: Category[]): void {
    this.categoriesSignal.set(categories);
  }

  setPrivateTodos(todos: Todo[]): void {
    this.privateTodosSignal.set(todos);
  }

  setSharedTodos(todos: Todo[]): void {
    this.sharedTodosSignal.set(todos);
  }

  setProfile(profile: Profile | null): void {
    this.profileSignal.set(profile);
  }

  setChatsByTodo(todoId: string, chats: Chat[]): void {
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      newMap.set(todoId, chats);
      return newMap;
    });
  }

  addChatToTodo(todoId: string, chat: Chat): void {
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(todoId) || [];
      // Prevent duplicates - check if chat with same id already exists
      if (!chats.some((c) => c.id === chat.id)) {
        newMap.set(todoId, [...chats, chat]);
      }
      return newMap;
    });
  }

  updateChatInTodo(todoId: string, chat: Chat): void {
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(todoId) || [];
      const index = chats.findIndex((c) => c.id === chat.id);
      if (index !== -1) {
        chats[index] = chat;
        newMap.set(todoId, chats);
      }
      return newMap;
    });
  }

  deleteChatFromTodo(todoId: string, chatId: string): void {
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      const chats = newMap.get(todoId) || [];
      newMap.set(todoId, chats.filter((c) => c.id !== chatId));
      return newMap;
    });
  }

  getChatsByTodo(todoId: string): Chat[] {
    return this.chatsByTodoSignal().get(todoId) || [];
  }

  clearChatsByTodo(todoId: string): void {
    this.chatsByTodoSignal.update((map) => {
      const newMap = new Map(map);
      newMap.set(todoId, []);
      return newMap;
    });
  }

  // ==================== COMPUTED SIGNALS ====================

  getTasksByTodoId(todoId: string) {
    return computed(() => this.todos().find((t) => t.id === todoId)?.tasks || []);
  }

  getSubtasksByTaskId(taskId: string) {
    return computed(() => this.tasks().find((t) => t.id === taskId)?.subtasks || []);
  }

  get completedTasksCount() {
    return computed(
      () =>
        this.tasks().filter(
          (task) => task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED
        ).length
    );
  }

  get pendingTasksCount() {
    return computed(() => this.tasks().filter((task) => task.status === TaskStatus.PENDING).length);
  }

  // ==================== GENERIC CRUD METHODS ====================

  addItem(type: StorageEntity, data: any): void {
    if (!data.id) {
      return;
    }

    switch (type) {
      case "todos":
        if (this.getTodoById(data.id)) {
          console.warn(`[StorageService] Todo with id ${data.id} already exists`);
          return;
        }
        const signal =
          data.visibility === "private" ? this.privateTodosSignal : this.sharedTodosSignal;
        signal.update((todos) => [data, ...todos]);
        break;

      case "tasks":
        if (this.getTaskById(data.id)) return;
        this.updateTaskInTodo(data.todoId, data.id, (tasks) =>
          tasks.some((t) => t.id === data.id) ? tasks : [...tasks, data]
        );
        // Also ensure the todo's tasks array has subtasks initialized
        this.ensureTaskHasSubtasks(data.todoId, data.id);
        break;

      case "subtasks":
        if (this.getSubtaskById(data.id)) return;
        const task = this.getTaskById(data.taskId);
        if (!task) return;
        this.updateSubtaskInTask(task.todoId, data.taskId, data.id, (subtasks) =>
          subtasks.some((s) => s.id === data.id) ? subtasks : [...subtasks, data]
        );
        break;

      case "categories":
        if (this.getCategoryById(data.id)) return;
        this.categoriesSignal.update((categories) => [...categories, data]);
        break;

      case "comments":
        this.handleCommentUpdate(data, "add");
        break;

      case "profiles":
        this.profileSignal.set(data);
        break;

      case "chats":
        this.addChatToTodo(data.todoId, data);
        break;
    }
  }

  updateItem(type: StorageEntity, id: string, updates: Partial<any>): void {
    // Prevent infinite loops by checking if update would change anything
    if (updates["isDeleted"] !== undefined) {
      // For soft delete/restore operations, check if item already has same isDeleted value
      const existing = this.getExistingItem(type, id);
      if (existing && existing["isDeleted"] === updates["isDeleted"]) {
        // Item already has this isDeleted value, skip update to prevent loops
        return;
      }
    }

    switch (type) {
      case "todos":
        this.handleTodoUpdate(id, updates);
        break;

      case "tasks":
        const task = this.getTaskById(id);
        if (!task) return;
        this.updateTaskInTodo(task.todoId, id, (tasks) =>
          tasks.map((t) => (t.id === id ? { ...t, ...updates } : t))
        );
        break;

      case "subtasks":
        const subtask = this.getSubtaskById(id);
        if (!subtask) return;
        const parentTask = this.getTaskById(subtask.taskId);
        if (!parentTask) return;
        this.updateSubtaskInTask(parentTask.todoId, subtask.taskId, id, (subtasks) =>
          subtasks.map((s) => (s.id === id ? { ...s, ...updates } : s))
        );
        break;

      case "categories":
        this.categoriesSignal.update((categories) =>
          categories.map((c) => (c.id === id ? { ...c, ...updates } : c))
        );
        break;

      case "profiles":
        if (this.profileSignal()) {
          this.profileSignal.set({ ...this.profileSignal()!, ...updates });
        }
        break;

      case "chats":
        this.updateChatInTodo((updates as any).todoId, { ...(updates as any), id });
        break;
    }
  }

  /**
   * Helper to get existing item by type and id
   */
  private getExistingItem(type: StorageEntity, id: string): any {
    switch (type) {
      case "todos":
        return this.getTodoById(id);
      case "tasks":
        return this.getTaskById(id);
      case "subtasks":
        return this.getSubtaskById(id);
      case "categories":
        return this.getCategoryById(id);
      case "chats":
        // Find chat by id
        const chatsMap = this.chatsByTodoSignal();
        for (const chats of chatsMap.values()) {
          const found = chats.find((c) => c.id === id);
          if (found) return found;
        }
        return null;
      default:
        return null;
    }
  }

  removeItem(type: StorageEntity, id: string): void {
    switch (type) {
      case "todos":
        this.privateTodosSignal.update((todos) => todos.filter((t) => t.id !== id));
        this.sharedTodosSignal.update((todos) => todos.filter((t) => t.id !== id));
        // Also clear chats for this todo
        this.clearChatsByTodo(id);
        break;

      case "tasks":
        const task = this.getTaskById(id);
        if (!task) return;
        this.updateTodoSignal(task.todoId, (todos) =>
          todos.map((todo) =>
            todo.id === task.todoId
              ? { ...todo, tasks: (todo.tasks || []).filter((t) => t.id !== id) }
              : todo
          )
        );
        break;

      case "subtasks":
        const subtask = this.getSubtaskById(id);
        if (!subtask) return;
        const parentTask = this.getTaskById(subtask.taskId);
        if (!parentTask) return;
        this.updateTodoSignal(parentTask.todoId, (todos) =>
          todos.map((todo) => {
            if (todo.id !== parentTask.todoId) return todo;
            return {
              ...todo,
              tasks: (todo.tasks || []).map((t) =>
                t.id === subtask.taskId
                  ? { ...t, subtasks: (t.subtasks || []).filter((s) => s.id !== id) }
                  : t
              ),
            };
          })
        );
        break;

      case "categories":
        this.categoriesSignal.update((categories) => categories.filter((c) => c.id !== id));
        break;

      case "comments":
        // Remove comment from all tasks and subtasks
        this.removeCommentFromAll(id);
        break;

      case "chats":
        // Find todoId from chats storage
        const chatsMap = this.chatsByTodoSignal();
        for (const [todoId, chats] of chatsMap.entries()) {
          if (chats.some((c) => c.id === id)) {
            this.deleteChatFromTodo(todoId, id);
            break;
          }
        }
        break;
    }
  }

  // ==================== PRIVATE HELPERS ====================

  private handleTodoUpdate(todoId: string, updates: Partial<Todo>): void {
    const currentTodo = this.getTodoById(todoId);
    if (!currentTodo) {
      return;
    }

    const isFullReplacement = updates.tasks !== undefined;

    if (updates.visibility && updates.visibility !== currentTodo.visibility) {
      const updatedTodo: Todo =
        isFullReplacement && updates.id && updates.userId
          ? (updates as Todo)
          : { ...currentTodo, ...updates };
      if (updates.visibility === "private") {
        this.privateTodosSignal.update((todos) => [updatedTodo, ...todos]);
        this.sharedTodosSignal.update((todos) => todos.filter((t) => t.id !== todoId));
      } else {
        this.sharedTodosSignal.update((todos) => [updatedTodo, ...todos]);
        this.privateTodosSignal.update((todos) => todos.filter((t) => t.id !== todoId));
      }
    } else {
      const isInPrivate = this.privateTodosSignal().some((t) => t.id === todoId);
      const isInShared = this.sharedTodosSignal().some((t) => t.id === todoId);

      if (isInPrivate) {
        this.privateTodosSignal.update((todos) =>
          todos.map((t) => (t.id === todoId ? { ...t, ...updates } : t))
        );
      }
      if (isInShared) {
        this.sharedTodosSignal.update((todos) =>
          todos.map((t) => (t.id === todoId ? { ...t, ...updates } : t))
        );
      }
    }
  }

  private handleCommentUpdate(data: any, action: "add" | "remove"): void {
    if (action === "add") {
      if (!data.id) return;
      if (data.taskId) {
        this.updateItem("tasks", data.taskId, {
          comments: [...(this.getTaskById(data.taskId)?.comments || []), data],
        });
      } else if (data.subtaskId) {
        this.updateItem("subtasks", data.subtaskId, {
          comments: [...(this.getSubtaskById(data.subtaskId)?.comments || []), data],
        });
      }
    } else {
      // Remove comment by searching across all tasks/subtasks
      this.updateTodoSignal("", (todos) =>
        todos.map((todo) => {
          const hasTasks = todo.tasks && todo.tasks.length > 0;
          if (!hasTasks) return todo;
          
          return {
            ...todo,
            tasks: todo.tasks.map((task) => {
              const hasTaskComments = task.comments && task.comments.length > 0;
              const hasSubtasks = task.subtasks && task.subtasks.length > 0;
              
              // Skip if no comments and no subtasks to process
              if (!hasTaskComments && !hasSubtasks) return task;
              
              return {
                ...task,
                comments: hasTaskComments 
                  ? task.comments.filter((c) => c.id !== data.id)
                  : task.comments,
                subtasks: hasSubtasks
                  ? task.subtasks.map((subtask) => ({
                      ...subtask,
                      comments: (subtask.comments && subtask.comments.length > 0)
                        ? subtask.comments.filter((c) => c.id !== data.id)
                        : subtask.comments,
                    }))
                  : task.subtasks,
              };
            }),
          };
        })
      );
    }
  }

  private updateTodoSignal(todoId: string, updateFn: (todos: Todo[]) => Todo[]): void {
    if (todoId === "") {
      this.privateTodosSignal.update(updateFn);
      this.sharedTodosSignal.update(updateFn);
      return;
    }

    if (this.privateTodosSignal().some((t) => t.id === todoId)) {
      this.privateTodosSignal.update(updateFn);
    } else if (this.sharedTodosSignal().some((t) => t.id === todoId)) {
      this.sharedTodosSignal.update(updateFn);
    }
  }

  private updateTaskInTodo(
    todoId: string,
    taskId: string,
    updateFn: (tasks: Task[]) => Task[]
  ): void {
    this.updateTodoSignal(todoId, (todos) =>
      todos.map((todo) => {
        if (todo.id !== todoId) return todo;
        return { ...todo, tasks: updateFn(todo.tasks || []) };
      })
    );
  }

  private updateSubtaskInTask(
    todoId: string,
    taskId: string,
    subtaskId: string,
    updateFn: (subtasks: Subtask[]) => Subtask[]
  ): void {
    this.updateTodoSignal(todoId, (todos) =>
      todos.map((todo) => {
        if (todo.id !== todoId) return todo;
        return {
          ...todo,
          tasks: (todo.tasks || []).map((task) => {
            if (task.id !== taskId) return task;
            return { ...task, subtasks: updateFn(task.subtasks || []) };
          }),
        };
      })
    );
  }

  // Ensure a task has subtasks array initialized (for resolver completeness check)
  private ensureTaskHasSubtasks(todoId: string, taskId: string): void {
    this.updateTodoSignal(todoId, (todos) =>
      todos.map((todo) => {
        if (todo.id !== todoId) return todo;
        return {
          ...todo,
          tasks: (todo.tasks || []).map((task) => {
            if (task.id !== taskId && task.subtasks === undefined) {
              // Initialize subtasks for other tasks that don't have it
              return { ...task, subtasks: [] };
            }
            if (task.id === taskId && task.subtasks === undefined) {
              // Initialize subtasks for the new task
              return { ...task, subtasks: [] };
            }
            return task;
          }),
        };
      })
    );
  }

  // ==================== COMMENT HELPERS ====================
  // These methods update comments in tasks/subtasks via storage signals

  addCommentToTask(taskId: string, comment: CommentModel): void {
    const task = this.getTaskById(taskId);
    if (!task) return;

    this.updateTodoSignal(task.todoId, (todos) =>
      todos.map((todo) => {
        if (todo.id !== task.todoId) return todo;
        return {
          ...todo,
          tasks: (todo.tasks || []).map((t) =>
            t.id === taskId ? ({ ...t, comments: [...(t.comments || []), comment] } as Task) : t
          ),
        };
      })
    );
  }

  removeCommentFromTask(taskId: string, commentId: string): void {
    const task = this.getTaskById(taskId);
    if (!task) return;
    if (!task.comments || task.comments.length === 0) return;

    this.updateTodoSignal(task.todoId, (todos) =>
      todos.map((todo) => {
        if (todo.id !== task.todoId) return todo;
        return {
          ...todo,
          tasks: (todo.tasks || []).map((t) =>
            t.id === taskId
              ? ({ ...t, comments: (t.comments || []).filter((c) => c.id !== commentId) } as Task)
              : t
          ),
        };
      })
    );
  }

  addCommentToSubtask(subtaskId: string, comment: CommentModel): void {
    const subtask = this.getSubtaskById(subtaskId);
    if (!subtask) return;

    const task = this.getTaskById(subtask.taskId);
    if (!task) return;

    this.updateTodoSignal(task.todoId, (todos) =>
      todos.map((todo) => {
        if (todo.id !== task.todoId) return todo;
        return {
          ...todo,
          tasks: (todo.tasks || []).map((t) =>
            t.id === subtask.taskId
              ? {
                  ...t,
                  subtasks: (t.subtasks || []).map((s) =>
                    s.id === subtaskId
                      ? ({ ...s, comments: [...(s.comments || []), comment] } as Subtask)
                      : s
                  ),
                }
              : t
          ),
        };
      })
    );
  }

  removeCommentFromSubtask(subtaskId: string, commentId: string): void {
    const subtask = this.getSubtaskById(subtaskId);
    if (!subtask) return;
    if (!subtask.comments || subtask.comments.length === 0) return;

    const task = this.getTaskById(subtask.taskId);
    if (!task) return;

    this.updateTodoSignal(task.todoId, (todos) =>
      todos.map((todo) => {
        if (todo.id !== task.todoId) return todo;
        return {
          ...todo,
          tasks: (todo.tasks || []).map((t) =>
            t.id === subtask.taskId
              ? {
                  ...t,
                  subtasks: (t.subtasks || []).map((s) =>
                    s.id === subtaskId
                      ? ({
                          ...s,
                          comments: (s.comments || []).filter((c) => c.id !== commentId),
                        } as Subtask)
                      : s
                  ),
                }
              : t
          ),
        };
      })
    );
  }

  /**
   * Remove comment from all tasks and subtasks (used by WebSocketService)
   */
  removeCommentFromAll(commentId: string): void {
    this.updateTodoSignal("", (todos) =>
      todos.map((todo) => ({
        ...todo,
        tasks: (todo.tasks || []).map((task) => {
          const hasTaskComments = task.comments && task.comments.length > 0;
          const hasSubtasks = task.subtasks && task.subtasks.length > 0;
          
          // Skip if no comments and no subtasks to process
          if (!hasTaskComments && !hasSubtasks) return task;
          
          return {
            ...task,
            comments: hasTaskComments 
              ? task.comments.filter((c) => c.id !== commentId)
              : task.comments,
            subtasks: hasSubtasks
              ? task.subtasks.map((subtask) => ({
                  ...subtask,
                  comments: (subtask.comments && subtask.comments.length > 0)
                    ? subtask.comments.filter((c) => c.id !== commentId)
                    : subtask.comments,
                }))
              : task.subtasks,
          };
        }),
      }))
    );
  }

  // ==================== GETTERS ====================

  getTodoById(todoId: string): Todo | undefined {
    return this.todos().find((todo) => todo.id === todoId);
  }

  getTaskById(taskId: string): Task | undefined {
    return this.tasks().find((task) => task.id === taskId);
  }

  getAllTasksByTodoId(todoId: string): Task[] {
    return this.tasks().filter((task) => task.todoId === todoId);
  }

  getSubtaskById(subtaskId: string): Subtask | undefined {
    return this.subtasks().find((subtask) => subtask.id === subtaskId);
  }

  getAllSubtasksByTaskId(taskId: string): Subtask[] {
    return this.subtasks().filter((subtask) => subtask.taskId === taskId);
  }

  getCategoryById(categoryId: string): Category | undefined {
    return this.categoriesSignal().find((cat) => cat.id === categoryId);
  }

  clear(): void {
    this.privateTodosSignal.set([]);
    this.sharedTodosSignal.set([]);
    this.categoriesSignal.set([]);
    this.profileSignal.set(null);
    this.loadedSignal.set(false);
    this.lastLoadedSignal.set(null);
  }

  /**
   * Move a todo from private to shared (for visibility change: private -> team)
   */
  moveTodoToShared(todoId: string): void {
    const todo = this.getTodoById(todoId);
    if (!todo) return;

    // Remove from private
    this.privateTodosSignal.update((todos) => todos.filter((t) => t.id !== todoId));

    // Add to shared if not already there
    if (!this.sharedTodosSignal().some((t) => t.id === todoId)) {
      const updatedTodo = { ...todo, visibility: "team" as const };
      this.sharedTodosSignal.update((todos) => [updatedTodo, ...todos]);
    }
  }

  /**
   * Move a todo from shared to private (for visibility change: team -> private)
   */
  moveTodoToPrivate(todoId: string): void {
    const todo = this.getTodoById(todoId);
    if (!todo) return;

    // Remove from shared
    this.sharedTodosSignal.update((todos) => todos.filter((t) => t.id !== todoId));

    // Add to private if not already there
    if (!this.privateTodosSignal().some((t) => t.id === todoId)) {
      const updatedTodo = { ...todo, visibility: "private" as const };
      this.privateTodosSignal.update((todos) => [updatedTodo, ...todos]);
    }
  }
}
