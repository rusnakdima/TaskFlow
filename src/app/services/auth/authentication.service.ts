/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

/* models */
import { LoginForm, SignupForm, AuthResponse } from "@models/auth-forms.model";

/* providers */
import { ApiProvider } from "@providers/api.provider";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { LocalAuthService } from "@services/auth/local-auth.service";
import { Router } from "@angular/router";

@Injectable({
  providedIn: "root",
})
export class AuthenticationService {
  private dataSyncProvider = inject(ApiProvider);
  private jwtTokenService = inject(JwtTokenService);
  private localAuthService = inject(LocalAuthService);
  private router = inject(Router);

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

  performOnlineLogin(loginData: LoginForm): Observable<AuthResponse> {
    return this.dataSyncProvider
      .invokeCommand<AuthResponse>("login", { loginForm: loginData })
      .pipe(
        tap((authResponse: AuthResponse) => {
          const token = authResponse.token;
          const userId = this.jwtTokenService.getUserId(token);
          const username = this.jwtTokenService.getValueByKey(token, "username");
          const email = this.jwtTokenService.getValueByKey(token, "email");
          const role = this.jwtTokenService.getRole(token);

          if (userId && username && email) {
            this.localAuthService.storeUserDataAfterAuth(
              userId,
              username,
              email,
              loginData.password,
              role || "user",
              token
            );
          }
        })
      );
  }

  logout(): void {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    this.localAuthService.clearCurrentUser();
    window.location.reload();
  }
}
