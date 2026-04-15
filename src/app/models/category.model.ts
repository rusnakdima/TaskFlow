import { User } from "@models/user.model";

export interface Category {
  id: string;
  title: string;
  userId: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  user: User;
}
