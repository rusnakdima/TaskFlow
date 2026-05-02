/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, forkJoin, of, catchError, switchMap } from "rxjs";
import { Router } from "@angular/router";

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
import { UserValidationService } from "@services/auth/user-validation.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";

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

  private readonly RETRY_COUNT = 2;
  private readonly RETRY_DELAY_MS = 1000;

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

    const allCategories$ = this.relationLoader.loadMany<Category>(
      this.apiProvider,
      "categories",
      {},
      [],
      "private"
    );

    const privateTodos$ = this.relationLoader.loadMany<Todo>(
      this.apiProvider,
      "todos",
      { user_id: currentUserId },
      ["categories", "tasks", "tasks.subtasks", "tasks.comments", "user", "assignees", "chats"],
      "private"
    );

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
        return of({
          todos: this.storageService.todos(),
          categories: this.storageService.categories(),
        });
      })
    );
  }

  private createUserProfileObservable(currentUserId: string): Observable<Profile | null> {
    if (!currentUserId || !currentUserId.trim()) {
      return of(null);
    }

    return new Observable<Profile | null>((observer) => {
      this.apiProvider
        .invokeCommand("initialize_user_data", { userId: currentUserId })
        .pipe(
          switchMap((result: any) => {
            if (result?.data?.needsRegistration) {
              this.notifyService.showWarning("Account not found. Please register again.");
              this.router.navigate(["/register"]);
              return of(null);
            }
            if (result?.data?.needsProfile) {
              this.notifyService.showWarning("Profile not found. Please create one.");
              this.profileRequiredService.setProfileRequiredMode(true);
              this.router.navigate(["/profile/manage"]);
              return of(null);
            }
            return this.apiProvider.crud<Profile>("get", "profiles", {
              filter: { user_id: currentUserId },
              load: ["user"],
              visibility: "private",
            });
          })
        )
        .subscribe({
          next: (profile) => {
            observer.next(
              profile && typeof profile === "object" && "user_id" in profile ? profile : null
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

  private createSharedDataObservable(currentUserId: string): Observable<void> {
    const allProfiles$ = this.relationLoader.loadMany<Profile>(
      this.apiProvider,
      "profiles",
      {},
      ["user"],
      "shared"
    );

    const sharedTodos$ = this.relationLoader.loadMany<Todo>(
      this.apiProvider,
      "todos",
      { assignees: { $in: [currentUserId] } },
      ["categories", "tasks", "tasks.subtasks", "tasks.comments", "user", "assignees", "chats"],
      "shared"
    );

    const publicTodos$ = this.relationLoader.loadMany<Todo>(
      this.apiProvider,
      "todos",
      { visibility: "public" },
      ["categories", "tasks", "tasks.subtasks", "tasks.comments", "user", "assignees", "chats"],
      "public"
    );

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

  refreshAll(): void {
    this.loadAllData(true).subscribe();
  }
}
