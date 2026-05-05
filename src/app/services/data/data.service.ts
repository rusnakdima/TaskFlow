import { Injectable, inject } from "@angular/core";
import { Observable, from, Subject, of } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

import { Response, ResponseStatus } from "@models/response.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { Profile } from "@models/profile.model";

import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/core/storage.service";

@Injectable({ providedIn: "root" })
export class DataService {
  private jwtTokenService = inject(JwtTokenService);
  private storageService = inject(StorageService);

  private pendingRequests = new Map<string, { controller: AbortController; timestamp: number }>();

  private cachedTodos: Todo[] = [];
  private cachedTasks: Task[] = [];
  private cachedSubtasks: Subtask[] = [];
  private cachedComments: Comment[] = [];
  private cachedChats: Chat[] = [];
  private cachedCategories: Category[] = [];
  private cachedProfile: Profile | null = null;

  readonly todos$ = new Subject<Todo[]>();
  readonly tasks$ = new Subject<Task[]>();
  readonly subtasks$ = new Subject<Subtask[]>();
  readonly comments$ = new Subject<Comment[]>();
  readonly chats$ = new Subject<Chat[]>();
  readonly categories$ = new Subject<Category[]>();
  readonly profile$ = new Subject<Profile | null>();

  private getRequestKey(operation: string, table: string, id?: string, filter?: any): string {
    return `${operation}:${table}:${id || ""}:${JSON.stringify(filter || {})}`;
  }

  private getRequestDeduplicationKey(
    operation: string,
    table: string,
    id?: string,
    filter?: any
  ): string {
    const key = this.getRequestKey(operation, table, id, filter);
    const now = Date.now();
    const existing = this.pendingRequests.get(key);

    if (existing && now - existing.timestamp < 500) {
      existing.controller.abort();
    }

    const controller = new AbortController();
    this.pendingRequests.set(key, { controller, timestamp: now });

    return key;
  }

  private removeRequest(key: string): void {
    this.pendingRequests.delete(key);
  }

  private invoke<T>(command: string, args: Record<string, any>): Observable<T> {
    return from(
      invoke<Response<T>>(command, args).then(
        (response) => {
          if (response.status === ResponseStatus.SUCCESS) {
            return response.data as T;
          }
          throw new Error(response?.message || "Unknown error");
        },
        (err) => {
          throw new Error(err?.message || String(err));
        }
      )
    );
  }

  isOffline(): boolean {
    return !navigator.onLine;
  }

