/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, OnInit, signal, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";

/* materials */
import { MatIconModule } from "@angular/material/icon";

/* components */
import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

/* services */
import { NotifyService } from "@services/notifications/notify.service";
import { SecurityService, UserSecurityStatus } from "@services/auth/security.service";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

@Component({
  selector: "app-settings",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, CheckboxComponent],
  templateUrl: "./settings.view.html",
})
export class SettingsView implements OnInit {
  private notifyService = inject(NotifyService);
  private securityService = inject(SecurityService);
  private sanitizer = inject(DomSanitizer);
  private dataSyncProvider = inject(DataSyncProvider);

  // Notification sound settings
  chatNotificationVolume = signal(50);
  commentNotificationVolume = signal(50);
  generalNotificationVolume = signal(50);
  enableNotificationSounds = signal(true);

  // Security settings
  activeTab = signal<"notifications" | "security">("notifications");

  // TOTP state
  totpEnabled = signal(false);
  totpSetupInProgress = signal(false);
  totpQrCode = signal<SafeResourceUrl | null>(null);
  totpSecret = signal("");
  totpRecoveryCodes = signal<string[]>([]);
  totpVerifyCode = signal("");
  showRecoveryCodes = signal(false);

  // Passkey state
  passkeyEnabled = signal(false);
  passkeySetupInProgress = signal(false);
  passkeyQrCode = signal<SafeResourceUrl | null>(null);

  // Biometric state
  biometricEnabled = signal(false);
  biometricSetupInProgress = signal(false);
  platformName = signal("");

  ngOnInit(): void {
    const settings = this.notifyService.getSettings();
    this.chatNotificationVolume.set(settings.chatVolume);
    this.commentNotificationVolume.set(settings.commentVolume);
    this.generalNotificationVolume.set(settings.generalVolume);
    this.enableNotificationSounds.set(settings.enableSounds);

    this.platformName.set(this.securityService.getPlatformName());

    // Load current security feature status
    this.loadSecurityStatus();
  }

  /**
   * Load current security feature status from backend
   */
  private loadSecurityStatus(): void {
    const username = this.securityService.getUsername();
    if (!username) {
      return;
    }

    this.securityService.getUserSecurityStatus(username).subscribe({
      next: (status: UserSecurityStatus) => {
        this.totpEnabled.set(status.totpEnabled);
        this.passkeyEnabled.set(status.passkeyEnabled);
        this.biometricEnabled.set(status.biometricEnabled);
      },
      error: (err) => {
        console.error("Failed to load security status:", err);
        // Keep defaults (all false)
      },
    });
  }

  setActiveTab(tab: "notifications" | "security"): void {
    this.activeTab.set(tab);
  }

  saveSettings(): void {
    this.notifyService.saveSettings({
      chatVolume: this.chatNotificationVolume(),
      commentVolume: this.commentNotificationVolume(),
      generalVolume: this.generalNotificationVolume(),
      enableSounds: this.enableNotificationSounds(),
    });
    this.notifyService.showSuccess("Settings saved successfully!");
  }

  resetToDefaults(): void {
    this.chatNotificationVolume.set(50);
    this.commentNotificationVolume.set(50);
    this.generalNotificationVolume.set(50);
    this.enableNotificationSounds.set(true);
    this.saveSettings();
  }

  testSound(type: "chat" | "comment" | "general"): void {
    const volume =
      type === "chat"
        ? this.chatNotificationVolume()
        : type === "comment"
          ? this.commentNotificationVolume()
          : this.generalNotificationVolume();
    this.notifyService.playTestSound(type, volume / 100);
  }

  async setupTotp(): Promise<void> {
    if (this.totpSetupInProgress()) return;
    this.totpSetupInProgress.set(true);

    try {
      this.securityService.setupTotp().subscribe({
        next: (result) => {
          this.totpQrCode.set(this.sanitizer.bypassSecurityTrustResourceUrl(result.qrCode));
          this.totpSecret.set(result.secret);
          this.totpRecoveryCodes.set(result.recoveryCodes);
          this.totpSetupInProgress.set(false);
        },
        error: (err) => {
          this.notifyService.showError("Failed to setup TOTP: " + (err.message || err));
          this.totpSetupInProgress.set(false);
        },
      });
    } catch (err: any) {
      this.notifyService.showError("Failed to setup TOTP: " + (err.message || err));
      this.totpSetupInProgress.set(false);
    }
  }

