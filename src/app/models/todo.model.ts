/* models */
import { Category } from "@models/category.model";
import { Profile } from "@models/profile.model";
import { Task } from "@models/task.model";
import { User } from "@models/user.model";

export interface Todo {
  _id?: {} | undefined;
  id: string;
  user: User;
  userId: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  categories: Array<Category>;
  tasks: Array<Task>;
  assignees: Array<Profile>;
  visibility: "private" | "team";
  priority: string;
  order: number;
  isDeleted: boolean;
  createdAt?: string;
  updatedAt?: string;
}
