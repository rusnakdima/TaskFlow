/* sys lib */
import { Injectable, inject, signal, computed, Injector, WritableSignal } from "@angular/core";
import { Observable, of } from "rxjs";

/* models */
import { Todo, Task, Subtask, Comment, Chat, User, Profile } from "@models/generated/api.types";
import { EntityType, VisibilityFilter, ChildType, PaginationState } from "@models/storage.model";

/* services */
import { AdminService } from "@services/data/admin.service";
import { AdminDataWithRelations } from "@models/admin.model";
import { ApiService } from "@services/api.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";

/* utils */
import { deduplicateById, upsertEntityBulk, createGroupedMap } from "@stores/utils/store-helpers";

import { StorageEntityService } from "./storage-entity.service";
import { ProfileRequiredService } from "./profile-required.service";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PAGINATION: PaginationState = { skip: 0, limit: 20, hasMore: true };

@Injectable({ providedIn: "root" })
export class StorageQueryService {
  private readonly _injector = inject(Injector);
  private readonly _entityService = inject(StorageEntityService);
  private _apiService: ApiService | null = null;
  private _adminService: AdminService | null = null;
  private _jwtTokenService: JwtTokenService | null = null;
  private _profileRequiredService: ProfileRequiredService | null = null;

  private readonly _loaded = signal(false);
  private readonly _loading = signal(false);
  private readonly _lastLoaded = signal<Date | null>(null);
  private readonly _allProfiles = signal<Profile[]>([]);
  private readonly _user = signal<User | null>(null);
  private readonly _dailyActivities = signal<any[]>([]);
  private readonly _profileLoading = signal(false);
  private readonly _publicProfileLoading = signal(false);
  private readonly _userLoading = signal(false);
  private readonly _todosLoading = signal(false);
  private readonly _tasksLoading = signal(false);
  private readonly _subtasksLoading = signal(false);
  private readonly _categoriesLoading = signal(false);
  private readonly _chatsLoading = signal(false);
  private readonly _commentsLoading = signal(false);

  private readonly _pagination = signal<Record<ChildType, PaginationState>>({
    todos: { ...DEFAULT_PAGINATION },
    tasks: { ...DEFAULT_PAGINATION },
    subtasks: { ...DEFAULT_PAGINATION },
    categories: { ...DEFAULT_PAGINATION },
    comments: { ...DEFAULT_PAGINATION },
    chats: { ...DEFAULT_PAGINATION },
  });

  get loaded(): ReturnType<typeof this._loaded.asReadonly> {
    return this._loaded.asReadonly();
  }

  get loading(): ReturnType<typeof this._loading.asReadonly> {
    return this._loading.asReadonly();
  }

  get lastLoaded(): ReturnType<typeof this._lastLoaded.asReadonly> {
    return this._lastLoaded.asReadonly();
  }

  get allProfiles(): ReturnType<typeof this._allProfiles.asReadonly> {
    return this._allProfiles.asReadonly();
  }

  get user(): ReturnType<typeof this._user.asReadonly> {
    return this._user.asReadonly();
  }

  get dailyActivities(): ReturnType<typeof this._dailyActivities.asReadonly> {
    return this._dailyActivities.asReadonly();
  }

  get todosPagination(): PaginationState {
    return this._pagination().todos;
  }

  get tasksPagination(): PaginationState {
    return this._pagination().tasks;
  }

  get subtasksPagination(): PaginationState {
    return this._pagination().subtasks;
  }

  get commentsPagination(): PaginationState {
    return this._pagination().comments;
  }

  get chatsPagination(): PaginationState {
    return this._pagination().chats;
  }

  get hasMoreTodos(): boolean {
    return this._pagination().todos.hasMore;
  }

  get hasMoreTasks(): boolean {
    return this._pagination().tasks.hasMore;
  }

  get hasMoreSubtasks(): boolean {
    return this._pagination().subtasks.hasMore;
  }

  get hasMoreComments(): boolean {
    return this._pagination().comments.hasMore;
  }

  get hasMoreChats(): boolean {
    return this._pagination().chats.hasMore;
  }

