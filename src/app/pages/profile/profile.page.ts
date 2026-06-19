/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, computed, OnDestroy, inject, DestroyRef } from "@angular/core";
import { Router, RouterModule, ActivatedRoute } from "@angular/router";
import { Location } from "@angular/common";
import { Subscription } from "rxjs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { QrScannerComponent } from "@components/qr-scanner/qr-scanner.component";
import { AppButtonComponent } from "@components/shared/button/button.component";

/* helpers */
import { TokenStorageHelper } from "@helpers/token-storage.helper";

import { Profile } from "@entities/generated/api.types";
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiService } from "@services/api.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { ConfirmDialogService } from "@core/services/confirm-dialog.service";
import { ShortcutEmittersService } from "@services/ui/shortcut-emitters.service";
import { ThemeService } from "@services/ui/theme.service";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, QrScannerComponent, AppButtonComponent],
  templateUrl: "./profile.page.html",
})
export class ProfileView implements OnInit, OnDestroy {
  private routeSub?: Subscription;
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  private storage = inject(UnifiedStorageService);

  constructor(
    private location: Location,
    private authService: AuthService,
    private notifyService: NotifyService,
    private requestService: ApiService,
    private confirmDialogService: ConfirmDialogService,
    private shortcutEmitters: ShortcutEmittersService,
    private themeService: ThemeService,
    private route: ActivatedRoute
  ) {}

  userId: string = "";
  viewedUserId = signal<string | null>(null);
  isViewingOtherUser = signal(false);
  viewedUserProfile = signal<Profile | null>(null);

  profile = computed(() => this.storage.profiles()[0]);
  displayProfile = computed(() =>
    this.isViewingOtherUser() ? this.viewedUserProfile() : this.profile()
  );
  currentUsername = computed(() => this.displayProfile()?.user?.username || "");
  currentEmail = computed(() => this.displayProfile()?.user?.email || "");
  role = computed(() => this.storage.currentUser()?.role || "");

  isDarkTheme = computed(() => this.themeService.getEffectiveMode() === "dark");

  // Offline auth signals
  canExportData = signal(false);
  importError = signal<string | null>(null);
  showImportExport = signal(false);

  // QR Scanner
  isScanningQr = signal(false);

