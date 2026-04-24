import { Injectable } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class PlatformDetectionService {
  getPlatformName(): string {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/windows/.test(userAgent)) return "Windows Hello";
    if (/macintosh|mac os/.test(userAgent)) return "Touch ID";
    if (/linux/.test(userAgent)) return "Biometric";
    if (/android/.test(userAgent)) return "Fingerprint";
    if (/iphone|ipad/.test(userAgent)) return "Face ID";
    return "Biometric";
  }

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
    } catch {
      return false;
    }
  }

  isWebAuthNAvailable(): boolean {
    return (
      typeof navigator !== "undefined" && typeof (navigator as any).credentials !== "undefined"
    );
  }

  isTauriApp(): boolean {
    return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
  }

  isMobilePlatform(): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    return /android/.test(userAgent) || /iphone|ipad/.test(userAgent);
  }

  hasPlatformBiometric(): boolean {
    if (!this.isWebAuthNAvailable()) return false;
    if (typeof PublicKeyCredential === "undefined") return false;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function")
      return false;
    return true;
  }

  getUserAgent(): string {
    return navigator.userAgent;
  }
}
