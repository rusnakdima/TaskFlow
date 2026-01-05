/* models */
import { User } from "./user.model";

export interface Category {
  id: string;
  title: string;
  user: User;
  isDeleted: boolean;
}
