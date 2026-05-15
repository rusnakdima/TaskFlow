/* sys lib */
import { Injectable, inject } from "@angular/core";
import { ActivatedRouteSnapshot, Resolve, Router, RouterStateSnapshot } from "@angular/router";
import { Observable, lastValueFrom } from "rxjs";

/* services */
import { ApiService } from "@services/api.service";
import { AuthService } from "@services/auth/auth.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { StorageService } from "@services/storage.service";
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
  private authService = inject(AuthService);
  private jwtTokenService = inject(JwtTokenService);
  private storageService = inject(StorageService);
  private notifyService = inject(NotifyService);
  private router = inject(Router);
  private userValidationService = inject(UserValidationService);
  private apiService = inject(ApiService);

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

  private loadProfileInBackground(): Observable<boolean> {
    return new Observable((observer) => {
      if (this.hasValidProfile()) {
        observer.next(true);
        observer.complete();
        return;
      }

      const userId = this.authService.getValueByKey("id");
      if (!userId) {
        observer.next(false);
        observer.complete();
        return;
      }

      this.apiService.profiles
        .getAll({
          visibility: "private",
          filter: { user_id: userId },
          load: ["user"],
        })
        .subscribe({
          next: (profiles) => {
            if (profiles && profiles.length > 0) {
              this.storageService.setCollection("profiles", profiles[0]);
              if ((profiles[0] as any).user) {
                this.storageService.setCollection("user", (profiles[0] as any).user);
              }
              observer.next(true);
            } else {
              observer.next(false);
            }
            observer.complete();
          },
          error: () => {
            observer.next(false);
            observer.complete();
          },
        });
    });
  }

  async resolve(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<unknown> {
    const targetUrl = state.url || this.router.url;

    if (targetUrl.startsWith("/profile")) {
      if (targetUrl === "/profile/manage") {
        const hasProfile = await lastValueFrom(this.loadProfileInBackground());
        if (hasProfile) {
          this.router.navigate(["/profile"]);
          return { loaded: true, redirectToProfile: true };
        }
      }
      return { loaded: true, isProfileRoute: true };
    }

    const token = this.jwtTokenService.getToken();
    if (!token) {
      this.notifyService.showError("Error: Token not found");
      this.userValidationService.redirectToLogin();
      return { loaded: false, redirectToLogin: true };
    }

    const hasProfile = await lastValueFrom(this.loadProfileInBackground());

    if (!hasProfile && !targetUrl.startsWith("/profile")) {
      this.router.navigate(["/profile/manage"]);
    }

    return {
      loaded: true,
      hasProfile,
      fromCache: this.hasCachedData(),
      isEmpty: !this.hasCachedData(),
    };
  }
}
