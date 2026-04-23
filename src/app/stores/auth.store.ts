/**
 * Auth Store - Manages authentication and security feature state using Angular signals
 */

import { Injectable, signal, computed, Signal, WritableSignal, effect } from "@angular/core";
import { UserSecurityStatus } from "@services/auth/security.service";

interface AuthState {
  // Current authentication state
  isAuthenticated: boolean;
  token: string | null;

  // Security feature states for current user
  securityFeatures: UserSecurityStatus | null;

  // UI state
  loading: boolean;
  error: string | null;

  // Selected login method
  selectedMethod: "password" | "passkey" | "biometric";

  // Passkey login state
  passkeyQrCode: string | null;
  passkeyUsername: string | null;

  // TOTP verification state (after passkey/biometric)
  requiresTotp: boolean;
  pendingUsername: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  token: null,
  securityFeatures: null,
  loading: false,
  error: null,
  selectedMethod: "password",
  passkeyQrCode: null,
  passkeyUsername: null,
  requiresTotp: false,
  pendingUsername: null,
};

@Injectable({
  providedIn: "root",
})
export class AuthStore {
  private readonly state: WritableSignal<AuthState> = signal(initialState);

  // Computed signals
  readonly isAuthenticated: Signal<boolean> = computed(() => this.state().isAuthenticated);
  readonly token: Signal<string | null> = computed(() => this.state().token);
  readonly securityFeatures: Signal<UserSecurityStatus | null> = computed(
    () => this.state().securityFeatures
  );
  readonly loading: Signal<boolean> = computed(() => this.state().loading);
  readonly error: Signal<string | null> = computed(() => this.state().error);
  readonly selectedMethod: Signal<"password" | "passkey" | "biometric"> = computed(
    () => this.state().selectedMethod
  );
  readonly passkeyQrCode: Signal<string | null> = computed(() => this.state().passkeyQrCode);
  readonly passkeyUsername: Signal<string | null> = computed(() => this.state().passkeyUsername);
  readonly requiresTotp: Signal<boolean> = computed(() => this.state().requiresTotp);
  readonly pendingUsername: Signal<string | null> = computed(() => this.state().pendingUsername);

  // Actions
  setLoading(loading: boolean): void {
    this.state.update((state) => ({ ...state, loading }));
  }

  setError(error: string | null): void {
    this.state.update((state) => ({ ...state, error }));
  }

  setAuthenticated(token: string): void {
    this.state.update((state) => ({
      ...state,
      isAuthenticated: true,
      token,
      error: null,
    }));
  }

  setSecurityFeatures(features: UserSecurityStatus): void {
    this.state.update((state) => ({
      ...state,
      securityFeatures: features,
    }));
  }

  setSelectedMethod(method: "password" | "passkey" | "biometric"): void {
    this.state.update((state) => ({ ...state, selectedMethod: method }));
  }

  setPasskeyQrCode(qrCode: string | null, username: string | null = null): void {
    this.state.update((state) => ({
      ...state,
      passkeyQrCode: qrCode,
      passkeyUsername: username,
    }));
  }

  setRequiresTotp(requires: boolean, username: string | null = null): void {
    this.state.update((state) => ({
      ...state,
      requiresTotp: requires,
      pendingUsername: username,
    }));
  }

  clearPasskeyState(): void {
    this.state.update((state) => ({
      ...state,
      passkeyQrCode: null,
      passkeyUsername: null,
    }));
  }

  logout(): void {
    this.state.set(initialState);
  }

  clear(): void {
    this.state.set(initialState);
  }
}
