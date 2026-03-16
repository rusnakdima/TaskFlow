/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Resolve, Router } from "@angular/router";
import { firstValueFrom, forkJoin, of, catchError, timeout, defer } from "rxjs";
import { invoke } from "@tauri-apps/api/core";

/* services */
import { DataSyncService } from "@services/data/data-sync.service";
import { StorageService } from "@services/core/storage.service";
import { AuthService } from "@services/auth/auth.service";
import { DataSyncProvider } from "@providers/data-sync.provider";

/* helpers */
import { RelationsHelper } from "@helpers/relations.helper";

/**
 * Resolver that ensures all application data is loaded before routes activate
 * Loads from local JSON database first, then syncs with cloud
 */
@Injectable({
  providedIn: "root",
})
export class InitialDataResolver implements Resolve<any> {
  private dataSyncService = inject(DataSyncService);
  private storageService = inject(StorageService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private dataSyncProvider = inject(DataSyncProvider);

  /**
   * Check profile SYNCHRONOUSLY from storage
   * Profile is valid if it has name OR user.username
   */
  private checkProfileSync(): boolean {
    const profile = this.storageService.profile();

    if (!profile) {
      console.log("Profile check: no profile");
      return false;
    }

    // Check if profile has required fields (either name OR user.username)
    const hasName = !!(profile.name || profile.lastName);
    const hasUser = !!profile.user;
    const hasUsername = !!profile.user?.username;
    const isValid = hasName || hasUsername;

    console.log("Profile check:", {
      hasProfile: true,
      hasName,
      hasUser,
      hasUsername,
      isValid,
    });

    return isValid;
  }

  async resolve(): Promise<any> {
    const userId = this.authService.getValueByKey("id");
    const currentRoute = this.router.url;

    // Don't block profile routes - they don't need data loaded
    if (currentRoute.startsWith("/profile")) {
      console.log("Profile route - skipping data load");
      return { loaded: true, isProfileRoute: true };
    }

    // FIRST: Try to load from local JSON database (fast, works offline)
    // Use direct Tauri invoke to avoid WebSocket delay
    await this.loadFromLocalJsonDirect(userId);

    // Check if we have profile synchronously
    const hasProfile = this.checkProfileSync();
    const hasTodos = this.storageService.privateTodos().length > 0;

    console.log("After local JSON load:", { hasTodos, hasProfile });

    // If we have both todos and profile from local JSON, we're done
    if (hasTodos && hasProfile) {
      this.storageService.setLoaded(true);
      console.log("✓ Using cached data and profile");
      return { loaded: true, hasProfile: true };
    }

    // If we have todos but no profile, allow navigation (profile might be incomplete in local JSON)
    if (hasTodos && !hasProfile) {
      this.storageService.setLoaded(true);
      console.log("Have todos, proceeding without complete profile");
      return { loaded: true, hasProfile: false };
    }

    // No local data at all - must load from network
    console.log("No local data, loading from network...");
    try {
      await firstValueFrom(
        forkJoin({
          data: this.dataSyncService.loadAllData(true),
          profile: this.dataSyncService.loadProfile().pipe(
            timeout(3000),
            catchError(() => of(null))
          ),
        }).pipe(
          catchError((error) => {
            console.warn("Network data load failed:", error);
            return of({ data: null, profile: null });
          })
        )
      );

      if (this.checkProfileSync()) {
        return { loaded: true, hasProfile: true };
      }

      // No profile after network load - allow navigation anyway
      // User can create profile later
      console.log("No profile found, but allowing navigation");
      return { loaded: true, hasProfile: false };
    } catch (error) {
      console.warn("Initial data loading failed:", error);
      // Even if network fails, allow route activation
      return { loaded: false, error };
    }
  }

  /**
   * Load data from local JSON database using DIRECT Tauri invoke
   * This bypasses WebSocket and goes straight to local JSON
   */
  private async loadFromLocalJsonDirect(userId: string | null): Promise<boolean> {
    if (!userId) return false;

    try {
      console.log("Loading from local JSON for userId:", userId);

      // Get relations for each entity
      const todoRelations = RelationsHelper.getTodoRelationsWithUser();
      const profileRelations = RelationsHelper.getProfileRelations();

      // Use direct Tauri invoke to manageData with isPrivate metadata
      const [privateTodos, categories, profiles] = await Promise.all([
        this.invokeLocalCrud(
          "todos",
          { userId, visibility: "private", isDeleted: false },
          todoRelations
        ),
        this.invokeLocalCrud("categories", { userId, isDeleted: false }, []),
        this.invokeLocalCrud("profiles", { userId }, profileRelations),
      ]);

      console.log("Local JSON load result:", {
        todosCount: privateTodos?.length || 0,
        categoriesCount: categories?.length || 0,
        profileFound: profiles?.length > 0,
      });

      // Store in StorageService
      if (privateTodos && privateTodos.length > 0) {
        this.storageService.setCollection("privateTodos", privateTodos);
      }
      if (categories && categories.length > 0) {
        this.storageService.setCollection("categories", categories);
      }
      if (profiles && profiles.length > 0) {
        console.log("Profile loaded from local JSON:", profiles[0]);
        this.storageService.setCollection("profiles", profiles[0]);
      }

      const hasData = privateTodos.length > 0 || categories.length > 0;

      if (hasData) {
        this.storageService.setLoaded(true);
        this.storageService.setLastLoaded(new Date());
        console.log("✓ Loaded from local JSON database");
      }

      return hasData;
    } catch (error) {
      console.warn("Failed to load from local JSON:", error);
      return false;
    }
  }

  /**
   * Direct invoke to manageData command for local JSON
   */
  private async invokeLocalCrud(table: string, filter: any, relations: any[] = []): Promise<any[]> {
    try {
      const result = await invoke<any>("manageData", {
        operation: "getAll",
        table,
        filter,
        syncMetadata: { isOwner: true, isPrivate: true },
        relations,
      });
      return result?.data || [];
    } catch (error) {
      console.warn(`Failed to load ${table} from local JSON:`, error);
      return [];
    }
  }
}
