export interface TotpSetupResult {
  secret: string;
  qrCode: string;
  manualEntryKey: string;
  recoveryCodes?: string[];
}

export interface PasskeyRegistrationOptions {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  timeout?: number;
  attestation?: string;
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    requireResidentKey?: boolean;
    userVerification?: string;
  };
}

export interface PasskeyAuthOptions {
  challenge: string;
  timeout?: number;
  userVerification?: string;
  username?: string;
  options?: any;
}

export interface UserSecurityStatus {
  totpEnabled: boolean;
  passkeyEnabled: boolean;
  biometricEnabled: boolean;
  recoveryCodesAvailable: boolean;
}

export interface BiometricInfo {
  available: boolean;
  type: "fingerprint" | "face" | "iris" | "none";
  strength: "strong" | "weak" | "none";
}

export interface AuthCapabilities {
  totp: boolean;
  passkey: boolean;
  biometric: boolean;
  recoveryCodes: boolean;
}

export interface AuthMethods {
  enabled: Array<"password" | "totp" | "passkey" | "biometric">;
  default: "password" | "totp" | "passkey" | "biometric";
}

export type QrStatus = "pending" | "approved" | "expired" | "denied";

export interface QrCodeData {
  token?: string;
  qrCode?: string;
  code?: string;
  expiresAt?: number;
  username?: string;
}

export interface QrGenerationResult {
  success: boolean;
  token?: string;
  qrCode?: string;
  code?: string;
  expiresAt?: number;
  error?: string;
}

export interface QrStatusResult {
  status: QrStatus;
  approvedAt?: string;
}
