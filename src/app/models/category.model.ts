import { BaseEntity } from "@models/base-entity.model";
import { User } from "@models/user.model";

export interface Category extends BaseEntity {
  id: string;
  title: string;
  user_id: string;
  user: User;
}
