/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

/* models */
import { TotpSetupResult } from "@entities/security.model";
export { TotpSetupResult, UserSecurityStatus } from "@entities/security.model";

import { JwtTokenService } from "@services/auth/jwt-token.service";
import { AuthResponse } from "@entities/auth-forms.model";
import { ApiService } from "@services/api.service";

@Injectable({
  providedIn: "root",
})
export class SecurityService {
  private requestService = inject(ApiService);
  private jwtTokenService = inject(JwtTokenService);

  getUsername(): string {
    return this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) ?? "";
  }

  isTotpEnabledForCurrentUser(): boolean {
    const token = this.jwtTokenService.getToken();
    if (!token) return false;
    return this.jwtTokenService.getValueByKey(token, "totpEnabled") === "true";
  }

  setupTotp(): Observable<TotpSetupResult> {
    return this.requestService.invokeCommand<TotpSetupResult>("setupTotp", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
    });
  }

  enableTotp(code: string): Observable<string> {
    return this.requestService.invokeCommand<string>("enableTotp", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      code,
    });
  }

  disableTotp(code: string): Observable<string> {
    return this.requestService.invokeCommand<string>("disableTotp", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      code,
    });
  }

  useRecoveryCode(code: string): Observable<string> {
    return this.requestService.invokeCommand<string>("useRecoveryCode", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      code,
    });
  }

  completeTotpLogin(username: string, code: string): Observable<AuthResponse> {
    return this.requestService.invokeCommand<AuthResponse>("verifyLoginTotp", {
      username,
      code,
    });
  }

  initTotpForLogin(username: string): Observable<{ qrCode: string; secret?: string }> {
    return this.requestService.invokeCommand<{ qrCode: string; secret?: string }>(
      "initTotpQrLogin",
      { username }
    );
  }
}
