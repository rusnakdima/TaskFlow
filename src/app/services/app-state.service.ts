/* sys lib */
import { Injectable, signal, computed } from "@angular/core";

/* models */
import { User } from "@models/user.model";
import { Profile } from "@models/profile.model";

/**
 * AppState - Centralized application state management
 * Consolidates redundant signals (userId, user, profile) across components
 * Eliminates duplicate signal declarations in 7+ files
 */
@Injectable({
  providedIn: "root",
})
export class AppState {
  // User state
  private userIdSignal = signal<string>("");
  private userSignal = signal<User | null>(null);
  private profileSignal = signal<Profile | null>(null);
  private isAuthenticatedSignal = signal<boolean>(false);

  // Computed signals
  readonly userId = this.userIdSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly profile = this.profileSignal.asReadonly();
  readonly isAuthenticated = this.isAuthenticatedSignal.asReadonly();

  readonly userName = computed(() => {
    const profile = this.profileSignal();
    if (profile?.name) {
      return profile.name;
    }
    const user = this.userSignal();
    return user?.username || "Guest";
  });

  /**
   * Set user authentication state
   */
  setAuthenticated(userId: string, user: User, profile: Profile | null): void {
    this.userIdSignal.set(userId);
    this.userSignal.set(user);
    this.profileSignal.set(profile);
    this.isAuthenticatedSignal.set(true);
  }

  /**
   * Clear user authentication state (logout)
   */
  clearAuthentication(): void {
    this.userIdSignal.set("");
    this.userSignal.set(null);
    this.profileSignal.set(null);
    this.isAuthenticatedSignal.set(false);
  }

  /**
   * Update profile
   */
  updateProfile(profile: Profile): void {
    this.profileSignal.set(profile);
  }

  /**
   * Get value by key from profile
   * Backward compatibility for authService.getValueByKey()
   */
  getValueByKey(key: string): string {
    if (key === "id") {
      return this.userIdSignal();
    }
    const profile = this.profileSignal();
    if (profile) {
      const profileAny = profile as any;
      return profileAny[key] || "";
    }
    const user = this.userSignal();
    if (user) {
      const userAny = user as any;
      return userAny[key] || "";
    }
    return "";
  }
}
