/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of, catchError, tap, retry, BehaviorSubject, map } from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/core/storage.service";
import { RelationLoadingService } from "@services/core/relation-loading.service";

@Injectable({
  providedIn: "root",
})
export class DataLoaderService {
  private jwtTokenService = inject(JwtTokenService);
  private apiProvider = inject(ApiProvider);
  private storageService = inject(StorageService);
  private relationLoader = inject(RelationLoadingService);

  private readonly RETRY_COUNT = 2;
  private readonly RETRY_DELAY_MS = 1000;

  private readonly TODO_LOAD_RELATIONS = [
    "user",
    "categories",
    "tasks",
    "tasks.subtasks",
    "tasks.subtasks.comments",
    "tasks.comments",
    "assignees",
  ];

  private loadInProgress = false;
  private loadSubject = new BehaviorSubject<{ todos: Todo[]; categories: Category[] } | null>(null);

  /**
   * Get observable for current load state
   */
  loadState$ = this.loadSubject.asObservable();

  /**
   * Load all application data (todos and categories)
   * Fire-and-forget: updates StorageService via independent subscriptions
   * Data is delivered via WS, API calls are fallback/seed
   * Returns immediately with cached data if available
   */
  loadAllData(force: boolean = false): Observable<{ todos: Todo[]; categories: Category[] }> {
    const userId = this.jwtTokenService.getCurrentUserId() || "";

    if (!force && this.storageService.loaded()) {
      const todos = this.storageService.todos();
      const categories = this.storageService.categories();
      if (todos.length > 0 || categories.length > 0) {
        return of({ todos, categories });
      }
    }

    this.loadPrivateTodos(userId);
    this.loadTeamTodosOwner(userId);
    this.loadTeamTodosAssignee(userId);
    this.loadCategories(userId);
    this.loadProfiles();
    this.loadUserProfile(userId);
    this.loadStats(userId);

    const currentTodos = this.storageService.todos();
    const currentCategories = this.storageService.categories();
    return of({
      todos: currentTodos,
      categories: currentCategories,
    });
  }

