/* models */
import { User } from "./user";

export interface Category {
  id: string,
  title: string,
  user: User,
}