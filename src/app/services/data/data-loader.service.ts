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

@Injectable({
  providedIn: "root",
})
export class DataLoaderService {
  private jwtTokenService = inject(JwtTokenService);
  private apiProvider = inject(ApiProvider);
  private storageService = inject(StorageService);

  private readonly RETRY_COUNT = 2;
  private readonly RETRY_DELAY_MS = 1000;

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
    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken() || "") || "";
    console.log("[DataLoader] loadAllData called", {
      force,
      userId,
      loaded: this.storageService.loaded(),
    });

    // Return cached data immediately if valid
    if (!force && this.storageService.loaded()) {
      const todos = this.storageService.todos();
      const categories = this.storageService.categories();
      console.log("[DataLoader] Using cache - loaded=true, returning:", {
        todosCount: todos.length,
        categoriesCount: categories.length,
      });
      if (todos.length > 0 || categories.length > 0) {
        return of({ todos, categories });
      }
    }

    console.log("[DataLoader] Fetching fresh data for user:", userId);
    // Fire independent background loads (no blocking)
    this.loadPrivateTodos(userId);
    this.loadTeamTodosOwner(userId);
    this.loadTeamTodosAssignee(userId);
    this.loadCategories(userId);

    // Return current cache state immediately
    const currentTodos = this.storageService.todos();
    const currentCategories = this.storageService.categories();
    console.log("[DataLoader] Returning current state:", {
      todosCount: currentTodos.length,
      categoriesCount: currentCategories.length,
    });
    return of({
      todos: currentTodos,
      categories: currentCategories,
    });
  }

  /**
   * Fire-and-forget: Load private todos
   */
  private loadPrivateTodos(userId: string): void {
    const filter = { user_id: userId };
    console.log("[DataLoader] loadPrivateTodos called with filter:", JSON.stringify(filter));

    this.apiProvider
      .crud<Todo[]>(
        "getAll",
        "todos",
        {
          filter,
          isOwner: true,
          isPrivate: true,
        },
        true
      )
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError(() => {
          console.log("[DataLoader] loadPrivateTodos error, returning null");
          return of(null);
        }),
        tap((privateTodos) => {
          console.log("[DataLoader] loadPrivateTodos response:", privateTodos);
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
    this.apiProvider
      .crud<Todo[]>(
        "getAll",
        "todos",
        {
          filter: { user_id: userId },
          isOwner: true,
          isPrivate: false,
        },
        true
      )
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError(() => {
          return of(null);
        }),
        tap((teamTodos) => {
          if (teamTodos && Array.isArray(teamTodos)) {
            // Merge with existing shared todos
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
    this.apiProvider
      .crud<Todo[]>(
        "getAll",
        "todos",
        {
          filter: { assignees: userId },
          isOwner: false,
          isPrivate: false,
        },
        true
      )
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError(() => {
          return of(null);
        }),
        tap((teamTodos) => {
          if (teamTodos && Array.isArray(teamTodos)) {
            // Merge with existing shared todos
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
        catchError(() => {
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
   * Load user profile
   * Returns cached profile if available, otherwise fetches from API
   */
  loadProfile(): Observable<Profile | null> {
    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken() || "") || "";

    if (!userId) {
      console.log("[DataLoader] loadProfile: no userId, returning null");
      return of(null);
    }

    const cached = this.storageService.profile();
    console.log("[DataLoader] loadProfile: userId=", userId, "cached=", cached);

    if (cached?.user_id) {
      return of(cached);
    }

    return this.fetchProfileFromApi(userId);
  }

  /**
   * Fetch profile from API and update storage
   */
  private fetchProfileFromApi(userId: string): Observable<Profile | null> {
    console.log("[DataLoader] fetchProfileFromApi called with userId:", userId);

    return this.apiProvider
      .crud<Profile[]>(
        "getAll",
        "profiles",
        {
          filter: { user_id: userId },
          isPrivate: true,
          isOwner: true,
        },
        true
      )
      .pipe(
        retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
        catchError((err) => {
          console.error("[DataLoader] fetchProfileFromApi error:", err);
          return of([] as Profile[]);
        }),
        map((profiles: Profile[] | null) => {
          console.log("[DataLoader] fetchProfileFromApi response:", profiles);
          if (Array.isArray(profiles) && profiles.length > 0) {
            const profileObj = profiles[0] as Profile;
            if (profileObj?.user_id) {
              console.log(
                "[DataLoader] Profile found with user relation, updating storage:",
                profileObj
              );
              this.storageService.setCollection("profiles", profileObj);
              return profileObj;
            }
          }
          console.log("[DataLoader] No profile found for userId:", userId);
          return null as Profile | null;
        })
      );
  }

  /**
   * Load team todos (for shared-tasks view)
   * Fire-and-forget, updates storage, returns observable for compatibility
   */
  loadTeamTodos(): Observable<Todo[]> {
    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken() || "") || "";
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
   * Force refresh profile
   */
  refreshProfile(): void {
    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken() || "") || "";
    if (userId) {
      this.fetchProfileFromApi(userId);
    }
  }
}
