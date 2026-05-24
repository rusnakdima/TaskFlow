/* sys lib */
import { Injectable, inject, signal, computed, WritableSignal } from "@angular/core";
import { Observable, of, from } from "rxjs";
import { tap, catchError, map } from "rxjs/operators";

/* models */
import {
  Todo,
  Task,
  Subtask,
  Comment,
  Chat,
  User,
  Category,
  Profile,
  Room,
} from "@models/generated/api.types";
import { EntityType, VisibilityFilter, ChildType, PaginationState } from "@models/storage.model";
import { ConversationItem, ChatMessage } from "@models/chat.model";

/* services */
import { ApiService } from "@services/api.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { NotifyService } from "@services/notifications/notify.service";
import { MongoConnectionService } from "@services/core/mongo-connection.service";

/* utils */
import {
  upsertEntityBulk,
  updateEntityInSignal,
  removeEntityFromSignal,
  addEntityToSignal,
} from "@stores/utils/store-helpers";

const DEFAULT_PAGINATION: PaginationState = { skip: 0, limit: 20, hasMore: true };

@Injectable({ providedIn: "root" })
export class UnifiedStorageService {
  private readonly _apiService = inject(ApiService);
  private readonly _jwtTokenService = inject(JwtTokenService);
  private readonly _notifyService = inject(NotifyService);
  private readonly _mongoConnectionService = inject(MongoConnectionService);

  /* ════════════════════════════════════════════════════════════════════════
     SINGLE SOURCE OF TRUTH SIGNALS - One signal per entity type
     ════════════════════════════════════════════════════════════════════════ */

  readonly todos = signal<Todo[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly subtasks = signal<Subtask[]>([]);
  readonly comments = signal<Comment[]>([]);
  readonly chats = signal<Chat[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly profiles = signal<Profile[]>([]);
  readonly publicProfiles = signal<Profile[]>([]);
  readonly users = signal<User[]>([]);
  readonly currentUser = signal<User | null>(null);
  readonly rooms = signal<Room[]>([]);

  // Chat state
  readonly conversations = signal<ConversationItem[]>([]);
  readonly messages = signal<ChatMessage[]>([]);
  readonly activeConversationId = signal<string | null>(null);

  // Loading states
  private readonly _todosLoading = signal(false);
  private readonly _tasksLoading = signal(false);
  private readonly _subtasksLoading = signal(false);
  private readonly _categoriesLoading = signal(false);
  private readonly _chatsLoading = signal(false);
  private readonly _commentsLoading = signal(false);
  private readonly _userLoading = signal(false);
  private readonly _profileLoading = signal(false);
  private readonly _roomsLoading = signal(false);

  private readonly _loaded = signal(false);
  private readonly _lastLoaded = signal<Date | null>(null);

  private readonly _pagination = signal<Record<ChildType, PaginationState>>({
    todos: { ...DEFAULT_PAGINATION },
    tasks: { ...DEFAULT_PAGINATION },
    subtasks: { ...DEFAULT_PAGINATION },
    categories: { ...DEFAULT_PAGINATION },
    comments: { ...DEFAULT_PAGINATION },
    chats: { ...DEFAULT_PAGINATION },
  });

  /* ════════════════════════════════════════════════════════════════════════
     FILTERED COMPUTED SIGNALS - Derived from single source signals
     Pages filter from ONE signal: todos(), tasks(), etc.
     ════════════════════════════════════════════════════════════════════════ */

  // Todo filters by visibility
  readonly privateTodos = computed(() =>
    this.todos().filter((t) => t.visibility === "private" && !t.deleted_at)
  );
  readonly sharedTodos = computed(() =>
    this.todos().filter((t) => t.visibility === "shared" && !t.deleted_at)
  );
  readonly publicTodos = computed(() =>
    this.todos().filter((t) => t.visibility === "public" && !t.deleted_at)
  );
  readonly allTodos = computed(() => this.todos().filter((t) => !t.deleted_at));
  readonly archivedTodos = computed(() => this.todos().filter((t) => !!t.deleted_at));

  // Task filters
  readonly activeTasks = computed(() => this.tasks().filter((t) => !t.deleted_at));
  readonly archivedTasks = computed(() => this.tasks().filter((t) => !!t.deleted_at));
  readonly tasksByTodoId = computed(() => {
    const map = new Map<string, Task[]>();
    for (const task of this.activeTasks()) {
      const arr = map.get(task.todo_id) || [];
      arr.push(task);
      map.set(task.todo_id, arr);
    }
    return map;
  });

  // Subtask filters
  readonly activeSubtasks = computed(() => this.subtasks().filter((s) => !s.deleted_at));
  readonly archivedSubtasks = computed(() => this.subtasks().filter((s) => !!s.deleted_at));
  readonly subtasksByTaskId = computed(() => {
    const map = new Map<string, Subtask[]>();
    for (const subtask of this.activeSubtasks()) {
      const arr = map.get(subtask.task_id) || [];
      arr.push(subtask);
      map.set(subtask.task_id, arr);
    }
    return map;
  });

  // Comment filters
  readonly activeComments = computed(() => this.comments().filter((c) => !c.deleted_at));
  readonly commentsByTaskId = computed(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of this.activeComments()) {
      if (comment.task_id) {
        const arr = map.get(comment.task_id) || [];
        arr.push(comment);
        map.set(comment.task_id, arr);
      }
    }
    return map;
  });

