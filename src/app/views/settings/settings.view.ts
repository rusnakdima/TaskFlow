import {
  Component,
  OnInit,
  signal,
  inject,
  ChangeDetectionStrategy,
  computed,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";

import { MatIconModule } from "@angular/material/icon";

import { CheckboxComponent } from "@components/fields/checkbox/checkbox.component";

import { NotifyService } from "@services/notifications/notify.service";
import { SecurityService, UserSecurityStatus } from "@services/auth/security.service";
import { AuthCapabilityService } from "@services/auth/auth-capability.service";
import { WebAuthnService } from "@services/auth/webauthn.service";

import { ApiProvider } from "@providers/api.provider";

@Component({
  selector: "app-settings",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, CheckboxComponent],
  templateUrl: "./settings.view.html",
})
export class SettingsView implements OnInit {
  private notifyService = inject(NotifyService);
  private securityService = inject(SecurityService);
  private authCapabilityService = inject(AuthCapabilityService);
  private webAuthnService = inject(WebAuthnService);
  private sanitizer = inject(DomSanitizer);
  private dataSyncProvider = inject(ApiProvider);

  chatNotificationVolume = signal(50);
  commentNotificationVolume = signal(50);
  generalNotificationVolume = signal(50);
  enableNotificationSounds = signal(true);

  activeTab = signal<"notifications" | "security">("notifications");

  totpEnabled = signal(false);
  totpSetupInProgress = signal(false);
  totpQrCode = signal<SafeResourceUrl | null>(null);
  totpSecret = signal("");
  totpRecoveryCodes = signal<string[]>([]);
  totpVerifyCode = signal("");
  showRecoveryCodes = signal(false);

  passkeyEnabled = signal(false);
  passkeySetupInProgress = signal(false);
  passkeyRegistered = signal(false);

  biometricEnabled = signal(false);
  biometricSetupInProgress = signal(false);
  biometricRegistered = signal(false);

  qrLoginEnabled = signal(false);
  qrLoginSetupInProgress = signal(false);

  platformName = signal("");

  readonly capabilities = this.authCapabilityService.capabilities;

  readonly showPasskeySection = computed(() => this.capabilities().passkeyAvailable);
  readonly showBiometricSection = computed(() => this.capabilities().biometricAvailable);
  readonly showQrLoginSection = computed(() => this.capabilities().qrLoginAvailable);

