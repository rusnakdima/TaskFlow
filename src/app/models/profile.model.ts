import { User } from "@models/user.model";

export interface Profile {
  id: string;
  name: string;
  lastName: string;
  bio: string;
  imageUrl: string;
  user: User;
  userId: string;
  createdAt: string;
  updatedAt: string;
}
