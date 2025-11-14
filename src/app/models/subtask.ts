/* models */
import { PriorityTask, Task } from "./task";

export interface Subtask {
  _id?: {} | undefined;
  id: string;
  task: Task;
  title: string;
  description: string;
  isCompleted: boolean;
  priority: PriorityTask;
  order: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}
