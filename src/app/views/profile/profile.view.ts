/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, computed, OnDestroy } from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import { Location } from "@angular/common";
import { Subscription } from "rxjs";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { QrScannerComponent } from "@components/qr-scanner/qr-scanner.component";

/* models */
import { Profile } from "@models/profile.model";

/* services */
import { AuthService } from "@services/auth/auth.service";
import { NotifyService } from "@services/notifications/notify.service";
import { ApiProvider } from "@providers/api.provider";
import { StorageService } from "@services/core/storage.service";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, QrScannerComponent],
  templateUrl: "./profile.view.html",
})
export class ProfileView implements OnInit, OnDestroy {
  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private location: Location,
    private authService: AuthService,
    private dataSyncProvider: ApiProvider,
    private notifyService: NotifyService,
    private storageService: StorageService
  ) {}

  userId: string = "";

  profile = computed(() => this.storageService.profile());
  currentUsername = computed(() => this.storageService.profile()?.user?.username || "");
  currentEmail = computed(() => this.storageService.profile()?.user?.email || "");

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
    this.userId = this.authService.getValueByKey("id");

    this.canExportData.set(!!this.userId);
    this.showImportExport.set(true);
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  isMyProfile(): boolean {
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
    input.value = "";
  }

  logout() {
    this.authService.logout();
  }

  logoutAll() {
    if (confirm("This will remove all offline login data. Are you sure?")) {
      this.authService.logoutAll();
    }
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
    const username = this.storageService.profile()?.user?.username;
    if (!username) {
      this.notifyService.showError("You must be logged in to approve QR login");
      return;
    }

    this.dataSyncProvider
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
        error: (err: any) => {
          this.notifyService.showError("Failed to approve: " + (err.message || err));
        },
      });
  }

  private completeDesktopLoginFromMobileScan(token: string): void {
    const username = this.storageService.profile()?.user?.username;
    if (!username) {
      this.notifyService.showError("You must be logged in");
      return;
    }

    this.dataSyncProvider.invokeCommand<string>("qr_login_complete", { token }).subscribe({
      next: (jwtToken) => {
        if (jwtToken) {
          localStorage.setItem("token", jwtToken);
          this.notifyService.showSuccess("Login successful on desktop!");
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 500);
        }
      },
      error: (err: any) => {
        this.notifyService.showError("Failed to complete desktop login: " + (err.message || err));
      },
    });
  }

  async showMyQrCode(): Promise<void> {
    const username = this.storageService.profile()?.user?.username;
    const userId = this.authService.getValueByKey("id");
    if (!username || !userId) {
      this.notifyService.showError("You must be logged in to show QR code");
      return;
    }

    try {
      this.dataSyncProvider
        .invokeCommand<{
          token: string;
          qrCode: string;
          expiresAt: number;
        }>("qr_generate_for_desktop", { username, user_id: userId })
        .subscribe({
          next: (data) => {
            this.myQrCode.set(data.qrCode);
            this.myQrToken.set(data.token);
            this.showMyQr.set(true);
            this.notifyService.showInfo("Show this QR code to login from desktop");
          },
          error: (err: any) => {
            this.notifyService.showError("Failed to generate QR code: " + (err.message || err));
          },
        });
    } catch (err: any) {
      this.notifyService.showError("Failed to generate QR code: " + (err.message || err));
    }
  }

  closeMyQrCode(): void {
    this.showMyQr.set(false);
    this.myQrCode.set(null);
    this.myQrToken.set(null);
  }
}
