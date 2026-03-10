/* sys lib */
import { Injectable, signal, computed } from "@angular/core";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";

export type StorageEntity = "todo" | "task" | "subtask" | "category" | "comment" | "profile";

@Injectable({
  providedIn: "root",
})
export class StorageService {
  private privateTodosSignal = signal<Todo[]>([]);
  private sharedTodosSignal = signal<Todo[]>([]);
  private categoriesSignal = signal<Category[]>([]);
  private profileSignal = signal<Profile | null>(null);

  private loadingSignal = signal(false);
  private loadedSignal = signal(false);
  private lastLoadedSignal = signal<Date | null>(null);

  // ==================== PUBLIC SIGNALS ====================

  get privateTodos() {
    return this.privateTodosSignal.asReadonly();
  }
  get sharedTodos() {
    return this.sharedTodosSignal.asReadonly();
  }
  get todos() {
    return computed(() => [...this.privateTodosSignal(), ...this.sharedTodosSignal()]);
  }
  get tasks() {
    return computed(() => this.todos().flatMap((todo) => todo.tasks || []));
  }
  get subtasks() {
    return computed(() => this.tasks().flatMap((task) => task.subtasks || []));
  }
  get categories() {
    return this.categoriesSignal.asReadonly();
  }
  get profile() {
    return this.profileSignal.asReadonly();
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

  setLoading(isLoading: boolean): void {
    this.loadingSignal.set(isLoading);
  }

  setLoaded(isLoaded: boolean): void {
    this.loadedSignal.set(isLoaded);
  }

  setLastLoaded(date: Date | null): void {
    this.lastLoadedSignal.set(date);
  }

  get loading() {
    return this.loadingSignal.asReadonly();
  }
  get loaded() {
    return this.loadedSignal.asReadonly();
  }
  get lastLoaded() {
    return this.lastLoadedSignal.asReadonly();
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
    if (!data.id) return;

    switch (type) {
      case "todo":
        if (this.getTodoById(data.id)) return;
        const signal =
          data.visibility === "private" ? this.privateTodosSignal : this.sharedTodosSignal;
        signal.update((todos) => [data, ...todos]);
        break;

      case "task":
        if (this.getTaskById(data.id)) return;
        this.updateTaskInTodo(data.todoId, data.id, (tasks) =>
          tasks.some((t) => t.id === data.id) ? tasks : [...tasks, data]
        );
        break;

      case "subtask":
        if (this.getSubtaskById(data.id)) return;
        const task = this.getTaskById(data.taskId);
        if (!task) return;
        this.updateSubtaskInTask(task.todoId, data.taskId, data.id, (subtasks) =>
          subtasks.some((s) => s.id === data.id) ? subtasks : [...subtasks, data]
        );
        break;

      case "category":
        if (this.getCategoryById(data.id)) return;
        this.categoriesSignal.update((categories) => [...categories, data]);
        break;

      case "comment":
        this.handleCommentUpdate(data, "add");
        break;

      case "profile":
        this.profileSignal.set(data);
        break;
    }
  }

  updateItem(type: StorageEntity, id: string, updates: Partial<any>): void {
    if (updates["isDeleted"]) {
      this.removeItem(type, id);
      return;
    }

    switch (type) {
      case "todo":
        this.handleTodoUpdate(id, updates);
        break;

      case "task":
        const task = this.getTaskById(id);
        if (!task) return;
        this.updateTaskInTodo(task.todoId, id, (tasks) =>
          tasks.map((t) => (t.id === id ? { ...t, ...updates } : t))
        );
        break;

      case "subtask":
        const subtask = this.getSubtaskById(id);
        if (!subtask) return;
        const parentTask = this.getTaskById(subtask.taskId);
        if (!parentTask) return;
        this.updateSubtaskInTask(parentTask.todoId, subtask.taskId, id, (subtasks) =>
          subtasks.map((s) => (s.id === id ? { ...s, ...updates } : s))
        );
        break;

      case "category":
        this.categoriesSignal.update((categories) =>
          categories.map((c) => (c.id === id ? { ...c, ...updates } : c))
        );
        break;

      case "profile":
        if (this.profileSignal()) {
          this.profileSignal.set({ ...this.profileSignal()!, ...updates });
        }
        break;
    }
  }

  removeItem(type: StorageEntity, id: string): void {
    switch (type) {
      case "todo":
        this.privateTodosSignal.update((todos) => todos.filter((t) => t.id !== id));
        this.sharedTodosSignal.update((todos) => todos.filter((t) => t.id !== id));
        break;

      case "task":
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

      case "subtask":
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

      case "category":
        this.categoriesSignal.update((categories) => categories.filter((c) => c.id !== id));
        break;

      case "comment":
        this.handleCommentUpdate({ id }, "remove");
        break;
    }
  }

  // ==================== PRIVATE HELPERS ====================

  private handleTodoUpdate(todoId: string, updates: Partial<Todo>): void {
    const currentTodo = this.getTodoById(todoId);
    if (!currentTodo) return;

    if (updates.visibility && updates.visibility !== currentTodo.visibility) {
      const updatedTodo = { ...currentTodo, ...updates };
      if (updates.visibility === "private") {
        this.privateTodosSignal.update((todos) => [updatedTodo, ...todos]);
        this.sharedTodosSignal.update((todos) => todos.filter((t) => t.id !== todoId));
      } else {
        this.sharedTodosSignal.update((todos) => [updatedTodo, ...todos]);
        this.privateTodosSignal.update((todos) => todos.filter((t) => t.id !== todoId));
      }
    } else {
      this.privateTodosSignal.update((todos) =>
        todos.map((t) => (t.id === todoId ? { ...t, ...updates } : t))
      );
      this.sharedTodosSignal.update((todos) =>
        todos.map((t) => (t.id === todoId ? { ...t, ...updates } : t))
      );
    }
  }

  private handleCommentUpdate(data: any, action: "add" | "remove"): void {
    if (action === "add") {
      if (!data.id) return;
      if (data.taskId) {
        this.updateItem("task", data.taskId, {
          comments: [...(this.getTaskById(data.taskId)?.comments || []), data],
        });
      } else if (data.subtaskId) {
        this.updateItem("subtask", data.subtaskId, {
          comments: [...(this.getSubtaskById(data.subtaskId)?.comments || []), data],
        });
      }
    } else {
      // Remove comment by searching across all tasks/subtasks
      this.updateTodoSignal("", (todos) =>
        todos.map((todo) => ({
          ...todo,
          tasks: (todo.tasks || []).map((task) => ({
            ...task,
            comments: (task.comments || []).filter((c) => c.id !== data.id),
            subtasks: (task.subtasks || []).map((subtask) => ({
              ...subtask,
              comments: (subtask.comments || []).filter((c) => c.id !== data.id),
            })),
          })),
        }))
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

  // ==================== GETTERS ====================

  getTodoById(todoId: string): Todo | undefined {
    return this.todos().find((todo) => todo.id === todoId);
  }

  getTaskById(taskId: string): Task | undefined {
    return this.tasks().find((task) => task.id === taskId);
  }

  getSubtaskById(subtaskId: string): Subtask | undefined {
    return this.subtasks().find((subtask) => subtask.id === subtaskId);
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
}
