export interface TotpSetupResult {
  secret: string;
  qrCode: string;
  manualEntryKey: string;
  recoveryCodes?: string[];
}

export interface UserSecurityStatus {
  totpEnabled: boolean;
  recoveryCodesAvailable: boolean;
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
