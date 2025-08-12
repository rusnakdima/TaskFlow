/* models */
import { User } from "./user";

export interface Profile {
  id: string;
  name: string;
  lastName: string;
  bio: string;
  imageUrl: String;
  user: User;
}