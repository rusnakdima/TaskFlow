/* models */
import { User } from "@models/user.model";

export interface Category {
  id: string;
  title: string;
  user: User;
  isDeleted: boolean;
}
