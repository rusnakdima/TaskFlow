import { Injectable, signal, computed, Signal, WritableSignal } from "@angular/core";
import { createGroupedMap, groupByKey } from "@stores/utils/store-helpers";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { User } from "@models/user.model";
import { StorageSignalMap } from "./storage.types";

@Injectable({ providedIn: "root" })
export class StorageStateService {
  readonly _privateTodos = signal<Todo[]>([]);
  readonly _sharedTodos = signal<Todo[]>([]);
  readonly _publicTodos = signal<Todo[]>([]);
  readonly _tasks = signal<Task[]>([]);
  readonly _subtasks = signal<Subtask[]>([]);
  readonly _comments = signal<Comment[]>([]);
  readonly _chats = signal<Chat[]>([]);
  readonly _categories = signal<Category[]>([]);
  readonly _profile = signal<Profile | null>(null);
  readonly _profiles = signal<Profile[]>([]);
  readonly _allProfiles = signal<Profile[]>([]);
  readonly _user = signal<User | null>(null);
  readonly _users = signal<User[]>([]);
  readonly _dailyActivities = signal<any[]>([]);
  readonly _cacheInvalidated = signal(false);

  readonly _todosPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  readonly _tasksPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  readonly _subtasksPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  readonly _commentsPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });
  readonly _chatsPagination = signal<{ skip: number; limit: number; hasMore: boolean }>({
    skip: 0,
    limit: 20,
    hasMore: true,
  });

  readonly todosPagination = this._todosPagination.asReadonly();
  readonly tasksPagination = this._tasksPagination.asReadonly();
  readonly subtasksPagination = this._subtasksPagination.asReadonly();
  readonly commentsPagination = this._commentsPagination.asReadonly();
  readonly chatsPagination = this._chatsPagination.asReadonly();

  private readonly _todoComputedCache = new Map<
    string,
    ReturnType<typeof computed<Todo | undefined>>
  >();
  private readonly _taskComputedCache = new Map<
    string,
    ReturnType<typeof computed<Task | undefined>>
  >();
  private readonly _chatsCache = new Map<string, ReturnType<typeof computed<Chat[]>>>();
  private readonly _tasksByTodoCache = new Map<string, ReturnType<typeof computed<Task[]>>>();
  private readonly _cacheTimestamps = new Map<string, number>();

  private readonly activeTodos = computed(() => this.allActiveTodos().filter((t) => !t.deleted_at));
  private readonly activeTasks = computed(() => this._tasks().filter((t) => !t.deleted_at));
  private readonly activeSubtasks = computed(() => this._subtasks().filter((s) => !s.deleted_at));
  private readonly activeComments = computed(() => this._comments().filter((c) => !c.deleted_at));
  private readonly activeChats = computed(() => this._chats().filter((c) => !c.deleted_at));

  private readonly allActiveTodos = computed(() => {
    const allTodos = [...this._privateTodos(), ...this._sharedTodos(), ...this._publicTodos()];
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

  readonly privateTodos = computed(() => this._privateTodos().filter((t) => !t.deleted_at));
  readonly sharedTodos = computed(() => this._sharedTodos().filter((t) => !t.deleted_at));
  readonly publicTodos = computed(() => this._publicTodos().filter((t) => !t.deleted_at));

  readonly todoMap = computed(() => new Map(this.allActiveTodos().map((t) => [t.id, t])));
  readonly taskMap = computed(() => new Map(this.activeTasks().map((t) => [t.id, t])));
  readonly subtaskMap = computed(() => new Map(this.activeSubtasks().map((s) => [s.id, s])));
  readonly commentMap = computed(() => new Map(this.activeComments().map((c) => [c.id, c])));

  readonly tasksByTodoId = computed(() => createGroupedMap(this.activeTasks(), (t) => t.todo_id));

  readonly subtasksByTaskId = computed(() =>
    createGroupedMap(this.activeSubtasks(), (s) => s.task_id)
  );

  readonly commentsByTaskId = computed(() =>
    createGroupedMap(
      this.activeComments(),
      (c) => c.task_id,
      (c) => !!c.task_id
    )
  );

  readonly commentsBySubtaskId = computed(() =>
    createGroupedMap(
      this.activeComments(),
      (c) => c.subtask_id,
      (c) => !!c.subtask_id
    )
  );

  readonly chatsByTodoId = computed(() =>
    createGroupedMap(
      this.activeChats(),
      (c) => c.todo_id,
      (c) => !!c.todo_id
    )
  );

  private createGroupedLookup<K extends string, T>(
    entities: T[],
    getKey: (e: T) => K | undefined,
    filterFn?: (e: T) => boolean
  ): Map<K, T[]> {
    return createGroupedMap(entities, getKey, filterFn);
  }

  readonly todos = computed(() => this.allActiveTodos());
  readonly tasks = computed(() => this.activeTasks());
  readonly subtasks = computed(() => this.activeSubtasks());
  readonly comments = computed(() => this.activeComments());
  readonly chats = computed(() => this.activeChats());
  readonly categories = this._categories.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly profiles = this._profiles.asReadonly();
  readonly allProfiles = this._allProfiles.asReadonly();
  readonly user = this._user.asReadonly();
  readonly users = this._users.asReadonly();
  readonly dailyActivities = this._dailyActivities.asReadonly();
  readonly archivedTodos = computed(() =>
    [...this._privateTodos(), ...this._sharedTodos(), ...this._publicTodos()].filter(
      (t) => t.deleted_at
    )
  );
  readonly archivedTasks = computed(() => this._tasks().filter((t) => t.deleted_at));
  readonly archivedSubtasks = computed(() => this._subtasks().filter((s) => s.deleted_at));
  readonly cacheInvalidated = this._cacheInvalidated.asReadonly();

  readonly signalMap: StorageSignalMap = {
    todos: this._privateTodos,
    tasks: this._tasks,
    subtasks: this._subtasks,
    comments: this._comments,
    chats: this._chats,
    categories: this._categories,
    daily_activities: this._dailyActivities,
  };

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

  get subtasksGroupedByTask(): ReturnType<typeof computed<Map<string, Subtask[]>>> {
    return computed(() => groupByKey(this._subtasks(), (subtask) => subtask.task_id));
  }

  getTodosWithNestedTasks(): Todo[] {
    const todos = this.todos();
    const tasksByTodo = this.tasksByTodoId();
    return todos.map((todo) => ({
      ...todo,
      tasks: tasksByTodo.get(todo.id) || [],
    }));
  }

  getTasksWithNestedSubtasks(): Task[] {
    const tasks = this.tasks();
    const subtasksByTask = this.subtasksByTaskId();
    return tasks.map((task) => ({
      ...task,
      subtasks: subtasksByTask.get(task.id) || [],
    }));
  }

  getSubtasksWithNestedComments(): Subtask[] {
    const subtasks = this.subtasks();
    const commentsBySubtask = this.commentsBySubtaskId();
    return subtasks.map((subtask) => ({
      ...subtask,
      comments: commentsBySubtask.get(subtask.id) || [],
    }));
  }

  get chatsCache(): Map<string, ReturnType<typeof computed<Chat[]>>> {
    return this._chatsCache;
  }
  get tasksByTodoCache(): Map<string, ReturnType<typeof computed<Task[]>>> {
    return this._tasksByTodoCache;
  }
  get cacheTimestamps(): Map<string, number> {
    return this._cacheTimestamps;
  }
  get todoComputedCache(): Map<string, ReturnType<typeof computed<Todo | undefined>>> {
    return this._todoComputedCache;
  }
  get taskComputedCache(): Map<string, ReturnType<typeof computed<Task | undefined>>> {
    return this._taskComputedCache;
  }
}
