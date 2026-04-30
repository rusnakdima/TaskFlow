/* sys lib */
import { Injectable, inject } from "@angular/core";
import { JwtHelperService } from "@auth0/angular-jwt";

/* helpers */
import { TokenStorageHelper } from "@helpers/token-storage.helper";

/* services */
import { StorageService } from "@services/core/storage.service";

@Injectable({
  providedIn: "root",
})
export class JwtTokenService {
  private jwtHelper = new JwtHelperService();
  private _storageService: StorageService | null = null;
  private cachedToken: string | null = null;
  private cachedDecodedToken: { [key: string]: any } | null = null;

  private get storageService(): StorageService {
    if (!this._storageService) {
      this._storageService = inject(StorageService);
    }
    return this._storageService;
  }

  /**
   * Get the decoded JWT token
   */
  decodeToken(token: string): { [key: string]: any } | null {
    if (!token) return null;
    if (this.cachedToken !== token) {
      this.cachedToken = token;
      this.cachedDecodedToken = this.jwtHelper.decodeToken(token);
    }
    return this.cachedDecodedToken;
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string | null): boolean {
    if (!token) return true;
    return this.jwtHelper.isTokenExpired(token);
  }

  /**
   * Get a specific value from the token by key
   */
  getValueByKey(token: string | null, key: string): any {
    if (!token) return null;
    const decoded = this.decodeToken(token);
    return decoded ? decoded[key] : null;
  }

  /**
   * Get user ID from token
   */
  getUserId(token: string | null): string | null {
    return this.getValueByKey(token, "id");
  }

  /**
   * Get username from token or user data
   */
  getUsername(token: string | null): string | null {
    let username = this.getValueByKey(token, "username");
    if (!username) {
      const user = this.storageService.user();
      username = user?.username || null;
    }
    return username;
  }

  /**
   * Get user role from token or user data
   */
  getRole(token: string | null): string | null {
    let role = this.getValueByKey(token, "role");
    if (!role) {
      const user = this.storageService.user();
      role = user?.role || null;
    }
    return role;
  }

  /**
   * Check if user has a specific role
   */
  hasRole(token: string | null, role: string): boolean {
    const userRole = this.getRole(token);
    return userRole ? userRole.indexOf(role) !== -1 : false;
  }

  /**
   * Get the current auth token from storage
   */
  getToken(): string | null {
    return TokenStorageHelper.getToken();
  }

  /**
   * Get current user ID from the stored token
   */
  getCurrentUserId(): string | null {
    return this.getUserId(this.getToken());
  }

  /**
   * Get email from token
   */
  getEmail(token: string | null): string | null {
    return this.getValueByKey(token, "email");
  }

  /**
   * Get current user email from stored token
   */
  getCurrentUserEmail(): string | null {
    return this.getEmail(this.getToken());
  }

  /**
   * Store token in storage
   */
  setToken(token: string, remember = false): void {
    TokenStorageHelper.setToken(token, remember);
  }

  /**
   * Clear token from storage (logout)
   */
  clearToken(): void {
    TokenStorageHelper.removeToken();
  }

  /**
   * Check if token is valid (exists and not expired)
   */
  isValidToken(token: string | null): boolean {
    return !!token && !this.isTokenExpired(token);
  }

  /**
   * Check if current user is logged in (has valid token)
   */
  isLoggedIn(): boolean {
    return this.isValidToken(this.getToken());
  }
}
