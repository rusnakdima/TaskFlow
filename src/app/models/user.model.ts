/* models */
import { Profile } from "@models/profile.model";

export interface User {
  id: string;
  email: string;
  username: string;
  password: string;
  role: string;
  resetToken: string;
  profile: Profile;
  profileId: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;

  // Security features
  totpEnabled?: boolean;
  totpSecret?: string;
  passkeyEnabled?: boolean;
  passkeyCredentialId?: string;
  passkeyPublicKey?: string;
  passkeyDevice?: string;
  biometricEnabled?: boolean;
  recoveryCodes?: string[];
}
