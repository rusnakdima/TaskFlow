import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Task } from "@models/task.model";
import { User } from "@models/user.model";

export interface Todo {
  id: string;
  user: User;
  userId: string;
  title: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  categories: Array<Category>;
  tasks: Array<Task>;
  assignees: Array<string>;
  assigneesProfiles: Array<Profile>;
  visibility: "private" | "team";
  priority: string;
  order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
