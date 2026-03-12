/* sys lib */
import { JwtHelperService } from "@auth0/angular-jwt";

/**
 * JwtTokenHelper - JWT token utilities
 */
export class JwtTokenHelper {
  private jwtHelper = new JwtHelperService();

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
   * Get user role from token
   */
  getRole(token: string | null): string | null {
    return this.getValueByKey(token, "role");
  }

  /**
   * Check if user has a specific role
   */
  hasRole(token: string | null, role: string): boolean {
    const userRole = this.getRole(token);
    return userRole ? userRole.indexOf(role) !== -1 : false;
  }
}
