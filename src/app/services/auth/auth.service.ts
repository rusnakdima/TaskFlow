/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, take, catchError, map } from "rxjs/operators";

/* models */

import { LoginForm, SignupForm, AuthResponse } from "@models/auth-forms.model";
import { PasswordReset } from "@models/password-reset.model";
import { OfflineAuthResult } from "@models/local-user.model";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* helpers */
import { isNetworkError } from "@helpers/network-error.helper";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";
import { StorageService } from "@services/core/storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { UserValidationService } from "@services/auth/user-validation.service";
import { Router } from "@angular/router";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private dataSyncProvider = inject(ApiProvider);
  private jwtTokenService = inject(JwtTokenService);

  private dataSyncService = inject(DataLoaderService);
  private profileRequiredService = inject(ProfileRequiredService);
  private storageService = inject(StorageService);
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
        error: (err: any) => {
          if (isNetworkError(err)) {
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
    localStorage.removeItem("token");
    window.location.reload();
  }

  /**
   * Full logout - clear all local user data
   */
  logoutAll() {
    localStorage.removeItem("token");
    window.location.reload();
  }

  /**
   * Single source of truth for auth status.
   */
  isLoggedIn(): boolean {
    const token = this.getToken();
    return !!token && !this.jwtTokenService.isTokenExpired(token);
  }

  getTokenLS(): string | null {
    return localStorage.getItem("token");
  }

  getTokenSS(): string | null {
    return sessionStorage.getItem("token");
  }

  getToken(): string | null {
    return this.getTokenLS() || this.getTokenSS();
  }

  hasRole(role: string): boolean {
    const token = this.getToken();
    return token ? this.jwtTokenService.hasRole(token, role) : false;
  }

  getValueByKey(key: string): any {
    const token = this.getToken();
    if (key === "username") {
      return this.jwtTokenService.getUsername(token);
    }
    if (key === "role") {
      return this.jwtTokenService.getRole(token);
    }
    return token ? this.jwtTokenService.getValueByKey(token, key) : null;
  }

  /**
   * Export current user's data for backup/transfer
   * Not available in offline-first disabled mode
   */
  exportUserData(): string | null {
    return null;
  }

  /**
   * Import user data for offline authentication
   * Not available in offline-first disabled mode
   */
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

    // 2. Valid Session Path
    const userId = this.jwtTokenService.getUserId(token);

    if (userId) {
      this.userValidationService.validateUserExistsInMongoDb(userId);
      this.loadUserData();
    }

    // Background sync
    this.dataSyncService.loadAllData();
    this.checkTokenWithBackend(token);

    // 3. Profile Requirement Check
    // Profile check
    const cachedProfile = this.storageService.profile();
    if (!cachedProfile) {
      this.dataSyncService
        .loadProfile()
        .pipe(take(1))
        .subscribe((profile) => {
          if (!profile) {
            this.profileRequiredService.setProfileRequiredMode(true);
            if (!this.router.url.startsWith("/profile/create-profile")) {
              this.router.navigate(["/profile/create-profile"]);
            }
          }
        });
    }
  }

  /**
   * Load current user data from backend or cache
   */
  loadUserData(): void {
    const userId = this.getValueByKey("id");
    if (!userId) return;

    // Check if already loaded
    const currentUser = this.storageService.user();
    if (currentUser && currentUser.id === userId) return;

    // Load from backend
    this.dataSyncProvider
      .crud<any>("get", "users", { id: userId, isOwner: true, isPrivate: true })
      .pipe(take(1))
      .subscribe({
        next: (user) => {
          if (user) {
            this.storageService.setCollection("user", user);
          }
        },
        error: (err) => {
          console.warn("Failed to load user data:", err);
        },
      });
  }

  /**
   * Check token with backend in background (non-blocking)
   */
  private checkTokenWithBackend(token: string): void {
    this.checkToken(token).subscribe({
      error: () => {
        // Backend check failed - token might be invalid but we already loaded data
      },
    });
  }
}