  /**
   * Fire-and-forget: Load private todos
   */
  private loadPrivateTodos(userId: string): void {
    const filter = { user_id: userId, visibility: "private" };

    this.relationLoader
      .loadMany<Todo>(this.apiProvider, "todos", filter, this.TODO_LOAD_RELATIONS, {
        is_owner: true,
        is_private: true,
        visibility: "private",
      })
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError((error) => {
          console.error("[DataLoader] Error:", error);
          return of(null);
        }),
        tap((privateTodos) => {
          if (privateTodos && Array.isArray(privateTodos)) {
            this.storageService.setCollection("privateTodos", privateTodos);
            this.emitUpdate();
          }
        })
      )
      .subscribe();
  }

  /**
   * Fire-and-forget: Load team todos where user is owner
   */
  private loadTeamTodosOwner(userId: string): void {
    const filter = { user_id: userId, visibility: "team" };

    this.relationLoader
      .loadMany<Todo>(this.apiProvider, "todos", filter, this.TODO_LOAD_RELATIONS, {
        is_owner: true,
        is_private: false,
        visibility: "team",
      })
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError((error) => {
          console.error("[DataLoader] Error:", error);
          return of(null);
        }),
        tap((teamTodos) => {
          if (teamTodos && Array.isArray(teamTodos)) {
            const existingShared = this.storageService.sharedTodos();
            const merged = this.mergeSharedTodos(existingShared, teamTodos);
            this.storageService.setCollection("sharedTodos", merged);
            this.emitUpdate();
          }
        })
      )
      .subscribe();
  }

  /**
   * Fire-and-forget: Load team todos where user is assignee
   */
  private loadTeamTodosAssignee(userId: string): void {
    const filter = { assignees: userId, visibility: "team" };

    this.relationLoader
      .loadMany<Todo>(this.apiProvider, "todos", filter, this.TODO_LOAD_RELATIONS, {
        is_owner: false,
        is_private: false,
        visibility: "team",
      })
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError((error) => {
          console.error("[DataLoader] Error:", error);
          return of(null);
        }),
        tap((teamTodos) => {
          if (teamTodos && Array.isArray(teamTodos)) {
            const existingShared = this.storageService.sharedTodos();
            const merged = this.mergeSharedTodos(existingShared, teamTodos);
            this.storageService.setCollection("sharedTodos", merged);
            this.emitUpdate();
          }
        })
      )
      .subscribe();
  }

  /**
   * Merge shared todos, avoiding duplicates by ID
   */
  private mergeSharedTodos(existing: Todo[], newTodos: Todo[]): Todo[] {
    const todoMap = new Map<string, Todo>();
    existing.forEach((t) => todoMap.set(t.id, t));
    newTodos.forEach((t) => todoMap.set(t.id, t));
    return Array.from(todoMap.values());
  }

  /**
   * Fire-and-forget: Load categories
   */
  private loadCategories(userId: string): void {
    this.apiProvider
      .crud<Category[]>(
        "getAll",
        "categories",
        { filter: { user_id: userId, deleted_at: null } },
        true
      )
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError((error) => {
          console.error("[DataLoader] Error:", error);
          return of(null);
        }),
        tap((categories) => {
          if (categories && Array.isArray(categories)) {
            this.storageService.setCollection("categories", categories);
            this.emitUpdate();
          }
        })
      )
      .subscribe();

    this.relationLoader
      .loadMany<Category>(
        this.apiProvider,
        "categories",
        { user_id: userId, deleted_at: null },
        [],
        {
          is_owner: false,
          is_private: false,
        }
      )
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError((error) => {
          console.error("[DataLoader] Error:", error);
          return of(null);
        }),
        tap((mongoCategories) => {
          if (mongoCategories && Array.isArray(mongoCategories)) {
            const existing = this.storageService.categories();
            const merged = this.mergeCategories(existing, mongoCategories);
            this.storageService.setCollection("categories", merged);
            this.emitUpdate();
          }
        })
      )
      .subscribe();
  }

  private mergeCategories(jsonCats: Category[], mongoCats: Category[]): Category[] {
    const catMap = new Map<string, Category>();
    jsonCats.forEach((c) => catMap.set(c.id, c));
    mongoCats.forEach((c) => {
      if (!catMap.has(c.id)) {
        catMap.set(c.id, c);
      }
    });
    return Array.from(catMap.values());
  }

  /**
   * Fire-and-forget: Load profiles list
   */
  private loadProfiles(): void {
    this.relationLoader
      .loadMany<Profile>(this.apiProvider, "profiles", {}, ["user"], {
        is_owner: true,
        is_private: false,
      })
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError((error) => {
          console.error("[DataLoader] Error:", error);
          return of(null);
        }),
        tap((profiles) => {
          if (profiles && Array.isArray(profiles)) {
            this.storageService.setCollection("allProfiles", profiles);
            this.emitUpdate();
          }
        })
      )
      .subscribe();
  }

  /**
   * Emit current state to subscribers
   */
  private emitUpdate(): void {
    this.storageService.setLoaded(true);
    this.storageService.setLastLoaded(new Date());
    this.loadSubject.next({
      todos: this.storageService.todos(),
      categories: this.storageService.categories(),
    });
  }

  /**
   * Fire-and-forget: Load user profile
   */
  private loadUserProfile(userId: string): void {
    if (!userId) return;
    this.fetchProfileFromApi(userId).subscribe();
  }

  /**
   * Load user profile
   * Returns cached profile if available, otherwise fetches from API
   */
  loadProfile(): Observable<Profile | null> {
    const userId = this.jwtTokenService.getCurrentUserId() || "";

    if (!userId) {
      return of(null);
    }

    const cached = this.storageService.profile();
    if (cached?.user_id) {
      return of(cached);
    }

    return this.fetchProfileFromApi(userId);
  }

  /**
   * Fetch profile from API and update storage
   */
  private fetchProfileFromApi(userId: string): Observable<Profile | null> {
    return this.relationLoader
      .loadMany<Profile>(this.apiProvider, "profiles", { user_id: userId }, ["user"], {
        is_private: true,
        is_owner: true,
      })
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError((error) => {
          console.error("[DataLoader] Error:", error);
          return of([] as Profile[]);
        }),
        map((profiles: Profile[] | null) => {
          if (Array.isArray(profiles) && profiles.length > 0) {
            const profileObj = profiles[0] as Profile;
            if (profileObj?.user_id) {
              this.storageService.setCollection("profiles", profileObj);
              return profileObj;
            }
          }
          return null as Profile | null;
        })
      );
  }

  /**
   * Load team todos (for shared-tasks view)
   * Fire-and-forget, updates storage, returns observable for compatibility
   */
  loadTeamTodos(): Observable<Todo[]> {
    const userId = this.jwtTokenService.getCurrentUserId() || "";
    this.loadTeamTodosOwner(userId);
    this.loadTeamTodosAssignee(userId);
    return of(this.storageService.sharedTodos());
  }

  /**
   * Force refresh all data
   */
  refreshAll(): void {
    this.loadAllData(true).subscribe();
  }

  /**
   * Fire-and-forget: Load stats
   */
  private loadStats(userId: string): void {
    if (!userId) return;
    this.apiProvider
      .invokeCommand("statistics_get", {
        userId: userId,
        timeRange: "month",
      })
      .subscribe({
        next: (stats) => {
          if (stats) {
          }
        },
        error: (err) => {
          console.error("[DataLoader] Stats error:", err);
        },
      });
  }

  /**
   * Force refresh profile
   */
  refreshProfile(): void {
    const userId = this.jwtTokenService.getCurrentUserId() || "";
    if (userId) {
      this.fetchProfileFromApi(userId);
    }
  }
}
