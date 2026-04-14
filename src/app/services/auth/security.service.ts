/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable, from, of } from "rxjs";
import { map, tap } from "rxjs/operators";
import { invoke } from "@tauri-apps/api/core";

/* models */

import { DataSyncProvider } from "@providers/data-sync.provider";
import { JwtTokenService } from "@services/auth/jwt-token.service";
import { BufferHelper } from "@helpers/buffer.helper";

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

export interface BiometricInfo {
  enabled: boolean;
  platform: string;
}

export interface UserSecurityStatus {
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  biometricEnabled: boolean;
  qrLoginEnabled?: boolean;
}

@Injectable({
  providedIn: "root",
})
export class SecurityService {
  private dataSyncProvider = inject(DataSyncProvider);
  private jwtTokenService = inject(JwtTokenService);

  getUsername(): string {
    const token = this.jwtTokenService.getToken();
    return this.jwtTokenService.getValueByKey(token, "username") || "";
  }

  getPlatformName(): string {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/windows/.test(userAgent)) return "Windows Hello";
    if (/macintosh|mac os/.test(userAgent)) return "Touch ID";
    if (/linux/.test(userAgent)) return "Biometric";
    if (/android/.test(userAgent)) return "Fingerprint";
    if (/iphone|ipad/.test(userAgent)) return "Face ID";
    return "Biometric";
  }

  /**
   * Check if WebAuthN APIs are available and actually work in current environment
   * Returns true if navigator.credentials.create/get are available AND working
   */
  async isWebAuthNSupported(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.credentials) {
      return false;
    }

    try {
      if (
        typeof (navigator.credentials as any).create !== "function" ||
        typeof (navigator.credentials as any).get !== "function"
      ) {
        return false;
      }

      if (typeof PublicKeyCredential === "undefined") {
        return false;
      }

      if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
        const result = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!result) {
          return false;
        }
      }

      return true;
    } catch (e) {
      console.warn("WebAuthN check failed:", e);
      return false;
    }
  }

  /**
   * Synchronous check if WebAuthN APIs exist (but may not work)
   */
  isWebAuthNAvailable(): boolean {
    return (
      typeof navigator !== "undefined" && typeof (navigator as any).credentials !== "undefined"
    );
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
   * This checks if WebAuthN with platform authenticator is available
   */
  hasPlatformBiometric(): boolean {
    if (!this.isWebAuthNAvailable()) return false;
    if (typeof PublicKeyCredential === "undefined") return false;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function")
      return false;
    return true;
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
   * Get security status for a specific user
   * Used to check if passkey/biometric/TOTP is enabled before showing login options
   */
  getUserSecurityStatus(username: string): Observable<UserSecurityStatus> {
    return this.dataSyncProvider.invokeCommand<UserSecurityStatus>("getUserSecurityStatus", {
      username,
    });
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
      username: this.getUsername(),
    });
  }

  enableTotp(code: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("enableTotp", {
      username: this.getUsername(),
      code,
    });
  }

  disableTotp(code: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("disableTotp", {
      username: this.getUsername(),
      code,
    });
  }

  useRecoveryCode(code: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("useRecoveryCode", {
      username: this.getUsername(),
      code,
    });
  }

  /**
   * Complete login with TOTP after passkey/biometric authentication
   * This returns a JWT token directly
   */
  completeTotpLogin(username: string, code: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("verifyLoginTotp", {
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
      { username: this.getUsername() }
    );
  }

  completePasskeyRegistration(
    credentialId: string,
    attestationObject: string,
    device: string
  ): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("completePasskeyRegistration", {
      username: this.getUsername(),
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
      username: this.getUsername(),
    });
  }

  enableBiometric(credentialId: string, publicKey: string): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("enableBiometric", {
      username: this.getUsername(),
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
      username: username || this.getUsername(),
      signature,
    });
  }

  disableBiometric(): Observable<string> {
    return this.dataSyncProvider.invokeCommand<string>("disableBiometric", {
      username: this.getUsername(),
    });
  }

  async registerPasskey(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await new Promise<PasskeyRegistrationOptions>((resolve, reject) => {
        this.initPasskeyRegistration().subscribe({
          next: resolve,
          error: reject,
        });
      });

      const publicKeyCredential = await this.createPasskeyCredential(result.options);

      if (!publicKeyCredential) {
        return { success: false, error: "Failed to create passkey credential" };
      }

      const pkCredential = publicKeyCredential as any;
      const signature = BufferHelper.arrayBufferToBase64(pkCredential.response.signature);
      const authenticatorData = BufferHelper.arrayBufferToBase64(
        pkCredential.response.authenticatorData
      );
      // clientDataJSON is already a DOMString (text), not an ArrayBuffer
      const clientData = btoa(pkCredential.response.clientDataJSON);

      return new Promise((resolve, reject) => {
        this.completePasskeyRegistration(
          BufferHelper.arrayBufferToBase64(pkCredential.credentialId),
          BufferHelper.arrayBufferToBase64(pkCredential.response.attestationObject),
          "cross-platform"
        ).subscribe({
          next: () => resolve({ success: true }),
          error: (err) => reject(err),
        });
      });
    } catch (error: any) {
      return { success: false, error: error.message || "Passkey registration failed" };
    }
  }

  private async createPasskeyCredential(options: any): Promise<any> {
    try {
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: BufferHelper.base64ToArrayBuffer(options.challenge),
          rp: options.rp,
          user: {
            id: BufferHelper.base64ToArrayBuffer(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams,
          timeout: options.timeout,
          attestation: options.attestation,
          authenticatorSelection: options.authenticatorSelection,
        },
      });
      return credential;
    } catch (error: any) {
      console.error("Passkey creation error:", error?.message || error);
      return null;
    }
  }

  /**
   * Authenticate with passkey using QR code flow
   * Returns the authenticated username on success
   */
  async authenticateWithPasskey(): Promise<{
    success: boolean;
    username?: string;
    requiresTotp?: boolean;
    error?: string;
  }> {
    try {
      const result = await new Promise<PasskeyAuthOptions>((resolve, reject) => {
        this.initPasskeyAuthentication().subscribe({
          next: resolve,
          error: reject,
        });
      });

      const publicKeyCredential = await this.getPasskeyAssertion(result.options);

      if (!publicKeyCredential) {
        return { success: false, error: "Failed to authenticate with passkey" };
      }

      const pkCredential = publicKeyCredential as any;
      const signature = BufferHelper.arrayBufferToBase64(pkCredential.response.signature);
      const authenticatorData = BufferHelper.arrayBufferToBase64(
        pkCredential.response.authenticatorData
      );
      const clientData = BufferHelper.arrayBufferToBase64(pkCredential.response.clientJSON);

      return new Promise((resolve, reject) => {
        this.completePasskeyAuthentication(
          signature,
          authenticatorData,
          clientData,
          result.username
        ).subscribe({
          next: (authResult) => {
            resolve({
              success: true,
              username: authResult.username,
              requiresTotp: false, // Will check this separately
            });
          },
          error: (err) => reject(err),
        });
      });
    } catch (error: any) {
      return { success: false, error: error.message || "Passkey authentication failed" };
    }
  }

  private async getPasskeyAssertion(options: any): Promise<any> {
    try {
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: BufferHelper.base64ToArrayBuffer(options.challenge),
          timeout: options.timeout,
          rpId: options.rpId,
          allowCredentials: options.allowCredentials.map((cred: any) => ({
            type: cred.type,
            id: BufferHelper.base64ToArrayBuffer(cred.id),
            transports: cred.transports,
          })),
          userVerification: options.userVerification,
        },
      });
      return credential;
    } catch (error: any) {
      console.error("Passkey assertion error:", error?.message || error);
      return null;
    }
  }

  /**
   * Authenticate with biometric (platform authenticator)
   */
  async authenticateWithBiometric(): Promise<{
    success: boolean;
    username?: string;
    requiresTotp?: boolean;
    error?: string;
  }> {
    try {
      const result = await new Promise<{ options: any; challenge: string; platform: string }>(
        (resolve, reject) => {
          this.initBiometricAuth().subscribe({
            next: resolve,
            error: reject,
          });
        }
      );

      const publicKeyCredential = await navigator.credentials.get({
        publicKey: {
          challenge: BufferHelper.base64ToArrayBuffer(result.options.challenge),
          timeout: result.options.timeout,
          rpId: result.options.rpId,
          allowCredentials: result.options.allowCredentials.map((cred: any) => ({
            type: cred.type,
            id: BufferHelper.base64ToArrayBuffer(cred.id),
            transports: cred.transports,
          })),
          userVerification: result.options.userVerification,
        },
      });

      if (!publicKeyCredential) {
        return { success: false, error: "Biometric authentication failed" };
      }

      const pkCredential = publicKeyCredential as any;
      const signature = BufferHelper.arrayBufferToBase64(pkCredential.response.signature);

      return new Promise((resolve, reject) => {
        this.completeBiometricAuth(signature).subscribe({
          next: () => resolve({ success: true, requiresTotp: false }),
          error: (err) => reject(err),
        });
      });
    } catch (error: any) {
      return { success: false, error: error.message || "Biometric authentication failed" };
    }
  }

  async registerBiometric(): Promise<{ success: boolean; error?: string }> {
    return this.registerPasskey();
  }
}
