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
import { MongoConnectionService } from "@core/services/mongo-connection.service";
import { LoggerService } from "@shared/services/logger.service";

/* utils */
import {
  upsertEntityBulk,
  updateEntityInSignal,
  removeEntityFromSignal,
  addEntityToSignal,
} from "@stores/utils/store-helpers";

export const DEFAULT_PAGINATION: PaginationState = { skip: 0, limit: 20, hasMore: true };

@Injectable({ providedIn: "root" })
export class BaseStorageService {
  protected readonly _apiService = inject(ApiService);
  protected readonly _jwtTokenService = inject(JwtTokenService);
  protected readonly _notifyService = inject(NotifyService);
  protected readonly _mongoConnectionService = inject(MongoConnectionService);
  protected loggingService = inject(LoggerService);

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

  protected readonly _loaded = signal(false);
  protected readonly _lastLoaded = signal<Date | null>(null);

  protected readonly _pagination = signal<Record<ChildType, PaginationState>>({
    todos: { ...DEFAULT_PAGINATION },
    tasks: { ...DEFAULT_PAGINATION },
    subtasks: { ...DEFAULT_PAGINATION },
    categories: { ...DEFAULT_PAGINATION },
    comments: { ...DEFAULT_PAGINATION },
    chats: { ...DEFAULT_PAGINATION },
  });

  /* ════════════════════════════════════════════════════════════════════════
     FILTERED COMPUTED SIGNALS - Derived from single source signals
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
     PAGINATION UPDATE
     ════════════════════════════════════════════════════════════════════════ */

  updatePagination(type: ChildType, skip: number, limit: number, receivedCount: number): void {
    this._pagination.update((p) => ({
      ...p,
      [type]: { skip: skip + receivedCount, limit, hasMore: receivedCount >= limit },
    }));
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

  getEntitySignal(type: EntityType): WritableSignal<any[]> {
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

  setEntitySignal(type: EntityType, data: any[]): void {
    const sig = this.getEntitySignal(type);
    sig.set(data);
  }

  getRoute(type: EntityType, operation: "create" | "update" | "delete"): string | null {
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

  currentUserId(): string {
    return this._jwtTokenService.getCurrentUserId() || "";
  }

  getUsername(userId: string): string {
    const user = this.users().find((u) => u.id === userId);
    const profile = this.profiles().find((p) => p.user_id === userId);
    if (profile?.name) return `${profile.name} ${profile.last_name || ""}`.trim();
    return user?.username || "Unknown";
  }
}
