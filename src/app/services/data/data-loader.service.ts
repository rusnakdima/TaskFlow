/* sys lib */
import { Injectable, inject, signal, Signal, WritableSignal } from "@angular/core";
import { Observable, forkJoin, of, catchError, switchMap, timeout, map } from "rxjs";
import { Router } from "@angular/router";

/* models */
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Task } from "@models/task.model";
import { Subtask } from "@models/subtask.model";
import { Chat } from "@models/chat.model";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/core/storage.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";
import { UserValidationService } from "@services/auth/user-validation.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";

interface PaginationState {
  items: any[];
  skip: number;
  limit: number;
  hasMore: boolean;
  loading: boolean;
}

interface PaginationOptions {
  entityName: string;
  paginationSignal: WritableSignal<PaginationState>;
  currentIdSignal?: WritableSignal<string | null>;
  filterBuilder: (skip: number, limit: number) => Record<string, any>;
  load: string[];
  visibility: string;
  reverseItems?: boolean;
  prependItems?: boolean;
}

class PaginationLoader<T> {
  constructor(
    private apiProvider: ApiProvider,
    private options: PaginationOptions
  ) {}

  loadInitial(): Observable<T[]> {
    const { paginationSignal, filterBuilder, load, visibility, entityName } = this.options;
    paginationSignal.set({
      items: [],
      skip: 0,
      limit: paginationSignal().limit,
      hasMore: true,
      loading: true,
    });

    return this.apiProvider
      .crud<T[]>("get", entityName, {
        ...filterBuilder(0, paginationSignal().limit),
        load,
        visibility,
      })
      .pipe(
        switchMap((entities) => {
          const current = paginationSignal();
          const items = this.options.reverseItems ? (entities || []).reverse() : entities || [];
          paginationSignal.set({
            ...current,
            items,
            skip: (entities || []).length,
            hasMore: (entities || []).length >= current.limit,
            loading: false,
          });
          return of(items);
        }),
        catchError(() => {
          const current = paginationSignal();
          paginationSignal.set({ ...current, loading: false });
          return of([]);
        })
      );
  }

  loadMore(): Observable<T[]> {
    const { paginationSignal, filterBuilder, load, visibility, entityName, prependItems } =
      this.options;
    const current = paginationSignal();
    if (current.loading || !current.hasMore) {
      return of(current.items);
    }

    paginationSignal.set({ ...current, loading: true });

    return this.apiProvider
      .crud<T[]>("get", entityName, {
        ...filterBuilder(current.skip, current.limit),
        load,
        visibility,
      })
      .pipe(
        switchMap((entities) => {
          const newItems = this.options.reverseItems ? (entities || []).reverse() : entities || [];
          const updated = paginationSignal();
          const mergedItems = prependItems
            ? [...newItems, ...updated.items]
            : [...updated.items, ...newItems];
          paginationSignal.set({
            ...updated,
            items: mergedItems,
            skip: updated.skip + newItems.length,
            hasMore: newItems.length >= current.limit,
            loading: false,
          });
          return of(newItems);
        }),
        catchError(() => {
          const updated = paginationSignal();
          paginationSignal.set({ ...updated, loading: false });
          return of(paginationSignal().items);
        })
      );
  }
}

@Injectable({
  providedIn: "root",
})
export class DataLoaderService {
  private jwtTokenService = inject(JwtTokenService);
  private apiProvider = inject(ApiProvider);
  private storageService = inject(StorageService);
  private relationLoader = inject(RelationLoadingService);
  private userValidationService = inject(UserValidationService);
  private notifyService = inject(NotifyService);
  private profileRequiredService = inject(ProfileRequiredService);
  private router = inject(Router);

  private readonly RETRY_COUNT = 2;
  private readonly RETRY_DELAY_MS = 1000;

  private todosPagination = signal<PaginationState>({
    items: [],
    skip: 0,
    limit: 10,
    hasMore: true,
    loading: false,
  });

  private tasksPagination = signal<PaginationState>({
    items: [],
    skip: 0,
    limit: 10,
    hasMore: true,
    loading: false,
  });

  private subtasksPagination = signal<PaginationState>({
    items: [],
    skip: 0,
    limit: 10,
    hasMore: true,
    loading: false,
  });

  private chatsPagination = signal<PaginationState>({
    items: [],
    skip: 0,
    limit: 10,
    hasMore: true,
    loading: false,
  });

