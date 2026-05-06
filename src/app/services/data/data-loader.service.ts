/* sys lib */
import { Injectable, inject, signal } from "@angular/core";
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

import { DataService } from "@services/data/data.service";
import { RequestService } from "@services/core/request.service";

interface PaginationState {
  skip: number;
  limit: number;
  hasMore: boolean;
}

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

  private todosPagination = signal<PaginationState>({ skip: 0, limit: 20, hasMore: true });
  private tasksPagination = signal<PaginationState>({ skip: 0, limit: 20, hasMore: true });
  private subtasksPagination = signal<PaginationState>({ skip: 0, limit: 20, hasMore: true });
  private commentsPagination = signal<PaginationState>({ skip: 0, limit: 20, hasMore: true });
  private chatsPagination = signal<PaginationState>({ skip: 0, limit: 20, hasMore: true });

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
    this.todosPagination.set({ skip, limit, hasMore: true });

    const userId = this.jwtTokenService.getCurrentUserId() || "";
    let filter: any;

    if (visibility === "all") {
      filter = {
        $or: [{ user_id: userId }, { assignees: { $in: [userId] } }, { visibility: "public" }],
      };
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
      .getTodos({ filter, skip, limit, load: ["categories"], visibility })
      .pipe(
        switchMap((todos) => {
          const loadedTodos = todos || [];
          const isFirstPage = page === 0;
          this.storageService.setCollection("privateTodos", loadedTodos, {
            append: !isFirstPage,
            resetPagination: isFirstPage,
          });
          this.todosPagination.set({
            skip: skip + loadedTodos.length,
            limit,
            hasMore: loadedTodos.length >= limit,
          });
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
    const current = this.todosPagination();
    if (current.hasMore === false) return of([]);

    const skip = current.skip;
    const limit = current.limit;

    this.todosLoading.set(true);

    const userId = this.jwtTokenService.getCurrentUserId() || "";
    let filter: any;

    if (visibility === "all") {
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
      .getTodos({ filter, skip, limit, load: ["categories"], visibility })
      .pipe(
        switchMap((todos) => {
          const newItems = todos || [];
          this.storageService.setCollection("privateTodos", newItems, { append: true });
          this.todosPagination.set({
            skip: skip + newItems.length,
            limit,
            hasMore: newItems.length >= limit,
          });
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
    this.tasksPagination.set({ skip, limit, hasMore: true });

    return this.requestService.getTasks(todoId, { filter: { todo_id: todoId } }, skip, limit).pipe(
      switchMap((tasks) => {
        const loadedTasks = tasks || [];
        const isFirstPage = page === 0;
        this.storageService.setCollection("tasks", loadedTasks, {
          append: !isFirstPage,
          resetPagination: isFirstPage,
        });
        this.tasksPagination.set({
          skip: skip + loadedTasks.length,
          limit,
          hasMore: loadedTasks.length >= limit,
        });
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
    this.currentSubtasksTaskId.set(taskId);

    const cachedSubtasks = this.storageService.getSubtasksByTaskId(taskId);
    if (cachedSubtasks.length > 0 && page === 0) {
      this.subtasksPagination.set({
        skip: cachedSubtasks.length,
        limit,
        hasMore: false,
      });
      return of(cachedSubtasks);
    }

    const skip = page * limit;
    this.subtasksLoading.set(true);
    this.subtasksPagination.set({ skip, limit, hasMore: true });

    return this.requestService.getSubtasks(taskId, skip, limit).pipe(
      switchMap((subtasks) => {
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
    const skip = page * limit;
    this.commentsLoading.set(true);
    this.commentsPagination.set({ skip, limit, hasMore: true });

    return this.requestService.getComments(taskId, undefined, skip, limit).pipe(
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

  loadMoreCommentsPage(taskId: string, visibility: string = "private"): Observable<Comment[]> {
    const current = this.commentsPagination();
    if (current.hasMore === false) return of([]);

    const skip = current.skip;
    const limit = current.limit;
    this.commentsLoading.set(true);

    return this.requestService.getComments(taskId, undefined, skip, limit).pipe(
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

    return this.requestService.getComments(undefined, subtaskId, skip, limit).pipe(
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

    return this.requestService.getComments(undefined, subtaskId, skip, limit).pipe(
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
    this.currentChatsTodoId.set(todoId);
    const skip = page * limit;
    this.chatsLoading.set(true);
    this.chatsPagination.set({ skip, limit, hasMore: true });

    return this.requestService.getChats(todoId, skip, limit).pipe(
      switchMap((chats) => {
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

    return this.requestService.getChats(todoId, skip, limit).pipe(
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
