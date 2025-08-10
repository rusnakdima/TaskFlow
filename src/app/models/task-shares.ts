/* models */
import { Task } from "./task";
import { User } from "./user";

export interface TaskShares {
  id: string,
  task: Task,
  user: User,
}