  readonly commentsBySubtaskId = computed(() => {
    const map = new Map<string, Comment[]>();
    for (const comment of this.activeComments()) {
      if (comment.subtask_id) {
        const arr = map.get(comment.subtask_id) || [];
        arr.push(comment);
        map.set(comment.subtask_id, arr);
      }
    }
    return map;
  });

  // Chat filters
  readonly activeChats = computed(() => this.chats().filter((c) => !c.deleted_at));

  // Maps for quick lookups
  readonly todoMap = computed(() => new Map(this.allTodos().map((t) => [t.id, t])));
  readonly taskMap = computed(() => new Map(this.activeTasks().map((t) => [t.id, t])));
  readonly subtaskMap = computed(() => new Map(this.activeSubtasks().map((s) => [s.id, s])));
  readonly commentMap = computed(() => new Map(this.activeComments().map((c) => [c.id, c])));

  /* ════════════════════════════════════════════════════════════════════════
     LOADING STATE GETTERS
     ════════════════════════════════════════════════════════════════════════ */

  get isLoading(): ReturnType<typeof this._loaded.asReadonly> {
    return this._loaded.asReadonly();
  }

  get lastLoaded(): ReturnType<typeof this._lastLoaded.asReadonly> {
    return this._lastLoaded.asReadonly();
  }