  getTodos(options?: {
    filter?: any;
    skip?: number;
    limit?: number;
    load?: string[];
    visibility?: string;
  }): Observable<Todo[]> {
    const { filter, skip, limit, load, visibility } = options || {};
    console.log(`[DataService] getTodos called | visibility="${visibility}", filter=${filter ? 'present' : 'None'}`);
    const key = this.getRequestDeduplicationKey("getAll", "todos", undefined, filter);
    return new Observable<Todo[]>((subscriber) => {
      console.log(`[DataService] invoking manage_data for todos`);
      this.invoke<Todo[]>("manage_data", {
        operation: "getAll",
        table: "todos",
        filter,
        skip,
        limit,
        load: load ? JSON.stringify(load) : undefined,
        visibility,
      }).subscribe({
        next: (data) => {
          console.log(`[DataService] manage_data returned ${data?.length ?? 0} todos`);
          this.cachedTodos = data || [];
          this.todos$.next(this.cachedTodos);
          subscriber.next(this.cachedTodos);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getTodo(id: string): Observable<Todo> {
    const key = this.getRequestDeduplicationKey("get", "todos", id);
    return new Observable<Todo>((subscriber) => {
      this.invoke<Todo>("manage_data", { operation: "get", table: "todos", id }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  createTodo(data: Partial<Todo>, visibility?: string): Observable<Todo> {
    return new Observable<Todo>((subscriber) => {
      this.invoke<Todo>("manage_data", {
        operation: "create",
        table: "todos",
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  updateTodo(id: string, data: Partial<Todo>, visibility?: string): Observable<Todo> {
    return new Observable<Todo>((subscriber) => {
      this.invoke<Todo>("manage_data", {
        operation: "update",
        table: "todos",
        id,
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  deleteTodo(id: string, visibility?: string): Observable<void> {
    return new Observable<void>((subscriber) => {
      this.invoke<void>("manage_data", {
        operation: "delete",
        table: "todos",
        id,
        visibility,
      }).subscribe({
        next: () => {
          subscriber.next();
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  getTasks(todoId?: string, filter?: any): Observable<Task[]> {
    const key = this.getRequestDeduplicationKey("getAll", "tasks", todoId, filter);
    const options: any = { filter };
    if (todoId) options.parentTodoId = todoId;
    return new Observable<Task[]>((subscriber) => {
      this.invoke<Task[]>("manage_data", {
        operation: "getAll",
        table: "tasks",
        ...options,
      }).subscribe({
        next: (data) => {
          this.cachedTasks = data || [];
          this.tasks$.next(this.cachedTasks);
          subscriber.next(this.cachedTasks);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getTask(id: string): Observable<Task> {
    const key = this.getRequestDeduplicationKey("get", "tasks", id);
    return new Observable<Task>((subscriber) => {
      this.invoke<Task>("manage_data", { operation: "get", table: "tasks", id }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  createTask(data: Partial<Task>, visibility?: string): Observable<Task> {
    return new Observable<Task>((subscriber) => {
      this.invoke<Task>("manage_data", {
        operation: "create",
        table: "tasks",
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  updateTask(id: string, data: Partial<Task>, visibility?: string): Observable<Task> {
    return new Observable<Task>((subscriber) => {
      this.invoke<Task>("manage_data", {
        operation: "update",
        table: "tasks",
        id,
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  deleteTask(id: string, visibility?: string): Observable<void> {
    return new Observable<void>((subscriber) => {
      this.invoke<void>("manage_data", {
        operation: "delete",
        table: "tasks",
        id,
        visibility,
      }).subscribe({
        next: () => {
          subscriber.next();
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  getSubtasks(taskId?: string): Observable<Subtask[]> {
    const key = this.getRequestDeduplicationKey("getAll", "subtasks", taskId);
    return new Observable<Subtask[]>((subscriber) => {
      this.invoke<Subtask[]>("manage_data", {
        operation: "getAll",
        table: "subtasks",
        parentTodoId: taskId,
      }).subscribe({
        next: (data) => {
          this.cachedSubtasks = data || [];
          this.subtasks$.next(this.cachedSubtasks);
          subscriber.next(this.cachedSubtasks);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getSubtask(id: string): Observable<Subtask> {
    const key = this.getRequestDeduplicationKey("get", "subtasks", id);
    return new Observable<Subtask>((subscriber) => {
      this.invoke<Subtask>("manage_data", { operation: "get", table: "subtasks", id }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  createSubtask(data: Partial<Subtask>, visibility?: string): Observable<Subtask> {
    return new Observable<Subtask>((subscriber) => {
      this.invoke<Subtask>("manage_data", {
        operation: "create",
        table: "subtasks",
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  updateSubtask(id: string, data: Partial<Subtask>, visibility?: string): Observable<Subtask> {
    return new Observable<Subtask>((subscriber) => {
      this.invoke<Subtask>("manage_data", {
        operation: "update",
        table: "subtasks",
        id,
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  deleteSubtask(id: string, visibility?: string): Observable<void> {
    return new Observable<void>((subscriber) => {
      this.invoke<void>("manage_data", {
        operation: "delete",
        table: "subtasks",
        id,
        visibility,
      }).subscribe({
        next: () => {
          subscriber.next();
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  getCategories(): Observable<Category[]> {
    const key = this.getRequestDeduplicationKey("getAll", "categories");
    return new Observable<Category[]>((subscriber) => {
      this.invoke<Category[]>("manage_data", {
        operation: "getAll",
        table: "categories",
        visibility: "private",
      }).subscribe({
        next: (data) => {
          this.cachedCategories = data || [];
          this.categories$.next(this.cachedCategories);
          subscriber.next(this.cachedCategories);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getComments(taskId?: string, subtaskId?: string): Observable<Comment[]> {
    const filter: any = {};
    if (taskId) filter["task_id"] = taskId;
    if (subtaskId) filter["subtask_id"] = subtaskId;
    const key = this.getRequestDeduplicationKey("getAll", "comments", undefined, filter);
    return new Observable<Comment[]>((subscriber) => {
      this.invoke<Comment[]>("manage_data", {
        operation: "getAll",
        table: "comments",
        filter,
      }).subscribe({
        next: (data) => {
          this.cachedComments = data || [];
          this.comments$.next(this.cachedComments);
          subscriber.next(this.cachedComments);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getChats(todoId: string): Observable<Chat[]> {
    const filter = { todo_id: todoId };
    const key = this.getRequestDeduplicationKey("getAll", "chats", undefined, filter);
    return new Observable<Chat[]>((subscriber) => {
      this.invoke<Chat[]>("manage_data", { operation: "getAll", table: "chats", filter }).subscribe(
        {
          next: (data) => {
            this.cachedChats = data || [];
            this.chats$.next(this.cachedChats);
            subscriber.next(this.cachedChats);
            subscriber.complete();
            this.removeRequest(key);
          },
          error: (err) => {
            subscriber.error(err);
            this.removeRequest(key);
          },
        }
      );
    });
  }

  getUser(id: string): Observable<any> {
    const key = this.getRequestDeduplicationKey("get", "users", id);
    return new Observable<any>((subscriber) => {
      this.invoke<any>("manage_data", {
        operation: "get",
        table: "users",
        id,
        visibility: "private",
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getProfile(): Observable<Profile | null> {
    const userId = this.jwtTokenService.getCurrentUserId();
    console.debug("[DataService] getProfile called, userId:", userId);
    if (!userId) {
      return new Observable<Profile>((subscriber) => {
        subscriber.error(new Error("No user logged in"));
      });
    }
    const key = this.getRequestDeduplicationKey("get", "profiles", userId);
    return new Observable<Profile | null>((subscriber) => {
      console.debug("[DataService] invoking manage_data for profiles with filter:", { user_id: userId });
      this.invoke<Profile>("manage_data", {
        operation: "get",
        table: "profiles",
        filter: { user_id: userId },
        load: JSON.stringify(["user"]),
        visibility: "private",
      }).subscribe({
        next: (data) => {
          console.debug("[DataService] getProfile received data:", data);
          const profile = Array.isArray(data) ? data[0] : data;
          this.profile$.next(profile);
          this.setCurrentProfile(profile);
          subscriber.next(profile);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          console.error("[DataService] getProfile error:", err);
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  getPublicProfiles(): Observable<Profile[]> {
    const key = this.getRequestDeduplicationKey("getAll", "profiles");
    return new Observable<Profile[]>((subscriber) => {
      this.invoke<Profile[]>("manage_data", {
        operation: "getAll",
        table: "profiles",
        visibility: "public",
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  initializeUserData(userId: string): Observable<Response<any>> {
    return from(invoke<Response<any>>("initialize_user_data", { userId }));
  }

  getEntitiesByType<T>(entityName: string, options: any): Observable<T[]> {
    const { filter, skip, limit, load, visibility, ...rest } = options;
    const key = this.getRequestDeduplicationKey("getAll", entityName, undefined, filter);
    return new Observable<T[]>((subscriber) => {
      this.invoke<T[]>("manage_data", {
        operation: "getAll",
        table: entityName,
        filter,
        skip,
        limit,
        load: load ? JSON.stringify(load) : undefined,
        visibility,
        ...rest,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
          this.removeRequest(key);
        },
        error: (err: any) => {
          subscriber.error(err);
          this.removeRequest(key);
        },
      });
    });
  }

  setChatsForTodo(chats: Chat[], todoId: string): void {
    const existing = this.cachedChats.filter((c) => c.todo_id !== todoId);
    this.cachedChats = [...existing, ...chats];
    this.chats$.next(this.cachedChats);
  }

  getCurrentTodos(): Todo[] {
    return this.cachedTodos;
  }

  getCurrentTasks(): Task[] {
    return this.cachedTasks;
  }

  getCurrentSubtasks(): Subtask[] {
    return this.cachedSubtasks;
  }

  getCurrentComments(): Comment[] {
    return this.cachedComments;
  }

  getCurrentChats(): Chat[] {
    return this.cachedChats;
  }

  getCurrentCategories(): Category[] {
    return this.cachedCategories;
  }

  getCurrentProfile(): Profile | null {
    return this.cachedProfile;
  }

  getTasksByTodoId(todoId: string): Task[] {
    return this.cachedTasks.filter((t) => t.todo_id === todoId);
  }

  getSubtasksByTaskId(taskId: string): Subtask[] {
    return this.cachedSubtasks.filter((s) => s.task_id === taskId);
  }

  getCommentsByTaskId(taskId: string): Comment[] {
    return this.cachedComments.filter((c) => c.task_id === taskId);
  }

  getCommentsBySubtaskId(subtaskId: string): Comment[] {
    return this.cachedComments.filter((c) => c.subtask_id === subtaskId);
  }

  updateComment(id: string, data: Partial<Comment>, visibility?: string): Observable<Comment> {
    return new Observable<Comment>((subscriber) => {
      this.invoke<Comment>("manage_data", {
        operation: "update",
        table: "comments",
        id,
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  setCurrentProfile(profile: Profile | null): void {
    console.debug("[DataService] setCurrentProfile called with:", profile);
    this.storageService.setCollection("profiles", profile);
  }

  updateProfile(id: string, data: Partial<Profile>, visibility?: string): Observable<Profile> {
    return new Observable<Profile>((subscriber) => {
      this.invoke<Profile>("manage_data", {
        operation: "update",
        table: "profiles",
        id,
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  createProfile(data: Partial<Profile>, visibility?: string): Observable<Profile> {
    return new Observable<Profile>((subscriber) => {
      this.invoke<Profile>("manage_data", {
        operation: "create",
        table: "profiles",
        data,
        visibility,
      }).subscribe({
        next: (data) => {
          subscriber.next(data);
          subscriber.complete();
        },
        error: (err: any) => subscriber.error(err),
      });
    });
  }

  setCurrentUser(user: any | null): void {
    this.storageService.setCollection("user", user);
  }

  setCurrentTodos(todos: Todo[]): void {
    this.cachedTodos = todos;
    this.todos$.next(todos);
  }

  setCurrentTasks(tasks: Task[]): void {
    this.cachedTasks = tasks;
    this.tasks$.next(tasks);
  }

  setCurrentSubtasks(subtasks: Subtask[]): void {
    this.cachedSubtasks = subtasks;
    this.subtasks$.next(subtasks);
  }

  setCurrentComments(comments: Comment[]): void {
    this.cachedComments = comments;
    this.comments$.next(comments);
  }

  setCurrentCategories(categories: Category[]): void {
    this.cachedCategories = categories;
    this.categories$.next(categories);
  }
}
