/* sys lib */
import { Injectable, inject } from "@angular/core";

/* services */
import { JwtTokenService } from "@services/auth/jwt-token.service";

@Injectable({
  providedIn: "root",
})
export class SessionService {
  private jwtTokenService = inject(JwtTokenService);

  getTokenLS(): string | null {
    return localStorage.getItem("token");
  }

  getTokenSS(): string | null {
    return sessionStorage.getItem("token");
  }

  getToken(): string | null {
    return this.getTokenLS() || this.getTokenSS();
  }

  getValueByKey(key: string): any {
    const token = this.getToken();
    return this.jwtTokenService.getValueByKey(token, key);
  }

  isLoggedIn(): boolean {
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

  hasRole(role: string): boolean {
    const token = this.getToken();
    return this.jwtTokenService.hasRole(token, role);
  }

  logoutAll(localAuthService: any): void {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    localAuthService.clearAllUserData();
    window.location.reload();
  }
}
