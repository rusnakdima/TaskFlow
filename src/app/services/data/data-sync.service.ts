/* sys lib */
import { Injectable, inject } from "@angular/core";
import {
  Observable,
  of,
  forkJoin,
  catchError,
  BehaviorSubject,
  filter,
  take,
  combineLatest,
  defer,
  Subject,
  map,
  timeout,
} from "rxjs";
import { tap, switchMap } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";
import { NetworkErrorHelper } from "@helpers/network-error.helper";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/core/storage.service";

@Injectable({
  providedIn: "root",
})
export class DataSyncService {
  private jwtTokenService = inject(JwtTokenService);
  private dataSyncProvider = inject(DataSyncProvider);
  private storageService = inject(StorageService);

  private readonly CACHE_EXPIRY_MS = 2 * 60 * 1000;
  private readonly OFFLINE_TIMEOUT_MS = 3000; // Short timeout for offline detection
  private loadInProgress = false;
  private loadSubject = new BehaviorSubject<any>(null);

  /**
   * Handle sync errors with appropriate fallback behavior
   */
  private handleSyncError<T>(context: string, fallbackValue: T, error: any): Observable<T> {
    if (NetworkErrorHelper.isNetworkError(error)) {
      return of(fallbackValue);
    }
    throw error;
  }

  /**
   * Load all application data (todos and categories)
   * Works in offline mode - uses cached data if backend unavailable
   * Profile is loaded separately via loadProfile()
   */
  loadAllData(force: boolean = false): Observable<any> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const userId = this.jwtTokenService.getUserId(token) || "";

    const hasData =
      this.storageService.privateTodos().length > 0 || this.storageService.sharedTodos().length > 0;

    if (!hasData) {
      force = true;
    }

    // Check if we have valid cached data
    if (!force && this.isCacheValid()) {
      return of({
        todos: this.storageService.todos(),
        categories: this.storageService.categories(),
      });
    }

    // If already loading, return the existing observable
    if (this.loadInProgress) {
      return this.loadSubject.asObservable().pipe(
        filter((data) => data !== null),
        take(1)
      );
    }

    this.loadInProgress = true;
    this.storageService.setLoading(true);

    // Use relations with user data to load complete todo information
    const todoRelations = RelationsHelper.getTodoRelationsWithUser();

    // Create a subject to bridge internal execution with external subscribers
    const resultSubject = new Subject<any>();

    // Create the forkJoin and subscribe internally to ensure execution
    // ✅ Add timeout to prevent hanging on offline MongoDB queries
    forkJoin({
      privateTodos: defer(() => {
        return this.dataSyncProvider.crud<Todo[]>(
          "getAll",
          "todos",
          {
            filter: { userId, visibility: "private", isDeleted: false },
            isOwner: true,
            isPrivate: true,
            relations: todoRelations,
          },
          true
        );
      }),
      teamTodosOwner: defer(() => {
        return this.dataSyncProvider.crud<Todo[]>(
          "getAll",
          "todos",
          {
            filter: { userId, visibility: "team", isDeleted: false },
            isOwner: true,
            isPrivate: false,
            relations: todoRelations,
          },
          true
        );
      }),
      teamTodosAssignee: defer(() => {
        return this.dataSyncProvider.crud<Todo[]>(
          "getAll",
          "todos",
          {
            filter: { assignees: userId, visibility: "team", isDeleted: false },
            isOwner: false,
            isPrivate: false,
            relations: todoRelations,
          },
          true
        );
      }),
      categories: defer(() => {
        return this.dataSyncProvider.crud<Category[]>(
          "getAll",
          "categories",
          { filter: { userId, isDeleted: false } },
          true
        );
      }),
    })
      .pipe(
        timeout(this.OFFLINE_TIMEOUT_MS) // Short timeout for fast offline detection
      )
      .subscribe({
        next: ({ privateTodos, teamTodosOwner, teamTodosAssignee, categories }) => {
          this.storageService.setCollection("privateTodos", privateTodos);

          const sharedTodoMap = new Map<string, Todo>();
          [...teamTodosOwner, ...teamTodosAssignee].forEach((todo) =>
            sharedTodoMap.set(todo.id, todo)
          );
          this.storageService.setCollection("sharedTodos", Array.from(sharedTodoMap.values()));

          this.storageService.setCollection("categories", categories);
          this.storageService.setLoading(false);
          this.storageService.setLoaded(true);
          this.storageService.setLastLoaded(new Date());
          this.loadInProgress = false;

          const result = {
            todos: this.storageService.todos(),
            categories: this.storageService.categories(),
          };

          // Emit to all waiting subscribers
          this.loadSubject.next(result);
          resultSubject.next(result);
          resultSubject.complete();
        },
        error: (error) => {
          this.loadInProgress = false;
          this.storageService.setLoading(false);

          // ✅ Handle timeout/network errors - use cached data if available
          const isTimeout = error.name === "TimeoutError";
          const isNetworkError = NetworkErrorHelper.isNetworkError(error);

          if ((isTimeout || isNetworkError) && this.storageService.loaded()) {
            // Use cached data on timeout or network error
            console.log("Using cached data (offline mode)");
            const cachedData = {
              todos: this.storageService.todos(),
              categories: this.storageService.categories(),
            };
            this.loadSubject.next(cachedData);
            resultSubject.next(cachedData);
            resultSubject.complete();
          } else {
            // No cached data or different error - return empty
            console.warn("Data load failed, no cache available:", error.message);
            const emptyData = {
              todos: [],
              categories: [],
            };
            this.loadSubject.next(emptyData);
            resultSubject.next(emptyData);
            resultSubject.complete();
          }
        },
      });

