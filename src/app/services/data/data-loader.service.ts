import { Injectable, inject, signal, computed } from "@angular/core";
import { Router } from "@angular/router";
import { Observable, forkJoin, switchMap, of, catchError, concat, merge } from "rxjs";
import { scan, tap } from "rxjs/operators";
import { Profile } from "@models/profile.model";
import { Todo } from "@models/todo.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Category } from "@models/category.model";
import { Comment } from "@models/comment.model";
import { Chat } from "@models/chat.model";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { UnifiedStorageService } from "@app/store/unified-storage.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";
import { UserValidationService } from "@services/auth/user-validation.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";
import { DataService } from "@services/data/data.service";
import { RequestService } from "@services/core/request.service";

interface PaginationState {
  skip: number;
  limit: number;
  hasMore: boolean;
}

const DEFAULT_PAGINATION: PaginationState = { skip: 0, limit: 20, hasMore: true };

@Injectable({
  providedIn: "root",
})
export class DataLoaderService {
  private jwtTokenService = inject(JwtTokenService);
  private storageService = inject(UnifiedStorageService);
  private relationLoader = inject(RelationLoadingService);
  private userValidationService = inject(UserValidationService);
  private notifyService = inject(NotifyService);
  private profileRequiredService = inject(ProfileRequiredService);
  private router = inject(Router);

  private dataService = inject(DataService);
  private requestService = inject(RequestService);

  private readonly RETRY_COUNT = 2;
  private readonly RETRY_DELAY_MS = 1000;

  private todosLoading = signal(false);
  private tasksLoading = signal(false);
  private subtasksLoading = signal(false);
  private commentsLoading = signal(false);
  private chatsLoading = signal(false);

  readonly hasMoreTodos = computed(() => this.storageService.hasMoreTodos);
  readonly hasMoreTasks = computed(() => this.storageService.hasMoreTasks);
  readonly hasMoreSubtasks = computed(() => this.storageService.hasMoreSubtasks);
  readonly hasMoreComments = computed(() => this.storageService.hasMoreComments);
  readonly hasMoreChats = computed(() => this.storageService.hasMoreChats);

  private currentTasksTodoId = signal<string | null>(null);
  private currentSubtasksTaskId = signal<string | null>(null);
  private currentSubtasksRequestId = signal<number>(0);
  private currentCommentsTaskId = signal<string | null>(null);
  private currentCommentsRequestId = signal<number>(0);
  private currentChatsTodoId = signal<string | null>(null);

  private todosPagination = signal<PaginationState>({ ...DEFAULT_PAGINATION });
  private tasksPagination = signal<PaginationState>({ ...DEFAULT_PAGINATION });
  private subtasksPagination = signal<PaginationState>({ ...DEFAULT_PAGINATION });
  private commentsPagination = signal<PaginationState>({ ...DEFAULT_PAGINATION });
  private chatsPagination = signal<PaginationState>({ ...DEFAULT_PAGINATION });

  loadProfile(): Observable<Profile | null> {
    return this.dataService.getProfile().pipe(
      switchMap((profile) => {
        if (profile) {
          this.storageService.setCollection("profiles", profile);
          const user = profile?.user || null;
          if (user) {
            this.storageService.setCollection("user", user);
          }
        }
        return of(profile);
      }),
      catchError(() => of(null))
    );
  }

  loadProfileAndUser(): Observable<{ profile: Profile | null; user: any | null }> {
    return this.loadProfile().pipe(
      switchMap((profile) => of({ profile, user: profile?.user || null }))
    );
  }

  loadInitialCategories(): Observable<Category[]> {
    return this.dataService.getCategories();
  }

