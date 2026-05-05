/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, take, catchError } from "rxjs/operators";

/* models */
import { LoginForm, SignupForm, AuthResponse } from "@models/auth-forms.model";
import { PasswordReset } from "@models/password-reset.model";
import { OfflineAuthResult } from "@models/local-user.model";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* helpers */
import { NetworkErrorHelper } from "@helpers/network-error.helper";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";
import { DataService } from "@services/data/data.service";
import { NotifyService } from "@services/notifications/notify.service";
import { UserValidationService } from "@services/auth/user-validation.service";
import { Router } from "@angular/router";

// ARCHITECTURAL NOTE: AuthService is a god service that handles authentication, user management,
// token handling, and profile operations. Future refactoring should split these responsibilities
// into dedicated services (AuthService → AuthService + TokenService + UserService).
@Injectable({
  providedIn: "root",
})
export class AuthService {
  private dataSyncProvider = inject(ApiProvider);
  private jwtTokenService = inject(JwtTokenService);

  private dataSyncService = inject(DataLoaderService);
  private profileRequiredService = inject(ProfileRequiredService);
  private dataService = inject(DataService);
  private notifyService = inject(NotifyService);
  private router = inject(Router);
  private userValidationService = inject(UserValidationService);

  /**
   * Check if token is valid on backend
   */
  checkToken<R>(token: string): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("check_token", { token });
  }

  /**
   * Perform online login
   */
  async loginWithOfflineFirst(loginData: LoginForm): Promise<{
    token: string;
    requiresDataSync: boolean;
    isOffline: boolean;
  }> {
    return new Promise((resolve, reject) => {
      this.performOnlineLogin(loginData).subscribe({
        next: (authResponse: AuthResponse) => {
          resolve({
            token: authResponse.token,
            requiresDataSync: true,
            isOffline: false,
          });
        },
        error: (err: Error) => {
          if (NetworkErrorHelper.isNetworkError(err)) {
            reject(new Error("No internet connection. Please login online first."));
          } else {
            reject(err);
          }
        },
      });
    });
  }

  /**
   * Perform online login
   */
  private performOnlineLogin(loginData: LoginForm): Observable<AuthResponse> {
    return this.dataSyncProvider
      .invokeCommand<AuthResponse>("login", { loginForm: loginData })
      .pipe(
        tap((authResponse: AuthResponse) => {
          this.loadUserData();
        })
      );
  }

  login<R>(loginData: LoginForm): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("login", { loginForm: loginData });
  }

  signup<R>(signupData: SignupForm): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("register", { signupForm: signupData }).pipe(
      tap((authResponse: R) => {
        const authData = authResponse as unknown as AuthResponse;
        const tokenStr = authData.token;
        const userId = this.jwtTokenService.getUserId(tokenStr);
        const username = this.jwtTokenService.getValueByKey(tokenStr, "username");
        const email = this.jwtTokenService.getValueByKey(tokenStr, "email");
        const role = this.jwtTokenService.getRole(tokenStr);

        // No longer storing user data for offline auth
        this.loadUserData();
      })
    );
  }

  requestPasswordReset<R>(email: string): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("requestPasswordReset", { email });
  }

  verifyCode<R>(email: string, code: string): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("verifyCode", { email, code });
  }

  resetPassword<R>(passwordReset: PasswordReset): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("resetPassword", { resetData: passwordReset });
  }

  logout() {
    this.jwtTokenService.clearToken();
    window.location.reload();
  }

  /**
   * Full logout - clear all local user data
   */
  logoutAll() {
    this.jwtTokenService.clearToken();
    window.location.reload();
  }

  /**
   * Single source of truth for auth status.
   */
  isLoggedIn(): boolean {
    return this.jwtTokenService.isLoggedIn();
  }

  getToken(): string | null {
    return this.jwtTokenService.getToken();
  }

  hasRole(role: string): boolean {
    const token = this.getToken();
    return token ? this.jwtTokenService.hasRole(token, role) : false;
  }

getValueByKey(key: string): string {
    const token = this.getToken();
    if (key === "username") {
      return this.jwtTokenService.getUsername(token) ?? "";
    }
    if (key === "role") {
      return this.jwtTokenService.getRole(token) ?? "";
    }
    return this.jwtTokenService.getValueByKey(token, key) ?? "";
  }

  exportUserData(): string | null {
    return null;
  }

  importUserData(userData: string): { success: boolean; error?: string } {
    return { success: false, error: "Offline authentication disabled" };
  }

  /**
   * Initialize user session from stored token
   * Handles both valid and expired tokens with offline fallback
   * This logic no longer navigates; it prepares data for authenticated users.
   */
  initializeSession(
    authRoutes: string[] = ["/login", "/signup", "/reset-password", "/change-password"]
  ): void {
    const token = this.getToken();
    const isAuthPage = authRoutes.some((route) => this.router.url.startsWith(route));
    const isTokenExpired = this.jwtTokenService.isTokenExpired(token);

    // 1. Handle Missing or Expired Session
    if (!token || isTokenExpired) {
      if (!isAuthPage) {
        if (token) {
          this.notifyService.showWarning("Session expired - please login again");
        }
        this.userValidationService.redirectToLogin();
      }
      return;
    }

    // 2. Valid JWT - now verify user exists in backend
    const userId = this.jwtTokenService.getUserId(token);
    if (!userId) {
      this.userValidationService.invalidateUserSession();
      return;
    }

    // Check token validity against user record in database
    this.checkToken<any>(token)
      .pipe(take(1))
      .subscribe({
        next: (response: any) => {
          // Token valid and user exists - session init complete
          // Data loading is handled by DataLoaderService on app init
        },
        error: (err: Error) => {
          // Token invalid or user not found - clear session and redirect
          this.userValidationService.invalidateUserSession();
        },
      });
  }

  /**
   * Load current user data from backend or cache
   */
  loadUserData(): void {
    const userId = this.getValueByKey("id");
    if (!userId) return;

    // Load from backend via DataService
    this.dataService
      .getEntitiesByType("users", { filter: { id: userId, visibility: "private" } })
      .pipe(take(1))
      .subscribe({
        next: (users) => {
          if (users && users.length > 0) {
            // Data is loaded through DataLoaderService cache updates
          }
        },
        error: (err) => {},
      });
  }
}
