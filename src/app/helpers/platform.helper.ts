export class PlatformHelper {
  static isAndroid(): boolean {
    if (typeof navigator === "undefined") return false;
    return /android/.test(navigator.userAgent.toLowerCase());
  }

  static isIOS(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    return /ipad|iphone|ipod/.test(ua);
  }

  static isMobile(): boolean {
    return this.isAndroid() || this.isIOS();
  }

  static isTauri(): boolean {
    if (typeof navigator === "undefined") return false;
    return /tauri/.test(navigator.userAgent.toLowerCase());
  }

  static getPlatformName(): string {
    const ua = navigator.userAgent.toLowerCase();
    if (/windows/.test(ua)) return "Windows Hello";
    if (/macintosh|mac os/.test(ua)) return "Touch ID";
    if (/ipad|iphone|ipod/.test(ua)) return "Face ID";
    if (/android/.test(ua)) return "Fingerprint";
    if (/linux/.test(ua)) return "Biometric";
    return "Biometric";
  }
}
