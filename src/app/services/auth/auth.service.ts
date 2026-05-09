/* sys lib */
import { Injectable, inject, Injector } from "@angular/core";
import { Observable } from "rxjs";
import { tap, take } from "rxjs/operators";

/* models */
import { LoginForm, SignupForm, AuthResponse } from "@models/auth-forms.model";
import { PasswordReset } from "@models/password-reset.model";

/* helpers */
import { NetworkErrorHelper } from "@helpers/network-error.helper";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { REQUEST_SERVICE } from "@services/api.service";
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
  private _requestService: REQUEST_SERVICE | null = null;
  private _jwtTokenService: JwtTokenService | null = null;
  private _notifyService: NotifyService | null = null;
  private _router: Router | null = null;
  private _userValidationService: UserValidationService | null = null;
  private _injector = inject(Injector);

  private get requestService(): REQUEST_SERVICE {
    if (!this._requestService) this._requestService = this._injector.get(REQUEST_SERVICE);
    return this._requestService;
  }
  private get jwtTokenService(): JwtTokenService {
    if (!this._jwtTokenService) this._jwtTokenService = this._injector.get(JwtTokenService);
    return this._jwtTokenService;
  }
  private get notifyService(): NotifyService {
    if (!this._notifyService) this._notifyService = this._injector.get(NotifyService);
    return this._notifyService;
  }
  private get router(): Router {
    if (!this._router) this._router = this._injector.get(Router);
    return this._router;
  }
  private get userValidationService(): UserValidationService {
    if (!this._userValidationService)
      this._userValidationService = this._injector.get(UserValidationService);
    return this._userValidationService;
  }

  constructor() {}

  /**
   * Check if token is valid on backend
   */
  checkToken<R>(token: string): Observable<R> {
    return this.requestService.invokeCommand<R>("check_token", { token });
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
        next: (response: any) => {
          const data = response?.data;
          resolve({
            token: data?.token,
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
    return this.requestService.invokeCommand<AuthResponse>("login", { loginForm: loginData }).pipe(
      tap(() => {
        this.loadUserData();
      })
    );
  }

  login<R>(loginData: LoginForm): Observable<R> {
    return this.requestService.invokeCommand<R>("login", { loginForm: loginData });
  }

  signup<R>(signupData: SignupForm): Observable<R> {
    return this.requestService.invokeCommand<R>("register", { signupForm: signupData }).pipe(
      tap(() => {
        this.loadUserData();
      })
    );
  }

  requestPasswordReset<R>(email: string): Observable<R> {
    return this.requestService.invokeCommand<R>("requestPasswordReset", { email });
  }

  verifyCode<R>(email: string, code: string): Observable<R> {
    return this.requestService.invokeCommand<R>("verifyCode", { email, code });
  }

  resetPassword<R>(passwordReset: PasswordReset): Observable<R> {
    return this.requestService.invokeCommand<R>("resetPassword", { resetData: passwordReset });
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

  importUserData(_userData: string): { success: boolean; error?: string } {
    return { success: false };
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
        next: () => {},
        error: () => {
          this.userValidationService.invalidateUserSession();
        },
      });
  }

  /**
   * Load current user data from backend or cache
   */
  loadUserData(): void {}
}
