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

  loadAllData(
    force: boolean = false,
    loadShared: boolean = true
  ): Observable<{ todos: Todo[]; categories: Category[] }> {
    const currentUserId = this.jwtTokenService.getCurrentUserId() || "";

    if (!force && this.storageService.loaded()) {
      const todos = this.storageService.todos();
      const categories = this.storageService.categories();
      if (todos.length > 0 || categories.length > 0) {
        return of({ todos, categories });
      }
    }

    // Always load categories from JSON (private, local storage)
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

    // Always load private todos from JSON (private, local storage)
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

    // Load user profile only if user_id is valid
    let userProfile$: Observable<Profile | null> = of(null);
    if (currentUserId && currentUserId.trim()) {
      userProfile$ = this.relationLoader.loadOne<Profile>(
        this.apiProvider,
        "profiles",
        { user_id: currentUserId },
        ["user"],
        {
          is_private: true,
          is_owner: true,
        }
      );
    }

    // Load profiles and shared todos only if loadShared is true
    const loadPromises: Observable<any>[] = [];
    const profileLabels: string[] = [];

    if (loadShared) {
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
      loadPromises.push(allProfiles$, sharedTodos$);
      profileLabels.push("allProfiles", "sharedTodos");
    }

    // Always run categories, private todos, and user profile first (JSON, fast)
    const essential$ = forkJoin([allCategories$, privateTodos$, userProfile$]).pipe(
      catchError((error) => {
        console.error("[DataLoader] Essential error:", error);
        return of([null, null, null]);
      })
    );

    const essentialLabels = ["categories", "privateTodos", "userProfile"];

    essential$.subscribe(([allCategories, privateTodos, userProfile]) => {
      if (allCategories && Array.isArray(allCategories)) {
        this.storageService.setCollection("categories", allCategories);
      }
      if (privateTodos && Array.isArray(privateTodos)) {
        this.storageService.setCollection("privateTodos", privateTodos);
      }
      if (userProfile && typeof userProfile === "object" && "user_id" in userProfile) {
        this.storageService.setCollection("profiles", userProfile);
      }
      this.storageService.setLoaded(true);
      this.storageService.setLastLoaded(new Date());
    });

    // Load profiles and shared todos in background if enabled
    if (loadShared && loadPromises.length > 0) {
      forkJoin(loadPromises)
        .pipe(
          catchError((error) => {
            console.error("[DataLoader] Shared error:", error);
            return of(loadPromises.map(() => null));
          })
        )
        .subscribe((results) => {
          results.forEach((data, index) => {
            const label = profileLabels[index];
            if (label === "allProfiles" && data) {
              this.storageService.setCollection("allProfiles", data);
            } else if (
              label === "userProfile" &&
              data &&
              typeof data === "object" &&
              "user_id" in data
            ) {
              this.storageService.setCollection("profiles", data);
            } else if (label === "sharedTodos" && data) {
              this.storageService.setCollection("sharedTodos", data);
            }
          });
        });
    }

    const todos = this.storageService.todos();
    const categories = this.storageService.categories();
    return of({ todos, categories });
  }

  refreshAll(): void {
    this.loadAllData(true).subscribe();
  }
}
