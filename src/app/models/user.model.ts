/* models */
import { Profile } from "./profile.model";

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
}
