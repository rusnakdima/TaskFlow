/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, forkJoin, of, catchError, tap } from "rxjs";

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

  loadAllData(force: boolean = false): Observable<{ todos: Todo[]; categories: Category[] }> {
    const currentUserId = this.jwtTokenService.getCurrentUserId() || "";

    if (!force && this.storageService.loaded()) {
      const todos = this.storageService.todos();
      const categories = this.storageService.categories();
      if (todos.length > 0 || categories.length > 0) {
        return of({ todos, categories });
      }
    }

    const allProfiles$ = this.relationLoader.loadMany<Profile>(
      this.apiProvider,
      "profiles",
      {},
      ["user"],
      {
        is_owner: false,
        is_private: false,
      }
    );

    const userProfile$ = this.relationLoader.loadMany<Profile>(
      this.apiProvider,
      "profiles",
      { user_id: currentUserId },
      ["user"],
      {
        is_private: true,
        is_owner: true,
      }
    );

    const allCategories$ = this.relationLoader.loadMany<Category>(
      this.apiProvider,
      "categories",
      {},
      [],
      {
        is_private: true,
        is_owner: true,
      }
    );

    const privateTodos$ = this.relationLoader.loadMany<Todo>(
      this.apiProvider,
      "todos",
      { user_id: currentUserId },
      [],
      {
        is_private: true,
        is_owner: true,
      }
    );

    const sharedTodos$ = this.relationLoader.loadMany<Todo>(
      this.apiProvider,
      "todos",
      { assignees: { $in: [currentUserId] } },
      ["category"],
      {
        is_private: false,
        is_owner: false,
      }
    );

    forkJoin([allProfiles$, userProfile$, allCategories$, privateTodos$, sharedTodos$])
      .pipe(
        catchError((error) => {
          console.error("[DataLoader] Error:", error);
          return of([null, null, null, null, null]);
        })
      )
      .subscribe(([allProfiles, userProfile, allCategories, privateTodos, sharedTodos]) => {
        if (allProfiles && Array.isArray(allProfiles)) {
          this.storageService.setCollection("allProfiles", allProfiles);
        }
        if (userProfile && Array.isArray(userProfile) && userProfile.length > 0) {
          this.storageService.setCollection("profiles", userProfile[0]);
        }
        if (allCategories && Array.isArray(allCategories)) {
          this.storageService.setCollection("categories", allCategories);
        }
        if (privateTodos && Array.isArray(privateTodos)) {
          this.storageService.setCollection("privateTodos", privateTodos);
        }
        if (sharedTodos && Array.isArray(sharedTodos)) {
          this.storageService.setCollection("sharedTodos", sharedTodos);
        }
        this.storageService.setLoaded(true);
        this.storageService.setLastLoaded(new Date());
      });

    const todos = this.storageService.todos();
    const categories = this.storageService.categories();
    return of({ todos, categories });
  }

  refreshAll(): void {
    this.loadAllData(true).subscribe();
  }
}
