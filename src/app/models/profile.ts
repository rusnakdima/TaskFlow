/* models */
import { User } from "./user";

export interface Profile {
  id: string,
  name: string,
  lastName: string,
  bio: string,
  user: User,
}