  // My QR Code (for mobile login)
  showMyQr = signal(false);
  myQrCode = signal<string | null>(null);
  myQrToken = signal<string | null>(null);

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const userIdParam = params["userId"];
      if (userIdParam) {
        this.viewedUserId.set(userIdParam);
        this.isViewingOtherUser.set(userIdParam !== this.authService.getValueByKey("id"));
        if (this.isViewingOtherUser()) {
          this.fetchViewedUserProfile(userIdParam);
        }
      } else {
        this.viewedUserId.set(null);
        this.isViewingOtherUser.set(false);
      }
    });

    this.userId = this.authService.getValueByKey("id");
    this.storage.ensureUserLoaded();
    this.storage.ensureProfileLoaded();
    this.canExportData.set(!!this.userId);
    this.showImportExport.set(true);
  }

  private fetchViewedUserProfile(userId: string): void {
    this.requestService
      .invokeCommand("get_profile", {
        filter: { user_id: userId },
        token: this.authService.getToken(),
        visibility: "public",
        load: "user",
      })
      .subscribe({
        next: (profileData) => {
          const profile = Array.isArray(profileData) ? profileData[0] : (profileData as Profile);
          if (profile) {
            this.viewedUserProfile.set(profile);
          }
        },
        error: () => {
          this.notifyService.showError("Failed to load user profile");
        },
      });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  setTheme(theme: string) {
    this.themeService.setMode(theme ? "dark" : "light");
  }

  toggleTheme() {
    this.themeService.toggleMode();
  }

  showShortcuts() {
    this.shortcutEmitters.emitShortcuts();
  }

  isMyProfile(): boolean {
    if (this.isViewingOtherUser()) {
      return false;
    }
    const profile = this.profile();
    return profile !== null && profile.user_id === this.authService.getValueByKey("id");
  }

  exportUserData() {
    const userData = this.authService.exportUserData();
    if (!userData) {
      this.notifyService.showError("Failed to export user data");
      return;
    }

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
          setTimeout(() => {
            this.router.navigate(["/login"]);
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
    input.value = "";
  }

  logout() {
    this.authService.logout();
  }

  async logoutAll() {
    const confirmed = await this.confirmDialogService.confirm({
      title: "Logout All Devices",
      message: "This will remove all offline login data. Are you sure?",
      confirmText: "Logout All",
      confirmClass: "bg-red-600 hover:bg-red-700",
    });
    if (!confirmed) return;
    this.authService.logoutAll();
  }

  startQrScanning(): void {
    this.isScanningQr.set(true);
  }

  stopQrScanning(): void {
    this.isScanningQr.set(false);
  }

  onQrScanned(event: { token: string; isDesktopTarget: boolean }): void {
    if (event.isDesktopTarget) {
      this.completeDesktopLoginFromMobileScan(event.token);
    } else {
      this.approveQrLogin(event.token);
    }
  }

  private approveQrLogin(token: string): void {
    const username = this.storage.profiles()[0]?.user?.username;
    if (!username) {
      this.notifyService.showError("You must be logged in to approve QR login");
      return;
    }

    this.requestService
      .invokeCommand<{ success: boolean }>("qr_approve", {
        token,
        username,
      })
      .subscribe({
        next: () => {
          this.notifyService.showSuccess("Login approved! Desktop can now continue.");
          this.stopQrScanning();
          setTimeout(() => this.location.back(), 500);
        },
        error: (err: Error) => {
          this.notifyService.showError("Failed to approve: " + (err.message || err));
        },
      });
  }

  private completeDesktopLoginFromMobileScan(token: string): void {
    const username = this.storage.profiles()[0]?.user?.username;
    if (!username) {
      this.notifyService.showError("You must be logged in");
      return;
    }

    this.requestService
      .invokeCommand<{
        token: string;
        needsProfile: boolean;
        profile: Profile;
        userId: string;
      }>("qr_login_complete", { token })
      .subscribe({
        next: (response: {
          token: string;
          needsProfile: boolean;
          profile: Profile;
          userId: string;
        }) => {
          if (response?.token) {
            TokenStorageHelper.setToken(response.token, true);
            this.notifyService.showSuccess("Login successful on desktop!");
            setTimeout(() => {
              this.router.navigate(["/dashboard"]);
            }, 500);
          }
        },
        error: (err: Error) => {
          this.notifyService.showError("Failed to complete desktop login: " + (err.message || err));
        },
      });
  }

  async showMyQrCode(): Promise<void> {
    const username = this.storage.profiles()[0]?.user?.username;
    const userId = this.authService.getValueByKey("id");
    if (!username || !userId) {
      this.notifyService.showError("You must be logged in to show QR code");
      return;
    }

    try {
      const sub = this.requestService
        .invokeCommand<{
          token: string;
          qrCode: string;
          expiresAt: number;
        }>("qr_generate_for_desktop", { username, user_id: userId })
        .subscribe({
          next: (response: { token: string; qrCode: string; expiresAt: number }) => {
            this.myQrCode.set(response?.qrCode);
            this.myQrToken.set(response?.token);
            this.showMyQr.set(true);
            this.notifyService.showInfo("Show this QR code to login from desktop");
          },
          error: (err: Error) => {
            this.notifyService.showError("Failed to generate QR code: " + (err.message || err));
          },
        });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    } catch (err: unknown) {
      this.notifyService.showError(
        "Failed to generate QR code: " + (err instanceof Error ? err.message : err)
      );
    }
  }

  closeMyQrCode(): void {
    this.showMyQr.set(false);
    this.myQrCode.set(null);
    this.myQrToken.set(null);
  }

  openChat(): void {
    const userId = this.viewedUserId();
    if (userId) {
      this.router.navigate(["/chat"], { queryParams: { userId } });
    }
  }
}
