import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  inject,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";

import { MatIconModule } from "@angular/material/icon";

import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

import { NotifyService } from "@services/notifications/notify.service";
import { SecurityService } from "@services/auth/security.service";
import { GithubService } from "@services/github/github.service";

@Component({
  selector: "app-settings",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, CheckboxComponent],
  templateUrl: "./settings.view.html",
})
export class SettingsView implements OnInit, OnDestroy {
  private notifyService = inject(NotifyService);
  private securityService = inject(SecurityService);
  private githubService = inject(GithubService);
  private sanitizer = inject(DomSanitizer);

  chatNotificationVolume = signal(50);
  commentNotificationVolume = signal(50);
  generalNotificationVolume = signal(50);
  enableNotificationSounds = signal(true);

  activeTab = signal<"notifications" | "security" | "integrations">("notifications");

  totpEnabled = signal(false);
  totpSetupInProgress = signal(false);
  totpQrCode = signal<SafeResourceUrl | null>(null);
  totpSecret = signal("");
  totpRecoveryCodes = signal<string[]>([]);
  totpVerifyCode = signal("");
  showRecoveryCodes = signal(false);

  githubConnected = signal(false);
  githubUsername = signal("");
  githubUserId = signal("");
  githubAvatarUrl = signal("");
  githubRepos = signal<any[]>([]);
  githubLoading = signal(false);

  githubDeviceFlowActive = signal(false);
  githubUserCode = signal("");
  githubVerificationUri = signal("");
  githubDeviceCode = signal("");
  githubPollingInterval: any = null;

  ngOnInit(): void {
    const settings = this.notifyService.getSettings();
    this.chatNotificationVolume.set(settings.chatVolume ?? 50);
    this.commentNotificationVolume.set(settings.commentVolume ?? 50);
    this.generalNotificationVolume.set(settings.generalVolume ?? 50);
    this.enableNotificationSounds.set(settings.enableSounds ?? true);

    this.loadGithubStatus();
  }

  setActiveTab(tab: "notifications" | "security" | "integrations"): void {
    this.activeTab.set(tab);
  }

  private async loadGithubStatus(): Promise<void> {
    this.githubService.getConnectionStatus().subscribe({
      next: (status) => {
        this.githubConnected.set(status.connected);
        if (status.username) this.githubUsername.set(status.username);
        if (status.user_id) this.githubUserId.set(status.user_id);
        if (status.avatar_url) this.githubAvatarUrl.set(status.avatar_url);
        if (status.connected) {
          this.loadGithubRepos();
        }
      },
      error: () => {
        this.githubConnected.set(false);
      },
    });
  }

  private loadGithubRepos(): void {
    this.githubLoading.set(true);
    this.githubService.getRepos().subscribe({
      next: (repos) => {
        this.githubRepos.set(repos);
        this.githubLoading.set(false);
      },
      error: () => {
        this.githubRepos.set([]);
        this.githubLoading.set(false);
      },
    });
  }

  async connectGithub(): Promise<void> {
    if (this.githubDeviceFlowActive()) return;

    this.githubLoading.set(true);
    this.githubService.startDeviceFlow().subscribe({
      next: (result) => {
        this.githubDeviceFlowActive.set(true);
        this.githubUserCode.set(result.user_code);
        this.githubVerificationUri.set(result.verification_uri);
        this.githubDeviceCode.set(result.device_code);
        this.githubLoading.set(false);

        this.startGithubPolling(result.device_code);
      },
      error: () => {
        this.githubLoading.set(false);
        this.notifyService.showError("Failed to start GitHub connection");
      },
    });
  }

  private startGithubPolling(deviceCode: string): void {
    this.githubPollingInterval = setInterval(() => {
      this.githubService.checkDeviceFlow(deviceCode).subscribe({
        next: (result) => {
          if (result.success && result.access_token) {
            this.completeGithubConnection(result);
          }
        },
        error: (err) => {
          this.stopGithubPolling();
          this.notifyService.showError("GitHub connection failed: " + (err.message || err));
          this.resetGithubDeviceFlow();
        },
      });
    }, 5000);
  }

  private stopGithubPolling(): void {
    if (this.githubPollingInterval) {
      clearInterval(this.githubPollingInterval);
      this.githubPollingInterval = null;
    }
  }

  private completeGithubConnection(_result: any): void {
    this.stopGithubPolling();

    this.githubService.getConnectionStatus().subscribe({
      next: (status) => {
        this.githubConnected.set(status.connected);
        if (status.username) this.githubUsername.set(status.username);
        if (status.user_id) this.githubUserId.set(status.user_id);
        if (status.avatar_url) this.githubAvatarUrl.set(status.avatar_url);
        if (status.connected) {
          this.loadGithubRepos();
        }
        this.resetGithubDeviceFlow();
        this.notifyService.showSuccess("GitHub connected successfully!");
      },
      error: () => {
        this.resetGithubDeviceFlow();
      },
    });
  }

  private resetGithubDeviceFlow(): void {
    this.githubDeviceFlowActive.set(false);
    this.githubUserCode.set("");
    this.githubVerificationUri.set("");
    this.githubDeviceCode.set("");
    this.stopGithubPolling();
  }

  cancelGithubConnection(): void {
    this.resetGithubDeviceFlow();
  }

  openGithubVerification(): void {
    window.open(this.githubVerificationUri(), "_blank");
  }

  disconnectGithub(): void {
    this.githubService.disconnect().subscribe({
      next: () => {
        this.githubConnected.set(false);
        this.githubUsername.set("");
        this.githubUserId.set("");
        this.githubAvatarUrl.set("");
        this.githubRepos.set([]);
      },
      error: () => {},
    });
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
          this.totpRecoveryCodes.set(result.recoveryCodes ?? []);
          this.totpSetupInProgress.set(false);
        },
        error: (err) => {
          this.notifyService.showError("Failed to setup TOTP: " + (err.message || err));
          this.totpSetupInProgress.set(false);
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to setup TOTP";
      this.notifyService.showError("Failed to setup TOTP: " + message);
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

  closeQrModal(): void {
    this.totpQrCode.set(null);
    this.totpSetupInProgress.set(false);
  }

  ngOnDestroy(): void {
    this.stopGithubPolling();
  }
}