  loadTodosPage(
    visibility: string = "private",
    page: number = 0,
    limit: number = 20
  ): Observable<Todo[]> {
    const skip = page * limit;
    this.todosLoading.set(true);
    this.todosPagination.set({ skip, limit, hasMore: true });

    const userId = this.jwtTokenService.getCurrentUserId() || "";

    const getCachedTodos = (): Todo[] => {
      if (visibility === "all") {
        return [
          ...this.storageService.privateTodos(),
          ...this.storageService.sharedTodos(),
          ...this.storageService.publicTodos(),
        ];
      } else if (visibility === "private") {
        return this.storageService.privateTodos();
      } else if (visibility === "shared") {
        return this.storageService.sharedTodos();
      } else if (visibility === "public") {
        return this.storageService.publicTodos();
      }
      return this.storageService.privateTodos();
    };

    const cachedTodos = getCachedTodos();

    if (visibility === "all") {
      const isFirstPage = page === 0;
      const privateFilter = { user_id: userId };
      const sharedFilter = {
        $or: [
          { visibility: "shared", user_id: userId },
          { visibility: "shared", assignees: { $in: [userId] } },
        ],
      };
      const publicFilter = { visibility: "public" };

      const private$ = this.requestService
        .getTodos({
          filter: privateFilter,
          skip,
          limit,
          load: ["categories"],
          visibility: "private",
        })
        .pipe(
          tap((privateTodos) => {
            this.storageService.setCollection("privateTodos", privateTodos || [], {
              append: !isFirstPage,
              resetPagination: isFirstPage,
            });
          })
        );

      const shared$ = this.requestService
        .getTodos({
          filter: sharedFilter,
          skip,
          limit,
          load: ["categories"],
          visibility: "shared",
        })
        .pipe(
          tap((sharedTodos) => {
            this.storageService.setCollection("sharedTodos", sharedTodos || [], {
              append: !isFirstPage,
              resetPagination: isFirstPage,
            });
          })
        );

      const public$ = this.requestService
        .getTodos({
          filter: publicFilter,
          skip,
          limit,
          load: ["categories"],
          visibility: "public",
        })
        .pipe(
          tap((publicTodos) => {
            this.storageService.setCollection("publicTodos", publicTodos || [], {
              append: !isFirstPage,
              resetPagination: isFirstPage,
            });
          })
        );

      return concat(of(cachedTodos), private$, shared$, public$);
    }

    let filter: any;
    if (visibility === "private") {
      filter = { user_id: userId };
    } else if (visibility === "shared") {
      filter = {
        $or: [{ assignees: { $in: [userId] } }, { visibility: "shared", user_id: userId }],
      };
    } else if (visibility === "public") {
      filter = { visibility: "public" };
    } else {
      filter = { visibility: visibility };
    }

    return concat(
      of(cachedTodos),
      this.requestService.getTodos({ filter, skip, limit, load: ["categories"], visibility }).pipe(
        switchMap((todos) => {
          const loadedTodos = todos || [];
          const isFirstPage = page === 0;
          let collectionName: "privateTodos" | "sharedTodos" | "publicTodos" = "privateTodos";
          if (visibility === "private") collectionName = "privateTodos";
          else if (visibility === "shared") collectionName = "sharedTodos";
          else if (visibility === "public") collectionName = "publicTodos";
          this.storageService.setCollection(collectionName, loadedTodos, {
            append: !isFirstPage,
            resetPagination: isFirstPage,
          });
          this.storageService.updatePagination("todos", skip, limit, loadedTodos.length);
          this.todosLoading.set(false);
          return of(loadedTodos);
        }),
        catchError(() => {
          this.todosLoading.set(false);
          return of(cachedTodos);
        })
      )
    );
  }