  private currentTasksTodoId = signal<string | null>(null);
  private currentSubtasksTaskId = signal<string | null>(null);
  private currentChatsTodoId = signal<string | null>(null);

  private createPaginationLoader<T>(options: PaginationOptions): PaginationLoader<T> {
    return new PaginationLoader<T>(this.apiProvider, options);
  }

  loadAllData(
    force: boolean = false,
    loadShared: boolean = true
  ): Observable<{ todos: Todo[]; categories: Category[] }> {
    const currentUserId = this.jwtTokenService.getCurrentUserId() || "";

    if (this.storageService.loaded() && !force) {
      const todos = this.storageService.todos();
      const categories = this.storageService.categories();
      if (todos.length > 0 || categories.length > 0) {
        return of({ todos, categories });
      }
    }

    if (force) {
      this.storageService.setLoaded(false);
    }

    const allCategories$ = this.relationLoader.loadMany<Category>(
      this.apiProvider,
      "categories",
      {},
      [],
      "private"
    );

    const privateTodos$ = this.relationLoader.loadMany<Todo>(
      this.apiProvider,
      "todos",
      { user_id: currentUserId },
      ["categories", "user", "assignees"],
      "private"
    );

    const userProfile$: Observable<Profile | null> =
      this.createUserProfileObservable(currentUserId);

    const essential$ = forkJoin({
      categories: allCategories$,
      privateTodos: privateTodos$,
      userProfile: userProfile$,
    }).pipe(
      catchError((err) => {
        return of({ categories: [] as Category[], privateTodos: [] as Todo[], userProfile: null });
      }),
      switchMap((result) => {
        if (result.categories && result.categories.length > 0) {
          this.storageService.setCollection("categories", result.categories);
        }

        if (result.privateTodos && result.privateTodos.length > 0) {
          this.storageService.setCollection("privateTodos", result.privateTodos);
        }

        if (
          result.userProfile &&
          typeof result.userProfile === "object" &&
          "user_id" in result.userProfile
        ) {
          this.storageService.setCollection("profiles", result.userProfile);
        } else if (!result.userProfile && currentUserId && currentUserId.trim()) {
          const localProfile = this.storageService.profile();
          if (!localProfile?.user_id) {
            const currentUrl = window.location.pathname;
            if (!currentUrl.startsWith("/profile")) {
              this.notifyService.showWarning("Profile not found. Please create one.");
              this.profileRequiredService.setProfileRequiredMode(true);
              this.router.navigate(["/profile/manage"]);
            } else {
              this.profileRequiredService.setProfileRequiredMode(true);
            }
          }
        }

        return of(result);
      })
    );

    if (!loadShared) {
      return essential$.pipe(
        switchMap(() => {
          this.storageService.setLoaded(true);
          this.storageService.setLastLoaded(new Date());
          return of({
            todos: this.storageService.todos(),
            categories: this.storageService.categories(),
          });
        })
      );
    }

    const sharedData$ = this.createSharedDataObservable(currentUserId);

    return essential$.pipe(
      switchMap(() => sharedData$),
      switchMap((sharedResult) => {
        this.storageService.setLoaded(true);
        this.storageService.setLastLoaded(new Date());

        const allTodos = this.storageService.todos();

        const sortedTodos = [...allTodos].sort((a, b) => {
          const order: Record<string, number> = { private: 0, shared: 1, public: 2 };
          return (order[a.visibility] ?? 3) - (order[b.visibility] ?? 3);
        });

        return of({
          todos: sortedTodos,
          categories: this.storageService.categories(),
        });
      })
    );
  }

  private createUserProfileObservable(currentUserId: string): Observable<Profile | null> {
    if (!currentUserId || !currentUserId.trim()) {
      return of(null);
    }

    // If offline, skip initialize_user_data and directly fetch from JSON
    if (this.apiProvider.isOffline()) {
      console.log("[Offline] Skipping initialize_user_data, fetching profile directly from JSON");
      return this.fetchProfileFromJson(currentUserId);
    }

    return new Observable<Profile | null>((observer) => {
      this.apiProvider
        .invokeCommand("initialize_user_data", { userId: currentUserId })
        .pipe(
          timeout(5000),
          catchError((err) => {
            console.warn("initialize_user_data failed or timed out, fetching profile directly");
            return of({ data: { needsProfile: true, needsRegistration: false } });
          }),
          switchMap((result: any) => {
            if (result?.data?.needsRegistration) {
              this.notifyService.showWarning("Account not found. Please register again.");
              this.router.navigate(["/register"]);
              return of(null);
            }
            if (result?.data?.needsProfile) {
              this.notifyService.showWarning("Profile not found. Please create one.");
              this.profileRequiredService.setProfileRequiredMode(true);
              this.router.navigate(["/profile/manage"]);
              return of(null);
            }
            return this.apiProvider.crud<Profile>("get", "profiles", {
              filter: { user_id: currentUserId },
              load: ["user"],
              visibility: "private",
            });
          })
        )
        .subscribe({
          next: (profile) => {
            observer.next(
              profile && typeof profile === "object" && "user_id" in profile ? profile : null
            );
            observer.complete();
          },
          error: () => {
            observer.next(null);
            observer.complete();
          },
        });
    });
  }

