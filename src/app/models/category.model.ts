import { User } from "@models/user.model";

export interface Category {
  id: string;
  title: string;
  user: User;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
