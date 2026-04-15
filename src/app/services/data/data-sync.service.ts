/* sys lib */
import { Injectable, inject } from "@angular/core";
import {
  Observable,
  of,
  forkJoin,
  catchError,
  filter,
  take,
  defer,
  Subject,
  map,
  timeout,
  tap,
  switchMap,
} from "rxjs";

/* models */
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { TodoRelations } from "@models/relations.config";

/* helpers */
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
  private readonly OFFLINE_TIMEOUT_MS = 8000; // Enough time for 4 parallel requests with relations
  private loadInProgress = false;
  // Fresh Subject per in-flight load — no stale replay on force-refresh (H-2)
  private loadSubject: Subject<any> | null = null;

  /**
   * Load all application data (todos and categories)
   * Works in offline mode - uses cached data if backend unavailable
   * Profile is loaded separately via loadProfile()
   */
  loadAllData(force: boolean = false): Observable<any> {
    const token = this.jwtTokenService.getToken();
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

    // If already loading, subscribe to the in-flight subject (no stale replay)
    if (this.loadInProgress && this.loadSubject) {
      return this.loadSubject.asObservable().pipe(take(1));
    }

    this.loadInProgress = true;
    this.loadSubject = new Subject<any>();
    this.storageService.setLoading(true);

    // Use new load parameter to load complete todo information
    // Filter out deleted records for regular pages (archive page handles deleted separately)
    const todoLoad = TodoRelations.loadAll;

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
            filter: { userId, visibility: "private", deleted_at: null },
            isOwner: true,
            isPrivate: true,
            load: todoLoad,
          },
          true
        );
      }),
      teamTodosOwner: defer(() => {
        return this.dataSyncProvider.crud<Todo[]>(
          "getAll",
          "todos",
          {
            filter: { userId, visibility: "team", deleted_at: null },
            isOwner: true,
            isPrivate: false,
            load: todoLoad,
          },
          true
        );
      }),
      teamTodosAssignee: defer(() => {
        return this.dataSyncProvider.crud<Todo[]>(
          "getAll",
          "todos",
          {
            filter: { assignees: userId, visibility: "team", deleted_at: null },
            isOwner: false,
            isPrivate: false,
            load: todoLoad,
          },
          true
        );
      }),
      categories: defer(() => {
        return this.dataSyncProvider.crud<Category[]>(
          "getAll",
          "categories",
          { filter: { userId, deleted_at: null } },
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
          this.loadSubject?.next(result);
          this.loadSubject = null;
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
            const cachedData = {
              todos: this.storageService.todos(),
              categories: this.storageService.categories(),
            };
            this.loadSubject?.next(cachedData);
            this.loadSubject = null;
            resultSubject.next(cachedData);
            resultSubject.complete();
          } else {
            // No cached data or different error - return empty
            const emptyData = {
              todos: [],
              categories: [],
            };
            this.loadSubject?.next(emptyData);
            this.loadSubject = null;
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
    const token = this.jwtTokenService.getToken();
    const userId = this.jwtTokenService.getUserId(token) || "";
    const todoLoad = TodoRelations.loadAll; // Load all relations including user data, tasks, assignees

    // Clear cache to ensure fresh data with new relations
    this.dataSyncProvider.clearCache("todos");

    return forkJoin({
      myTeamProjects: this.dataSyncProvider.crud<Todo[]>(
        "getAll",
        "todos",
        {
          filter: { userId, visibility: "team", deleted_at: null },
          isOwner: true,
          isPrivate: false,
          load: todoLoad,
        },
        true
      ),
      sharedTeamProjects: this.dataSyncProvider.crud<Todo[]>(
        "getAll",
        "todos",
        {
          filter: { assignees: userId, visibility: "team", deleted_at: null },
          isOwner: false,
          isPrivate: false,
          load: todoLoad,
        },
        true
      ),
      categories: this.dataSyncProvider.crud<Category[]>(
        "getAll",
        "categories",
        { filter: { userId, deleted_at: null } },
        true
      ),
    }).pipe(
      switchMap(({ myTeamProjects, sharedTeamProjects, categories }) => {
        const todoMap = new Map<string, Todo>();
        [...myTeamProjects, ...sharedTeamProjects].forEach((todo) => todoMap.set(todo.id, todo));
        const uniqueTodos = Array.from(todoMap.values());

        // Check if any todos are missing any of the required relations
        const todosMissingUser = uniqueTodos.filter((todo) => !todo.user && todo.userId);
        const todosMissingTasks = uniqueTodos.filter(
          (todo) => !todo.tasks || (todo.tasks && todo.tasks.length === 0)
        );
        const todosMissingAssignees = uniqueTodos.filter(
          (todo) => !todo.assigneesProfiles && todo.assignees && todo.assignees.length > 0
        );
        const todosMissingCategories = uniqueTodos.filter(
          (todo) =>
            !todo.categories ||
            (todo.categories &&
              (todo.categories.length === 0 || typeof todo.categories[0] === "string"))
        );

        // If we have missing data, fetch it
        if (
          todosMissingUser.length > 0 ||
          todosMissingTasks.length > 0 ||
          todosMissingAssignees.length > 0 ||
          todosMissingCategories.length > 0
        ) {
          // Prepare all the data we need to fetch
          const userIds = [...new Set(todosMissingUser.map((todo) => todo.userId))];
          const todoIds = [
            ...new Set(
              [...todosMissingTasks, ...todosMissingCategories, ...todosMissingAssignees].map(
                (todo) => todo.id
              )
            ),
          ];
          const assigneeIds = [
            ...new Set(todosMissingAssignees.flatMap((todo) => todo.assignees || [])),
          ];

          // Create observables for all the data we need to fetch
          const observables: any = {};

          if (todosMissingUser.length > 0) {
            observables.users = this.dataSyncProvider.crud<any[]>(
              "getAll",
              "users",
              {
                filter: { id: { $in: userIds } },
                isPrivate: false,
                isOwner: false,
              },
              true
            );
          }

          if (todosMissingTasks.length > 0) {
            observables.tasks = this.dataSyncProvider.crud<any[]>(
              "getAll",
              "tasks",
              {
                filter: { todoId: { $in: todoIds } },
                isPrivate: false,
                isOwner: false,
                load: ["subtasks", "subtasks.comments", "comments"],
              },
              true
            );
          }

          if (todosMissingAssignees.length > 0) {
            observables.assignees = this.dataSyncProvider.crud<any[]>(
              "getAll",
              "profiles",
              {
                filter: { userId: { $in: assigneeIds } },
                isPrivate: false,
                isOwner: false,
                load: ["user"],
              },
              true
            );
          }

          if (todosMissingCategories.length > 0) {
            // Find category IDs from todos
            const categoryIds = [
              ...new Set(
                todosMissingCategories.flatMap((t) => {
                  if (Array.isArray(t.categories) && typeof t.categories[0] === "string") {
                    return t.categories as unknown as string[];
                  }
                  return [];
                })
              ),
            ];

            if (categoryIds.length > 0) {
              observables.categories = this.dataSyncProvider.crud<any[]>(
                "getAll",
                "categories",
                {
                  filter: { id: { $in: categoryIds } },
                },
                true
              );
            }
          }

          // Execute all requests in parallel
          return forkJoin(observables).pipe(
            map((results: any) => {
              // Process users
              if (results.users && Array.isArray(results.users)) {
                const userMap = new Map<string, any>();
                results.users.forEach((user: any) => {
                  if (user && user.id) {
                    userMap.set(user.id, user);
                  }
                });

                uniqueTodos.forEach((todo) => {
                  if (!todo.user && todo.userId && userMap.has(todo.userId)) {
                    todo.user = userMap.get(todo.userId);
                  }
                });
              }

              // Process tasks
              if (results.tasks && Array.isArray(results.tasks)) {
                const tasksByTodoId = new Map<string, any[]>();
                results.tasks.forEach((task: any) => {
                  if (task && task.todoId) {
                    if (!tasksByTodoId.has(task.todoId)) {
                      tasksByTodoId.set(task.todoId, []);
                    }
                    tasksByTodoId.get(task.todoId)!.push(task);
                  }
                });

                uniqueTodos.forEach((todo) => {
                  if ((!todo.tasks || todo.tasks.length === 0) && tasksByTodoId.has(todo.id)) {
                    todo.tasks = tasksByTodoId.get(todo.id)!;
                  }
                });
              }

              // Process assignees
              if (results.assignees && Array.isArray(results.assignees)) {
                const assigneeMap = new Map<string, any>();
                results.assignees.forEach((assignee: any) => {
                  if (assignee && assignee.userId) {
                    assigneeMap.set(assignee.userId, assignee);
                  }
                });

                uniqueTodos.forEach((todo) => {
                  if (
                    (!todo.assigneesProfiles || todo.assigneesProfiles.length === 0) &&
                    todo.assignees &&
                    todo.assignees.length > 0
                  ) {
                    const profiles = todo.assignees
                      .map((userId: string) => assigneeMap.get(userId))
                      .filter((profile: any) => profile);

                    if (profiles.length > 0) {
                      todo.assigneesProfiles = profiles;
                    }
                  }
                });
              }

              // Process categories
              if (results.categories && Array.isArray(results.categories)) {
                const categoryMap = new Map<string, any>();
                results.categories.forEach((category: any) => {
                  if (category && category.id) {
                    categoryMap.set(category.id, category);
                  }
                });

                uniqueTodos.forEach((todo) => {
                  // Check if todo has category IDs that need to be converted to full category objects
                  if (todo.categories && Array.isArray(todo.categories)) {
                    // Check if the first element is a string (indicating category IDs)
                    const firstElement = todo.categories[0];
                    if (firstElement && typeof firstElement === "string") {
                      // Type assertion to handle the conversion safely
                      const categoryIds = todo.categories as unknown as string[];
                      const fullCategories = categoryIds
                        .map((catId) => categoryMap.get(catId))
                        .filter((cat) => cat);

                      if (fullCategories.length > 0) {
                        todo.categories = fullCategories;
                      }
                    }
                  }
                });
              }

              return { uniqueTodos, categories };
            })
          );
        } else {
          return of({ uniqueTodos, categories });
        }
      }),
      map(({ uniqueTodos, categories }) => {
        this.storageService.setCollection("sharedTodos", uniqueTodos);
        this.storageService.setCollection("categories", categories);

        return uniqueTodos;
      })
    );
  }

  /**
   * Load user profile and store in StorageService
   * Loads from local JSON first (fast, works offline)
   * User relation loaded separately if needed
   */
  loadProfile(): Observable<Profile | null> {
    const token = this.jwtTokenService.getToken();
    const userId = this.jwtTokenService.getUserId(token) || "";

    if (!userId) {
      return of(null);
    }

    // Check if profile already exists in storage WITH user relation loaded
    const existingProfile = this.storageService.profile();
    if (existingProfile?.user) {
      return of(existingProfile);
    }

    // Load from local first (fast); cloud check happens in background, never blocks storage
    return this.dataSyncProvider
      .crud<Profile[]>(
        "getAll",
        "profiles",
        {
          filter: { userId },
          load: ["user"], // Load user relation - JSON provider reads from local users.json
          isPrivate: true,
          isOwner: true,
        },
        true
      )
      .pipe(
        timeout(3000),
        map((profiles) => (profiles && profiles.length > 0 ? profiles[0] : null)),
        tap((profile: Profile | null) => {
          this.storageService.setCollection("profiles", profile);
        }),
        catchError(() => {
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
