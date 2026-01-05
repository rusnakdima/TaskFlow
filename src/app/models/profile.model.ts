/* models */
import { User } from "./user.model";

export interface Profile {
  id: string;
  name: string;
  lastName: string;
  bio: string;
  imageUrl: String;
  user: User;
  userId: string;
}