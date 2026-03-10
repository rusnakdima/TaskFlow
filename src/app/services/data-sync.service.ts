/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of, forkJoin } from "rxjs";
import { tap, switchMap, map } from "rxjs/operators";

/* models */
import { Todo } from "@models/todo.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* services */
import { AuthService } from "@services/auth.service";
import { StorageService } from "@services/storage.service";

@Injectable({
  providedIn: "root",
})
export class DataSyncService {
  private authService = inject(AuthService);
  private dataSyncProvider = inject(DataSyncProvider);
  private storageService = inject(StorageService);

  private readonly CACHE_EXPIRY_MS = 2 * 60 * 1000;

  /**
   * Load all application data
   */
  loadAllData(force: boolean = false): Observable<any> {
    const userId = this.authService.getValueByKey("id") || "";

    const hasData =
      this.storageService.privateTodos().length > 0 || this.storageService.sharedTodos().length > 0;

    if (!hasData) force = true;

    if (!force && this.isCacheValid()) {
      return of({
        todos: this.storageService.todos(),
        categories: this.storageService.categories(),
      });
    }

    if (this.storageService.loading()) return of(null);

    this.storageService.setLoading(true);
    const todoRelations = RelationsHelper.getTodoRelations();

    return this.dataSyncProvider.get<Profile>("profiles", { userId }).pipe(
      switchMap((profile) => {
        this.storageService.setProfile(profile);

        return forkJoin({
          privateTodos: this.dataSyncProvider.getAll<Todo>(
            "todos",
            { userId, visibility: "private" },
            { isOwner: true, isPrivate: true, relations: todoRelations }
          ),
          teamTodosOwner: this.dataSyncProvider.getAll<Todo>(
            "todos",
            { userId, visibility: "team" },
            { isOwner: true, isPrivate: false, relations: todoRelations }
          ),
          teamTodosAssignee: this.dataSyncProvider.getAll<Todo>(
            "todos",
            { assignees: userId, visibility: "team" },
            { isOwner: false, isPrivate: false, relations: todoRelations }
          ),
          categories: this.dataSyncProvider.getAll<Category>("categories", { userId }),
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
      })
    );
  }

  /**
   * Load team-specific todos
   */
  loadTeamTodos(): Observable<Todo[]> {
    const userId = this.authService.getValueByKey("id") || "";
    const todoRelations = RelationsHelper.getTodoRelations();

    return this.dataSyncProvider.get<Profile>("profiles", { userId }).pipe(
      switchMap((profile) => {
        this.storageService.setProfile(profile);

        return forkJoin({
          myTeamProjects: this.dataSyncProvider.getAll<Todo>(
            "todos",
            { userId, visibility: "team" },
            { isOwner: true, isPrivate: false, relations: todoRelations }
          ),
          sharedTeamProjects: this.dataSyncProvider.getAll<Todo>(
            "todos",
            { assignees: userId, visibility: "team" },
            { isOwner: false, isPrivate: false, relations: todoRelations }
          ),
          categories: this.dataSyncProvider.getAll<Category>("categories", { userId }),
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
