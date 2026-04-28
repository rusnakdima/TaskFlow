import { User } from "@models/user.model";

export interface Profile {
  id: string;
  name: string;
  last_name: string;
  bio: string;
  image_url: string;
  original_image_url?: string;
  user: User;
  user_id: string;
  created_at: string;
  updated_at: string;
}
