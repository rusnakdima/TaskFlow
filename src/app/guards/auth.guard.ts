/* sys lib */
import { Injectable, inject } from "@angular/core";
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  CanActivateFn,
  Router,
} from "@angular/router";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { UserValidationService } from "@services/auth/user-validation.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";

@Injectable({
  providedIn: "root",
})
class AuthGuard {
  private readonly router = inject(Router);

  constructor(
    private authService: AuthService,
    private userValidationService: UserValidationService,
    private profileRequiredService: ProfileRequiredService
  ) {}

  canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean {
    if (
      this.profileRequiredService.profileRequiredMode() &&
      !route.url.some((u) => u.path === "profile")
    ) {
      this.router.navigate(["/profile/manage"]);
      return false;
    }

    if (this.authService.isLoggedIn()) {
      const requiredRoles = route.data["expectedRoles"];
      if (!requiredRoles) {
        return true;
      } else {
        for (const role of requiredRoles) {
          if (this.authService.hasRole(role)) {
            return true;
          }
        }
        this.userValidationService.redirectToLogin();
        return false;
      }
    } else {
      this.userValidationService.redirectToLogin();
      return false;
    }
  }
}

export const canActivateAuth: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): boolean => {
  return inject(AuthGuard).canActivate(route, state);
};