  loadMoreTodosPage(visibility: string = "private"): Observable<Todo[]> {
    if (!this.storageService.hasMoreTodos) return of([]);

    const skip = this.storageService.todosPagination().skip;
    const limit = this.storageService.todosPagination().limit;

    this.todosLoading.set(true);

    const userId = this.jwtTokenService.getCurrentUserId() || "";

    const getCachedTodosForAppend = (): Todo[] => {
      if (visibility === "all") {
        return [
          ...this.storageService.privateTodos(),
          ...this.storageService.sharedTodos(),
          ...this.storageService.publicTodos(),
        ];
      }
      return [];
    };

    const cachedForAppend = getCachedTodosForAppend();

    if (visibility === "all") {
      const privateFilter = { user_id: userId };
      const sharedFilter = {
        $or: [
          { visibility: "shared", user_id: userId },
          { visibility: "shared", assignees: { $in: [userId] } },
        ],
      };
      const publicFilter = { visibility: "public" };

      const private$ = this.requestService
        .getTodos({
          filter: privateFilter,
          skip,
          limit,
          load: ["categories"],
          visibility: "private",
        })
        .pipe(
          tap((privateTodos) => {
            this.storageService.setCollection("privateTodos", privateTodos || [], { append: true });
          })
        );

      const shared$ = this.requestService
        .getTodos({
          filter: sharedFilter,
          skip,
          limit,
          load: ["categories"],
          visibility: "shared",
        })
        .pipe(
          tap((sharedTodos) => {
            this.storageService.setCollection("sharedTodos", sharedTodos || [], { append: true });
          })
        );

      const public$ = this.requestService
        .getTodos({
          filter: publicFilter,
          skip,
          limit,
          load: ["categories"],
          visibility: "public",
        })
        .pipe(
          tap((publicTodos) => {
            this.storageService.setCollection("publicTodos", publicTodos || [], { append: true });
          })
        );

      return concat(
        of(cachedForAppend),
        merge(private$, shared$, public$).pipe(
          scan(
            (acc: Todo[]) => [
              ...this.storageService.privateTodos(),
              ...this.storageService.sharedTodos(),
              ...this.storageService.publicTodos(),
            ],
            cachedForAppend
          ),
          tap(() => this.todosLoading.set(false))
        )
      );
    }

    let filter: any;
    if (visibility === "private") {
      filter = { user_id: userId };
    } else if (visibility === "shared") {
      filter = { assignees: { $in: [userId] } };
    } else {
      filter = { visibility: visibility };
    }

    return concat(
      of(cachedForAppend),
      this.requestService.getTodos({ filter, skip, limit, load: ["categories"], visibility }).pipe(
        tap((newItems) => {
          let collectionName: "privateTodos" | "sharedTodos" | "publicTodos" = "privateTodos";
          if (visibility === "private") collectionName = "privateTodos";
          else if (visibility === "shared") collectionName = "sharedTodos";
          else if (visibility === "public") collectionName = "publicTodos";
          this.storageService.setCollection(collectionName, newItems || [], { append: true });
        }),
        switchMap((newItems) => {
          this.storageService.updatePagination("todos", skip, limit, (newItems || []).length);
          this.todosLoading.set(false);
          return of(newItems || []);
        }),
        catchError(() => {
          this.todosLoading.set(false);
          return of(cachedForAppend);
        })
      )
    );
  }

  loadInitialTodos(visibility: string = "private", limit: number = 10): Observable<Todo[]> {
    return this.loadTodosPage(visibility, 0, limit);
  }

  loadMoreTodos(visibility: string): Observable<Todo[]> {
    return this.loadMoreTodosPage(visibility);
  }

