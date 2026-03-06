/* sys lib */
import { Injectable, signal, computed } from "@angular/core";
import { Observable, of } from "rxjs";
import { map, tap, switchMap } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task, TaskStatus } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { SyncMetadata } from "@models/sync-metadata";
import { RelationObj, TypesField } from "@models/relation-obj.model";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* services */
import { AuthService } from "@services/auth.service";

/**
 * StorageService - Centralized data cache for the application
 *
 * Purpose:
 * - Load data once and share across multiple views
 * - Reduce redundant API calls
 * - Maintain data consistency across views
 * - Handle relations (Todo + Tasks + Subtasks) together
 * - Update cache when data changes
 */
@Injectable({
  providedIn: "root",
})
export class StorageService {
  // Cache signals
  private todosSignal = signal<Todo[]>([]);
  private tasksSignal = signal<Task[]>([]);
  private subtasksSignal = signal<Subtask[]>([]);
  private categoriesSignal = signal<Category[]>([]);
  private profileSignal = signal<Profile | null>(null);

  // Loading states
  private loadingSignal = signal(false);
  private loadedSignal = signal(false);
  private lastLoadedSignal = signal<Date | null>(null);

  // Metadata
  private userId = "";
  private isOwner = true;
  private isPrivate = true;

  // Cache expiry (2 minutes - shorter for better freshness)
  private readonly CACHE_EXPIRY_MS = 2 * 60 * 1000;

  constructor(
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider
  ) {}

  // ==================== PUBLIC SIGNALS ====================

  get todos() {
    return this.todosSignal.asReadonly();
  }

  get tasks() {
    return this.tasksSignal.asReadonly();
  }

  get subtasks() {
    return this.subtasksSignal.asReadonly();
  }

  get categories() {
    return this.categoriesSignal.asReadonly();
  }

  get profile() {
    return this.profileSignal.asReadonly();
  }

  // Public setters for external use
  setCategories(categories: Category[]): void {
    this.categoriesSignal.set(categories);
  }

  setTodos(todos: Todo[]): void {
    this.todosSignal.set(todos);
  }

  setTasks(tasks: Task[]): void {
    this.tasksSignal.set(tasks);
  }

