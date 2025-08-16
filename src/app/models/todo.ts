/* models */
import { Category } from "./category";
import { Task } from "./task";
import { User } from "./user";

export interface Todo {
  id: string;
  user: User;
  title: string;
  description: string;
  deadline: string;
  categories: Array<Category>;
  tasks: Array<Task>;
  assignees: Array<User>;
}
