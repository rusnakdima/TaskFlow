/* sys lib */
import { Injectable, inject, signal, computed, Injector, WritableSignal } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, map, catchError } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { User } from "@models/user.model";
import { Profile } from "@models/profile.model";
import { EntityType, VisibilityFilter, ChildType, PaginationState } from "@models/storage.model";

/* services */
import { AdminService } from "@services/data/admin.service";
import { AdminDataService, AdminDataWithRelations } from "@services/core/admin-data.service";

/* utils */
import { deduplicateById, upsertEntityBulk, createGroupedMap } from "@stores/utils/store-helpers";

import { StorageEntityService } from "./storage-entity.service";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PAGINATION: PaginationState = { skip: 0, limit: 20, hasMore: true };

@Injectable({ providedIn: "root" })
export class StorageQueryService {
  private readonly _injector = inject(Injector);
  private readonly _entityService = inject(StorageEntityService);
  private _adminService: AdminService | null = null;
  private _adminDataService: AdminDataService | null = null;

  private readonly _loaded = signal(false);
  private readonly _loading = signal(false);
  private readonly _lastLoaded = signal<Date | null>(null);
  private readonly _allProfiles = signal<Profile[]>([]);
  private readonly _user = signal<User | null>(null);
  private readonly _dailyActivities = signal<any[]>([]);

  private readonly _pagination = signal<Record<ChildType, PaginationState>>({
    todos: { ...DEFAULT_PAGINATION },
    tasks: { ...DEFAULT_PAGINATION },
    subtasks: { ...DEFAULT_PAGINATION },
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

  private get adminDataService(): AdminDataService {
    if (!this._adminDataService)
      this._adminDataService = this._injector.get(AdminDataService) as AdminDataService;
    return this._adminDataService;
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
        (c) => c.task_id,
        (c) => !!c.task_id
      )
    );
  }

  get commentsBySubtaskId(): ReturnType<typeof computed<Map<string, Comment[]>>> {
    return computed(() =>
      createGroupedMap(
        this.activeComments(),
        (c) => c.subtask_id,
        (c) => !!c.subtask_id
      )
    );
  }

  get chatsByTodoId(): ReturnType<typeof computed<Map<string, Chat[]>>> {
    return computed(() =>
      createGroupedMap(
        this.activeChats(),
        (c) => c.todo_id,
        (c) => !!c.todo_id
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
        return filters?.todoId ? this.chatsByTodoId().get(filters.todoId) || [] : this.chats();
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

  updatePagination(type: ChildType, skip: number, limit: number, receivedCount: number): void {
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
    return this.adminDataService.loadAllAdminData().pipe(
      tap((data: AdminDataWithRelations) => {
        this._entityService.privateTodos.set(data["todos"] || []);
        this._entityService.tasks.set(data["tasks"] || []);
        this._entityService.subtasks.set(data["subtasks"] || []);
        this._entityService.comments.set(data["comments"] || []);
        this._entityService.chats.set(data["chats"] || []);
        this._entityService.categories.set(data["categories"] || []);
        this._dailyActivities.set(data["daily_activities"] || []);
        this.extractUsersAndProfiles(data);
        this._loading.set(false);
        this._loaded.set(true);
        this._lastLoaded.set(new Date());
      }),
      catchError((_err) => {
        this._loading.set(false);
        return of(this.getAdminDataWithRelations());
      }),
      map(() => this.getAdminDataWithRelations())
    );
  }

  private extractUsersAndProfiles(data: AdminDataWithRelations): void {
    const usersMap = new Map<string, User>();
    const profilesMap = new Map<string, Profile>();
    const extract = (entity: any) => {
      if (!entity?.user) return;
      usersMap.set(entity.user.id, entity.user);
      if (entity.user.profile) profilesMap.set(entity.user.profile.id, entity.user.profile);
    };
    data["todos"]?.forEach((todo: any) => {
      extract(todo);
      todo.categories?.forEach(extract);
    });
    data["tasks"]?.forEach((task: any) => {
      if (task.todo) extract(task.todo);
    });
    data["subtasks"]?.forEach((subtask: any) => {
      if (subtask.task?.todo) extract(subtask.task.todo);
      if (subtask.task) extract(subtask.task);
    });
    data["categories"]?.forEach(extract);
    data["comments"]?.forEach(extract);
    data["chats"]?.forEach(extract);
    this._entityService.users.set(Array.from(usersMap.values()));
    this._entityService.profiles.set(Object.fromEntries(profilesMap) as unknown as Profile);
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

  getUnreadChatCount(todoId: string, userId: string): number {
    return (
      this.chatsByTodoId()
        .get(todoId)
        ?.filter((c) => !c.read_by?.includes(userId)).length || 0
    );
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
      comments: { ...DEFAULT_PAGINATION },
      chats: { ...DEFAULT_PAGINATION },
    });
  }
}