  private get adminService(): AdminService {
    if (!this._adminService) this._adminService = this._injector.get(AdminService) as AdminService;
    return this._adminService;
  }

  private get apiService(): ApiService {
    if (!this._apiService) this._apiService = this._injector.get(ApiService) as ApiService;
    return this._apiService;
  }

  private get jwtTokenService(): JwtTokenService {
    if (!this._jwtTokenService)
      this._jwtTokenService = this._injector.get(JwtTokenService) as JwtTokenService;
    return this._jwtTokenService;
  }

  private get profileRequiredService(): ProfileRequiredService {
    if (!this._profileRequiredService)
      this._profileRequiredService = this._injector.get(
        ProfileRequiredService
      ) as ProfileRequiredService;
    return this._profileRequiredService;
  }

  private get activeTasks(): ReturnType<typeof computed<Task[]>> {
    return computed(() => this._entityService.tasks().filter((t) => !t.deleted_at));
  }

  private get activeSubtasks(): ReturnType<typeof computed<Subtask[]>> {
    return computed(() => this._entityService.subtasks().filter((s) => !s.deleted_at));
  }

  private get activeComments(): ReturnType<typeof computed<Comment[]>> {
    return computed(() => this._entityService.comments().filter((c) => !c.deleted_at));
  }

  private get activeChats(): ReturnType<typeof computed<Chat[]>> {
    return computed(() => this._entityService.chats().filter((c) => !c.deleted_at));
  }

  private get allActiveTodos(): ReturnType<typeof computed<Todo[]>> {
    return computed(() => {
      const allTodos = [
        ...this._entityService.privateTodos(),
        ...this._entityService.sharedTodos(),
        ...this._entityService.publicTodos(),
      ];
      return deduplicateById(allTodos, { filterDeleted: true });
    });
  }

  get privateTodos(): ReturnType<typeof computed<Todo[]>> {
    return computed(() => this._entityService.privateTodos().filter((t) => !t.deleted_at));
  }

  get sharedTodos(): ReturnType<typeof computed<Todo[]>> {
    return computed(() => this._entityService.sharedTodos().filter((t) => !t.deleted_at));
  }

  get publicTodos(): ReturnType<typeof computed<Todo[]>> {
    return computed(() => this._entityService.publicTodos().filter((t) => !t.deleted_at));
  }

  get todos(): ReturnType<typeof computed<Todo[]>> {
    return computed(() => this.allActiveTodos());
  }

  get tasks(): ReturnType<typeof computed<Task[]>> {
    return computed(() => this.activeTasks());
  }

  get subtasks(): ReturnType<typeof computed<Subtask[]>> {
    return computed(() => this.activeSubtasks());
  }

  get comments(): ReturnType<typeof computed<Comment[]>> {
    return computed(() => this.activeComments());
  }

  get chats(): ReturnType<typeof computed<Chat[]>> {
    return computed(() => this.activeChats());
  }

  get categories() {
    return this._entityService.categories.asReadonly();
  }

  get profiles() {
    return this._entityService.profiles.asReadonly();
  }

  get users() {
    return this._entityService.users.asReadonly();
  }

  get archivedTodos(): ReturnType<typeof computed<Todo[]>> {
    return computed(() =>
      [
        ...this._entityService.privateTodos(),
        ...this._entityService.sharedTodos(),
        ...this._entityService.publicTodos(),
      ].filter((t) => t.deleted_at)
    );
  }

  get archivedTasks(): ReturnType<typeof computed<Task[]>> {
    return computed(() => this._entityService.tasks().filter((t) => t.deleted_at));
  }

  get archivedSubtasks(): ReturnType<typeof computed<Subtask[]>> {
    return computed(() => this._entityService.subtasks().filter((s) => s.deleted_at));
  }

  get todoMap(): ReturnType<typeof computed<Map<string, Todo>>> {
    return computed(() => new Map(this.allActiveTodos().map((t) => [t.id, t])));
  }

  get taskMap(): ReturnType<typeof computed<Map<string, Task>>> {
    return computed(() => new Map(this.activeTasks().map((t) => [t.id, t])));
  }

