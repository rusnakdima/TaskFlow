import { Profile } from "@models/profile.model";

export interface User {
  id: string;
  email: string;
  username: string;
  password: string;
  role: string;
  temporary_code: string;
  code_expires_at: string;
  profile: Profile;
  profile_id: string;
  totp_enabled?: boolean;
  totp_secret?: string;
  passkey_enabled?: boolean;
  passkey_credential_id?: string;
  passkey_public_key?: string;
  passkey_device?: string;
  biometric_enabled?: boolean;
  qr_login_enabled?: boolean;
  recovery_codes?: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