  isEntityLoading(type: EntityType): boolean {
    switch (type) {
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
      case "users":
        return this._userLoading();
      case "profiles":
        return this._profileLoading();
      default:
        return false;
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     PAGINATION GETTERS
     ════════════════════════════════════════════════════════════════════════ */

  hasMoreTodos(): boolean {
    return this._pagination().todos.hasMore;
  }
  hasMoreTasks(): boolean {
    return this._pagination().tasks.hasMore;
  }
  hasMoreSubtasks(): boolean {
    return this._pagination().subtasks.hasMore;
  }
  hasMoreComments(): boolean {
    return this._pagination().comments.hasMore;
  }
  hasMoreChats(): boolean {
    return this._pagination().chats.hasMore;
  }
  hasMoreCategories(): boolean {
    return this._pagination().categories.hasMore;
  }

  /* ════════════════════════════════════════════════════════════════════════
     HYDRATION METHODS - Auto-fetch from API when signal is empty
     ════════════════════════════════════════════════════════════════════════ */

  ensureTodosLoaded(visibility: VisibilityFilter = "all", limit = 10): void {
    if (this._todosLoading()) return;

    // Check if already loaded for this visibility
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

  ensureRoomsLoaded(): void {
    if (this._roomsLoading() || this.rooms().length > 0) return;
    if (!navigator.onLine || !this._mongoConnectionService.isConnected()) return;

    this._roomsLoading.set(true);
    const token = this._jwtTokenService.getToken();
    this._apiService.invokeCommand("get_rooms", { token, load: "participants" }).subscribe({
      next: (result: any) => {
        const rooms = Array.isArray(result) ? result : result?.data || [];
        this.rooms.set(rooms);
        this.loadConversationsFromChats();
      },
      error: () => this._roomsLoading.set(false),
      complete: () => this._roomsLoading.set(false),
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

  getRooms(): Room[] {
    if (this.rooms().length === 0 && !this._roomsLoading()) {
      this.ensureRoomsLoaded();
    }
    return this.rooms();
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

  loadMoreTasks(todoId?: string): void {
    if (this._tasksLoading() || !this.hasMoreTasks()) return;
    const pagination = this._pagination().tasks;
    const nextPage = pagination.skip / pagination.limit + 1;

    this._tasksLoading.set(true);
    const filter: Record<string, unknown> = {};
    if (todoId) filter["todo_id"] = todoId;

    this._apiService.tasks.getAll({ page: nextPage, limit: pagination.limit, filter }).subscribe({
      next: (tasks) => {
        this.tasks.update((existing) => [...existing, ...tasks]);
        this.updatePagination("tasks", nextPage * pagination.limit, pagination.limit, tasks.length);
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

  /* ════════════════════════════════════════════════════════════════════════
     OPTIMISTIC CRUD OPERATIONS
     ════════════════════════════════════════════════════════════════════════ */

  createEntity(type: EntityType, data: any): Observable<any> {
    const previousState = this.getEntitySignal(type)();

    // Optimistic update
    this.addEntity(type, data);

    // API call
    return this._apiService.crud<any>(this.getRoute(type, "create")!, { data }).pipe(
      tap((result) => {
        if (result?.id) {
          this.updateEntitySignal(type, result.id, result);
        }
      }),
      catchError((error) => {
        // Rollback on failure
        this.setEntitySignal(type, previousState);
        this._notifyService.showError(`Failed to create: ${error.message}`);
        throw error;
      })
    );
  }

  updateEntity(type: EntityType, id: string, data: Partial<any>): Observable<any> {
    const previousState = this.getEntitySignal(type)();

    // Optimistic update
    this.getEntitySignal(type).update((items: any[]) =>
      items.map((item: any) => (item.id === id ? { ...item, ...data } : item))
    );

    // API call
    return this._apiService.crud<any>(this.getRoute(type, "update")!, { id, data }).pipe(
      catchError((error) => {
        // Rollback on failure
        this.setEntitySignal(type, previousState);
        this._notifyService.showError(`Failed to update: ${error.message}`);
        throw error;
      })
    );
  }

  deleteEntity(type: EntityType, id: string): Observable<void> {
    const previousState = this.getEntitySignal(type)();

    // Optimistic update
    this.getEntitySignal(type).update((items: any[]) =>
      items.filter((item: any) => item.id !== id)
    );

    // API call
    return this._apiService.crud<void>(this.getRoute(type, "delete")!, { id }).pipe(
      catchError((error) => {
        // Rollback on failure
        this.setEntitySignal(type, previousState);
        this._notifyService.showError(`Failed to delete: ${error.message}`);
        throw error;
      })
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     CHAT OPERATIONS - Optimistic with offline support
     ════════════════════════════════════════════════════════════════════════ */

  sendMessage(content: string, roomId: string, replyId?: string): Observable<Chat> {
    const userId = this.currentUserId();
    const tempId = `temp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // Optimistic update
    const localChat: Chat = {
      id: tempId,
      room_id: roomId,
      sender_id: userId,
      user_id: userId,
      content,
      read_by: [userId],
      created_at: now,
      sync_status: "pending",
      temp_id: tempId,
    };
    this.chats.update((chats) => [...chats, localChat]);

    const uiMsg: ChatMessage = {
      id: tempId,
      content,
      senderId: userId,
      senderName: this._jwtTokenService.getUsername(this._jwtTokenService.getToken()) || "You",
      senderAvatar: undefined,
      time: now,
      isMine: true,
      syncStatus: "pending",
      tempId,
      replyId,
    };
    this.messages.update((msgs) => [...msgs, uiMsg]);

    // API call
    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<any>("send_message", {
        roomId,
        senderId: userId,
        content,
        replyId,
        token,
      })
      .pipe(
        map((response: any) => response?.data || response),
        tap((serverChat: any) => {
          const cloudId = serverChat?.id || serverChat?.chat?.id || tempId;
          this.updateChatByTempId(tempId, cloudId, "synced");
          this.messages.update((msgs) =>
            msgs.map((m) =>
              m.tempId === tempId ? { ...m, id: cloudId, syncStatus: "synced" as const } : m
            )
          );
        }),
        catchError((error) => {
          this.updateChatSyncStatus(tempId, "failed");
          this.messages.update((msgs) =>
            msgs.map((m) => (m.tempId === tempId ? { ...m, syncStatus: "failed" as const } : m))
          );
          this.queueChatMessageForSync(tempId, roomId, content, replyId ?? null, error.message);
          this._notifyService.showError("Message saved offline. Will sync when online.");
          return of(localChat);
        })
      );
  }

  editMessage(messageId: string, content: string): Observable<void> {
    const previousMessages = this.messages();

    // Optimistic update
    this.messages.update((msgs) =>
      msgs.map((m) => (m.id === messageId ? { ...m, content, isEdited: true } : m))
    );

    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<void>("edit_message", { id: messageId, content, token })
      .pipe(
        catchError((error) => {
          this.messages.set(previousMessages);
          this._notifyService.showError(`Failed to edit: ${error.message}`);
          throw error;
        })
      );
  }

  deleteMessage(messageId: string): Observable<void> {
    const previousMessages = this.messages();

    // Optimistic update
    this.messages.update((msgs) => msgs.filter((m) => m.id !== messageId));

    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<void>("hard_delete_message", { id: messageId, token })
      .pipe(
        catchError((error) => {
          this.messages.set(previousMessages);
          this._notifyService.showError(`Failed to delete: ${error.message}`);
          throw error;
        })
      );
  }

  createGroup(name: string): Observable<void> {
    const userId = this.currentUserId();
    const roomId = "group_" + Date.now();

    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<void>("create_group", {
        name,
        roomId,
        ownerId: userId,
        memberIds: [userId],
        token,
      })
      .pipe(
        tap(() => {
          this._notifyService.showSuccess("Group created successfully");
          this.loadGroups();
        }),
        catchError((error) => {
          this._notifyService.showError(`Failed to create group: ${error.message}`);
          throw error;
        })
      );
  }

  addGroupMembers(roomId: string, memberIds: string[]): Observable<void> {
    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<void>("add_group_members", {
        id: roomId,
        memberIds,
        token,
      })
      .pipe(
        tap(() => {
          this.conversations.update((convs) =>
            convs.map((c) =>
              c.roomId === roomId
                ? {
                    ...c,
                    memberIds: [...c.memberIds, ...memberIds],
                    memberCount: c.memberIds.length + memberIds.length,
                  }
                : c
            )
          );
          this._notifyService.showSuccess("Members added successfully");
        }),
        catchError((error) => {
          this._notifyService.showError(`Failed to add members: ${error.message}`);
          throw error;
        })
      );
  }

  removeGroupMembers(roomId: string, memberId: string): Observable<void> {
    const token = this._jwtTokenService.getToken();
    return this._apiService
      .invokeCommand<void>("remove_group_members", {
        id: roomId,
        member_ids: [memberId],
        token,
      })
      .pipe(
        tap(() => {
          this.conversations.update((convs) =>
            convs.map((c) =>
              c.roomId === roomId
                ? {
                    ...c,
                    memberIds: c.memberIds.filter((id) => id !== memberId),
                    memberCount: c.memberIds.length - 1,
                  }
                : c
            )
          );
          this._notifyService.showSuccess("Member removed");
        }),
        catchError((error) => {
          this._notifyService.showError(`Failed to remove member: ${error.message}`);
          throw error;
        })
      );
  }

  deleteGroup(roomId: string): Observable<void> {
    const token = this._jwtTokenService.getToken();
    return this._apiService.invokeCommand<void>("delete_group_cascade", { id: roomId, token }).pipe(
      tap(() => {
        this.conversations.update((convs) => convs.filter((c) => c.roomId !== roomId));
        if (this.activeConversationId() === roomId) {
          this.activeConversationId.set(null);
          this.messages.set([]);
        }
        this._notifyService.showSuccess("Group deleted");
      }),
      catchError((error) => {
        this._notifyService.showError(`Failed to delete group: ${error.message}`);
        throw error;
      })
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     BATCH OPERATIONS
     ════════════════════════════════════════════════════════════════════════ */

  batchSoftDelete(table: string, ids: string[], visibility?: string): Observable<any[]> {
    return from(this._apiService.batchSoftDelete(table, ids, visibility));
  }

  batchHardDelete(table: string, ids: string[], visibility?: string): Observable<any[]> {
    return from(this._apiService.batchHardDelete(table, ids, visibility));
  }

  batchRestore(table: string, ids: string[], visibility?: string): Observable<any[]> {
    return from(this._apiService.batchRestore(table, ids, visibility));
  }

  /* ════════════════════════════════════════════════════════════════════════
     ENTITY MANAGEMENT - Low level operations
     ════════════════════════════════════════════════════════════════════════ */

  addEntity(type: EntityType, data: any): void {
    if (!data?.id) return;
    addEntityToSignal(this.getEntitySignal(type), data);
  }

  updateEntitySignal(type: EntityType, _id: string, data: any): void {
    if (!data?.id) return;
    updateEntityInSignal(this.getEntitySignal(type), data.id, data);
  }

  removeEntity(type: EntityType, id: string): void {
    removeEntityFromSignal(this.getEntitySignal(type), id);
  }

  /* ════════════════════════════════════════════════════════════════════════
     CHAT HELPERS
     ════════════════════════════════════════════════════════════════════════ */

  updateChatByTempId(
    tempId: string,
    cloudId: string,
    syncStatus: "pending" | "synced" | "failed"
  ): void {
    this.chats.update((chats) =>
      chats.map((c) =>
        c.temp_id === tempId
          ? { ...c, id: cloudId, sync_status: syncStatus, temp_id: undefined }
          : c
      )
    );
  }

  updateChatSyncStatus(tempId: string, syncStatus: "pending" | "synced" | "failed"): void {
    this.chats.update((chats) =>
      chats.map((c) =>
        c.temp_id === tempId || c.id === tempId ? { ...c, sync_status: syncStatus } : c
      )
    );
  }

  updateConversationLastMessage(roomId: string, message: string): void {
    const timeNow = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    this.conversations.update((convs) =>
      convs.map((c) =>
        c.roomId === roomId ? { ...c, lastMessage: message, lastMessageTime: timeNow } : c
      )
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     CONVERSATION MANAGEMENT
     ════════════════════════════════════════════════════════════════════════ */

  selectConversation(roomId: string): void {
    this.activeConversationId.set(roomId);
    this.loadMessagesForRoom(roomId);

    const conv = this.conversations().find((c) => c.roomId === roomId);
    if (conv && conv.unreadCount > 0) {
      this.markConversationAsRead(roomId);
    }
  }

  loadMessagesForRoom(roomId: string, skip = 0, limit = 100): void {
    const token = this._jwtTokenService.getToken();
    this._apiService
      .invokeCommand<any>("get_messages_by_room", { roomId, skip, limit, token })
      .subscribe({
        next: (result: any) => {
          const data = Array.isArray(result) ? result : result?.data || [];
          const currentUserId = this.currentUserId();
          const msgs: ChatMessage[] = [];

          for (const chat of data) {
            if (chat.deleted_at) continue;

            const sender = chat.sender || {};
            const profile = sender.profile || {};
            const senderName = profile.name
              ? `${profile.name}${profile.last_name ? " " + profile.last_name : ""}`
              : chat.sender_name || chat.sender_id || "Unknown";
            const senderAvatar = profile.image_url || chat.sender_avatar || null;

            let readStatus: "sent" | "delivered" | "read" | undefined;
            if (chat.sender_id === currentUserId) {
              const readByArr: string[] = chat.read_by || [];
              const otherReaders = readByArr.filter((id: string) => id !== currentUserId);
              readStatus = otherReaders.length === 0 ? "sent" : "read";
            }

            msgs.push({
              id: chat.id,
              content: chat.content,
              senderId: chat.sender_id,
              senderName,
              senderAvatar,
              time: new Date(chat.created_at).toISOString(),
              isMine: chat.sender_id === currentUserId,
              isEdited: chat.is_edited === true,
              readStatus,
              replyId: chat.reply_id || null,
            });
          }

          this.messages.set(msgs);
          this.populateReplyChain(msgs);
        },
        error: () => {
          this.messages.set([]);
        },
      });
  }

  private populateReplyChain(msgs: ChatMessage[]): void {
    const msgMap = new Map(msgs.map((m) => [m.id, m]));
    msgs.forEach((msg) => {
      if (msg.replyId) {
        msg.replyTo = msgMap.get(msg.replyId) || null;
      }
    });
  }

  private markConversationAsRead(roomId: string): void {
    this.conversations.update((convs) =>
      convs.map((c) => (c.roomId === roomId ? { ...c, unreadCount: 0 } : c))
    );
  }

  loadConversationsFromChats(): void {
    const chats = this.chats();
    const currentUserId = this.currentUserId();
    const convMap = new Map<string, ConversationItem>();

    for (const chat of chats) {
      if (chat.deleted_at) continue;
      const roomId = chat.room_id;
      if (!roomId) continue;

      if (!convMap.has(roomId)) {
        const isGroup = roomId.startsWith("group_");
        let otherUserId: string | undefined;

        if (!isGroup) {
          otherUserId = chat.sender_id !== currentUserId ? chat.sender_id : undefined;
        }

        convMap.set(roomId, {
          roomId,
          name: isGroup ? "Group" : "Unknown",
          avatar: null,
          isOnline: false,
          isTyping: false,
          isGroup,
          unreadCount: 0,
          lastMessage: chat.content || "",
          lastMessageTime: chat.created_at
            ? new Date(chat.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "",
          memberIds: [],
          memberCount: 0,
          bio: "",
          otherUserId,
        });
      } else {
        const existing = convMap.get(roomId)!;
        existing.lastMessage = chat.content || existing.lastMessage;
        existing.lastMessageTime = chat.created_at
          ? new Date(chat.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : existing.lastMessageTime;
      }

      if (!chat.read_by?.includes(currentUserId) && chat.sender_id !== currentUserId) {
        const conv = convMap.get(roomId)!;
        conv.unreadCount++;
      }
    }

    const sorted = Array.from(convMap.values()).sort((a, b) => {
      const aTime = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const bTime = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return bTime - aTime;
    });

    this.conversations.set(sorted);
  }

  loadGroups(): void {
    const userId = this.currentUserId();
    if (!userId) return;
    if (!navigator.onLine || !this._mongoConnectionService.isConnected()) return;

    const token = this._jwtTokenService.getToken();
    this._apiService
      .invokeCommand<any>("get_groups", {
        userId,
        token,
        visibility: "all",
        page: 0,
        limit: 100,
      })
      .subscribe({
        next: (result: any) => {
          const groups = Array.isArray(result) ? result : result?.data || [];
          const existingRooms = new Set(this.conversations().map((c) => c.roomId));

          for (const group of groups) {
            if (!existingRooms.has(group.room_id)) {
              const conv: ConversationItem = {
                roomId: group.room_id,
                name: group.name,
                avatar: group.avatar || null,
                isOnline: false,
                isTyping: false,
                isGroup: true,
                unreadCount: 0,
                lastMessage: "",
                lastMessageTime: new Date(group.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                memberIds: group.member_ids || [],
                memberCount: (group.member_ids || []).length,
                bio: "",
                otherUserId: undefined,
              };
              this.conversations.update((convs) => [...convs, conv]);
            }
          }
        },
        error: () => {},
      });
  }

  /* ════════════════════════════════════════════════════════════════════════
     OFFLINE QUEUE
     ════════════════════════════════════════════════════════════════════════ */

  private queueChatMessageForSync(
    tempId: string,
    roomId: string,
    content: string,
    replyId: string | null,
    lastError?: string
  ): void {
    const queuedOp = {
      id: tempId,
      operation: "create" as const,
      table: "chats",
      data: {
        id: tempId,
        room_id: roomId,
        sender_id: this.currentUserId(),
        content,
        reply_id: replyId,
        sync_status: "pending",
        temp_id: tempId,
      },
      timestamp: Date.now(),
      retries: 0,
      lastError,
    };
    const queue = this.getChatQueue();
    queue.push(queuedOp);
    this.saveChatQueue(queue);
  }

  private getChatQueue(): any[] {
    try {
      const stored = localStorage.getItem("taskflow_chat_offline_queue");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveChatQueue(queue: any[]): void {
    try {
      localStorage.setItem("taskflow_chat_offline_queue", JSON.stringify(queue));
    } catch {}
  }

  /* ════════════════════════════════════════════════════════════════════════
     UTILITY METHODS
     ════════════════════════════════════════════════════════════════════════ */

  private getEntitySignal(type: EntityType): WritableSignal<any[]> {
    switch (type) {
      case "todos":
        return this.todos;
      case "tasks":
        return this.tasks;
      case "subtasks":
        return this.subtasks;
      case "comments":
        return this.comments;
      case "chats":
        return this.chats;
      case "categories":
        return this.categories;
      case "users":
        return this.users;
      case "profiles":
        return this.profiles as unknown as WritableSignal<any[]>;
      default:
        return this.tasks;
    }
  }

  private setEntitySignal(type: EntityType, data: any[]): void {
    const sig = this.getEntitySignal(type);
    sig.set(data);
  }

  private getRoute(type: EntityType, operation: "create" | "update" | "delete"): string | null {
    const routes: Record<string, Record<string, string>> = {
      todos: { create: "create_todo", update: "update_todo", delete: "delete_todo" },
      tasks: { create: "create_task", update: "update_task", delete: "delete_task" },
      subtasks: { create: "create_subtask", update: "update_subtask", delete: "delete_subtask" },
      categories: {
        create: "create_category",
        update: "update_category",
        delete: "delete_category",
      },
      comments: { create: "create_comment", update: "update_comment", delete: "delete_comment" },
      chats: { create: "create_chat", update: "update_chat", delete: "delete_chat" },
      profiles: { create: "create_profile", update: "update_profile", delete: "delete_profile" },
    };
    return routes[type]?.[operation] || null;
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

  currentUserId(): string {
    return this._jwtTokenService.getCurrentUserId() || "";
  }

  getUsername(userId: string): string {
    const user = this.users().find((u) => u.id === userId);
    const profile = this.profiles().find((p) => p.user_id === userId);
    if (profile?.name) return `${profile.name} ${profile.last_name || ""}`.trim();
    return user?.username || "Unknown";
  }

  clear(): void {
    this.todos.set([]);
    this.tasks.set([]);
    this.subtasks.set([]);
    this.comments.set([]);
    this.chats.set([]);
    this.categories.set([]);
    this.profiles.set([]);
    this.publicProfiles.set([]);
    this.users.set([]);
    this.currentUser.set(null);
    this.rooms.set([]);
    this.conversations.set([]);
    this.messages.set([]);
    this.activeConversationId.set(null);
    this._loaded.set(false);
    this._lastLoaded.set(null);
    this._pagination.set({
      todos: { ...DEFAULT_PAGINATION },
      tasks: { ...DEFAULT_PAGINATION },
      subtasks: { ...DEFAULT_PAGINATION },
      categories: { ...DEFAULT_PAGINATION },
      comments: { ...DEFAULT_PAGINATION },
      chats: { ...DEFAULT_PAGINATION },
    });
  }

  // Proxy methods for compatibility
  setRooms(rooms: Room[]): void {
    this.rooms.set(rooms);
  }

  setChats(chats: Chat[]): void {
    this.chats.set(chats);
    this.loadConversationsFromChats();
  }

  addChat(chat: Chat): void {
    this.chats.update((chats) => [...chats, chat]);
  }
}
