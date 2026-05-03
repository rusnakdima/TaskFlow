/* sys lib */
import { Injectable, signal, computed, Signal } from "@angular/core";

/* models - flat structures */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { Category } from "@models/category.model";

/* services */
import { BaseStorageService } from "./base-storage.service";

export type VisibilityFilter = "all" | "private" | "shared" | "public";

@Injectable({ providedIn: "root" })
export class SingleDataStore extends BaseStorageService {
  /* ==================== FLAT DATA SIGNALS ==================== */
  private readonly _todos = signal<Todo[]>([]);
  private readonly _tasks = signal<Task[]>([]);
  private readonly _subtasks = signal<Subtask[]>([]);
  private readonly _comments = signal<Comment[]>([]);
  private readonly _chats = signal<Chat[]>([]);
  private readonly _categories = signal<Category[]>([]);

  /* ==================== MAP-BASED INDEXES (O(1) lookups) ==================== */
  readonly todoMap = computed(() => new Map(this._todos().map((t) => [t.id, t])));
  readonly taskMap = computed(() => new Map(this._tasks().map((t) => [t.id, t])));
  readonly subtaskMap = computed(() => new Map(this._subtasks().map((s) => [s.id, s])));
  readonly commentMap = computed(() => new Map(this._comments().map((c) => [c.id, c])));

  /* ==================== LOOKUP MAPS (grouped by parent) ==================== */
  readonly tasksByTodoId = computed(() => {
    const map = new Map<string, Task[]>();
    for (const task of this._tasks()) {
      if (!map.has(task.todo_id)) map.set(task.todo_id, []);
      map.get(task.todo_id)!.push(task);
    }
    return map;
  });

  readonly subtasksByTaskId = computed(() => {
    const map = new Map<string, Subtask[]>();
    for (const subtask of this._subtasks()) {
      if (!map.has(subtask.task_id)) map.set(subtask.task_id, []);
      map.get(subtask.task_id)!.push(subtask);
    }
    return map;
  });

