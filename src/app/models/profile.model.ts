import { User } from "@models/user.model";

export interface Profile {
  id: string;
  name: string;
  lastName: string;
  bio: string;
  imageUrl: string;
  user: User;
  userId: string;
  created_at: string;
  updated_at: string;
}
