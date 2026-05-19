/* sys lib */
import { Injectable } from "@angular/core";
import { JwtHelperService } from "@auth0/angular-jwt";

/* models */
import { User } from "@models/generated/api.types";

/* helpers */
import { TokenStorageHelper } from "@helpers/token-storage.helper";

@Injectable({
  providedIn: "root",
})
export class JwtTokenService {
  private jwtHelper = new JwtHelperService();
  private cachedToken: string | null = null;
  private cachedDecodedToken: { [key: string]: any } | null = null;

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
    let userId = this.getValueByKey(token, "id");
    if (!userId) userId = this.getValueByKey(token, "userId");
    if (!userId) userId = this.getValueByKey(token, "sub");
    return userId;
  }

  /**
   * Get profile ID from token
   */
  getProfileId(token: string | null): string | null {
    return this.getValueByKey(token, "profile_id");
  }

  /**
   * Get username from token or profile data
   */
  getUsername(token: string | null): string | null {
    let username = this.getValueByKey(token, "username");
    if (!username) {
      username = this.getValueByKey(token, "name") || null;
    }
    return username;
  }

  /**
   * Get user role from token or profile data
   */
  getRole(token: string | null): string | null {
    let role = this.getValueByKey(token, "role");
    if (!role) {
      role = this.getValueByKey(token, "user_role") || null;
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

  /**
   * Get user object from JWT token claims
   */
  getUserFromToken(token: string | null): User | null {
    if (!token) return null;
    const decoded = this.decodeToken(token);
    if (!decoded) return null;
    return {
      id: decoded["id"] || null,
      email: decoded["email"] || null,
      username: decoded["username"] || decoded["name"] || null,
      role: decoded["role"] || decoded["user_role"] || null,
      profile_id: decoded["profile_id"] || null,
      totp_enabled: decoded["totp_enabled"] || false,
      qr_login_enabled: decoded["qr_login_enabled"] || false,
      github_username: decoded["github_username"] || undefined,
      created_at: decoded["created_at"] || undefined,
      updated_at: decoded["updated_at"] || undefined,
      deleted_at: decoded["deleted_at"] || undefined,
    } as User;
  }
}