  get subtaskMap(): ReturnType<typeof computed<Map<string, Subtask>>> {
    return computed(() => new Map(this.activeSubtasks().map((s) => [s.id, s])));
  }

  get commentMap(): ReturnType<typeof computed<Map<string, Comment>>> {
    return computed(() => new Map(this.activeComments().map((c) => [c.id, c])));
  }

  get tasksByTodoId(): ReturnType<typeof computed<Map<string, Task[]>>> {
    return computed(() => createGroupedMap(this.activeTasks(), (t) => t.todo_id));
  }

  get subtasksByTaskId(): ReturnType<typeof computed<Map<string, Subtask[]>>> {
    return computed(() => createGroupedMap(this.activeSubtasks(), (s) => s.task_id));
  }

  get commentsByTaskId(): ReturnType<typeof computed<Map<string, Comment[]>>> {
    return computed(() =>
      createGroupedMap(
        this.activeComments(),
        (c) => c.task_id as string,
        (c) => !!c.task_id
      )
    );
  }

  get commentsBySubtaskId(): ReturnType<typeof computed<Map<string, Comment[]>>> {
    return computed(() =>
      createGroupedMap(
        this.activeComments(),
        (c) => c.subtask_id as string,
        (c) => !!c.subtask_id
      )
    );
  }

  query(
    type: EntityType,
    filters?: {
      visibility?: VisibilityFilter;
      todoId?: string;
      taskId?: string;
      subtaskId?: string;
    }
  ): any[] {
    switch (type) {
      case "todos":
        if (!filters?.visibility || filters.visibility === "all") return this.todos();
        if (filters.visibility === "private") return this.privateTodos();
        if (filters.visibility === "shared") return this.sharedTodos();
        return this.publicTodos();
      case "tasks":
        return filters?.todoId ? this.tasksByTodoId().get(filters.todoId) || [] : this.tasks();
      case "subtasks":
        return filters?.taskId
          ? this.subtasksByTaskId().get(filters.taskId) || []
          : this.subtasks();
      case "comments":
        if (filters?.taskId) return this.commentsByTaskId().get(filters.taskId) || [];
        if (filters?.subtaskId) return this.commentsBySubtaskId().get(filters.subtaskId) || [];
        return this.comments();
      case "chats":
        return this.chats();
      default:
        return this._entityService.getSignal(type)() || [];
    }
  }

  find(type: EntityType, predicate: (item: any) => boolean): any | undefined {
    const items = this._entityService.getSignal(type)();
    return items.find(predicate);
  }

  findById(type: EntityType, id: string): any | undefined {
    if (type === "users" || type === "profiles") return undefined;
    const items = this._entityService.getSignal(type)();
    return items.find((e: any) => e.id === id);
  }

  create(type: EntityType, data: any): void {
    this._entityService.addEntity(type, data);
  }

  update(type: EntityType, data: any): void {
    this._entityService.updateEntity(type, data);
  }

  delete(type: EntityType, id: string): void {
    this._entityService.removeEntity(type, id);
  }

  bulkCreate(type: EntityType, items: any[]): void {
    items.forEach((item) => this._entityService.addEntity(type, item));
  }

  bulkUpdate(type: EntityType, items: any[]): void {
    items.forEach((item) => this._entityService.updateEntity(type, item));
  }

  private updatePagination(
    type: ChildType,
    skip: number,
    limit: number,
    receivedCount: number
  ): void {
    this._pagination.update((p) => ({
      ...p,
      [type]: { skip: skip + receivedCount, limit, hasMore: receivedCount >= limit },
    }));
  }

  resetPagination(type: ChildType): void {
    this._pagination.update((p) => ({ ...p, [type]: { ...DEFAULT_PAGINATION } }));
  }

  setHasMoreTodos(hasMore: boolean): void {
    this._pagination.update((p) => ({ ...p, todos: { ...p.todos, hasMore } }));
  }