  setSubtasks(subtasks: Subtask[]): void {
    this.subtasksSignal.set(subtasks);
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

  // Expose signals for direct update (used by controllers)
  get todosSignalAccessor() {
    return this.todosSignal;
  }

  // ==================== COMPUTED SIGNALS ====================

  get todosWithRelations() {
    return computed(() => {
      const todos = this.todosSignal();
      const tasks = this.tasksSignal();
      const subtasks = this.subtasksSignal();

      return todos.map((todo) => ({
        ...todo,
        tasks: tasks
          .filter((task) => task.todoId === todo.id)
          .map((task) => ({
            ...task,
            subtasks: subtasks.filter((st) => st.taskId === task.id),
          })),
      }));
    });
  }

  getTasksByTodoId(todoId: string) {
    return computed(() => this.tasksSignal().filter((task) => task.todoId === todoId));
  }

  getSubtasksByTaskId(taskId: string) {
    return computed(() => this.subtasksSignal().filter((st) => st.taskId === taskId));
  }

  get completedTasksCount() {
    return computed(() => {
      return this.tasksSignal().filter(
        (task) => task.status === TaskStatus.COMPLETED || task.status === TaskStatus.SKIPPED
      ).length;
    });
  }

  get pendingTasksCount() {
    return computed(() => {
      return this.tasksSignal().filter((task) => task.status === TaskStatus.PENDING).length;
    });
  }

  // ==================== INITIALIZATION ====================

  init(userId?: string, isOwner: boolean = true, isPrivate: boolean = true): void {
    // Get userId from parameter or from AuthService
    this.userId = userId || this.authService.getValueByKey("id") || "";
    this.isOwner = isOwner;
    this.isPrivate = isPrivate;
  }

  /**
   * Load all data (call once on app initialization or when needed)
   * Loads todos with relations (tasks, subtasks, categories, users, profiles) and extracts them to separate signals
   */
  loadAllData(force: boolean = false): Observable<{
    todos: Todo[];
    tasks: Task[];
    subtasks: Subtask[];
    categories: Category[];
  }> {
    // Ensure userId is set from AuthService
    if (!this.userId) {
      this.userId = this.authService.getValueByKey("id") || "";
    }

    // Force reload if cache is empty (no data loaded yet)
    const hasData = this.todosSignal().length > 0 || this.categoriesSignal().length > 0;
    if (!hasData) {
      force = true;
    }

    // Check if cache is still valid
    if (!force && this.isCacheValid()) {
      return of({
        todos: this.todosSignal(),
        tasks: this.tasksSignal(),
        subtasks: this.subtasksSignal(),
        categories: this.categoriesSignal(),
      });
    }

    // Prevent duplicate loading
    if (this.loadingSignal()) {
      return of({
        todos: this.todosSignal(),
        tasks: this.tasksSignal(),
        subtasks: this.subtasksSignal(),
        categories: this.categoriesSignal(),
      });
    }

    this.loadingSignal.set(true);

    const metadata: SyncMetadata = { isOwner: this.isOwner, isPrivate: this.isPrivate };

    // Define default relations for todos (tasks + subtasks + categories + users + profiles)
    const todoRelations: RelationObj[] = [
      {
        nameTable: "tasks",
        typeField: TypesField.OneToMany,
        nameField: "todoId",
        newNameField: "tasks",
        relations: [
          {
            nameTable: "subtasks",
            typeField: TypesField.OneToMany,
            nameField: "taskId",
            newNameField: "subtasks",
            relations: null,
          },
        ],
      },
      {
        nameTable: "users",
        typeField: TypesField.OneToOne,
        nameField: "userId",
        newNameField: "user",
        relations: [
          {
            nameTable: "profiles",
            typeField: TypesField.OneToOne,
            nameField: "profileId",
            newNameField: "profile",
            relations: null,
          },
        ],
      },
      {
        nameTable: "categories",
        typeField: TypesField.ManyToOne,
        nameField: "categories",
        newNameField: "categories",
        relations: null,
      },
    ];

    // Step 1: Load private todos with relations (for todos view)
    return this.dataSyncProvider
      .getAll<Todo>("todos", { userId: this.userId, visibility: "private" }, { ...metadata, relations: todoRelations })
      .pipe(
        tap((todos) => {
          // Extract tasks and subtasks from todos with relations for separate storage
          const allTasks: Task[] = [];
          const allSubtasks: Subtask[] = [];

          todos.forEach((todo: any) => {
            // Extract tasks with subtasks
            if (todo.tasks && Array.isArray(todo.tasks)) {
              todo.tasks.forEach((task: any) => {
                allTasks.push(task);
                if (task.subtasks && Array.isArray(task.subtasks)) {
                  task.subtasks.forEach((subtask: Subtask) => {
                    allSubtasks.push(subtask);
                  });
                }
              });
            }
          });

          // Set all signals - todos already have tasks embedded from backend
          this.todosSignal.set(todos);
          this.tasksSignal.set(allTasks);
          this.subtasksSignal.set(allSubtasks);
        }),
        switchMap((todos) => {
          // Step 2: Load categories separately (they are not embedded in todos)
          return this.dataSyncProvider
            .getAll<Category>("categories", { userId: this.userId }, metadata)
            .pipe(
              tap((categories) => {
                this.categoriesSignal.set(categories);
              }),
              map((categories) => {
                this.loadingSignal.set(false);
                this.loadedSignal.set(true);
                this.lastLoadedSignal.set(new Date());
                return {
                  todos: this.todosSignal(),
                  tasks: this.tasksSignal(),
                  subtasks: this.subtasksSignal(),
                  categories,
                };
              })
            );
        })
      );
  }

  private isCacheValid(): boolean {
    if (!this.loadedSignal()) {
      return false;
    }

    const lastLoaded = this.lastLoadedSignal();
    if (!lastLoaded) {
      return false;
    }

    const now = new Date().getTime();
    const lastLoadedTime = lastLoaded.getTime();

    return now - lastLoadedTime < this.CACHE_EXPIRY_MS;
  }

  // ==================== UPDATE METHODS ====================

  addTodo(todo: Todo): void {
    this.todosSignal.update((todos) => [todo, ...todos]);
  }

  updateTodo(todoId: string, updates: Partial<Todo>): void {
    this.todosSignal.update((todos) =>
      todos.map((todo) => (todo.id === todoId ? { ...todo, ...updates } : todo))
    );
  }

  removeTodo(todoId: string): void {
    this.todosSignal.update((todos) => todos.filter((todo) => todo.id !== todoId));
    this.tasksSignal.update((tasks) => tasks.filter((task) => task.todoId !== todoId));
    this.subtasksSignal.update((subtasks) =>
      subtasks.filter((st) => {
        const task = this.tasksSignal().find((t) => t.id === st.taskId);
        return task?.todoId !== todoId;
      })
    );
  }

  addTask(task: Task): void {
    this.tasksSignal.update((tasks) => [...tasks, task]);
  }

  updateTask(taskId: string, updates: Partial<Task>): void {
    this.tasksSignal.update((tasks) =>
      tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task))
    );
  }

  removeTask(taskId: string): void {
    this.tasksSignal.update((tasks) => tasks.filter((task) => task.id !== taskId));
    this.subtasksSignal.update((subtasks) => subtasks.filter((st) => st.taskId !== taskId));
  }

  addSubtask(subtask: Subtask): void {
    this.subtasksSignal.update((subtasks) => [...subtasks, subtask]);
  }

  updateSubtask(subtaskId: string, updates: Partial<Subtask>): void {
    this.subtasksSignal.update((subtasks) =>
      subtasks.map((st) => (st.id === subtaskId ? { ...st, ...updates } : st))
    );
  }

  removeSubtask(subtaskId: string): void {
    this.subtasksSignal.update((subtasks) => subtasks.filter((st) => st.id !== subtaskId));
  }

  addCategory(category: Category): void {
    this.categoriesSignal.update((categories) => [...categories, category]);
  }

  updateCategory(categoryId: string, updates: Partial<Category>): void {
    this.categoriesSignal.update((categories) =>
      categories.map((cat) => (cat.id === categoryId ? { ...cat, ...updates } : cat))
    );
  }

  removeCategory(categoryId: string): void {
    this.categoriesSignal.update((categories) => categories.filter((cat) => cat.id !== categoryId));
  }

  // ==================== ROLLBACK METHODS (used by controllers) ====================

  rollbackRemoveTodo(todo: Todo): void {
    this.todosSignal.update((todos) => [todo, ...todos]);
  }

  rollbackRemoveTask(task: Task): void {
    this.tasksSignal.update((tasks) => [...tasks, task]);
  }

  // ==================== UTILITY METHODS ====================

  getTodoById(todoId: string): Todo | undefined {
    return this.todosSignal().find((todo) => todo.id === todoId);
  }

  getTaskById(taskId: string): Task | undefined {
    return this.tasksSignal().find((task) => task.id === taskId);
  }

  getSubtaskById(subtaskId: string): Subtask | undefined {
    return this.subtasksSignal().find((st) => st.id === subtaskId);
  }

  getCategoryById(categoryId: string): Category | undefined {
    return this.categoriesSignal().find((cat) => cat.id === categoryId);
  }

  clear(): void {
    this.todosSignal.set([]);
    this.tasksSignal.set([]);
    this.subtasksSignal.set([]);
    this.categoriesSignal.set([]);
    this.profileSignal.set(null);
    this.loadedSignal.set(false);
    this.lastLoadedSignal.set(null);
  }
}
