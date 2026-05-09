import { Injectable, signal, computed } from "@angular/core";

export interface AuthCapabilities {
  qrLoginAvailable: boolean;
  isTauri: boolean;
  isMobile: boolean;
}

export interface AuthMethods {
  qrLogin: boolean;
}

@Injectable({
  providedIn: "root",
})
export class AuthCapabilityService {
  private readonly _capabilities = signal<AuthCapabilities>({
    qrLoginAvailable: true,
    isTauri: false,
    isMobile: false,
  });

  readonly capabilities = this._capabilities.asReadonly();

  readonly qrLoginAvailable = computed(() => this._capabilities().qrLoginAvailable);
  readonly isTauri = computed(() => this._capabilities().isTauri);
  readonly isMobile = computed(() => this._capabilities().isMobile);

  constructor() {
    this.detectCapabilities();
  }

  async detectCapabilities(): Promise<void> {
    const isTauri = this.checkIsTauri();
    const isMobile = this.checkIsMobile();

    this._capabilities.set({
      qrLoginAvailable: true,
      isTauri,
      isMobile,
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
    _method: keyof AuthMethods,
    _userSecurityStatus: {
      qrLoginEnabled?: boolean;
    } | null
  ): boolean {
    const caps = this._capabilities();

    if (!_userSecurityStatus) return false;

    switch (_method) {
      case "qrLogin":
        return caps.qrLoginAvailable;
      default:
        return false;
    }
  }

  getAvailableMethods(
    _userSecurityStatus: {
      qrLoginEnabled?: boolean;
    } | null
  ): AuthMethods {
    return {
      qrLogin: true,
    };
  }
}
