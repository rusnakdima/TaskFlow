import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { ApiProvider } from "@providers/api.provider";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { AuthResponse } from "@models/auth-forms.model";

export interface TotpSetupResult {
  qrCode: string;
  secret: string;
  recoveryCodes: string[];
}

@Injectable({
  providedIn: "root",
})
export class TotpService {
  private dataSyncProvider = inject(ApiProvider);
  private jwtTokenService = inject(JwtTokenService);

  isTotpEnabledForCurrentUser(): boolean {
    const token = this.jwtTokenService.getToken();
    if (!token) return false;
    return this.jwtTokenService.getValueByKey(token, "totpEnabled") === "true";
  }

  setupTotp(): Observable<TotpSetupResult> {
    return this.dataSyncProvider.invokeCommand<TotpSetupResult>("setupTotp", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
    });
  }

  enableTotp(code: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("enableTotp", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      code,
    });
  }

  disableTotp(code: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("disableTotp", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      code,
    });
  }

  useRecoveryCode(code: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("useRecoveryCode", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      code,
    });
  }

  completeTotpLogin(username: string, code: string): Observable<AuthResponse> {
    return this.dataSyncProvider.invokeCommand<AuthResponse>("verifyLoginTotp", {
      username,
      code,
    });
  }

  initTotpForLogin(username: string): Observable<{ qrCode: string; secret?: string }> {
    return this.dataSyncProvider.invokeCommand<{ qrCode: string; secret?: string }>(
      "initTotpQrLogin",
      { username }
    );
  }
}
