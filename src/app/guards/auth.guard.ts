/* sys lib */
import { Injectable, inject } from "@angular/core";
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  CanActivateChildFn,
  CanActivateFn,
} from "@angular/router";

/* services */
import { AuthService } from "@services/auth/auth.service";

@Injectable({
  providedIn: "root",
})
class AuthGuard {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
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
        this.router.navigate(["/login"], {
          queryParams: { returnUrl: state.url },
        });
        return false;
      }
    } else {
      this.router.navigate(["/login"], {
        queryParams: { returnUrl: state.url },
      });
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

export const canActivateChildAuth: CanActivateChildFn = (
  next: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): boolean => {
  return inject(AuthGuard).canActivate(next, state);
};
