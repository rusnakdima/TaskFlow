/* sys lib */
import { Injectable } from "@angular/core";

/* models */
import { Todo, Task, Subtask, Comment, Chat, Category } from "@entities/generated/api.types";
import { VisibilityFilter } from "@entities/storage.model";

/* base */
import { BaseStorageService } from "./storage-entity.service";

/* utils */
import { upsertEntityBulk } from "@store/utils/store-helpers";

@Injectable({ providedIn: "root" })
export class StoragePaginationService extends BaseStorageService {
  constructor() {
    super();
  }

  /* ════════════════════════════════════════════════════════════════════════
     HYDRATION METHODS - Auto-fetch from API when signal is empty
     ════════════════════════════════════════════════════════════════════════ */

  ensureTodosLoaded(visibility: VisibilityFilter = "all", limit = 10): void {
    if (this._todosLoading()) return;

    const existing = this.todos();
    if (existing.length > 0) {
      const hasPrivate =
        visibility === "all" || visibility === "private"
          ? existing.some((t) => t.visibility === "private")
          : true;
      const hasShared =
        visibility === "all" || visibility === "shared"
          ? existing.some((t) => t.visibility === "shared")
          : true;
      const hasPublic =
        visibility === "all" || visibility === "public"
          ? existing.some((t) => t.visibility === "public")
          : true;
      if (hasPrivate && hasShared && hasPublic) return;
    }

    this._todosLoading.set(true);
    this._apiService.todos.getAll({ visibility, limit, load: ["user"] }).subscribe({
      next: (todos) => {
        this.todos.update((existing) => upsertEntityBulk(existing, todos));
        this.updatePagination("todos", 0, limit, todos.length);
      },
      error: () => this._todosLoading.set(false),
      complete: () => this._todosLoading.set(false),
    });
  }

  ensureTasksLoaded(todoId?: string, visibility = "private", limit = 10): void {
    if (!todoId && this.activeTasks().length > 0) return;
    if (todoId && (this.tasksByTodoId().get(todoId)?.length ?? 0) > 0) return;
    if (this._tasksLoading()) return;

    this._tasksLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (todoId) filter["todo_id"] = todoId;

    this._apiService.tasks.getAll({ visibility, limit, filter, load: ["user"] }).subscribe({
      next: (tasks) => {
        this.tasks.update((existing) => upsertEntityBulk(existing, tasks));
        this.updatePagination("tasks", 0, limit, tasks.length);
      },
      error: () => this._tasksLoading.set(false),
      complete: () => this._tasksLoading.set(false),
    });
  }

  ensureSubtasksLoaded(taskId?: string, visibility = "private", limit = 10): void {
    if (!taskId && this.activeSubtasks().length > 0) return;
    if (taskId && (this.subtasksByTaskId().get(taskId)?.length ?? 0) > 0) return;
    if (this._subtasksLoading()) return;

    this._subtasksLoading.set(true);
    this._apiService.subtasks.getAll({ visibility, limit, taskId, load: ["user"] }).subscribe({
      next: (subtasks) => {
        this.subtasks.update((existing) => upsertEntityBulk(existing, subtasks));
        this.updatePagination("subtasks", 0, limit, subtasks.length);
      },
      error: () => this._subtasksLoading.set(false),
      complete: () => this._subtasksLoading.set(false),
    });
  }

