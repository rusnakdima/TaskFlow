/* sys lib */
import { Injectable, signal, computed, inject } from "@angular/core";
import { Observable, of, forkJoin } from "rxjs";
import { tap, switchMap, map } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* services */
import { AuthService } from "@services/auth.service";
import { LocalWebSocketService } from "@services/local-websocket.service";

@Injectable({
  providedIn: "root",
})
export class StorageService {
  private authService = inject(AuthService);
  private dataSyncProvider = inject(DataSyncProvider);
  private localWs = inject(LocalWebSocketService);

  private privateTodosSignal = signal<Todo[]>([]);
  private sharedTodosSignal = signal<Todo[]>([]);
  private categoriesSignal = signal<Category[]>([]);
  private profileSignal = signal<Profile | null>(null);

  private loadingSignal = signal(false);
  private loadedSignal = signal(false);
  private lastLoadedSignal = signal<Date | null>(null);

  private userId = "";

  private readonly CACHE_EXPIRY_MS = 2 * 60 * 1000;

  constructor() {
    this.initWebSocketListeners();
  }

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

  setProfile(profile: Profile): void {
    this.profileSignal.set(profile);
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

  // ==================== PRIVATE HELPERS ====================

  private updateTodoSignal(todoId: string, updateFn: (todos: Todo[]) => Todo[]): void {
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

  // ==================== INITIALIZATION ====================

  init(userId?: string): void {
    this.userId = userId || this.authService.getValueByKey("id") || "";
  }

  private initWebSocketListeners(): void {
    window.addEventListener("ws-todo-created", () => this.loadAllData(true).subscribe());
    window.addEventListener("ws-todo-updated", () => this.loadAllData(true).subscribe());
    window.addEventListener("ws-todo-deleted", () => this.loadAllData(true).subscribe());

    this.localWs.onEvent("task-updated").subscribe((data) => this.updateTask(data.id, data));
    this.localWs.onEvent("task-deleted").subscribe((data) => this.removeTask(data.id));
    this.localWs.onEvent("subtask-updated").subscribe((data) => this.updateSubtask(data.id, data));
    this.localWs.onEvent("subtask-deleted").subscribe((data) => this.removeSubtask(data.id));
  }

  private isCacheValid(): boolean {
    if (!this.loadedSignal()) return false;
    const lastLoaded = this.lastLoadedSignal();
    if (!lastLoaded) return false;
    return new Date().getTime() - lastLoaded.getTime() < this.CACHE_EXPIRY_MS;
  }

  // ==================== DATA LOADING ====================

  loadAllData(force: boolean = false): Observable<any> {
    if (!this.userId) this.userId = this.authService.getValueByKey("id") || "";

    const hasData = this.privateTodosSignal().length > 0 || this.sharedTodosSignal().length > 0;
    if (!hasData) force = true;

    if (!force && this.isCacheValid()) {
      return of({ todos: this.todos(), categories: this.categoriesSignal() });
    }

    if (this.loadingSignal()) return of(null);

    this.loadingSignal.set(true);
    const todoRelations = RelationsHelper.getTodoRelations();

    return this.dataSyncProvider.get<Profile>("profiles", { userId: this.userId }).pipe(
      switchMap((profile) => {
        this.profileSignal.set(profile);
        const profileId = profile?.id || "";

        return forkJoin({
          privateTodos: this.dataSyncProvider.getAll<Todo>(
            "todos",
            { userId: this.userId, visibility: "private" },
            { isOwner: true, isPrivate: true, relations: todoRelations }
          ),
          teamTodosOwner: this.dataSyncProvider.getAll<Todo>(
            "todos",
            { userId: this.userId, visibility: "team" },
            { isOwner: true, isPrivate: false, relations: todoRelations }
          ),
          teamTodosAssignee: this.dataSyncProvider.getAll<Todo>(
            "todos",
            { assignees: profileId, visibility: "team" },
            { isOwner: false, isPrivate: false, relations: todoRelations }
          ),
          categories: this.dataSyncProvider.getAll<Category>("categories", { userId: this.userId }),
        });
      }),
      tap(({ privateTodos, teamTodosOwner, teamTodosAssignee, categories }) => {
        this.privateTodosSignal.set(privateTodos);
        const sharedTodoMap = new Map<string, Todo>();
        [...teamTodosOwner, ...teamTodosAssignee].forEach((todo) =>
          sharedTodoMap.set(todo.id, todo)
        );
        this.sharedTodosSignal.set(Array.from(sharedTodoMap.values()));
        this.categoriesSignal.set(categories);
        this.loadingSignal.set(false);
        this.loadedSignal.set(true);
        this.lastLoadedSignal.set(new Date());
      })
    );
  }

  loadTeamTodos(): Observable<Todo[]> {
    const userId = this.authService.getValueByKey("id") || "";
    const todoRelations = RelationsHelper.getTodoRelations();

    return this.dataSyncProvider.get<Profile>("profiles", { userId }).pipe(
      switchMap((profile) => {
        this.profileSignal.set(profile);
        const profileId = profile?.id || "";

        return forkJoin({
          myTeamProjects: this.dataSyncProvider.getAll<Todo>(
            "todos",
            { userId, visibility: "team" },
            { isOwner: true, isPrivate: false, relations: todoRelations }
          ),
          sharedTeamProjects: this.dataSyncProvider.getAll<Todo>(
            "todos",
            { assignees: profileId, visibility: "team" },
            { isOwner: false, isPrivate: false, relations: todoRelations }
          ),
        });
      }),
      map(({ myTeamProjects, sharedTeamProjects }) => {
        const todoMap = new Map<string, Todo>();
        [...myTeamProjects, ...sharedTeamProjects].forEach((todo) => todoMap.set(todo.id, todo));
        const uniqueTodos = Array.from(todoMap.values());
        this.sharedTodosSignal.set(uniqueTodos);
        return uniqueTodos;
      })
    );
  }

  // ==================== TODO METHODS ====================

  addTodo(todo: Todo): void {
    if (this.getTodoById(todo.id)) return;
    const signal = todo.visibility === "private" ? this.privateTodosSignal : this.sharedTodosSignal;
    signal.update((todos) => [todo, ...todos]);
  }

  updateTodo(todoId: string, updates: Partial<Todo>): void {
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

  removeTodo(todoId: string): void {
    this.privateTodosSignal.update((todos) => todos.filter((t) => t.id !== todoId));
    this.sharedTodosSignal.update((todos) => todos.filter((t) => t.id !== todoId));
  }

  // ==================== TASK METHODS ====================

  addTask(task: Task): void {
    if (this.getTaskById(task.id)) return;
    this.updateTaskInTodo(task.todoId, task.id, (tasks) =>
      tasks.some((t) => t.id === task.id) ? tasks : [...tasks, task]
    );
  }

  updateTask(taskId: string, updates: Partial<Task>): void {
    const task = this.getTaskById(taskId);
    if (!task) return;
    this.updateTaskInTodo(task.todoId, taskId, (tasks) =>
      tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
  }

  removeTask(taskId: string): void {
    const task = this.getTaskById(taskId);
    if (!task) return;
    this.updateTodoSignal(task.todoId, (todos) =>
      todos.map((todo) =>
        todo.id === task.todoId
          ? { ...todo, tasks: (todo.tasks || []).filter((t) => t.id !== taskId) }
          : todo
      )
    );
  }

  // ==================== SUBTASK METHODS ====================

  addSubtask(subtask: Subtask): void {
    if (this.getSubtaskById(subtask.id)) return;
    const task = this.getTaskById(subtask.taskId);
    if (!task) return;
    this.updateSubtaskInTask(task.todoId, subtask.taskId, subtask.id, (subtasks) =>
      subtasks.some((s) => s.id === subtask.id) ? subtasks : [...subtasks, subtask]
    );
  }

  updateSubtask(subtaskId: string, updates: Partial<Subtask>): void {
    const subtask = this.getSubtaskById(subtaskId);
    if (!subtask) return;
    const task = this.getTaskById(subtask.taskId);
    if (!task) return;
    this.updateSubtaskInTask(task.todoId, subtask.taskId, subtaskId, (subtasks) =>
      subtasks.map((s) => (s.id === subtaskId ? { ...s, ...updates } : s))
    );
  }

  removeSubtask(subtaskId: string): void {
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
              ? { ...t, subtasks: (t.subtasks || []).filter((s) => s.id !== subtaskId) }
              : t
          ),
        };
      })
    );
  }

  // ==================== CATEGORY METHODS ====================

  addCategory(category: Category): void {
    this.categoriesSignal.update((categories) => [...categories, category]);
  }

  updateCategory(categoryId: string, updates: Partial<Category>): void {
    this.categoriesSignal.update((categories) =>
      categories.map((c) => (c.id === categoryId ? { ...c, ...updates } : c))
    );
  }

  removeCategory(categoryId: string): void {
    this.categoriesSignal.update((categories) => categories.filter((c) => c.id !== categoryId));
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
