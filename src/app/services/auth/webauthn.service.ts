import { Injectable, inject } from "@angular/core";
import { Observable, firstValueFrom } from "rxjs";
import { DataSyncProvider } from "@providers/data-sync.provider";
import { invoke } from "@tauri-apps/api/core";
import {
  PasskeyCredential,
  WebAuthnRegistrationOptions,
  WebAuthnAuthOptions,
  PasskeyResult,
} from "@models/webauthn.model";

@Injectable({
  providedIn: "root",
})
export class WebAuthnService {
  private dataSyncProvider = inject(DataSyncProvider);

  async isWebAuthnSupported(): Promise<boolean> {
    const androidBiometricAvailable = await this.isAndroidBiometricAvailable();
    if (androidBiometricAvailable) {
      return false;
    }

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

      return true;
    } catch {
      return false;
    }
  }

  async isAndroidBiometricAvailable(): Promise<boolean> {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroid = /android/.test(userAgent);

    if (!isAndroid) return false;

    try {
      const result = await invoke<{ status: string; data: boolean }>("checkAndroidBiometric");
      return result.data;
    } catch {
      return true;
    }
  }

  async authenticateAndroidBiometric(title: string, subtitle: string): Promise<boolean> {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroid = /android/.test(userAgent);

    if (!isAndroid) return false;

    try {
      const result = await invoke<{ status: string; data: boolean }>(
        "authenticateAndroidBiometric",
        {
          title,
          subtitle,
        }
      );
      return result.data;
    } catch (error) {
      console.error("Android biometric auth error:", error);
      return false;
    }
  }

  async isUserVerifyingPlatformAuthenticatorAvailable(): Promise<boolean> {
    if (typeof PublicKeyCredential === "undefined") return false;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") {
      return false;
    }

    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  private isAndroidDevice(): boolean {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent.toLowerCase();
    return /android/.test(userAgent);
  }

  async createPasskeyAndroid(requestJson: string): Promise<{ responseJson: string }> {
    return invoke<{ responseJson: string }>("plugin:passkey|createPasskey", {
      requestJson,
    });
  }

  async getPasskeyAndroid(requestJson: string): Promise<{ responseJson: string }> {
    return invoke<{ responseJson: string }>("plugin:passkey|getPasskey", {
      requestJson,
    });
  }

  async createCredential(options: WebAuthnRegistrationOptions): Promise<PasskeyCredential | null> {
    try {
      const publicKey = {
        challenge: this.base64ToArrayBuffer(options.challenge),
        rp: options.rp,
        user: {
          id: this.base64ToArrayBuffer(options.user.id),
          name: options.user.name,
          displayName: options.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        attestation: options.attestation as any,
        authenticatorSelection: options.authenticatorSelection as any,
      };

      const credential = (await navigator.credentials.create({
        publicKey,
      } as any)) as unknown as PasskeyCredential;
      return credential;
    } catch (error: any) {
      console.error("WebAuthn create credential error:", error?.message || error);
      return null;
    }
  }

  async getAssertion(options: WebAuthnAuthOptions): Promise<PasskeyCredential | null> {
    try {
      const publicKey = {
        challenge: this.base64ToArrayBuffer(options.challenge),
        timeout: options.timeout,
        rpId: options.rpId,
        allowCredentials: options.allowCredentials.map((cred) => ({
          type: cred.type,
          id: this.base64ToArrayBuffer(cred.id),
          transports: cred.transports as any,
        })),
        userVerification: options.userVerification as any,
      };

      const credential = (await navigator.credentials.get({
        publicKey,
      } as any)) as unknown as PasskeyCredential;
      return credential;
    } catch (error: any) {
      console.error("WebAuthn get assertion error:", error?.message || error);
      return null;
    }
  }

  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64url: string): ArrayBuffer {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  initPasskeyRegistration(): Observable<{
    options: WebAuthnRegistrationOptions;
    challenge: string;
  }> {
    return this.dataSyncProvider.invokeCommand<{
      options: WebAuthnRegistrationOptions;
      challenge: string;
    }>("initPasskeyRegistration", {});
  }

  completePasskeyRegistration(responseJson: string): Observable<{ success: boolean }> {
    return this.dataSyncProvider.invokeCommand<{ success: boolean }>(
      "completePasskeyRegistration",
      {
        responseJson,
      }
    );
  }

  initPasskeyAuthentication(username?: string): Observable<{
    options: WebAuthnAuthOptions;
    qrCode: string;
    challenge: string;
    username: string;
  }> {
    return this.dataSyncProvider.invokeCommand<{
      options: WebAuthnAuthOptions;
      qrCode: string;
      challenge: string;
      username: string;
    }>("initPasskeyAuthentication", { username: username || null });
  }

  completePasskeyAuthentication(
    username: string,
    responseJson: string
  ): Observable<{ verified: boolean; username: string; method: string }> {
    return this.dataSyncProvider.invokeCommand<{
      verified: boolean;
      username: string;
      method: string;
    }>("completePasskeyAuthentication", {
      username,
      responseJson,
    });
  }

  async registerPasskey(username: string): Promise<PasskeyResult> {
    try {
      const options = await firstValueFrom(this.initPasskeyRegistration());

      const isAndroid = this.isAndroidDevice();
      let responseJson: string;

      if (isAndroid) {
        const result = await this.createPasskeyAndroid(JSON.stringify(options.options));
        responseJson = result.responseJson;
      } else {
        const credential = await this.createCredential(options.options);
        if (!credential) {
          return { success: false, error: "Failed to create credential" };
        }
        responseJson = JSON.stringify(credential);
      }

      const result = await firstValueFrom(this.completePasskeyRegistration(responseJson));
      return { success: result.success };
    } catch (err: unknown) {
      return { success: false, error: String(err) };
    }
  }

  async authenticateWithPasskey(username?: string): Promise<PasskeyResult> {
    try {
      const options = await firstValueFrom(this.initPasskeyAuthentication(username));

      const isAndroid = this.isAndroidDevice();
      let responseJson: string;

      if (isAndroid) {
        const result = await this.getPasskeyAndroid(JSON.stringify(options.options));
        responseJson = result.responseJson;
      } else {
        const credential = await this.getAssertion(options.options);
        if (!credential) {
          return { success: false, error: "Failed to get credential" };
        }
        responseJson = JSON.stringify(credential);
      }

      const result = await firstValueFrom(
        this.completePasskeyAuthentication(options.username, responseJson)
      );

      return { success: result.verified, username: result.username };
    } catch (err: unknown) {
      return { success: false, error: String(err) };
    }
  }
}