  loadInitialTasks(
    todoId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Task[]> {
    this.currentTasksTodoId.set(todoId);
    this.storageService.resetPagination("tasks");
    return this.loadTasksPage(todoId, visibility, 0, limit);
  }

  loadInitialTasksByVisibility(visibility: string, limit: number = 10): Observable<Task[]> {
    this.tasksLoading.set(true);
    const cachedTasks = this.storageService.tasks().filter((t) => !t.deleted_at);

    if (visibility === "all") {
      return concat(
        of(cachedTasks),
        this.dataService
          .getTasksByVisibility("private", limit)
          .pipe(
            tap((tasks) =>
              this.storageService.setCollection("tasks", tasks, { resetPagination: true })
            )
          ),
        this.dataService
          .getTasksByVisibility("shared", limit)
          .pipe(
            tap((tasks) => this.storageService.setCollection("tasks", tasks, { append: true }))
          ),
        this.dataService
          .getTasksByVisibility("public", limit)
          .pipe(tap((tasks) => this.storageService.setCollection("tasks", tasks, { append: true })))
      );
    }

    return concat(
      of(cachedTasks),
      this.dataService.getTasksByVisibility(visibility, limit).pipe(
        switchMap((tasks) => {
          const loadedTasks = tasks || [];
          this.storageService.setCollection("tasks", loadedTasks, { resetPagination: true });
          this.storageService.updatePagination("tasks", 0, limit, loadedTasks.length);
          this.tasksLoading.set(false);
          return of(loadedTasks);
        }),
        catchError(() => {
          this.tasksLoading.set(false);
          return of(cachedTasks);
        })
      )
    );
  }

  loadMoreTasks(todoId: string, visibility: string = "private"): Observable<Task[]> {
    return this.loadMoreTasksPage(todoId, visibility);
  }

  loadTasksPage(
    todoId: string,
    visibility: string = "private",
    page: number = 0,
    limit: number = 20
  ): Observable<Task[]> {
    const requestId = `${todoId}-${Date.now()}`;
    this.currentTasksTodoId.set(todoId);
    const skip = page * limit;
    this.tasksLoading.set(true);

    const cachedTasks = page === 0 ? this.storageService.getTasksByTodoId(todoId) : [];

    return concat(
      of(cachedTasks),
      this.requestService.getTasks(todoId, { filter: { todo_id: todoId } }, skip, limit).pipe(
        switchMap((tasks) => {
          if (this.currentTasksTodoId() !== todoId) {
            return this.loadMoreTasksPage(this.currentTasksTodoId() || todoId, visibility);
          }

          const loadedTasks = tasks || [];
          const isFirstPage = page === 0;
          if (isFirstPage) {
            this.storageService.resetPagination("tasks");
          }
          this.storageService.setCollection("tasks", loadedTasks, {
            append: !isFirstPage,
          });
          this.storageService.updatePagination("tasks", skip, limit, loadedTasks.length);
          this.tasksLoading.set(false);
          return of(loadedTasks);
        }),
        catchError(() => {
          this.tasksLoading.set(false);
          return of(cachedTasks);
        })
      )
    );
  }

  loadMoreTasksPage(todoId: string, visibility: string = "private"): Observable<Task[]> {
    if (this.currentTasksTodoId() !== todoId) {
      return this.loadTasksPage(todoId, visibility);
    }

    const current = this.tasksPagination();
    if (current.hasMore === false) return of([]);

    const skip = current.skip;
    const limit = current.limit;
    this.tasksLoading.set(true);

    return this.requestService.getTasks(todoId, { filter: { todo_id: todoId } }, skip, limit).pipe(
      switchMap((tasks) => {
        const newItems = tasks || [];
        this.storageService.setCollection("tasks", newItems, { append: true });
        this.tasksPagination.set({
          skip: skip + newItems.length,
          limit,
          hasMore: newItems.length >= limit,
        });
        this.tasksLoading.set(false);
        return of(newItems);
      }),
      catchError(() => {
        this.tasksLoading.set(false);
        return of([]);
      })
    );
  }

  loadInitialTasksForTodo(
    todoId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Task[]> {
    return this.loadTasksPage(todoId, visibility, 0, limit);
  }

  loadMoreTasksForTodo(todoId: string, visibility: string = "private"): Observable<Task[]> {
    return this.loadMoreTasksPage(todoId, visibility);
  }

  loadSubtasksPage(
    taskId: string,
    visibility: string = "private",
    page: number = 0,
    limit: number = 20
  ): Observable<Subtask[]> {
    const requestId = this.currentSubtasksRequestId() + 1;
    this.currentSubtasksRequestId.set(requestId);
    this.currentSubtasksTaskId.set(taskId);

    const cachedSubtasks = this.storageService.getSubtasksByTaskId(taskId);
    if (cachedSubtasks.length > 0 && page === 0) {
      return of(cachedSubtasks);
    }

    const skip = page * limit;
    this.subtasksLoading.set(true);

    return this.requestService.getSubtasks(taskId, skip, limit).pipe(
      switchMap((subtasks) => {
        if (requestId !== this.currentSubtasksRequestId()) {
          this.subtasksLoading.set(false);
          return of([]);
        }
        const loadedSubtasks = subtasks || [];
        const isFirstPage = page === 0;
        this.storageService.setCollection("subtasks", loadedSubtasks, {
          append: !isFirstPage,
          resetPagination: isFirstPage,
        });
        this.subtasksPagination.set({
          skip: skip + loadedSubtasks.length,
          limit,
          hasMore: loadedSubtasks.length >= limit,
        });
        this.subtasksLoading.set(false);
        return of(loadedSubtasks);
      }),
      catchError(() => {
        this.subtasksLoading.set(false);
        return of([]);
      })
    );
  }

  loadMoreSubtasksPage(taskId: string, visibility: string = "private"): Observable<Subtask[]> {
    if (this.currentSubtasksTaskId() !== taskId) {
      return this.loadSubtasksPage(taskId, visibility);
    }

    const current = this.subtasksPagination();
    if (current.hasMore === false) return of([]);

    const skip = current.skip;
    const limit = current.limit;
    this.subtasksLoading.set(true);

    return this.requestService.getSubtasks(taskId, skip, limit).pipe(
      switchMap((subtasks) => {
        const newItems = subtasks || [];
        this.storageService.setCollection("subtasks", newItems, { append: true });
        this.subtasksPagination.set({
          skip: skip + newItems.length,
          limit,
          hasMore: newItems.length >= limit,
        });
        this.subtasksLoading.set(false);
        return of(newItems);
      }),
      catchError(() => {
        this.subtasksLoading.set(false);
        return of([]);
      })
    );
  }

  loadInitialSubtasksForTask(
    taskId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Subtask[]> {
    return this.loadSubtasksPage(taskId, visibility, 0, limit);
  }

  loadMoreSubtasksForTask(taskId: string, visibility: string = "private"): Observable<Subtask[]> {
    return this.loadMoreSubtasksPage(taskId, visibility);
  }

  loadCommentsPage(
    taskId: string,
    visibility: string = "private",
    page: number = 0,
    limit: number = 20
  ): Observable<Comment[]> {
    this.currentCommentsTaskId.set(taskId);
    const requestId = this.currentCommentsRequestId() + 1;
    this.currentCommentsRequestId.set(requestId);
    const skip = page * limit;
    this.commentsLoading.set(true);
    this.storageService.resetPagination("comments");

    return this.requestService.getComments(taskId, undefined, skip, limit, visibility).pipe(
      switchMap((comments) => {
        if (requestId !== this.currentCommentsRequestId()) return of([]);
        const loadedComments = comments || [];
        const isFirstPage = page === 0;
        this.storageService.setCollection("comments", loadedComments, {
          append: !isFirstPage,
          resetPagination: isFirstPage,
        });
        this.commentsPagination.set({
          skip: skip + loadedComments.length,
          limit,
          hasMore: loadedComments.length >= limit,
        });
        this.commentsLoading.set(false);
        return of(loadedComments);
      }),
      catchError(() => {
        this.commentsLoading.set(false);
        return of([]);
      })
    );
  }

  loadMoreCommentsPage(taskId: string, visibility: string = "private"): Observable<Comment[]> {
    if (this.currentCommentsTaskId() !== taskId) {
      return this.loadCommentsPage(taskId, visibility);
    }

    const current = this.commentsPagination();
    if (current.hasMore === false) return of([]);

    const skip = current.skip;
    const limit = current.limit;
    this.commentsLoading.set(true);

    return this.requestService.getComments(taskId, undefined, skip, limit, visibility).pipe(
      switchMap((comments) => {
        if (this.currentCommentsTaskId() !== taskId) return of([]);
        const newItems = comments || [];
        this.storageService.setCollection("comments", newItems, { append: true });
        this.commentsPagination.set({
          skip: skip + newItems.length,
          limit,
          hasMore: newItems.length >= limit,
        });
        this.commentsLoading.set(false);
        return of(newItems);
      }),
      catchError(() => {
        this.commentsLoading.set(false);
        return of([]);
      })
    );
  }

  loadCommentsForTask(
    taskId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Comment[]> {
    return this.loadCommentsPage(taskId, visibility, 0, limit);
  }

  loadMoreCommentsForTask(taskId: string, visibility: string = "private"): Observable<Comment[]> {
    return this.loadMoreCommentsPage(taskId, visibility);
  }

  loadSubtaskCommentsPage(
    subtaskId: string,
    visibility: string = "private",
    page: number = 0,
    limit: number = 20
  ): Observable<Comment[]> {
    const skip = page * limit;
    this.commentsLoading.set(true);
    this.commentsPagination.set({ skip, limit, hasMore: true });

    return this.requestService.getComments(undefined, subtaskId, skip, limit, visibility).pipe(
      switchMap((comments) => {
        const loadedComments = comments || [];
        const isFirstPage = page === 0;
        this.storageService.setCollection("comments", loadedComments, {
          append: !isFirstPage,
          resetPagination: isFirstPage,
        });
        this.commentsPagination.set({
          skip: skip + loadedComments.length,
          limit,
          hasMore: loadedComments.length >= limit,
        });
        this.commentsLoading.set(false);
        return of(loadedComments);
      }),
      catchError(() => {
        this.commentsLoading.set(false);
        return of([]);
      })
    );
  }

  loadMoreSubtaskCommentsPage(
    subtaskId: string,
    visibility: string = "private"
  ): Observable<Comment[]> {
    const current = this.commentsPagination();
    if (current.hasMore === false) return of([]);

    const skip = current.skip;
    const limit = current.limit;
    this.commentsLoading.set(true);

    return this.requestService.getComments(undefined, subtaskId, skip, limit, visibility).pipe(
      switchMap((comments) => {
        const newItems = comments || [];
        this.storageService.setCollection("comments", newItems, { append: true });
        this.commentsPagination.set({
          skip: skip + newItems.length,
          limit,
          hasMore: newItems.length >= limit,
        });
        this.commentsLoading.set(false);
        return of(newItems);
      }),
      catchError(() => {
        this.commentsLoading.set(false);
        return of([]);
      })
    );
  }

  loadCommentsForSubtask(
    subtaskId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Comment[]> {
    return this.loadSubtaskCommentsPage(subtaskId, visibility, 0, limit);
  }

  loadMoreCommentsForSubtask(
    subtaskId: string,
    visibility: string = "private"
  ): Observable<Comment[]> {
    return this.loadMoreSubtaskCommentsPage(subtaskId, visibility);
  }

  loadChatsPage(
    todoId: string,
    visibility: string = "private",
    page: number = 0,
    limit: number = 20
  ): Observable<Chat[]> {
    const requestId = `${todoId}-${Date.now()}`;
    this.currentChatsTodoId.set(todoId);
    const skip = page * limit;
    this.chatsLoading.set(true);
    this.chatsPagination.set({ skip, limit, hasMore: true });

    return this.requestService.getChats(todoId, skip, limit).pipe(
      switchMap((chats) => {
        if (this.currentChatsTodoId() !== todoId) {
          return of([]);
        }

        const loadedChats = chats || [];
        const isFirstPage = page === 0;
        this.storageService.setCollection("chats", loadedChats, {
          append: !isFirstPage,
          resetPagination: isFirstPage,
        });
        this.chatsPagination.set({
          skip: skip + loadedChats.length,
          limit,
          hasMore: loadedChats.length >= limit,
        });
        this.chatsLoading.set(false);
        return of(loadedChats);
      }),
      catchError(() => {
        this.chatsLoading.set(false);
        return of([]);
      })
    );
  }

  loadMoreChatsPage(todoId: string, visibility: string = "private"): Observable<Chat[]> {
    if (this.currentChatsTodoId() !== todoId) {
      return this.loadChatsPage(todoId, visibility);
    }

    const current = this.chatsPagination();
    if (current.hasMore === false) return of([]);

    const skip = current.skip;
    const limit = current.limit;
    this.chatsLoading.set(true);

    return this.requestService.getChats(todoId, skip, limit, visibility).pipe(
      switchMap((chats) => {
        const newItems = chats || [];
        this.storageService.setCollection("chats", newItems, { append: true });
        this.chatsPagination.set({
          skip: skip + newItems.length,
          limit,
          hasMore: newItems.length >= limit,
        });
        this.chatsLoading.set(false);
        return of(newItems);
      }),
      catchError(() => {
        this.chatsLoading.set(false);
        return of([]);
      })
    );
  }

  loadInitialChatsForTodo(
    todoId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Chat[]> {
    return this.loadChatsPage(todoId, visibility, 0, limit);
  }

  loadOlderChatsForTodo(
    todoId: string,
    visibility: string = "private",
    beforeTimestamp?: string
  ): Observable<Chat[]> {
    return this.loadMoreChatsPage(todoId, visibility);
  }

  isTodosLoading(): boolean {
    return this.todosLoading();
  }

  isTasksLoading(): boolean {
    return this.tasksLoading();
  }

  isSubtasksLoading(): boolean {
    return this.subtasksLoading();
  }

  isCommentsLoading(): boolean {
    return this.commentsLoading();
  }

  isChatsLoading(): boolean {
    return this.chatsLoading();
  }
}
