/* sys lib */
import { Injectable, inject } from "@angular/core";
import {
  Observable,
  of,
  catchError,
  tap,
  retry,
  BehaviorSubject,
  map,
} from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { TodoRelations } from "@models/relations.config";

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

    // Return cached data immediately if valid
    if (!force && this.storageService.loaded()) {
      const todos = this.storageService.todos();
      const categories = this.storageService.categories();
      if (todos.length > 0 || categories.length > 0) {
        return of({ todos, categories });
      }
    }

    // Fire independent background loads (no blocking)
    this.loadPrivateTodos(userId);
    this.loadTeamTodosOwner(userId);
    this.loadTeamTodosAssignee(userId);
    this.loadCategories(userId);

    // Return current cache state immediately
    return of({
      todos: this.storageService.todos(),
      categories: this.storageService.categories(),
    });
  }

  /**
   * Fire-and-forget: Load private todos
   */
  private loadPrivateTodos(userId: string): void {
    const todoLoad = TodoRelations.loadAll;

    this.apiProvider.crud<Todo[]>(
      "getAll",
      "todos",
      {
        filter: { userId, visibility: "private", deleted_at: null },
        isOwner: true,
        isPrivate: true,
        load: todoLoad,
      },
      true
    ).pipe(
      retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
      catchError((err) => {
        console.warn("[DataLoaderService] privateTodos failed after retries:", err?.message || err);
        return of(null);
      }),
      tap((privateTodos) => {
        if (privateTodos && Array.isArray(privateTodos)) {
          this.storageService.setCollection("privateTodos", privateTodos);
          this.emitUpdate();
        }
      })
    ).subscribe();
  }

  /**
   * Fire-and-forget: Load team todos where user is owner
   */
  private loadTeamTodosOwner(userId: string): void {
    const todoLoad = TodoRelations.loadAll;

    this.apiProvider.crud<Todo[]>(
      "getAll",
      "todos",
      {
        filter: { userId, visibility: "team", deleted_at: null },
        isOwner: true,
        isPrivate: false,
        load: todoLoad,
      },
      true
    ).pipe(
      retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
      catchError((err) => {
        console.warn("[DataLoaderService] teamTodosOwner failed after retries:", err?.message || err);
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
    ).subscribe();
  }

  /**
   * Fire-and-forget: Load team todos where user is assignee
   */
  private loadTeamTodosAssignee(userId: string): void {
    const todoLoad = TodoRelations.loadAll;

    this.apiProvider.crud<Todo[]>(
      "getAll",
      "todos",
      {
        filter: { assignees: userId, visibility: "team", deleted_at: null },
        isOwner: false,
        isPrivate: false,
        load: todoLoad,
      },
      true
    ).pipe(
      retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
      catchError((err) => {
        console.warn("[DataLoaderService] teamTodosAssignee failed after retries:", err?.message || err);
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
    ).subscribe();
  }

  /**
   * Merge shared todos, avoiding duplicates by ID
   */
  private mergeSharedTodos(existing: Todo[], newTodos: Todo[]): Todo[] {
    const todoMap = new Map<string, Todo>();
    existing.forEach(t => todoMap.set(t.id, t));
    newTodos.forEach(t => todoMap.set(t.id, t));
    return Array.from(todoMap.values());
  }

  /**
   * Fire-and-forget: Load categories
   */
  private loadCategories(userId: string): void {
    this.apiProvider.crud<Category[]>(
      "getAll",
      "categories",
      { filter: { userId, deleted_at: null } },
      true
    ).pipe(
      retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
      catchError((err) => {
        console.warn("[DataLoaderService] categories failed after retries:", err?.message || err);
        return of(null);
      }),
      tap((categories) => {
        if (categories && Array.isArray(categories)) {
          this.storageService.setCollection("categories", categories);
          this.emitUpdate();
        }
      })
    ).subscribe();
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
   * Returns cached profile immediately if available
   * API call is fire-and-forget with retry
   */
  loadProfile(): Observable<Profile | null> {
    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken() || "") || "";

    if (!userId) {
      return of(null);
    }

    // Return cached profile immediately
    const cached = this.storageService.profile();
    if (cached?.userId) {
      return of(cached);
    }

    // Fire-and-forget API call with retry
    this.fetchProfileFromApi(userId);

    // Return cached or null immediately
    return of(this.storageService.profile());
  }

  /**
   * Fire-and-forget: Fetch profile from API
   */
  private fetchProfileFromApi(userId: string): void {
    this.apiProvider.crud<Profile[]>(
      "getAll",
      "profiles",
      {
        filter: { userId },
        load: ["user"],
        isPrivate: true,
        isOwner: true,
      },
      true
    ).pipe(
      retry({ count: this.RETRY_COUNT, delay: this.RETRY_DELAY_MS }),
      catchError((err) => {
        console.warn("[DataLoaderService] profile API failed after retries:", err?.message || err);
        return of(null);
      }),
      map((profiles: Profile[] | null) => {
        if (Array.isArray(profiles) && profiles.length > 0) {
          const profileObj = profiles[0] as Profile;
          if (profileObj?.userId) {
            return profileObj;
          }
        }
        return null as Profile | null;
      }),
      tap((profile: Profile | null) => {
        if (profile) {
          this.storageService.setCollection("profiles", profile);
        }
      })
    ).subscribe();
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
