/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, from, of } from "rxjs";
import { map, tap } from "rxjs/operators";
import { invoke } from "@tauri-apps/api/core";

/* models */

import { ApiProvider } from "@providers/api.provider";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { PasskeyService } from "@services/auth/passkey.service";
import { WebAuthnService } from "@services/auth/webauthn.service";
import { EncodingHelper } from "@helpers/encoding.helper";
import { AuthResponse } from "@models/auth-forms.model";

export interface TotpSetupResult {
  qrCode: string;
  secret: string;
  recoveryCodes: string[];
}

export interface PasskeyRegistrationOptions {
  options: any;
  challenge: string;
}

export interface PasskeyAuthOptions {
  options: any;
  qrCode: string;
  challenge: string;
  username: string;
}

export interface UserSecurityStatus {
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  biometricEnabled: boolean;
  qrLoginEnabled?: boolean;
}

export interface BiometricInfo {
  enabled: boolean;
  platform: string;
}

@Injectable({
  providedIn: "root",
})
export class SecurityService {
  private dataSyncProvider = inject(ApiProvider);
  private jwtTokenService = inject(JwtTokenService);
  private passkeyService = inject(PasskeyService);
  private webauthnService = inject(WebAuthnService);

  getUsername(): string {
    return this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) ?? "";
  }

  /**
   * Check if we're running in Tauri (desktop app)
   */
  isTauriApp(): boolean {
    return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
  }

  /**
   * Check if running on mobile platform
   */
  isMobilePlatform(): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    return /android/.test(userAgent) || /iphone|ipad/.test(userAgent);
  }

  /**
   * Check if device has platform biometric capability
   */
  async hasPlatformBiometric(): Promise<boolean> {
    return this.webauthnService.isUserVerifyingPlatformAuthenticatorAvailable();
  }

  /**
   * Determine which authentication methods to show based on platform and settings
   * Returns: 'webauthn' | 'totp-qr' | 'both'
   */
  getAuthMethodForPlatform(): "webauthn" | "totp-qr" {
    if (this.isTauriApp()) {
      return "totp-qr";
    }
    if (this.isMobilePlatform()) {
      return "webauthn";
    }
    return "webauthn";
  }

  /**
   * Check if current logged-in user has passkey enabled
   */
  isPasskeyEnabledForCurrentUser(): boolean {
    const token = this.jwtTokenService.getToken();
    if (!token) return false;
    return this.jwtTokenService.getValueByKey(token, "passkeyEnabled") === "true";
  }

  /**
   * Check if current logged-in user has biometric enabled
   */
  isBiometricEnabledForCurrentUser(): boolean {
    const token = this.jwtTokenService.getToken();
    if (!token) return false;
    return this.jwtTokenService.getValueByKey(token, "biometricEnabled") === "true";
  }

  /**
   * Check if current logged-in user has TOTP enabled
   */
  isTotpEnabledForCurrentUser(): boolean {
    const token = this.jwtTokenService.getToken();
    if (!token) return false;
    return this.jwtTokenService.getValueByKey(token, "totpEnabled") === "true";
  }

  setupTotp(): Observable<TotpSetupResult> {
    return this.dataSyncProvider.invokeCommand<TotpSetupResult>("setupTotp", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
    });
  }

  enableTotp(code: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("enableTotp", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      code,
    });
  }

  disableTotp(code: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("disableTotp", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      code,
    });
  }

  useRecoveryCode(code: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("useRecoveryCode", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      code,
    });
  }

  /**
   * Complete login with TOTP after passkey/biometric authentication
   * This returns AuthResponse with token, needsProfile, and profile
   */
  completeTotpLogin(username: string, code: string): Observable<AuthResponse> {
    return this.dataSyncProvider.invokeCommand<AuthResponse>("verifyLoginTotp", {
      username,
      code,
    });
  }

  /**
   * Initialize TOTP QR code for desktop login
   * Returns a QR code URI that can be scanned with Google Authenticator
   */
  initTotpForLogin(username: string): Observable<{ qrCode: string; secret?: string }> {
    return this.dataSyncProvider.invokeCommand<{ qrCode: string; secret?: string }>(
      "initTotpQrLogin",
      { username }
    );
  }

  initPasskeyRegistration(): Observable<PasskeyRegistrationOptions> {
    return this.dataSyncProvider.invokeCommand<PasskeyRegistrationOptions>(
      "initPasskeyRegistration",
      { username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "" }
    );
  }

  completePasskeyRegistration(
    credentialId: string,
    attestationObject: string,
    device: string
  ): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("completePasskeyRegistration", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      credentialId,
      attestationObject,
      device,
    });
  }

  initPasskeyAuthentication(username?: string): Observable<PasskeyAuthOptions> {
    return this.dataSyncProvider.invokeCommand<PasskeyAuthOptions>("initPasskeyAuthentication", {
      username: username || null,
    });
  }

  completePasskeyAuthentication(
    signature: string,
    authenticatorData: string,
    clientData: string,
    username?: string
  ): Observable<{ verified: boolean; username: string; method: string }> {
    return this.dataSyncProvider.invokeCommand<{
      verified: boolean;
      username: string;
      method: string;
    }>("completePasskeyAuthentication", {
      username: username || null,
      signature,
      authenticatorData,
      clientData,
    });
  }

  disablePasskey(): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("disablePasskey", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
    });
  }

  enableBiometric(credentialId: string, publicKey: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("enableBiometric", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      credentialId,
      publicKey,
    });
  }

  initBiometricAuth(
    username?: string
  ): Observable<{ options: any; challenge: string; platform: string }> {
    return this.dataSyncProvider.invokeCommand<any>("initBiometricAuth", {
      username: username || null,
    });
  }

  completeBiometricAuth(signature: string, username?: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("completeBiometricAuth", {
      username: username || this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
      signature,
    });
  }

  disableBiometric(): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("disableBiometric", {
      username: this.jwtTokenService.getUsername(this.jwtTokenService.getToken()) || "",
    });
  }

  async registerPasskey(): Promise<{ success: boolean; error?: string }> {
    return this.passkeyService.registerPasskey();
  }

  async authenticateWithPasskey(): Promise<{
    success: boolean;
    username?: string;
    requiresTotp?: boolean;
    error?: string;
  }> {
    return this.passkeyService.authenticateWithPasskey();
  }

  async authenticateWithBiometric(): Promise<{
    success: boolean;
    username?: string;
    requiresTotp?: boolean;
    error?: string;
  }> {
    return this.passkeyService.authenticateWithBiometric();
  }

  async registerBiometric(): Promise<{ success: boolean; error?: string }> {
    return this.passkeyService.registerBiometric();
  }
}
