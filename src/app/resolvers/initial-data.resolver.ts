/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, Router, RouterStateSnapshot } from "@angular/router";

/* services */
import { StorageService } from "@services/core/storage.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";
import { AuthService } from "@services/auth/auth.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { TodoRelations } from "@models/relations.config";

/**
 * Load all data from JSON DB in one batch (full relations), show it immediately,
 * then check profile. Profile is independent; backend assembles data via relations.
 *
 * Algorithm:
 * 1. Get all data (todos with tasks/subtasks/assignees/user, categories, profiles with user) in one parallel batch.
 * 2. Store in storage and show UI.
 * 3. After load: if current user's profile is missing/incomplete → redirect to create-profile and hide header/nav.
 */
@Injectable({
  providedIn: "root",
})
export class InitialDataResolver implements Resolve<unknown> {
  private storageService = inject(StorageService);
  private profileRequiredService = inject(ProfileRequiredService);
  private authService = inject(AuthService);
  private jwtTokenService = inject(JwtTokenService);
  private router = inject(Router);

  private static readonly LOAD_TIMEOUT_MS = 2000;

  private hasCachedData(): boolean {
    return (
      this.storageService.privateTodos().length > 0 ||
      this.storageService.sharedTodos().length > 0 ||
      this.storageService.categories().length > 0
    );
  }

  /** Profile is valid if it has name or user.username (for display). */
  private checkProfileSync(): boolean {
    const profile = this.storageService.profile();
    if (!profile) return false;
    const hasName = !!(profile.name || profile.lastName);
    const hasUsername = !!profile.user?.username;
    return hasName || hasUsername;
  }

  /** Run after data is in storage: redirect to create-profile and lock shell if profile invalid. */
  private runProfileCheckAfterLoad(): void {
    if (this.checkProfileSync()) {
      this.profileRequiredService.setProfileRequiredMode(false);
      return;
    }
    this.profileRequiredService.setProfileRequiredMode(true);
    this.router.navigate(["/profile/create-profile"]);
  }

  async resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<unknown> {
    // IMPORTANT: Use `state.url` (current navigation target), not `router.url` (can be stale
    // during redirects). Otherwise we can get stuck in a redirect loop and appear "frozen".
    const targetUrl = state.url || this.router.url;

    if (targetUrl.startsWith("/profile")) {
      // When user is on profile routes we must never block/redirect again from here.
      // The create-profile page must always load even when profile is missing.
      return { loaded: true, isProfileRoute: true };
    }

    const token = this.jwtTokenService.getToken();
    if (!token) {
      this.router.navigate(["/login"]);
      return { loaded: false, redirectToLogin: true };
    }

    const userId = this.authService.getValueByKey("id") ?? "";

    if (this.hasCachedData()) {
      this.storageService.setLoaded(true);
      this.runProfileCheckAfterLoad();
      return { loaded: true, hasProfile: this.checkProfileSync(), fromCache: true };
    }

    const loaded = await this.loadAllDataOnce(userId);
    this.storageService.setLoaded(true);
    if (loaded) {
      this.storageService.setLastLoaded(new Date());
    }
    this.runProfileCheckAfterLoad();

    return {
      loaded: true,
      hasProfile: this.checkProfileSync(),
      fromCache: false,
      isEmpty: !loaded,
    };
  }

  /**
   * One batch: load todos (full relations for assignees, tasks, subtasks), categories, profiles.
   * Backend stores IDs and assembles full objects via relations.
   */
  private async loadAllDataOnce(userId: string): Promise<boolean> {
    if (!userId) return false;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const t = InitialDataResolver.LOAD_TIMEOUT_MS;

      const invokeWithTimeout = async (args: Record<string, unknown>, timeoutMs: number) =>
        Promise.race([
          invoke<{ data?: unknown }>("manageData", args),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout")), timeoutMs)),
        ]);

      const loadAll = TodoRelations.loadAll;

      const [privateRes, teamOwnerRes, teamAssigneeRes, categoriesRes, profilesRes] =
        await Promise.all([
          invokeWithTimeout(
            {
              operation: "getAll",
              table: "todos",
              filter: { userId, visibility: "private", deleted_at: null },
              load: loadAll,
              syncMetadata: { isOwner: true, isPrivate: true },
            },
            t
          ).catch(() => null),
          invokeWithTimeout(
            {
              operation: "getAll",
              table: "todos",
              filter: { userId, visibility: "team", deleted_at: null },
              load: loadAll,
              syncMetadata: { isOwner: true, isPrivate: false },
            },
            t
          ).catch(() => null),
          invokeWithTimeout(
            {
              operation: "getAll",
              table: "todos",
              filter: { assignees: userId, visibility: "team", deleted_at: null },
              load: loadAll,
              syncMetadata: { isOwner: false, isPrivate: false },
            },
            t
          ).catch(() => null),
          invokeWithTimeout(
            {
              operation: "getAll",
              table: "categories",
              filter: { userId, deleted_at: null },
              syncMetadata: { isOwner: true, isPrivate: true },
            },
            t
          ).catch(() => null),
          invokeWithTimeout(
            {
              operation: "getAll",
              table: "profiles",
              filter: { userId },
              load: ["user"],
              syncMetadata: { isOwner: true, isPrivate: false },
            },
            t
          ).catch(() => null),
        ]);

      const privateTodos = (privateRes?.data as unknown[]) ?? [];
      const teamOwner = (teamOwnerRes?.data as unknown[]) ?? [];
      const teamAssignee = (teamAssigneeRes?.data as unknown[]) ?? [];
      const categories = (categoriesRes?.data as unknown[]) ?? [];
      const profiles = (profilesRes?.data as unknown[]) ?? [];

      if (privateTodos.length > 0) {
        this.storageService.setCollection("privateTodos", privateTodos as any);
      }
      const sharedMap = new Map<string, unknown>();
      [...teamOwner, ...teamAssignee].forEach((todo: any) => sharedMap.set(todo.id, todo));
      const sharedTodos = Array.from(sharedMap.values());
      if (sharedTodos.length > 0) {
        this.storageService.setCollection("sharedTodos", sharedTodos as any);
      }
      if (categories.length > 0) {
        this.storageService.setCollection("categories", categories as any);
      }
      const profileOne = Array.isArray(profiles) ? profiles[0] : profiles;
      if (profileOne) {
        this.storageService.setCollection("profiles", profileOne as any);
      }

      return (
        privateTodos.length > 0 || sharedTodos.length > 0 || categories.length > 0 || !!profileOne
      );
    } catch (e) {
      console.warn("[InitialDataResolver] loadAllDataOnce failed:", e);
      return false;
    }
  }
}
