/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, forkJoin, of, catchError, tap, switchMap } from "rxjs";
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

    // Always check for profile status even if data is loaded
    // This handles the case where user was redirected but page reloaded
    if (this.storageService.loaded()) {
      const todos = this.storageService.todos();
      const categories = this.storageService.categories();
      const profile = this.storageService.profile();
      if (todos.length > 0 || categories.length > 0) {
        // Data is cached, but still check if profile exists
        if (!profile?.user_id && currentUserId && currentUserId.trim()) {
          const currentUrl = window.location.pathname;
          if (!currentUrl.startsWith("/profile")) {
            this.notifyService.showWarning("Profile not found. Please create one.");
            this.profileRequiredService.setProfileRequiredMode(true);
            this.router.navigate(["/profile/manage"]);
          }
        }
        return of({ todos, categories });
      }
    }

    // Always load categories from JSON (private, local storage)
    const allCategories$ = this.relationLoader.loadMany<Category>(
      this.apiProvider,
      "categories",
      {},
      [],
      "private"
    );

    // Always load private todos from JSON (private, local storage)
    const privateTodos$ = this.relationLoader.loadMany<Todo>(
      this.apiProvider,
      "todos",
      { user_id: currentUserId },
      ["categories", "tasks", "user", "chats"],
      "private"
    );

    // Load user profile only if user_id is valid
    let userProfile$: Observable<Profile | null> = of(null);
    if (currentUserId && currentUserId.trim()) {
      userProfile$ = new Observable<Profile | null>((observer) => {
        this.apiProvider
          .invokeCommand("initialize_user_data", { userId: currentUserId })
          .pipe(
            switchMap((result: any) => {
              if (result?.data?.needsRegistration) {
                this.notifyService.showWarning("Account not found. Please register again.");
                this.router.navigate(["/register"]);
                observer.next(null);
                observer.complete();
                return of(null);
              }
              if (result?.data?.needsProfile) {
                this.notifyService.showWarning("Profile not found. Please create one.");
                this.profileRequiredService.setProfileRequiredMode(true);
                this.router.navigate(["/profile/manage"]);
                observer.next(null);
                observer.complete();
                return of(null);
              }
              // Sync complete, now load profile from JSON
              return this.apiProvider.crud<Profile>("get", "profiles", {
                filter: { user_id: currentUserId },
                load: ["user"],
                visibility: "private",
              });
            })
          )
          .subscribe({
            next: (profile) => {
              if (profile && typeof profile === "object" && "user_id" in profile) {
                this.storageService.setCollection("profiles", profile);
              } else {
                observer.next(null);
              }
              observer.complete();
            },
            error: (err: any) => {
              observer.next(null);
              observer.complete();
            },
          });
      });
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
        "team"
      );

      const sharedTodos$ = this.relationLoader.loadMany<Todo>(
        this.apiProvider,
        "todos",
        { assignees: { $in: [currentUserId] } },
        ["category", "chats"],
        "team"
      );

      const publicTodos$ = this.relationLoader.loadMany<Todo>(
        this.apiProvider,
        "todos",
        { visibility: "public" },
        ["category", "chats"],
        "public"
      );

      loadPromises.push(allProfiles$, sharedTodos$, publicTodos$);
      profileLabels.push("allProfiles", "sharedTodos", "publicTodos");
    }

    // Always run categories, private todos, and user profile first (JSON, fast)
    const essential$ = forkJoin([allCategories$, privateTodos$, userProfile$]).pipe(
      catchError(() => of([null, null, null]))
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
      } else if (!userProfile && currentUserId && currentUserId.trim()) {
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
      this.storageService.setLoaded(true);
      this.storageService.setLastLoaded(new Date());
    });

    // Load profiles and shared todos in background if enabled
    if (loadShared && loadPromises.length > 0) {
      forkJoin(loadPromises)
        .pipe(catchError(() => of(loadPromises.map(() => null))))
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
            } else if (label === "publicTodos" && data) {
              this.storageService.setCollection("publicTodos", data);
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
