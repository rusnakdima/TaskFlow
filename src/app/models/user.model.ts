import { Profile } from "@models/profile.model";

export interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  profile: Profile;
  profile_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
