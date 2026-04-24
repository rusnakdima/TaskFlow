/* sys lib */
import { Injectable } from "@angular/core";

/* models */
import { LocalUser } from "@models/local-user.model";

/**
 * Service for managing local user data storage
 */
@Injectable({
  providedIn: "root",
})
export class LocalUserStorageService {
  private readonly STORAGE_KEY = "taskflow_local_users";
  private readonly CURRENT_USER_KEY = "taskflow_current_user_id";

  /**
   * Get all stored local users
   */
  getStoredUsers(): LocalUser[] {
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
  saveStoredUsers(users: LocalUser[]): void {
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
      users[existingIndex] = { ...users[existingIndex], ...user };
    } else {
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

    const currentUserId = localStorage.getItem(this.CURRENT_USER_KEY);
    if (currentUserId === userId) {
      localStorage.removeItem(this.CURRENT_USER_KEY);
    }
  }

  /**
   * Get the current user ID
   */
  getCurrentUserId(): string | null {
    return localStorage.getItem(this.CURRENT_USER_KEY);
  }

  /**
   * Set the current user ID
   */
  setCurrentUserId(userId: string): void {
    localStorage.setItem(this.CURRENT_USER_KEY, userId);
  }

  /**
   * Update user's profileId in local storage
   */
  updateUserProfileId(userId: string, profileId: string): void {
    const users = this.getStoredUsers();
    const existingIndex = users.findIndex((u) => u.id === userId);

    if (existingIndex >= 0) {
      users[existingIndex].profileId = profileId;
      this.saveStoredUsers(users);
    }
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
   * Clear all local user data
   */
  clearAllUserData(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.CURRENT_USER_KEY);
  }

  /**
   * Remove user from offline users list
   */
  removeFromOfflineUsers(userId: string): void {
    const users = this.getStoredUsers();
    const filtered = users.filter((u) => u.id !== userId);
    this.saveStoredUsers(filtered);
  }

  /**
   * Clear specific user's cached data
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
