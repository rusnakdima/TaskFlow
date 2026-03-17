/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Resolve, Router } from "@angular/router";
import { of, firstValueFrom, forkJoin, catchError, timeout } from "rxjs";

/* services */
import { DataSyncService } from "@services/data/data-sync.service";
import { StorageService } from "@services/core/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";

/* helpers */
import { NetworkErrorHelper } from "@helpers/network-error.helper";

/**
 * Resolver that ensures all application data is loaded before routes activate
 * OFFLINE-FIRST: App starts immediately with cached data, syncs in background
 *
 * Loading Strategy:
 * 1. Check if storage already has data (from previous session) - use immediately
 * 2. Load from local JSON without relations (fast, works offline)
 * 3. Background sync loads full data with relations when network available
 */
@Injectable({
  providedIn: "root",
})
export class InitialDataResolver implements Resolve<any> {
  private dataSyncService = inject(DataSyncService);
  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private jwtTokenService = inject(JwtTokenService);
  private router = inject(Router);

  /**
   * Check if we have sufficient data in storage from previous session
   */
  private hasCachedData(): boolean {
    const hasTodos = this.storageService.privateTodos().length > 0;
    const hasCategories = this.storageService.categories().length > 0;
    return hasTodos || hasCategories;
  }

  /**
   * Check profile synchronously from storage
   * Profile is valid if it has name OR user.username
   */
  private checkProfileSync(): boolean {
    const profile = this.storageService.profile();
    if (!profile) return false;

    const hasName = !!(profile.name || profile.lastName);
    const hasUsername = !!profile.user?.username;
    return hasName || hasUsername;
  }

  async resolve(): Promise<any> {
    const currentRoute = this.router.url;

    // Don't block profile routes - they don't need data loaded
    if (currentRoute.startsWith("/profile")) {
      return { loaded: true, isProfileRoute: true };
    }

    // ✅ STEP 1: Check if user is authenticated (has valid token)
    const token = this.jwtTokenService.getToken();

    if (!token) {
      // No token - redirect to login
      this.router.navigate(["/login"]);
      return { loaded: false, redirectToLogin: true };
    }

    // ✅ STEP 2: Check if we already have data in storage (from previous session)
    if (this.hasCachedData()) {
      this.storageService.setLoaded(true);

      // Trigger one background sync after delay to keep data fresh
      this.triggerBackgroundSync();

      return { loaded: true, hasProfile: this.checkProfileSync(), fromCache: true };
    }

    // ✅ STEP 3: Load from local JSON and then sync
    const userId = this.authService.getValueByKey("id");

    // Load from local JSON first, then trigger sync
    this.loadFromLocalJsonSimple(userId)
      .then((hasData: boolean) => {
        if (hasData) {
          this.storageService.setLoaded(true);
          this.storageService.setLastLoaded(new Date());
        }

        // ALWAYS trigger background sync after local load attempt
        // This will load relations and sync from network
        this.triggerBackgroundSync(2000); // Slightly longer delay if we just loaded from JSON
      })
      .catch((err: any) => {
        console.warn("[InitialDataResolver] Local JSON load failed:", err);
        this.triggerBackgroundSync(500); // Trigger sync quickly if local load failed
      });

    // ✅ CRITICAL: Always allow navigation immediately, even with empty storage
    // User can work with empty state or create new data while background sync runs
    this.storageService.setLoaded(true);

    return {
      loaded: true,
      hasProfile: this.checkProfileSync(),
      fromCache: false,
      isEmpty: true,
      note: "Loading data in background...",
    };
  }

  /**
   * Load data from local JSON WITHOUT relations (fast, offline-safe)
   * This loads base entities only - relations are loaded on-demand by views
   * Profile loads WITHOUT user relation to avoid MongoDB dependency
   */
  private async loadFromLocalJsonSimple(userId: string | null): Promise<boolean> {
    if (!userId) {
      return false;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");

      // Helper to invoke with individual timeout
      const invokeWithTimeout = async (args: any, timeoutMs: number = 1500): Promise<any> => {
        return Promise.race([
          invoke<any>("manageData", args),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs)),
        ]);
      };

      // Load each entity independently with individual timeouts
      // Include tasks/subtasks relations so the initial render shows task data immediately
      const todoLoad = ["tasks", "tasks.subtasks", "tasks.comments", "tasks.subtasks.comments"];

      const [privateTodosRes, teamTodosRes, categoriesRes, profilesRes] = await Promise.all([
        invokeWithTimeout(
          {
            operation: "getAll",
            table: "todos",
            filter: { userId, visibility: "private", isDeleted: false },
            load: todoLoad,
            syncMetadata: { isOwner: true, isPrivate: true },
          },
          3000
        ),
        invokeWithTimeout(
          {
            operation: "getAll",
            table: "todos",
            filter: { visibility: "team", isDeleted: false },
            load: todoLoad,
            syncMetadata: { isOwner: false, isPrivate: false },
          },
          3000
        ),
        invokeWithTimeout(
          {
            operation: "getAll",
            table: "categories",
            filter: { userId, isDeleted: false },
            syncMetadata: { isOwner: true, isPrivate: true },
          },
          3000
        ),
        invokeWithTimeout(
          {
            operation: "getAll",
            table: "profiles",
            filter: { userId },
            load: ["user"],
            syncMetadata: { isOwner: true, isPrivate: true },
          },
          3000
        ),
      ]);

      const privateTodos = privateTodosRes?.data || [];
      const teamTodos = teamTodosRes?.data || [];
      const categories = categoriesRes?.data || [];
      const profiles = profilesRes?.data || [];

      // Store in storage
      if (privateTodos && privateTodos.length > 0) {
        this.storageService.setCollection("privateTodos", privateTodos);
      }
      if (teamTodos && teamTodos.length > 0) {
        this.storageService.setCollection("sharedTodos", teamTodos);
      }
      if (categories && categories.length > 0) {
        this.storageService.setCollection("categories", categories);
      }
      if (profiles && profiles.length > 0) {
        this.storageService.setCollection("profiles", profiles[0] || profiles);
      }

      return privateTodos.length > 0 || categories.length > 0 || profiles.length > 0;
    } catch (error) {
      console.warn("Local JSON load failed or timed out:", error);
      return false;
    }
  }

  /**
   * Trigger ONE background synchronization to load full data with relations
   */
  private triggerBackgroundSync(delayMs: number = 1000): void {
    setTimeout(() => {
      // Load all data with relations from network/local
      this.dataSyncService.loadAllData(true).subscribe({
        next: () => {
          this.storageService.setLoaded(true);
          this.storageService.setLastLoaded(new Date());
        },
        error: (err) => {
          console.warn("[InitialDataResolver] Background data sync failed:", err);
        },
      });

      // Load profile with user data
      this.dataSyncService.loadProfile().subscribe({
        next: () => {},
        error: (err) => {
          console.warn("[InitialDataResolver] Background profile sync failed:", err);
        },
      });
    }, delayMs);
  }
}
