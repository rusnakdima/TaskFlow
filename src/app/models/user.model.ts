import { Profile } from "@models/profile.model";

export interface User {
  id: string;
  email: string;
  username: string;
  password: string;
  role: string;
  temporaryCode: string;
  codeExpiresAt: string;
  profile: Profile;
  profileId: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;

  totpEnabled?: boolean;
  totpSecret?: string;
  passkeyEnabled?: boolean;
  passkeyCredentialId?: string;
  passkeyPublicKey?: string;
  passkeyDevice?: string;
  biometricEnabled?: boolean;
  qrLoginEnabled?: boolean;
  recoveryCodes?: string[];
}