  loadInitialData(type: string, limit: number): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getAdminDataPaginated(type, 0, limit).subscribe({
        next: (response) => {
          if (response.status === "Success" && response.data) {
            subscriber.next(response);
            subscriber.complete();
          } else subscriber.error(new Error(response.message || "Failed to load data"));
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  loadMoreData(type: string, skip: number): Observable<any> {
    return new Observable((subscriber) => {
      this.adminService.getAdminDataPaginated(type, skip, 10).subscribe({
        next: (response) => {
          if (response.status === "Success" && response.data) {
            subscriber.next(response);
            subscriber.complete();
          } else subscriber.error(new Error(response.message || "Failed to load more data"));
        },
        error: (err) => subscriber.error(err),
      });
    });
  }

  isCacheValid(cacheExpiryMs: number): boolean {
    if (this._loading()) return false;
    const last = this._lastLoaded();
    return last ? Date.now() - last.getTime() < cacheExpiryMs : false;
  }

  isLoading(): boolean {
    return this._loading();
  }

  isEntityLoading(
    entityType:
      | "todos"
      | "tasks"
      | "subtasks"
      | "categories"
      | "chats"
      | "comments"
      | "user"
      | "profile"
  ): boolean {
    switch (entityType) {
      case "todos":
        return this._todosLoading();
      case "tasks":
        return this._tasksLoading();
      case "subtasks":
        return this._subtasksLoading();
      case "categories":
        return this._categoriesLoading();
      case "chats":
        return this._chatsLoading();
      case "comments":
        return this._commentsLoading();
      case "user":
        return this._userLoading();
      case "profile":
        return this._profileLoading();
    }
  }

  setLoaded(loaded: boolean): void {
    this._loaded.set(loaded);
  }

  setLoading(loading: boolean): void {
    this._loading.set(loading);
  }

  setLastLoaded(date: Date | null): void {
    this._lastLoaded.set(date);
  }

  setAllProfiles(profiles: Profile[]): void {
    this._allProfiles.set(profiles);
  }

  setUser(user: User | null): void {
    this._user.set(user);
  }

  setDailyActivities(activities: any[]): void {
    this._dailyActivities.set(activities);
  }

  setCollection(
    type: string,
    items: any,
    options?: { append?: boolean; resetPagination?: boolean }
  ): void {
    switch (type) {
      case "categories":
        this._entityService.categories.set(items);
        break;
      case "profiles":
        this._entityService.profiles.set(items);
        if (items?.user) this._user.set(items.user);
        break;
      case "tasks":
        this.setArraySignal(this._entityService.tasks, items, options);
        break;
      case "subtasks":
        this.setArraySignal(this._entityService.subtasks, items, options);
        break;
      case "comments":
        this.setArraySignal(this._entityService.comments, items, options);
        break;
      case "chats":
        this.setArraySignal(this._entityService.chats, items, options);
        break;
      case "privateTodos":
        this.storeTodos("private", items, options);
        break;
      case "sharedTodos":
        this.storeTodos("shared", items, options);
        break;
      case "publicTodos":
        this.storeTodos("public", items, options);
        break;
      case "todos":
        this.storeTodosMixed(items, options);
        break;
      case "allProfiles":
        this._allProfiles.set(items);
        break;
      case "user":
        this._user.set(items);
        break;
      case "users":
        this._entityService.users.set(items);
        break;
      case "dailyActivities":
        this._dailyActivities.set(items);
        break;
    }
  }

  private setArraySignal<T extends { id: string }>(
    signal: WritableSignal<T[]>,
    items: T[],
    options?: { append?: boolean }
  ): void {
    if (options?.append) signal.update((existing: T[]) => [...existing, ...items]);
    else signal.update((existing: T[]) => upsertEntityBulk(existing, items));
  }

  private storeTodos(
    visibility: "private" | "shared" | "public",
    items: Todo[],
    options?: { append?: boolean; resetPagination?: boolean }
  ): void {
    const [extractNested, targetSignal] =
      visibility === "private"
        ? [
            (t: any) => {
              const n = { tasks: t.tasks, chats: t.chats, user: t.user };
              delete t.tasks;
              delete t.chats;
              delete t.user;
              return n;
            },
            this._entityService.privateTodos,
          ]
        : visibility === "public"
          ? [
              (t: any) => {
                const n = { tasks: t.tasks, chats: t.chats, user: t.user };
                delete t.tasks;
                delete t.chats;
                delete t.user;
                return n;
              },
              this._entityService.publicTodos,
            ]
          : [
              (t: any) => {
                const n = { tasks: t.tasks, chats: t.chats, user: t.user };
                delete t.tasks;
                delete t.chats;
                delete t.user;
                return n;
              },
              this._entityService.sharedTodos,
            ];
    const nested = { tasks: [] as Task[], chats: [] as Chat[], users: [] as User[] };
    const todos = items.map((todo) => {
      const n = extractNested(todo);
      if (n.tasks) nested.tasks.push(...n.tasks);
      if (n.chats) nested.chats.push(...n.chats);
      if (n.user) nested.users.push(n.user);
      return todo;
    });
    if (nested.tasks.length) this.setCollection("tasks", nested.tasks, { append: options?.append });
    if (nested.chats.length) this.setCollection("chats", nested.chats, { append: options?.append });
    if (nested.users.length) this.setCollection("users", nested.users, { append: options?.append });
    targetSignal.update((existing: Todo[]) => upsertEntityBulk(existing, todos));
  }

  private storeTodosMixed(
    items: Todo[],
    options?: { append?: boolean; resetPagination?: boolean }
  ): void {
    const privateItems: Todo[] = [],
      sharedItems: Todo[] = [],
      publicItems: Todo[] = [];
    items.forEach((todo) => {
      const vis = (todo as any).visibility || "private";
      if (vis === "private") privateItems.push(todo);
      else if (vis === "public") publicItems.push(todo);
      else sharedItems.push(todo);
    });
    if (privateItems.length) this.storeTodos("private", privateItems, options);
    if (sharedItems.length) this.storeTodos("shared", sharedItems, options);
    if (publicItems.length) this.storeTodos("public", publicItems, options);
  }

  getAdminDataWithRelations(): AdminDataWithRelations {
    return {
      todos: this._entityService.privateTodos(),
      tasks: this._entityService.tasks(),
      subtasks: this._entityService.subtasks(),
      comments: this._entityService.comments(),
      chats: this._entityService.chats(),
      categories: this._entityService.categories(),
      daily_activities: this._dailyActivities(),
      users: this._entityService.users(),
      profiles: this._entityService.profiles() ? [this._entityService.profiles()!] : [],
    };
  }

  loadAdminData(force: boolean = false): Observable<AdminDataWithRelations> {
    const hasAnyData =
      this._entityService.privateTodos().length > 0 ||
      this._entityService.tasks().length > 0 ||
      this._entityService.subtasks().length > 0;
    if (!force && !hasAnyData) force = true;
    if (!force && this.isCacheValid(DEFAULT_TTL_MS)) return of(this.getAdminDataWithRelations());
    if (this._loading()) return of(this.getAdminDataWithRelations());
    this._loading.set(true);

    this.ensureTodosLoaded();
    this.ensureTasksLoaded();
    this.ensureSubtasksLoaded();
    this.ensureCategoriesLoaded();
    this.ensureChatsLoaded();
    this.ensureCommentsLoaded();

    return of(this.getAdminDataWithRelations());
  }

  ensureTodosLoaded(visibility: string = "private", limit: number = 10): void {
    const targetSignal =
      visibility === "private"
        ? this._entityService.privateTodos
        : visibility === "public"
          ? this._entityService.publicTodos
          : this._entityService.sharedTodos;

    if (targetSignal().length > 0) return;

    this._todosLoading.set(true);
    this.apiService.todos.getAll({ visibility, limit, load: ["user"] }).subscribe({
      next: (todos) => {
        targetSignal.set(todos);
        this.updatePagination("todos", 0, limit, todos.length);
      },
      error: () => {},
      complete: () => {
        this._todosLoading.set(false);
      },
    });
  }

  ensureTasksLoaded(visibility: string = "private", limit: number = 10, todoId?: string): void {
    if (this._tasksLoading()) return;
    if (!todoId && this._entityService.tasks().length > 0) return;
    this._tasksLoading.set(true);
    this.apiService.tasks.getAll({ visibility, limit, todoId, load: ["user"] }).subscribe({
      next: (tasks) => {
        this._entityService.tasks.set(tasks);
        this.updatePagination("tasks", 0, limit, tasks.length);
      },
      error: () => {},
      complete: () => {
        this._tasksLoading.set(false);
      },
    });
  }

  ensureSubtasksLoaded(visibility: string = "private", limit: number = 10, taskId?: string): void {
    if (this._subtasksLoading()) return;
    if (!taskId && this._entityService.subtasks().length > 0) return;
    this._subtasksLoading.set(true);
    this.apiService.subtasks.getAll({ visibility, limit, taskId, load: ["user"] }).subscribe({
      next: (subtasks) => {
        this._entityService.subtasks.set(subtasks);
        this.updatePagination("subtasks", 0, limit, subtasks.length);
      },
      error: () => {},
      complete: () => {
        this._subtasksLoading.set(false);
      },
    });
  }

  ensureCategoriesLoaded(visibility: string = "all", limit: number = 100): void {
    if (this._categoriesLoading()) return;
    const existingSignal = this._entityService.categories;
    if (existingSignal && existingSignal().length > 0) return;

    this._categoriesLoading.set(true);
    this.apiService.categories.getAll({ visibility, limit }).subscribe({
      next: (categories) => {
        this._entityService.categories.set(categories);
      },
      error: () => {},
      complete: () => {
        this._categoriesLoading.set(false);
      },
    });
  }

  ensureChatsLoaded(visibility: string = "private", limit: number = 10): void {
    if (this._chatsLoading() || this._entityService.chats().length > 0) return;
    this._chatsLoading.set(true);
    this.apiService.chats.getAll({ visibility, limit }).subscribe({
      next: (chats) => {
        this._entityService.chats.set(chats);
        this.updatePagination("chats", 0, limit, chats.length);
      },
      error: () => {},
      complete: () => {
        this._chatsLoading.set(false);
      },
    });
  }

  ensureCommentsLoaded(visibility: string = "private", limit: number = 10): void {
    if (this._commentsLoading() || this._entityService.comments().length > 0) return;
    this._commentsLoading.set(true);
    this.apiService.comments.getAll({ visibility, limit }).subscribe({
      next: (comments) => {
        this._entityService.comments.set(comments);
        this.updatePagination("comments", 0, limit, comments.length);
      },
      error: () => {},
      complete: () => {
        this._commentsLoading.set(false);
      },
    });
  }

  loadMoreTodos(todoId?: string): void {
    if (this._todosLoading()) return;
    const currentPage = this._pagination().todos.skip / 10;
    this._todosLoading.set(true);
    this.apiService.todos.getAll({ page: currentPage + 1, limit: 10, todoId }).subscribe({
      next: (todos) => {
        this._entityService.privateTodos.update((existing) => [...existing, ...todos]);
        this.updatePagination("todos", (currentPage + 1) * 10, 10, todos.length);
      },
      error: () => {},
      complete: () => {
        this._todosLoading.set(false);
      },
    });
  }

  loadMoreTasks(todoId?: string): void {
    if (this._tasksLoading()) return;
    const currentPage = this._pagination().tasks.skip / 10;
    this._tasksLoading.set(true);
    this.apiService.tasks.getAll({ page: currentPage + 1, limit: 10, todoId }).subscribe({
      next: (tasks) => {
        this._entityService.tasks.update((existing) => [...existing, ...tasks]);
        this.updatePagination("tasks", (currentPage + 1) * 10, 10, tasks.length);
      },
      error: () => {},
      complete: () => {
        this._tasksLoading.set(false);
      },
    });
  }

  loadMoreSubtasks(taskId?: string): void {
    if (this._subtasksLoading()) return;
    const currentPage = this._pagination().subtasks.skip / 10;
    this._subtasksLoading.set(true);
    this.apiService.subtasks.getAll({ page: currentPage + 1, limit: 10, taskId }).subscribe({
      next: (subtasks) => {
        this._entityService.subtasks.update((existing) => [...existing, ...subtasks]);
        this.updatePagination("subtasks", (currentPage + 1) * 10, 10, subtasks.length);
      },
      error: () => {},
      complete: () => {
        this._subtasksLoading.set(false);
      },
    });
  }

  loadMoreCategories(): void {
    if (this._categoriesLoading()) return;
    const currentPage = this._pagination().categories.skip / 10;
    this._categoriesLoading.set(true);
    this.apiService.categories.getAll({ page: currentPage + 1, limit: 10 }).subscribe({
      next: (categories) => {
        this._entityService.categories.update((existing) => [...existing, ...categories]);
        this.updatePagination("categories", (currentPage + 1) * 10, 10, categories.length);
      },
      error: () => {},
      complete: () => {
        this._categoriesLoading.set(false);
      },
    });
  }

  loadMoreChats(): void {
    if (this._chatsLoading()) return;
    const currentPage = this._pagination().chats.skip / 10;
    this._chatsLoading.set(true);
    this.apiService.chats.getAll({ page: currentPage + 1, limit: 10 }).subscribe({
      next: (chats) => {
        this._entityService.chats.update((existing) => [...existing, ...chats]);
        this.updatePagination("chats", (currentPage + 1) * 10, 10, chats.length);
      },
      error: () => {},
      complete: () => {
        this._chatsLoading.set(false);
      },
    });
  }

  loadMoreComments(): void {
    if (this._commentsLoading()) return;
    const currentPage = this._pagination().comments.skip / 10;
    this._commentsLoading.set(true);
    this.apiService.comments.getAll({ page: currentPage + 1, limit: 10 }).subscribe({
      next: (comments) => {
        this._entityService.comments.update((existing) => [...existing, ...comments]);
        this.updatePagination("comments", (currentPage + 1) * 10, 10, comments.length);
      },
      error: () => {},
      complete: () => {
        this._commentsLoading.set(false);
      },
    });
  }

  ensureTaskCommentsLoaded(
    taskId: string,
    visibility: string = "private",
    limit: number = 10
  ): void {
    const existingComments = this.commentsByTaskId().get(taskId) || [];
    if (existingComments.length > 0) return;
    this._commentsLoading.set(true);
    this.apiService.comments
      .getAll({ visibility, limit, filter: { task_id: taskId }, load: ["user"] })
      .subscribe({
        next: (comments) => {
          this._entityService.comments.update((existing) => {
            const merged = new Map(existing.map((c) => [c.id, c]));
            comments.forEach((c) => merged.set(c.id, c));
            return Array.from(merged.values());
          });
        },
        error: () => {},
        complete: () => {
          this._commentsLoading.set(false);
        },
      });
  }

  private _loadingSubtaskComments = new Set<string>();

  ensureSubtaskCommentsLoaded(
    subtaskId: string,
    visibility: string = "private",
    limit: number = 10
  ): void {
    if (this._loadingSubtaskComments.has(subtaskId)) {
      return;
    }
    const existingComments = this.commentsBySubtaskId().get(subtaskId) || [];
    if (existingComments.length > 0) return;
    this._loadingSubtaskComments.add(subtaskId);
    this._commentsLoading.set(true);
    this.apiService.comments
      .getAll({ visibility, limit, filter: { subtask_id: { $in: [subtaskId] } }, load: ["user"] })
      .subscribe({
        next: (comments) => {
          this._entityService.comments.update((existing) => {
            const merged = new Map(existing.map((c) => [c.id, c]));
            comments.forEach((c) => merged.set(c.id, c));
            return Array.from(merged.values());
          });
        },
        error: () => {},
        complete: () => {
          this._loadingSubtaskComments.delete(subtaskId);
          this._commentsLoading.set(false);
        },
      });
  }

  getTodosByVisibility(visibility?: string): Todo[] {
    if (!visibility || visibility === "all") return this.todos();
    if (visibility === "private") return this.privateTodos();
    if (visibility === "shared") return this.sharedTodos();
    return this.publicTodos();
  }

  getTodosWithNestedTasks(): Todo[] {
    return this.todos().map((t) => ({ ...t, tasks: this.tasksByTodoId().get(t.id) || [] }));
  }

  getTasksWithNestedSubtasks(): Task[] {
    return this.tasks().map((t) => ({ ...t, subtasks: this.subtasksByTaskId().get(t.id) || [] }));
  }

  getSubtasksWithNestedComments(): Subtask[] {
    return this.subtasks().map((s) => ({
      ...s,
      comments: this.commentsBySubtaskId().get(s.id) || [],
    }));
  }

  getUnreadChatCount(_todoId: string, userId: string): number {
    return (this.chats() as Chat[]).filter((c: Chat) => !c.read_by?.includes(userId)).length;
  }

  getUsername(userId: string): string {
    const user = this._entityService.users().find((u) => u.id === userId);
    const profile = this._entityService.profiles() as unknown as Profile;
    if (profile?.name) return `${profile.name} ${profile.last_name || ""}`.trim();
    return user?.username || "Unknown";
  }

  subtaskExists(id: string): boolean {
    return this._entityService.subtasks().some((s) => s.id === id);
  }

  subtaskCountByTaskId(task_id?: string) {
    return computed(
      () => this._entityService.subtasks().filter((s) => s.task_id === task_id).length
    );
  }

  isPrivateData(entity: any): boolean {
    return entity?.visibility === "private";
  }

  canAccessOffline(visibility: VisibilityFilter): boolean {
    return visibility === "private";
  }

  setCollectionByTable(table: string, data: any[], options?: { append?: boolean }): void {
    const map: Record<string, EntityType> = {
      categories: "categories",
      profiles: "profiles",
      tasks: "tasks",
      subtasks: "subtasks",
      comments: "comments",
      chats: "chats",
      users: "users",
      dailyActivities: "dailyActivities",
    };
    if (map[table]) this.setCollection(map[table], data, options);
  }

  clearQueryState(): void {
    this._loaded.set(false);
    this._lastLoaded.set(null);
    this._allProfiles.set([]);
    this._user.set(null);
    this._dailyActivities.set([]);
    this._pagination.set({
      todos: { ...DEFAULT_PAGINATION },
      tasks: { ...DEFAULT_PAGINATION },
      subtasks: { ...DEFAULT_PAGINATION },
      categories: { ...DEFAULT_PAGINATION },
      comments: { ...DEFAULT_PAGINATION },
      chats: { ...DEFAULT_PAGINATION },
    });
  }

  ensureUserLoaded(): void {
    if (this._userLoading() || this._user()) return;
    this._userLoading.set(true);
    const token = this.jwtTokenService.getToken();
    const user = this.jwtTokenService.getUserFromToken(token);
    if (user) {
      this._entityService.setCurrentUser(user);
      this._user.set(user);
      this.setCollection("user", user);
    }
    this._userLoading.set(false);
  }

  ensureProfileLoaded(): void {
    if (this._profileLoading() || this._entityService.profiles()) return;
    this._profileLoading.set(true);
    const token = this.jwtTokenService.getToken();
    const userId = this.jwtTokenService.getUserId(token);
    if (!userId) {
      this._profileLoading.set(false);
      return;
    }
    this.apiService.profiles
      .getAll({ visibility: "private", filter: { user_id: userId }, load: ["user"] })
      .subscribe({
        next: (profiles) => {
          if (profiles && profiles.length > 0) {
            const profile = profiles[0];
            this.setCollection("profiles", profile);
            if ((profile as any).user) {
              this.setCollection("user", (profile as any).user);
            }
          } else {
            this.profileRequiredService.setProfileRequiredMode(true);
          }
        },
        error: () => {
          this.profileRequiredService.setProfileRequiredMode(true);
        },
        complete: () => {
          this._profileLoading.set(false);
        },
      });
  }

  ensurePublicProfilesLoaded(): void {
    if (this._publicProfileLoading() || this._entityService.publicProfiles().length > 0) return;
    this._publicProfileLoading.set(true);
    this.apiService.profiles.getAll({ visibility: "public" }).subscribe({
      next: (profiles) => {
        if (profiles && profiles.length > 0) {
          this._entityService.publicProfiles.set(profiles);
        }
      },
      error: () => {},
      complete: () => {
        this._publicProfileLoading.set(false);
      },
    });
  }
}
