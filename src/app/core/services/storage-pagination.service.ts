/* sys lib */
import { Injectable, inject } from "@angular/core";
/* models */
import { Todo, Task, Subtask, Comment, Chat, Category, Room } from "@entities/generated/api.types";
import { VisibilityFilter, ChildType } from "@entities/storage.model";
/* base */
import { BaseStorageService } from "./storage-entity.service";
/* utils */
import { upsertEntityBulk } from "@store/utils/store-helpers";
@Injectable({ providedIn: "root" })
export class StoragePaginationService {
  private readonly _base = inject(BaseStorageService);
  /* ════════════════════════════════════════════════════════════════════════
     PROXY ALL CALLS TO _base (single source of truth - no duplication)
     ════════════════════════════════════════════════════════════════════════ */
  ensureTodosLoaded(visibility: VisibilityFilter = "all", limit = 10): void {
    if (this._base.todosLoading()) return;
    if (visibility !== "all") {
      const existing = this._base.todos();
      if (existing.length > 0) {
        const hasPrivate =
          visibility === "private" ? existing.some((t) => t.visibility === "private") : true;
        const hasShared =
          visibility === "shared" ? existing.some((t) => t.visibility === "shared") : true;
        const hasPublic =
          visibility === "public" ? existing.some((t) => t.visibility === "public") : true;
        if (hasPrivate && hasShared && hasPublic) return;
      }
    }
    this._base.todosLoading.set(true);
    this._base.apiService.todos.getAll({ visibility, limit, load: ["user"] }).subscribe({
      next: (todos) => {
        this._base.todos.update((existing) => upsertEntityBulk(existing, todos));
        this.updatePagination("todos", 0, limit, todos.length);
      },
      error: () => this._base.todosLoading.set(false),
      complete: () => this._base.todosLoading.set(false),
    });
  }
  ensureTasksLoaded(todoId?: string, visibility = "private", limit = 10): void {
    if (!todoId && this._base.activeTasks().length > 0) return;
    if (todoId && (this._base.tasksByTodoId().get(todoId)?.length ?? 0) > 0) return;
    if (this._base.tasksLoading()) return;
    this._base.tasksLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (todoId) filter["todo_id"] = todoId;
    this._base.apiService.tasks.getAll({ visibility, limit, filter, load: ["user"] }).subscribe({
      next: (tasks) => {
        this._base.tasks.update((existing) => upsertEntityBulk(existing, tasks));
        this.updatePagination("tasks", 0, limit, tasks.length);
      },
      error: () => this._base.tasksLoading.set(false),
      complete: () => this._base.tasksLoading.set(false),
    });
  }
  ensureSubtasksLoaded(taskId?: string, visibility = "private", limit = 10): void {
    if (!taskId && this._base.activeSubtasks().length > 0) return;
    if (taskId && (this._base.subtasksByTaskId().get(taskId)?.length ?? 0) > 0) return;
    if (this._base.subtasksLoading()) return;
    this._base.subtasksLoading.set(true);
    this._base.apiService.subtasks.getAll({ visibility, limit, taskId, load: ["user"] }).subscribe({
      next: (subtasks) => {
        this._base.subtasks.update((existing) => upsertEntityBulk(existing, subtasks));
        this.updatePagination("subtasks", 0, limit, subtasks.length);
      },
      error: () => this._base.subtasksLoading.set(false),
      complete: () => this._base.subtasksLoading.set(false),
    });
  }
  ensureCategoriesLoaded(visibility: VisibilityFilter = "all", limit = 100): void {
    if (this._base.categoriesLoading()) return;
    if (this._base.categories().length > 0) return;
    this._base.categoriesLoading.set(true);
    this._base.apiService.categories.getAll({ visibility, limit }).subscribe({
      next: (categories) => {
        this._base.categories.set(categories);
        this.updatePagination("categories", 0, limit, categories.length);
      },
      error: () => this._base.categoriesLoading.set(false),
      complete: () => this._base.categoriesLoading.set(false),
    });
  }
  ensureCommentsLoaded(taskId?: string, visibility = "private", limit = 10): void {
    if (taskId && (this._base.commentsByTaskId().get(taskId)?.length ?? 0) > 0) return;
    if (!taskId && this._base.activeComments().length > 0) return;
    if (this._base.commentsLoading()) return;
    this._base.commentsLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (taskId) filter["task_id"] = taskId;
    this._base.apiService.comments.getAll({ visibility, limit, filter, load: ["user"] }).subscribe({
      next: (comments) => {
        this._base.comments.update((existing) => upsertEntityBulk(existing, comments));
        this.updatePagination("comments", 0, limit, comments.length);
      },
      error: () => this._base.commentsLoading.set(false),
      complete: () => this._base.commentsLoading.set(false),
    });
  }
  ensureChatsLoaded(visibility = "private", limit = 50): void {
    if (this._base.chatsLoading() || this._base.activeChats().length > 0) return;
    this._base.chatsLoading.set(true);
    this._base.apiService.chats.getAll({ visibility, limit }).subscribe({
      next: (chats) => {
        this._base.chats.set(chats);
        this.updatePagination("chats", 0, limit, chats.length);
      },
      error: () => this._base.chatsLoading.set(false),
      complete: () => this._base.chatsLoading.set(false),
    });
  }
  ensureUserLoaded(): void {
    if (this._base.userLoading() || this._base.currentUser()) return;
    this._base.userLoading.set(true);
    const token = this._base.jwtTokenService.getToken();
    const user = this._base.jwtTokenService.getUserFromToken(token);
    if (user) this._base.currentUser.set(user);
    this._base.userLoading.set(false);
  }
  ensureProfileLoaded(): void {
    if (this._base.profileLoading() || this._base.profiles().length > 0) return;
    this._base.profileLoading.set(true);
    const token = this._base.jwtTokenService.getToken();
    const userId = this._base.jwtTokenService.getUserId(token);
    if (!userId) {
      this._base.profileLoading.set(false);
      return;
    }
    this._base.apiService.profiles
      .getAll({ visibility: "private", filter: { user_id: userId }, load: ["user"] })
      .subscribe({
        next: (profiles) => {
          if (profiles && profiles.length > 0) {
            this._base.profiles.set(profiles);
          }
        },
        error: () => this._base.profileLoading.set(false),
        complete: () => this._base.profileLoading.set(false),
      });
  }
  loadAllProfiles(): void {
    this._base.apiService.profiles.getAll({ visibility: "public", load: ["user"] }).subscribe({
      next: (profiles) => this._base.publicProfiles.set(profiles || []),
      error: () => {},
    });
  }
  ensureRoomsLoaded(): void {
    if (this._base.roomsLoading() || this._base.rooms().length > 0) return;
    if (!navigator.onLine || !this._base.mongoConnectionService.isConnected()) return;
    this._base.roomsLoading.set(true);
    const token = this._base.jwtTokenService.getToken();
    this._base.apiService.invokeCommand("get_rooms", { token, load: "participants" }).subscribe({
      next: (result: any) => {
        const rooms = Array.isArray(result) ? result : result?.data || [];
        this._base.rooms.set(rooms);
      },
      error: () => this._base.roomsLoading.set(false),
      complete: () => this._base.roomsLoading.set(false),
    });
  }
  /* ════════════════════════════════════════════════════════════════════════
     LAZY GETTERS
     ════════════════════════════════════════════════════════════════════════ */
  getTodos(visibility: VisibilityFilter = "all"): Todo[] {
    if (this._base.todos().length === 0 && !this._base.todosLoading())
      this.ensureTodosLoaded(visibility);
    switch (visibility) {
      case "private":
        return this._base.privateTodos();
      case "shared":
        return this._base.sharedTodos();
      case "public":
        return this._base.publicTodos();
      default:
        return this._base.allTodos();
    }
  }
  getTasks(todoId?: string): Task[] {
    if (todoId) {
      const tasks = this._base.tasksByTodoId().get(todoId) || [];
      if (tasks.length === 0 && !this._base.tasksLoading()) this.ensureTasksLoaded(todoId);
      return tasks;
    }
    if (this._base.activeTasks().length === 0 && !this._base.tasksLoading())
      this.ensureTasksLoaded();
    return this._base.activeTasks();
  }
  getSubtasks(taskId?: string): Subtask[] {
    if (taskId) {
      const subtasks = this._base.subtasksByTaskId().get(taskId) || [];
      if (subtasks.length === 0 && !this._base.subtasksLoading()) this.ensureSubtasksLoaded(taskId);
      return subtasks;
    }
    if (this._base.activeSubtasks().length === 0 && !this._base.subtasksLoading())
      this.ensureSubtasksLoaded();
    return this._base.activeSubtasks();
  }
  getComments(taskId?: string, subtaskId?: string): Comment[] {
    if (taskId) return this._base.commentsByTaskId().get(taskId) || [];
    if (subtaskId) return this._base.commentsBySubtaskId().get(subtaskId) || [];
    return this._base.activeComments();
  }
  getCategories(): Category[] {
    if (this._base.categories().length === 0 && !this._base.categoriesLoading())
      this.ensureCategoriesLoaded();
    return this._base.categories();
  }
  getChats(): Chat[] {
    if (this._base.activeChats().length === 0 && !this._base.chatsLoading())
      this.ensureChatsLoaded();
    return this._base.activeChats();
  }
  getRooms(): Room[] {
    if (this._base.rooms().length === 0 && !this._base.roomsLoading()) this.ensureRoomsLoaded();
    return this._base.rooms();
  }
  /* ════════════════════════════════════════════════════════════════════════
     PAGINATION - Load more
     ════════════════════════════════════════════════════════════════════════ */
  loadMoreTodos(visibility: VisibilityFilter = "all"): void {
    if (this._base.todosLoading() || !this.hasMoreTodos()) return;
    const pagination = this._base.pagination().todos;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._base.todosLoading.set(true);
    this._base.apiService.todos
      .getAll({ page: nextPage, limit: pagination.limit, visibility })
      .subscribe({
        next: (todos) => {
          this._base.todos.update((existing) => upsertEntityBulk(existing, todos));
          this.updatePagination(
            "todos",
            nextPage * pagination.limit,
            pagination.limit,
            todos.length
          );
        },
        error: () => this._base.todosLoading.set(false),
        complete: () => this._base.todosLoading.set(false),
      });
  }
  loadMoreTasks(
    todoId?: string,
    visibility = "private",
    userId?: string,
    assigneeId?: string
  ): void {
    if (this._base.tasksLoading() || !this.hasMoreTasks()) return;
    const pagination = this._base.pagination().tasks;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._base.tasksLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (todoId) filter["todo_id"] = todoId;
    if (userId || assigneeId) {
      const orConditions: Record<string, string>[] = [];
      if (userId) orConditions.push({ user_id: userId });
      if (assigneeId) orConditions.push({ assignees: assigneeId });
      filter["$or"] = orConditions;
    }
    this._base.apiService.tasks
      .getAll({ page: nextPage, visibility, limit: pagination.limit, filter })
      .subscribe({
        next: (tasks) => {
          this._base.tasks.update((existing) => [...existing, ...tasks]);
          this.updatePagination(
            "tasks",
            nextPage * pagination.limit,
            pagination.limit,
            tasks.length
          );
        },
        error: () => this._base.tasksLoading.set(false),
        complete: () => this._base.tasksLoading.set(false),
      });
  }
  loadMoreSubtasks(taskId?: string): void {
    if (this._base.subtasksLoading() || !this.hasMoreSubtasks()) return;
    const pagination = this._base.pagination().subtasks;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._base.subtasksLoading.set(true);
    this._base.apiService.subtasks
      .getAll({ page: nextPage, limit: pagination.limit, taskId })
      .subscribe({
        next: (subtasks) => {
          this._base.subtasks.update((existing) => [...existing, ...subtasks]);
          this.updatePagination(
            "subtasks",
            nextPage * pagination.limit,
            pagination.limit,
            subtasks.length
          );
        },
        error: () => this._base.subtasksLoading.set(false),
        complete: () => this._base.subtasksLoading.set(false),
      });
  }
  loadMoreCategories(): void {
    if (this._base.categoriesLoading() || !this.hasMoreCategories()) return;
    const pagination = this._base.pagination().categories;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._base.categoriesLoading.set(true);
    this._base.apiService.categories.getAll({ page: nextPage, limit: pagination.limit }).subscribe({
      next: (categories) => {
        this._base.categories.update((existing) => [...existing, ...categories]);
        this.updatePagination(
          "categories",
          nextPage * pagination.limit,
          pagination.limit,
          categories.length
        );
      },
      error: () => this._base.categoriesLoading.set(false),
      complete: () => this._base.categoriesLoading.set(false),
    });
  }
  loadMoreComments(taskId?: string): void {
    if (this._base.commentsLoading() || !this.hasMoreComments()) return;
    const pagination = this._base.pagination().comments;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._base.commentsLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (taskId) filter["task_id"] = taskId;
    this._base.apiService.comments
      .getAll({ page: nextPage, limit: pagination.limit, filter })
      .subscribe({
        next: (comments) => {
          this._base.comments.update((existing) => [...existing, ...comments]);
          this.updatePagination(
            "comments",
            nextPage * pagination.limit,
            pagination.limit,
            comments.length
          );
        },
        error: () => this._base.commentsLoading.set(false),
        complete: () => this._base.commentsLoading.set(false),
      });
  }
  loadMoreChats(): void {
    if (this._base.chatsLoading() || !this.hasMoreChats()) return;
    const pagination = this._base.pagination().chats;
    const nextPage = pagination.skip / pagination.limit + 1;
    this._base.chatsLoading.set(true);
    this._base.apiService.chats.getAll({ page: nextPage, limit: pagination.limit }).subscribe({
      next: (chats) => {
        this._base.chats.update((existing) => [...existing, ...chats]);
        this.updatePagination("chats", nextPage * pagination.limit, pagination.limit, chats.length);
      },
      error: () => this._base.chatsLoading.set(false),
      complete: () => this._base.chatsLoading.set(false),
    });
  }
  /* ════════════════════════════════════════════════════════════════════════
     HAS MORE CHECKS
     ════════════════════════════════════════════════════════════════════════ */
  hasMoreTodos(): boolean {
    return this._base.pagination().todos?.hasMore ?? true;
  }
  hasMoreTasks(): boolean {
    return this._base.pagination().tasks?.hasMore ?? true;
  }
  hasMoreSubtasks(): boolean {
    return this._base.pagination().subtasks?.hasMore ?? true;
  }
  hasMoreCategories(): boolean {
    return this._base.pagination().categories?.hasMore ?? true;
  }
  hasMoreComments(): boolean {
    return this._base.pagination().comments?.hasMore ?? true;
  }
  hasMoreChats(): boolean {
    return this._base.pagination().chats?.hasMore ?? true;
  }
  /* ════════════════════════════════════════════════════════════════════════
     PAGINATION STATE
     ════════════════════════════════════════════════════════════════════════ */
  private updatePagination(entity: ChildType, skip: number, limit: number, received: number): void {
    this._base.pagination.update((p) => ({
      ...p,
      [entity]: { skip: skip + received, limit, hasMore: received >= limit },
    }));
  }
  resetPagination(entity: ChildType): void {
    this._base.pagination.update((p) => ({
      ...p,
      [entity]: { skip: 0, limit: 10, hasMore: true },
    }));
  }
}
