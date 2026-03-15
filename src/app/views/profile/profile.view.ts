/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, computed, OnDestroy, inject } from "@angular/core";
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
import { DataSyncService } from "@services/data/data-sync.service";
import { LocalAuthService } from "@services/auth/local-auth.service";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: "./profile.view.html",
})
export class ProfileView implements OnInit, OnDestroy {
  private routeSub?: Subscription;
  private localAuthService = inject(LocalAuthService);
  private dataSyncService = inject(DataSyncService);

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

  // Offline auth signals
  canExportData = signal(false);
  importError = signal<string | null>(null);
  showImportExport = signal(false);

  ngOnInit(): void {
    this.userId = this.authService.getValueByKey("id");

    this.routeSub = this.route.queryParams.subscribe((params: any) => {
      if (params.id && params.id != "") {
        // Profile is loaded centrally in app.ts - just use cached signal
        const cachedProfile = this.storageService.profile();
        if (!cachedProfile) {
          // If somehow not cached, trigger a reload via DataSyncService
          this.getProfile(params.id);
        }
      }
    });

    // Check if export is available
    this.canExportData.set(!!this.userId);
    this.showImportExport.set(true);
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  isMyProfile(): boolean {
    const profile = this.profile();
    return profile !== null && profile.userId === this.authService.getValueByKey("id");
  }

  getProfile(userId: string) {
    // Only called when profile not in cache - use DataSyncService
    this.dataSyncService.loadProfile().subscribe();
  }

  /**
   * Export user data for offline backup
   */
  exportUserData() {
    const userData = this.authService.exportUserData();
    if (!userData) {
      this.notifyService.showError("Failed to export user data");
      return;
    }

    // Create download blob
    const blob = new Blob([userData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taskflow-user-${this.userId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.notifyService.showSuccess("User data exported successfully");
  }

  /**
   * Import user data from file
   */
  importUserData(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const result = e.target?.result as string;
        const importResult = this.authService.importUserData(result);

        if (importResult.success) {
          this.notifyService.showSuccess(
            "User data imported. Please login with your password to complete setup."
          );
          this.importError.set(null);
          // Redirect to login to complete auth
          setTimeout(() => {
            window.location.href = "/login";
          }, 1000);
        } else {
          this.importError.set(importResult.error || "Import failed");
          this.notifyService.showError(importResult.error || "Import failed");
        }
      } catch {
        this.importError.set("Invalid file format");
        this.notifyService.showError("Invalid file format");
      }
    };

    reader.readAsText(file);
    // Reset input
    input.value = "";
  }

  /**
   * Logout keeping offline data
   */
  logout() {
    this.authService.logout();
  }

  /**
   * Full logout - clear all offline data
   */
  logoutAll() {
    if (confirm("This will remove all offline login data. Are you sure?")) {
      this.authService.logoutAll();
    }
  }
}
