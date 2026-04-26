/* sys lib */
import { Injectable, inject } from "@angular/core";
import { take } from "rxjs/operators";
import { Router } from "@angular/router";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { NotifyService } from "@services/notifications/notify.service";

@Injectable({
  providedIn: "root",
})
export class UserValidationService {
  private dataSyncProvider = inject(ApiProvider);
  private jwtTokenService = inject(JwtTokenService);
  private notifyService = inject(NotifyService);
  private router = inject(Router);

  validateUserExistsInMongoDb(userId: string): void {
    this.dataSyncProvider
      .crud<any>("get", "users", { id: userId, isOwner: true, isPrivate: true })
      .pipe(take(1))
      .subscribe({
        next: (user) => {
          if (!user || (Array.isArray(user) && user.length === 0)) {
            console.warn("User not found in MongoDB, invalidating session for user:", userId);
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
            console.warn("User validation skipped: MongoDB unavailable", err.message);
          } else {
            console.warn("User not found in MongoDB, invalidating session for user:", userId);
            this.invalidateUserSession();
          }
        },
      });
  }

  redirectToLogin(): void {
    this.router.navigate(["/login"]);
  }

  invalidateUserSession(): void {
    const token = this.jwtTokenService.getToken();
    const userId = token ? this.jwtTokenService.getUserId(token) : null;

    localStorage.removeItem("token");
    sessionStorage.removeItem("token");

    this.notifyService.showWarning("Your account was deleted. Please login again.");

    setTimeout(() => {
      this.redirectToLogin();
    }, 1500);
  }
}
