/* models */
import { Profile } from "./profile";

export interface User {
  id: string;
  email: string;
  username: string;
  password: string;
  role: string;
  resetToken: string;
  prodile: Profile;
  createdAt: string;
  updatedAt: string;
}
