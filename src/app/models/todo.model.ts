/* models */
import { Category } from "./category.model";
import { Profile } from "./profile.model";
import { Task } from "./task.model";
import { User } from "./user.model";

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
  order: number;
  isDeleted: boolean;
  createdAt?: string;
  updatedAt?: string;
}
