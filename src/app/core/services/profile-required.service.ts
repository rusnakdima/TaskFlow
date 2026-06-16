import { Injectable, signal } from "@angular/core";

/**
 * When true, user must create a profile before using the app.
 * Header and bottom nav are hidden so they cannot leave the manage profile page.
 */
@Injectable({ providedIn: "root" })
export class ProfileRequiredService {
  private readonly profileRequiredModeSignal = signal<boolean>(false);

  readonly profileRequiredMode = this.profileRequiredModeSignal.asReadonly();

  setProfileRequiredMode(value: boolean): void {
    this.profileRequiredModeSignal.set(value);
  }
}
