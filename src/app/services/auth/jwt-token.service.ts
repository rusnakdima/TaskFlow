/* sys lib */
import { Injectable, inject } from "@angular/core";
import { JwtHelperService } from "@auth0/angular-jwt";

/* services */
import { StorageService } from "@services/core/storage.service";

@Injectable({
  providedIn: "root",
})
export class JwtTokenService {
  private jwtHelper = new JwtHelperService();
  private storageService = inject(StorageService);

  /**
   * Get the decoded JWT token
   */
  decodeToken(token: string): { [key: string]: any } | null {
    if (!token) return null;
    return this.jwtHelper.decodeToken(token);
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
    return localStorage.getItem("token") || sessionStorage.getItem("token");
  }
}
