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
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;

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
