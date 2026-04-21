import { User } from "@models/user.model";

export interface Category {
  id: string;
  title: string;
  userId: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: User;
}
