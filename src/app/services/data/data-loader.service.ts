/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, forkJoin, of, catchError, tap } from "rxjs";
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

    console.log(
      "[DataLoader] loadAllData called, loaded:",
      this.storageService.loaded(),
      "currentUserId:",
      currentUserId
    );

    // Always check for profile status even if data is loaded
    // This handles the case where user was redirected but page reloaded
    if (this.storageService.loaded()) {
      const todos = this.storageService.todos();
      const categories = this.storageService.categories();
      const profile = this.storageService.profile();
      console.log(
        "[DataLoader] Cached data check - todos:",
        todos.length,
        "categories:",
        categories.length,
        "profile:",
        profile?.user_id
      );
      if (todos.length > 0 || categories.length > 0) {
        // Data is cached, but still check if profile exists
        if (!profile?.user_id && currentUserId && currentUserId.trim()) {
          console.log("[DataLoader] Cached data loaded but no profile, triggering redirect...");
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
      // Call API directly to properly handle errors
      userProfile$ = new Observable<Profile | null>((observer) => {
        this.apiProvider
          .crud<Profile>("get", "profiles", {
            filter: { user_id: currentUserId },
            load: ["user"],
            visibility: "private",
          })
          .subscribe({
            next: (profile) => {
              if (profile && typeof profile === "object" && "user_id" in profile) {
                observer.next(profile);
              } else {
                observer.next(null);
              }
              observer.complete();
            },
            error: (err: Error) => {
              const errorMsg = err.message || String(err) || "";
              console.log("[DataLoader] Profile API error:", errorMsg);
              if (errorMsg.includes("User not found")) {
                this.notifyService.showWarning(
                  "Your account was deleted from cloud. Please login again."
                );
                this.userValidationService.invalidateUserSession();
              } else if (errorMsg.includes("Profile not found - user exists")) {
                this.notifyService.showWarning("Profile not found - checking local...");
                const localProfile = this.storageService.profile();
                console.log("[DataLoader] localProfile:", localProfile);
                if (localProfile?.id) {
                  // Case A: Local profile exists - sync local to cloud
                  this.notifyService.showWarning(
                    "Your profile was deleted from cloud. Restoring from local..."
                  );
                  this.apiProvider
                    .crud<Profile>("update", "profiles", {
                      data: localProfile,
                      id: localProfile.id,
                      visibility: "private",
                    })
                    .subscribe({
                      next: () => {
                        console.log("[DataLoader] Profile synced to cloud");
                        observer.next(localProfile);
                        observer.complete();
                      },
                      error: () => {
                        console.log("[DataLoader] Sync failed, proceeding with local");
                        observer.next(localProfile);
                        observer.complete();
                      },
                    });
                } else {
                  // Case B: No local - check if profile exists in cloud (without user relation)
                  console.log("[DataLoader] Case B: No local profile, checking cloud...");
                  this.apiProvider
                    .crud<Profile>("get", "profiles", {
                      filter: { user_id: currentUserId },
                      load: [],
                      visibility: "private",
                    })
                    .subscribe({
                      next: (cloudProfile) => {
                        if (
                          cloudProfile &&
                          typeof cloudProfile === "object" &&
                          "user_id" in cloudProfile
                        ) {
                          // Profile exists in cloud - import to local
                          this.notifyService.showWarning(
                            "Your profile was found in cloud. Importing..."
                          );
                          this.apiProvider
                            .crud<Profile>("create", "profiles", {
                              data: cloudProfile,
                              visibility: "private",
                            })
                            .subscribe({
                              next: () => {
                                console.log("[DataLoader] Profile imported from cloud");
                                observer.next(cloudProfile);
                                observer.complete();
                              },
                              error: () => {
                                console.log("[DataLoader] Import failed");
                                observer.next(cloudProfile);
                                observer.complete();
                              },
                            });
                        } else {
                          // Profile doesn't exist anywhere - redirect to create
                          console.log(
                            "[DataLoader] Case B: Profile not found anywhere, redirecting..."
                          );
                          this.notifyService.showWarning("Profile not found. Please create one.");
                          window.location.href = "/profile/manage";
                          observer.next(null);
                          observer.complete();
                        }
                      },
                      error: (err2: Error) => {
                        console.log("[DataLoader] Cloud check error:", err2.message);
                        // Profile doesn't exist anywhere - redirect
                        console.log("[DataLoader] Case B: Cloud check failed, redirecting...");
                        this.notifyService.showWarning("Profile not found. Please create one.");
                        window.location.href = "/profile/manage";
                        observer.next(null);
                        observer.complete();
                      },
                    });
                }
              } else {
                console.log("[DataLoader] Unknown error:", errorMsg);
                observer.next(null);
              }
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

      console.log("[DataLoader] Created sharedTodos$ query, assignees filter:", currentUserId);

      const publicTodos$ = this.relationLoader.loadMany<Todo>(
        this.apiProvider,
        "todos",
        { visibility: "public" },
        ["category", "chats"],
        "public"
      );

      console.log("[DataLoader] Created publicTodos$ query, visibility filter: public");
      loadPromises.push(allProfiles$, sharedTodos$, publicTodos$);
      profileLabels.push("allProfiles", "sharedTodos", "publicTodos");
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
      } else if (!userProfile && currentUserId && currentUserId.trim()) {
        // Profile not loaded - check why and handle
        console.log("[DataLoader] Profile not loaded after API call, checking profile status...");
        const localProfile = this.storageService.profile();
        console.log("[DataLoader] localProfile from storage:", localProfile);
        if (!localProfile?.user_id) {
          // Check if we're already on a profile route
          const currentUrl = window.location.pathname;
          console.log("[DataLoader] Current URL:", currentUrl);
          if (!currentUrl.startsWith("/profile")) {
            console.log("[DataLoader] No profile anywhere, redirecting to /profile/manage");
            this.notifyService.showWarning("Profile not found. Please create one.");
            this.profileRequiredService.setProfileRequiredMode(true);
            this.router.navigate(["/profile/manage"]);
          } else {
            console.log(
              "[DataLoader] Already on profile route, setting profileRequiredMode anyway"
            );
            // Still need to hide header/bottom nav even if on profile route
            this.profileRequiredService.setProfileRequiredMode(true);
          }
        }
      }
      this.storageService.setLoaded(true);
      this.storageService.setLastLoaded(new Date());
    });

    // Load profiles and shared todos in background if enabled
    if (loadShared && loadPromises.length > 0) {
      console.log("[DataLoader] Loading shared data with", loadPromises.length, "promises");
      forkJoin(loadPromises)
        .pipe(
          catchError((error) => {
            console.error("[DataLoader] Shared error:", error);
            return of(loadPromises.map(() => null));
          })
        )
        .subscribe((results) => {
          console.log(
            "[DataLoader] Shared results:",
            results.map((r, i) => ({
              label: profileLabels[i],
              count: Array.isArray(r) ? r.length : 0,
              type: typeof r,
            }))
          );
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
              console.log(
                "[DataLoader] Setting sharedTodos:",
                Array.isArray(data) ? data.length : 0,
                data
              );
              this.storageService.setCollection("sharedTodos", data);
            } else if (label === "publicTodos" && data) {
              console.log(
                "[DataLoader] Setting publicTodos:",
                Array.isArray(data) ? data.length : 0,
                data
              );
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
