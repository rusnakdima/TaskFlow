/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, Router, RouterStateSnapshot } from "@angular/router";
import { firstValueFrom } from "rxjs";

/* services */
import { StorageService } from "@services/core/storage.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";
import { AuthService } from "@services/auth/auth.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { NotifyService } from "@services/notifications/notify.service";
import { UserValidationService } from "@services/auth/user-validation.service";

/**
 * Initial Data Resolver - Cache-First, Non-Blocking Architecture
 *
 * Algorithm:
 * 1. Return cached data IMMEDIATELY (no blocking)
 * 2. Fire API calls in BACKGROUND (fire-and-forget)
 * 3. WS delivers live updates
 * 4. Profile redirect happens AFTER background loads confirm no profile
 *
 * This resolver NEVER blocks the UI. Data flows via:
 * - Cache (immediate)
 * - WS (real-time)
 * - API fallback (background seed)
 */
@Injectable({
  providedIn: "root",
})
export class InitialDataResolver implements Resolve<unknown> {
  private storageService = inject(StorageService);
  private profileRequiredService = inject(ProfileRequiredService);
  private authService = inject(AuthService);
  private jwtTokenService = inject(JwtTokenService);
  private dataLoaderService = inject(DataLoaderService);
  private notifyService = inject(NotifyService);
  private router = inject(Router);
  private userValidationService = inject(UserValidationService);

  private hasCachedData(): boolean {
    return (
      this.storageService.privateTodos().length > 0 ||
      this.storageService.sharedTodos().length > 0 ||
      this.storageService.categories().length > 0
    );
  }

  private hasValidProfile(): boolean {
    const profile = this.storageService.profile();
    return !!profile?.user_id;
  }

  async resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<unknown> {
    const targetUrl = state.url || this.router.url;

    if (targetUrl.startsWith("/profile")) {
      return { loaded: true, isProfileRoute: true };
    }

    const token = this.jwtTokenService.getToken();
    if (!token) {
      this.notifyService.showError("Error: Token not found");
      this.userValidationService.redirectToLogin();
      return { loaded: false, redirectToLogin: true };
    }

    const userId = this.authService.getValueByKey("id") ?? "";

    // IMMEDIATELY fire background loads (non-blocking)
    // Data will come via cache update + WS
    this.dataLoaderService.loadAllData();
    this.dataLoaderService.loadProfile();

    // Return immediately with current cache state
    // UI will update when cache changes via signals
    return {
      loaded: true,
      hasProfile: this.hasValidProfile(),
      fromCache: this.hasCachedData(),
      isEmpty: !this.hasCachedData(),
    };
  }
}