    // Return the subject for external subscribers
    return resultSubject.asObservable();
  }

  /**
   * Load team-specific todos
   */
  loadTeamTodos(): Observable<Todo[]> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const userId = this.jwtTokenService.getUserId(token) || "";
    const todoRelations = RelationsHelper.getTodoRelations();

    return forkJoin({
      myTeamProjects: this.dataSyncProvider.crud<Todo[]>(
        "getAll",
        "todos",
        {
          filter: { userId, visibility: "team", isDeleted: false },
          isOwner: true,
          isPrivate: false,
          relations: todoRelations,
        },
        true
      ),
      sharedTeamProjects: this.dataSyncProvider.crud<Todo[]>(
        "getAll",
        "todos",
        {
          filter: { assignees: userId, visibility: "team", isDeleted: false },
          isOwner: false,
          isPrivate: false,
          relations: todoRelations,
        },
        true
      ),
      categories: this.dataSyncProvider.crud<Category[]>(
        "getAll",
        "categories",
        { filter: { userId, isDeleted: false } },
        true
      ),
    }).pipe(
      map(({ myTeamProjects, sharedTeamProjects, categories }) => {
        const todoMap = new Map<string, Todo>();
        [...myTeamProjects, ...sharedTeamProjects].forEach((todo) => todoMap.set(todo.id, todo));
        const uniqueTodos = Array.from(todoMap.values());

        this.storageService.setCollection("sharedTodos", uniqueTodos);
        this.storageService.setCollection("categories", categories);

        return uniqueTodos;
      })
    );
  }

  /**
   * Load user profile and store in StorageService
   * Uses explicit syncMetadata to ensure JSON provider is used (works offline)
   */
  loadProfile(): Observable<Profile | null> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const userId = this.jwtTokenService.getUserId(token) || "";

    if (!userId) {
      return of(null);
    }

    // Check if profile already exists in storage
    const existingProfile = this.storageService.profile();
    if (existingProfile) {
      return of(existingProfile);
    }

    // Use getAll with filter instead of get
    // ✅ Explicit syncMetadata ensures JSON provider is used (offline-safe)
    return this.dataSyncProvider
      .crud<Profile[]>(
        "getAll",
        "profiles",
        {
          filter: { userId },
          isPrivate: true,
          isOwner: true,
        },
        true
      )
      .pipe(
        timeout(3000), // 3 second timeout to prevent hanging
        map((profiles) => (profiles && profiles.length > 0 ? profiles[0] : null)),
        tap((profile: Profile | null) => {
          this.storageService.setCollection("profiles", profile);
        }),
        catchError((error) => {
          // Return cached profile on timeout/error (should be null since we checked above)
          return of(this.storageService.profile());
        })
      );
  }

  private isCacheValid(): boolean {
    if (!this.storageService.loaded()) return false;
    const lastLoaded = this.storageService.lastLoaded();
    if (!lastLoaded) return false;
    return new Date().getTime() - lastLoaded.getTime() < this.CACHE_EXPIRY_MS;
  }
}
