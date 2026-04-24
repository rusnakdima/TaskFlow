/* sys lib */
import { Injectable } from "@angular/core";

/**
 * Service for password hashing and verification using Web Crypto API
 */
@Injectable({
  providedIn: "root",
})
export class PasswordHashingService {
  /**
   * Hash a password using Web Crypto API (SHA-256)
   */
  async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Verify a password against a stored hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const computedHash = await this.hashPassword(password);
    return computedHash === hash;
  }
}
