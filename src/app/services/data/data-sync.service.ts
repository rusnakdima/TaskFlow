/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of, forkJoin, catchError } from "rxjs";
import { tap, switchMap, map } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";

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

  /**
   * Load all application data INCLUDING PROFILE
   * Works in offline mode - uses cached data if backend unavailable
   */
  loadAllData(force: boolean = false): Observable<any> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const userId = this.jwtTokenService.getUserId(token) || "";

    const hasData =
      this.storageService.privateTodos().length > 0 || this.storageService.sharedTodos().length > 0;

    if (!hasData) force = true;

    // Check if we have valid cached data
    if (!force && this.isCacheValid()) {
      return of({
        todos: this.storageService.todos(),
        categories: this.storageService.categories(),
        profile: this.storageService.profile(),
      });
    }

    if (this.storageService.loading()) return of(null);

    this.storageService.setLoading(true);

    // Use relations with user data to load complete todo information
    const todoRelations = RelationsHelper.getTodoRelationsWithUser();
    const profileRelations = RelationsHelper.getProfileRelations();

    // Load profile FIRST and store in StorageService
    return this.dataSyncProvider.getProfileByUserId(userId).pipe(
      tap((profile) => {
        // Store profile in StorageService for all views to use
        this.storageService.setProfile(profile || null);
      }),
      switchMap((profile) => {
        return forkJoin({
          privateTodos: this.dataSyncProvider.crud<Todo[]>(
            "getAll",
            "todos",
            {
              filter: { userId, visibility: "private" },
              isOwner: true,
              isPrivate: true,
              relations: todoRelations,
            },
            true
          ),
          teamTodosOwner: this.dataSyncProvider.crud<Todo[]>(
            "getAll",
            "todos",
            {
              filter: { userId, visibility: "team" },
              isOwner: true,
              isPrivate: false,
              relations: todoRelations,
            },
            true
          ),
          teamTodosAssignee: this.dataSyncProvider.crud<Todo[]>(
            "getAll",
            "todos",
            {
              filter: { assignees: userId, visibility: "team" },
              isOwner: false,
              isPrivate: false,
              relations: todoRelations,
            },
            true
          ),
          categories: this.dataSyncProvider.crud<Category[]>(
            "getAll",
            "categories",
            { filter: { userId } },
            true
          ),
        });
      }),
      catchError((error) => {
        // Profile load failed - check if it's a network error
        const isNetworkError =
          error.message?.includes("NetworkError") ||
          error.message?.includes("network") ||
          error.message?.includes("offline") ||
          error.message?.includes("Failed to fetch");

        if (isNetworkError) {
          // We're offline - use cached data
          console.warn("[DataSyncService] Working offline - using cached data");
          this.storageService.setLoading(false);
          this.storageService.setLoaded(true);
          this.storageService.setLastLoaded(new Date());
          return of({
            privateTodos: [],
            teamTodosOwner: [],
            teamTodosAssignee: [],
            categories: this.storageService.categories(),
          });
        }

        // Not a network error - continue with other data loading
        this.storageService.setProfile(null);

        return forkJoin({
          privateTodos: this.dataSyncProvider.crud<Todo[]>(
            "getAll",
            "todos",
            {
              filter: { userId, visibility: "private" },
              isOwner: true,
              isPrivate: true,
              relations: todoRelations,
            },
            true
          ),
          teamTodosOwner: this.dataSyncProvider.crud<Todo[]>(
            "getAll",
            "todos",
            {
              filter: { userId, visibility: "team" },
              isOwner: true,
              isPrivate: false,
              relations: todoRelations,
            },
            true
          ),
          teamTodosAssignee: this.dataSyncProvider.crud<Todo[]>(
            "getAll",
            "todos",
            {
              filter: { assignees: userId, visibility: "team" },
              isOwner: false,
              isPrivate: false,
              relations: todoRelations,
            },
            true
          ),
          categories: this.dataSyncProvider.crud<Category[]>(
            "getAll",
            "categories",
            { filter: { userId } },
            true
          ),
        });
      }),
      tap(({ privateTodos, teamTodosOwner, teamTodosAssignee, categories }) => {
        this.storageService.setPrivateTodos(privateTodos);

        const sharedTodoMap = new Map<string, Todo>();
        [...teamTodosOwner, ...teamTodosAssignee].forEach((todo) =>
          sharedTodoMap.set(todo.id, todo)
        );
        this.storageService.setSharedTodos(Array.from(sharedTodoMap.values()));

        this.storageService.setCategories(categories);
        this.storageService.setLoading(false);
        this.storageService.setLoaded(true);
        this.storageService.setLastLoaded(new Date());
      }),
      catchError((error) => {
        // All data loading failed - check if offline
        const isNetworkError =
          error.message?.includes("NetworkError") ||
          error.message?.includes("network") ||
          error.message?.includes("offline") ||
          error.message?.includes("Failed to fetch");

        if (isNetworkError && this.storageService.loaded()) {
          // We're offline but have cached data - that's OK
          console.warn("[DataSyncService] Using cached data (offline mode)");
          return of({
            todos: this.storageService.todos(),
            categories: this.storageService.categories(),
            profile: this.storageService.profile(),
          });
        }

        // Critical error - no cached data available
        this.storageService.setLoading(false);
        throw error;
      })
    );
  }

  /**
   * Load team-specific todos
   */
  loadTeamTodos(): Observable<Todo[]> {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const userId = this.jwtTokenService.getUserId(token) || "";
    const todoRelations = RelationsHelper.getTodoRelations();

    return this.dataSyncProvider.getProfileByUserId(userId).pipe(
      switchMap((profile) => {
        this.storageService.setProfile(profile);

        return forkJoin({
          myTeamProjects: this.dataSyncProvider.crud<Todo[]>(
            "getAll",
            "todos",
            {
              filter: { userId, visibility: "team" },
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
              filter: { assignees: userId, visibility: "team" },
              isOwner: false,
              isPrivate: false,
              relations: todoRelations,
            },
            true
          ),
          categories: this.dataSyncProvider.crud<Category[]>(
            "getAll",
            "categories",
            { filter: { userId } },
            true
          ),
        });
      }),
      map(({ myTeamProjects, sharedTeamProjects, categories }) => {
        const todoMap = new Map<string, Todo>();
        [...myTeamProjects, ...sharedTeamProjects].forEach((todo) => todoMap.set(todo.id, todo));
        const uniqueTodos = Array.from(todoMap.values());

        this.storageService.setSharedTodos(uniqueTodos);
        this.storageService.setCategories(categories);

        return uniqueTodos;
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
