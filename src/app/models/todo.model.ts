import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Task } from "@models/task.model";
import { User } from "@models/user.model";

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  categories: Array<Category>;
  assignees: Array<string>;
  assignees_profiles: Array<Profile>;
  visibility: string;
  priority: string;
  order: number;
  user: User;
  tasks: Array<Task>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
