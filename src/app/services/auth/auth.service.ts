/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { tap, take } from "rxjs/operators";

/* models */

import { LoginForm, SignupForm } from "@models/auth-forms.model";
import { PasswordReset } from "@models/password-reset.model";
import { OfflineAuthResult } from "@models/local-user.model";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* helpers */
import { isNetworkError } from "@helpers/network-error.helper";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { LocalAuthService } from "@services/auth/local-auth.service";
import { DataLoaderService } from "@services/data/data-loader.service";
import { ProfileRequiredService } from "@services/core/profile-required.service";
import { StorageService } from "@services/core/storage.service";
import { NotifyService } from "@services/notifications/notify.service";
import { Router } from "@angular/router";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private dataSyncProvider = inject(ApiProvider);
  private jwtTokenService = inject(JwtTokenService);
  private localAuthService = inject(LocalAuthService);
  private dataSyncService = inject(DataLoaderService);
  private profileRequiredService = inject(ProfileRequiredService);
  private storageService = inject(StorageService);
  private notifyService = inject(NotifyService);
  private router = inject(Router);

  /**
   * Check if token is valid on backend
   */
  checkToken<R>(token: string): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("checkToken", { token });
  }

  /**
   * Attempt offline-first authentication
   * ALWAYS checks local storage first, then tries cloud
   */
  async loginWithOfflineFirst(
    loginData: LoginForm
  ): Promise<{ token: string; requiresDataSync: boolean; isOffline: boolean }> {
    // STEP 1: Always check local storage FIRST
    const offlineResult = await this.localAuthService.authenticateOffline(loginData);

    // STEP 2: If offline auth succeeded with cached token, use it immediately
    if (offlineResult.success && offlineResult.token) {
      return {
        token: offlineResult.token,
        requiresDataSync: true,
        isOffline: true,
      };
    }

    // STEP 3: User found locally but needs online auth (no cached token or incomplete data)
    // OR user not found locally - try online either way
    return new Promise((resolve, reject) => {
      this.performOnlineLogin(loginData).subscribe({
        next: (token: string) => {
          // ✅ Online login successful
          resolve({
            token,
            requiresDataSync: true,
            isOffline: false,
          });
        },
        error: (err: any) => {
          // ❌ Online login failed - check why
          if (isNetworkError(err)) {
            // Network error - check if we have local user data
            if (offlineResult.user && offlineResult.user.availableForOffline) {
              // ✅ User exists locally with valid credentials - allow offline login
              // Use cached token even if it might be expired (better than nothing)
              const tokenToUse = offlineResult.user.lastToken || "";

              if (tokenToUse) {
                resolve({
                  token: tokenToUse,
                  requiresDataSync: true,
                  isOffline: true,
                });
              } else {
                // User exists locally but no token - can't login without network
                reject(
                  new Error(
                    "No internet connection. User data exists but no cached token available."
                  )
                );
              }
            } else {
              // ❌ No local user data - can't login offline
              reject(
                new Error(
                  "No internet connection. Please login online first to enable offline access."
                )
              );
            }
          } else {
            // Not a network error - actual authentication failure (wrong password, etc.)
            reject(err);
          }
        },
      });
    });
  }

  /**
   * Perform online login and store user data for future offline auth
   */
  private performOnlineLogin(loginData: LoginForm): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("login", { loginForm: loginData }).pipe(
      tap((token: string) => {
        // Store user data for future offline auth
        // Extract user info from token
        const userId = this.jwtTokenService.getUserId(token);
        const username = this.jwtTokenService.getValueByKey(token, "username");
        const email = this.jwtTokenService.getValueByKey(token, "email");
        const role = this.jwtTokenService.getRole(token);

        if (userId && username && email) {
          this.localAuthService.storeUserDataAfterAuth(
            userId,
            username,
            email,
            loginData.password, // Store password hash for offline auth
            role || "user",
            token
          );
        }
      })
    );
  }

  login<R>(loginData: LoginForm): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("login", { loginForm: loginData });
  }

  signup<R>(signupData: SignupForm): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("register", { signupForm: signupData }).pipe(
      tap((token: R) => {
        // Store user data for future offline auth after successful signup
        const tokenStr = token as unknown as string;
        const userId = this.jwtTokenService.getUserId(tokenStr);
        const username = this.jwtTokenService.getValueByKey(tokenStr, "username");
        const email = this.jwtTokenService.getValueByKey(tokenStr, "email");
        const role = this.jwtTokenService.getRole(tokenStr);

        if (userId && username && email) {
          this.localAuthService.storeUserDataAfterAuth(
            userId,
            username,
            email,
            signupData.password,
            role || "user",
            tokenStr
          );
        }
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
    sessionStorage.removeItem("token");
    // Keep local user data for future offline auth
    // Clear only the current session
    this.localAuthService.clearCurrentUser();
    window.location.reload();
  }

  /**
   * Full logout - clear all local user data
   */
  logoutAll() {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    this.localAuthService.clearAllUserData();
    window.location.reload();
  }

  isLoggedIn() {
    const tokenLS = this.getTokenLS();
    const tokenSS = this.getTokenSS();

    if (
      !this.jwtTokenService.isTokenExpired(tokenLS) ||
      !this.jwtTokenService.isTokenExpired(tokenSS)
    ) {
      return true;
    }
    if (this.jwtTokenService.isTokenExpired(tokenLS)) {
      localStorage.removeItem("token");
      return false;
    } else if (this.jwtTokenService.isTokenExpired(tokenSS)) {
      sessionStorage.removeItem("token");
      return false;
    }
    return false;
  }

  /**
   * Check if user can authenticate offline
   */
  canAuthenticateOffline(): boolean {
    return this.localAuthService.hasOfflineUsers();
  }

  /**
   * Get list of users available for offline auth
   */
  getOfflineAvailableUsers(): Array<{ id: string; username: string; email: string }> {
    return this.localAuthService.getOfflineAvailableUsers();
  }

  getTokenLS() {
    return localStorage.getItem("token");
  }

  getTokenSS() {
    return sessionStorage.getItem("token");
  }

  getToken() {
    return this.getTokenLS() || this.getTokenSS();
  }

  hasRole(role: string) {
    const token = this.getToken();
    return this.jwtTokenService.hasRole(token, role);
  }

  getValueByKey(key: string) {
    const token = this.getToken();
    return this.jwtTokenService.getValueByKey(token, key);
  }

  /**
   * Export current user's data for backup/transfer
   */
  exportUserData(): string | null {
    const userId = this.getValueByKey("id");
    if (!userId) return null;
    return this.localAuthService.exportUserData(userId);
  }

  /**
   * Import user data for offline authentication
   */
  importUserData(userData: string): { success: boolean; error?: string } {
    return this.localAuthService.importUserData(userData);
  }

  /**
   * Initialize user session from stored token
   * Handles both valid and expired tokens with offline fallback
   */
  initializeSession(
    authRoutes: string[] = ["/login", "/signup", "/reset-password", "/change-password"]
  ): void {
    const token = this.getToken();

    if (!token) {
      // No token - check if we can authenticate offline
      setTimeout(() => {
        if (!authRoutes.some((route) => this.router.url.startsWith(route))) {
          if (this.canAuthenticateOffline()) {
            this.notifyService.showInfo("Offline authentication available - please login");
          }
          this.router.navigate(["/login"]);
        }
      }, 1000);
      return;
    }

    // Token exists - validate it
    const isTokenExpired = this.jwtTokenService.isTokenExpired(token);

    if (!isTokenExpired) {
      // Token is valid locally - load data
      this.dataSyncService.loadAllData();

      const cachedProfile = this.storageService.profile();
      if (cachedProfile?.userId) {
        return;
      }

      this.dataSyncService.loadProfile().pipe(take(1)).subscribe((profile) => {
        if (!profile) {
          this.profileRequiredService.setProfileRequiredMode(true);
          if (window.location.pathname !== "/profile/create-profile") {
            window.location.href = "/profile/create-profile";
          }
        }
      });
      this.checkTokenWithBackend(token);
    } else {
      // Token expired - try offline auth
      const userId = this.jwtTokenService.getUserId(token);
      if (userId) {
        const localUser = this.localAuthService.getUserById(userId);
        if (localUser && localUser.availableForOffline && localUser.lastToken) {
          this.notifyService.showWarning("Session expired - please login again");
          this.router.navigate(["/login"]);
        } else {
          this.router.navigate(["/login"]);
        }
      } else {
        this.router.navigate(["/login"]);
      }
    }
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
