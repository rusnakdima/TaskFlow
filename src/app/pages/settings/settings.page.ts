import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";

import { MatIconModule } from "@angular/material/icon";

import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";
import { AppButtonComponent } from "@components/shared/button/button.component";
import {
  SegmentSelectorComponent,
  SegmentOption,
} from "@components/segment-selector/segment-selector.component";

import { NotifyService } from "@services/notifications/notify.service";
import { SecurityService } from "@services/auth/security.service";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { GithubService } from "@services/github/github.service";
import { ThemeService } from "@services/ui/theme.service";
import { GithubRepo } from "@entities/github.model";
import { Response, ResponseStatus } from "@entities/response.model";

interface GithubDeviceFlowCheckResult {
  success: boolean;
  pending?: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  username?: string;
  user_id?: string;
  avatar_url?: string;
}
import { ThemePreset, THEME_PRESETS } from "@entities/theme.model";
import { openUrl } from "@tauri-apps/plugin-opener";

@Component({
  selector: "app-settings",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    CheckboxComponent,
    SegmentSelectorComponent,
    AppButtonComponent,
  ],
  templateUrl: "./settings.page.html",
})
export class SettingsView implements OnInit, OnDestroy {
  private notifyService = inject(NotifyService);
  private securityService = inject(SecurityService);
  private githubService = inject(GithubService);
  private jwtTokenService = inject(JwtTokenService);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private themeService = inject(ThemeService);

  chatNotificationVolume = signal(50);
  commentNotificationVolume = signal(50);
  generalNotificationVolume = signal(50);
  enableNotificationSounds = signal(true);

  activeTab = signal<"notifications" | "security" | "integrations" | "appearance">("notifications");

  settingsTabs: SegmentOption[] = [
    { id: "notifications", label: "Notifications", icon: "notifications" },
    { id: "security", label: "Security", icon: "security" },
    { id: "integrations", label: "Integrations", icon: "extension" },
    { id: "appearance", label: "Appearance", icon: "palette" },
  ];

  themePresets = THEME_PRESETS;
  themeModes = [
    { value: "light" as const, label: "Light", icon: "light_mode" },
    { value: "dark" as const, label: "Dark", icon: "dark_mode" },
    { value: "system" as const, label: "System", icon: "settings_suggest" },
  ];

  activePreset = signal<ThemePreset>(this.themeService.preset());
  activeMode = signal<"light" | "dark" | "system">(this.themeService.mode());

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
  githubRepos = signal<GithubRepo[]>([]);
  githubLoading = signal(false);

  githubDeviceFlowActive = signal(false);
  githubUserCode = signal("");
  githubVerificationUri = signal("");
  githubDeviceCode = signal("");
  githubPollingInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const settings = this.notifyService.getSettings();
    this.chatNotificationVolume.set(settings.chatVolume ?? 50);
    this.commentNotificationVolume.set(settings.commentVolume ?? 50);
    this.generalNotificationVolume.set(settings.generalVolume ?? 50);
    this.enableNotificationSounds.set(settings.enableSounds ?? true);

    this.loadGithubStatus();
  }

  setActiveTab(tab: "notifications" | "security" | "integrations" | "appearance"): void {
    this.activeTab.set(tab);
  }

  onTabSelect(id: string): void {
    this.setActiveTab(id as "notifications" | "security" | "integrations" | "appearance");
  }

  private async loadGithubStatus(): Promise<void> {
    this.githubService.getConnectionStatus().subscribe({
      next: (status) => {
        this.githubConnected.set(status.connected);
        if (status.username) this.githubUsername.set(status.username);
        if (status.user_id) this.githubUserId.set(status.user_id);
        if (status.avatar_url) this.githubAvatarUrl.set(status.avatar_url);
        this.cdr.markForCheck();
        if (status.connected) {
          this.loadGithubRepos();
        }
      },
      error: () => {
        this.githubConnected.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private loadGithubRepos(): void {
    this.githubLoading.set(true);
    this.githubService.getRepos().subscribe({
      next: (repos) => {
        this.githubRepos.set(repos);
        this.githubLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.githubRepos.set([]);
        this.githubLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  async connectGithub(): Promise<void> {
    if (this.githubDeviceFlowActive()) return;

    this.githubLoading.set(true);
    this.githubService.startDeviceFlow().subscribe({
      next: (
        result: Response<{
          device_code: string;
          user_code: string;
          verification_uri: string;
        }>
      ) => {
        if (result.status == ResponseStatus.SUCCESS) {
          const data = result.data;
          this.githubDeviceFlowActive.set(true);
          this.githubUserCode.set(data.user_code);
          this.githubVerificationUri.set(data.verification_uri);
          this.githubDeviceCode.set(data.device_code);
          this.githubLoading.set(false);

          this.startGithubPolling(data.device_code);
        }
      },
      error: () => {
        this.githubLoading.set(false);
        this.notifyService.showError("Failed to start GitHub connection");
      },
    });
  }

  private startGithubPolling(deviceCode: string): void {
    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken() || "") || "";
    this.githubPollingInterval = setInterval(() => {
      this.githubService.checkDeviceFlow(deviceCode, userId).subscribe({
        next: (result) => {
          if (
            result.status === ResponseStatus.SUCCESS &&
            result.data.success &&
            result.data.access_token
          ) {
            this.completeGithubConnection(result.data);
          }
        },
        error: (err) => {
          this.stopGithubPolling();
          this.notifyService.showError("GitHub connection failed: " + (err.message || err));
          this.resetGithubDeviceFlow();
        },
      });
    }, 10000);
  }

  private stopGithubPolling(): void {
    if (this.githubPollingInterval) {
      clearInterval(this.githubPollingInterval);
      this.githubPollingInterval = null;
    }
  }

  private completeGithubConnection(_result: GithubDeviceFlowCheckResult): void {
    this.stopGithubPolling();

    this.githubService.getConnectionStatus().subscribe({
      next: (status) => {
        this.githubConnected.set(status.connected);
        if (status.username) this.githubUsername.set(status.username);
        if (status.user_id) this.githubUserId.set(status.user_id);
        if (status.avatar_url) this.githubAvatarUrl.set(status.avatar_url);
        this.cdr.markForCheck();
        if (status.connected) {
          this.loadGithubRepos();
        }
        this.resetGithubDeviceFlow();
        this.notifyService.showSuccess("GitHub connected successfully!");
      },
      error: () => {
        this.resetGithubDeviceFlow();
        this.cdr.markForCheck();
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
    openUrl(this.githubVerificationUri());
  }

  copyUserCode(): void {
    navigator.clipboard.writeText(this.githubUserCode());
    this.notifyService.showSuccess("Code copied to clipboard!");
  }

  disconnectGithub(): void {
    const userId = this.jwtTokenService.getUserId(this.jwtTokenService.getToken() || "") || "";
    this.githubService.disconnect(userId).subscribe({
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

  selectPreset(preset: ThemePreset): void {
    this.activePreset.set(preset);
    this.themeService.setPreset(preset);
  }

  selectMode(mode: "light" | "dark" | "system"): void {
    this.activeMode.set(mode);
    this.themeService.setMode(mode);
  }

  saveAppearance(): void {
    this.notifyService.showSuccess("Appearance settings saved!");
  }

  resetAppearance(): void {
    this.themeService.resetToDefaults();
    this.activePreset.set(this.themeService.preset());
    this.activeMode.set(this.themeService.mode());
    this.notifyService.showSuccess("Appearance reset to defaults!");
  }

  ngOnDestroy(): void {
    this.stopGithubPolling();
  }
}
