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
import { Comment } from "@models/comment.model";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/core/storage.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";
import { UserValidationService } from "@services/auth/user-validation.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";
import { DataService } from "@services/data/data.service";

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
    private dataService: DataService,
    private options: PaginationOptions
  ) {}

  loadInitial(): Observable<T[]> {
    const { paginationSignal, filterBuilder, load, visibility, entityName } = this.options;
    const current = paginationSignal();

    if (current.loading) {
      return of(current.items);
    }

    paginationSignal.set({
      items: [],
      skip: 0,
      limit: current.limit,
      hasMore: true,
      loading: true,
    });

    const filterParams = filterBuilder(0, paginationSignal().limit);
    return this.dataService
      .getEntitiesByType<T>(entityName, {
        ...filterParams,
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

    const filterParams = filterBuilder(current.skip, current.limit);
    return this.dataService
      .getEntitiesByType<T>(entityName, {
        ...filterParams,
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
  private dataService = inject(DataService);

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

  private commentsPagination = signal<PaginationState>({
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
    return new PaginationLoader<T>(this.dataService, options);
  }

  loadProfileAndUser(): Observable<{ profile: Profile | null; user: any | null }> {
    console.debug("[DataLoader] loadProfileAndUser called");
    return this.dataService.getProfile().pipe(
      switchMap((profile) => {
        console.debug("[DataLoader] getProfile returned:", profile);
        this.dataService.setCurrentProfile(profile);
        const user = profile?.user || null;
        if (user) {
          this.dataService.setCurrentUser(user);
        }
        return of({ profile, user });
      }),
      catchError(() => of({ profile: null, user: null }))
    );
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

    const allCategories$ = this.dataService.getCategories();

    const privateTodos$ = this.dataService.getTodos({
      filter: { user_id: currentUserId },
      load: ["categories", "user"],
      visibility: "private",
    });

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

    if (this.dataService.isOffline()) {
      console.log("[Offline] Skipping initialize_user_data, fetching profile directly from JSON");
      return this.fetchProfileFromJson(currentUserId);
    }

    return new Observable<Profile | null>((observer) => {
      this.dataService
        .initializeUserData(currentUserId)
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
              return this.dataService.getProfile();
            }
            return this.dataService.getProfile();
          })
        )
        .subscribe({
          next: (profile) => {
            const profileData = Array.isArray(profile) ? profile[0] : profile;
            observer.next(
              profileData && typeof profileData === "object" && "user_id" in profileData
                ? profileData
                : null
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
    return this.dataService.getProfile().pipe(
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
    if (this.dataService.isOffline()) {
      console.log("[Offline] Skipping shared/public data loading");
      return of(undefined);
    }

    const allProfiles$ = this.dataService.getPublicProfiles();

    const sharedTodos$ = this.dataService.getTodos({
      filter: { assignees: { $in: [currentUserId] } },
      load: ["categories", "user"],
      visibility: "shared",
    });

    const publicTodos$ = this.dataService.getTodos({
      visibility: "public",
      load: ["categories", "user"],
    });

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

  loadInitialCategories(): Observable<Category[]> {
    return this.dataService.getCategories();
  }

  refreshAll(): void {
    this.loadAllData(true).subscribe();
  }

  loadInitialTodos(visibility: string = "private", limit: number = 10): Observable<Todo[]> {
    console.log(`[DataLoader] loadInitialTodos START | visibility="${visibility}", limit=${limit}`);
    this.todosPagination.set({ items: [], skip: 0, limit, hasMore: true, loading: true });
    const userId = this.jwtTokenService.getCurrentUserId() || "";
    console.log(`[DataLoader] userId="${userId}"`);
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
    console.log(`[DataLoader] filter for "${visibility}"=`, JSON.stringify(filter, null, 2));
    console.log(`[DataLoader] === CALLING getTodos with visibility="${visibility}" ===`);

    return this.dataService
      .getTodos({ filter, skip: 0, limit, load: ["categories"], visibility })
      .pipe(
        switchMap((todos) => {
          console.log(
            `[DataLoader] loadInitialTodos END | visibility="${visibility}" | received ${todos?.length ?? 0} todos`
          );
          const current = this.todosPagination();
          const loadedTodos = todos || [];
          this.todosPagination.set({
            ...current,
            items: loadedTodos,
            skip: loadedTodos.length,
            hasMore: loadedTodos.length >= limit,
            loading: false,
          });
          console.log(`[DataLoader] setCurrentTodos called with ${loadedTodos.length} todos`);
          this.dataService.setCurrentTodos(loadedTodos);
          return of(loadedTodos);
        }),
        catchError((err) => {
          console.error(`[DataLoader] loadInitialTodos ERROR for visibility="${visibility}":`, err);
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

    return this.dataService
      .getTodos({
        filter,
        skip: current.skip,
        limit: current.limit,
        load: ["categories"],
        visibility,
      })
      .pipe(
        switchMap((todos) => {
          const newItems = todos || [];
          const updated = this.todosPagination();
          const allItems = [...updated.items, ...newItems];
          this.todosPagination.set({
            ...updated,
            items: allItems,
            skip: updated.skip + newItems.length,
            hasMore: newItems.length >= current.limit,
            loading: false,
          });
          this.dataService.setCurrentTodos(allItems);
          return of(newItems);
        }),
        catchError(() => {
          const updated = this.todosPagination();
          this.todosPagination.set({ ...updated, loading: false });
          return of([]);
        })
      );
  }

  loadInitialTasksForTodo(
    todoId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Task[]> {
    this.currentTasksTodoId.set(todoId);
    return this.createPaginationLoader<Task>({
      entityName: "tasks",
      paginationSignal: this.tasksPagination,
      currentIdSignal: this.currentTasksTodoId,
      filterBuilder: () => ({ filter: { todo_id: todoId } }),
      load: [],
      visibility,
    }).loadInitial();
  }

  loadMoreTasksForTodo(todoId: string, visibility: string = "private"): Observable<Task[]> {
    if (this.currentTasksTodoId() !== todoId)
      return this.loadInitialTasksForTodo(todoId, visibility);
    return this.createPaginationLoader<Task>({
      entityName: "tasks",
      paginationSignal: this.tasksPagination,
      currentIdSignal: this.currentTasksTodoId,
      filterBuilder: (skip) => ({ filter: { todo_id: todoId }, skip }),
      load: [],
      visibility,
    }).loadMore();
  }

  loadInitialSubtasksForTask(
    taskId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Subtask[]> {
    this.currentSubtasksTaskId.set(taskId);

    const cachedSubtasks = this.storageService.getSubtasksByTaskId(taskId);
    if (cachedSubtasks.length > 0) {
      this.subtasksPagination.set({
        items: cachedSubtasks,
        skip: cachedSubtasks.length,
        limit: limit,
        hasMore: false,
        loading: false,
      });
      return of(cachedSubtasks);
    }

    return this.createPaginationLoader<Subtask>({
      entityName: "subtasks",
      paginationSignal: this.subtasksPagination,
      currentIdSignal: this.currentSubtasksTaskId,
      filterBuilder: () => ({ filter: { task_id: taskId } }),
      load: ["comments"],
      visibility,
    }).loadInitial();
  }

  loadMoreSubtasksForTask(taskId: string, visibility: string = "private"): Observable<Subtask[]> {
    if (this.currentSubtasksTaskId() !== taskId)
      return this.loadInitialSubtasksForTask(taskId, visibility);
    return this.createPaginationLoader<Subtask>({
      entityName: "subtasks",
      paginationSignal: this.subtasksPagination,
      currentIdSignal: this.currentSubtasksTaskId,
      filterBuilder: (skip) => ({ filter: { task_id: taskId }, skip }),
      load: ["comments"],
      visibility,
    }).loadMore();
  }

  loadCommentsForTask(
    taskId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Comment[]> {
    this.commentsPagination.set({
      items: [],
      skip: 0,
      limit,
      hasMore: true,
      loading: true,
    });
    return this.createPaginationLoader<Comment>({
      entityName: "comments",
      paginationSignal: this.commentsPagination,
      filterBuilder: () => ({ filter: { task_id: taskId }, sort: { created_at: -1 } }),
      load: ["user"],
      visibility,
      reverseItems: true,
    }).loadInitial();
  }

  loadMoreCommentsForTask(taskId: string, visibility: string = "private"): Observable<Comment[]> {
    return this.createPaginationLoader<Comment>({
      entityName: "comments",
      paginationSignal: this.commentsPagination,
      filterBuilder: (skip) => ({ filter: { task_id: taskId }, skip, sort: { created_at: -1 } }),
      load: ["user"],
      visibility,
      reverseItems: true,
    }).loadMore();
  }

  loadCommentsForSubtask(
    subtaskId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Comment[]> {
    this.commentsPagination.set({
      items: [],
      skip: 0,
      limit,
      hasMore: true,
      loading: true,
    });
    return this.createPaginationLoader<Comment>({
      entityName: "comments",
      paginationSignal: this.commentsPagination,
      filterBuilder: () => ({ filter: { subtask_id: subtaskId }, sort: { created_at: -1 } }),
      load: ["user"],
      visibility,
      reverseItems: true,
    }).loadInitial();
  }

  loadMoreCommentsForSubtask(
    subtaskId: string,
    visibility: string = "private"
  ): Observable<Comment[]> {
    return this.createPaginationLoader<Comment>({
      entityName: "comments",
      paginationSignal: this.commentsPagination,
      filterBuilder: (skip) => ({
        filter: { subtask_id: subtaskId },
        skip,
        sort: { created_at: -1 },
      }),
      load: ["user"],
      visibility,
      reverseItems: true,
    }).loadMore();
  }

  loadInitialChatsForTodo(
    todoId: string,
    visibility: string = "private",
    limit: number = 10
  ): Observable<Chat[]> {
    this.currentChatsTodoId.set(todoId);
    return this.createPaginationLoader<Chat>({
      entityName: "chats",
      paginationSignal: this.chatsPagination,
      currentIdSignal: this.currentChatsTodoId,
      filterBuilder: () => ({ filter: { todo_id: todoId }, sort: { created_at: -1 } }),
      load: ["user"],
      visibility,
      reverseItems: true,
    }).loadInitial();
  }

  loadOlderChatsForTodo(
    todoId: string,
    visibility: string = "private",
    beforeTimestamp?: string
  ): Observable<Chat[]> {
    if (this.currentChatsTodoId() !== todoId)
      return this.loadInitialChatsForTodo(todoId, visibility);
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
      visibility,
      reverseItems: true,
      prependItems: true,
    }).loadMore();
  }
}
