/* sys lib */
import { Injectable, inject } from "@angular/core";
import { take } from "rxjs/operators";
import { Router } from "@angular/router";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiService } from "@services/api.service";

@Injectable({
  providedIn: "root",
})
export class UserValidationService {
  private dataService = inject(ApiService);
  private jwtTokenService = inject(JwtTokenService);
  private notifyService = inject(NotifyService);
  private router = inject(Router);

  validateUserExistsInMongoDb(userId: string): void {
    this.dataService
      .get("users", userId, { visibility: "private" })
      .pipe(take(1))
      .subscribe({
        next: (user) => {
          if (!user || (Array.isArray(user) && user.length === 0)) {
            this.invalidateUserSession();
          }
        },
        error: (err: Error) => {
          const isNetworkError =
            err.message.includes("Failed to fetch") ||
            err.message.includes("NetworkError") ||
            err.message.includes("net::");
          const isBackendUnavailable =
            err.message.includes("Backend unavailable") ||
            err.message.includes("Connection refused");

          if (isNetworkError || isBackendUnavailable) {
          } else {
            this.invalidateUserSession();
          }
        },
      });
  }

  redirectToLogin(): void {
    this.router.navigate(["/login"]);
  }

  invalidateUserSession(): void {
    this.jwtTokenService.clearToken();
    this.notifyService.showWarning("Your account was deleted. Please login again.");

    setTimeout(() => {
      this.redirectToLogin();
    }, 1500);
  }
}
