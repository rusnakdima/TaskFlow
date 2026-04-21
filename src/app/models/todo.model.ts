import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Task } from "@models/task.model";
import { User } from "@models/user.model";

export interface Todo {
  id: string;
  userId: string;
  title: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  categories: Array<Category>;
  assignees: Array<string>;
  assigneesProfiles: Array<Profile>;
  visibility: string;
  priority: string;
  order: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: User;
  tasks: Array<Task>;
}
