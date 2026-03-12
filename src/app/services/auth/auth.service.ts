/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

/* models */
import { Response } from "@models/response.model";
import { LoginForm } from "@models/login-form.model";
import { SignupForm } from "@models/signup-form.model";
import { PasswordReset } from "@models/password-reset-form.model";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  private dataSyncProvider = inject(DataSyncProvider);
  private jwtTokenService = inject(JwtTokenService);

  constructor() {}

  checkToken<R>(token: string): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("checkToken", { token });
  }

  login<R>(loginData: LoginForm): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("login", { loginForm: loginData });
  }

  signup<R>(signupData: SignupForm): Observable<R> {
    return this.dataSyncProvider.invokeCommand<R>("register", { signupForm: signupData });
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
}
