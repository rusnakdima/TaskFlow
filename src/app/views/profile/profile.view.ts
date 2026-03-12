/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, computed, OnDestroy } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* models */
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { DataSyncProvider } from "@providers/data-sync.provider";
import { StorageService } from "@services/core/storage.service";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./profile.view.html",
})
export class ProfileView implements OnInit, OnDestroy {
  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private dataSyncProvider: DataSyncProvider,
    private notifyService: NotifyService,
    private storageService: StorageService
  ) {}

  userId: string = "";

  // ✅ FIX: Use computed signal from StorageService
  profile = computed(() => this.storageService.profile());

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    this.routeSub = this.route.queryParams.subscribe((params: any) => {
      if (params.id && params.id != "") {
        // ✅ Profile already loaded in StorageService - just use it
        // No need to fetch again unless explicitly needed
        const cachedProfile = this.storageService.profile();
        if (!cachedProfile) {
          // Only fetch if not in cache (should rarely happen)
          this.getProfile(params.id);
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  isMyProfile(): boolean {
    const profile = this.profile();
    return profile !== null && profile.userId === this.authService.getValueByKey("id");
  }

  getProfile(userId: string) {
    // ⚠️ Only called when profile not in cache
    this.dataSyncProvider.getProfileByUserId(userId).subscribe({
      next: (profile: Profile | null) => {
        if (profile) {
          // ✅ Cache the profile
          this.storageService.setProfile(profile);
        }
      },
      error: (err) => {
        this.notifyService.showError(err.message || "Failed to load profile");
      },
    });
  }

  logout() {
    this.authService.logout();
  }
}