  private fetchProfileFromJson(currentUserId: string): Observable<Profile | null> {
    return this.apiProvider
      .crud<Profile>("get", "profiles", {
        filter: { user_id: currentUserId },
        load: ["user"],
        visibility: "private",
      })
      .pipe(
        map((profile) => {
          if (profile && typeof profile === "object" && "user_id" in profile) {
            console.log("[Offline] Profile fetched from JSON");
            return profile;
          }
          console.log("[Offline] No profile found in JSON");
          return null;
        }),
        catchError((err) => {
          console.warn("[Offline] Error fetching profile from JSON:", err);
          return of(null);
        })
      );
  }

  private createSharedDataObservable(currentUserId: string): Observable<void> {
    if (this.apiProvider.isOffline()) {
      console.log("[Offline] Skipping shared/public data loading");
      return of(undefined);
    }

    const allProfiles$ = this.relationLoader.loadMany<Profile>(
      this.apiProvider,
      "profiles",
      {},
      ["user"],
      "shared"
    );

    const sharedTodos$ = this.relationLoader.loadMany<Todo>(
      this.apiProvider,
      "todos",
      { assignees: { $in: [currentUserId] } },
      ["categories", "user", "assignees"],
      "shared"
    );

    const publicTodos$ = this.relationLoader.loadMany<Todo>(
      this.apiProvider,
      "todos",
      { visibility: "public" },
      ["categories", "user", "assignees"],
      "public"
    );

    return forkJoin({
      allProfiles: allProfiles$,
      sharedTodos: sharedTodos$,
      publicTodos: publicTodos$,
    }).pipe(
      catchError((err) => {
        return of({ allProfiles: [], sharedTodos: [], publicTodos: [] });
      }),
      switchMap((result) => {
        if (result.allProfiles && result.allProfiles.length > 0) {
          this.storageService.setCollection("allProfiles", result.allProfiles);
        }

        if (result.sharedTodos && result.sharedTodos.length > 0) {
          this.storageService.setCollection("sharedTodos", result.sharedTodos);
        }

        if (result.publicTodos && result.publicTodos.length > 0) {
          this.storageService.setCollection("publicTodos", result.publicTodos);
        }

        return of(undefined);
      })
    );
  }

  refreshAll(): void {
    this.loadAllData(true).subscribe();
  }

  // Todos - paginated
  loadInitialTodos(visibility: string = "private", limit: number = 10): Observable<Todo[]> {
    this.todosPagination.set({ items: [], skip: 0, limit, hasMore: true, loading: true });
    const filter =
      visibility === "private"
        ? { user_id: this.jwtTokenService.getCurrentUserId() || "" }
        : visibility === "shared"
          ? { assignees: { $in: [this.jwtTokenService.getCurrentUserId() || ""] } }
          : { visibility: "public" };

    return this.apiProvider
      .crud<Todo[]>("get", "todos", { filter, skip: 0, limit, load: ["categories"], visibility })
      .pipe(
        switchMap((todos) => {
          const current = this.todosPagination();
          this.todosPagination.set({
            ...current,
            items: todos || [],
            skip: (todos || []).length,
            hasMore: (todos || []).length >= limit,
            loading: false,
          });
          return of(todos || []);
        }),
        catchError(() => {
          const current = this.todosPagination();
          this.todosPagination.set({ ...current, loading: false });
          return of([]);
        })
      );
  }

