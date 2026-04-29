import { User } from "./user.model";

export interface Profile {
  id: string;
  name: string;
  last_name: string;
  bio: string;
  image_url: string;
  original_image_url?: string;
  user_id: string;
  user?: User;
  created_at: string;
  updated_at: string;
}
