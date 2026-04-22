import { User } from "@models/user.model";

export interface Category {
  id: string;
  title: string;
  user_id: string;
  user: User;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}