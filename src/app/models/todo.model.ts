import { BaseEntity } from "@models/base-entity.model";
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { User } from "@models/user.model";

export interface Todo extends BaseEntity {
  id: string;
  user_id: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  categories: Array<Category>;
  category_ids: string[];
  assignees: Array<string>;
  assignee_ids: string[];
  assignees_profiles: Array<Profile>;
  visibility: string;
  priority: string;
  order: number;
  user: User;
  tasks_count: number;
  completed_tasks_count: number;
  chats_count: number;
}
