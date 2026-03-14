/* sys lib */
import { Injectable } from "@angular/core";
import { Observable, from, of } from "rxjs";
import { map, catchError } from "rxjs/operators";

/* models */
import { LocalUser, OfflineAuthResult } from "@models/local-user.model";
import { LoginForm, SignupForm } from "@models/auth-forms.model";

/**
 * Service for handling offline-first authentication
 * Manages local user data storage and offline authentication
 */
@Injectable({
  providedIn: "root",
})
export class LocalAuthService {
  private readonly STORAGE_KEY = "taskflow_local_users";
  private readonly CURRENT_USER_KEY = "taskflow_current_user_id";

  /**
   * Hash a password using Web Crypto API
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

  /**
   * Get all stored local users
   */
  private getStoredUsers(): LocalUser[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data) as LocalUser[];
    } catch {
      return [];
    }
  }

  /**
   * Save all local users to storage
   */
  private saveStoredUsers(users: LocalUser[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
  }

  /**
   * Get a specific user by username
   */
  getUserByUsername(username: string): LocalUser | undefined {
    const users = this.getStoredUsers();
    return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  /**
   * Get a specific user by ID
   */
  getUserById(id: string): LocalUser | undefined {
    const users = this.getStoredUsers();
    return users.find((u) => u.id === id);
  }

  /**
   * Add or update a user in local storage
   */
  saveUser(user: LocalUser): void {
    const users = this.getStoredUsers();
    const existingIndex = users.findIndex((u) => u.id === user.id);

    if (existingIndex >= 0) {
      // Update existing user
      users[existingIndex] = { ...users[existingIndex], ...user };
    } else {
      // Add new user
      users.push(user);
    }

    this.saveStoredUsers(users);
  }

  /**
   * Remove a user from local storage
   */
  removeUser(userId: string): void {
    const users = this.getStoredUsers();
    const filtered = users.filter((u) => u.id !== userId);
    this.saveStoredUsers(filtered);

    // Also clear current user if it was this user
    const currentUserId = localStorage.getItem(this.CURRENT_USER_KEY);
    if (currentUserId === userId) {
      localStorage.removeItem(this.CURRENT_USER_KEY);
    }
  }

  /**
   * Store user data after successful online authentication
   * This enables future offline authentication
   */
  storeUserDataAfterAuth(
    userId: string,
    username: string,
    email: string,
    password: string,
    role: string,
    token: string
  ): void {
    const now = new Date().toISOString();
    const localUser: LocalUser = {
      id: userId,
      username,
      email,
      passwordHash: "", // Will be set asynchronously
      role,
      lastToken: token,
      lastOnlineAuth: now,
      localDataUpdatedAt: now,
      availableForOffline: true,
    };

    // Hash password asynchronously and save
    this.hashPassword(password).then((hash) => {
      localUser.passwordHash = hash;
      this.saveUser(localUser);
      this.setCurrentUserId(userId);
    });
  }

  /**
   * Attempt offline authentication with username and password
   */
  async authenticateOffline(loginData: LoginForm): Promise<OfflineAuthResult> {
    const user = this.getUserByUsername(loginData.username);

    if (!user) {
      // User not found in local storage - need online auth
      return {
        success: false,
        requiresOnlineAuth: true,
        error: "User not found in local storage",
      };
    }

    if (!user.availableForOffline || !user.passwordHash) {
      // User data not complete for offline auth
      return {
        success: false,
        requiresOnlineAuth: true,
        error: "Incomplete user data for offline authentication",
      };
    }

    // Verify password
    const isValid = await this.verifyPassword(loginData.password, user.passwordHash);

    if (!isValid) {
      return {
        success: false,
        requiresOnlineAuth: false, // Don't fallback - password is wrong
        error: "Invalid password",
      };
    }

    // Check if we have a cached token
    if (user.lastToken) {
      // Set as current user
      this.setCurrentUserId(user.id);
      return {
        success: true,
        user,
        token: user.lastToken,
        requiresOnlineAuth: false,
      };
    }

    // Valid credentials but no cached token - need online auth for new token
    return {
      success: false,
      user,
      requiresOnlineAuth: true,
      error: "Valid credentials but no cached token",
    };
  }

  /**
   * Update stored token after successful online auth
   */
  updateToken(userId: string, newToken: string): void {
    const user = this.getUserById(userId);
    if (user) {
      user.lastToken = newToken;
      user.lastOnlineAuth = new Date().toISOString();
      this.saveUser(user);
    }
  }

  /**
   * Set the current user ID
   */
  setCurrentUserId(userId: string): void {
    localStorage.setItem(this.CURRENT_USER_KEY, userId);
  }

  /**
   * Get the current user ID
   */
  getCurrentUserId(): string | null {
    return localStorage.getItem(this.CURRENT_USER_KEY);
  }

  /**
   * Clear current user session
   */
  clearCurrentUser(): void {
    localStorage.removeItem(this.CURRENT_USER_KEY);
  }

  /**
   * Check if offline authentication is available for any user
   */
  hasOfflineUsers(): boolean {
    const users = this.getStoredUsers();
    return users.some((u) => u.availableForOffline && u.passwordHash);
  }

  /**
   * Get all users available for offline auth (for UI purposes)
   */
  getOfflineAvailableUsers(): Pick<LocalUser, "id" | "username" | "email">[] {
    const users = this.getStoredUsers();
    return users
      .filter((u) => u.availableForOffline && u.passwordHash)
      .map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
      }));
  }

  /**
   * Export local user data for backup/transfer
   */
  exportUserData(userId: string): string | null {
    const user = this.getUserById(userId);
    if (!user) return null;

    // Create export without password hash for security
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
   * This stores minimal user data that will be completed after online auth
   */
  importUserData(userData: string): { success: boolean; error?: string } {
    try {
      const parsed = JSON.parse(userData);

      // Validate required fields
      if (!parsed.id || !parsed.username || !parsed.email) {
        return { success: false, error: "Invalid user data format" };
      }

      // Create placeholder user entry
      const placeholderUser: LocalUser = {
        id: parsed.id,
        username: parsed.username,
        email: parsed.email,
        passwordHash: "", // Will be set after first successful auth
        role: parsed.role || "user",
        localDataUpdatedAt: new Date().toISOString(),
        availableForOffline: false, // Not available until password is set
      };

      this.saveUser(placeholderUser);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to parse user data" };
    }
  }

  /**
   * Clear all local user data (for logout/cleanup)
   */
  clearAllUserData(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.CURRENT_USER_KEY);
  }

  /**
   * Remove specific user's cached data
   */
  clearUserCache(userId: string): void {
    const users = this.getStoredUsers();
    const user = users.find((u) => u.id === userId);
    if (user) {
      user.lastToken = undefined;
      user.availableForOffline = false;
      this.saveUser(user);
    }
  }
}