  ensureCategoriesLoaded(visibility: VisibilityFilter = "all", limit = 100): void {
    if (this._categoriesLoading()) return;
    if (this.categories().length > 0) return;

    this._categoriesLoading.set(true);
    this._apiService.categories.getAll({ visibility, limit }).subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.updatePagination("categories", 0, limit, categories.length);
      },
      error: () => this._categoriesLoading.set(false),
      complete: () => this._categoriesLoading.set(false),
    });
  }

  ensureCommentsLoaded(taskId?: string, visibility = "private", limit = 10): void {
    if (taskId && (this.commentsByTaskId().get(taskId)?.length ?? 0) > 0) return;
    if (!taskId && this.activeComments().length > 0) return;
    if (this._commentsLoading()) return;

    this._commentsLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (taskId) filter["task_id"] = taskId;

    this._apiService.comments.getAll({ visibility, limit, filter, load: ["user"] }).subscribe({
      next: (comments) => {
        this.comments.update((existing) => upsertEntityBulk(existing, comments));
        this.updatePagination("comments", 0, limit, comments.length);
      },
      error: () => this._commentsLoading.set(false),
      complete: () => this._commentsLoading.set(false),
    });
  }

  ensureChatsLoaded(visibility = "private", limit = 50): void {
    if (this._chatsLoading() || this.activeChats().length > 0) return;

    this._chatsLoading.set(true);
    this._apiService.chats.getAll({ visibility, limit }).subscribe({
      next: (chats) => {
        this.chats.set(chats);
        this.updatePagination("chats", 0, limit, chats.length);
      },
      error: () => this._chatsLoading.set(false),
      complete: () => this._chatsLoading.set(false),
    });
  }

  ensureUserLoaded(): void {
    if (this._userLoading() || this.currentUser()) return;
    this._userLoading.set(true);

    const token = this._jwtTokenService.getToken();
    const user = this._jwtTokenService.getUserFromToken(token);
    if (user) {
      this.currentUser.set(user);
    }
    this._userLoading.set(false);
  }

  ensureProfileLoaded(): void {
    if (this._profileLoading() || this.profiles().length > 0) return;
    this._profileLoading.set(true);

    const token = this._jwtTokenService.getToken();
    const userId = this._jwtTokenService.getUserId(token);
    if (!userId) {
      this._profileLoading.set(false);
      return;
    }

    this._apiService.profiles
      .getAll({ visibility: "private", filter: { user_id: userId }, load: ["user"] })
      .subscribe({
        next: (profiles) => {
          if (profiles && profiles.length > 0) {
            this.profiles.set(profiles);
          }
        },
        error: () => this._profileLoading.set(false),
        complete: () => this._profileLoading.set(false),
      });
  }

  loadAllProfiles(): void {
    this._apiService.profiles.getAll({ visibility: "public", load: ["user"] }).subscribe({
      next: (profiles) => {
        this.publicProfiles.set(profiles || []);
      },
      error: () => {},
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     LAZY GETTERS - Returns data, triggers hydration if empty
     ════════════════════════════════════════════════════════════════════════ */

  getTodos(visibility: VisibilityFilter = "all"): Todo[] {
    if (this.todos().length === 0 && !this._todosLoading()) {
      this.ensureTodosLoaded(visibility);
    }
    switch (visibility) {
      case "private":
        return this.privateTodos();
      case "shared":
        return this.sharedTodos();
      case "public":
        return this.publicTodos();
      default:
        return this.allTodos();
    }
  }

  getTasks(todoId?: string): Task[] {
    if (todoId) {
      const tasks = this.tasksByTodoId().get(todoId) || [];
      if (tasks.length === 0 && !this._tasksLoading()) {
        this.ensureTasksLoaded(todoId);
      }
      return tasks;
    }
    if (this.activeTasks().length === 0 && !this._tasksLoading()) {
      this.ensureTasksLoaded();
    }
    return this.activeTasks();
  }

  getSubtasks(taskId?: string): Subtask[] {
    if (taskId) {
      const subtasks = this.subtasksByTaskId().get(taskId) || [];
      if (subtasks.length === 0 && !this._subtasksLoading()) {
        this.ensureSubtasksLoaded(taskId);
      }
      return subtasks;
    }
    if (this.activeSubtasks().length === 0 && !this._subtasksLoading()) {
      this.ensureSubtasksLoaded();
    }
    return this.activeSubtasks();
  }

  getComments(taskId?: string, subtaskId?: string): Comment[] {
    if (taskId) return this.commentsByTaskId().get(taskId) || [];
    if (subtaskId) return this.commentsBySubtaskId().get(subtaskId) || [];
    return this.activeComments();
  }

  getCategories(): Category[] {
    if (this.categories().length === 0 && !this._categoriesLoading()) {
      this.ensureCategoriesLoaded();
    }
    return this.categories();
  }

  getChats(): Chat[] {
    if (this.activeChats().length === 0 && !this._chatsLoading()) {
      this.ensureChatsLoaded();
    }
    return this.activeChats();
  }

  getRooms(): import("@entities/generated/api.types").Room[] {
    if (this.rooms().length === 0 && !this._roomsLoading()) {
      this.ensureRoomsLoaded();
    }
    return this.rooms();
  }

  ensureRoomsLoaded(): void {
    if (this._roomsLoading() || this.rooms().length > 0) return;
    if (!navigator.onLine || !this._mongoConnectionService.isConnected()) return;

    this._roomsLoading.set(true);
    const token = this._jwtTokenService.getToken();
    this._apiService.invokeCommand("get_rooms", { token, load: "participants" }).subscribe({
      next: (result: any) => {
        const rooms = Array.isArray(result) ? result : result?.data || [];
        this.rooms.set(rooms);
      },
      error: () => this._roomsLoading.set(false),
      complete: () => this._roomsLoading.set(false),
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     PAGINATION - Load more data
     ════════════════════════════════════════════════════════════════════════ */

  loadMoreTodos(visibility: VisibilityFilter = "all"): void {
    if (this._todosLoading() || !this.hasMoreTodos()) return;
    const pagination = this._pagination().todos;
    const nextPage = pagination.skip / pagination.limit + 1;

    this._todosLoading.set(true);
    this._apiService.todos
      .getAll({ page: nextPage, limit: pagination.limit, visibility })
      .subscribe({
        next: (todos) => {
          this.todos.update((existing) => upsertEntityBulk(existing, todos));
          this.updatePagination(
            "todos",
            nextPage * pagination.limit,
            pagination.limit,
            todos.length
          );
        },
        error: () => this._todosLoading.set(false),
        complete: () => this._todosLoading.set(false),
      });
  }

  loadMoreTasks(
    todoId?: string,
    visibility = "private",
    userId?: string,
    assigneeId?: string
  ): void {
    if (this._tasksLoading() || !this.hasMoreTasks()) return;
    const pagination = this._pagination().tasks;
    const nextPage = pagination.skip / pagination.limit + 1;

    this._tasksLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (todoId) filter["todo_id"] = todoId;

    if (userId || assigneeId) {
      const orConditions: Record<string, string>[] = [];
      if (userId) orConditions.push({ user_id: userId });
      if (assigneeId) orConditions.push({ assignees: assigneeId });
      filter["$or"] = orConditions;
    }

    this._apiService.tasks
      .getAll({ page: nextPage, visibility, limit: pagination.limit, filter })
      .subscribe({
        next: (tasks) => {
          this.tasks.update((existing) => [...existing, ...tasks]);
          this.updatePagination(
            "tasks",
            nextPage * pagination.limit,
            pagination.limit,
            tasks.length
          );
        },
        error: () => this._tasksLoading.set(false),
        complete: () => this._tasksLoading.set(false),
      });
  }

  loadMoreSubtasks(taskId?: string): void {
    if (this._subtasksLoading() || !this.hasMoreSubtasks()) return;
    const pagination = this._pagination().subtasks;
    const nextPage = pagination.skip / pagination.limit + 1;

    this._subtasksLoading.set(true);
    this._apiService.subtasks
      .getAll({ page: nextPage, limit: pagination.limit, taskId })
      .subscribe({
        next: (subtasks) => {
          this.subtasks.update((existing) => [...existing, ...subtasks]);
          this.updatePagination(
            "subtasks",
            nextPage * pagination.limit,
            pagination.limit,
            subtasks.length
          );
        },
        error: () => this._subtasksLoading.set(false),
        complete: () => this._subtasksLoading.set(false),
      });
  }

  loadMoreCategories(): void {
    if (this._categoriesLoading() || !this.hasMoreCategories()) return;
    const pagination = this._pagination().categories;
    const nextPage = pagination.skip / pagination.limit + 1;

    this._categoriesLoading.set(true);
    this._apiService.categories.getAll({ page: nextPage, limit: pagination.limit }).subscribe({
      next: (categories) => {
        this.categories.update((existing) => [...existing, ...categories]);
        this.updatePagination(
          "categories",
          nextPage * pagination.limit,
          pagination.limit,
          categories.length
        );
      },
      error: () => this._categoriesLoading.set(false),
      complete: () => this._categoriesLoading.set(false),
    });
  }

  loadMoreComments(taskId?: string): void {
    if (this._commentsLoading() || !this.hasMoreComments()) return;
    const pagination = this._pagination().comments;
    const nextPage = pagination.skip / pagination.limit + 1;

    this._commentsLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (taskId) filter["task_id"] = taskId;

    this._apiService.comments
      .getAll({ page: nextPage, limit: pagination.limit, filter })
      .subscribe({
        next: (comments) => {
          this.comments.update((existing) => [...existing, ...comments]);
          this.updatePagination(
            "comments",
            nextPage * pagination.limit,
            pagination.limit,
            comments.length
          );
        },
        error: () => this._commentsLoading.set(false),
        complete: () => this._commentsLoading.set(false),
      });
  }

  loadMoreChats(): void {
    if (this._chatsLoading() || !this.hasMoreChats()) return;
    const pagination = this._pagination().chats;
    const nextPage = pagination.skip / pagination.limit + 1;

    this._chatsLoading.set(true);
    this._apiService.chats.getAll({ page: nextPage, limit: pagination.limit }).subscribe({
      next: (chats) => {
        this.chats.update((existing) => [...existing, ...chats]);
        this.updatePagination("chats", nextPage * pagination.limit, pagination.limit, chats.length);
      },
      error: () => this._chatsLoading.set(false),
      complete: () => this._chatsLoading.set(false),
    });
  }
}
