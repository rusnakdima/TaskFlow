/* sys lib */
import { Injectable, inject, signal, computed } from "@angular/core";
import { Observable, of, catchError, switchMap } from "rxjs";
import { Router } from "@angular/router";

/* models */
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Chat } from "@models/chat.model";
import { Comment } from "@models/comment.model";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { UnifiedStorageService } from "@app/store/unified-storage.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";
import { UserValidationService } from "@services/auth/user-validation.service";
import { MongoConnectionService } from "@services/core/mongo-connection.service";

import { DataService } from "@services/data/data.service";
import { RequestService } from "@services/core/request.service";

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
  private mongoConnectionService = inject(MongoConnectionService);

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
  private currentChatsTodoId = signal<string | null>(null);

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
    this.storageService.resetPagination("todos");

    const userId = this.jwtTokenService.getCurrentUserId() || "";
    let filter: any;

    if (visibility === "all") {
      // Check if MongoDB is connected - if not, only load private todos from JSON
      if (!this.mongoConnectionService.isConnected()) {
        filter = { user_id: userId };
        this.notifyService.showWarning("MongoDB unavailable - showing only private todos");
        this.storageService.setHasMoreTodos(false);
      } else {
        filter = {
          $or: [{ user_id: userId }, { assignees: { $in: [userId] } }, { visibility: "public" }],
        };
      }
    } else if (visibility === "private") {
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

    return this.requestService
      .getTodos({ filter, skip, limit, load: ["categories", "assignees"], visibility })
      .pipe(
        switchMap((todos) => {
          const loadedTodos = todos || [];
          const isFirstPage = page === 0;

          const collectionMap: Record<string, "privateTodos" | "sharedTodos" | "publicTodos"> = {
            private: "privateTodos",
            shared: "sharedTodos",
            public: "publicTodos",
          };
          const collection = collectionMap[visibility] || "privateTodos";

          this.storageService.setCollection(collection, loadedTodos, {
            append: !isFirstPage,
            resetPagination: isFirstPage,
          });
          this.storageService.updatePagination("todos", skip, limit, loadedTodos.length);
          this.todosLoading.set(false);
          return of(loadedTodos);
        }),
        catchError(() => {
          this.todosLoading.set(false);
          return of([]);
        })
      );
  }

  loadMoreTodosPage(visibility: string = "private"): Observable<Todo[]> {
    if (!this.storageService.hasMoreTodos) return of([]);

    const skip = this.storageService.todosPagination().skip;
    const limit = this.storageService.todosPagination().limit;

    this.todosLoading.set(true);

    const userId = this.jwtTokenService.getCurrentUserId() || "";
    let filter: any;

    if (visibility === "all") {
      // Check if MongoDB is connected - if not, stop loading (only private todos were loaded initially)
      if (!this.mongoConnectionService.isConnected()) {
        this.todosLoading.set(false);
        return of([]);
      }
      filter = {
        $or: [{ user_id: userId }, { assignees: { $in: [userId] } }, { visibility: "public" }],
      };
    } else if (visibility === "private") {
      filter = { user_id: userId };
    } else if (visibility === "shared") {
      filter = { assignees: { $in: [userId] } };
    } else {
      filter = { visibility: visibility };
    }

    return this.requestService
      .getTodos({ filter, skip, limit, load: ["categories", "assignees"], visibility })
      .pipe(
        switchMap((todos) => {
          const newItems = todos || [];

          const collectionMap: Record<string, "privateTodos" | "sharedTodos" | "publicTodos"> = {
            private: "privateTodos",
            shared: "sharedTodos",
            public: "publicTodos",
          };
          const collection = collectionMap[visibility] || "privateTodos";

          this.storageService.setCollection(collection, newItems, { append: true });
          this.storageService.updatePagination("todos", skip, limit, newItems.length);
          this.todosLoading.set(false);
          return of(newItems);
        }),
        catchError(() => {
          this.todosLoading.set(false);
          return of([]);
        })
      );
  }

  loadInitialTodos(visibility: string = "private", limit: number = 10): Observable<Todo[]> {
    return this.loadTodosPage(visibility, 0, limit);
  }

  loadMoreTodos(visibility: string): Observable<Todo[]> {
    return this.loadMoreTodosPage(visibility);
  }

  loadTasksPage(
    todoId: string,
    visibility: string = "private",
    page: number = 0,
    limit: number = 20
  ): Observable<Task[]> {
    this.currentTasksTodoId.set(todoId);
    const skip = page * limit;
    this.tasksLoading.set(true);
    this.storageService.resetPagination("tasks");

    return this.requestService.getTasks(todoId, { filter: { todo_id: todoId } }, skip, limit).pipe(
      switchMap((tasks) => {
        const loadedTasks = tasks || [];
        const isFirstPage = page === 0;
        this.storageService.setCollection("tasks", loadedTasks, {
          append: !isFirstPage,
          resetPagination: isFirstPage,
        });
        this.storageService.updatePagination("tasks", skip, limit, loadedTasks.length);
        this.tasksLoading.set(false);
        return of(loadedTasks);
      }),
      catchError(() => {
        this.tasksLoading.set(false);
        return of([]);
      })
    );
  }

  loadMoreTasksPage(todoId: string, visibility: string = "private"): Observable<Task[]> {
    if (this.currentTasksTodoId() !== todoId) {
      return this.loadTasksPage(todoId, visibility);
    }

    if (!this.storageService.hasMoreTasks) return of([]);

    const skip = this.storageService.tasksPagination().skip;
    const limit = this.storageService.tasksPagination().limit;
    this.tasksLoading.set(true);

    return this.requestService.getTasks(todoId, { filter: { todo_id: todoId } }, skip, limit).pipe(
      switchMap((tasks) => {
        const newItems = tasks || [];
        this.storageService.setCollection("tasks", newItems, { append: true });
        this.storageService.updatePagination("tasks", skip, limit, newItems.length);
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
    this.currentSubtasksTaskId.set(taskId);

    const cachedSubtasks = this.storageService.getSubtasksByTaskId(taskId);
    if (cachedSubtasks.length > 0 && page === 0) {
      this.storageService.resetPagination("subtasks");
      return of(cachedSubtasks);
    }

    const skip = page * limit;
    this.subtasksLoading.set(true);
    this.storageService.resetPagination("subtasks");

    return this.requestService.getSubtasks(taskId, skip, limit).pipe(
      switchMap((subtasks) => {
        const loadedSubtasks = subtasks || [];
        const isFirstPage = page === 0;
        this.storageService.setCollection("subtasks", loadedSubtasks, {
          append: !isFirstPage,
          resetPagination: isFirstPage,
        });
        this.storageService.updatePagination("subtasks", skip, limit, loadedSubtasks.length);
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

    if (!this.storageService.hasMoreSubtasks) return of([]);

    const skip = this.storageService.subtasksPagination().skip;
    const limit = this.storageService.subtasksPagination().limit;
    this.subtasksLoading.set(true);

    return this.requestService.getSubtasks(taskId, skip, limit).pipe(
      switchMap((subtasks) => {
        const newItems = subtasks || [];
        this.storageService.setCollection("subtasks", newItems, { append: true });
        this.storageService.updatePagination("subtasks", skip, limit, newItems.length);
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
    const skip = page * limit;
    this.commentsLoading.set(true);
    this.storageService.resetPagination("comments");

    return this.requestService.getComments(taskId, undefined, skip, limit).pipe(
      switchMap((comments) => {
        const loadedComments = comments || [];
        const isFirstPage = page === 0;
        this.storageService.setCollection("comments", loadedComments, {
          append: !isFirstPage,
          resetPagination: isFirstPage,
        });
        this.storageService.updatePagination("comments", skip, limit, loadedComments.length);
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
    if (!this.storageService.hasMoreComments) return of([]);

    const skip = this.storageService.commentsPagination().skip;
    const limit = this.storageService.commentsPagination().limit;
    this.commentsLoading.set(true);

    return this.requestService.getComments(taskId, undefined, skip, limit).pipe(
      switchMap((comments) => {
        const newItems = comments || [];
        this.storageService.setCollection("comments", newItems, { append: true });
        this.storageService.updatePagination("comments", skip, limit, newItems.length);
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
    this.storageService.resetPagination("comments");

    return this.requestService.getComments(undefined, subtaskId, skip, limit).pipe(
      switchMap((comments) => {
        const loadedComments = comments || [];
        const isFirstPage = page === 0;
        this.storageService.setCollection("comments", loadedComments, {
          append: !isFirstPage,
          resetPagination: isFirstPage,
        });
        this.storageService.updatePagination("comments", skip, limit, loadedComments.length);
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
    if (!this.storageService.hasMoreComments) return of([]);

    const skip = this.storageService.commentsPagination().skip;
    const limit = this.storageService.commentsPagination().limit;
    this.commentsLoading.set(true);

    return this.requestService.getComments(undefined, subtaskId, skip, limit).pipe(
      switchMap((comments) => {
        const newItems = comments || [];
        this.storageService.setCollection("comments", newItems, { append: true });
        this.storageService.updatePagination("comments", skip, limit, newItems.length);
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
    this.currentChatsTodoId.set(todoId);
    const skip = page * limit;
    this.chatsLoading.set(true);
    this.storageService.resetPagination("chats");

    return this.requestService.getChats(todoId, skip, limit).pipe(
      switchMap((chats) => {
        const loadedChats = chats || [];
        const isFirstPage = page === 0;
        this.storageService.setCollection("chats", loadedChats, {
          append: !isFirstPage,
          resetPagination: isFirstPage,
        });
        this.storageService.updatePagination("chats", skip, limit, loadedChats.length);
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

    if (!this.storageService.hasMoreChats) return of([]);

    const skip = this.storageService.chatsPagination().skip;
    const limit = this.storageService.chatsPagination().limit;
    this.chatsLoading.set(true);

    return this.requestService.getChats(todoId, skip, limit).pipe(
      switchMap((chats) => {
        const newItems = chats || [];
        this.storageService.setCollection("chats", newItems, { append: true });
        this.storageService.updatePagination("chats", skip, limit, newItems.length);
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
