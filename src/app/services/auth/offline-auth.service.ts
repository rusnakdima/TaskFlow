/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { LocalUser, OfflineAuthResult } from "@models/local-user.model";
import { LoginForm } from "@models/auth-forms.model";

/* services */
import { LocalUserStorageService } from "./local-user-storage.service";
import { PasswordHashingService } from "./password-hashing.service";

/**
 * Service for handling offline authentication
 */
@Injectable({
  providedIn: "root",
})
export class OfflineAuthService {
  private storageService = inject(LocalUserStorageService);
  private hashingService = inject(PasswordHashingService);

  /**
   * Attempt offline authentication with username and password
   */
  async authenticateOffline(loginData: LoginForm): Promise<OfflineAuthResult> {
    const user = this.storageService.getUserByUsername(loginData.username);

    if (!user) {
      return {
        success: false,
        requiresOnlineAuth: true,
        error: "User not found in local storage",
      };
    }

    if (!user.availableForOffline || !user.passwordHash) {
      return {
        success: false,
        requiresOnlineAuth: true,
        error: "Incomplete user data for offline authentication",
      };
    }

    const isValid = await this.hashingService.verifyPassword(loginData.password, user.passwordHash);

    if (!isValid) {
      return {
        success: false,
        requiresOnlineAuth: false,
        error: "Invalid password",
      };
    }

    if (user.lastToken) {
      this.storageService.setCurrentUserId(user.id);
      return {
        success: true,
        user,
        token: user.lastToken,
        requiresOnlineAuth: false,
      };
    }

    return {
      success: false,
      user,
      requiresOnlineAuth: true,
      error: "Valid credentials but no cached token",
    };
  }

  /**
   * Check if offline authentication is possible
   */
  canAuthenticateOffline(): boolean {
    return this.storageService.hasOfflineUsers();
  }

  /**
   * Get users available for offline login
   */
  getOfflineAvailableUsers(): Pick<LocalUser, "id" | "username" | "email">[] {
    return this.storageService.getOfflineAvailableUsers();
  }

  /**
   * Store user data after successful online authentication
   */
  async storeUserDataAfterAuth(
    userId: string,
    username: string,
    email: string,
    password: string,
    role: string,
    token: string
  ): Promise<void> {
    const now = new Date().toISOString();
    const localUser: LocalUser = {
      id: userId,
      username,
      email,
      passwordHash: "",
      role,
      lastToken: token,
      lastOnlineAuth: now,
      localDataUpdatedAt: now,
      availableForOffline: true,
    };

    const hash = await this.hashingService.hashPassword(password);
    localUser.passwordHash = hash;
    this.storageService.saveUser(localUser);
    this.storageService.setCurrentUserId(userId);
  }

  /**
   * Update stored token after successful online auth
   */
  updateToken(userId: string, newToken: string): void {
    const user = this.storageService.getUserById(userId);
    if (user) {
      user.lastToken = newToken;
      user.lastOnlineAuth = new Date().toISOString();
      this.storageService.saveUser(user);
    }
  }

  /**
   * Export local user data for backup/transfer
   */
  exportUserData(userId: string): string | null {
    const user = this.storageService.getUserById(userId);
    if (!user) return null;

    const exportData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      exportedAt: new Date().toISOString(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import user data (requires online auth to complete)
   */
  importUserData(userData: string): { success: boolean; error?: string } {
    try {
      const parsed = JSON.parse(userData);

      if (!parsed.id || !parsed.username || !parsed.email) {
        return { success: false, error: "Invalid user data format" };
      }

      const placeholderUser: LocalUser = {
        id: parsed.id,
        username: parsed.username,
        email: parsed.email,
        passwordHash: "",
        role: parsed.role || "user",
        localDataUpdatedAt: new Date().toISOString(),
        availableForOffline: false,
      };

      this.storageService.saveUser(placeholderUser);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to parse user data" };
    }
  }
}