  loadMoreTodos(visibility: string): Observable<Todo[]> {
    const current = this.todosPagination();
    if (current.loading || !current.hasMore) return of(current.items);
    this.todosPagination.set({ ...current, loading: true });
    const filter =
      visibility === "private"
        ? { user_id: this.jwtTokenService.getCurrentUserId() || "" }
        : visibility === "shared"
          ? { assignees: { $in: [this.jwtTokenService.getCurrentUserId() || ""] } }
          : { visibility: "public" };

    return this.apiProvider
      .crud<
        Todo[]
      >("get", "todos", { filter, skip: current.skip, limit: current.limit, load: ["categories"], visibility })
      .pipe(
        switchMap((todos) => {
          const newItems = todos || [];
          const updated = this.todosPagination();
          this.todosPagination.set({
            ...updated,
            items: [...updated.items, ...newItems],
            skip: updated.skip + newItems.length,
            hasMore: newItems.length >= current.limit,
            loading: false,
          });
          return of(newItems);
        }),
        catchError(() => {
          const updated = this.todosPagination();
          this.todosPagination.set({ ...updated, loading: false });
          return of([]);
        })
      );
  }

  // Tasks - lazy loaded when todo opened
  loadInitialTasksForTodo(todoId: string, limit: number = 10): Observable<Task[]> {
    this.currentTasksTodoId.set(todoId);
    return this.createPaginationLoader<Task>({
      entityName: "tasks",
      paginationSignal: this.tasksPagination,
      currentIdSignal: this.currentTasksTodoId,
      filterBuilder: () => ({ filter: { todo_id: todoId } }),
      load: ["subtasks", "comments"],
      visibility: "private",
    }).loadInitial();
  }

  loadMoreTasksForTodo(todoId: string): Observable<Task[]> {
    if (this.currentTasksTodoId() !== todoId) return this.loadInitialTasksForTodo(todoId);
    return this.createPaginationLoader<Task>({
      entityName: "tasks",
      paginationSignal: this.tasksPagination,
      currentIdSignal: this.currentTasksTodoId,
      filterBuilder: (skip) => ({ filter: { todo_id: todoId }, skip }),
      load: ["subtasks", "comments"],
      visibility: "private",
    }).loadMore();
  }

  // Subtasks
  loadInitialSubtasksForTask(taskId: string, limit: number = 10): Observable<Subtask[]> {
    this.currentSubtasksTaskId.set(taskId);
    return this.createPaginationLoader<Subtask>({
      entityName: "subtasks",
      paginationSignal: this.subtasksPagination,
      currentIdSignal: this.currentSubtasksTaskId,
      filterBuilder: () => ({ filter: { task_id: taskId } }),
      load: ["user"],
      visibility: "private",
    }).loadInitial();
  }

  loadMoreSubtasksForTask(taskId: string): Observable<Subtask[]> {
    if (this.currentSubtasksTaskId() !== taskId) return this.loadInitialSubtasksForTask(taskId);
    return this.createPaginationLoader<Subtask>({
      entityName: "subtasks",
      paginationSignal: this.subtasksPagination,
      currentIdSignal: this.currentSubtasksTaskId,
      filterBuilder: (skip) => ({ filter: { task_id: taskId }, skip }),
      load: ["user"],
      visibility: "private",
    }).loadMore();
  }

  // Chats - load latest 10, scroll up for older
  loadInitialChatsForTodo(todoId: string, limit: number = 10): Observable<Chat[]> {
    this.currentChatsTodoId.set(todoId);
    return this.createPaginationLoader<Chat>({
      entityName: "chats",
      paginationSignal: this.chatsPagination,
      currentIdSignal: this.currentChatsTodoId,
      filterBuilder: () => ({ filter: { todo_id: todoId }, sort: { created_at: -1 } }),
      load: ["user"],
      visibility: "private",
      reverseItems: true,
    }).loadInitial();
  }

  loadOlderChatsForTodo(todoId: string, beforeTimestamp: string): Observable<Chat[]> {
    if (this.currentChatsTodoId() !== todoId) return this.loadInitialChatsForTodo(todoId);
    return this.createPaginationLoader<Chat>({
      entityName: "chats",
      paginationSignal: this.chatsPagination,
      currentIdSignal: this.currentChatsTodoId,
      filterBuilder: (skip) => ({
        filter: { todo_id: todoId, created_at: { $lt: beforeTimestamp } },
        skip,
        sort: { created_at: -1 },
      }),
      load: ["user"],
      visibility: "private",
      reverseItems: true,
      prependItems: true,
    }).loadMore();
  }
}