  verifyAndEnableTotp(): void {
    const code = this.totpVerifyCode();
    if (code.length !== 6) {
      this.notifyService.showError("Please enter a 6-digit code");
      return;
    }

    this.securityService.enableTotp(code).subscribe({
      next: () => {
        this.notifyService.showSuccess("TOTP enabled successfully!");
        this.totpEnabled.set(true);
        this.totpSetupInProgress.set(false);
        this.totpQrCode.set(null);
        this.totpVerifyCode.set("");
        this.showRecoveryCodes.set(true);
      },
      error: (err) => {
        this.notifyService.showError("Invalid code: " + (err.message || err));
      },
    });
  }

  async disableTotp(): Promise<void> {
    const code = this.totpVerifyCode();
    if (code.length !== 6) {
      this.notifyService.showError("Please enter a 6-digit code to disable");
      return;
    }

    this.securityService.disableTotp(code).subscribe({
      next: () => {
        this.notifyService.showSuccess("TOTP disabled");
        this.totpEnabled.set(false);
        this.totpQrCode.set(null);
        this.totpVerifyCode.set("");
        this.showRecoveryCodes.set(false);
      },
      error: (err) => {
        this.notifyService.showError("Failed to disable TOTP: " + (err.message || err));
      },
    });
  }

  async setupPasskey(): Promise<void> {
    if (this.passkeySetupInProgress()) return;
    this.passkeySetupInProgress.set(true);

    try {
      const isWebAuthN = await this.securityService.isWebAuthNSupported();

      if (!isWebAuthN) {
        this.notifyService.showError(
          "Passkey requires WebAuthN support. On desktop Tauri, please use TOTP (Google Authenticator) instead."
        );
        this.passkeySetupInProgress.set(false);
        return;
      }

      const result = await this.securityService.registerPasskey();
      if (result.success) {
        this.notifyService.showSuccess("Passkey registered successfully!");
        this.passkeyEnabled.set(true);
      } else {
        this.notifyService.showError(result.error || "Failed to setup passkey");
      }
    } catch (err: any) {
      this.notifyService.showError("Failed to setup passkey: " + (err.message || err));
    } finally {
      this.passkeySetupInProgress.set(false);
    }
  }

  async disablePasskey(): Promise<void> {
    this.securityService.disablePasskey().subscribe({
      next: () => {
        this.notifyService.showSuccess("Passkey disabled");
        this.passkeyEnabled.set(false);
      },
      error: (err) => {
        this.notifyService.showError("Failed to disable passkey: " + (err.message || err));
      },
    });
  }

  async setupBiometric(): Promise<void> {
    if (this.biometricSetupInProgress()) return;
    this.biometricSetupInProgress.set(true);

    try {
      const isWebAuthN = await this.securityService.isWebAuthNSupported();

      if (!isWebAuthN) {
        this.notifyService.showError(
          "Biometric requires WebAuthN support. On desktop Tauri, please use TOTP (Google Authenticator) instead."
        );
        this.biometricSetupInProgress.set(false);
        return;
      }

      const result = await this.securityService.registerBiometric();
      if (result.success) {
        this.notifyService.showSuccess(this.platformName() + " enabled successfully!");
        this.biometricEnabled.set(true);
      } else {
        this.notifyService.showError(result.error || "Failed to setup biometric");
      }
    } catch (err: any) {
      this.notifyService.showError("Failed to setup biometric: " + (err.message || err));
    } finally {
      this.biometricSetupInProgress.set(false);
    }
  }

  async disableBiometric(): Promise<void> {
    this.securityService.disableBiometric().subscribe({
      next: () => {
        this.notifyService.showSuccess(this.platformName() + " disabled");
        this.biometricEnabled.set(false);
      },
      error: (err) => {
        this.notifyService.showError("Failed to disable biometric: " + (err.message || err));
      },
    });
  }

  closeQrModal(): void {
    this.totpQrCode.set(null);
    this.totpSetupInProgress.set(false);
  }
}