  readonly commentsByTaskId = computed(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of this._comments()) {
      if (comment.task_id) {
        if (!map.has(comment.task_id)) map.set(comment.task_id, []);
        map.get(comment.task_id)!.push(comment);
      }
    }
    return map;
  });

  readonly commentsBySubtaskId = computed(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of this._comments()) {
      if (comment.subtask_id) {
        if (!map.has(comment.subtask_id)) map.set(comment.subtask_id, []);
        map.get(comment.subtask_id)!.push(comment);
      }
    }
    return map;
  });

  /* ==================== FILTERED DATA ==================== */
  readonly activeTodos = computed(() => this._todos().filter((t) => !t.deleted_at));

  readonly archivedTodos = computed(() => this._todos().filter((t) => t.deleted_at));

  readonly activeTasks = computed(() => this._tasks().filter((t) => !t.deleted_at));

  readonly archivedTasks = computed(() => this._tasks().filter((t) => t.deleted_at));

  readonly activeSubtasks = computed(() => this._subtasks().filter((s) => !s.deleted_at));

  readonly archivedSubtasks = computed(() => this._subtasks().filter((s) => s.deleted_at));

  /* ==================== VISIBILITY-BASED TODOS ==================== */
  readonly privateTodos = computed(() =>
    this.activeTodos().filter((t) => t.visibility === "private")
  );

  readonly sharedTodos = computed(() =>
    this.activeTodos().filter((t) => t.visibility === "shared")
  );

  readonly publicTodos = computed(() =>
    this.activeTodos().filter((t) => t.visibility === "public")
  );

  /* ==================== ALL ACTIVE DATA COMPUTED ==================== */
  readonly allActiveTodos = computed(() => {
    const allTodos = [...this.privateTodos(), ...this.sharedTodos(), ...this.publicTodos()];
    const uniqueMap = new Map<string, Todo>();
    allTodos.forEach((todo) => {
      if (
        !uniqueMap.has(todo.id) ||
        (todo.updated_at && uniqueMap.get(todo.id)!.updated_at! < todo.updated_at)
      ) {
        uniqueMap.set(todo.id, todo);
      }
    });
    return Array.from(uniqueMap.values());
  });

  /* ==================== PUBLIC READONLY SIGNALS ==================== */
  get todos() {
    return this._todos.asReadonly();
  }
  get tasks() {
    return this._tasks.asReadonly();
  }
  get subtasks() {
    return this._subtasks.asReadonly();
  }
  get comments() {
    return this._comments.asReadonly();
  }
  get chats() {
    return this._chats.asReadonly();
  }
  get categories() {
    return this._categories.asReadonly();
  }

  /* ==================== SETTERS ==================== */
  setTodos(todos: Todo[]): void {
    this._todos.set(todos);
    this.updateLastLoaded();
  }

  setTasks(tasks: Task[]): void {
    this._tasks.set(tasks);
  }

  setSubtasks(subtasks: Subtask[]): void {
    this._subtasks.set(subtasks);
  }

  setComments(comments: Comment[]): void {
    this._comments.set(comments);
  }

  setChats(chats: Chat[]): void {
    this._chats.set(chats);
  }

  setCategories(categories: Category[]): void {
    this._categories.set(categories);
  }

  /* ==================== ADD OPERATIONS ==================== */
  addTodo(todo: Todo): void {
    this._todos.update((todos) => [...todos, todo]);
  }

  addTask(task: Task): void {
    this._tasks.update((tasks) => [...tasks, task]);
  }

  addSubtask(subtask: Subtask): void {
    this._subtasks.update((subtasks) => [...subtasks, subtask]);
  }

  addComment(comment: Comment): void {
    this._comments.update((comments) => [...comments, comment]);
  }

  addChat(chat: Chat): void {
    this._chats.update((chats) => [...chats, chat]);
  }

  /* ==================== UPDATE OPERATIONS ==================== */
  updateTodo(id: string, updates: Partial<Todo>): void {
    this._todos.update((todos) => todos.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }

  updateTask(id: string, updates: Partial<Task>): void {
    this._tasks.update((tasks) => tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }

  updateSubtask(id: string, updates: Partial<Subtask>): void {
    this._subtasks.update((subtasks) =>
      subtasks.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }

  updateComment(id: string, updates: Partial<Comment>): void {
    this._comments.update((comments) =>
      comments.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }

  updateChat(id: string, updates: Partial<Chat>): void {
    this._chats.update((chats) => chats.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }

  /* ==================== REMOVE OPERATIONS ==================== */
  removeTodo(id: string): void {
    this._todos.update((todos) => todos.filter((t) => t.id !== id));
  }

  removeTask(id: string): void {
    this._tasks.update((tasks) => tasks.filter((t) => t.id !== id));
  }

  removeSubtask(id: string): void {
    this._subtasks.update((subtasks) => subtasks.filter((s) => s.id !== id));
  }

  removeComment(id: string): void {
    this._comments.update((comments) => comments.filter((c) => c.id !== id));
  }

  /* ==================== BULK OPERATIONS ==================== */
  batchUpdateTodos(updates: { id: string; updates: Partial<Todo> }[]): void {
    this._todos.update((todos) =>
      todos.map((t) => {
        const update = updates.find((u) => u.id === t.id);
        return update ? { ...t, ...update.updates } : t;
      })
    );
  }

  batchUpdateTasks(updates: { id: string; updates: Partial<Task> }[]): void {
    this._tasks.update((tasks) =>
      tasks.map((t) => {
        const update = updates.find((u) => u.id === t.id);
        return update ? { ...t, ...update.updates } : t;
      })
    );
  }

  batchUpdateSubtasks(updates: { id: string; updates: Partial<Subtask> }[]): void {
    this._subtasks.update((subtasks) =>
      subtasks.map((s) => {
        const update = updates.find((u) => u.id === s.id);
        return update ? { ...s, ...update.updates } : s;
      })
    );
  }

  batchUpdateComments(updates: { id: string; updates: Partial<Comment> }[]): void {
    this._comments.update((comments) =>
      comments.map((c) => {
        const update = updates.find((u) => u.id === c.id);
        return update ? { ...c, ...update.updates } : c;
      })
    );
  }

  /* ==================== O(1) LOOKUPS ==================== */
  getTodoById(id: string): Todo | undefined {
    return this.todoMap().get(id);
  }

  getTaskById(id: string): Task | undefined {
    return this.taskMap().get(id);
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
    return this.commentsByTaskId().get(task_id) || [];
  }

  getCommentsBySubtaskId(subtask_id: string): Comment[] {
    return this.commentsBySubtaskId().get(subtask_id) || [];
  }

  /* ==================== NESTED STRUCTURE HELPERS ==================== */
  getTodosWithNestedTasks(): Todo[] {
    const todos = this.activeTodos();
    const tasksByTodo = this.tasksByTodoId();
    return todos.map((todo) => ({
      ...todo,
      tasks: tasksByTodo.get(todo.id) || [],
    }));
  }

  getTasksWithNestedSubtasks(): Task[] {
    const tasks = this.activeTasks();
    const subtasksByTask = this.subtasksByTaskId();
    return tasks.map((task) => ({
      ...task,
      subtasks: subtasksByTask.get(task.id) || [],
    }));
  }

  getSubtasksWithNestedComments(): Subtask[] {
    const subtasks = this.activeSubtasks();
    const commentsBySubtask = this.commentsBySubtaskId();
    return subtasks.map((subtask) => ({
      ...subtask,
      comments: commentsBySubtask.get(subtask.id) || [],
    }));
  }

  /* ==================== CASCADE DELETE ==================== */
  softDeleteTodo(todo_id: string): void {
    const timestamp = new Date().toISOString();
    const tasks = this.getTasksByTodoId(todo_id);

    this.updateTodo(todo_id, { deleted_at: timestamp, updated_at: timestamp });

    for (const task of tasks) {
      this.softDeleteTask(task.id);
    }
  }

  softDeleteTask(task_id: string): void {
    const timestamp = new Date().toISOString();
    const subtasks = this.getSubtasksByTaskId(task_id);

    this.updateTask(task_id, { deleted_at: timestamp, updated_at: timestamp });

    for (const subtask of subtasks) {
      this.softDeleteSubtask(subtask.id);
    }
  }

  softDeleteSubtask(subtask_id: string): void {
    const timestamp = new Date().toISOString();
    this.updateSubtask(subtask_id, { deleted_at: timestamp, updated_at: timestamp });
  }

  restoreTodo(todo_id: string): void {
    const timestamp = new Date().toISOString();
    const tasks = this.getTasksByTodoId(todo_id);

    this.updateTodo(todo_id, { deleted_at: null, updated_at: timestamp });

    for (const task of tasks) {
      this.restoreTask(task.id);
    }
  }

  restoreTask(task_id: string): void {
    const timestamp = new Date().toISOString();
    const subtasks = this.getSubtasksByTaskId(task_id);

    this.updateTask(task_id, { deleted_at: null, updated_at: timestamp });

    for (const subtask of subtasks) {
      this.restoreSubtask(subtask.id);
    }
  }

  restoreSubtask(subtask_id: string): void {
    const timestamp = new Date().toISOString();
    this.updateSubtask(subtask_id, { deleted_at: null, updated_at: timestamp });
  }

  hardDeleteTodo(todo_id: string): void {
    const tasks = this.getTasksByTodoId(todo_id);
    for (const task of tasks) {
      this.hardDeleteTask(task.id);
    }
    this.removeTodo(todo_id);
  }

  hardDeleteTask(task_id: string): void {
    const subtasks = this.getSubtasksByTaskId(task_id);
    for (const subtask of subtasks) {
      this.hardDeleteSubtask(subtask.id);
    }
    this.removeTask(task_id);
  }

  hardDeleteSubtask(subtask_id: string): void {
    this.removeSubtask(subtask_id);
  }

  removeChat(id: string): void {
    this._chats.update((chats) => chats.filter((c) => c.id !== id));
  }

  /* ==================== CLEAR ==================== */
  clear(): void {
    this._todos.set([]);
    this._tasks.set([]);
    this._subtasks.set([]);
    this._comments.set([]);
    this._chats.set([]);
    this._categories.set([]);
    this.loadedSignal.set(false);
    this.lastLoadedSignal.set(null);
  }

  /* ==================== LOAD ALL DATA ==================== */
  loadAllData(data: {
    todos?: Todo[];
    tasks?: Task[];
    subtasks?: Subtask[];
    comments?: Comment[];
    chats?: Chat[];
    categories?: Category[];
  }): void {
    if (data.todos) this.setTodos(data.todos);
    if (data.tasks) this.setTasks(data.tasks);
    if (data.subtasks) this.setSubtasks(data.subtasks);
    if (data.comments) this.setComments(data.comments);
    if (data.chats) this.setChats(data.chats);
    if (data.categories) this.setCategories(data.categories);
    this.loadedSignal.set(true);
  }

  private updateLastLoaded(): void {
    this.lastLoadedSignal.set(new Date());
  }
}

export const singleDataStore = new SingleDataStore();
