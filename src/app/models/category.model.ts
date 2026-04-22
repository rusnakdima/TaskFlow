import { User } from "@models/user.model";

export interface Category {
  id: string;
  title: string;
  userId: string;
  user: User;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}