  ngOnInit(): void {
    const settings = this.notifyService.getSettings();
    this.chatNotificationVolume.set(settings.chatVolume);
    this.commentNotificationVolume.set(settings.commentVolume);
    this.generalNotificationVolume.set(settings.generalVolume);
    this.enableNotificationSounds.set(settings.enableSounds);

    this.platformName.set(this.capabilities().platformName);

    this.loadSecurityStatus();
  }

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
        this.qrLoginEnabled.set(status.qrLoginEnabled ?? false);
      },
      error: () => {
        // Silently handle error
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

  async registerPasskey(): Promise<void> {
    if (this.passkeySetupInProgress()) return;
    this.passkeySetupInProgress.set(true);

    try {
      const isWebAuthN = await this.webAuthnService.isWebAuthnSupported();

      if (!isWebAuthN) {
        this.notifyService.showError("Passkey registration requires WebAuthn support.");
        this.passkeySetupInProgress.set(false);
        return;
      }

      this.webAuthnService.initPasskeyRegistration().subscribe({
        next: async (regOptions) => {
          try {
            const credential = await this.webAuthnService.createCredential(regOptions.options);
            if (!credential) {
              throw new Error("Failed to create credential");
            }

            const responseJson = JSON.stringify({
              id: credential.credentialId,
              rawId: credential.rawId,
              response: {
                attestationObject: credential.response.attestationObject,
                clientDataJSON: credential.response.clientDataJSON,
              },
              type: credential.type,
            });

            this.webAuthnService.completePasskeyRegistration(responseJson).subscribe({
              next: () => {
                this.notifyService.showSuccess("Passkey registered successfully!");
                this.passkeyEnabled.set(true);
                this.passkeyRegistered.set(true);
                this.passkeySetupInProgress.set(false);
              },
              error: (err) => {
                this.notifyService.showError(
                  "Failed to complete registration: " + (err.message || err)
                );
                this.passkeySetupInProgress.set(false);
              },
            });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.notifyService.showError("Failed to create passkey: " + message);
            this.passkeySetupInProgress.set(false);
          }
        },
        error: (err) => {
          this.notifyService.showError(
            "Failed to start passkey registration: " + (err.message || err)
          );
          this.passkeySetupInProgress.set(false);
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.notifyService.showError("Failed to setup passkey: " + message);
      this.passkeySetupInProgress.set(false);
    }
  }

  async removePasskey(): Promise<void> {
    this.securityService.disablePasskey().subscribe({
      next: () => {
        this.notifyService.showSuccess("Passkey removed");
        this.passkeyEnabled.set(false);
        this.passkeyRegistered.set(false);
      },
      error: (err) => {
        this.notifyService.showError("Failed to remove passkey: " + (err.message || err));
      },
    });
  }

  async enableBiometric(): Promise<void> {
    if (this.biometricSetupInProgress()) return;
    this.biometricSetupInProgress.set(true);

    try {
      const isAndroidBiometric = await this.webAuthnService.isAndroidBiometricAvailable();

      if (isAndroidBiometric) {
        const success = await this.webAuthnService.authenticateAndroidBiometric(
          "Enable Biometric",
          "Authenticate to enable biometric login"
        );

        if (success) {
          this.securityService
            .registerBiometric()
            .then((result) => {
              if (result.success) {
                this.notifyService.showSuccess(this.platformName() + " enabled successfully!");
                this.biometricEnabled.set(true);
                this.biometricRegistered.set(true);
              } else {
                this.notifyService.showError(result.error || "Failed to setup biometric");
              }
              this.biometricSetupInProgress.set(false);
            })
            .catch((err: any) => {
              this.notifyService.showError("Failed to setup biometric: " + (err.message || err));
              this.biometricSetupInProgress.set(false);
            });
        } else {
          this.notifyService.showError("Biometric authentication failed");
          this.biometricSetupInProgress.set(false);
        }
        return;
      }

      const isWebAuthN = await this.webAuthnService.isWebAuthnSupported();
      const isUVPAA = await this.webAuthnService.isUserVerifyingPlatformAuthenticatorAvailable();

      if (!isWebAuthN) {
        this.notifyService.showError("Biometric authentication requires WebAuthn support.");
        this.biometricSetupInProgress.set(false);
        return;
      }

      if (!isUVPAA) {
        this.notifyService.showWarning(
          "No user-verifying platform authenticator found. Biometric may not work properly."
        );
      }

      this.securityService
        .registerBiometric()
        .then((result) => {
          if (result.success) {
            this.notifyService.showSuccess(this.platformName() + " enabled successfully!");
            this.biometricEnabled.set(true);
            this.biometricRegistered.set(true);
          } else {
            this.notifyService.showError(result.error || "Failed to setup biometric");
          }
          this.biometricSetupInProgress.set(false);
        })
        .catch((err: any) => {
          this.notifyService.showError("Failed to setup biometric: " + (err.message || err));
          this.biometricSetupInProgress.set(false);
        });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.notifyService.showError("Failed to setup biometric: " + message);
      this.biometricSetupInProgress.set(false);
    }
  }

  async disableBiometric(): Promise<void> {
    this.securityService.disableBiometric().subscribe({
      next: () => {
        this.notifyService.showSuccess(this.platformName() + " disabled");
        this.biometricEnabled.set(false);
        this.biometricRegistered.set(false);
      },
      error: (err) => {
        this.notifyService.showError("Failed to disable biometric: " + (err.message || err));
      },
    });
  }

  async toggleQrLogin(): Promise<void> {
    if (this.qrLoginSetupInProgress()) return;
    this.qrLoginSetupInProgress.set(true);

    const newState = !this.qrLoginEnabled();
    const username = this.securityService.getUsername();

    this.dataSyncProvider
      .invokeCommand<{ success: boolean }>("qr_toggle", {
        username,
        enabled: newState,
      })
      .subscribe({
        next: () => {
          this.qrLoginEnabled.set(newState);
          this.notifyService.showSuccess(newState ? "QR login enabled" : "QR login disabled");
          this.qrLoginSetupInProgress.set(false);
        },
        error: (err) => {
          this.notifyService.showError("Failed to toggle QR login: " + (err.message || err));
          this.qrLoginSetupInProgress.set(false);
        },
      });
  }

  closeQrModal(): void {
    this.totpQrCode.set(null);
    this.totpSetupInProgress.set(false);
  }
}
