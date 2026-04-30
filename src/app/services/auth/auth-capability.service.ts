import { Injectable, signal, computed, inject } from "@angular/core";
import { WebAuthnService } from "@services/auth/webauthn.service";

export interface AuthCapabilities {
  passkeyAvailable: boolean;
  biometricAvailable: boolean;
  qrLoginAvailable: boolean;
  isTauri: boolean;
  isMobile: boolean;
  platformName: string;
}

export interface AuthMethods {
  passkey: boolean;
  biometric: boolean;
  qrLogin: boolean;
}

@Injectable({
  providedIn: "root",
})
export class AuthCapabilityService {
  private readonly _capabilities = signal<AuthCapabilities>({
    passkeyAvailable: false,
    biometricAvailable: false,
    qrLoginAvailable: false,
    isTauri: false,
    isMobile: false,
    platformName: "Unknown",
  });

  readonly capabilities = this._capabilities.asReadonly();

  readonly passkeyAvailable = computed(() => this._capabilities().passkeyAvailable);
  readonly biometricAvailable = computed(() => this._capabilities().biometricAvailable);
  readonly qrLoginAvailable = computed(() => this._capabilities().qrLoginAvailable);
  readonly isTauri = computed(() => this._capabilities().isTauri);
  readonly isMobile = computed(() => this._capabilities().isMobile);

  private webauthnService = inject(WebAuthnService);

  constructor() {
    this.detectCapabilities();
  }

  async detectCapabilities(): Promise<void> {
    const isTauri = this.checkIsTauri();
    const isMobile = this.checkIsMobile();
    const platformName = this.webauthnService.getPlatformName();

    const webAuthnSupported = await this.webauthnService.isWebAuthnSupported();
    const platformAuthenticatorAvailable =
      await this.webauthnService.isUserVerifyingPlatformAuthenticatorAvailable();

    const biometricAvailable = isMobile || (webAuthnSupported && platformAuthenticatorAvailable);

    this._capabilities.set({
      passkeyAvailable: webAuthnSupported,
      biometricAvailable,
      qrLoginAvailable: true,
      isTauri,
      isMobile,
      platformName,
    });
  }

  private checkIsTauri(): boolean {
    if (typeof window === "undefined") return false;
    return !!(window as any).__TAURI_INTERNALS__;
  }

  private checkIsMobile(): boolean {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return /android/.test(userAgent) || /iphone|ipad/.test(userAgent);
  }

  isMethodAvailableForUser(
    method: keyof AuthMethods,
    userSecurityStatus: {
      passkeyEnabled?: boolean;
      biometricEnabled?: boolean;
      qrLoginEnabled?: boolean;
    } | null
  ): boolean {
    const caps = this._capabilities();

    if (!userSecurityStatus) return false;

    switch (method) {
      case "passkey":
        return caps.passkeyAvailable && !!userSecurityStatus.passkeyEnabled;
      case "biometric":
        return caps.biometricAvailable && !!userSecurityStatus.biometricEnabled;
      case "qrLogin":
        return caps.qrLoginAvailable && !!userSecurityStatus.qrLoginEnabled;
      default:
        return false;
    }
  }

  getAvailableMethods(
    userSecurityStatus: {
      passkeyEnabled?: boolean;
      biometricEnabled?: boolean;
      qrLoginEnabled?: boolean;
    } | null
  ): AuthMethods {
    return {
      passkey: this.isMethodAvailableForUser("passkey", userSecurityStatus),
      biometric: this.isMethodAvailableForUser("biometric", userSecurityStatus),
      qrLogin: this.isMethodAvailableForUser("qrLogin", userSecurityStatus),
    };
  }
}
